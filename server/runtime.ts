import path from 'node:path';

export function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const startupMode = env.LOCAL_DB_STARTUP_MODE?.trim() || 'normal';
  if (!['normal', 'verify-item5a', 'serve-verified-item5a', 'serve-installed'].includes(startupMode)) throw new Error('LOCAL_DB_STARTUP_MODE không hợp lệ.');
  if (startupMode !== 'normal' && (env.LOCAL_SYNC_AUTO !== 'false' || env.LOCAL_INTEGRATION_API !== 'false' || env.LOCAL_ZCRM_API !== 'false')) {
    throw new Error('Các chế độ Item5A đã xác minh yêu cầu LOCAL_SYNC_AUTO=false, LOCAL_INTEGRATION_API=false, LOCAL_ZCRM_API=false.');
  }
  const publicUrl = env.PUBLIC_APP_URL?.trim();
  let canonical: URL | null;
  try { canonical = publicUrl ? new URL(publicUrl) : null; }
  catch { throw new Error('PUBLIC_APP_URL không hợp lệ.'); }
  if (production && (!canonical || canonical.protocol !== 'https:' || canonical.username || canonical.password || canonical.pathname !== '/' || canonical.search || canonical.hash)) {
    throw new Error('Production cần PUBLIC_APP_URL là origin HTTPS chính thức.');
  }
  if (production && !env.LOCAL_DATABASE_URL?.trim()) throw new Error('Production cần LOCAL_DATABASE_URL riêng.');
  const databaseUrl = env.LOCAL_DATABASE_URL || 'postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/crm_local';
  let database: URL;
  try { database = new URL(databaseUrl); }
  catch { throw new Error('LOCAL_DATABASE_URL không hợp lệ.'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error('LOCAL_DATABASE_URL không hợp lệ.');
  if (production && (!database.password || decodeURIComponent(database.password) === 'crm_local_dev_only' || database.password.includes('REPLACE'))) throw new Error('Production cần mật khẩu cơ sở dữ liệu riêng, không dùng mật khẩu mẫu/phát triển.');
  const defaults = [8090, 8080, 8081, 8083, 5173].flatMap(port => [`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const origins = env.LOCAL_ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean) || (production ? [canonical!.origin] : defaults);
  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error('LOCAL_ALLOWED_ORIGINS không hợp lệ.'); }
    if (url.origin !== origin || url.username || url.password || (production && url.protocol !== 'https:')) throw new Error('LOCAL_ALLOWED_ORIGINS chỉ nhận origin chính xác, HTTPS trong production.');
  }
  if (production && !origins.includes(canonical!.origin)) throw new Error('Origin chính thức phải thuộc LOCAL_ALLOWED_ORIGINS.');
  const port = Number(env.LOCAL_API_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('LOCAL_API_PORT không hợp lệ.');
  return {
    production, startupMode: startupMode as 'normal' | 'verify-item5a' | 'serve-verified-item5a' | 'serve-installed', databaseUrl, port,
    publicOrigin: canonical?.origin || null,
    allowedOrigins: new Set(origins),
    host: env.LOCAL_API_HOST || '127.0.0.1',
    storageRoot: path.resolve(env.LOCAL_STORAGE_ROOT || '.local-storage'),
    demoEnabled: !production && env.LOCAL_DEMO_AUTH !== 'false',
    integrationEnabled: startupMode === 'normal' && env.LOCAL_INTEGRATION_API === 'true',
    zcrmEnabled: startupMode === 'normal' && env.LOCAL_ZCRM_API === 'true',
    syncAutomaticEnabled: startupMode === 'normal' && (env.LOCAL_SYNC_AUTO === 'true' || (!production && env.LOCAL_SYNC_AUTO !== 'false')),
  };
}

export const runtime = readRuntimeConfig();
