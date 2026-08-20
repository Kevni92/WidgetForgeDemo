import { z } from 'zod';

/** Protocol version reserved for the first demo wire contract. */
export const protocolVersion = 1 as const;

const nonEmptyStringSchema = z.string().min(1);
const positiveIntegerSchema = z.number().int().positive();
const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const protocolVersionSchema = z.literal(protocolVersion);
export const orderSideSchema = z.enum(['BUY', 'SELL']);
export const orderStatusSchema = z.enum(['OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED']);

export const resourceNameSchema = z.enum(['market.orderbook', 'market.myOrders']);

export const marketOrderbookParamsSchema = z
  .object({
    marketId: nonEmptyStringSchema,
    commodityId: nonEmptyStringSchema,
  })
  .strict();

export const marketMyOrdersParamsSchema = z
  .object({
    marketId: nonEmptyStringSchema,
    commodityId: nonEmptyStringSchema.optional(),
  })
  .strict();

export const resourceSubscribeSchema = z.discriminatedUnion('resource', [
  z.object({
    resource: z.literal('market.orderbook'),
    params: marketOrderbookParamsSchema,
  }),
  z.object({
    resource: z.literal('market.myOrders'),
    params: marketMyOrdersParamsSchema,
  }),
]);

export const orderbookLevelSchema = z
  .object({
    priceMinor: positiveIntegerSchema,
    quantity: positiveIntegerSchema,
    orderCount: positiveIntegerSchema,
  })
  .strict();

export const marketOrderbookDataSchema = z
  .object({
    marketId: nonEmptyStringSchema,
    commodityId: nonEmptyStringSchema,
    bids: z.array(orderbookLevelSchema),
    asks: z.array(orderbookLevelSchema),
  })
  .strict();

export const myOrderSchema = z
  .object({
    id: nonEmptyStringSchema,
    marketId: nonEmptyStringSchema,
    commodityId: nonEmptyStringSchema,
    side: orderSideSchema,
    priceMinor: positiveIntegerSchema,
    originalQuantity: positiveIntegerSchema,
    remainingQuantity: nonNegativeIntegerSchema,
    status: orderStatusSchema,
    createdAt: nonEmptyStringSchema,
  })
  .strict();

export const marketMyOrdersDataSchema = z
  .object({
    marketId: nonEmptyStringSchema,
    commodityId: nonEmptyStringSchema.optional(),
    orders: z.array(myOrderSchema),
  })
  .strict();

export const placeOrderInputSchema = z
  .object({
    marketId: nonEmptyStringSchema,
    commodityId: nonEmptyStringSchema,
    side: orderSideSchema,
    priceMinor: positiveIntegerSchema,
    quantity: positiveIntegerSchema,
  })
  .strict();

export const cancelOrderInputSchema = z
  .object({
    orderId: nonEmptyStringSchema,
  })
  .strict();

export const placeOrderResultSchema = z
  .object({
    orderId: nonEmptyStringSchema,
    status: orderStatusSchema,
  })
  .strict();

export const cancelOrderResultSchema = z
  .object({
    orderId: nonEmptyStringSchema,
    status: z.literal('CANCELLED'),
  })
  .strict();

export const mutationNameSchema = z.enum(['market.placeOrder', 'market.cancelOrder']);

export const domainErrorCodeSchema = z.enum([
  'UNKNOWN_MARKET',
  'UNKNOWN_COMMODITY',
  'INVALID_PRICE',
  'INVALID_QUANTITY',
  'ORDER_NOT_FOUND',
  'ORDER_NOT_OWNED',
  'ORDER_NOT_CANCELLABLE',
]);

export const errorCategorySchema = z.enum([
  'protocol',
  'domain',
  'not_found',
  'conflict',
  'transport',
  'internal',
]);

export const errorEnvelopeSchema = z
  .object({
    category: errorCategorySchema,
    code: domainErrorCodeSchema.optional(),
    message: nonEmptyStringSchema,
    details: z.object({}).catchall(z.unknown()).optional(),
  })
  .strict();

export const sessionHelloMessageSchema = z
  .object({
    type: z.literal('session.hello'),
    protocolVersion: protocolVersionSchema,
    demoPlayerId: nonEmptyStringSchema,
  })
  .strict();

const resourceSubscribeOrderbookMessageSchema = z
  .object({
    type: z.literal('resource.subscribe'),
    subscriptionId: nonEmptyStringSchema,
    resource: z.literal('market.orderbook'),
    params: marketOrderbookParamsSchema,
  })
  .strict();

const resourceSubscribeMyOrdersMessageSchema = z
  .object({
    type: z.literal('resource.subscribe'),
    subscriptionId: nonEmptyStringSchema,
    resource: z.literal('market.myOrders'),
    params: marketMyOrdersParamsSchema,
  })
  .strict();

export const resourceSubscribeMessageSchema = z.discriminatedUnion('resource', [
  resourceSubscribeOrderbookMessageSchema,
  resourceSubscribeMyOrdersMessageSchema,
]);

export const resourceUnsubscribeMessageSchema = z
  .object({
    type: z.literal('resource.unsubscribe'),
    subscriptionId: nonEmptyStringSchema,
  })
  .strict();

const placeOrderRequestMessageSchema = z.object({
    type: z.literal('mutation.request'),
    requestId: nonEmptyStringSchema,
    mutation: z.literal('market.placeOrder'),
    input: placeOrderInputSchema,
  });

const cancelOrderRequestMessageSchema = z.object({
    type: z.literal('mutation.request'),
    requestId: nonEmptyStringSchema,
    mutation: z.literal('market.cancelOrder'),
    input: cancelOrderInputSchema,
  });

export const mutationRequestMessageSchema = z.discriminatedUnion('mutation', [
  placeOrderRequestMessageSchema,
  cancelOrderRequestMessageSchema,
]);

export const sessionReadyMessageSchema = z
  .object({
    type: z.literal('session.ready'),
    protocolVersion: protocolVersionSchema,
    player: z
      .object({
        id: nonEmptyStringSchema,
        displayName: nonEmptyStringSchema,
      })
      .strict(),
  })
  .strict();

const orderbookSnapshotMessageSchema = z.object({
    type: z.literal('resource.snapshot'),
    subscriptionId: nonEmptyStringSchema,
    resource: z.literal('market.orderbook'),
    data: marketOrderbookDataSchema,
  });

const myOrdersSnapshotMessageSchema = z.object({
    type: z.literal('resource.snapshot'),
    subscriptionId: nonEmptyStringSchema,
    resource: z.literal('market.myOrders'),
    data: marketMyOrdersDataSchema,
  });

export const resourceSnapshotMessageSchema = z.discriminatedUnion('resource', [
  orderbookSnapshotMessageSchema,
  myOrdersSnapshotMessageSchema,
]);

const placeOrderResultMessageSchema = z.object({
    type: z.literal('mutation.result'),
    requestId: nonEmptyStringSchema,
    mutation: z.literal('market.placeOrder'),
    result: placeOrderResultSchema,
  });

const cancelOrderResultMessageSchema = z.object({
    type: z.literal('mutation.result'),
    requestId: nonEmptyStringSchema,
    mutation: z.literal('market.cancelOrder'),
    result: cancelOrderResultSchema,
  });

export const mutationResultMessageSchema = z.discriminatedUnion('mutation', [
  placeOrderResultMessageSchema,
  cancelOrderResultMessageSchema,
]);

const placeOrderErrorMessageSchema = z.object({
    type: z.literal('mutation.error'),
    requestId: nonEmptyStringSchema,
    mutation: z.literal('market.placeOrder'),
    error: errorEnvelopeSchema,
  });

const cancelOrderErrorMessageSchema = z.object({
    type: z.literal('mutation.error'),
    requestId: nonEmptyStringSchema,
    mutation: z.literal('market.cancelOrder'),
    error: errorEnvelopeSchema,
  });

export const mutationErrorMessageSchema = z.discriminatedUnion('mutation', [
  placeOrderErrorMessageSchema,
  cancelOrderErrorMessageSchema,
]);

export const protocolErrorMessageSchema = z
  .object({
    type: z.literal('protocol.error'),
    error: errorEnvelopeSchema,
  })
  .strict();

// `type` is not unique across resource/mutation variants, so the outer union
// delegates discrimination to the nested resource/mutation schemas.
export const clientMessageSchema = z.union([
  sessionHelloMessageSchema,
  resourceSubscribeOrderbookMessageSchema,
  resourceSubscribeMyOrdersMessageSchema,
  resourceUnsubscribeMessageSchema,
  placeOrderRequestMessageSchema,
  cancelOrderRequestMessageSchema,
]);

export const serverMessageSchema = z.union([
  sessionReadyMessageSchema,
  orderbookSnapshotMessageSchema,
  myOrdersSnapshotMessageSchema,
  placeOrderResultMessageSchema,
  cancelOrderResultMessageSchema,
  placeOrderErrorMessageSchema,
  cancelOrderErrorMessageSchema,
  protocolErrorMessageSchema,
]);

export type ProtocolVersion = z.infer<typeof protocolVersionSchema>;
export type OrderSide = z.infer<typeof orderSideSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type ResourceName = z.infer<typeof resourceNameSchema>;
export type MarketOrderbookParams = z.infer<typeof marketOrderbookParamsSchema>;
export type MarketMyOrdersParams = z.infer<typeof marketMyOrdersParamsSchema>;
export type ResourceSubscribe = z.infer<typeof resourceSubscribeSchema>;
export type OrderbookLevel = z.infer<typeof orderbookLevelSchema>;
export type MarketOrderbookData = z.infer<typeof marketOrderbookDataSchema>;
export type MyOrder = z.infer<typeof myOrderSchema>;
export type MarketMyOrdersData = z.infer<typeof marketMyOrdersDataSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderInputSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;
export type PlaceOrderResult = z.infer<typeof placeOrderResultSchema>;
export type CancelOrderResult = z.infer<typeof cancelOrderResultSchema>;
export type MutationName = z.infer<typeof mutationNameSchema>;
export type DomainErrorCode = z.infer<typeof domainErrorCodeSchema>;
export type ErrorCategory = z.infer<typeof errorCategorySchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type SessionHelloMessage = z.infer<typeof sessionHelloMessageSchema>;
export type ResourceSubscribeMessage = z.infer<typeof resourceSubscribeMessageSchema>;
export type ResourceUnsubscribeMessage = z.infer<typeof resourceUnsubscribeMessageSchema>;
export type MutationRequestMessage = z.infer<typeof mutationRequestMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type SessionReadyMessage = z.infer<typeof sessionReadyMessageSchema>;
export type ResourceSnapshotMessage = z.infer<typeof resourceSnapshotMessageSchema>;
export type MutationResultMessage = z.infer<typeof mutationResultMessageSchema>;
export type MutationErrorMessage = z.infer<typeof mutationErrorMessageSchema>;
export type ProtocolErrorMessage = z.infer<typeof protocolErrorMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function parseClientMessage(input: unknown): ClientMessage {
  return clientMessageSchema.parse(input);
}

export function parseServerMessage(input: unknown): ServerMessage {
  return serverMessageSchema.parse(input);
}

export function serializeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}
