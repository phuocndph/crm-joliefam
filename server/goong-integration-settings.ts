import type express from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { goongEnvironment, goongKeyValid, goongPublicStatus, type GoongRuntimeConfig } from './goong-address-adapter.js';
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const schema = z.object({ mode: z.enum(['INHERIT_ENV', 'ENABLED', 'DISABLED']), revision: z.number().int().min(0), api_key: z.string().max(512).optional() }).strict();
type Row = { mode: GoongRuntimeConfig['mode']; api_key: string | null; revision: number };
const safeError = (error: unknown) => error instanceof Error && 'status' in error ? error : fail('Không thể đọc hoặc lưu cấu hình Goong. Vui lòng thử lại.', 503);
export class GoongIntegrationSettings {
  constructor(private pool: Pool, private env: NodeJS.ProcessEnv = process.env) {}
  private fromRow(row?: Row): GoongRuntimeConfig {
    if (!row || row.mode === 'INHERIT_ENV') return goongEnvironment(this.env, row?.revision || 0);
    if (row.mode === 'DISABLED') return { token: '', configured: false, source: 'disabled', mode: row.mode, revision: row.revision, hasSavedKey: false };
    const token = row.api_key || '';
    return { token, configured: goongKeyValid(token), source: 'saved', mode: row.mode, revision: row.revision, hasSavedKey: Boolean(token) };
  }
  async snapshot(): Promise<GoongRuntimeConfig> {
    try { return this.fromRow((await this.pool.query<Row>('select mode,api_key,revision from integration_private.goong_settings where id=true')).rows[0]); }
    catch (error) { throw safeError(error); }
  }
  async status() { return goongPublicStatus(await this.snapshot()); }
  async save(input: unknown, actor: string) {
    const data = schema.parse(input);
    const client = await this.pool.connect().catch(error => { throw safeError(error); });
    try {
      await client.query('begin');
      await client.query("set local lock_timeout='2s'");
      await client.query("select pg_advisory_xact_lock(hashtextextended('integration-private-goong-settings',0))");
      const previous = (await client.query<Row>('select mode,api_key,revision from integration_private.goong_settings where id=true for update')).rows[0];
      if ((previous?.revision || 0) !== data.revision) throw fail('Cấu hình Goong đã thay đổi. Hãy tải lại trước khi lưu.', 409);
      let key: string | null = null;
      if (data.mode === 'ENABLED') {
        key = data.api_key?.trim() || (previous?.mode === 'ENABLED' ? previous.api_key : null);
        if (!key || !goongKeyValid(key)) throw fail('Cần nhập khóa Goong hợp lệ trước khi bật gợi ý địa chỉ.');
      }
      const updated = previous
        ? (await client.query<Row>('update integration_private.goong_settings set mode=$1,api_key=$2,revision=revision+1,updated_by=$3,updated_at=now() where id=true and revision=$4 returning mode,api_key,revision', [data.mode, key, actor, data.revision])).rows[0]
        : (await client.query<Row>('insert into integration_private.goong_settings(id,mode,api_key,revision,updated_by) values(true,$1,$2,1,$3) returning mode,api_key,revision', [data.mode, key, actor])).rows[0];
      if (!updated) throw fail('Cấu hình Goong đã thay đổi. Hãy tải lại trước khi lưu.', 409);
      await client.query("insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason) values('external_integration','goong',$1,$2,'Thay đổi chế độ gợi ý địa chỉ; không lưu khóa hoặc địa chỉ trong nhật ký')", [data.mode === 'ENABLED' ? 'SAVE_GOONG_SETTINGS' : data.mode === 'DISABLED' ? 'DISABLE_GOONG_SETTINGS' : 'INHERIT_GOONG_ENV', actor]);
      await client.query('commit');
      return goongPublicStatus(this.fromRow(updated));
    } catch (error) { await client.query('rollback').catch(() => undefined); throw safeError(error); }
    finally { client.release(); }
  }
}
export function registerGoongIntegrationSettings(app: express.Express, settings: GoongIntegrationSettings, actor: () => string, role: () => string) {
  const admin = () => { if (!actor() || role() !== 'admin' || actor() === 'local-admin') throw fail('Cần đăng nhập bằng tài khoản quản trị thật để quản lý cấu hình API.', 403); };
  const send = (res: express.Response, error: unknown) => {
    const status = error instanceof z.ZodError ? 400 : Number((error as { status?: number })?.status || 503);
    res.status([400, 403, 409, 503].includes(status) ? status : 503).json({ message: error instanceof z.ZodError ? 'Dữ liệu cấu hình Goong không hợp lệ.' : safeError(error).message });
  };
  app.get('/api/external-integrations/goong', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { admin(); res.json(await settings.status()); } catch (error) { send(res, error); }
  });
  app.put('/api/external-integrations/goong', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { admin(); res.json(await settings.save(req.body, actor())); } catch (error) { send(res, error); }
  });
}
