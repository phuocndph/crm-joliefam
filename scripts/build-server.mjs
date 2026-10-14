import { cp, mkdir } from 'node:fs/promises';
await mkdir('server-dist/db/migrations', { recursive: true });
await cp('server/db/migrations', 'server-dist/db/migrations', { recursive: true });

