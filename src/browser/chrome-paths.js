import { existsSync } from 'node:fs';
import os from 'node:os';

const candidatesByPlatform = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.PROGRAMFILES || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['PROGRAMFILES(X86)'] || ''}\\Microsoft\\Edge\\Application\\msedge.exe`
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/ms-playwright/chromium-*/chrome-linux/chrome'
  ]
};

export function findChromeExecutable(explicitPath) {
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const candidates = candidatesByPlatform[os.platform()] || candidatesByPlatform.linux;
  return candidates.find((candidate) => candidate && existsSync(candidate));
}
