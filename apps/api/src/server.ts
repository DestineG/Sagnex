import envPaths from 'env-paths';
import { join } from 'node:path';
import process from 'node:process';
import { createApp } from './app.js';
import { createDatabase } from './database.js';

const paths = envPaths('Sagnex');
const dataDirectory = process.env.SAGNEX_DATA_DIR || paths.data;
const databasePath = process.env.SAGNEX_DATABASE_PATH || join(dataDirectory, 'sagnex.sqlite');
const port = Number(process.env.SAGNEX_API_PORT || 4784);
const context = createDatabase(databasePath);
const app = createApp(context);

const close = async () => {
  await app.close();
  context.close();
};

process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());

try {
  await app.listen({ host: '127.0.0.1', port });
  console.log(`Sagnex API: http://127.0.0.1:${port}`);
  console.log(`Data: ${databasePath}`);
} catch (error) {
  app.log.error(error);
  context.close();
  process.exit(1);
}
