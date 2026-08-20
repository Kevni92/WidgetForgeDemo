import {
  createDataKey,
  dataKeyId,
  MutationError,
  type DataKey,
  type DataUnsubscribe,
  type MutationDefinition,
  type MutationInvocationContext,
  type RealtimeConnectionListener,
  type RealtimeConnectionState,
  type RealtimeMutationTransport,
  type RealtimeResourceObserver,
  type RealtimeTransport,
} from 'widgetforge';
import {
  cancelOrderInputSchema,
  marketMyOrdersParamsSchema,
  marketOrderbookParamsSchema,
  parseServerMessage,
  placeOrderInputSchema,
  protocolVersion,
  serializeMessage,
  type ClientMessage,
  type ErrorEnvelope,
  type MarketMyOrdersData,
  type MarketMyOrdersParams,
  type MarketOrderbookData,
  type MarketOrderbookParams,
  type MutationName,
  type ResourceSubscribeMessage,
  type ServerMessage,
} from '@widgetforge-demo/protocol';

export type DemoDataKey = DataKey<MarketOrderbookData | MarketMyOrdersData>;

export interface DemoRealtimeTransportOptions {
  readonly url: string;
  readonly demoPlayerId: string;
  readonly reconnectDelayMs?: number;
  readonly webSocketFactory?: WebSocketFactory;
}

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

interface ActiveSubscription {
  readonly id: string;
  readonly key: DemoDataKey;
  readonly observer: RealtimeResourceObserver<unknown>;
  readonly message: SubscribeMessage;
  active: boolean;
}

interface PendingMutation {
  readonly mutation: MutationName;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: MutationError) => void;
  abortListener?: () => void;
}

type SubscribeMessage = ResourceSubscribeMessage;

const connectedState: RealtimeConnectionState = { status: 'connected', error: null };
const disconnectedState: RealtimeConnectionState = { status: 'disconnected', error: null };

export function createMarketOrderbookDataKey(
  params: MarketOrderbookParams,
): DataKey<MarketOrderbookData> {
  const normalizedParams = marketOrderbookParamsSchema.parse(params);
  return createDataKey<MarketOrderbookData>('market.orderbook', JSON.stringify(normalizedParams));
}

export function createMarketMyOrdersDataKey(
  params: MarketMyOrdersParams,
): DataKey<MarketMyOrdersData> {
  const normalizedParams = marketMyOrdersParamsSchema.parse(params);
  return createDataKey<MarketMyOrdersData>('market.myOrders', JSON.stringify(normalizedParams));
}

export class DemoRealtimeTransport implements RealtimeTransport, RealtimeMutationTransport {
  private readonly connectionListeners = new Set<RealtimeConnectionListener>();
  private readonly subscriptions = new Map<string, ActiveSubscription>();
  private readonly pendingMutations = new Map<string, PendingMutation>();
  private readonly reconnectDelayMs: number;
  private socket: WebSocketLike | null = null;
  private state: RealtimeConnectionState = disconnectedState;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionAttempt: Promise<void> | null = null;
  private connectionAttemptResolve: (() => void) | null = null;
  private connectionAttemptReject: ((error: Error) => void) | null = null;
  private manuallyDisconnected = false;
  private reconnectAfterClose = false;
  private disposed = false;
  private subscriptionSequence = 0;
  private requestSequence = 0;
  private demoPlayerId: string;

  constructor(private readonly options: DemoRealtimeTransportOptions) {
    if (!options.url.trim()) throw new Error('Realtime WebSocket URL must not be empty');
    if (!options.demoPlayerId.trim()) throw new Error('Demo player ID must not be empty');
    this.demoPlayerId = options.demoPlayerId;
    this.reconnectDelayMs = Math.max(0, options.reconnectDelayMs ?? 250);
  }

  get connectionState(): RealtimeConnectionState {
    return this.state;
  }

  get currentDemoPlayerId(): string {
    return this.demoPlayerId;
  }

  connect(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Realtime transport has been disposed'));
    this.manuallyDisconnected = false;
    if (this.state.status === 'connected') return Promise.resolve();
    if (this.connectionAttempt) return this.connectionAttempt;

    this.clearReconnectTimer();
    this.connectionAttempt = new Promise<void>((resolve, reject) => {
      this.connectionAttemptResolve = resolve;
      this.connectionAttemptReject = reject;
    });
    this.openSocket(this.state.status === 'reconnecting' ? 'reconnecting' : 'connecting');
    return this.connectionAttempt;
  }

  disconnect(): Promise<void> {
    this.manuallyDisconnected = true;
    this.reconnectAfterClose = false;
    this.clearReconnectTimer();
    this.rejectPendingMutations(createConnectionLostError('Realtime transport disconnected'));
    this.emitState(disconnectedState);

    const socket = this.socket;
    if (!socket) {
      this.rejectConnectionAttempt(new Error('Realtime transport disconnected before the session became ready'));
      return Promise.resolve();
    }

    socket.close();
    return Promise.resolve();
  }

  async setDemoPlayerId(playerId: string): Promise<void> {
    const normalizedPlayerId = playerId.trim();
    if (!normalizedPlayerId) throw new Error('Demo player ID must not be empty');
    if (normalizedPlayerId === this.demoPlayerId) return;

    this.demoPlayerId = normalizedPlayerId;
    if (this.state.status === 'disconnected' && !this.socket) return;

    this.reconnectAfterClose = true;
    this.manuallyDisconnected = true;
    this.clearReconnectTimer();
    this.rejectPendingMutations(createConnectionLostError('Demo player changed'));
    this.emitState(disconnectedState);
    this.rejectConnectionAttempt(new Error('Demo player changed before the session became ready'));
    this.socket?.close();
    if (!this.socket) {
      this.reconnectAfterClose = false;
      this.manuallyDisconnected = false;
      await this.connect();
    }
  }

  observeConnection(listener: RealtimeConnectionListener): DataUnsubscribe {
    this.connectionListeners.add(listener);
    listener(this.state);
    return () => this.connectionListeners.delete(listener);
  }

  subscribe<T>(key: DataKey<T>, observer: RealtimeResourceObserver<T>): DataUnsubscribe {
    const message = resourceMessageForKey(key);
    const subscription: ActiveSubscription = {
      id: `subscription-${++this.subscriptionSequence}`,
      key: key as DemoDataKey,
      observer: observer as RealtimeResourceObserver<unknown>,
      message: { ...message, subscriptionId: `subscription-${this.subscriptionSequence}` },
      active: true,
    };
    this.subscriptions.set(subscription.id, subscription);

    if (this.state.status === 'connected') this.send(subscription.message);

    return () => {
      if (!subscription.active) return;
      subscription.active = false;
      this.subscriptions.delete(subscription.id);
      if (this.state.status === 'connected') {
        this.send({ type: 'resource.unsubscribe', subscriptionId: subscription.id });
      }
    };
  }

  request<Input, Result>(
    definition: MutationDefinition<Input, Result>,
    input: Input,
    context?: MutationInvocationContext,
  ): Promise<Result> {
    if (this.state.status !== 'connected') {
      return Promise.reject(new MutationError('transport', 'Realtime mutation requires a connected transport', {
        code: 'REALTIME_NOT_CONNECTED',
        details: { status: this.state.status },
      }));
    }

    const mutation = mutationNameForDefinition(definition);
    const requestId = `request-${++this.requestSequence}`;
    const requestMessage: ClientMessage = mutation === 'market.placeOrder'
      ? {
          type: 'mutation.request',
          requestId,
          mutation: 'market.placeOrder',
          input: placeOrderInputSchema.parse(input),
        }
      : {
          type: 'mutation.request',
          requestId,
          mutation: 'market.cancelOrder',
          input: cancelOrderInputSchema.parse(input),
        };

    return new Promise<Result>((resolve, reject) => {
      const pending: PendingMutation = {
        mutation,
        resolve: (value) => resolve(value as Result),
        reject,
      };
      const signal = context?.signal;
      if (signal?.aborted) {
        reject(new MutationError('transport', 'Realtime mutation was aborted', { code: 'REALTIME_ABORTED' }));
        return;
      }
      if (signal) {
        const abortListener = (): void => {
          const active = this.pendingMutations.get(requestId);
          if (!active) return;
          this.pendingMutations.delete(requestId);
          active.reject(new MutationError('transport', 'Realtime mutation was aborted', {
            code: 'REALTIME_ABORTED',
          }));
        };
        signal.addEventListener('abort', abortListener, { once: true });
        pending.abortListener = () => signal.removeEventListener('abort', abortListener);
      }
      this.pendingMutations.set(requestId, pending);
      try {
        this.send(requestMessage);
      } catch (error) {
        this.settleMutation(requestId, undefined, mutationErrorForTransport(error));
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.manuallyDisconnected = true;
    this.clearReconnectTimer();
    this.rejectPendingMutations(new MutationError('transport', 'Realtime transport was disposed', {
      code: 'REALTIME_DISPOSED',
    }));
    for (const subscription of this.subscriptions.values()) subscription.active = false;
    this.subscriptions.clear();
    this.socket?.close();
    this.socket = null;
    this.emitState(disconnectedState);
    this.connectionListeners.clear();
  }

  private openSocket(status: 'connecting' | 'reconnecting'): void {
    if (this.socket || this.disposed) return;
    this.emitState({ status, error: null });
    const factory = this.options.webSocketFactory ?? browserWebSocketFactory;
    let socket: WebSocketLike;
    try {
      socket = factory(this.options.url);
    } catch (error) {
      this.handleConnectionFailure(mutationErrorForTransport(error));
      return;
    }
    this.socket = socket;
    socket.onopen = () => this.handleOpen(socket);
    socket.onmessage = (event) => this.handleMessage(socket, event.data);
    socket.onerror = () => this.handleConnectionFailure(new Error('Realtime WebSocket error'));
    socket.onclose = () => this.handleClose(socket);
  }

  private handleOpen(socket: WebSocketLike): void {
    if (socket !== this.socket || this.disposed) return;
    try {
      this.send({ type: 'session.hello', protocolVersion, demoPlayerId: this.demoPlayerId });
    } catch (error) {
      this.handleConnectionFailure(mutationErrorForTransport(error));
    }
  }

  private handleMessage(socket: WebSocketLike, raw: unknown): void {
    if (socket !== this.socket || this.disposed) return;
    let message: ServerMessage;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
      message = parseServerMessage(parsed);
    } catch (error) {
      this.handleConnectionFailure(new Error(`Invalid server message: ${messageFor(error)}`));
      return;
    }

    switch (message.type) {
      case 'session.ready':
        this.handleSessionReady();
        return;
      case 'resource.snapshot':
        this.handleResourceSnapshot(message);
        return;
      case 'mutation.result':
        this.settleMutation(message.requestId, message.result, undefined, message.mutation);
        return;
      case 'mutation.error':
        this.settleMutation(message.requestId, undefined, mutationErrorForServer(message.error), message.mutation);
        return;
      case 'protocol.error':
        this.rejectPendingMutations(mutationErrorForServer(message.error));
        return;
      default:
        assertNever(message);
    }
  }

  private handleSessionReady(): void {
    if (this.state.status === 'connected') return;
    this.emitState(connectedState);
    this.resolveConnectionAttempt();
    for (const subscription of this.subscriptions.values()) {
      if (subscription.active) this.send(subscription.message);
    }
  }

  private handleResourceSnapshot(message: Extract<ServerMessage, { type: 'resource.snapshot' }>): void {
    const subscription = this.subscriptions.get(message.subscriptionId);
    if (!subscription?.active) return;
    subscription.observer.snapshot(message.data);
  }

  private handleConnectionFailure(error: Error): void {
    if (this.disposed) return;
    this.emitState({ status: 'error', error });
    this.rejectConnectionAttempt(error);
    this.socket?.close();
  }

  private handleClose(socket: WebSocketLike): void {
    if (socket !== this.socket) return;
    this.socket = null;
    this.rejectPendingMutations(createConnectionLostError('Realtime WebSocket connection lost'));
    if (this.reconnectAfterClose) {
      this.reconnectAfterClose = false;
      this.manuallyDisconnected = false;
      this.rejectConnectionAttempt(new Error('Realtime WebSocket closed while changing demo player'));
      void this.connect();
      return;
    }
    if (this.manuallyDisconnected || this.disposed) {
      this.rejectConnectionAttempt(new Error('Realtime WebSocket closed before the session became ready'));
      return;
    }
    this.rejectConnectionAttempt(new Error('Realtime WebSocket closed before the session became ready'));
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.disposed || this.manuallyDisconnected) return;
    this.emitState({ status: 'reconnecting', error: null });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manuallyDisconnected && !this.disposed) {
        this.openSocket('reconnecting');
      }
    }, this.reconnectDelayMs);
  }

  private send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== 1) {
      throw new MutationError('transport', 'Realtime WebSocket is not open', {
        code: 'REALTIME_SOCKET_NOT_OPEN',
      });
    }
    this.socket.send(serializeMessage(message));
  }

  private emitState(state: RealtimeConnectionState): void {
    this.state = state;
    for (const listener of [...this.connectionListeners]) listener(state);
  }

  private resolveConnectionAttempt(): void {
    const resolve = this.connectionAttemptResolve;
    this.connectionAttempt = null;
    this.connectionAttemptResolve = null;
    this.connectionAttemptReject = null;
    resolve?.();
  }

  private rejectConnectionAttempt(error: Error): void {
    const reject = this.connectionAttemptReject;
    this.connectionAttempt = null;
    this.connectionAttemptResolve = null;
    this.connectionAttemptReject = null;
    reject?.(error);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private rejectPendingMutations(error: MutationError): void {
    for (const requestId of [...this.pendingMutations.keys()]) {
      this.settleMutation(requestId, undefined, error);
    }
  }

  private settleMutation(
    requestId: string,
    value?: unknown,
    error?: MutationError,
    mutation?: MutationName,
  ): void {
    const pending = this.pendingMutations.get(requestId);
    if (!pending) return;
    this.pendingMutations.delete(requestId);
    pending.abortListener?.();
    if (mutation && mutation !== pending.mutation) {
      pending.reject(new MutationError('transport', 'Mutation response did not match its request', {
        code: 'REALTIME_MUTATION_MISMATCH',
        details: { expected: pending.mutation, received: mutation },
      }));
      return;
    }
    if (error) pending.reject(error);
    else pending.resolve(value);
  }
}

function browserWebSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

function resourceMessageForKey(key: DataKey): SubscribeMessage {
  if (key.kind !== 'market.orderbook' && key.kind !== 'market.myOrders') {
    throw new Error(`Unsupported WidgetForge data resource: ${key.kind}`);
  }

  let params: unknown;
  try {
    params = JSON.parse(key.id) as unknown;
  } catch {
    throw new Error(`Data key ${dataKeyId(key)} does not contain JSON resource parameters`);
  }

  if (key.kind === 'market.orderbook') {
    return {
      type: 'resource.subscribe',
      subscriptionId: '',
      resource: 'market.orderbook',
      params: marketOrderbookParamsSchema.parse(params),
    };
  }
  if (key.kind === 'market.myOrders') {
    return {
      type: 'resource.subscribe',
      subscriptionId: '',
      resource: 'market.myOrders',
      params: marketMyOrdersParamsSchema.parse(params),
    };
  }
  throw new Error(`Unsupported WidgetForge data resource: ${key.kind}`);
}

function mutationNameForDefinition(definition: MutationDefinition): MutationName {
  if (definition.id === 'market.placeOrder' || definition.id === 'market.cancelOrder') return definition.id;
  throw new MutationError('transport', `Unsupported WidgetForge mutation: ${definition.id}`, {
    code: 'REALTIME_UNSUPPORTED_MUTATION',
  });
}

function mutationErrorForServer(error: ErrorEnvelope): MutationError {
  return new MutationError(
    error.category === 'transport' || error.category === 'internal' ? 'transport' : 'server',
    error.message,
    { code: error.code, details: error.details },
  );
}

function mutationErrorForTransport(error: unknown): MutationError {
  if (error instanceof MutationError) return error;
  return new MutationError('transport', messageFor(error), { code: 'REALTIME_TRANSPORT_ERROR', cause: error });
}

function createConnectionLostError(message: string): MutationError {
  return new MutationError('transport', message, {
    code: 'REALTIME_CONNECTION_LOST',
    details: { outcome: 'unknown' },
  });
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled server message: ${JSON.stringify(value)}`);
}
