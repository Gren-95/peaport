import fs from 'node:fs';
import path from 'node:path';

/** Start each E2E run from a clean database so the bootstrap admin (and its
 *  forced password change) is recreated deterministically. */
export default function globalSetup() {
  fs.rmSync(path.resolve('./.e2e-data'), { recursive: true, force: true });
}
