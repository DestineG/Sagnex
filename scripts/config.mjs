import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const configDirectory = resolve(rootDirectory, 'config');
export const configPath = resolve(configDirectory, 'sagnex.env');
export const configExamplePath = resolve(configDirectory, 'sagnex.env.example');

export function ensureConfig() {
  mkdirSync(configDirectory, { recursive: true });
  if (!existsSync(configPath)) {
    copyFileSync(configExamplePath, configPath);
    globalThis.console.log(`Created configuration: ${configPath}`);
  }
}

function parseEnvironmentFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readPort(value, name, fallback) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
}

function resolveProjectPath(value, fallback) {
  const path = value || fallback;
  return isAbsolute(path) ? resolve(path) : resolve(rootDirectory, path);
}

export function loadConfig({ create = true } = {}) {
  if (create) ensureConfig();
  const fileValues = existsSync(configPath)
    ? parseEnvironmentFile(readFileSync(configPath, 'utf8'))
    : {};
  const value = (name, fallback) => process.env[name] ?? fileValues[name] ?? fallback;
  const dataDirectory = resolveProjectPath(value('SAGNEX_DATA_DIR', './data'), './data');
  const backupDirectory = resolveProjectPath(value('SAGNEX_BACKUP_DIR', './data/backups'), './data/backups');
  const bindAddress = value('SAGNEX_BIND_ADDRESS', '127.0.0.1');
  const webPort = readPort(value('SAGNEX_WEB_PORT', '4173'), 'SAGNEX_WEB_PORT', 4173);
  const apiPort = readPort(value('SAGNEX_API_PORT', '4784'), 'SAGNEX_API_PORT', 4784);
  return {
    apiPort,
    backupDirectory,
    bindAddress,
    dataDirectory,
    environment: {
      ...fileValues,
      ...process.env,
      SAGNEX_API_PORT: String(apiPort),
      SAGNEX_BACKUP_DIR: backupDirectory,
      SAGNEX_BIND_ADDRESS: bindAddress,
      SAGNEX_DATA_DIR: dataDirectory,
      SAGNEX_WEB_PORT: String(webPort),
      SAGNEX_API_URL: `http://127.0.0.1:${apiPort}`
    },
    webPort
  };
}
