import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export class RuntimeLogger {
  constructor({ logsDir, store }) {
    this.logsDir = logsDir
    this.store = store
    this.logFile = path.join(logsDir, 'asb.log')
  }

  async info(message, payload = {}, event) {
    await this.#write('info', message, payload, event)
  }

  async error(message, payload = {}, event) {
    await this.#write('error', message, payload, event)
  }

  async #write(level, message, payload, event) {
    const entry = {
      level,
      message,
      event,
      payload,
      createdAt: new Date().toISOString()
    }

    await mkdir(this.logsDir, { recursive: true })
    await appendFile(this.logFile, `${JSON.stringify(entry)}\n`, 'utf8')
    this.store?.saveLog(entry)

    const line = `[${entry.createdAt}] ${level.toUpperCase()} ${message}`
    if (level === 'error') {
      console.error(line)
    } else {
      console.error(line)
    }
  }
}
