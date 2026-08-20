import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import {
  parseClientMessage,
  serializeMessage,
  type ClientMessage,
  type ResourceSubscribeMessage,
  type ServerMessage,
} from '@widgetforge-demo/protocol';
import { AppDatabase } from '../db/database.js';
import { CatalogRepository } from '../db/repositories/catalog-repository.js';
import { MarketService } from '../domain/market/service.js';
import { PublicationHub, protocolErrorFor } from './publication-hub.js';
import type { RegisteredSubscription } from './subscription-registry.js';

declare module 'fastify' {
  interface FastifyInstance {
    publicationHub: PublicationHub;
  }
}

export interface RealtimeLogger {
  info: (message: string, details?: Record<string, string>) => void;
  warn: (message: string, details?: Record<string, string>) => void;
}

export interface RealtimeRouteOptions {
  database: AppDatabase;
  logger?: RealtimeLogger;
}

export function registerRealtimeRoutes(
  app: FastifyInstance,
  options: RealtimeRouteOptions,
): PublicationHub {
  const marketService = new MarketService(options.database);
  const publicationHub = new PublicationHub(marketService);
  app.decorate('publicationHub', publicationHub);
  const logger = options.logger ?? {
    info: () => undefined,
    warn: () => undefined,
  };

  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    const connectionId = randomUUID();
    let playerId: string | undefined;
    publicationHub.addConnection(connectionId, (message) => send(socket, message));
    logger.info('connection.open', { connectionId });

    socket.on('message', (data: RawData) => {
      const raw = data.toString();
      let input: unknown;
      try {
        input = JSON.parse(raw) as unknown;
      } catch {
        send(socket, protocolErrorFor(new Error('Invalid JSON message')));
        logger.warn('protocol.invalid_json', { connectionId });
        return;
      }

      let message: ClientMessage;
      try {
        message = parseClientMessage(input);
      } catch {
        send(socket, protocolErrorFor(new Error('Invalid protocol message')));
        logger.warn('protocol.invalid_message', { connectionId });
        return;
      }

      try {
        handleMessage(message);
      } catch (error) {
        send(socket, protocolErrorFor(error));
        logger.warn('protocol.handler_error', { connectionId });
      }
    });

    socket.on('close', () => {
      publicationHub.removeConnection(connectionId);
      logger.info('connection.close', { connectionId });
    });

    function handleMessage(message: ClientMessage): void {
      if (message.type === 'session.hello') {
        if (playerId) {
          throw new Error('Session is already ready');
        }
        const player = new CatalogRepository(options.database.connection).findPlayerById(
          message.demoPlayerId,
        );
        if (!player) {
          throw new Error('Unknown demo player');
        }
        playerId = player.id;
        publicationHub.setPlayer(connectionId, player.id);
        send(socket, {
          type: 'session.ready',
          protocolVersion: 1,
          player: { id: player.id, displayName: player.displayName },
        });
        logger.info('session.ready', { connectionId, demoPlayerId: player.id });
        return;
      }

      if (!playerId) {
        throw new Error('Session is not ready');
      }

      switch (message.type) {
        case 'resource.subscribe':
          subscribe(message, playerId);
          return;
        case 'resource.unsubscribe':
          publicationHub.unsubscribe(connectionId, message.subscriptionId);
          logger.info('subscription.remove', {
            connectionId,
            subscriptionId: message.subscriptionId,
          });
          return;
        case 'mutation.request':
          throw new Error('Mutation routing is not available in this protocol endpoint yet');
        default:
          assertNever(message);
      }
    }

    function subscribe(message: ResourceSubscribeMessage, sessionPlayerId: string): void {
      const subscription: RegisteredSubscription =
        message.resource === 'market.orderbook'
          ? {
              subscriptionId: message.subscriptionId,
              playerId: sessionPlayerId,
              resource: 'market.orderbook',
              params: message.params,
            }
          : {
              subscriptionId: message.subscriptionId,
              playerId: sessionPlayerId,
              resource: 'market.myOrders',
              params: message.params,
            };
      publicationHub.subscribe(connectionId, subscription);
      logger.info('subscription.add', {
        connectionId,
        subscriptionId: subscription.subscriptionId,
        resource: subscription.resource,
      });
    }
  });

  return publicationHub;
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(serializeMessage(message));
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled client message: ${JSON.stringify(value)}`);
}
