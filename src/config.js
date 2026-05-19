import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const rootDir = process.cwd();
export const dataDir = process.env.ASB_DATA_DIR
  ? path.resolve(process.env.ASB_DATA_DIR)
  : path.join(rootDir, 'data');

export const config = {
  host: process.env.ASB_HOST || '127.0.0.1',
  port: Number(process.env.ASB_PORT || 8787),
  dataDir,
  databasePath: process.env.ASB_DB_PATH
    ? path.resolve(process.env.ASB_DB_PATH)
    : path.join(dataDir, 'asb.sqlite'),
  logsDir: path.join(dataDir, 'logs'),
  skillsDir: process.env.ASB_SKILLS_DIR
    ? path.resolve(process.env.ASB_SKILLS_DIR)
    : path.join(rootDir, 'skills'),
  browserStateDir: path.join(dataDir, 'browser-state'),
  defaultLeaseTtlMs: Number(process.env.ASB_LEASE_TTL_MS || 15 * 60 * 1000),
  requestBodyLimitBytes: Number(process.env.ASB_BODY_LIMIT_BYTES || 2 * 1024 * 1024),
  stealthEnabled: process.env.ASB_STEALTH_ENABLED !== '0',
  stealthExcludedHosts: process.env.ASB_STEALTH_EXCLUDED_HOSTS || '',
  canvasNoiseEnabled: process.env.ASB_CANVAS_NOISE_ENABLED !== '0',
  audioNoiseEnabled: process.env.ASB_AUDIO_NOISE_ENABLED !== '0',
  webglVendor: process.env.ASB_WEBGL_VENDOR || '',
  webglRenderer: process.env.ASB_WEBGL_RENDERER || '',
  cdpAcceptLanguage: process.env.ASB_CDP_ACCEPT_LANGUAGE || '',
  cdpUserAgent: process.env.ASB_CDP_USER_AGENT || '',
  cdpPlatform: process.env.ASB_CDP_PLATFORM || '',
  cdpTimezone: process.env.ASB_CDP_TIMEZONE || '',
  cdpLocale: process.env.ASB_CDP_LOCALE || '',
  humanizeLevel: process.env.ASB_HUMANIZE_LEVEL || 'standard',
  cooldownEnabled: process.env.ASB_COOLDOWN_ENABLED !== '0',
  cooldownRedditSeconds: Number(process.env.ASB_COOLDOWN_REDDIT_SECONDS || 45),
  cooldownFacebookSeconds: Number(process.env.ASB_COOLDOWN_FACEBOOK_SECONDS || 60),
  cooldownLinkedinSeconds: Number(process.env.ASB_COOLDOWN_LINKEDIN_SECONDS || 180),
  cooldownInstagramSeconds: Number(process.env.ASB_COOLDOWN_INSTAGRAM_SECONDS || 240),
  cooldownManualChallengeSeconds: Number(process.env.ASB_COOLDOWN_MANUAL_CHALLENGE_SECONDS || 300),
  vncEnabled: process.env.ASB_VNC_ENABLED === '1',
  vncPort: Number(process.env.ASB_VNC_PORT || 6080),
  fingerprintSeed: process.env.ASB_FINGERPRINT_SEED || '',
  fingerprintPlatform: process.env.ASB_FINGERPRINT_PLATFORM || 'macos',
  chromeMajor: process.env.ASB_CHROME_MAJOR || '',
  artifactsDir: path.join(dataDir, 'artifacts')
};

export async function ensureRuntimeDirs() {
  await Promise.all([
    mkdir(config.dataDir, { recursive: true }),
    mkdir(config.logsDir, { recursive: true }),
    mkdir(config.skillsDir, { recursive: true }),
    mkdir(config.browserStateDir, { recursive: true }),
    mkdir(config.artifactsDir, { recursive: true })
  ]);
}
