import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import open from 'open';
import { loadConfig } from './config.mjs';

const pnpm = process.env.SAGNEX_PNPM_COMMAND || (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
const pnpmPrefix = process.env.SAGNEX_PNPM_PREFIX?.split(' ').filter(Boolean) ?? [];
const children = [];
const args = process.argv.slice(2);

function readOption(name) {
  const equalsPrefix = `${name}=`;
  const equalsArgument = args.find((argument) => argument.startsWith(equalsPrefix));
  if (equalsArgument) return equalsArgument.slice(equalsPrefix.length);
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    globalThis.console.error(`${name} requires a directory path.`);
    process.exit(1);
  }
  return value;
}

const backupDirectoryArgument = readOption('--backup-dir');
const backupDirectory = backupDirectoryArgument ? resolve(backupDirectoryArgument) : undefined;
const config = loadConfig();
const childEnvironment = backupDirectory
  ? { ...config.environment, SAGNEX_BACKUP_DIR: backupDirectory }
  : config.environment;

function run(args) {
  const child = spawn(pnpm, [...pnpmPrefix, ...args], { stdio: 'inherit', env: childEnvironment, shell: process.platform === 'win32' });
  children.push(child);
  child.on('exit', (code) => {
    if (code && code !== 0) shutdown(code);
  });
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

const browserHost = config.bindAddress === '0.0.0.0' ? '127.0.0.1' : config.bindAddress;
const url = `http://${browserHost}:${config.webPort}`;
const apiUrl = `http://127.0.0.1:${config.apiPort}/api/health`;
const existingApi = await globalThis.fetch(apiUrl).then((response) => response.json()).then((body) => body?.name === 'sagnex' && body?.ok === true).catch(() => false);
const existingWeb = await globalThis.fetch(url).then((response) => response.ok).catch(() => false);

if (existingApi && existingWeb) {
  if (backupDirectory) {
    globalThis.console.error('Sagnex is already running. Stop it before changing --backup-dir.');
    process.exit(1);
  }
  await open(url);
  process.exit(0);
}
if (existingWeb && !existingApi) {
  globalThis.console.error('Port 4173 is already in use by another service.');
  process.exit(1);
}
if (!existingApi) run(['--filter', '@sagnex/api', 'start']);
if (!existingWeb) run(['--filter', '@sagnex/web', 'preview', '--host', config.bindAddress, '--port', String(config.webPort)]);

for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    const response = await globalThis.fetch(url);
    if (response.ok) {
      await open(url);
      break;
    }
  } catch {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
  }
}
