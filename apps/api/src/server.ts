import envPaths from 'env-paths';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createDatabase } from './database.js';

const paths = envPaths('Sagnex');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dataDirectory = process.env.SAGNEX_DATA_DIR
  ? resolve(process.env.SAGNEX_DATA_DIR)
  : join(projectRoot, 'data');
const databasePath = process.env.SAGNEX_DATABASE_PATH || join(dataDirectory, 'sagnex.sqlite');
const backupDirectory = process.env.SAGNEX_BACKUP_DIR
  ? resolve(process.env.SAGNEX_BACKUP_DIR)
  : join(dirname(databasePath), 'backups');
const host = process.env.SAGNEX_API_HOST || '127.0.0.1';
const port = Number(process.env.SAGNEX_API_PORT || 4784);

const legacyDatabasePath = join(paths.data, 'sagnex.sqlite');
if (!existsSync(databasePath) && databasePath !== legacyDatabasePath && existsSync(legacyDatabasePath)) {
  mkdirSync(dirname(databasePath), { recursive: true });
  for (const suffix of ['', '-wal']) {
    const source = `${legacyDatabasePath}${suffix}`;
    if (existsSync(source)) copyFileSync(source, `${databasePath}${suffix}`);
  }
  console.log(`Migrated legacy database to ${databasePath}`);
}

const legacyBackupDirectory = join(dirname(legacyDatabasePath), 'backups');
if (backupDirectory !== legacyBackupDirectory && existsSync(legacyBackupDirectory)) {
  mkdirSync(backupDirectory, { recursive: true });
  let copiedBackup = false;
  for (const entry of readdirSync(legacyBackupDirectory)) {
    const target = join(backupDirectory, entry);
    if (existsSync(target)) continue;
    cpSync(join(legacyBackupDirectory, entry), target, { recursive: true });
    copiedBackup = true;
  }
  if (copiedBackup) console.log(`Copied legacy backups to ${backupDirectory}`);
}

const context = createDatabase(databasePath);
const app = createApp(context, { backupDirectory });

const close = async () => {
  await app.close();
  context.close();
};

process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());

try {
  await app.listen({ host, port });
  console.log(`Sagnex API: http://${host}:${port}`);
  console.log(`Data: ${databasePath}`);
  console.log(`Restore backups: ${backupDirectory}`);
} catch (error) {
  app.log.error(error);
  context.close();
  process.exit(1);
}
