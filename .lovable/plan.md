## Phân tích kết quả test thực tế

Bạn parse 10 segment, AI trả 10 item — **về số lượng là khớp 100%**. Nhưng UI vẫn hiện 4 cảnh báo "Thiếu SP" và 6/10 item bị gắn `fallback_product`. Đây là **lỗi của logic phân loại sau xử lý**, không phải lỗi của AI hay parser.

### Bằng chứng từ dữ liệu test

| # | Segment | AI trả | Thực tế |
|---|---|---|---|
| 1 | vỏ gối T250 50x70 | "Vỏ gối T250 50x70" – 40k | ✅ Đúng nhưng bị gắn `fallback_product` |
| 2 | vỏ gối T300 50x70 | "Vỏ gối T300 50x70" – 40k | ✅ Đúng nhưng bị gắn `fallback_product` |
| 3 | vỏ gối T200 50x70 | "Vỏ gối T200 50x70" – 37.5k | ✅ Đúng nhưng bị gắn `fallback_product` |
| 4 | vỏ gối LTH 50x70 | "Vỏ gối LTH 50x70" | ✅ exact (đúng) |
| 5 | vỏ gối chống thấm 50x70 | "Vỏ gối chống thấm 50x70" | ✅ Đúng — nhưng vẫn cảnh báo "Thiếu SP" |
| 6 | vỏ gối tencel 50x70 | **"Bộ chăn ga gối Tencel-0798HM" – 2.2 triệu** | ❌ **SAI THẬT** — AI ghép vào bộ chăn ga 2.2M |
| 7 | vỏ gối 50x70 (mặc định T250) | "Vỏ gối 50x70" – 51.25k | Lặp với #1, gây cảnh báo "Thiếu SP cho T250" |
| 8 | bảo vệ nệm 160x200 | "Bảo vệ nệm chống thấm chần bông 160x200" | ❌ Sai material (yêu cầu thường, AI trả chống thấm) |
| 9 | bảo vệ nệm chống thấm 1m6 | "Bảo vệ nệm chống thấm 150x200" | ⚠️ Sai size (có 160x200 nhưng đã bị #8 chiếm) |
| 10 | bảo vệ nệm trơn D200 | "Bảo vệ nệm chần bông tròn D200" | ✅ Đúng |

### 3 lỗi logic gốc

**Lỗi A — `assignSegmentToItem` chọn segment sai khi 2 segment có cùng `type`+`material`**
- Segment #1 (vỏ gối T250) và #7 (vỏ gối — fallback T250) đều match item "Vỏ gối T250 50x70". Cả 2 item AI trả về đều bị gán segment #7 → segment #1 bị cho là "thiếu" → cảnh báo sai.
- Cùng vấn đề với bảo vệ nệm 160x200 (#8) vs bảo vệ nệm chống thấm 1m6 (#9).

**Lỗi B — `findClosestProductScoped` cho điểm quá thấp khi candidate đã đúng tuyệt đối**
- "Vỏ gối T250 50x70" match đúng SP "Vỏ gối T250 50x70" mà chỉ ra `fallback_product` thay vì `exact`. Lý do: scoring cộng được 15 (type) + 10 (material) + 5 (size) = 30, đúng ngưỡng `exact`, nhưng `getProductType` không nhận "vỏ gối" hoặc `getMaterial` không bắt được "T250" trong tên SP → mất 10–15 điểm → tụt xuống `fallback_product`.

**Lỗi C — Segment "vỏ gối tencel" có 4 candidates nhưng AI vẫn chọn bộ chăn ga 2.2 triệu**
- Logic `validate-and-repair` chỉ kiểm tra ID có hợp lệ trong catalog không, không kiểm tra **giá hợp lý** hoặc **product type khớp segment.type**. SP "Bộ chăn ga gối" có type khác hoàn toàn "vỏ gối" nhưng vẫn được trust.

## Plan sửa (3 patch nhỏ, chỉ trong `supabase/functions/lookup-tax-code/index.ts`)

### Patch 14 — Fix segment assignment: 1 segment chỉ được gán 1 item

Trong vòng lặp `for itemIdx` (~line 297), thêm `Set` lưu các `segmentIdx` đã được dùng. Khi tính `bestSegIdx`, bỏ qua segment đã có item gán vào, **trừ khi không còn segment nào khác match**. Điều này đảm bảo 10 item map 1-1 với 10 segment khi count khớp.

### Patch 15 — Fix matchQuality: nếu tên SP chứa nguyên cụm "type + material + size" thì luôn exact

Trong `findClosestProductScoped`, trước khi return, thêm kiểm tra:
```ts
const itemKey = removeVietnameseTones(`${itemType} ${itemMaterial} ${itemDims.join('x')}`).replace(/\s+/g,' ').trim();
const prodKey = removeVietnameseTones(bestProduct.name).replace(/\s+/g,' ').trim();
if (itemKey && prodKey.includes(itemKey)) {
  bestQuality = 'exact';
}
```
Áp dụng tương tự ở nhánh `validate-and-repair` line 372 khi product đã in candidates.

### Patch 16 — Reject SP có giá lệch >5x giá trung bình của candidate set

Trong `validate-and-repair` (~line 368), khi product được AI chọn nằm trong candidates, thêm sanity check:
- Tính `medianPrice` của candidates cùng segment.
- Nếu `product.price > medianPrice * 5` (vd vỏ gối 40k vs bộ chăn ga 2.2M = 55x) → coi như AI sai, gọi `findClosestProductScoped` để chọn lại từ candidates và đặt warning "AI chọn SP giá bất thường, đã thay bằng …".

Đồng thời check `getProductType(product.name) === getProductType(segment.type)` — nếu khác (vỏ gối vs bộ chăn ga) cũng reject.

## Phạm vi & rủi ro

- Chỉ sửa 1 file: `supabase/functions/lookup-tax-code/index.ts`
- Không đụng DB config, không đụng UI, không đụng RLS
- Mỗi patch độc lập, có thể rollback từng cái
- Sau khi áp dụng, test lại cùng input "vỏ gối T250/T300/.../bảo vệ nệm…" sẽ:
  - 0 cảnh báo "Thiếu SP" (vì map 1-1)
  - 5–6 item là `exact` thay vì `fallback_product`
  - Item "vỏ gối tencel" KHÔNG còn map vào bộ chăn ga 2.2M

Bạn duyệt plan này chứ? Hoặc muốn tôi bỏ Patch 16 (sanity check giá) vì có thể quá aggressive?