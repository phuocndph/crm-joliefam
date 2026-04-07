

## Tối ưu AI báo giá: Cache danh sách sản phẩm dạng có cấu trúc

### Phân tích ý tưởng

Ý tưởng của bạn rất hay: thay vì mỗi lần gửi toàn bộ 917 sản phẩm dạng text thô cho AI (tốn ~15-20K tokens), ta **xây sẵn một "catalog" có cấu trúc, phân loại** và lưu cache trên Supabase Storage. Khi AI cần tìm, chỉ cần đọc file đã tối ưu sẵn.

### Hiệu quả thực tế

| Yếu tố | Hiện tại | Sau tối ưu |
|---------|----------|------------|
| Token gửi AI | ~15-20K (917 SP raw) | ~8-10K (catalog phân loại, nén gọn) |
| Tốc độ AI xử lý | Chậm (prompt dài, AI phải tự phân loại) | Nhanh hơn ~40% (dữ liệu đã cấu trúc sẵn) |
| Độ chính xác | AI phải tự hiểu cấu trúc SP | Cao hơn nhờ phân nhóm rõ ràng |
| Chi phí/request | ~$0.01-0.02 | ~$0.005-0.01 |

### Giải pháp: Product Catalog Cache

#### 1. Tạo Edge Function `build-product-catalog`
- Đọc toàn bộ sản phẩm từ DB
- Phân loại tự động theo danh mục (Ga/Drap, Gối, Rèm, Phụ kiện...)
- Nhóm theo loại vải (T225/LTH, T250, KS, Cotton...)
- Tạo format nén: bỏ trường thừa, chỉ giữ id, tên ngắn, giá, quy cách
- Lưu file JSON lên Supabase Storage (bucket `product-images` hoặc tạo bucket mới)

#### 2. Cập nhật `AIQuoteFill.tsx`
- Khi mở AI Quote Fill, kiểm tra cache có tồn tại và còn mới không (so sánh timestamp)
- Nếu cache cũ hoặc chưa có → gọi `build-product-catalog` để rebuild
- Gửi catalog đã phân loại cho AI thay vì raw product list

#### 3. Format catalog tối ưu cho AI

```text
=== GA/DRAP ===
[T225/LTH]
id1 | Ga T225 1m | 120000đ | 100x200cm
id2 | Ga T225 1m2 | 140000đ | 120x200cm
...
[T250]
id10 | Ga T250 1m | 150000đ | 100x200cm
...

=== GỐI ===
[Vỏ gối - T225]
id50 | Vỏ gối T225 | 35000đ | 35x50cm
[Ruột gối]
id60 | Ruột gối bông | 25000đ | 35x50cm

=== RÈM ===
...
```

AI đọc dạng này sẽ:
- Biết ngay cấu trúc danh mục → tìm nhanh hơn
- Tự hiểu "vải LTH = T225" nhờ nhóm sẵn
- Không cần scan 917 dòng, chỉ đọc nhóm liên quan

### Thay đổi

| File | Nội dung |
|------|----------|
| `supabase/functions/build-product-catalog/index.ts` | **Mới.** Đọc products từ DB, phân loại theo danh mục + loại vải, tạo catalog text tối ưu, lưu vào Storage |
| `src/components/AIQuoteFill.tsx` | Thay vì gửi raw `products`, tải catalog từ Storage (có cache client-side). Nếu chưa có catalog → gọi build trước |
| `supabase/functions/lookup-tax-code/index.ts` | Nhận `catalogText` thay vì `products` array, prompt ngắn gọn hơn |

### Lưu ý
- Catalog tự rebuild khi có sản phẩm mới (kiểm tra timestamp)
- Giữ fallback: nếu catalog lỗi → vẫn gửi raw products như hiện tại
- Có thể thêm nút "Cập nhật catalog" trong UI cho admin

