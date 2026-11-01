import { GoongAddressAdapter, goongEnvironment, goongPublicStatus, type GoongRuntimeConfig } from './goong-address-adapter.js';

type Body = Record<string, any>;
type Fetcher = typeof fetch;
type GhnDiscoveryCategory = 'token' | 'auth' | 'ip' | 'request' | 'rate';
type GhnShopsShape = 'array' | 'null' | 'missing' | 'other';
export type GhnRuntimeConfig = {
  token: string;
  primaryShop: string;
  shops: string[];
  configured: boolean;
  source: 'server_env' | 'saved' | 'disabled';
  mode: 'INHERIT_ENV' | 'ENABLED' | 'DISABLED';
  revision: number;
  hasSavedKey: boolean;
};
const failure = (message: string, status = 400) => Object.assign(new Error(message), { status });
export const positiveShop = (value: unknown, label = 'Shop') => { const number = Number(value); if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(number) || number <= 0) throw failure(`${label} không hợp lệ.`); return number; };
const positive = positiveShop;
const ghnInteger = (value: unknown, min: number, max: number, label: string) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw failure(`${label} không hợp lệ.`);
  return number;
};
const ghnKeyPattern = /^[!-~]{8,512}$/;
const normalizedGhnKey = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const discoveryCategory = (result: Body): GhnDiscoveryCategory => {
  // Classification is deliberately one-way: provider text is never returned.
  const hint = `${typeof result.code_message === 'string' ? result.code_message : ''} ${typeof result.message === 'string' ? result.message : ''}`.toLowerCase();
  if (/(rate|too many|throttl|quota|limit)/.test(hint)) return 'rate';
  if (/(whitelist|allowlist|ip address|\bip\b)/.test(hint)) return 'ip';
  if (/(token|api[_ -]?key|\bkey\b)/.test(hint)) return 'token';
  if (/(auth|unauthori[sz]|forbidden|permission|credential)/.test(hint)) return 'auth';
  return 'request';
};
const shopsShape = (data: unknown): GhnShopsShape => {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.prototype.hasOwnProperty.call(data, 'shops')) return 'missing';
  const shops = (data as Body).shops;
  if (Array.isArray(shops)) return 'array';
  if (shops === null) return 'null';
  return 'other';
};
const isTimeout = (error: unknown) => error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
const requestJson = async (url: string, init: RequestInit, fetcher: Fetcher) => {
  try {
    const response = await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw failure('Dịch vụ bên ngoài từ chối yêu cầu. Vui lòng kiểm tra cấu hình hoặc thử lại.', 502);
    const text = await response.text(); if (text.length > 2_000_000) throw failure('Phản hồi dịch vụ vượt giới hạn.', 502);
    return JSON.parse(text);
  } catch (error) { if (error instanceof Error && 'status' in error) throw error; throw failure('Không kết nối được dịch vụ bên ngoài hoặc đã hết thời gian chờ.', 502); }
};

export class ExternalReadAdapters {
  private goong: GoongAddressAdapter;
  constructor(private env: NodeJS.ProcessEnv = process.env, private fetcher: Fetcher = fetch, private configResolver?: () => Promise<GhnRuntimeConfig>, goongResolver?: () => Promise<GoongRuntimeConfig>) {
    this.goong = new GoongAddressAdapter(goongResolver || (async () => goongEnvironment(this.env)), fetcher);
  }
  private ghnShops() {
    const main = this.env.GHN_SHOP_ID?.trim() || '';
    const shops = [...new Set([main, ...(this.env.GHN_SHOP_IDS || '').split(',').map(value => value.trim()).filter(Boolean)])];
    return shops.length <= 50 && shops.every(value => /^[1-9]\d{0,19}$/.test(value) && Number.isSafeInteger(Number(value))) ? shops : [];
  }
  private staticConfig(): GhnRuntimeConfig {
    const shops = this.ghnShops();
    const primaryShop = this.env.GHN_SHOP_ID?.trim() || '';
    const token = normalizedGhnKey(this.env.GHN_API_KEY);
    return { token, primaryShop, shops, configured: Boolean(token && primaryShop && shops.length), source: 'server_env', mode: 'INHERIT_ENV', revision: 0, hasSavedKey: false };
  }
  async snapshot(): Promise<GhnRuntimeConfig> { return this.configResolver ? this.configResolver() : this.staticConfig(); }
  async discoverShops(token:string, primary='') {
    const apiKey = normalizedGhnKey(token);
    if (!apiKey) throw failure('Cần nhập khóa GHN để lấy cửa hàng.');
    if (!ghnKeyPattern.test(apiKey)) throw failure('Khóa GHN không hợp lệ.');
    const found = new Map<string, Body>();
    let offset=0;
    const cursors=new Set<number>();
    for (let page = 0; page < 10; page++) {
      const pageIndex = page + 1;
      let response: Response;
      try {
        response = await this.fetcher(`https://online-gateway.ghn.vn/shiip/public-api/v2/shop/all?offset=${offset}&limit=200&client_phone=`, { method: 'GET', headers: { Token: apiKey, ...(primary?{ShopId:primary}:{}) }, redirect: 'error', signal: AbortSignal.timeout(10000) });
      } catch (error) {
        if (isTimeout(error)) throw failure(`GHN hết thời gian chờ khi lấy cửa hàng (trang ${pageIndex}).`, 502);
        throw failure(`Không kết nối được GHN khi lấy cửa hàng (trang ${pageIndex}).`, 502);
      }
      if (!response.ok) throw failure(`GHN trả HTTP ${response.status} khi lấy cửa hàng (trang ${pageIndex}).`, 502);
      let text: string;
      try { text = await response.text(); }
      catch { throw failure(`GHN trả phản hồi không đọc được khi lấy cửa hàng (trang ${pageIndex}).`, 502); }
      if (text.length > 2_000_000) throw failure(`Phản hồi GHN vượt giới hạn khi lấy cửa hàng (trang ${pageIndex}).`, 502);
      let result: Body;
      try { result = JSON.parse(text); }
      catch { throw failure(`GHN trả phản hồi không đúng định dạng khi lấy cửa hàng (trang ${pageIndex}).`, 502); }
      if (!result || typeof result !== 'object' || Array.isArray(result) || !Number.isSafeInteger(result.code)) throw failure(`GHN trả phản hồi không đúng định dạng khi lấy cửa hàng (trang ${pageIndex}).`, 502);
      if (result.code !== 200) throw failure(`GHN từ chối lấy cửa hàng (mã GHN ${result.code}; loại ${discoveryCategory(result)}; trang ${pageIndex}).`, 502);
      const shape = shopsShape(result.data);
      // GHN returned this exact terminal shape in production: a populated first
      // page followed by code=200, shops=null, last_offset=0. It is accepted
      // only after an earlier page and only with an explicit terminal cursor.
      if (shape === 'null' && page > 0 && ((result.data as Body).last_offset === 0 || (result.data as Body).last_offset === '0')) return [...found.values()];
      if (shape !== 'array') throw failure(`GHN trả danh sách cửa hàng không đúng định dạng (shops ${shape}; trang ${pageIndex}).`, 502);
      const data = result.data as Body;
      for (const row of data.shops) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        if (!/^[1-9]\d*$/.test(String(row._id)) || !Number.isSafeInteger(Number(row._id)) || row.status !== 1) continue;
        found.set(String(row._id), {_id:Number(row._id),name:String(row.name||'').slice(0,200),address:String(row.address||'').slice(0,500),district_id:row.district_id,ward_code:String(row.ward_code||''),phone:typeof row.phone==='string'?row.phone.slice(0,30):'',status:1});
      }
      const next=Number(data.last_offset);
      if (!data.shops.length || !Number.isSafeInteger(next) || next<=0 || cursors.has(next) || next===offset) return [...found.values()];
      cursors.add(next); offset=next;
    }
    throw failure('Danh sách cửa hàng GHN vượt giới hạn trang. Cần kiểm tra tài khoản GHN.',502);
  }
  async shops(config: GhnRuntimeConfig) {
    const allowed = config.shops.map(value => String(positiveShop(value)));
    if (!config.configured || !config.token || !allowed.includes(config.primaryShop)) throw failure('GHN chưa được cấu hình hoặc đã tắt.', 503);
    const found = (await this.discoverShops(config.token,config.primaryShop)).filter(row=>allowed.includes(String(row._id)));
    if (!found.length) throw failure('Không tìm thấy cửa hàng GHN được phép. Kiểm tra khóa và danh sách shop trong Cài đặt API.', 502);
    return found.sort((a,b) => Number(String(b._id) === config.primaryShop) - Number(String(a._id) === config.primaryShop));
  }
  async sender(config: GhnRuntimeConfig, requested?: unknown) {
    const id = String(positiveShop(requested === undefined ? config.primaryShop : requested));
    if (!config.shops.includes(id)) throw failure('Cửa hàng GHN không được phép.', 403);
    const shop = (await this.shops(config)).find(row => String(row._id) === id);
    if (!shop) throw failure('Khóa GHN không truy cập được cửa hàng đã chọn.', 502);
    return { id, district: positive(shop.district_id, 'Quận gửi'), metadata: shop };
  }
  private statusFor(config: GhnRuntimeConfig, goong = goongPublicStatus(goongEnvironment(this.env))) {
    return { ghn: { configured: config.configured, configured_shop_count: config.shops.length, mode: 'read_and_create', source: config.source, settings_mode: config.mode, revision: config.revision, has_saved_key: config.hasSavedKey, variables: ['GHN_API_KEY', 'GHN_SHOP_ID', 'GHN_SHOP_IDS'], writes_supported: true, create_supported:true, edit_supported:true, cancel_supported:false, print_supported:true }, tax: { configured: true, mode: 'public_read_only', provider: 'VietQR' }, goong: { ...goong, capability: 'address_autocomplete', settings_path: '/api-settings', variables: ['GOONG_API_KEY'] }, einvoice: { configured: false, mode: 'draft_only', live_supported: false }, ai: { mode: 'existing_settings', settings_path: '/ai-settings' } };
  }
  status() {
    return this.statusFor(this.staticConfig());
  }
  async getStatus() { return this.statusFor(await this.snapshot(), await this.goong.status()); }
  async taxCode(value: unknown) {
    const code = String(value || '').trim(); if (!/^\d{10}(?:-?\d{3})?$/.test(code)) throw failure('Mã số thuế phải gồm 10 hoặc 13 chữ số.');
    const result = await requestJson(`https://api.vietqr.io/v2/business/${encodeURIComponent(code)}`, {}, this.fetcher);
    if (result.code !== '00' || !result.data || typeof result.data.name !== 'string') throw failure('Không tìm thấy doanh nghiệp với mã số thuế này.', 404);
    return { company_name: result.data.name, address: typeof result.data.address === 'string' ? result.data.address : '', tax_code: code, representative: '', position: '', phone: '', bank_name: '', bank_account: '', bank_holder: '', source: 'vietqr', local_only: false };
  }
  async ghn(body: Body, runtimeConfig?: GhnRuntimeConfig, actor = '') {
    const action = String(body.action || '');
    if (action === 'address_autocomplete' || action === 'address_autocomplete_status') {
      const keys = action === 'address_autocomplete' ? ['action', 'input'] : ['action'];
      if (Object.keys(body).some(key => !keys.includes(key))) throw failure('Dữ liệu tìm địa chỉ không hợp lệ.');
    }
    if (action === 'address_autocomplete_status') return { success: true, data: await this.goong.status(), source: 'goong' };
    if (action === 'address_autocomplete') return { success: true, data: await this.goong.autocomplete(body.input, actor), source: 'goong' };
    const supported = ['get_provinces', 'get_districts', 'get_wards', 'get_shops', 'get_services', 'calculate_fee', 'track', 'track_order', 'get_order_detail'];
    if (!supported.includes(action)) return { success: false, error: 'Thao tác này chưa được hỗ trợ an toàn trên VPS. Chưa gửi hoặc thay đổi vận đơn GHN.', mode: 'read_only' };
    const config = runtimeConfig || await this.snapshot();
    const token = config.token, shops = config.shops;
    let shop = config.primaryShop;
    if (!config.configured || !token || !shop || !shops.length) return { success: false, error: 'Chưa cấu hình GHN hợp lệ.', mode: 'unconfigured' };
    if (action === 'get_shops') return { success: true, data: await this.shops(config), local_only: false, source: 'ghn' };
    let endpoint = '', data: Body = {};
    if (action === 'get_provinces') endpoint = 'master-data/province';
    if (action === 'get_districts') { endpoint = 'master-data/district'; data.province_id = positive(body.provinceId, 'Tỉnh/thành'); }
    if (action === 'get_wards') { endpoint = 'master-data/ward'; data.district_id = positive(body.districtId, 'Quận/huyện'); }
    if (action === 'get_shops') { endpoint = 'v2/shop/all'; data = { offset: 0, limit: 50, client_phone: '' }; }
    if (action === 'get_services') { const sender = await this.sender(config, body.shopId); shop = sender.id; endpoint = 'v2/shipping-order/available-services'; data = { shop_id: Number(shop), from_district: sender.district, to_district: positive(body.toDistrictId, 'Quận nhận') }; }
    if (action === 'calculate_fee') {
      endpoint = 'v2/shipping-order/fee';
      if (!body.feeData || typeof body.feeData !== 'object' || Array.isArray(body.feeData)) throw failure('Thông tin tính cước không hợp lệ.');
      const fee = body.feeData;
      const sender = await this.sender(config, body.shopId); shop = sender.id;
      const weight = ghnInteger(fee.weight, 1, 50000, 'Khối lượng');
      data = { shop_id: Number(shop), to_district_id: positive(fee.to_district_id, 'Quận nhận'), weight };
      for (const key of ['from_district_id', 'service_id', 'service_type_id']) if (fee[key] !== undefined) { const number = Number(fee[key]); if (!Number.isSafeInteger(number) || number < 0) throw failure('Thông tin tính cước không hợp lệ.'); data[key] = number; }
      for (const [key, max] of [['insurance_value', 5000000], ['cod_value', 50000000], ['cod_failed_amount', 50000000]] as const) {
        if (fee[key] === undefined) continue;
        if (typeof fee[key] !== 'number' || !Number.isSafeInteger(fee[key]) || fee[key] < 0 || fee[key] > max) throw failure('COD tối đa 50 triệu; giá trị khai báo bảo hiểm tối đa 5 triệu đồng, phải là số nguyên không âm.');
        data[key] = fee[key];
      }
      if (typeof fee.to_ward_code !== 'string' || !/^[\w-]{1,30}$/.test(fee.to_ward_code)) throw failure('Mã phường/xã không hợp lệ.'); data.to_ward_code = fee.to_ward_code;
      if (fee.from_district_id !== undefined && Number(fee.from_district_id) !== sender.district) throw failure('Quận gửi không khớp cửa hàng GHN.');
      data.from_district_id = sender.district;
      const originWard = sender.metadata.ward_code;
      if (fee.from_ward_code !== undefined && (typeof fee.from_ward_code !== 'string' || fee.from_ward_code !== originWard)) throw failure('Phường/xã gửi không khớp cửa hàng GHN.');
      // Only trusted shop discovery determines the pickup ward. Without it GHN
      // applies its documented ShopId address fallback; never invent geography.
      if (typeof originWard === 'string' && /^[\w-]{1,30}$/.test(originWard)) data.from_ward_code = originWard;
      const dimensionFields = ['length', 'width', 'height'] as const;
      const dimensionsProvided = dimensionFields.filter(field => fee[field] !== undefined);
      if (dimensionsProvided.length && dimensionsProvided.length !== dimensionFields.length) throw failure('Khi tính cước với kích thước, cần nhập đủ dài × rộng × cao.');
      if (dimensionsProvided.length === dimensionFields.length) for (const field of dimensionFields) data[field] = ghnInteger(fee[field], 1, 200, 'Kích thước kiện hàng');
      if (fee.items !== undefined && !Array.isArray(fee.items)) throw failure('Danh sách kiện hàng không hợp lệ.');
      const parcelCount = Array.isArray(fee.items) ? fee.items.length : 1;
      if (fee.service_type_id === undefined || Number(fee.service_type_id) !== (weight < 20000 && parcelCount === 1 ? 2 : 5)) throw failure('Loại dịch vụ GHN không phù hợp với cân nặng hoặc số kiện.');
      if (dimensionsProvided.length === dimensionFields.length && fee.items === undefined) throw failure('Báo giá hoàn chỉnh phải có đúng một kiện đã đóng gói.');
      if (Array.isArray(fee.items)) {
        if (parcelCount < 1 || parcelCount > 100 || (parcelCount === 1 ? dimensionsProvided.length !== 3 : dimensionsProvided.length !== 0)) throw failure('Báo giá cần kích thước riêng của từng kiện; không gộp kích thước nhiều kiện.');
        data.items = fee.items.map((row: Body, index: number) => {
          const expectedName = parcelCount === 1 ? 'Kiện hàng đã đóng gói' : `Kiện hàng đã đóng gói ${index + 1}/${parcelCount}`;
          if (!row || typeof row.name !== 'string' || row.name.trim() !== expectedName || ghnInteger(row.quantity, 1, 1, 'Số lượng kiện') !== 1) throw failure('Kiện đã đóng gói không hợp lệ.');
          return { name: row.name.trim(), quantity: 1, weight: ghnInteger(row.weight, 1, 50000, 'Khối lượng kiện hàng'), length: ghnInteger(row.length, 1, 200, 'Kích thước kiện hàng'), width: ghnInteger(row.width, 1, 200, 'Kích thước kiện hàng'), height: ghnInteger(row.height, 1, 200, 'Kích thước kiện hàng') };
        });
        if (data.items.reduce((sum: number, row: Body) => sum + row.weight, 0) !== weight) throw failure('Tổng cân nặng các kiện không khớp vận đơn.');
        if (parcelCount === 1 && dimensionFields.some(field => data.items[0][field] !== data[field])) throw failure('Thông số kiện trong báo giá không khớp kiện đã đo.');
      }
    }
    const tracking = ['track', 'track_order', 'get_order_detail'].includes(action);
    if (tracking) { const code = String(body.orderCode || body.order_code || '').trim(); if (!/^[A-Za-z0-9_-]{3,60}$/.test(code)) throw failure('Mã vận đơn GHN không hợp lệ.'); endpoint = 'v2/shipping-order/detail'; data = { order_code: code }; }
    const master = action.startsWith('get_') && ['get_provinces','get_districts','get_wards'].includes(action);
    const query = new URLSearchParams(Object.entries(data).map(([key,value]) => [key,String(value)])).toString();
    const result = await requestJson('https://online-gateway.ghn.vn/shiip/public-api/' + endpoint + (master && query ? '?' + query : ''), { method: master ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Token: token, ShopId: shop }, ...(master ? {} : { body: JSON.stringify(data) }) }, this.fetcher);
    if (result.code !== 200 || !result.data) throw failure('GHN không chấp nhận yêu cầu. Vui lòng kiểm tra cấu hình hoặc thông tin tra cứu.', 502);
    let payload = result.data;
    if (action === 'get_shops') payload = Array.isArray(result.data.shops) ? result.data.shops.filter((item: Body) => shops.includes(String(item._id))) : [];
    if (tracking) {
      if (!shops.includes(String(result.data.shop_id))) throw failure('Vận đơn không thuộc cửa hàng GHN đã cấu hình.', 403);
      if (result.data.order_code !== data.order_code) throw failure('GHN trả về mã vận đơn khác yêu cầu.', 502);
      const row = result.data; payload = { ...row, orderCode: row.order_code, status: row.status, statusText: row.status, customerName: row.to_name, customerPhone: row.to_phone, customerAddress: [row.to_address, row.to_ward_name, row.to_district_name, row.to_province_name].filter(Boolean).join(', '), weight: row.weight, createdDate: row.created_date, expectedDeliveryTime: row.leadtime, deliveredDate: row.finish_date, codAmount: row.cod_amount, trackingUrl: `https://donhang.ghn.vn/?order_code=${encodeURIComponent(row.order_code)}`, rawData: row, logs: Array.isArray(row.log) ? row.log.map((entry: Body) => ({status:entry.status,updated_date:entry.updated_date||entry.time,comment:entry.comment||entry.description||entry.reason||''})) : [] };
    }
    return { success: true, data: payload, local_only: false, source: 'ghn' };
  }
}
