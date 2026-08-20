import { buildApp } from './app.js';

const host = process.env.SERVER_HOST ?? '127.0.0.1';
const port = Number(process.env.SERVER_PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('SERVER_PORT must be an integer between 1 and 65535');
}

const app = await buildApp({
  logger: true,
  databasePath: process.env.DATABASE_PATH,
});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
