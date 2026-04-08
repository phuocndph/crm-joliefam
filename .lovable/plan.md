

## Cải thiện prompt AI Quote Fill

### Vấn đề hiện tại

| # | Vấn đề | Ảnh hưởng |
|---|--------|-----------|
| 1 | Gửi full catalog raw thay vì dùng catalog cache thu gọn đã có | Token lãng phí, AI chậm, dễ lạc |
| 2 | Thiếu JSON output mẫu hoàn chỉnh (few-shot) | AI trả sai format |
| 3 | Mặc định cứng T250 khi không ghi chất liệu | Có thể match nhầm |
| 4 | Thiếu phân biệt rõ ruột gối (lõi bông) vs vỏ gối (theo vải) | Nhầm sản phẩm |
| 5 | Ví dụ phân tích chỉ mô tả logic, không kèm JSON output | AI không rõ format kỳ vọng |

### Sửa đổi

#### File: `supabase/functions/lookup-tax-code/index.ts`

**1. Dùng catalog cache thu gọn thay vì raw DB**
- Thay vì query `products` table trực tiếp, gọi `build-product-catalog` hoặc đọc catalog từ Storage (`catalog/product-catalog-{managerId}.json`) — đã có sẵn, thu gọn ~50% token.
- Nếu không có managerId (chưa xác định), fallback về query DB như hiện tại.

**2. Thêm few-shot JSON output mẫu hoàn chỉnh**
```text
## VÍ DỤ OUTPUT
Input: "ga chun 1m6 14p t250 trang x2, vo goi nam 45x65 t300 soc x4"
Output:
{"items":[
  {"matchedProductId":"abc-123","customName":"Ga chun T250 trơn 160x200x14cm","quantity":2,"price":208000,"specifications":"160 x 200 x 14cm","note":"Kích thước 14cm làm tròn lên 15cm"},
  {"matchedProductId":"def-456","customName":"Vỏ gối nằm T300 sọc 45x65","quantity":4,"price":45000,"specifications":"45 x 65cm","note":""}
]}
```

**3. Sửa rule mặc định chất liệu**
- Đổi từ "Mặc định T250 nếu không ghi" → "Nếu không ghi chất liệu, chọn sản phẩm T250. Nếu không có T250, ưu tiên sản phẩm phổ biến nhất cùng loại"

**4. Thêm rule ruột gối vs vỏ gối rõ ràng**
```text
- "Vỏ gối"/"bao gối" = vỏ bọc, phân theo vải (T250/T300...) và mẫu (trơn/sọc)
- "Ruột gối"/"lõi gối" = lõi bông bên trong, KHÔNG phân theo vải/mẫu
- KHÔNG được nhầm 2 loại này với nhau
```

**5. Rút gọn phần ví dụ phân tích**
- Gộp 3 ví dụ phân tích logic hiện tại thành 1 ví dụ phức tạp nhất + 1 JSON output tương ứng
- Giảm ~500 chars prompt mà vẫn đủ hướng dẫn

### Kết quả kỳ vọng
- Giảm ~30-50% token prompt (dùng catalog thu gọn)
- AI trả đúng format JSON hơn nhờ few-shot example
- Match chính xác hơn cho ruột gối vs vỏ gối
- Linh hoạt hơn khi khách không ghi chất liệu

