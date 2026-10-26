/** Server-only Goong transport. No address/key logging, persistence or shared query cache. */
export type GoongRuntimeConfig = {
  token: string;
  configured: boolean;
  source: 'server_env' | 'saved' | 'disabled';
  mode: 'INHERIT_ENV' | 'ENABLED' | 'DISABLED';
  revision: number;
  hasSavedKey: boolean;
};
export type GoongSuggestion = { place_id: string; description: string; main_text: string; secondary_text: string };
class GoongAdapterError extends Error { constructor(message: string, public status: number) { super(message); } }
const fail = (message: string, status = 400) => new GoongAdapterError(message, status);
const containsControl = (value: string) => [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
export const goongKeyValid = (key: string) => /^[!-~]{8,512}$/.test(key);
export const goongEnvironment = (env: NodeJS.ProcessEnv, revision = 0): GoongRuntimeConfig => {
  const token = String(env.GOONG_API_KEY || '').trim();
  return { token, configured: goongKeyValid(token), source: 'server_env', mode: 'INHERIT_ENV', revision, hasSavedKey: false };
};
export const goongPublicStatus = (config: GoongRuntimeConfig) => ({
  configured: config.configured, source: config.source, mode: config.mode, revision: config.revision,
  has_saved_key: config.hasSavedKey, provider: 'goong' as const,
});
const clean = (value: unknown, max: number, key: string, optional = false): string | null => {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > max || containsControl(value) || /[<>]/.test(value) || value.includes(key)) return null;
  const text = value.trim();
  return text || (optional ? '' : null);
};

export class GoongAddressAdapter {
  private buckets = new Map<string, { started: number; count: number; active: number }>();
  private active = 0;
  constructor(private resolve: () => Promise<GoongRuntimeConfig>, private fetcher: typeof fetch = fetch, private now = () => Date.now()) {}
  async status() { return goongPublicStatus(await this.resolve()); }
  async autocomplete(input: unknown, actor: string): Promise<GoongSuggestion[]> {
    if (!actor || actor.length > 200) throw fail('Cần đăng nhập để tìm địa chỉ.', 403);
    if (typeof input !== 'string' || input.length > 500 || input.trim().length < 3 || containsControl(input)) throw fail('Nhập từ 3 đến 500 ký tự địa chỉ hợp lệ.');
    const config = await this.resolve();
    if (!config.configured || !goongKeyValid(config.token)) throw fail('Chưa bật gợi ý địa chỉ. Quản trị viên có thể cấu hình Goong trong Cài đặt API; bạn vẫn có thể chọn địa chỉ GHN bên dưới.', 503);
    const timestamp = this.now();
    for (const [key, bucket] of this.buckets) if (timestamp - bucket.started >= 60000 && !bucket.active) this.buckets.delete(key);
    let bucket = this.buckets.get(actor);
    if (!bucket) {
      if (this.buckets.size >= 1000) throw fail('Tìm địa chỉ đang bận. Vui lòng chờ rồi bấm Thử lại.', 429);
      bucket = { started: timestamp, count: 0, active: 0 }; this.buckets.set(actor, bucket);
    }
    if (timestamp - bucket.started >= 60000) { bucket.started = timestamp; bucket.count = 0; }
    if (bucket.count >= 30 || bucket.active >= 2 || this.active >= 8) throw fail('Bạn đang tìm địa chỉ quá nhanh. Vui lòng chờ rồi bấm Thử lại.', 429);
    bucket.count++; bucket.active++; this.active++;
    try {
      const url = new URL('https://rsapi.goong.io/Place/AutoComplete');
      url.searchParams.set('api_key', config.token); url.searchParams.set('input', input.trim());
      const response = await this.fetcher(url, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (response.status === 429) throw fail('Dịch vụ gợi ý đã giới hạn yêu cầu. Vui lòng chờ rồi bấm Thử lại.', 429);
      if (!response.ok) throw fail('Dịch vụ gợi ý địa chỉ chưa sẵn sàng. Kiểm tra cấu hình Goong hoặc thử lại.', 502);
      const reader = response.body?.getReader();
      if (!reader) throw fail('Dịch vụ gợi ý trả dữ liệu không hợp lệ.', 502);
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 131072) { await reader.cancel().catch(() => undefined); throw fail('Phản hồi gợi ý địa chỉ vượt giới hạn.', 502); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const result: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw fail('Dịch vụ gợi ý trả dữ liệu không hợp lệ.', 502);
      const data = result as Record<string, unknown>;
      if (data.status === 'ZERO_RESULTS') return [];
      if (data.status !== 'OK' || !Array.isArray(data.predictions) || data.predictions.length > 100) throw fail('Dịch vụ gợi ý trả dữ liệu không hợp lệ hoặc khóa chưa được cấp quyền.', 502);
      const suggestions: GoongSuggestion[] = [], ids = new Set<string>(), descriptions = new Set<string>();
      for (const value of data.predictions) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const row = value as Record<string, unknown>;
        const format = row.structured_formatting && typeof row.structured_formatting === 'object' && !Array.isArray(row.structured_formatting) ? row.structured_formatting as Record<string, unknown> : {};
        const place = clean(row.place_id, 256, config.token), description = clean(row.description, 500, config.token);
        const main = clean(format.main_text, 300, config.token, true), secondary = clean(format.secondary_text, 500, config.token, true);
        if (!place || !description || main === null || secondary === null || ids.has(place) || descriptions.has(description)) continue;
        ids.add(place); descriptions.add(description);
        suggestions.push({ place_id: place, description, main_text: main || description, secondary_text: secondary });
        if (suggestions.length === 8) break;
      }
      return suggestions;
    } catch (error) {
      if (error instanceof GoongAdapterError) throw error;
      throw fail('Không tải được gợi ý địa chỉ hoặc đã hết thời gian chờ. Bạn có thể thử lại hoặc chọn địa chỉ GHN thủ công.', 502);
    } finally { bucket.active--; this.active--; }
  }
}
