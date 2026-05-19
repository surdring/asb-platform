import { config, ensureRuntimeDirs } from './config.js';
import { SQLiteStore } from './store/sqlite-store.js';
import { RuntimeLogger } from './store/logger.js';
import { BrowserEnvironmentManager } from './browser/environment-manager.js';
import { LeaseManager } from './broker/lease-manager.js';
import { SkillRegistry } from './skills/skill-registry.js';
import { TaskRunner } from './broker/task-runner.js';
import { ArtifactManager } from './broker/artifact-manager.js';
import { createServer } from './broker/http-server.js';

await ensureRuntimeDirs();

const store = new SQLiteStore(config.databasePath);
const logger = new RuntimeLogger({ logsDir: config.logsDir, store });
const environmentManager = new BrowserEnvironmentManager(config, { store, logger });
environmentManager.loadPersisted();
const leaseManager = new LeaseManager({ defaultTtlMs: config.defaultLeaseTtlMs, store, logger });
const skillRegistry = new SkillRegistry(config.skillsDir, { store, logger });
await skillRegistry.loadAll();

const taskRunner = new TaskRunner({
  environmentManager,
  leaseManager,
  skillRegistry,
  store,
  logger,
  config
});

const artifactManager = new ArtifactManager({ store, config });
await artifactManager.ensureDir();

const server = createServer({
  config,
  environmentManager,
  leaseManager,
  skillRegistry,
  taskRunner,
  store,
  logger,
  artifactManager
});

server.listen(config.port, config.host, () => {
  logger.info(`ASB Broker listening at http://${config.host}:${config.port}`, {
    databasePath: config.databasePath,
    logsDir: config.logsDir
  }, 'broker.started');
});

async function shutdown(signal) {
  await logger.info(`${signal} received, stopping browser environments`, {}, 'broker.stopping');
  await environmentManager.stopAll();
  store.close();
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
