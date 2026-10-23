export type GhnQuoteShop = { _id: number; name: string; address: string; district_id: number };
export type GhnQuoteService = { service_id: number; service_type_id: number; short_name: string };
export const ghnServiceChoiceKey = (service: GhnQuoteService) => `${service.service_id}:${service.service_type_id}`;
export type GhnQuoteItem = { name: string; quantity: number; weight: number; length: number; width: number; height: number };
export type GhnQuoteSnapshot = {
  key: string;
  feeData: { to_district_id: number; to_ward_code: string; weight: number; length: number; width: number; height: number; cod_value: number; insurance_value: number; items: GhnQuoteItem[] };
};
export type GhnMeasuredParcel = { weight: number; length: number; width: number; height: number };
type QuoteInput = { provinceId: string; districtId: string; wardCode: string; address: string; items: GhnQuoteItem[]; cod: number; insurance: number; parcel?: GhnMeasuredParcel };
const integer = (value: number, min: number, max: number) => Number.isSafeInteger(value) && value >= min && value <= max;

// Names/content are required only when creating an order. Fee requests use
// deterministic labels so editing a name cannot change the parcel identity.
export function validateGhnCreateItems(items: GhnQuoteItem[]): string {
  if (!items.length || items.length > 100 || items.some(row => !row.name.trim() || row.name.trim().length > 200)) return 'Nhập tên cho từng sản phẩm (tối đa 100 sản phẩm, 200 ký tự mỗi tên) để tạo vận đơn.';
  if (items.map(row => row.name).join(', ').trim().length > 2000) return 'Tổng tên sản phẩm không được vượt quá 2.000 ký tự để tạo vận đơn.';
  return '';
}

export function buildGhnQuoteSnapshot(input: QuoteInput): { snapshot: GhnQuoteSnapshot | null; error: string } {
  const fail = (error: string) => ({ snapshot: null, error });
  if (!integer(Number(input.provinceId), 1, 99999999) || !integer(Number(input.districtId), 1, 99999999) || !/^[A-Za-z0-9_-]{1,30}$/.test(input.wardCode) || !input.address.trim()) return fail('Chọn đủ địa chỉ tỉnh / thành, quận / huyện và phường / xã để tính cước.');
  if (!input.items.length || input.items.length > 100) return fail('Nhập từ 1 đến 100 sản phẩm để tính cước.');
  if (input.items.some(row => !integer(row.quantity, 1, 1000) || !integer(row.weight, 1, 50000) || [row.length, row.width, row.height].some(value => !integer(value, 1, 200)))) return fail('Số lượng, gram và kích thước phải là số nguyên dương: tối đa 1.000 sản phẩm mỗi dòng, 50.000 g, 200 cm mỗi chiều.');
  const weight = input.parcel?.weight ?? input.items.reduce((sum, row) => sum + row.weight * row.quantity, 0);
  const length = input.parcel?.length ?? Math.max(...input.items.map(row => row.length)), width = input.parcel?.width ?? Math.max(...input.items.map(row => row.width));
  const height = input.parcel?.height ?? input.items.reduce((sum, row) => sum + row.height * row.quantity, 0);
  if (!integer(weight, 1, 50000) || [length, width, height].some(value => !integer(value, 1, 200))) return fail(input.parcel ? 'Nhập khối lượng kiện đã cân (1–50.000 g) và ba chiều đã đo (1–200 cm), bằng số nguyên.' : 'Kiện gộp vượt giới hạn: tối đa 50 kg và 200 cm mỗi chiều. Kiểm tra lại cách đóng gói.');
  if (!integer(input.cod, 0, 50000000) || !integer(input.insurance, 0, 5000000)) return fail('COD phải là số nguyên từ 0 đến 50 triệu; bảo hiểm từ 0 đến 5 triệu đồng.');
  const feeData = { to_district_id: Number(input.districtId), to_ward_code: input.wardCode, weight, length, width, height, cod_value: input.cod, insurance_value: input.insurance, items: input.items.map((row, index) => ({ ...row, name: `Sản phẩm ${index + 1}` })) };
  return { snapshot: { key: JSON.stringify([input.provinceId, input.address, feeData]), feeData }, error: '' };
}

export class StaleGhnQuoteError extends Error {
  constructor() { super('Thông tin tính cước đã thay đổi.'); }
}
type Read = <T>(action: string, body: Record<string, unknown>) => Promise<T>;
type CacheEntry<T> = { promise: Promise<T>; ready: boolean; value?: T };
type Job = { generation: number; run: () => Promise<void>; cancel: () => void };
export type GhnShopQuote = { shop: GhnQuoteShop; service: GhnQuoteService; total: number; services: GhnQuoteService[]; snapshotKey: string };
export type GhnQuoteComparison = { quotes: GhnShopQuote[]; failures: { shop: GhnQuoteShop; service?: GhnQuoteService; message: string }[]; noServices: GhnQuoteShop[] };
/** Partial comparisons are never a global cheapest recommendation. */
export function findGhnAutomaticCheapest(comparison: GhnQuoteComparison | null, snapshotKey: string | undefined): GhnShopQuote | undefined {
  if (!snapshotKey || !comparison || comparison.failures.length || !comparison.quotes.length || comparison.quotes.some(row => row.snapshotKey !== snapshotKey)) return undefined;
  return comparison.quotes[0];
}

export function findGhnSelectedQuote(comparison: GhnQuoteComparison | null, snapshotKey: string | undefined, shopId: string, service: GhnQuoteService | undefined): GhnShopQuote | undefined {
  if (!snapshotKey || !service) return undefined;
  return comparison?.quotes.find(row => row.snapshotKey === snapshotKey && String(row.shop._id) === shopId && row.service.service_id === service.service_id && row.service.service_type_id === service.service_type_id);
}

/** One scheduler survives resets, so stale in-flight reads still occupy a slot. */
export function createGhnQuoteSession(read: Read) {
  let generation = 0, active = 0;
  const queue: Job[] = [];
  const services = new Map<string, CacheEntry<GhnQuoteService[]>>();
  const quotes = new Map<string, CacheEntry<number>>();
  const drain = () => {
    while (active < 3 && queue.length) {
      const job = queue.shift()!;
      if (job.generation !== generation) { job.cancel(); continue; }
      active++;
      void job.run().finally(() => { active--; drain(); });
    }
  };
  const schedule = <T>(run: () => Promise<T>, token: number): Promise<T> => new Promise((resolve, reject) => {
    if (token !== generation) { reject(new StaleGhnQuoteError()); return; }
    queue.push({ generation: token, cancel: () => reject(new StaleGhnQuoteError()), run: async () => {
      try { const result = await run(); if (token !== generation) throw new StaleGhnQuoteError(); resolve(result); }
      catch (cause) { reject(cause); }
    } });
    drain();
  });
  const cached = <T>(cache: Map<string, CacheEntry<T>>, key: string, run: () => Promise<T>, token: number) => {
    if (token !== generation) return Promise.reject<T>(new StaleGhnQuoteError());
    const existing = cache.get(key);
    if (existing) return existing.promise;
    const entry: CacheEntry<T> = { promise: Promise.resolve(undefined as T), ready: false };
    entry.promise = schedule(run, token).then(value => { entry.ready = true; entry.value = value; return value; }).catch(cause => { if (cache.get(key) === entry) cache.delete(key); throw cause; });
    cache.set(key, entry);
    return entry.promise;
  };
  return {
    capture: () => generation,
    current: (token: number) => token === generation,
    invalidate(resetServices = false) {
      generation++;
      for (const job of queue.splice(0)) job.cancel();
      quotes.clear();
      for (const [key, entry] of services) if (resetServices || !entry.ready) services.delete(key);
    },
    services(shopId: string, districtId: number, token = generation) {
      return cached(services, JSON.stringify([shopId, districtId]), async () => {
        const rows = await read<GhnQuoteService[]>('get_services', { shopId, toDistrictId: districtId });
        const seen = new Set<string>();
        return rows.filter(row => {
          const key = ghnServiceChoiceKey(row);
          if ((row.service_type_id !== 2 && row.service_type_id !== 5) || !integer(row.service_id, 1, Number.MAX_SAFE_INTEGER) || seen.has(key)) return false;
          seen.add(key); return true;
        });
      }, token);
    },
    quote(shopId: string, service: GhnQuoteService, snapshot: GhnQuoteSnapshot, token = generation) {
      return cached(quotes, JSON.stringify([snapshot.key, shopId, service.service_id, service.service_type_id]), async () => {
        const result = await read<{ total: number }>('calculate_fee', { shopId, feeData: { ...snapshot.feeData, service_id: service.service_id, service_type_id: service.service_type_id } });
        if (!integer(result.total, 0, Number.MAX_SAFE_INTEGER)) throw new Error('GHN trả về tổng cước không hợp lệ.');
        return result.total;
      }, token);
    },
    peekQuote(shopId: string, service: GhnQuoteService, snapshot: GhnQuoteSnapshot) {
      return quotes.get(JSON.stringify([snapshot.key, shopId, service.service_id, service.service_type_id]))?.value;
    },
  };
}
export type GhnQuoteSession = ReturnType<typeof createGhnQuoteSession>;

export async function compareGhnShopQuotes(session: GhnQuoteSession, shops: GhnQuoteShop[], snapshot: GhnQuoteSnapshot): Promise<GhnQuoteComparison> {
  const token = session.capture(), result: GhnQuoteComparison = { quotes: [], failures: [], noServices: [] };
  // Fan-out is queued by the shared session, including automatic selected fees.
  await Promise.all(shops.map(async shop => {
    try {
      const services = await session.services(String(shop._id), snapshot.feeData.to_district_id, token);
      if (!services.length) result.noServices.push(shop);
      await Promise.all(services.map(async service => {
        try { const total = await session.quote(String(shop._id), service, snapshot, token); result.quotes.push({ shop, service, total, services, snapshotKey: snapshot.key }); }
        catch (cause) { if (cause instanceof StaleGhnQuoteError) throw cause; result.failures.push({ shop, service, message: cause instanceof Error ? cause.message : 'Không tính được cước.' }); }
      }));
    } catch (cause) { if (cause instanceof StaleGhnQuoteError) throw cause; result.failures.push({ shop, message: cause instanceof Error ? cause.message : 'Không tải được dịch vụ.' }); }
  }));
  if (!session.current(token)) throw new StaleGhnQuoteError();
  result.quotes.sort((a, b) => a.total - b.total || a.shop._id - b.shop._id || a.service.service_type_id - b.service.service_type_id || a.service.service_id - b.service.service_id);
  result.failures.sort((a, b) => a.shop._id - b.shop._id || (a.service?.service_id || 0) - (b.service?.service_id || 0));
  result.noServices.sort((a, b) => a._id - b._id);
  return result;
}
