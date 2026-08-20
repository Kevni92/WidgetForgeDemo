import { describe, expect, it } from 'vitest';
import { protocolVersion, protocolVersionSchema } from './index.js';

describe('protocol bootstrap', () => {
  it('exposes protocol version one as a runtime-validated value', () => {
    expect(protocolVersionSchema.parse(protocolVersion)).toBe(1);
    expect(() => protocolVersionSchema.parse(2)).toThrow();
  });
});
