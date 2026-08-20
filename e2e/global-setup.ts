import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { e2eDatabasePath } from './test-environment';

export default function globalSetup(): void {
  mkdirSync(dirname(e2eDatabasePath), { recursive: true });
}
