import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';

export interface AppOptions {
  logger?: boolean;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(websocket, {
    options: {
      maxPayload: 1024 * 1024,
    },
  });

  app.get('/health', async () => ({ status: 'ok' as const }));

  return app;
}
