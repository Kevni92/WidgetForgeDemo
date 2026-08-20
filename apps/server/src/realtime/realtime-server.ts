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
import { MarketDomainError } from '../domain/market/errors.js';
import { MutationDispatcher, type MutationExecution } from './mutation-dispatcher.js';
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
  marketService?: MarketService;
  logger?: RealtimeLogger;
}

export function registerRealtimeRoutes(
  app: FastifyInstance,
  options: RealtimeRouteOptions,
): PublicationHub {
  const marketService = options.marketService ?? new MarketService(options.database);
  const mutationDispatcher = new MutationDispatcher(marketService);
  const publicationHub = new PublicationHub(marketService);
  app.decorate('publicationHub', publicationHub);
  const logger = options.logger ?? {
    info: () => undefined,
    warn: () => undefined,
  };

  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    const connectionId = randomUUID();
    let playerId: string | undefined;
    const requestIds = new Set<string>();
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
          handleMutation(message, playerId);
          return;
        default:
          assertNever(message);
      }
    }

    function handleMutation(
      message: Extract<ClientMessage, { type: 'mutation.request' }>,
      sessionPlayerId: string,
    ): void {
      publicationHub.beginMutation(connectionId);
      try {
        if (requestIds.has(message.requestId)) {
          throw new Error(`Duplicate request ID: ${message.requestId}`);
        }
        requestIds.add(message.requestId);

        let execution: MutationExecution;
        try {
          execution = mutationDispatcher.dispatch(sessionPlayerId, message);
        } catch (error) {
          send(socket, {
            type: 'mutation.error',
            requestId: message.requestId,
            mutation: message.mutation,
            error: mutationErrorFor(error),
          });
          logger.warn('mutation.error', {
            connectionId,
            requestId: message.requestId,
            mutation: message.mutation,
          });
          return;
        }

        if (execution.mutation === 'market.placeOrder') {
          send(socket, {
            type: 'mutation.result',
            requestId: message.requestId,
            mutation: 'market.placeOrder',
            result: execution.result,
          });
        } else {
          send(socket, {
            type: 'mutation.result',
            requestId: message.requestId,
            mutation: 'market.cancelOrder',
            result: execution.result,
          });
        }
        publicationHub.publishMany(execution.invalidations);
        logger.info('mutation.result', {
          connectionId,
          requestId: message.requestId,
          mutation: message.mutation,
        });
      } finally {
        publicationHub.endMutation(connectionId);
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

function mutationErrorFor(error: unknown): {
  category: 'domain' | 'internal';
  code?: 'UNKNOWN_MARKET' | 'UNKNOWN_COMMODITY' | 'INVALID_PRICE' | 'INVALID_QUANTITY' | 'ORDER_NOT_FOUND' | 'ORDER_NOT_OWNED' | 'ORDER_NOT_CANCELLABLE';
  message: string;
} {
  if (error instanceof MarketDomainError) {
    return { category: 'domain', code: error.code, message: error.message };
  }
  return { category: 'internal', message: 'Internal server error' };
}
