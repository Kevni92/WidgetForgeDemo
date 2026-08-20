import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

describe('server app', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('exposes a health route through Fastify injection', async () => {
    app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('does not register developer reset or diagnostics routes in production', async () => {
    app = await buildApp({ environment: 'production' });

    const diagnostics = await app.inject({ method: 'GET', url: '/dev/diagnostics' });
    const reset = await app.inject({ method: 'POST', url: '/dev/reset' });

    expect(diagnostics.statusCode).toBe(404);
    expect(reset.statusCode).toBe(404);
  });
});
