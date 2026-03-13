

## Plan: AI phân tích đơn hàng/sản phẩm tự động điền vào hợp đồng

### Hiện trạng
Form tạo hợp đồng hiện có AI phân tích **thông tin Bên B** (công ty, MST, địa chỉ) qua text và ảnh. Nhưng **bảng sản phẩm** (tên SP, quy cách, SL, đơn giá) vẫn phải nhập thủ công.

### Giải pháp
Thêm khu vực AI phân tích đơn hàng/sản phẩm ngay trên bảng sản phẩm, hỗ trợ 3 hình thức:
1. **Ảnh chụp** — chụp bảng báo giá, đơn hàng, hóa đơn
2. **Text** — dán nội dung đơn hàng dạng văn bản
3. **File Excel/PDF** — tải file có bảng sản phẩm

AI sẽ trích xuất danh sách sản phẩm và tự động điền vào bảng items.

### Chi tiết kỹ thuật

#### 1. Edge Function `lookup-tax-code/index.ts` — Thêm type mới
- **`parse_order_text`**: Nhận text, AI trích xuất mảng sản phẩm `[{name, specifications, quantity, price}]`
- **`parse_order_image`**: Nhận ảnh (base64), AI đọc bảng sản phẩm từ ảnh
- **`parse_order_file`**: Nhận file base64 (Excel/PDF), AI trích xuất bảng sản phẩm
  - Excel: Dùng AI đọc nội dung CSV-like từ base64
  - PDF: Tương tự logic extract-document, gửi cho AI phân tích

Prompt hệ thống cho cả 3 loại:
```
Trích xuất danh sách sản phẩm/dịch vụ. Trả JSON:
{"items": [{"name":"...", "specifications":"...", "quantity":1, "price":0}]}
```

#### 2. Frontend `CreateContractForm.tsx` — Thêm UI phân tích SP
- Thêm block mới **phía trên bảng sản phẩm** (tương tự block AI Bên B)
- 3 nút: **AI Text** (dán text) | **Ảnh** (upload/paste) | **File** (Excel, PDF)
- Khi AI trả kết quả → replace/append items vào bảng sản phẩm
- Hiển thị preview ảnh và tên file đã tải

#### 3. Cũng tích hợp vào `EditContractDialog.tsx`
- Áp dụng cùng logic cho form sửa hợp đồng

### Không thay đổi
- Database, RLS, storage buckets
- Logic xuất PDF/Word

