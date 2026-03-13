

## Plan: Sửa lỗi Excel + Ctrl+V ảnh trực tiếp

### Vấn đề
1. **Excel**: AI model không thể đọc file Excel binary qua `image_url`. Cần parse Excel thành text (CSV) trên server trước khi gửi cho AI.
2. **Ảnh Ctrl+V**: Hiện phải chọn mode "Dán text" rồi mới paste ảnh được. Cần hỗ trợ Ctrl+V ảnh ngay từ giao diện chính, không cần chọn mode.

### Thay đổi

#### 1. Edge Function `lookup-tax-code/index.ts` — Parse Excel server-side
- Import thư viện `xlsx` từ CDN (SheetJS) trong Deno edge function
- Với file Excel: decode base64 → parse bằng SheetJS → chuyển thành CSV text → gửi text cho AI qua `parse_order_text` logic
- Với CSV: decode base64 → gửi text trực tiếp cho AI
- PDF giữ nguyên logic `image_url`

#### 2. Frontend `AIOrderAnalysis.tsx` — Ctrl+V ảnh mọi lúc
- Bỏ mode "image" riêng biệt. Thay bằng:
  - Textarea "Dán text" luôn hiển thị mặc định (không cần chọn mode)
  - Ctrl+V ảnh trong textarea → tự động phân tích ảnh ngay (đã có `handlePasteImage`)
  - Chỉ giữ 2 nút: **File Excel/PDF** (upload file) và nút **Trích xuất** (cho text)
- Hiển thị preview ảnh khi paste, kèm loading indicator
- Đơn giản hóa UX: mở ra là thấy textarea sẵn sàng, paste text hoặc ảnh đều được

### Không thay đổi
- Database, RLS, storage
- Logic xuất PDF/Word hợp đồng
- Prompt AI (đã cập nhật trước đó)

