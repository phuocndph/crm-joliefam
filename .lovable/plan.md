
Mình đã rà lại luồng hiện tại và thấy lý do chính vì sao “chưa có hình ảnh” dù log báo đã tìm được 43 ảnh:

### Nguyên nhân thật sự

1. `CreateQuoteForm.tsx` hiện đang match ảnh bằng **tên file trong bucket**.
2. Nhưng `ProductImageLibrary.tsx` khi upload ảnh lại đặt tên file kiểu:
   - `folderName/${Date.now()}-${random}.${ext}`
3. Nghĩa là tên file storage gần như **không còn liên quan tới tên sản phẩm** nữa.
4. Kết quả:
   - Hệ thống có quét được ảnh
   - Nhưng thuật toán so khớp theo tên sản phẩm gần như không thể tìm ra ảnh đúng
   - Nên `selectedImage` vẫn rỗng

Ngoài ra, trong `AIQuoteFill.tsx` phần preview kết quả AI hiện **không có cột hình ảnh**, nên kể cả sau này match được thì người dùng vẫn tưởng là chưa lấy ảnh ở bước xem trước.

### Kế hoạch sửa

#### 1. Sửa nguồn dữ liệu để có thể match ảnh đúng
Cập nhật `ProductImageLibrary.tsx` để khi upload ảnh mới:
- giữ lại tên file gốc đã được sanitize, thay vì luôn đổi thành timestamp-random
- ví dụ:
```text
san-ga-chun-ks-t250-trang-tron-160x200x14cm.jpg
```
Điều này giúp ảnh mới upload về sau có thể được AI match theo tên sản phẩm.

#### 2. Cải thiện thuật toán match ảnh trong `CreateQuoteForm.tsx`
Thay vì chỉ match theo `img.name`, sẽ chấm điểm theo nhiều nguồn:
- `customName`
- tên sản phẩm gốc
- `specifications`
- cả `fullPath` và tên file không extension

Ưu tiên:
- exact match
- includes match
- overlap theo từ khóa có nghĩa

Mục tiêu là tăng khả năng bắt đúng ảnh với các tên gần đúng.

#### 3. Hỗ trợ ảnh cũ đã upload bằng tên ngẫu nhiên
Vì thư viện hiện có nhiều ảnh cũ tên random, kế hoạch sẽ thêm fallback:
- nếu không match được theo tên file
- thử match theo **tên thư mục/category** nếu thư mục đang đại diện cho dòng sản phẩm
- nếu vẫn không đủ tin cậy thì giữ nguyên không tự gán sai ảnh

Lưu ý: ảnh cũ tên random sẽ vẫn khó match hoàn hảo nếu không có metadata tên sản phẩm đi kèm.

#### 4. Hiển thị ảnh ngay trong preview AI
Cập nhật `AIQuoteFill.tsx` để phần “Kết quả AI” có thêm cột xem trước hình ảnh nếu đã tìm được.
Điều này giúp người dùng biết ngay ảnh đã được gán hay chưa, thay vì chỉ thấy sau khi áp dụng vào bảng báo giá.

### File dự kiến cập nhật

| File | Thay đổi |
|------|----------|
| `src/components/ProductImageLibrary.tsx` | Đổi cách đặt tên file upload để giữ tên sản phẩm đã sanitize, không dùng hoàn toàn timestamp-random |
| `src/components/CreateQuoteForm.tsx` | Nâng cấp logic auto-match ảnh theo tên file + fullPath + fallback thư mục |
| `src/components/AIQuoteFill.tsx` | Thêm hiển thị preview hình ảnh trong bảng kết quả AI |

### Kỳ vọng sau khi sửa

- Ảnh mới upload sẽ tự match đúng hơn nhiều
- AI điền báo giá sẽ có khả năng tự lấy ảnh cho sản phẩm
- Người dùng nhìn thấy ngay ảnh đã được gán trong bước preview
- Với ảnh cũ tên random, hệ thống có thể cải thiện một phần nhưng không đảm bảo 100% nếu không đổi lại tên ảnh cho có nghĩa

### Ghi chú kỹ thuật
Hiện đây là điểm nghẽn lớn nhất:

```text
Upload ảnh:
folder/timestamp-random.jpg

Match ảnh:
so sánh tên sản phẩm với tên file
```

Hai bên không cùng ngôn ngữ dữ liệu nên match thất bại.

Sửa đúng hướng là:

```text
Upload ảnh:
folder/ten-san-pham-da-sanitize.jpg

Match ảnh:
so sánh tên sản phẩm với tên file/fullPath
```

Nếu muốn xử lý triệt để cả ảnh cũ lẫn ảnh mới về lâu dài, hướng tốt hơn nữa là lưu thêm metadata hoặc một bảng mapping ảnh ↔ sản phẩm, nhưng với yêu cầu hiện tại mình sẽ ưu tiên sửa theo tên file trước vì ít thay đổi hơn và bám sát cấu trúc sẵn có.
