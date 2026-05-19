import crypto from 'node:crypto'
import net from 'node:net'

export class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl
    this.nextId = 1
    this.pending = new Map()
    this.eventHandlers = new Map()
    this.requestTimeoutMs = 15000
    this.readBuffer = Buffer.alloc(0)
  }

  async connect() {
    this.socket = await openWebSocket(this.webSocketUrl, (data) => this.#handleFrame(data))
    this.socket.on('close', () => this.#rejectPending('CDP socket closed'))
    this.socket.on('error', (error) => this.#rejectPending(`CDP socket error: ${error.message}`))
    return this
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId

    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP request timed out: ${method}`))
      }, this.requestTimeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
    })

    if (process.env.ASB_CDP_DEBUG) {
      console.error(`CDP => ${method}#${id}`)
    }
    sendTextFrame(this.socket, JSON.stringify(payload))
    return promise
  }

  on(method, handler) {
    const handlers = this.eventHandlers.get(method) || new Set()
    handlers.add(handler)
    this.eventHandlers.set(method, handlers)
    return () => handlers.delete(handler)
  }

  close() {
    this.socket?.destroy()
  }

  #handleFrame(chunk) {
    this.readBuffer = Buffer.concat([this.readBuffer, chunk])

    while (true) {
      const frame = readFrame(this.readBuffer)
      if (!frame) return
      this.readBuffer = this.readBuffer.subarray(frame.bytesRead)

      if (frame.opcode === 8) {
        this.socket.destroy()
        return
      }
      if (frame.opcode !== 1) continue
      this.#handleMessage(frame.payload.toString('utf8'))
    }
  }

  #handleMessage(raw) {
    if (process.env.ASB_CDP_DEBUG) {
      console.error(`CDP <= ${raw.slice(0, 240)}`)
    }
    const message = JSON.parse(raw)

    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timeout } = this.pending.get(message.id)
      clearTimeout(timeout)
      this.pending.delete(message.id)
      if (message.error) {
        reject(new Error(`${message.error.message}${message.error.data ? `: ${message.error.data}` : ''}`))
      } else {
        resolve(message.result || {})
      }
      return
    }

    const handlers = this.eventHandlers.get(message.method)
    if (handlers) {
      for (const handler of handlers) {
        handler(message.params || {}, message.sessionId)
      }
    }
  }

  #rejectPending(message) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout)
      pending.reject(new Error(message))
      this.pending.delete(id)
    }
  }
}

export async function resolveBrowserWebSocketUrl(endpoint) {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/json/version`)
  if (!response.ok) {
    throw new Error(`Cannot read CDP version from ${endpoint}: ${response.status}`)
  }

  const version = await response.json()
  if (!version.webSocketDebuggerUrl) {
    throw new Error(`CDP endpoint ${endpoint} does not expose webSocketDebuggerUrl`)
  }
  return version.webSocketDebuggerUrl
}

export async function waitForCdp(endpoint, timeoutMs = 10000) {
  const startedAt = Date.now()
  let lastError

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await resolveBrowserWebSocketUrl(endpoint)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw lastError || new Error(`Timed out waiting for CDP endpoint ${endpoint}`)
}

function openWebSocket(webSocketUrl, onFrame) {
  const url = new URL(webSocketUrl)
  if (url.protocol !== 'ws:') {
    throw new Error(`Unsupported CDP WebSocket protocol: ${url.protocol}`)
  }

  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64')
    const socket = net.createConnection(Number(url.port || 80), url.hostname)
    let handshake = Buffer.alloc(0)

    socket.once('error', reject)
    socket.once('connect', () => {
      socket.write([
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        ''
      ].join('\r\n'))
    })

    const onHandshakeData = (chunk) => {
      handshake = Buffer.concat([handshake, chunk])
      const headerEnd = handshake.indexOf('\r\n\r\n')
      if (headerEnd === -1) return

      const headers = handshake.subarray(0, headerEnd).toString('utf8')
      if (!headers.startsWith('HTTP/1.1 101')) {
        reject(new Error(`CDP WebSocket handshake failed: ${headers.split('\r\n')[0]}`))
        socket.destroy()
        return
      }

      socket.off('data', onHandshakeData)
      socket.off('error', reject)
      socket.on('data', onFrame)
      const rest = handshake.subarray(headerEnd + 4)
      if (rest.length > 0) onFrame(rest)
      resolve(socket)
    }

    socket.on('data', onHandshakeData)
  })
}

function sendTextFrame(socket, text) {
  const payload = Buffer.from(text)
  const mask = crypto.randomBytes(4)
  let header

  if (payload.length < 126) {
    header = Buffer.alloc(2)
    header[0] = 0x81
    header[1] = 0x80 | payload.length
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 0x80 | 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 0x80 | 127
    header.writeBigUInt64BE(BigInt(payload.length), 2)
  }

  const masked = Buffer.alloc(payload.length)
  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = payload[index] ^ mask[index % 4]
  }

  socket.write(Buffer.concat([header, mask, masked]))
}

function readFrame(buffer) {
  if (buffer.length < 2) return undefined

  const first = buffer[0]
  const second = buffer[1]
  const opcode = first & 0x0f
  const masked = Boolean(second & 0x80)
  let payloadLength = second & 0x7f
  let offset = 2

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) return undefined
    payloadLength = buffer.readUInt16BE(offset)
    offset += 2
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) return undefined
    payloadLength = Number(buffer.readBigUInt64BE(offset))
    offset += 8
  }

  const maskLength = masked ? 4 : 0
  if (buffer.length < offset + maskLength + payloadLength) return undefined

  const mask = masked ? buffer.subarray(offset, offset + 4) : undefined
  offset += maskLength
  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength))

  if (mask) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] = payload[index] ^ mask[index % 4]
    }
  }

  return {
    opcode,
    payload,
    bytesRead: offset + payloadLength
  }
}
