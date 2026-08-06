import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import open from 'open';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
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
const childEnvironment = backupDirectory
  ? { ...process.env, SAGNEX_BACKUP_DIR: backupDirectory }
  : process.env;

function run(args) {
  const child = spawn(pnpm, args, { stdio: 'inherit', env: childEnvironment, shell: process.platform === 'win32' });
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

const url = 'http://127.0.0.1:4173';
const apiUrl = 'http://127.0.0.1:4784/api/health';
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
if (!existingWeb) run(['--filter', '@sagnex/web', 'preview', '--host', '127.0.0.1', '--port', '4173']);

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
