

## Sửa lỗi: Toggle hình ảnh không thực sự tiết kiệm token AI

### Vấn đề
Toggle "Có hình ảnh" hiện chỉ tắt phần quét ảnh trong Storage (client-side) — **không liên quan đến token AI**. Dữ liệu gửi lên AI vẫn giữ nguyên 917 sản phẩm với đầy đủ `description` dù bật hay tắt, nên **chi phí token không giảm**.

Hàm `findPreviewImage` chỉ quét file trong Supabase Storage, không gọi AI — nên toggle hiện tại không tiết kiệm token.

### Giải pháp
Khi toggle hình ảnh **TẮT**:
1. **Bỏ trường `description`** khỏi dữ liệu gửi lên AI → giảm đáng kể token (917 sản phẩm × mỗi description)
2. **Bỏ `findPreviewImage`** hoàn toàn (đã có, giữ nguyên)
3. **Ẩn cột Ảnh** trong bảng kết quả (đã có, giữ nguyên)

Khi toggle hình ảnh **BẬT**:
1. Gửi đầy đủ `description` để AI match chính xác hơn
2. Chạy `findPreviewImage` quét Storage tìm ảnh
3. Hiện cột Ảnh

### Thay đổi

| File | Nội dung |
|------|----------|
| `src/components/AIQuoteFill.tsx` | Truyền `includeImages` vào body request, chỉ gửi `description` khi bật ảnh |
| `supabase/functions/lookup-tax-code/index.ts` | Nhận param `includeImages`, bỏ `description` khỏi productListText khi tắt ảnh → giảm token |

Ước tính tiết kiệm: ~30-50% token khi tắt ảnh (bỏ description 917 sản phẩm).

