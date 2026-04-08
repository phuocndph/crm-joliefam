

## Kết nối Cài đặt AI với Database và Edge Function

### Vấn đề hiện tại
1. Bảng `ai_settings` chỉ có cột `setting_value` kiểu **boolean** — không lưu được text/JSON
2. Trang Settings lưu vào **localStorage** — mất khi đổi máy, không chia sẻ
3. Edge Function dùng **hardcode** — không đọc config từ DB

### Giải pháp

**Bước 1 — Migration: Tạo bảng `ai_config`**

```sql
CREATE TABLE public.ai_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text UNIQUE NOT NULL,
  config_value text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_read" ON public.ai_config
  FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "admin_manager_write" ON public.ai_config
  FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager'));
```

Config keys: `ai_quote_fill_prompt`, `ai_quote_text_model`, `ai_quote_image_model`, `ai_quote_type_categories`, `ai_quote_product_keywords`, `ai_quote_material_keywords`, `ai_quote_cache_ttl`

**Bước 2 — Sửa `AISettingsPage.tsx`**
- `loadSettings()`: SELECT từ `ai_config` thay vì localStorage
- `handleSave()`: Upsert vào `ai_config` (onConflict: `config_key`), xóa localStorage
- Vì bảng `ai_config` không có trong types.ts, dùng `.from('ai_config' as any)` hoặc cast type

**Bước 3 — Sửa Edge Function `lookup-tax-code/index.ts`**
- Thêm module-level cache cho config (giống catalog cache)
- Trong handler `ai_quote_fill`: query `ai_config` → nếu có custom prompt/model → dùng thay hardcode
- Trong handler `ai_quote_debug`: cũng đọc config từ DB
- Logic:
```text
const configCache = { data: null, timestamp: 0 };
// Trong handler:
if (Date.now() - configCache.timestamp > cacheTTL) {
  const { data } = await supabase.from('ai_config').select('config_key, config_value');
  configCache.data = data; configCache.timestamp = Date.now();
}
const customPrompt = configCache.data?.find(c => c.config_key === 'ai_quote_fill_prompt')?.config_value;
const textModel = configCache.data?.find(c => c.config_key === 'ai_quote_text_model')?.config_value || 'google/gemini-2.5-flash';
// ... apply to prompt building and API call
```

### Files thay đổi

| File | Thay đổi |
|------|----------|
| Migration SQL | Tạo bảng `ai_config` + RLS |
| `src/pages/AISettingsPage.tsx` | localStorage → Supabase upsert/select |
| `supabase/functions/lookup-tax-code/index.ts` | Đọc config từ `ai_config`, apply custom prompt/model/catalog |

### Kết quả
- Admin lưu settings → persist trong DB, chia sẻ toàn hệ thống
- Edge Function đọc config (cache theo TTL) → dùng custom prompt/model/catalog khi có
- Không ảnh hưởng hiệu năng nhờ cache module-level

