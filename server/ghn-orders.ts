import { readGhnNewDirectory } from './ghn-new-address.js';
import { readGhnProviderJson } from './ghn-provider-json.js';
import type express from 'express';
import type { Pool, PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ExternalReadAdapters, type GhnRuntimeConfig } from './external-read-adapters.js';
import { ghnPrincipal, normalizeGhnDate } from './ghn-tracking.js';
import { extractGhnOrderNumber } from './ghn-order-number.js';
import { assertZcrmOrderExecutable } from './zcrm-commerce.js';

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const integer = (max: number, min = 0) => z.number().int().min(min).max(max);
export const GHN_PACKED_PARCEL_NAME = 'Kiện hàng đã đóng gói';
const item = z.object({ name: z.string().trim().min(1).max(200), quantity: integer(1000,1), weight: integer(50000,1), length: integer(200,1), width: integer(200,1), height: integer(200,1), price: integer(50000000).default(0) }).strict();
const payload = z.object({
  to_name: z.string().trim().min(1).max(100), to_phone: z.string().trim().regex(/^(?:0\d{9}|\+84\d{9})$/),
  to_address: z.string().trim().min(3).max(500), to_district_id: integer(99999999,1).optional(), to_ward_code: z.string().regex(/^[A-Za-z0-9_-]{1,30}$/).optional(),
  // Aggregate of up to 100 measured parcels; each item's existing bound is 50 kg.
  weight: integer(5000000,1), length: integer(200,1).optional(), width: integer(200,1).optional(), height: integer(200,1).optional(),
  cod_amount: integer(50000000), insurance_value: integer(5000000), cod_failed_amount: integer(50000000).default(0),
  note: z.string().trim().max(1000).default(''), required_note: z.enum(['KHONGCHOXEMHANG','CHOXEMHANGKHONGTHU','CHOTHUHANG']),
  content: z.string().trim().min(1).max(2000), payment_type_id: z.union([z.literal(1),z.literal(2)]),
  service_type_id: z.union([z.literal(2),z.literal(5)]), service_id: integer(99999999,1).optional(), items: z.array(item).min(1).max(100),
}).strict();
const createSchema = z.object({ idempotencyKey: z.string().uuid(), shopId: z.string().regex(/^[1-9]\d{0,15}$/),
  orderId: z.string().min(1).max(100).nullable().default(null), orderNumber: z.string().trim().max(100).default(''),
  provinceId: integer(99999999,1), addressMode:z.literal('NEW2').optional(), newWardId:integer(99999999,1).optional(), orderData: payload,
  // Optional metadata has no defaults/transforms: historical request hashes stay unchanged.
  productLines: z.array(z.object({ name: z.string().min(1).max(200), quantity: integer(1000,1), weight: integer(50000,1).optional(), code: z.string().min(1).max(100).optional() }).strict()).min(1).max(100).optional(),
}).strict();
type Input = z.infer<typeof createSchema>;

export const validateGhnProductLines = (input: Pick<Input, 'productLines' | 'orderData'>) => {
  if (input.productLines === undefined) return;
  if (input.productLines.some(row => !row.name.trim() || row.code !== undefined && !row.code.trim())) throw fail('Thông tin sản phẩm không hợp lệ.');
  const content = input.productLines.map(row => `${row.name.trim()}${row.code?.trim() ? ` [${row.code.trim()}]` : ''} × ${row.quantity}`).join(', ');
  if (content.length > 2000 || input.orderData.content !== content) throw fail('Nội dung vận đơn không khớp danh sách sản phẩm đã khai.');
};
type Attempt = { id:string; actor_id:string; manager_id:string; tenant_id:string; order_id:string|null; scope_key:string; shop_id:string; config_revision:number; idempotency_key:string; payload_hash:string; client_order_code:string; status:string; order_code:string|null; request_data:Input; result_data:Record<string,unknown> };
type Queryable = Pool | PoolClient;
type ProviderEnvelope = {code:number;message?:string;code_message?:string;data:Record<string,unknown>};
const scopeKey = (orderId: string|null) => orderId ? 'order:'+orderId : 'standalone';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const publicAttempt = (row: Attempt) => ({ success: true, data: { attempt_status: row.status, reference: row.client_order_code, request_key: row.idempotency_key, ...(row.order_code ? {order_code:row.order_code} : {}), ...row.result_data } });
export const ghnPackedParcelItemName = (content: string, index = 0, count = 1) => {
  if (count > 1) content = `Kiện ${index + 1}/${count}: ${index === 0 ? content : 'Cùng đơn hàng'}`;
  if (content.length <= 200) return content;
  let prefix = content.slice(0, 199);
  if (/^[\uD800-\uDBFF]$/.test(prefix.charAt(prefix.length - 1))) prefix = prefix.slice(0, -1);
  return `${prefix}…`;
};
export const validateGhnPackedParcel = (orderData: Input['orderData']) => {
  const count = orderData.items.length;
  if (count < 1 || count > 100) throw fail('Mỗi vận đơn GHN có từ 1 đến 100 kiện.', 400);
  orderData.items.forEach((parcel, index) => {
    if (parcel.name !== ghnPackedParcelItemName(orderData.content, index, count) || parcel.quantity !== 1 || parcel.price !== 0) throw fail('Mỗi kiện GHN phải có đúng nội dung hàng gửi và số lượng một.', 400);
  });
  if (orderData.items.reduce((sum, parcel) => sum + parcel.weight, 0) !== orderData.weight) throw fail('Tổng cân nặng các kiện không khớp cân nặng vận đơn.', 400);
  if (count === 1) {
    const parcel = orderData.items[0];
    if (parcel.length !== orderData.length || parcel.width !== orderData.width || parcel.height !== orderData.height) throw fail('Thông số kiện GHN không khớp kích thước đã đo.', 400);
  } else if (['length', 'width', 'height'].some(field => orderData[field as 'length' | 'width' | 'height'] !== undefined)) throw fail('Vận đơn nhiều kiện sử dụng kích thước riêng của từng kiện.', 400);
  const expectedServiceType = count > 1 || orderData.weight >= 20000 ? 5 : 2;
  if (orderData.service_type_id !== expectedServiceType) throw fail('Loại dịch vụ GHN không phù hợp với tổng cân nặng hoặc số kiện.', 400);
};

/** Missing or different parcel evidence must never resolve an uncertain create. */
export const ghnMultiParcelEvidenceMatches = (submitted: Input['orderData'], value: unknown): boolean => {
  if (submitted.items.length <= 1) return true; // Historical single-parcel reconciliation is unchanged.
  if (!Array.isArray(value) || value.length !== submitted.items.length) return false;
  const signature = (row: Record<string, unknown>) => {
    if (typeof row.name !== 'string' || !['quantity', 'weight', 'length', 'width', 'height'].every(field => typeof row[field] === 'number' && Number.isSafeInteger(row[field]) && Number(row[field]) > 0)) return null;
    return JSON.stringify([row.name, row.quantity, row.weight, row.length, row.width, row.height]);
  };
  const actual = value.map(row => row && typeof row === 'object' && !Array.isArray(row) ? signature(row) : null);
  if (actual.some(row => row === null)) return false;
  return JSON.stringify(actual.sort()) === JSON.stringify(submitted.items.map(row => signature(row)).sort());
};

export class GhnOrders {
  constructor(private pool: Pool, private adapter: ExternalReadAdapters, private fetcher: typeof fetch = fetch) {}
  private async lockSource(client:PoolClient,orderId:string|null) {
    await client.query("set local lock_timeout='5s'");
    await client.query("select pg_advisory_xact_lock_shared(hashtextextended('production-source-sync',0))");
    await client.query('lock table local_projection_tombstones in share mode');
    if(orderId) await client.query('select id from local_orders where id=$1 for share',[orderId]);
  }
  private async lockActor(client:PoolClient,actor:string) {
    await client.query('select user_id from local_user_profiles where user_id=$1 for share',[actor]);
    await client.query('select user_id from local_user_roles where user_id=$1 order by role for share',[actor]);
    await client.query("select user_id from local_employee_permissions where user_id=$1 and permission_type in ('ghn_tracking','orders') order by permission_type for share",[actor]);
  }
  private async scope(db: Queryable, actor: string, orderId: string|null, eligible=false) {
    if (!actor || actor === 'local-admin' || actor.startsWith('demo')) throw fail('Cần đăng nhập bằng tài khoản thật để tạo đơn GHN.',403);
    const principal = await ghnPrincipal(db,actor);
    if (!orderId) return { manager:principal.manager, tenant:'local-tenant' };
    const order = (await db.query(`select id,manager_id,tenant_id,status from local_orders o where id=$1
      and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=o.id)`,[orderId])).rows[0];
    if (!order || (principal.role !== 'admin' && order.manager_id !== principal.manager)) throw fail('Không tìm thấy đơn hàng trong phạm vi quản lý.',404);
    if (!order.manager_id || !order.tenant_id) throw fail('Đơn hàng thiếu phạm vi quản lý hoặc đơn vị. Cần kiểm tra trước khi tạo GHN.',409);
    if (eligible && !['confirmed','processing','shipped','partially_delivered','delivering'].includes(String(order.status))) throw fail('Trạng thái đơn hàng chưa phù hợp để tạo vận đơn GHN.',409);
    if (eligible) await assertZcrmOrderExecutable(db,orderId);
    return {manager:String(order.manager_id),tenant:String(order.tenant_id)};
  }
  private async read(actor: string,key:string) {
    const row = (await this.pool.query<Attempt>('select * from integration_private.ghn_order_attempts where actor_id=$1 and idempotency_key=$2',[actor,key])).rows[0];
    if (!row) throw fail('Không tìm thấy lượt tạo vận đơn.',404);
    const scope = await this.scope(this.pool,actor,row.order_id);
    if (scope.manager !== row.manager_id || scope.tenant !== row.tenant_id) throw fail('Phạm vi đơn hàng đã thay đổi. Cần quản trị viên kiểm tra lượt tạo.',409);
    return row;
  }
  async recent(actor:string,orderId:string|null) {
    await this.scope(this.pool,actor,orderId);
    const row = (await this.pool.query<Attempt>(`select * from integration_private.ghn_order_attempts where actor_id=$1 and scope_key=$2 order by created_at desc limit 1`,[actor,scopeKey(orderId)])).rows[0];
    return row ? this.status(actor,row.idempotency_key) : {success:true,data:null};
  }
  private async config() {
    const config = await this.adapter.snapshot();
    if (!config.configured || config.mode === 'DISABLED') throw fail('GHN chưa được cấu hình hoặc đã tắt. Mở Cài đặt API để kiểm tra.',503);
    return config;
  }
  private async validate(input:Input,config:GhnRuntimeConfig) {
    const sender = await this.adapter.sender(config,input.shopId);
    const read = async(action:string,body:Record<string,unknown> = {}) => {
      const result = await this.adapter.ghn({action,...body},config);
      if (!result.success || !Array.isArray(result.data)) throw fail('Không xác minh được địa chỉ hoặc dịch vụ GHN.',502);
      return result.data as Record<string,unknown>[];
    };
    if(input.addressMode==='NEW2') {
      if(input.orderData.to_district_id!==undefined||input.orderData.to_ward_code!==undefined||input.orderData.service_id!==undefined)throw fail('Không trộn mã địa chỉ cũ vào địa chỉ mới.');
      const province=(await readGhnNewDirectory(config,this.fetcher)).find(row=>row._id===input.provinceId);
      const ward=(await readGhnNewDirectory(config,this.fetcher,input.provinceId)).find(row=>row._id===input.newWardId&&row.parent_id===input.provinceId);
      if(!province||!ward)throw fail('Tỉnh và phường/xã mới GHN không khớp.');
      validateGhnPackedParcel(input.orderData);
      return {...input.orderData,to_province_name:province.name,to_ward_name:ward.name,to_district_name:'',is_new_to_address:true};
    }
    if(input.newWardId!==undefined||!input.orderData.to_district_id||!input.orderData.to_ward_code||!input.orderData.service_id)throw fail('Chọn đủ địa chỉ và dịch vụ GHN cũ.');
    const province = (await read('get_provinces')).find(row => row.ProvinceID === input.provinceId);
    const district = (await read('get_districts',{provinceId:input.provinceId})).find(row => row.DistrictID === input.orderData.to_district_id);
    const ward = (await read('get_wards',{districtId:input.orderData.to_district_id})).find(row => String(row.WardCode) === input.orderData.to_ward_code);
    if (!province || !district || !ward) throw fail('Tỉnh, quận và phường GHN không khớp nhau. Hãy chọn lại địa chỉ.');
    const service = (await read('get_services',{shopId:sender.id,toDistrictId:input.orderData.to_district_id})).find(row => row.service_id === input.orderData.service_id && row.service_type_id === input.orderData.service_type_id);
    if (!service) throw fail('Dịch vụ GHN không còn phù hợp với cửa hàng và địa chỉ đã chọn.');
    validateGhnPackedParcel(input.orderData);
    const originWard = sender.metadata.ward_code;
    return { ...input.orderData, to_province_name:String(province.ProvinceName), to_district_name:String(district.DistrictName), to_ward_name:String(ward.WardName), is_new_to_address:false, from_district_id:sender.district, ...(typeof originWard==='string'&&/^[\w-]{1,30}$/.test(originWard)?{from_ward_code:originWard}:{}) };
  }
  async preview(actor:string,raw:unknown) {
    const input=createSchema.parse(raw);if(input.addressMode!=='NEW2')throw fail('Xem trước địa chỉ mới yêu cầu hệ hai cấp.');
    await this.scope(this.pool,actor,input.orderId,true);validateGhnProductLines(input);validateGhnPackedParcel(input.orderData);
    const config=await this.config(),body=await this.validate(input,config);
    const response=await this.fetcher('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/preview',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Token:config.token,ShopId:input.shopId},body:JSON.stringify(body)});
    const result=await readGhnProviderJson(response),data=result.data as Record<string,unknown>|undefined;
    if(!response.ok||result.code!==200||!data||data.order_code!==''||typeof data.total_fee!=='number'||!Number.isSafeInteger(data.total_fee)||data.total_fee<0)throw fail('GHN chưa xác nhận được cước cho địa chỉ mới.',502);
    const current=await this.config();await this.scope(this.pool,actor,input.orderId,true);if(current.revision!==config.revision||current.token!==config.token||!current.shops.includes(input.shopId))throw fail('Cấu hình đã thay đổi khi xem trước.',409);
    return {total:data.total_fee};
  }
  async create(actor:string,raw:unknown) {
    const input = createSchema.parse(raw);
    const scope = await this.scope(this.pool,actor,input.orderId);
    const fingerprint = hash(input);
    const existing = (await this.pool.query<Attempt>('select * from integration_private.ghn_order_attempts where actor_id=$1 and idempotency_key=$2',[actor,input.idempotencyKey])).rows[0];
    if (existing) {
      if (existing.payload_hash !== fingerprint) throw fail('Lượt này đã gửi nội dung khác. Kiểm tra trạng thái trước khi tạo đơn mới.',409);
      return this.status(actor,input.idempotencyKey);
    }
    // Keep historical replays above this point. New requests must carry the
    // complete measured parcel manifest before provider discovery or dispatch.
    validateGhnProductLines(input);
    validateGhnPackedParcel(input.orderData);
    await this.scope(this.pool,actor,input.orderId,true);
    const config = await this.config();
    const providerBody = await this.validate(input,config);
    const id = randomUUID(), reference = 'JF'+id.replaceAll('-','');
    const client = await this.pool.connect();
    let row:Attempt;
    try {
      await client.query('begin');
      await this.lockSource(client,input.orderId);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[actor+':ghn:'+scopeKey(input.orderId)]);
      await this.lockActor(client,actor);
      const currentScope = await this.scope(client,actor,input.orderId,true);
      if (currentScope.manager !== scope.manager || currentScope.tenant !== scope.tenant) throw fail('Phạm vi đơn hàng đã thay đổi.',409);
      const duplicate = (await client.query<Attempt>('select * from integration_private.ghn_order_attempts where actor_id=$1 and idempotency_key=$2',[actor,input.idempotencyKey])).rows[0];
      if (duplicate) {
        if (duplicate.payload_hash !== fingerprint) throw fail('Lượt này đã gửi nội dung khác.',409);
        await client.query('commit');
        return this.status(actor,input.idempotencyKey);
      }
      const unresolved = (await client.query('select 1 from integration_private.ghn_order_attempts where actor_id=$1 and scope_key=$2 and status in (\'IN_FLIGHT\',\'UNKNOWN\',\'REMOTE_CREATED\')',[actor,scopeKey(input.orderId)])).rows[0];
      if (unresolved) throw fail('Có lượt tạo chưa xác định kết quả. Hãy tải lại trạng thái và đối soát trước khi tạo mới.',409);
      row = (await client.query<Attempt>(`insert into integration_private.ghn_order_attempts
        (id,actor_id,manager_id,tenant_id,order_id,scope_key,shop_id,config_revision,idempotency_key,payload_hash,client_order_code,status,request_data)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'IN_FLIGHT',$12::jsonb) returning *`,
      [id,actor,scope.manager,scope.tenant,input.orderId,scopeKey(input.orderId),input.shopId,config.revision,input.idempotencyKey,fingerprint,reference,JSON.stringify(input)])).rows[0];
      await client.query('commit');
    } catch(error) {await client.query('rollback').catch(()=>undefined);throw error;} finally {client.release();}
    // No network occurs inside a transaction. Once reserved, even a process crash
    // leaves IN_FLIGHT blocked: a missing response must never cause a second create.
    let result:ProviderEnvelope;
    let sent=false;
    try {
      const fresh = await this.config();
      if (fresh.revision !== config.revision || fresh.token !== config.token || !fresh.shops.includes(input.shopId)) throw fail('Cấu hình GHN đã thay đổi trước khi gửi.',409);
      sent=true;
      const response = await this.fetcher('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Token:fresh.token,ShopId:input.shopId},
        body:JSON.stringify({...providerBody,client_order_code:reference,pick_station_id:0}),
      });
      const text = await response.text();
      if (text.length>2000000) throw new Error('oversize');
      result = JSON.parse(text);
      if (result.code !== 200) {
        // Only a structured GHN rejection is definitive. HTTP/proxy/network and
        // malformed responses remain UNKNOWN, regardless of apparent failure.
        if (response.status>=500 || !Number.isInteger(result.code) || result.code < 400 || result.code>499 || typeof result.message !== 'string') throw new Error('ambiguous');
        const messages:Record<string,string>={PHONE_INVALID:'Số điện thoại người nhận không hợp lệ.',ROUTE_NOT_FOUND_SERVICE:'Dịch vụ không hỗ trợ tuyến đã chọn.',CLIENT_NOT_OWNER_OF_SHOP:'Khóa GHN không có quyền với cửa hàng đã chọn.'};
        const rejected={message:messages[String(result.code_message)]||'GHN từ chối thông tin đơn hàng. Kiểm tra người nhận, địa chỉ, kiện hàng và dịch vụ.'};
        await this.pool.query("update integration_private.ghn_order_attempts set status='REJECTED',result_data=$2::jsonb,updated_at=now() where id=$1 and status='IN_FLIGHT'",[id,JSON.stringify(rejected)]);
        return publicAttempt({...row,status:'REJECTED',result_data:rejected});
      }
      if (!response.ok || typeof result.data?.order_code!=='string' || !/^[A-Za-z0-9_-]{3,60}$/.test(result.data.order_code)) throw new Error('ambiguous');
      const safeResult = this.safeResult(result.data);
      const saved = await this.pool.query<Attempt>(`update integration_private.ghn_order_attempts set status='REMOTE_CREATED',order_code=$2,result_data=$3::jsonb,updated_at=now() where id=$1 and status in ('IN_FLIGHT','UNKNOWN') returning *`,[id,result.data.order_code,JSON.stringify(safeResult)]);
      if (!saved.rows[0]) throw new Error('evidence');
      row = saved.rows[0];
    } catch {
      if(!sent) {
        const rejected={message:'Cấu hình GHN đã thay đổi trước khi gửi. Chưa gửi yêu cầu tạo vận đơn.'};
        await this.pool.query("update integration_private.ghn_order_attempts set status='REJECTED',result_data=$2::jsonb,updated_at=now() where id=$1 and status='IN_FLIGHT'",[id,JSON.stringify(rejected)]);
        return publicAttempt({...row,status:'REJECTED',result_data:rejected});
      }
      await this.pool.query("update integration_private.ghn_order_attempts set status='UNKNOWN',updated_at=now() where id=$1 and status='IN_FLIGHT'",[id]).catch(()=>undefined);
      const current=(await this.pool.query<Attempt>('select * from integration_private.ghn_order_attempts where id=$1',[id]).catch(()=>({rows:[]}))).rows[0];
      if(current && ['SUCCESS','REMOTE_CREATED'].includes(current.status)) return current.status==='REMOTE_CREATED'?this.finalize(current):publicAttempt(current);
      // Do not echo a code that could not be recorded. Status/reconciliation uses
      // the durable reference to recover without ever posting create again.
      return {success:true,data:{attempt_status:'UNKNOWN',reference,request_key:input.idempotencyKey}};
    }
    return this.finalize(row);
  }
  private safeResult(data:Record<string,unknown>) {
    const result:Record<string,unknown> = {};
    if (typeof data.total_fee==='number' && Number.isSafeInteger(data.total_fee) && data.total_fee>=0) result.total_fee=data.total_fee;
    const expected = normalizeGhnDate(data.expected_delivery_time);
    if (expected) result.expected_delivery_time=expected;
    return result;
  }
  private async finalize(row:Attempt) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await this.lockSource(client,row.order_id);
      const locked = (await client.query<Attempt>('select * from integration_private.ghn_order_attempts where id=$1 for update',[row.id])).rows[0];
      if (locked.status === 'SUCCESS') {await client.query('commit');return publicAttempt(locked);}
      await this.lockActor(client,row.actor_id);
      // Provider acceptance is a fact even if the CRM order became terminal.
      // Recheck current authorization/ownership; new-create eligibility was
      // checked before dispatch and must not prevent recording accepted evidence.
      const scope = await this.scope(client,row.actor_id,row.order_id);
      if(scope.manager!==row.manager_id || scope.tenant!==row.tenant_id) throw fail('Phạm vi đơn hàng đã thay đổi.',409);
      if (locked.status!=='REMOTE_CREATED' || !locked.order_code) throw fail('Lượt tạo chưa được xác minh.',409);
      const input=locked.request_data, data=input.orderData;
      await client.query(`insert into local_ghn_tracking
        (id,ghn_order_code,internal_order_code,order_id,customer_name,customer_phone,customer_address,package_weight,created_date,expected_delivery_date,cod_amount,ghn_status,ghn_status_text,tracking_url,raw_data,manager_id,tenant_id,is_snapshot_record,local_modified_at,last_updated_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,now(),$9::timestamptz,$10,'ready_to_pick','Chờ lấy hàng',$11,$12::jsonb,$13,$14,false,now(),now())`,
      [locked.id,locked.order_code,extractGhnOrderNumber(data.to_name),locked.order_id,data.to_name,data.to_phone,data.to_address,data.weight,locked.result_data.expected_delivery_time||null,data.cod_amount,
        'https://donhang.ghn.vn/?order_code='+encodeURIComponent(locked.order_code),JSON.stringify({shop_id:Number(locked.shop_id),client_order_code:locked.client_order_code}),locked.manager_id,locked.tenant_id]);
      await client.query(`insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason,after_data)
        values('ghn_order_attempt',$1,'CREATE_GHN_ORDER',$2,'Tạo vận đơn GHN; không thay đổi tài chính, kho hoặc trạng thái đơn CRM',$3::jsonb)`,[locked.id,locked.actor_id,JSON.stringify({reference:locked.client_order_code,order_code:locked.order_code,shop_id:locked.shop_id})]);
      row=(await client.query<Attempt>("update integration_private.ghn_order_attempts set status='SUCCESS',updated_at=now() where id=$1 returning *",[locked.id])).rows[0];
      await client.query('commit');
      return publicAttempt(row);
    } catch { await client.query('rollback').catch(()=>undefined);return publicAttempt({...row,status:'REMOTE_CREATED'}); }
    finally {client.release();}
  }
  async status(actor:string,key:string,reconcile=false) {
    z.string().uuid().parse(key);
    let row=await this.read(actor,key);
    if (row.status==='REMOTE_CREATED') return this.finalize(row);
    if (reconcile && ['UNKNOWN','IN_FLIGHT'].includes(row.status)) {
      const config=await this.config();
      if (!config.shops.includes(row.shop_id)) throw fail('Cửa hàng của lượt tạo không còn được phép. Cần quản trị viên kiểm tra.',409);
      try {
        const response=await this.fetcher('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail-by-client-code?client_order_code='+encodeURIComponent(row.client_order_code),{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Token:config.token,ShopId:row.shop_id}});
        const text=await response.text(); if(text.length>2000000) throw new Error();
        const result=JSON.parse(text), data=result.data;
        const submitted=row.request_data.orderData;
        const failedCodMatches=data && (data.cod_failed_amount === undefined ? submitted.cod_failed_amount === 0 : typeof data.cod_failed_amount === 'number' && Number.isSafeInteger(data.cod_failed_amount) && data.cod_failed_amount === submitted.cod_failed_amount);
        const physicalFields = submitted.items.length > 1 ? ['to_district_id','weight','cod_amount','insurance_value','service_type_id','payment_type_id'] : ['to_district_id','weight','length','width','height','cod_amount','insurance_value','service_type_id','payment_type_id'];
        const newAddressMatches=row.request_data.addressMode!=='NEW2'||data?.is_new_to_address===true&&data.to_province_name===(await readGhnNewDirectory(config,this.fetcher)).find(value=>value._id===row.request_data.provinceId)?.name&&data.to_ward_name===(await readGhnNewDirectory(config,this.fetcher,row.request_data.provinceId)).find(value=>value._id===row.request_data.newWardId)?.name;
        const same=data && newAddressMatches && failedCodMatches && ghnMultiParcelEvidenceMatches(submitted, data.items) && (row.request_data.addressMode==='NEW2'?['to_name','to_phone','to_address']:['to_name','to_phone','to_address','to_ward_code']).every(field=>String(data[field])===String(submitted[field as keyof typeof submitted])) && physicalFields.filter(field=>row.request_data.addressMode!=='NEW2'||field!=='to_district_id').every(field=>Number(data[field])===Number(submitted[field as keyof typeof submitted]));
        if (response.ok && result.code===200 && same && String(data.shop_id)===row.shop_id && data.client_order_code===row.client_order_code && /^[A-Za-z0-9_-]{3,60}$/.test(data.order_code||'')) {
          row=(await this.pool.query<Attempt>(`update integration_private.ghn_order_attempts set status='REMOTE_CREATED',order_code=$2,result_data=$3::jsonb,updated_at=now() where id=$1 and status in ('IN_FLIGHT','UNKNOWN') returning *`,[row.id,data.order_code,JSON.stringify(this.safeResult(data))])).rows[0]||await this.read(actor,key);
          if(row.status==='REMOTE_CREATED') return this.finalize(row);
        }
      } catch { /* A missing/failed lookup is not proof that GHN never created it. */ }
    }
    return publicAttempt(row);
  }
  async print(actor:string,key:string) {
    z.string().uuid().parse(key);
    // Read the actor-owned attempt and recheck its current manager/tenant scope.
    // Neither a caller-supplied code nor arbitrary provider URL is accepted.
    const row=await this.read(actor,key);
    if(row.status!=='SUCCESS'||!row.order_code||!/^[A-Za-z0-9_-]{3,60}$/.test(row.order_code)) throw fail('Chỉ in được vận đơn đã tạo và lưu thành công.',409);
    const config=await this.config();
    if(!config.shops.includes(row.shop_id)) throw fail('Cửa hàng của vận đơn không còn được phép. Kiểm tra Cài đặt API.',409);
    try {
      const response=await this.fetcher('https://online-gateway.ghn.vn/shiip/public-api/v2/a5/gen-token',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Token:config.token,ShopId:row.shop_id},
        body:JSON.stringify({order_codes:[row.order_code]}),
      });
      // Bound the decoded response while streaming, rather than buffering an
      // unbounded body before checking its size. Never return provider errors.
      const reader=response.body?.getReader();
      if(!reader)throw new Error('empty');
      const decoder=new TextDecoder();let bytes=0,text='';
      try {
        for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>2_000_000){await reader.cancel();throw new Error('oversize');}text+=decoder.decode(chunk.value,{stream:true});}
        text+=decoder.decode();
      } finally {reader.releaseLock();}
      const result:unknown=JSON.parse(text);
      const envelope=z.object({code:z.literal(200),data:z.object({token:z.string().regex(/^[A-Za-z0-9_-]{8,2048}$/)})}).passthrough().parse(result);
      if(!response.ok)throw new Error('provider');
      return {success:true,data:{printUrl:'https://online-gateway.ghn.vn/a5/public-api/printA5?token='+encodeURIComponent(envelope.data.token)}};
    } catch {throw fail('Chưa lấy được phiếu in A5 từ GHN. Vận đơn đã được lưu; thử in lại, không tạo lại đơn.',502);}
  }
}

export function registerGhnOrders(app:express.Express, service:GhnOrders,actor:()=>string) {
  const send=(res:express.Response,error:unknown)=>res.status(error instanceof z.ZodError?400:Number((error as {status?:number}).status||503)).json({message:error instanceof z.ZodError?'Thông tin tạo đơn GHN không hợp lệ.':error instanceof Error && 'status' in error?error.message:'Không xử lý được lượt tạo GHN. Hãy kiểm tra trạng thái trước khi thử lại.'});
  app.get('/api/ghn-orders/recent',async(req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await service.recent(actor(),typeof req.query.orderId==='string'?req.query.orderId:null));}catch(error){send(res,error);}});
  app.post('/api/ghn-orders/preview',async(req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await service.preview(actor(),req.body));}catch(error){send(res,error);}});
  app.post('/api/ghn-orders',async(req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await service.create(actor(),req.body));}catch(error){send(res,error);}});
  app.get('/api/ghn-orders/:key',async(req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await service.status(actor(),String(req.params.key)));}catch(error){send(res,error);}});
  app.post('/api/ghn-orders/:key/reconcile',async(req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await service.status(actor(),String(req.params.key),true));}catch(error){send(res,error);}});
  app.post('/api/ghn-orders/:key/print',async(req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await service.print(actor(),String(req.params.key)));}catch(error){send(res,error);}});
}
