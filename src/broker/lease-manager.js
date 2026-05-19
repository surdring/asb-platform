import crypto from 'node:crypto';

export class LeaseManager {
  constructor({ defaultTtlMs, store, logger }) {
    this.defaultTtlMs = defaultTtlMs;
    this.store = store;
    this.logger = logger;
    this.leases = new Map();
  }

  create({ agentId, environmentId, tab, ttlMs, metadata = {} }) {
    const now = Date.now();
    const lease = {
      id: `lease_${crypto.randomUUID()}`,
      agentId,
      environmentId,
      tabId: tab.id,
      groupId: tab.groupId,
      sessionId: tab.sessionId || '',
      browserContextId: tab.browserContextId,
      url: tab.url,
      webSocketDebuggerUrl: tab.webSocketDebuggerUrl,
      status: 'active',
      metadata,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + (ttlMs || this.defaultTtlMs)).toISOString()
    };

    this.leases.set(lease.id, lease);
    this.store?.saveLease(lease);
    this.logger?.info('Tab lease created', lease, 'lease.created');
    return lease;
  }

  list({ agentId, environmentId } = {}) {
    this.expireStale();
    return [...this.leases.values()].filter((lease) => {
      if (agentId && lease.agentId !== agentId) return false;
      if (environmentId && lease.environmentId !== environmentId) return false;
      return true;
    });
  }

  get(id) {
    this.expireStale();
    const lease = this.leases.get(id);
    if (!lease || lease.status !== 'active') {
      throw new Error(`Active lease not found: ${id}`);
    }
    return lease;
  }

  renew(id, ttlMs = this.defaultTtlMs) {
    const lease = this.get(id);
    lease.expiresAt = new Date(Date.now() + ttlMs).toISOString();
    this.store?.saveLease(lease);
    this.logger?.info('Tab lease renewed', lease, 'lease.renewed');
    return lease;
  }

  release(id) {
    const lease = this.leases.get(id);
    if (!lease) return undefined;
    lease.status = 'released';
    lease.releasedAt = new Date().toISOString();
    this.store?.saveLease(lease);
    this.logger?.info('Tab lease released', lease, 'lease.released');
    return lease;
  }

  expireStale() {
    const now = Date.now();
    for (const lease of this.leases.values()) {
      if (lease.status === 'active' && Date.parse(lease.expiresAt) <= now) {
        lease.status = 'expired';
        lease.expiredAt = new Date(now).toISOString();
        this.store?.saveLease(lease);
        this.logger?.info('Tab lease expired', lease, 'lease.expired');
      }
    }
  }
}
