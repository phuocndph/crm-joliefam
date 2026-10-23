import type express from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { ExternalReadAdapters, type GhnRuntimeConfig } from './external-read-adapters.js';

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const keyPattern = /^[!-~]{8,512}$/;
const shopPattern = /^[1-9]\d{0,19}$/;
const modeSchema = z.enum(['INHERIT_ENV', 'ENABLED', 'DISABLED']);
const writeSchema = z.object({
  mode: modeSchema,
  api_key: z.string().max(512).optional(),
  primary_shop_id: z.string().max(20).optional(),
  allowed_shop_ids: z.string().max(1200).optional(),
  revision: z.number().int().min(0),
}).strict();

type StoredRow = {
  mode: 'INHERIT_ENV' | 'ENABLED' | 'DISABLED';
  api_key: string | null;
  primary_shop_id: string | null;
  allowed_shop_ids: string[];
  revision: number;
};

export type GhnSettingsStatus = {
  configured: boolean;
  source: 'server_env' | 'saved' | 'disabled';
  mode: 'INHERIT_ENV' | 'ENABLED' | 'DISABLED';
  revision: number;
  configured_shop_count: number;
  has_saved_key: boolean;
  writes_supported: true;
  create_supported: true;
};

export type GhnAdminSettingsStatus = GhnSettingsStatus & {
  primary_shop_id: string;
  allowed_shop_ids: string[];
};

function readShops(primary: unknown, allowed: unknown): { primary: string; shops: string[] } | null {
  const main = typeof primary === 'string' ? primary.trim() : '';
  const extras = Array.isArray(allowed) ? allowed : [];
  const shops = [...new Set([main, ...extras.map(value => String(value).trim()).filter(Boolean)])];
  if (!main || shops.length === 0 || shops.length > 50 || !shops.every(shop => shopPattern.test(shop) && Number.isSafeInteger(Number(shop)))) return null;
  return { primary: main, shops };
}

function environmentSnapshot(env: NodeJS.ProcessEnv, revision: number): GhnRuntimeConfig {
  const normalized = readShops(env.GHN_SHOP_ID, String(env.GHN_SHOP_IDS || '').split(','));
  const token = String(env.GHN_API_KEY || '').trim();
  return {
    token,
    primaryShop: normalized?.primary || '',
    shops: normalized?.shops || [],
    configured: Boolean(token && normalized),
    source: 'server_env',
    mode: 'INHERIT_ENV',
    revision,
    hasSavedKey: false,
  };
}

function publicStatus(config: GhnRuntimeConfig): GhnSettingsStatus {
  return {
    configured: config.configured,
    source: config.source,
    mode: config.mode,
    revision: config.revision,
    configured_shop_count: config.shops.length,
    has_saved_key: config.hasSavedKey,
    writes_supported: true,
    create_supported: true,
  };
}

function adminStatus(config: GhnRuntimeConfig): GhnAdminSettingsStatus {
  return { ...publicStatus(config), primary_shop_id: config.primaryShop, allowed_shop_ids: config.shops };
}

function safeDatabaseError(error: unknown): Error {
  if (error instanceof Error && 'status' in error) return error;
  return fail('Không thể đọc cấu hình GHN. Vui lòng thử lại.', 503);
}

export class ExternalIntegrationSettings {
  constructor(private pool: Pool, private env: NodeJS.ProcessEnv = process.env) {}

  async snapshot(): Promise<GhnRuntimeConfig> {
    let row: StoredRow | undefined;
    try {
      row = (await this.pool.query<StoredRow>(`select mode,api_key,primary_shop_id,allowed_shop_ids,revision
        from integration_private.ghn_settings where id=true`)).rows[0];
    } catch (error) {
      throw safeDatabaseError(error);
    }
    if (!row || row.mode === 'INHERIT_ENV') return environmentSnapshot(this.env, row?.revision || 0);
    if (row.mode === 'DISABLED') return {
      token: '', primaryShop: '', shops: [], configured: false, source: 'disabled', mode: 'DISABLED',
      revision: row.revision, hasSavedKey: false,
    };
    const normalized = readShops(row.primary_shop_id, row.allowed_shop_ids);
    const token = String(row.api_key || '').trim();
    return {
      token,
      primaryShop: normalized?.primary || '',
      shops: normalized?.shops || [],
      configured: Boolean(keyPattern.test(token) && normalized),
      source: 'saved',
      mode: 'ENABLED',
      revision: row.revision,
      hasSavedKey: Boolean(token),
    };
  }

  async status(): Promise<GhnAdminSettingsStatus> {
    return adminStatus(await this.snapshot());
  }
  async discovery(input:unknown,adapter:ExternalReadAdapters) {
    const data=z.object({api_key:z.string().max(512).optional()}).strict().parse(input);
    const draft=data.api_key?.trim();
    if(draft && !keyPattern.test(draft)) throw fail('Khóa GHN không hợp lệ.');
    const config=await this.snapshot();
    const token=draft || (config.mode==='DISABLED'?'':config.token);
    if(!token) throw fail('Nhập khóa GHN mới để lấy cửa hàng.');
    const shops=await adapter.discoverShops(token);
    return {shops:shops.map(({_id,name,address,district_id,ward_code,status})=>({_id,name,address,district_id,ward_code,status}))};
  }

  private normalizeEnabled(data: z.infer<typeof writeSchema>, previous?: StoredRow) {
    const keyInput = data.api_key === undefined || data.api_key.trim() === '' ? undefined : data.api_key.trim();
    if (keyInput !== undefined && !keyPattern.test(keyInput)) throw fail('Khóa GHN không hợp lệ.', 400);
    const key = keyInput ?? (previous?.mode === 'ENABLED' ? String(previous.api_key || '').trim() : '');
    if (!key) throw fail('Cần nhập khóa GHN mới trước khi bật cấu hình đã lưu.', 400);
    if (!keyPattern.test(key)) throw fail('Khóa GHN không hợp lệ.', 400);
    const shops = readShops(data.primary_shop_id, String(data.allowed_shop_ids || '').split(','));
    if (!shops) throw fail('Shop chính và danh sách shop GHN phải là mã số, tối đa 50 shop.', 400);
    return { key, primary: shops.primary, shops: shops.shops };
  }

  async save(input: unknown, actor: string): Promise<GhnAdminSettingsStatus> {
    const data = writeSchema.parse(input);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("set local lock_timeout='2s'");
      await client.query("select pg_advisory_xact_lock(hashtextextended('integration-private-ghn-settings',0))");
      const previous = (await client.query<StoredRow>(`select mode,api_key,primary_shop_id,allowed_shop_ids,revision
        from integration_private.ghn_settings where id=true for update`)).rows[0];
      if ((!previous && data.revision !== 0) || (previous && previous.revision !== data.revision)) {
        throw fail('Cấu hình đã thay đổi. Hãy tải lại trước khi lưu.', 409);
      }
      let apiKey: string | null = null;
      let primaryShop: string | null = null;
      let shops: string[] = [];
      if (data.mode === 'ENABLED') {
        const enabled = this.normalizeEnabled(data, previous);
        apiKey = enabled.key;
        primaryShop = enabled.primary;
        shops = enabled.shops;
      }
      const updated = previous
        ? (await client.query<StoredRow>(`update integration_private.ghn_settings set mode=$1,api_key=$2,
            primary_shop_id=$3,allowed_shop_ids=$4::text[],revision=revision+1,updated_by=$5,updated_at=now()
            where id=true and revision=$6
            returning mode,api_key,primary_shop_id,allowed_shop_ids,revision`, [data.mode, apiKey, primaryShop, shops, actor, data.revision])).rows[0]
        : (await client.query<StoredRow>(`insert into integration_private.ghn_settings
            (id,mode,api_key,primary_shop_id,allowed_shop_ids,revision,updated_by,updated_at)
            values(true,$1,$2,$3,$4::text[],1,$5,now())
            returning mode,api_key,primary_shop_id,allowed_shop_ids,revision`, [data.mode, apiKey, primaryShop, shops, actor])).rows[0];
      if (!updated) throw fail('Cấu hình đã thay đổi. Hãy tải lại trước khi lưu.', 409);
      const action = data.mode === 'ENABLED' ? 'SAVE_GHN_SETTINGS' : data.mode === 'DISABLED' ? 'DISABLE_GHN_SETTINGS' : 'INHERIT_GHN_ENV';
      await client.query(`insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason)
        values('external_integration','ghn',$1,$2,'Thay đổi chế độ GHN; không lưu khóa hoặc danh sách shop trong nhật ký')`, [action, actor]);
      await client.query('commit');
      return adminStatus(this.fromStored(updated));
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw safeDatabaseError(error);
    } finally {
      client.release();
    }
  }

  private fromStored(row: StoredRow): GhnRuntimeConfig {
    if (row.mode === 'INHERIT_ENV') return environmentSnapshot(this.env, row.revision);
    if (row.mode === 'DISABLED') return { token: '', primaryShop: '', shops: [], configured: false, source: 'disabled', mode: 'DISABLED', revision: row.revision, hasSavedKey: false };
    const normalized = readShops(row.primary_shop_id, row.allowed_shop_ids);
    const token = String(row.api_key || '').trim();
    return { token, primaryShop: normalized?.primary || '', shops: normalized?.shops || [], configured: Boolean(keyPattern.test(token) && normalized), source: 'saved', mode: 'ENABLED', revision: row.revision, hasSavedKey: Boolean(token) };
  }
}

export function registerExternalIntegrationSettings(app: express.Express, settings: ExternalIntegrationSettings, adapter: ExternalReadAdapters, actor: () => string, role: () => string) {
  const admin = () => {
    if (role() !== 'admin' || actor() === 'local-admin') throw fail('Cần đăng nhập bằng tài khoản quản trị thật để quản lý cấu hình API.', 403);
  };
  const send = (res: express.Response, error: unknown) => {
    const status = Number((error as { status?: number })?.status || (error instanceof z.ZodError ? 400 : 500));
    res.status(status >= 400 && status <= 503 ? status : 500).json({ message: error instanceof z.ZodError ? 'Dữ liệu cấu hình không hợp lệ.' : error instanceof Error && 'status' in error ? error.message : 'Không thể xử lý cấu hình API. Vui lòng thử lại.' });
  };
  app.get('/api/external-integrations/ghn', async (_req, res) => {
    try { admin(); res.setHeader('Cache-Control', 'no-store'); res.json(await settings.status()); }
    catch (error) { send(res, error); }
  });
  app.put('/api/external-integrations/ghn', async (req, res) => {
    try { admin(); res.setHeader('Cache-Control', 'no-store'); res.json(await settings.save(req.body, actor())); }
    catch (error) { send(res, error); }
  });
  app.post('/api/external-integrations/ghn/test', async (_req, res) => {
    try {
      admin();
      res.setHeader('Cache-Control', 'no-store');
      const config = await settings.snapshot();
      if (!config.configured) return res.json({ configured: false, connected: false, message: 'GHN chưa được cấu hình. Hãy lưu khóa và shop, hoặc chọn kế thừa biến máy chủ.', checked_at: new Date().toISOString() });
      const result = await adapter.ghn({ action: 'get_shops' }, config);
      const found = result.success && Array.isArray(result.data) ? new Set(result.data.map((shop: { _id?: unknown }) => String(shop._id))) : new Set<string>();
      if (!result.success || found.size !== config.shops.length || config.shops.some(shop => !found.has(shop))) throw fail('Khóa GHN không truy cập được đầy đủ cửa hàng đã cấu hình.', 502);
      return res.json({ configured: true, connected: true, message: `Đã xác nhận ${found.size} cửa hàng GHN.`, checked_at: new Date().toISOString() });
    } catch (error) { send(res, error); }
  });
  app.post('/api/external-integrations/ghn/shops-discovery',async(req,res)=>{
    try{admin();res.setHeader('Cache-Control','no-store');res.json(await settings.discovery(req.body,adapter));}catch(error){send(res,error);}
  });
}
