

## Phân tích nguyên nhân chậm & kế hoạch tối ưu

### Nguyên nhân gốc (từ logs thực tế)

Tổng thời gian hiện tại: **~96 giây** rồi **thất bại hoàn toàn**. Chuỗi sự kiện:

```text
t=0s    Catalog download → FAIL (sai đường dẫn file)
t=1s    Build catalog → OK (31 SP, 2371 chars)
t=2s    Re-download catalog → FAIL (vẫn sai đường dẫn)
t=3s    Fallback: gửi 917 SP thô cho AI
t=4s    Lovable AI → 402 (hết credits)
t=5s    Beeknoee gemini-2.5-flash → timeout 25s
t=30s   Beeknoee glm-4.7-flash → timeout
t=50s   Beeknoee glm-4.5-flash → 429 (concurrent limit 1/1)
t=55s   Beeknoee gpt-oss-120b → 429
t=60s   Retry tất cả lần 2 → 429 hết
t=96s   "All AI providers failed"
```

### 3 lỗi chính gây chậm

| # | Lỗi | Tác động |
|---|------|----------|
| **1** | **Sai đường dẫn Storage** — Backend lưu `catalog/product-catalog-{managerId}.json` nhưng Frontend tải `catalog/product-catalog.json` | Catalog KHÔNG BAO GIỜ được tải → luôn gửi 917 SP thô thay vì 31 SP đã phân loại |
| **2** | **Lovable AI hết credits (402)** — Không thông báo rõ cho user | User không biết cần nạp credits |
| **3** | **Beeknoee concurrent limit 1/1** — 917 SP = payload quá lớn, timeout + rate limit | 4 model × 2 lần thử = 8 requests, mỗi cái chờ 15-25s |

### Kế hoạch sửa (mục tiêu: 5-10 giây)

#### 1. Fix đường dẫn Storage (quan trọng nhất)
**File**: `src/components/AIQuoteFill.tsx`

Frontend cần tải catalog theo đường dẫn đúng với manager_id của user. Khi `build-product-catalog` trả về `catalogPath`, lưu lại và dùng path đó để download. Ngoài ra, response từ `build-product-catalog` đã chứa catalog data → dùng trực tiếp thay vì download lại.

**Hiệu quả**: 31 SP (2.3KB) thay vì 917 SP (~55KB) → giảm 95% token

#### 2. Dùng trực tiếp catalog text từ build response  
**File**: `src/components/AIQuoteFill.tsx`

Khi build catalog, response đã trả `catalogPath`. Thay vì download lại từ Storage (vốn đang lỗi), gọi edge function lấy text trực tiếp hoặc sửa build function trả luôn catalog text.

**File**: `supabase/functions/build-product-catalog/index.ts`

Thêm `catalogText` vào response body để frontend không cần download riêng.

#### 3. Hiển thị lỗi 402 rõ ràng
**File**: `src/components/AIQuoteFill.tsx`

Khi nhận lỗi từ AI, kiểm tra nếu là 402/payment → hiện toast "Lovable AI hết credits, đang dùng AI dự phòng" thay vì lỗi chung chung.

#### 4. Giảm timeout Beeknoee
**File**: `supabase/functions/lookup-tax-code/index.ts`

Với 31 SP (sau khi fix catalog), payload nhẹ hơn nhiều → giảm timeout:
- gemini-2.5-flash: 25s → 15s  
- glm-4.7-flash: 20s → 12s
- glm-4.5-flash: 15s → 10s
- gpt-oss-120b: 15s → 10s
- Bỏ retry lần 2 (chỉ thử 1 vòng)
- Giảm delay 429 từ 3s → 1s

**Hiệu quả**: Worst case giảm từ 96s → ~25s; best case (model đầu thành công): 5-10s

### Tổng kết hiệu quả dự kiến

| Metric | Hiện tại | Sau fix |
|--------|----------|---------|
| Payload gửi AI | 917 SP (55KB) | 31 SP (2.3KB) |
| Thời gian thành công | Không bao giờ thành công | 5-10s |
| Thời gian worst case | 96s rồi fail | ~25s |
| Token AI | ~20K | ~1K |

### Thay đổi cụ thể

| File | Nội dung |
|------|----------|
| `supabase/functions/build-product-catalog/index.ts` | Trả thêm `catalogText` trong response body |
| `src/components/AIQuoteFill.tsx` | (1) Fix download path dùng manager-specific path. (2) Dùng trực tiếp catalogText từ build response. (3) Hiển thị lỗi 402 rõ ràng |
| `supabase/functions/lookup-tax-code/index.ts` | Giảm timeout Beeknoee, bỏ retry lần 2, giảm delay 429 |

