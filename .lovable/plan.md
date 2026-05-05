## Phân tích sau Patch 14-16

Kết quả test mới đã đỡ hơn nhiều (0 cảnh báo "Thiếu SP", 5s thay vì 40s), nhưng còn 2 lỗi thật do logic phân loại quá thô.

### Lỗi gốc thật sự

**1. `getProductType` trả ra keyword đầu tiên match → "vỏ gối" và "bộ chăn ga gối" bị coi là cùng type**

Code hiện tại tại line 81-87:
```ts
function getProductType(text: string): string {
  const norm = removeVietnameseTones(text);
  for (const kw of PRODUCT_TYPE_KEYWORDS) {
    if (norm.includes(kw)) return kw;
  }
  return '';
}
```
- `PRODUCT_TYPE_KEYWORDS` có cả `'vo goi'` và `'goi'` và `'chan'` riêng lẻ
- "Bộ chăn ga gối Tencel" → norm "bo chan ga goi tencel" → match "vo goi"? KHÔNG. Match "chan" trước (xuất hiện sau trong array). Tùy thứ tự.
- Thực tế: array có "vo chan" trước "vo goi", và "chan" rất cuối → "Bộ chăn ga gối" sẽ match "ga goi" (nếu có) hoặc "goi". Cả "vỏ gối" cũng match "goi" hoặc "vo goi".
- Kết quả: cả 2 product khác type hoàn toàn nhưng `getProductType` ra giá trị giống nhau → Patch 16 typeMismatchHard không trigger.

**2. AI nhầm lẫn ID giữa các SP rất giống nhau (T200 / T250 / T300)**

AI chọn ID dựa trên prompt ngắn `ID|Name|Specs|Price`. 3 SP "Vỏ gối T200/T250/T300 50x70" trông gần như giống hệt → AI gán nhầm ID. Đây là vấn đề mà sanity check theo material có thể catch: nếu segment yêu cầu T250 mà product được chọn có "T200" trong tên thì sai.

Hiện tại `getMaterial` có "t200/t250/t300" nhưng Patch 16 chỉ check `getProductType !== segType`, KHÔNG check material.

### Plan sửa (2 patch nhỏ, vẫn chỉ trong `lookup-tax-code/index.ts`)

#### Patch 17 — Cải thiện `getProductType`: ưu tiên keyword DÀI nhất

Sửa hàm `getProductType` để duyệt theo **độ dài giảm dần** của keyword, đồng thời thêm các type cha rõ ràng:
```ts
function getProductType(text: string): string {
  const norm = removeVietnameseTones(text);
  // Sort keywords by length DESC so "bao ve nem chong tham" beats "bao ve nem", "vo goi" beats "goi"
  const sorted = [...PRODUCT_TYPE_KEYWORDS].sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    if (norm.includes(kw)) return kw;
  }
  return '';
}
```
Đồng thời thêm vào `PRODUCT_TYPE_KEYWORDS`: `'bo chan ga goi'`, `'bo chan ga'`, `'bo ga goi'` để "Bộ chăn ga gối Tencel" được phân loại thành `bo chan ga goi`, KHÁC với segment `vo goi` → Patch 16 sẽ catch được và tự thay.

#### Patch 18 — Sanity check material trong validate-and-repair

Trong khối `if (isInCandidates || (productMatchesItem && typeMatchesSegment))` của Patch 16 (~line 399), thêm điều kiện reject:

```ts
// Patch 18: nếu segment có material cụ thể (T200/T250/...) và product chứa material KHÁC → reject
const segMaterial = (segments[bestSegIdx].material || '').toLowerCase();
const prodMaterial = matchedProduct ? getMaterial(matchedProduct.name + ' ' + (matchedProduct.specifications || '')) : '';
const materialMismatchHard = segMaterial && prodMaterial 
  && segMaterial !== prodMaterial 
  && !(segMaterial === 'lth' && prodMaterial === 't225')
  && !(segMaterial === 't225' && prodMaterial === 'lth');
```
Cộng `materialMismatchHard` vào điều kiện trigger sanity-fix:
```ts
if (priceOutlier || typeMismatchHard || materialMismatchHard) { ... }
```

Khi trigger, `findClosestProductScoped` sẽ tự tìm SP đúng material trong candidates (đã có scoring -20 cho material mismatch).

### Phạm vi & rủi ro

- 1 file `supabase/functions/lookup-tax-code/index.ts`, 2 patch độc lập
- Không đụng DB, RLS, UI, config
- Sau khi áp dụng, cùng input test sẽ:
  - Vỏ gối T200/T250/T300 sẽ được tự sửa về đúng SP (hoặc warning rõ "AI chọn sai material")
  - Vỏ gối Tencel sẽ KHÔNG còn map vào bộ chăn ga 2.2M (Patch 17 phân loại đúng → Patch 16 type-mismatch trigger)
  - Có thể xuất hiện warning "AI chọn ... (sai loại sản phẩm), đã thay bằng ..." — đây là behavior mong muốn

Bạn duyệt không?