

## Tối ưu tốc độ AI Quote Fill — không ảnh hưởng kết quả

### Phân tích bottleneck hiện tại

| Bước | Thời gian ước tính | Nguyên nhân |
|------|-------------------|-------------|
| DB query products | ~500ms-1s | Mỗi request query lại DB |
| AI xử lý prompt | ~5-10s | Model `gemini-3-flash-preview` + prompt chứa TOÀN BỘ catalog |
| Tìm ảnh preview | ~0-2s | Đã cache, ổn |

### 3 thay đổi chính

#### 1. Cache catalog trong Edge Function (Deno module-level)
**File**: `supabase/functions/lookup-tax-code/index.ts`

Deno edge function giữ module-level state giữa các request (warm invocation). Cache `productListText` với TTL 5 phút → tránh query DB mỗi lần.

```text
let cachedCatalog: { text: string; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

// Chỉ query DB khi cache hết hạn
if (!cachedCatalog || Date.now() - cachedCatalog.timestamp > CACHE_TTL) {
  const { data: products } = await supabase.from("products")...
  cachedCatalog = { text: productListText, timestamp: Date.now() };
}
```

#### 2. Dùng model nhanh hơn cho text-only quote fill
**File**: `supabase/functions/lookup-tax-code/index.ts`

Thay vì dùng chung `gemini-3-flash-preview` cho mọi request, tạo hàm `callAI` nhận tham số model:
- Text-only quote fill: `google/gemini-2.5-flash` (nhanh hơn ~2-3x, vẫn chính xác)
- Có ảnh: giữ `google/gemini-3-flash-preview` (cần vision mạnh)

Cách sửa: thêm param `model` vào `callAI()`, truyền model tùy theo `hasImage`.

#### 3. Chạy AI call và preload ảnh song song (frontend)
**File**: `src/components/AIQuoteFill.tsx`

Hiện tại flow là tuần tự: AI call → xong → tìm ảnh. Đổi thành:
```text
const [aiPromise, imagePromise] = [
  supabase.functions.invoke("lookup-tax-code", ...),
  includeImages ? loadImageFiles() : Promise.resolve(null)
];
const [aiResult, _] = await Promise.all([aiPromise, imagePromise]);
// imageFiles đã sẵn trong cache khi findPreviewImage chạy
```

Thực tế `loadImageFiles` đã cache nên chủ yếu đảm bảo cache sẵn sàng trước khi AI trả kết quả.

### File thay đổi

| File | Sửa gì |
|------|--------|
| `supabase/functions/lookup-tax-code/index.ts` | (1) Module-level catalog cache TTL 5 phút. (2) Dùng `gemini-2.5-flash` cho text-only quote fill |
| `src/components/AIQuoteFill.tsx` | (3) Preload image cache song song với AI call |

### Kết quả kỳ vọng
- Giảm ~1s (bỏ DB query lặp lại)
- Giảm ~2-4s (model nhanh hơn cho text-only)
- Tổng: từ ~7-12s xuống ~4-7s, không ảnh hưởng chất lượng matching

