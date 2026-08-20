import type { DomainErrorCode } from '@widgetforge-demo/protocol';

export class MarketDomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'MarketDomainError';
    this.code = code;
  }
}
