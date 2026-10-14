import { spawnSync } from 'node:child_process';
// Explicit CLI environment wins over .env.local; no credentials are embedded.
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  stdio: 'inherit', env: { ...process.env, VITE_BACKEND_MODE: 'local', VITE_LOCAL_API_URL: '', VITE_LOCAL_DEMO_AUTH: 'false', VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
});
process.exitCode = result.status ?? 1;

