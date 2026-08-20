import { z } from 'zod';

/** Protocol version reserved for the first demo wire contract. */
export const protocolVersion = 1 as const;

/** Shared schema exported so later message contracts use the same runtime source of truth. */
export const protocolVersionSchema = z.literal(protocolVersion);
