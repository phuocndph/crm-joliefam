

## Vấn đề: Catalog AI không phân biệt bảng giá

### Phân tích

Frontend đã lọc đúng sản phẩm theo `price_list_id` khi chọn bảng giá:
```
supabase.from("products").select("*").eq("price_list_id", priceListId).eq("in_stock", true)
```

Nhưng Edge Function (`lookup-tax-code`) lấy **TẤT CẢ** sản phẩm `in_stock = true` — không lọc theo bảng giá:
```
supabase.from("products").select("...").eq("in_stock", true).order("category")
```

Kết quả: AI có thể match sản phẩm từ bảng giá cũ (2023) khi user đang báo giá bảng giá 2025, hoặc trả về giá sai.

DB hiện có 2 bảng giá có sản phẩm:
- "Từ 01/5 Năm 2025 Đến Nay" → 917 SP
- "Đến tháng 31/07 Năm 2023" → 852 SP

### Sửa đổi

#### 1. Frontend: Truyền `priceListId` cho AI Quote Fill
**File**: `src/components/CreateQuoteForm.tsx`
- Thêm prop `priceListId` vào `<AIQuoteFill>`

**File**: `src/components/AIQuoteFill.tsx`
- Thêm `priceListId: string` vào `AIQuoteFillProps`
- Gửi `priceListId` trong body request lên Edge Function

#### 2. Backend: Lọc catalog theo `priceListId`
**File**: `supabase/functions/lookup-tax-code/index.ts`
- Nhận `priceListId` từ request body
- Thêm `.eq("price_list_id", priceListId)` vào query products
- Sửa cache key để phân biệt theo `priceListId` (cache key = `priceListId`, không chỉ 1 cache chung)

Cache thay đổi:
```text
// Trước: 1 cache chung cho tất cả
catalogCache: { text, count, timestamp }

// Sau: cache theo priceListId
catalogCacheMap: Map<string, { text, count, timestamp }>
```

### Kết quả
- AI chỉ match sản phẩm trong đúng bảng giá user đã chọn
- Giá luôn đúng theo mốc thời gian
- Cache vẫn hoạt động (phân theo priceListId)

