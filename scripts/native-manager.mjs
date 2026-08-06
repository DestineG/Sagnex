import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { loadConfig, rootDirectory } from './config.mjs';

const action = process.argv[2] || 'start';
const runtimeDirectory = resolve(rootDirectory, '.sagnex', 'runtime');
const logDirectory = resolve(rootDirectory, '.sagnex', 'logs');
const pidPath = resolve(runtimeDirectory, 'native.pid');
const dependencyStatePath = resolve(runtimeDirectory, 'dependencies.sha256');
const buildStatePath = resolve(runtimeDirectory, 'build.sha256');
const outputLogPath = resolve(logDirectory, 'native.log');
const errorLogPath = resolve(logDirectory, 'native-error.log');

mkdirSync(runtimeDirectory, { recursive: true });
mkdirSync(logDirectory, { recursive: true });

function packageManager() {
  const candidates = process.platform === 'win32'
    ? [{ command: 'pnpm.cmd', prefix: [] }, { command: 'corepack.cmd', prefix: ['pnpm'] }]
    : [{ command: 'pnpm', prefix: [] }, { command: 'corepack', prefix: ['pnpm'] }];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.prefix, '--version'], {
      cwd: rootDirectory,
      shell: process.platform === 'win32',
      stdio: 'ignore'
    });
    if (result.status === 0) return candidate;
  }
  throw new Error('pnpm was not found. Install pnpm 11 or enable Corepack.');
}

function runPnpm(args) {
  const runner = packageManager();
  const result = spawnSync(runner.command, [...runner.prefix, ...args], {
    cwd: rootDirectory,
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });
  if (result.status !== 0) throw new Error(`pnpm ${args.join(' ')} failed.`);
}

function collectFiles(path, files) {
  if (!existsSync(path)) return;
  const stat = statSync(path);
  if (stat.isFile()) {
    files.push(path);
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (['dist', 'node_modules', 'coverage'].includes(entry.name) || entry.name.endsWith('.tsbuildinfo')) continue;
    collectFiles(join(path, entry.name), files);
  }
}

function fingerprint(paths) {
  const files = [];
  for (const path of paths) collectFiles(resolve(rootDirectory, path), files);
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(relative(rootDirectory, file));
    hash.update(readFileSync(file));
  }
  return hash.digest('hex');
}

function readState(path) {
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : '';
}

function prepare(force = false) {
  const dependencyHash = fingerprint([
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'apps/api/package.json', 'apps/web/package.json', 'packages/contracts/package.json'
  ]);
  const buildHash = fingerprint([
    'tsconfig.base.json', 'apps/api/src', 'apps/api/tsconfig.json',
    'apps/web/src', 'apps/web/public', 'apps/web/index.html', 'apps/web/vite.config.ts',
    'apps/web/tsconfig.json', 'apps/web/tsconfig.app.json', 'apps/web/tsconfig.node.json',
    'packages/contracts/src', 'packages/contracts/tsconfig.json'
  ]);
  const dependenciesMissing = !existsSync(resolve(rootDirectory, 'node_modules'));
  const dependenciesChanged = readState(dependencyStatePath) !== dependencyHash;
  const outputMissing = !existsSync(resolve(rootDirectory, 'apps/api/dist/server.js'))
    || !existsSync(resolve(rootDirectory, 'apps/web/dist/index.html'));
  const buildChanged = readState(buildStatePath) !== buildHash;

  if (force || dependenciesMissing || dependenciesChanged) {
    globalThis.console.log('Installing locked dependencies...');
    runPnpm(['install', '--frozen-lockfile']);
    writeFileSync(dependencyStatePath, `${dependencyHash}\n`);
  }
  if (force || dependenciesMissing || dependenciesChanged || outputMissing || buildChanged) {
    globalThis.console.log('Building Sagnex...');
    runPnpm(['build']);
    writeFileSync(buildStatePath, `${buildHash}\n`);
  }
}

async function health(config) {
  const [api, web] = await Promise.all([
    globalThis.fetch(`http://127.0.0.1:${config.apiPort}/api/health`)
      .then((response) => response.json())
      .then((body) => body?.name === 'sagnex' && body?.ok === true)
      .catch(() => false),
    globalThis.fetch(`http://127.0.0.1:${config.webPort}`)
      .then((response) => response.ok)
      .catch(() => false)
  ]);
  return api && web;
}

function trackedPid() {
  if (!existsSync(pidPath)) return null;
  const pid = Number(readFileSync(pidPath, 'utf8').trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stop({ quiet = false } = {}) {
  const pid = trackedPid();
  if (!pid || !processExists(pid)) {
    rmSync(pidPath, { force: true });
    if (!quiet) globalThis.console.log('No managed native Sagnex process is running.');
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: quiet ? 'ignore' : 'inherit' });
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch { process.kill(pid, 'SIGTERM'); }
    for (let attempt = 0; attempt < 30 && processExists(pid); attempt += 1) {
      await new Promise((resolvePromise) => globalThis.setTimeout(resolvePromise, 100));
    }
    if (processExists(pid)) {
      try { process.kill(-pid, 'SIGKILL'); } catch { process.kill(pid, 'SIGKILL'); }
    }
  }
  rmSync(pidPath, { force: true });
  if (!quiet) globalThis.console.log('Sagnex stopped. Data was preserved.');
}

async function start({ skipPrepare = false } = {}) {
  const config = loadConfig();
  mkdirSync(config.dataDirectory, { recursive: true });
  mkdirSync(config.backupDirectory, { recursive: true });
  if (await health(config)) {
    globalThis.console.log(`Sagnex is already running at http://127.0.0.1:${config.webPort}`);
    return;
  }
  if (!skipPrepare) prepare(false);
  const runner = packageManager();
  globalThis.console.log('Starting Sagnex...');
  const output = openSync(outputLogPath, 'a');
  const error = openSync(errorLogPath, 'a');
  const child = spawn(process.execPath, [resolve(rootDirectory, 'scripts/start.mjs')], {
    cwd: rootDirectory,
    detached: true,
    env: {
      ...config.environment,
      SAGNEX_PNPM_COMMAND: runner.command,
      SAGNEX_PNPM_PREFIX: runner.prefix.join(' ')
    },
    stdio: ['ignore', output, error],
    windowsHide: true
  });
  closeSync(output);
  closeSync(error);
  child.unref();
  if (!child.pid) throw new Error('Sagnex process did not start.');
  writeFileSync(pidPath, `${child.pid}\n`);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await health(config)) {
      globalThis.console.log(`Sagnex is running at http://127.0.0.1:${config.webPort}`);
      globalThis.console.log(`Logs: ${logDirectory}`);
      return;
    }
    if (!processExists(child.pid)) break;
    await new Promise((resolvePromise) => globalThis.setTimeout(resolvePromise, 250));
  }
  rmSync(pidPath, { force: true });
  throw new Error(`Sagnex failed to start. Check ${errorLogPath}`);
}

async function update() {
  loadConfig();
  await stop({ quiet: true });
  prepare(true);
  await start({ skipPrepare: true });
}

if (!['start', 'update', 'stop'].includes(action)) {
  throw new Error('Usage: native-manager.mjs <start|update|stop>');
}

if (action === 'start') await start();
if (action === 'update') await update();
if (action === 'stop') await stop();
