

## Thêm tính năng gửi hình ảnh để phân tích trong AI Quote Fill

### Mục tiêu
Cho phép người dùng upload 1 hình ảnh (ảnh chụp báo giá, đơn hàng, tin nhắn khách) để AI phân tích và so khớp sản phẩm từ bảng giá — thay vì chỉ nhập text.

### Thay đổi

**1. Frontend — `src/components/AIQuoteFill.tsx`**
- Thêm state `imageFile` và `imagePreview` để lưu ảnh đã chọn
- Thêm nút upload ảnh (icon Camera/Upload) bên cạnh textarea
- Hỗ trợ dán ảnh trực tiếp (Ctrl+V) vào textarea
- Hiển thị preview ảnh nhỏ khi đã chọn, có nút X để xóa
- Sửa validation: cho phép gửi khi có text HOẶC có ảnh (không bắt buộc cả hai)
- Khi gửi có ảnh: convert sang base64, gửi kèm `imageBase64` và `imageMimeType` trong body request
- Khi gửi chỉ text: giữ nguyên logic cũ

**2. Backend — `supabase/functions/lookup-tax-code/index.ts`**
- Trong handler `ai_quote_fill`: kiểm tra thêm `data.imageBase64`
- Nếu có ảnh: gửi message dạng multimodal (image_url + text) kèm danh sách sản phẩm bảng giá
- Nếu chỉ text: giữ nguyên logic hiện tại
- Nếu có cả ảnh + text: gộp cả hai vào prompt

### Flow hoạt động

```text
User chọn ảnh (hoặc dán Ctrl+V) → preview hiển thị
User nhấn "AI tự chọn sản phẩm"
→ Convert ảnh → base64
→ Gửi { type: "ai_quote_fill", data: { products, request, imageBase64, imageMimeType } }
→ Edge Function tạo message multimodal [image + text + product list]
→ AI phân tích → trả về items
→ Hiển thị preview table như cũ
```

### Redeploy
- Edge Function `lookup-tax-code`

