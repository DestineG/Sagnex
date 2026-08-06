import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createDatabase } from './database.js';

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
