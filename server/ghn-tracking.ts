import type express from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ExternalReadAdapters, type GhnRuntimeConfig } from './external-read-adapters.js';

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const terminal = ['delivered', 'self_delivered', 'cancel', 'cancelled', 'returned', 'lost', 'damage'];
const labels: Record<string, string> = {
  ready_to_pick: 'Chờ lấy hàng', picking: 'Đang lấy hàng', picked: 'Đã lấy hàng',
  storing: 'Đang lưu kho', transporting: 'Đang vận chuyển', sorting: 'Đang phân loại',
  delivering: 'Đang giao hàng', delivered: 'Đã giao hàng', delivery_fail: 'Giao hàng không thành công',
  waiting_to_return: 'Chờ chuyển hoàn', return: 'Chờ chuyển hoàn', returning: 'Đang chuyển hoàn',
  return_transporting: 'Đang vận chuyển hoàn', return_sorting: 'Đang phân loại hoàn',
  returned: 'Đã hoàn hàng', cancel: 'Đã hủy', lost: 'Thất lạc', damage: 'Hư hỏng',
};
type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;
export type GhnPrincipal = { actor: string; role: string; manager: string };
type TrackingRow = Record<string, unknown> & {
  id: string; ghn_order_code: string; row_hash: string; order_hash: string | null;
  order_id: string | null; ghn_status: string | null; order_status: string | null;
  last_updated_at: Date | null; cursor_time: string | null;
};

// The list and refresh use the same authenticated manager scope. Client managerId is never used.
export async function ghnPrincipal(db: Queryable, actor: string): Promise<GhnPrincipal> {
  const row = (await db.query(`select r.role,r.assigned_by from local_user_profiles p
    join local_user_roles r on r.user_id=p.user_id and r.is_active
    where p.user_id=$1 and p.is_active
    order by case r.role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 when 'team_leader' then 4 else 5 end limit 1`, [actor])).rows[0];
  if (!row) throw fail('Tài khoản không còn hoạt động.', 401);
  if (!['admin', 'manager'].includes(row.role)) {
    const permission = (await db.query(`select 1 from local_employee_permissions
      where user_id=$1 and enabled and permission_type in ('ghn_tracking','orders') limit 1`, [actor])).rows[0];
    if (!permission) throw fail('Bạn chưa được cấp quyền theo dõi GHN.', 403);
  }
  return { actor, role: row.role, manager: ['admin', 'manager'].includes(row.role) ? actor : String(row.assigned_by || actor) };
}

export const ghnVisibleSql = `( $1='admin' or coalesce(o.manager_id,g.manager_id)=$2 )
  and (g.order_id is null or o.id is not null)
  and (o.id is null or g.tenant_id is null or o.tenant_id is null or g.tenant_id=o.tenant_id)
  and not exists(select 1 from local_projection_tombstones t where
    (t.source_table='ghn_tracking' and t.source_key=g.id) or
    (t.source_table='orders' and t.source_key=g.order_id))`;

export type GhnTrackingSort = 'priority' | 'customer_name' | 'ghn_status' | 'created_date';
export type GhnTrackingSortOrder = 'asc' | 'desc';

const priorityAttentionStatuses = [
  'delivery_fail', 'exception', 'lost', 'damage', 'return', 'waiting_to_return',
  'returning', 'return_transporting', 'return_sorting', 'return_fail',
];
const priorityActiveStatuses = ['delivering', 'transporting', 'storing', 'sorting'];
const priorityPickupStatuses = ['ready_to_pick', 'picking', 'picked'];
const priorityTerminalStatuses = ['delivered', 'self_delivered', 'cancel', 'cancelled', 'returned'];
const sqlStatusList = (statuses: string[]) => statuses.map((status) => `'${status}'`).join(',');
const priorityAttentionSql = sqlStatusList(priorityAttentionStatuses);
const priorityActiveSql = sqlStatusList(priorityActiveStatuses);
const priorityPickupSql = sqlStatusList(priorityPickupStatuses);
const priorityTerminalSql = sqlStatusList(priorityTerminalStatuses);

// This only returns fixed SQL fragments. Request values never become SQL text.
export function buildGhnTrackingOrder(sortByInput: unknown, sortOrderInput: unknown): {
  sortBy: GhnTrackingSort;
  sortOrder: GhnTrackingSortOrder;
  sql: string;
} {
  const requestedSort = String(sortByInput ?? '').trim().toLowerCase();
  const sortBy = requestedSort === '' || requestedSort === 'none'
    ? 'priority'
    : requestedSort === 'status'
      ? 'ghn_status'
      : requestedSort;
  if (!['priority', 'customer_name', 'ghn_status', 'created_date'].includes(sortBy)) {
    throw fail('Kiểu sắp xếp GHN không hợp lệ.');
  }
  const normalizedSortBy = sortBy as GhnTrackingSort;

  const requestedDirection = String(sortOrderInput ?? '').trim().toLowerCase();
  const sortOrder = requestedDirection === '' ? 'asc' : requestedDirection;
  if (sortOrder !== 'asc' && sortOrder !== 'desc') {
    throw fail('Thứ tự sắp xếp GHN không hợp lệ.');
  }

  if (normalizedSortBy === 'priority') {
    return {
      sortBy: normalizedSortBy,
      sortOrder,
      sql: `case
        when coalesce(g.ghn_status,'') in (${priorityAttentionSql}) then 0
        when coalesce(g.ghn_status,'') in (${priorityActiveSql}) then 1
        when coalesce(g.ghn_status,'') in (${priorityPickupSql}) then 2
        when coalesce(g.ghn_status,'') in (${priorityTerminalSql}) then 4
        else 3
      end asc,
      case when coalesce(g.ghn_status,'') in (${priorityActiveSql}) then g.expected_delivery_date end asc nulls last,
      case when coalesce(g.ghn_status,'') in (${priorityTerminalSql}) then g.created_date end desc nulls last,
      case when coalesce(g.ghn_status,'') in (${priorityTerminalSql}) then g.created_at end desc nulls last,
      g.id asc`,
    };
  }

  const column = normalizedSortBy === 'customer_name' ? 'g.customer_name'
    : normalizedSortBy === 'ghn_status' ? 'g.ghn_status'
      : 'g.created_date';
  return { sortBy: normalizedSortBy, sortOrder, sql: `${column} ${sortOrder} nulls last,g.id asc` };
}

// Legacy detail dialogs must obey the same saved-row scope as list and refresh.
export async function requireGhnTrackingVisible(db: Queryable, actor: string, code: string) {
  const principal = await ghnPrincipal(db, actor);
  const row = (await db.query(`select g.id from local_ghn_tracking g
    left join local_orders o on o.id=g.order_id where ${ghnVisibleSql} and g.ghn_order_code=$3 limit 1`,
  [principal.role, principal.manager, code])).rows[0];
  if (!row) throw fail('Không tìm thấy vận đơn trong phạm vi quản lý.', 404);
}

const selectRows = `select g.*,md5(to_jsonb(g)::text) row_hash,
  to_char(g.last_updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_time,
  case when o.id is null then null else md5(to_jsonb(o)::text) end order_hash,o.status order_status
  from local_ghn_tracking g left join local_orders o on o.id=g.order_id`;

// GHN returns both epoch seconds and ISO timestamps, with zero/0001 sentinels.
export function normalizeGhnDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') return null;
  const numeric = typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value));
  const date = numeric ? new Date(Number(value) * (Number(value) < 1e12 ? 1000 : 1)) : new Date(String(value));
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2200) return null;
  return date.toISOString();
}

export class GhnTrackingRefresh {
  private readonly cursorSecret = randomBytes(32);
  constructor(private pool: Pool, private adapter: ExternalReadAdapters) {}

  private cursor(principal: GhnPrincipal, staleOnly: boolean, position: { started: string; time: string | null; id: string }) {
    const payload = Buffer.from(JSON.stringify({ ...principal, staleOnly, ...position })).toString('base64url');
    return payload + '.' + createHmac('sha256', this.cursorSecret).update(payload).digest('base64url');
  }
  private readCursor(value: string, principal: GhnPrincipal, staleOnly: boolean) {
    try {
      const [payload, signature, extra] = value.split('.');
      const expected = createHmac('sha256', this.cursorSecret).update(payload).digest();
      const supplied = Buffer.from(signature, 'base64url');
      if (extra || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error();
      const parsed = z.object({ actor: z.string(), role: z.string(), manager: z.string(), staleOnly: z.boolean(), started: z.string().datetime(), time: z.string().datetime().nullable(), id: z.string().min(1).max(100) }).strict().parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
      if (parsed.actor !== principal.actor || parsed.role !== principal.role || parsed.manager !== principal.manager || parsed.staleOnly !== staleOnly || Date.now() - Date.parse(parsed.started) > 900000 || Date.parse(parsed.started) > Date.now()) throw new Error();
      return parsed;
    } catch { throw fail('Lượt cập nhật đã hết hạn hoặc không hợp lệ. Hãy bắt đầu lượt mới.', 409); }
  }

  async connection(actor: string) {
    await ghnPrincipal(this.pool, actor);
    const config = await this.adapter.snapshot();
    if (!config.configured) return { configured: false, connected: false, message: 'GHN chưa được cấu hình. Quản trị viên mở Cài đặt API để lưu cấu hình hoặc chọn kế thừa biến máy chủ.', checked_at: new Date().toISOString() };
    try {
      const result = await this.adapter.ghn({ action: 'get_shops' }, config);
      if (!result.success || !Array.isArray(result.data) || new Set(result.data.map((shop: { _id: unknown }) => String(shop._id))).size !== config.shops.length) throw fail('Khóa GHN không truy cập được đầy đủ cửa hàng đã cấu hình.', 502);
      return { configured: true, connected: true, message: `Đã kết nối GHN và xác nhận ${result.data.length} cửa hàng đã cấu hình.`, checked_at: new Date().toISOString() };
    } catch (error) {
      return { configured: true, connected: false, message: error instanceof Error ? error.message : 'Không kết nối được GHN.', checked_at: new Date().toISOString() };
    }
  }

  private async rows(principal: GhnPrincipal, selector?: { id?: string; orderCode?: string }, staleOnly = false, position?: { started: string; time: string | null; id: string | null }) {
    const values: unknown[] = [principal.role, principal.manager];
    let target = '';
    if (selector) { values.push(selector.id || selector.orderCode); target = selector.id ? 'and g.id=$3' : 'and g.ghn_order_code=$3'; }
    else {
      values.push(terminal, position!.started, position!.time, position!.id);
      target = `and not(coalesce(g.ghn_status,'')=any($3::text[])) and not(coalesce(o.status,'')=any($3::text[]))
        and (g.last_updated_at is null or g.last_updated_at<=$4::timestamptz)
        and ($6::text is null or ($5::timestamptz is null and ((g.last_updated_at is null and g.id>$6) or g.last_updated_at is not null))
          or ($5::timestamptz is not null and (g.last_updated_at,g.id)>($5::timestamptz,$6::text)))
        ${staleOnly ? "and (g.last_updated_at is null or g.last_updated_at<$4::timestamptz-interval '1 hour')" : ''}`;
    }
    return (await this.pool.query(`${selectRows} where ${ghnVisibleSql} ${target}
      order by g.last_updated_at asc nulls first,g.id limit ${selector ? 1 : 51}`, values)).rows as TrackingRow[];
  }

  async refresh(actor: string, input: unknown) {
    const body = z.object({ id: z.string().min(1).max(100).optional(), orderCode: z.string().regex(/^[A-Za-z0-9_-]{3,60}$/).optional(), staleOnly: z.boolean().default(false), cursor: z.string().min(1).max(2048).optional() }).strict().parse(input);
    if (body.id && body.orderCode) throw fail('Chỉ chọn một mã theo dõi.');
    const principal = await ghnPrincipal(this.pool, actor);
    // Fail early if unconfigured. Each external read below resolves a fresh,
    // atomic key/shop snapshot so a disable also stops an in-progress batch.
    const config = await this.adapter.snapshot();
    const single = Boolean(body.id || body.orderCode);
    if (single && body.cursor) throw fail('Chỉ dùng lượt tiếp cho cập nhật nhiều vận đơn.');
    const position = body.cursor ? this.readCursor(body.cursor, principal, body.staleOnly) : { started: new Date().toISOString(), time: null, id: null };
    const rows = await this.rows(principal, single ? body : undefined, body.staleOnly, position);
    if (single && !rows.length) throw fail('Không tìm thấy vận đơn trong phạm vi quản lý.', 404);
    if (!config.configured) throw fail('GHN chưa được cấu hình. Quản trị viên mở Cài đặt API để kiểm tra cấu hình.', 503);
    const result = { updated: 0, skipped: 0, failed: 0, has_more: !single && rows.length > 50, next_cursor: null as string | null, limit: 50, errors: [] as Array<{ orderCode: string; message: string }> };
    // Each batch is deliberately bounded; stale/terminal rows never call GHN.
    const deadline = Date.now() + 25000;
    for (const row of rows.slice(0, 50)) {
      if (Date.now() > deadline) { result.has_more = true; break; }
      // JavaScript Date truncates PostgreSQL microseconds. Keep the exact SQL value
      // for keyset progression, otherwise a failed boundary row can repeat forever.
      if (!single) result.next_cursor = this.cursor(principal, body.staleOnly, { started: position.started, time: row.cursor_time, id: row.id });
      if (terminal.includes(String(row.ghn_status)) || terminal.includes(String(row.order_status)) ||
        (body.staleOnly && row.last_updated_at && row.last_updated_at.getTime() > Date.now() - 3600000)) { result.skipped++; continue; }
      try {
        // Re-authorize before every external read, including long-running batches.
        const freshPrincipal = await ghnPrincipal(this.pool, actor);
        const fresh = (await this.rows(freshPrincipal, { id: row.id }))[0];
        if (!fresh || fresh.row_hash !== row.row_hash || fresh.order_hash !== row.order_hash) throw fail('Vận đơn đã thay đổi; tải lại trước khi cập nhật.', 409);
        const response = await this.adapter.ghn({ action: 'track', orderCode: row.ghn_order_code });
        if (!response.success || !response.data) throw fail(response.error || 'GHN không trả về dữ liệu vận đơn.', 502);
        const data = response.data;
        if (data.orderCode !== row.ghn_order_code) throw fail('GHN trả về mã vận đơn khác yêu cầu.', 502);
        const savedShop = (row.raw_data as { shop_id?: unknown } | null)?.shop_id;
        if (savedShop !== undefined && savedShop !== null && String(savedShop) !== String(data.rawData?.shop_id)) throw fail('Cửa hàng vận đơn GHN khác dữ liệu đã lưu.', 502);
        if (typeof data.status !== 'string' || !/^[a-z_]{1,60}$/.test(data.status)) throw fail('Trạng thái GHN không hợp lệ.', 502);
        const patch = {
          status: data.status, label: labels[data.status] || data.status,
          expected: normalizeGhnDate(data.expectedDeliveryTime), delivered: normalizeGhnDate(data.deliveredDate),
        };
        const client = await this.pool.connect();
        try {
          await client.query('begin');
          await client.query("set local lock_timeout='5s'");
          await client.query("select pg_advisory_xact_lock_shared(hashtextextended('production-source-sync',0))");
          // Source tombstones have no FK: block insertion only during this short commit.
          await client.query('lock table local_projection_tombstones in share mode');
          if (row.order_id) await client.query('select id from local_orders where id=$1 for share', [row.order_id]);
          await client.query('select id from local_ghn_tracking where id=$1 for update', [row.id]);
          // Serialize commit with profile deactivation, role reassignment and permission revocation.
          await client.query('select user_id from local_user_profiles where user_id=$1 for share', [actor]);
          await client.query('select user_id from local_user_roles where user_id=$1 order by role for share', [actor]);
          await client.query("select user_id from local_employee_permissions where user_id=$1 and permission_type in ('ghn_tracking','orders') order by permission_type for share", [actor]);
          const commitPrincipal = await ghnPrincipal(client, actor);
          const current = (await client.query(`${selectRows} where ${ghnVisibleSql} and g.id=$3`, [commitPrincipal.role, commitPrincipal.manager, row.id])).rows[0] as TrackingRow | undefined;
          if (!current || current.row_hash !== row.row_hash || current.order_hash !== row.order_hash ||
            terminal.includes(String(current.ghn_status)) || terminal.includes(String(current.order_status))) throw fail('Vận đơn hoặc quyền quản lý đã thay đổi; hãy tải lại.', 409);
          // Keep customer, COD, linkage, ownership, notes and original raw payload intact.
          await client.query(`update local_ghn_tracking set ghn_status=$2,ghn_status_text=$3,
            expected_delivery_date=coalesce($4::timestamptz,expected_delivery_date),
            delivered_date=coalesce($5::timestamptz,delivered_date),
            raw_data=coalesce(raw_data,'{}'::jsonb)||jsonb_build_object('local_ghn_status_refresh',jsonb_build_object('order_code',ghn_order_code,'status',$2::text,'checked_at',now())),
            last_updated_at=now(),updated_at=now(),local_modified_at=now() where id=$1`, [row.id, patch.status, patch.label, patch.expected, patch.delivered]);
          await client.query(`insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason,before_data,after_data)
            values('ghn_tracking',$1,'REFRESH_STATUS',$2,'Cập nhật trạng thái vận đơn từ GHN',$3::jsonb,$4::jsonb)`,
          [row.id, actor, JSON.stringify({ status: row.ghn_status }), JSON.stringify(patch)]);
          await client.query('commit');
          result.updated++;
        } catch (error) { await client.query('rollback'); throw error; }
        finally { client.release(); }
      } catch (error) {
        result.failed++;
        result.errors.push({ orderCode: row.ghn_order_code, message: error instanceof Error && 'status' in error ? error.message : 'Không cập nhật được vận đơn. Vui lòng thử lại.' });
      }
    }
    if (!result.has_more) result.next_cursor = null;
    return result;
  }
}

const trackingCode = z.string().trim().regex(/^[A-Za-z0-9_-]{3,60}$/);
const trackingCodes = z.array(trackingCode).min(0).max(100);
const trackingSelect = `select g.* from local_ghn_tracking g left join local_orders o on o.id=g.order_id`;
const trackingPublic = (row: Record<string, unknown>) => ({
  ...row,
  package_weight: row.package_weight === null || row.package_weight === undefined ? null : Number(row.package_weight),
  cod_amount: row.cod_amount === null || row.cod_amount === undefined ? null : Number(row.cod_amount),
});

/**
 * The management surface is deliberately separate from refresh.  Refresh only
 * writes carrier status; linking, importing and deleting must preserve that
 * business data and therefore use short, scoped database transactions.
 */
export class GhnTrackingManagement {
  constructor(private pool: Pool, private adapter: ExternalReadAdapters, private fetcher: typeof fetch = fetch) {}

  private async lockActor(client: PoolClient, actor: string) {
    await client.query('select user_id from local_user_profiles where user_id=$1 for share', [actor]);
    await client.query('select user_id from local_user_roles where user_id=$1 order by role for share', [actor]);
    await client.query("select user_id from local_employee_permissions where user_id=$1 and permission_type in ('ghn_tracking','orders') order by permission_type for share", [actor]);
  }

  private async begin(client: PoolClient, actor: string) {
    await client.query('begin');
    await client.query("set local lock_timeout='5s'");
    await client.query("select pg_advisory_xact_lock_shared(hashtextextended('production-source-sync',0))");
    // Tombstone writers use one lock mode so there is no lock upgrade race.
    await client.query('lock table local_projection_tombstones in share row exclusive mode');
    await this.lockActor(client, actor);
    return ghnPrincipal(client, actor);
  }

  private async lockConfig(client: PoolClient, config: Pick<GhnRuntimeConfig, 'source' | 'mode' | 'revision'>) {
    await client.query("select pg_advisory_xact_lock_shared(hashtextextended('integration-private-ghn-settings',0))");
    const row = (await client.query(`select mode,revision from integration_private.ghn_settings where id=true for share`)).rows[0];
    // An environment-derived snapshot still depends on the persisted mode.  A
    // transition to DISABLED (or to a saved key) must invalidate an in-flight
    // provider read just as a saved-key revision change does.
    const expectedMode = config.source === 'server_env' ? 'INHERIT_ENV'
      : config.source === 'saved' ? 'ENABLED' : 'DISABLED';
    const absentEnvironmentSnapshot = config.source === 'server_env' && config.revision === 0;
    if ((absentEnvironmentSnapshot && row) || (!absentEnvironmentSnapshot && (!row || Number(row.revision) !== config.revision || row.mode !== expectedMode))) {
      throw fail('Cấu hình GHN đã thay đổi. Hãy tải lại trước khi tiếp tục.', 409);
    }
  }

  private async orderScope(db: Queryable, principal: GhnPrincipal, orderId: string, lock = '') {
    const row = (await db.query(`select o.id,o.manager_id,o.tenant_id,o.order_number,o.display_order_number
      from local_orders o where o.id=$1 and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=o.id)
      and ($2='admin' or o.manager_id=$3) ${lock}`,[orderId, principal.role, principal.manager])).rows[0];
    if (!row) throw fail('Không tìm thấy đơn hàng trong phạm vi quản lý.', 404);
    if (!row.manager_id || !row.tenant_id) throw fail('Đơn hàng thiếu phạm vi quản lý hoặc đơn vị.', 409);
    return { id: String(row.id), manager: String(row.manager_id), tenant: String(row.tenant_id), internal: String(row.display_order_number || row.order_number || '') || null };
  }

  private visibleRow(db: Queryable, principal: GhnPrincipal, idOrCode: string, field: 'id'|'ghn_order_code') {
    return db.query(`${trackingSelect} where ${ghnVisibleSql} and g.${field}=$3`, [principal.role, principal.manager, idOrCode]);
  }

  private async verifyProviderDetail(code: string, suppliedConfig?: Awaited<ReturnType<ExternalReadAdapters['snapshot']>>) {
    const config = suppliedConfig || await this.adapter.snapshot();
    if (!config.configured || config.mode === 'DISABLED') throw fail('GHN chưa được cấu hình hoặc đã tắt.', 503);
    const detail = await this.adapter.ghn({ action: 'track', orderCode: code }, config);
    if (!detail.success || !detail.data || String((detail.data as Record<string, unknown>).orderCode) !== code) throw fail('Không xác minh được mã vận đơn GHN.', 502);
    const data = detail.data as Record<string, unknown>;
    const rawData = data.rawData as Record<string, unknown> | undefined;
    const shopId = String(rawData?.shop_id ?? '');
    if (!config.shops.includes(shopId)) throw fail('Vận đơn không thuộc cửa hàng GHN đã cấu hình.', 403);
    if (typeof data.status !== 'string' || !/^[a-z_]{1,60}$/.test(data.status)) throw fail('Dữ liệu trạng thái GHN không hợp lệ.', 502);
    const weight = Number(data.weight), cod = Number(data.codAmount);
    if (!Number.isSafeInteger(weight) || weight < 1 || weight > 50000 || !Number.isSafeInteger(cod) || cod < 0 || cod > 50000000) throw fail('Dữ liệu kiện hàng hoặc COD GHN không hợp lệ.', 502);
    return { config, data, shopId, weight, cod };
  }

  async list(actor: string, input: unknown) {
    const query = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(50), search: z.string().max(200).default(''), status: z.string().max(500).default(''), sortBy: z.unknown().optional(), sortOrder: z.unknown().optional() }).parse(input);
    const principal = await ghnPrincipal(this.pool, actor);
    const search = query.search.trim().toLowerCase();
    const statuses = query.status.split(',').map((value) => value.trim()).filter((value) => value && value !== 'all').slice(0, 50);
    const order = buildGhnTrackingOrder(query.sortBy, query.sortOrder);
    const visible = ghnVisibleSql.replace(/\$(\d+)/g, (_, value) => `$${Number(value) + 2}`);
    const where = "($1='' or lower(coalesce(g.ghn_order_code,'')) like '%'||$1||'%' or lower(coalesce(g.internal_order_code,'')) like '%'||$1||'%' or lower(coalesce(g.customer_name,'')) like '%'||$1||'%' or lower(coalesce(g.customer_phone,'')) like '%'||$1||'%' or lower(coalesce(g.customer_address,'')) like '%'||$1||'%' or lower(coalesce(g.ghn_status,'')) like '%'||$1||'%' or lower(coalesce(g.ghn_status_text,'')) like '%'||$1||'%') and (cardinality($2::text[])=0 or g.ghn_status=any($2::text[]))";
    const values: unknown[] = [search, statuses, principal.role, principal.manager];
    const count = await this.pool.query(`select count(*)::int count from local_ghn_tracking g left join local_orders o on o.id=g.order_id where ${visible} and ${where}`, values);
    const rows = await this.pool.query(`${trackingSelect} where ${visible} and ${where} order by ${order.sql} limit $5 offset $6`, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
    return { rows: rows.rows.map(trackingPublic), total: Number(count.rows[0]?.count || 0), page: query.page, pageSize: query.pageSize, local_only: true };
  }

  async byOrder(actor: string, orderId: string) {
    const principal = await ghnPrincipal(this.pool, actor);
    await this.orderScope(this.pool, principal, z.string().min(1).max(100).parse(orderId));
    const rows = await this.pool.query(`${trackingSelect} where ${ghnVisibleSql} and g.order_id=$3 order by g.created_at,g.id`, [principal.role, principal.manager, orderId]);
    return { rows: rows.rows.map(trackingPublic), orderCodes: rows.rows.map((row) => String(row.ghn_order_code)), local_only: true };
  }

  async replaceOrderCodes(actor: string, orderId: string, input: unknown) {
    const body = z.object({ orderCodes: trackingCodes, expectedOrderCodes: trackingCodes }).strict().parse(input);
    const wanted = [...new Set(body.orderCodes.map((code) => code.trim()))].sort();
    const expected = [...new Set(body.expectedOrderCodes.map((code) => code.trim()))].sort();
    // Verify every previously unknown code before the transaction.  A failed
    // provider read therefore leaves the entire requested link set untouched.
    const known = await this.pool.query('select ghn_order_code from local_ghn_tracking where ghn_order_code=any($1::text[])', [wanted]);
    const knownCodes = new Set(known.rows.map((row) => String(row.ghn_order_code)));
    const newCodes = wanted.filter((code) => !knownCodes.has(code));
    const verifyConfig = newCodes.length ? await this.adapter.snapshot() : null;
    const verified = new Map<string, Awaited<ReturnType<GhnTrackingManagement['verifyProviderDetail']>>>();
    for (const code of newCodes) verified.set(code, await this.verifyProviderDetail(code, verifyConfig || undefined));
    const client = await this.pool.connect();
    try {
      const principal = await this.begin(client, actor);
      const order = await this.orderScope(client, principal, orderId, 'for update');
      if (verifyConfig) await this.lockConfig(client, verifyConfig);
      const existingRows = (await client.query(`${trackingSelect} where ${ghnVisibleSql} and g.order_id=$3 order by g.ghn_order_code for update of g`, [principal.role, principal.manager, order.id])).rows;
      const current = existingRows.map((row) => String(row.ghn_order_code)).sort();
      if (JSON.stringify(current) !== JSON.stringify(expected)) throw fail('Liên kết GHN đã thay đổi. Hãy tải lại trước khi lưu.', 409);
      if (JSON.stringify(current) === JSON.stringify(wanted)) { await client.query('commit'); return this.byOrder(actor, order.id); }
      const remove = existingRows.filter((row) => !wanted.includes(String(row.ghn_order_code)));
      const add = wanted.filter((code) => !current.includes(code));
      for (const row of remove) {
        // Detach, do not recreate or erase the carrier record and its metadata.
        await client.query(`update local_ghn_tracking set order_id=null,internal_order_code=null,manager_id=$2,tenant_id=$3,local_modified_at=now(),updated_at=now() where id=$1`, [row.id, order.manager, order.tenant]);
      }
      for (const code of add) {
        const any = (await client.query(`${trackingSelect} where g.ghn_order_code=$1 for update of g`, [code])).rows[0];
        if (any) {
          if (any.order_id && String(any.order_id) !== order.id) throw fail('Mã GHN đã liên kết với một đơn CRM khác.', 409);
          const visible = (await this.visibleRow(client, principal, String(any.id), 'id')).rows[0];
          if (!visible) throw fail('Mã GHN không nằm trong phạm vi quản lý.', 404);
          await client.query(`update local_ghn_tracking set order_id=$2,internal_order_code=$3,manager_id=$4,tenant_id=$5,local_modified_at=now(),updated_at=now() where id=$1`, [any.id, order.id, order.internal, order.manager, order.tenant]);
        } else {
          const detail = verified.get(code);
          if (!detail) throw fail('Mã GHN mới chưa được xác minh.', 409);
          const data = detail.data;
          await client.query(`insert into local_ghn_tracking(id,ghn_order_code,order_id,internal_order_code,customer_name,customer_phone,customer_address,package_weight,created_date,expected_delivery_date,delivered_date,cod_amount,ghn_status,ghn_status_text,tracking_url,raw_data,manager_id,tenant_id,is_snapshot_record,local_modified_at,last_updated_at,created_at,updated_at)
            values(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10::timestamptz,$11,$12,$13,$14,$15::jsonb,$16,$17,false,now(),now(),now(),now())`,
          [code, order.id, order.internal, String(data.customerName || '').slice(0, 500), data.customerPhone || null, data.customerAddress || null, detail.weight, normalizeGhnDate(data.createdDate), normalizeGhnDate(data.expectedDeliveryTime), normalizeGhnDate(data.deliveredDate), detail.cod, data.status, String(data.statusText || data.status).slice(0, 200), String(data.trackingUrl || ''), JSON.stringify({ shop_id: Number(detail.shopId), provider_verified_at: new Date().toISOString() }), order.manager, order.tenant]);
        }
      }
      await client.query(`insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason,after_data) values('ghn_tracking',$1,'REPLACE_ORDER_LINKS',$2,'Cập nhật liên kết mã GHN của đơn CRM',$3::jsonb)`, [order.id, actor, JSON.stringify({ added: add.length, detached: remove.length })]);
      await client.query('commit');
      return this.byOrder(actor, order.id);
    } catch (error) { await client.query('rollback').catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async import(actor: string, raw: unknown) {
    const body = z.object({ ghn_order_code: trackingCode, order_id: z.string().min(1).max(100).nullable().optional() }).strict().parse(raw);
    const principal = await ghnPrincipal(this.pool, actor);
    // Capture the target order before the provider read.  The commit path locks
    // and compares it again, so an ownership/tenant change cannot redirect a
    // verified shipment into a different CRM scope mid-request.
    const requestedOrder = body.order_id ? await this.orderScope(this.pool, principal, body.order_id) : null;
    const verified = await this.verifyProviderDetail(body.ghn_order_code);
    const { config, data, shopId, weight: verifiedWeight, cod: verifiedCod } = verified;
    const client = await this.pool.connect();
    try {
      const commitPrincipal = await this.begin(client, actor);
      const order = body.order_id ? await this.orderScope(client, commitPrincipal, body.order_id, 'for update') : null;
      if (requestedOrder && (!order || requestedOrder.manager !== order.manager || requestedOrder.tenant !== order.tenant || requestedOrder.internal !== order.internal)) {
        throw fail('Đơn CRM đã thay đổi trong lúc xác minh GHN. Hãy tải lại trước khi tiếp tục.', 409);
      }
      await this.lockConfig(client, config);
      const existing = (await client.query(`${trackingSelect} where g.ghn_order_code=$1 for update of g`, [body.ghn_order_code])).rows[0];
      const priorShop = String((existing?.raw_data as { shop_id?: unknown } | null)?.shop_id ?? '');
      if (priorShop && priorShop !== shopId) throw fail('Cửa hàng GHN khác dữ liệu đã xác minh trước đó.', 409);
      if (existing && existing.order_id && (!order || String(existing.order_id) !== order.id)) throw fail('Mã GHN đã liên kết với một đơn CRM khác.', 409);
      if (existing && !(await this.visibleRow(client, commitPrincipal, String(existing.id), 'id')).rows[0]) throw fail('Mã GHN không nằm trong phạm vi quản lý.', 404);
      const owner = order ? { manager: order.manager, tenant: order.tenant, internal: order.internal, orderId: order.id } : { manager: commitPrincipal.manager, tenant: 'local-tenant', internal: null, orderId: null };
      const values = [body.ghn_order_code, owner.orderId, owner.internal, String(data.customerName || '').slice(0, 500), data.customerPhone || null, data.customerAddress || null, verifiedWeight, normalizeGhnDate(data.createdDate), normalizeGhnDate(data.expectedDeliveryTime), normalizeGhnDate(data.deliveredDate), verifiedCod, data.status, String(data.statusText || data.status).slice(0, 200), String(data.trackingUrl || ''), JSON.stringify({ shop_id: Number(shopId), provider_verified_at: new Date().toISOString() }), owner.manager, owner.tenant];
      let row;
      if (existing) {
        row = (await client.query(`update local_ghn_tracking set order_id=coalesce($1::text,order_id),internal_order_code=case when $1::text is null then internal_order_code else $2::text end,customer_name=case when nullif(customer_name,'') is null then $3 else customer_name end,customer_phone=coalesce(customer_phone,$4),customer_address=coalesce(customer_address,$5),package_weight=coalesce(package_weight,$6),created_date=coalesce(created_date,$7::timestamptz),expected_delivery_date=coalesce(expected_delivery_date,$8::timestamptz),delivered_date=coalesce(delivered_date,$9::timestamptz),cod_amount=coalesce(cod_amount,$10),ghn_status=case when coalesce(ghn_status,'') in ('','local_only') then $11 else ghn_status end,ghn_status_text=case when coalesce(ghn_status_text,'') in ('','Chưa xác minh từ GHN') then $12 else ghn_status_text end,tracking_url=coalesce(nullif(tracking_url,''),$13),raw_data=coalesce(raw_data,$14::jsonb),manager_id=case when $1::text is null then coalesce(manager_id,$15) else $15 end,tenant_id=case when $1::text is null then coalesce(tenant_id,$16) else $16 end,local_modified_at=now(),updated_at=now() where id=$17 returning *`, [...values.slice(1), existing.id])).rows[0];
      } else {
        row = (await client.query(`insert into local_ghn_tracking(id,ghn_order_code,order_id,internal_order_code,customer_name,customer_phone,customer_address,package_weight,created_date,expected_delivery_date,delivered_date,cod_amount,ghn_status,ghn_status_text,tracking_url,raw_data,manager_id,tenant_id,is_snapshot_record,local_modified_at,last_updated_at,created_at,updated_at) values(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10::timestamptz,$11,$12,$13,$14,$15::jsonb,$16,$17,false,now(),now(),now(),now()) returning *`, values)).rows[0];
      }
      await client.query(`insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason,after_data) values('ghn_tracking',$1,'IMPORT_GHN_TRACKING',$2,'Xác minh và lưu mã vận đơn GHN',$3::jsonb)`, [row.id, actor, JSON.stringify({ order_id: owner.orderId, shop_id: shopId })]);
      await client.query('commit');
      return trackingPublic(row);
    } catch (error) { await client.query('rollback').catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  private async deleteRows(actor: string, selector: { id?: string; orderId?: string }) {
    const client = await this.pool.connect();
    try {
      const principal = await this.begin(client, actor);
      // Lock a linked parent before the tracking row.  All link writers use the
      // same source/tombstone -> order -> tracking order, which blocks a parent
      // ownership or tenant reassignment until this delete has rechecked scope.
      let lockedOrderId: string | null = null;
      if (selector.orderId) {
        lockedOrderId = (await this.orderScope(client, principal, selector.orderId, 'for update')).id;
      } else if (selector.id) {
        const target = (await this.visibleRow(client, principal, selector.id, 'id')).rows[0] as { order_id?: string | null } | undefined;
        if (!target) throw fail('Không tìm thấy vận đơn trong phạm vi quản lý.', 404);
        if (target.order_id) lockedOrderId = (await this.orderScope(client, principal, String(target.order_id), 'for update')).id;
      }
      const clause = selector.id ? 'g.id=$3' : 'g.order_id=$3';
      const value = selector.id || selector.orderId;
      const rows = (await client.query(`${trackingSelect} where ${ghnVisibleSql} and ${clause} order by g.id for update of g`, [principal.role, principal.manager, value])).rows;
      if (selector.id && !rows.length) throw fail('Không tìm thấy vận đơn trong phạm vi quản lý.', 404);
      if (selector.id && String(rows[0]?.order_id || '') !== String(lockedOrderId || '')) {
        throw fail('Liên kết vận đơn đã thay đổi. Hãy tải lại trước khi xóa.', 409);
      }
      for (const row of rows) await client.query(`insert into local_projection_tombstones(source_table,source_key,tombstone_kind) values('ghn_tracking',$1,'LOCAL') on conflict(source_table,source_key) do update set tombstone_kind='LOCAL',updated_at=now()`, [row.id]);
      if (rows.length) await client.query('delete from local_ghn_tracking where id=any($1::text[])', [rows.map((row) => row.id)]);
      await client.query(`insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason,after_data) values('ghn_tracking',$1,'DELETE_TRACKING',$2,'Xóa bản ghi theo dõi khỏi CRM cục bộ',$3::jsonb)`, [selector.id || selector.orderId!, actor, JSON.stringify({ count: rows.length })]);
      await client.query('commit');
      return { deleted: rows.length, ids: rows.map((row) => row.id), local_only: true };
    } catch (error) { await client.query('rollback').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
  remove(actor: string, id: string) { return this.deleteRows(actor, { id: z.string().min(1).max(100).parse(id) }); }
  removeByOrder(actor: string, orderId: string) { return this.deleteRows(actor, { orderId: z.string().min(1).max(100).parse(orderId) }); }

  async print(actor: string, raw: unknown) {
    const body = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(50) }).strict().parse(raw);
    const ids = [...new Set(body.ids)].sort();
    const principal = await ghnPrincipal(this.pool, actor);
    const rows = (await this.pool.query(`select g.*,o.manager_id as order_manager_id,o.tenant_id as order_tenant_id
      from local_ghn_tracking g left join local_orders o on o.id=g.order_id
      where ${ghnVisibleSql} and g.id=any($3::text[]) order by g.id`, [principal.role, principal.manager, ids])).rows;
    if (rows.length !== ids.length) throw fail('Có vận đơn không nằm trong phạm vi quản lý hoặc đã bị xóa.', 404);
    const config = await this.adapter.snapshot();
    if (!config.configured || config.mode === 'DISABLED') throw fail('GHN chưa được cấu hình hoặc đã tắt.', 503);
    const groups = new Map<string, string[]>();
    const groupIds = new Map<string, string[]>();
    const nullable = (value: unknown) => value === null || value === undefined ? null : String(value);
    const expected = new Map<string, { code: string; shopId: string; savedShopId: string | null; orderId: string | null; managerId: string | null; tenantId: string | null; orderManagerId: string | null; orderTenantId: string | null }>();
    for (const row of rows) {
      const savedShopId = nullable((row.raw_data as { shop_id?: unknown } | null)?.shop_id);
      let shopId = savedShopId || '';
      // Legacy rows can predate the saved shop proof. Verify their exact stored
      // code before printing; no arbitrary client code is ever sent to GHN.
      if (!shopId) {
        const detail = await this.adapter.ghn({ action: 'track', orderCode: String(row.ghn_order_code) }, config);
        const rawData = detail.success ? (detail.data as Record<string, unknown> | undefined)?.rawData as Record<string, unknown> | undefined : undefined;
        if (!detail.success || !detail.data || String((detail.data as Record<string, unknown>).orderCode) !== String(row.ghn_order_code)) throw fail('Không xác minh được vận đơn cũ trước khi in.', 502);
        shopId = String(rawData?.shop_id || '');
      }
      if (!config.shops.includes(shopId)) throw fail('Cửa hàng của vận đơn không còn được phép in.', 409);
      groups.set(shopId, [...(groups.get(shopId) || []), String(row.ghn_order_code)]);
      groupIds.set(shopId, [...(groupIds.get(shopId) || []), String(row.id)]);
      expected.set(String(row.id), {
        code: String(row.ghn_order_code), shopId, savedShopId,
        orderId: nullable(row.order_id), managerId: nullable(row.manager_id), tenantId: nullable(row.tenant_id),
        orderManagerId: nullable(row.order_manager_id), orderTenantId: nullable(row.order_tenant_id),
      });
    }
    const documents: Array<{ shopId: string; orderCodes: string[]; printUrl: string }> = [];
    for (const [shopId, orderCodes] of groups) {
      let response: Response;
      try {
        response = await this.fetcher('https://online-gateway.ghn.vn/shiip/public-api/v2/a5/gen-token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', Token: config.token, ShopId: shopId }, body: JSON.stringify({ order_codes: orderCodes }) });
        const reader = response.body?.getReader(); if (!reader) throw new Error('empty');
        let bytes = 0; let text = ''; const decoder = new TextDecoder();
        try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 2_000_000) { await reader.cancel(); throw new Error('oversize'); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); }
        const envelope = z.object({ code: z.literal(200), data: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{8,2048}$/) }) }).passthrough().parse(JSON.parse(text));
        if (!response.ok) throw new Error('provider');
        const fresh = await this.adapter.snapshot();
        if (!fresh.configured || fresh.mode === 'DISABLED' || fresh.revision !== config.revision || fresh.token !== config.token || !fresh.shops.includes(shopId)) throw fail('Cấu hình GHN đã thay đổi trong lúc tạo phiếu in. Hãy thử lại.', 409);
        const client = await this.pool.connect();
        try {
          const freshPrincipal = await this.begin(client, actor);
          await this.lockConfig(client, fresh);
          const stillVisible = await client.query(`${trackingSelect} where ${ghnVisibleSql} and g.id=any($3::text[])`, [freshPrincipal.role, freshPrincipal.manager, groupIds.get(shopId) || []]);
          if (stillVisible.rows.length !== orderCodes.length) throw fail('Phạm vi vận đơn đã thay đổi trong lúc tạo phiếu in. Hãy tải lại.', 409);
          await client.query('commit');
        } catch (error) { await client.query('rollback').catch(() => undefined); throw error; }
        finally { client.release(); }
        documents.push({ shopId, orderCodes, printUrl: 'https://online-gateway.ghn.vn/a5/public-api/printA5?token=' + encodeURIComponent(envelope.data.token) });
      } catch (error) { if (error instanceof Error && 'status' in error) throw error; throw fail('Chưa lấy được phiếu in A5 từ GHN. Vận đơn vẫn được lưu; hãy thử lại.', 502); }
    }
    // A group can be valid when its token is generated and still be revoked
    // while another shop is pending.  Recheck every original row together only
    // after all provider I/O; this final transaction never performs network I/O.
    const finalConfig = await this.adapter.snapshot();
    const sameConfig = finalConfig.configured === config.configured
      && finalConfig.source === config.source && finalConfig.mode === config.mode
      && finalConfig.revision === config.revision && finalConfig.token === config.token
      && finalConfig.primaryShop === config.primaryShop
      && finalConfig.shops.length === config.shops.length
      && finalConfig.shops.every((shop, index) => shop === config.shops[index]);
    if (!sameConfig || !finalConfig.configured || finalConfig.mode === 'DISABLED') {
      throw fail('Cấu hình GHN đã thay đổi trong lúc tạo phiếu in. Hãy thử lại.', 409);
    }
    const client = await this.pool.connect();
    try {
      const freshPrincipal = await this.begin(client, actor);
      await this.lockConfig(client, finalConfig);
      const orderIds = [...new Set([...expected.values()].map(row => row.orderId).filter((id): id is string => Boolean(id)))];
      if (orderIds.length) {
        const lockedOrders = await client.query(`select o.id from local_orders o where o.id=any($1::text[])
          and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=o.id) for share`, [orderIds]);
        if (lockedOrders.rows.length !== orderIds.length) throw fail('Đơn CRM đã thay đổi trong lúc tạo phiếu in. Hãy tải lại.', 409);
      }
      const finalRows = await client.query(`select g.*,o.manager_id as order_manager_id,o.tenant_id as order_tenant_id
        from local_ghn_tracking g left join local_orders o on o.id=g.order_id
        where ${ghnVisibleSql} and g.id=any($3::text[]) order by g.id for update of g`, [freshPrincipal.role, freshPrincipal.manager, ids]);
      if (finalRows.rows.length !== ids.length) throw fail('Phạm vi vận đơn đã thay đổi trong lúc tạo phiếu in. Hãy tải lại.', 409);
      for (const row of finalRows.rows) {
        const prior = expected.get(String(row.id));
        const finalSavedShopId = nullable((row.raw_data as { shop_id?: unknown } | null)?.shop_id);
        if (!prior || String(row.ghn_order_code) !== prior.code || finalSavedShopId !== prior.savedShopId
          || nullable(row.order_id) !== prior.orderId || nullable(row.manager_id) !== prior.managerId || nullable(row.tenant_id) !== prior.tenantId
          || nullable(row.order_manager_id) !== prior.orderManagerId || nullable(row.order_tenant_id) !== prior.orderTenantId
          || (finalSavedShopId !== null && finalSavedShopId !== prior.shopId)) {
          throw fail('Vận đơn hoặc phạm vi quản lý đã thay đổi trong lúc tạo phiếu in. Hãy tải lại.', 409);
        }
      }
      await client.query('commit');
    } catch (error) { await client.query('rollback').catch(() => undefined); throw error; }
    finally { client.release(); }
    return { success: true, data: { documents } };
  }
}

export function registerGhnTrackingManagement(app: express.Express, service: GhnTrackingManagement, actor: () => string, sendError: (res: express.Response, error: unknown) => void) {
  app.get('/api/ghn-tracking', async (req, res) => { try { res.setHeader('Cache-Control', 'no-store'); res.json(await service.list(actor(), req.query)); } catch (error) { sendError(res, error); } });
  app.get('/api/ghn-tracking/by-order/:orderId', async (req, res) => { try { res.setHeader('Cache-Control', 'no-store'); res.json(await service.byOrder(actor(), req.params.orderId)); } catch (error) { sendError(res, error); } });
  app.put('/api/ghn-tracking/by-order/:orderId', async (req, res) => { try { res.json(await service.replaceOrderCodes(actor(), req.params.orderId, req.body)); } catch (error) { sendError(res, error); } });
  app.post('/api/ghn-tracking', async (req, res) => { try { res.status(201).json(await service.import(actor(), req.body)); } catch (error) { sendError(res, error); } });
  app.post('/api/ghn-tracking/print', async (req, res) => { try { res.setHeader('Cache-Control', 'no-store'); res.json(await service.print(actor(), req.body)); } catch (error) { sendError(res, error); } });
  app.delete('/api/ghn-tracking/by-order/:orderId', async (req, res) => { try { res.json(await service.removeByOrder(actor(), req.params.orderId)); } catch (error) { sendError(res, error); } });
  app.delete('/api/ghn-tracking/:id', async (req, res) => { try { res.json(await service.remove(actor(), req.params.id)); } catch (error) { sendError(res, error); } });
}

export function registerGhnTracking(app: express.Express, pool: Pool, adapter: ExternalReadAdapters, actor: () => string, sendError: (res: express.Response, error: unknown) => void) {
  const service = new GhnTrackingRefresh(pool, adapter);
  app.post('/api/ghn-tracking/connection-check', async (_req, res) => {
    try { res.setHeader('Cache-Control', 'no-store'); res.json(await service.connection(actor())); }
    catch (error) { sendError(res, error); }
  });
  app.post('/api/ghn-tracking/refresh', async (req, res) => {
    try { res.json(await service.refresh(actor(), req.body)); }
    catch (error) { if (error instanceof z.ZodError) return res.status(400).json({ message: 'Tham số cập nhật GHN không hợp lệ.' }); sendError(res, error); }
  });
}
