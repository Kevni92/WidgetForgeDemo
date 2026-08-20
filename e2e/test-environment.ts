import { resolve } from 'node:path';

export const e2eDatabasePath = resolve(process.cwd(), 'e2e', '.tmp', 'widgetforge-e2e.sqlite');
export const e2eClientPort = 4173;
export const e2eServerPort = 3300;
