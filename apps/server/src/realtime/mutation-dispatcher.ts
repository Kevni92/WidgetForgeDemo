import type {
  CancelOrderResult,
  MutationRequestMessage,
  PlaceOrderResult,
} from '@widgetforge-demo/protocol';
import type {
  DomainMutationOutcome,
  ResourceInvalidation,
} from '../domain/market/service.js';
import { MarketService } from '../domain/market/service.js';

export type MutationExecution =
  | {
      mutation: 'market.placeOrder';
      result: PlaceOrderResult;
      invalidations: ResourceInvalidation[];
    }
  | {
      mutation: 'market.cancelOrder';
      result: CancelOrderResult;
      invalidations: ResourceInvalidation[];
    };

export class MutationDispatcher {
  constructor(private readonly marketService: MarketService) {}

  dispatch(playerId: string, request: MutationRequestMessage): MutationExecution {
    if (request.mutation === 'market.placeOrder') {
      return toPlaceExecution(this.marketService.placeOrder(playerId, request.input));
    }
    return toCancelExecution(this.marketService.cancelOrder(playerId, request.input));
  }
}

function toPlaceExecution(
  outcome: DomainMutationOutcome<PlaceOrderResult>,
): MutationExecution {
  return {
    mutation: 'market.placeOrder',
    result: outcome.result,
    invalidations: outcome.invalidations,
  };
}

function toCancelExecution(
  outcome: DomainMutationOutcome<CancelOrderResult>,
): MutationExecution {
  return {
    mutation: 'market.cancelOrder',
    result: outcome.result,
    invalidations: outcome.invalidations,
  };
}
