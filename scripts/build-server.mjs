import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.resolve(root, 'server-dist/db/migrations');
const relative = path.relative(root, destination);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || destination !== path.join(root, 'server-dist', 'db', 'migrations')) throw new Error('Unsafe generated migration directory.');
// Migrations are an exact generated mirror.  A recursive copy alone retains a
// deleted source migration in server-dist and can make a fresh local database
// apply SQL that no longer exists in this checkout.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(path.join(root, 'server/db/migrations'), destination, { recursive: true });
await cp(path.join(root, 'server/product-rate-inputs.mjs'), path.join(root, 'server-dist/product-rate-inputs.mjs'));

