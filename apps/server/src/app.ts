import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { AppDatabase } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import { registerRealtimeRoutes } from './realtime/realtime-server.js';

export interface AppOptions {
  logger?: boolean;
  database?: AppDatabase;
  databasePath?: string;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const ownsDatabase = !options.database;
  const database = options.database ?? new AppDatabase(options.databasePath ?? ':memory:');
  database.migrate();
  seedDatabase(database);

  await app.register(websocket, {
    options: {
      maxPayload: 1024 * 1024,
    },
  });

  app.get('/health', async () => ({ status: 'ok' as const }));
  registerRealtimeRoutes(app, {
    database,
    logger: {
      info: (message, details) => app.log.info(details ?? {}, message),
      warn: (message, details) => app.log.warn(details ?? {}, message),
    },
  });

  if (ownsDatabase) {
    app.addHook('onClose', async () => {
      database.close();
    });
  }

  return app;
}
