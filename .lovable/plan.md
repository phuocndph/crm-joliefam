

## Sửa 3 lỗi logic lọc sản phẩm trong AI Quote Fill

### Lỗi 1 — Item-to-segment matching sai (nghiêm trọng nhất)

**Vấn đề**: `validateAndRepairItems()` gán "Bảo vệ nệm chống thấm chần bông" vào segment "chăn" (thay vì segment "bảo vệ nệm") vì chữ "chần" trong tên SP chứa "chan". Sau đó hệ thống "sửa" nó thành Chăn hè T250 — hoàn toàn sai.

**Sửa** (dòng 265-281, `validateAndRepairItems`):
- Đổi scoring để ưu tiên match dài hơn (longer segment type = higher priority)
- Thêm logic: nếu item match đúng type segment (cùng `getProductType`), ưu tiên segment đó
- Khi 2 segment có cùng điểm, chọn segment có type dài hơn hoặc match chính xác hơn
- Nếu item đã có valid ID trong catalog và ID thuộc đúng category của segment → KHÔNG sửa

### Lỗi 2 — Quantity parsing bỏ sót số đứng đầu dòng

**Vấn đề**: Input "10 ga chun 160x200x20cm" parse ra qty=1. Regex hiện tại chỉ bắt "Nc" (4c) hoặc "xN", không bắt "N spName".

**Sửa** (dòng 647-657, qty detection):
- Thêm regex mới cho leading number: `/^(\d+)\s+/` trên leadingText
- Thêm regex: `/^(\d+)\s/` cho đầu chunk (trước keyword)
- Thứ tự ưu tiên: leadingText "Nc" > leadingText "N cái" > leadingText bare number > chunk patterns

### Lỗi 3 — Category mapping "vỏ chăn" quá rộng (128 candidates)

**Vấn đề**: `'vỏ chăn': ['chăn']` match tất cả SP có "chăn" (chăn hè, vỏ chăn chần, ruột chăn...).

**Sửa** (TYPE_TO_CATEGORY, dòng 724):
- `'vỏ chăn': ['vỏ chăn']` thay vì `['chăn']`
- Giữ `'chăn': ['chăn']` cho trường hợp chung

### File cần sửa
- `supabase/functions/lookup-tax-code/index.ts` — cả 3 lỗi đều nằm trong file này

### Kết quả mong đợi
- "Bảo vệ nệm" match đúng segment "bảo vệ nệm", không bị sửa thành chăn
- "10 ga chun" parse ra qty=10, "20 ruột gối" parse ra qty=20
- "vỏ chăn T225 sọc" chỉ có ~10-20 candidates thay vì 128

