

## Chuyển sang liên kết trực tiếp VinVoice

Thay vì gọi API S-Invoice phức tạp, đơn giản hoá trang Hoá đơn điện tử bằng cách dẫn link trực tiếp đến `https://vinvoice.viettel.vn/`.

### Thay đổi

**File: `src/pages/EInvoiceManagement.tsx`**

1. Thêm nút **"Mở VinVoice"** nổi bật ở header, mở tab mới đến `https://vinvoice.viettel.vn/`
2. Giữ nguyên bảng danh sách hoá đơn đã lưu local (nếu có dữ liệu)
3. Thêm card hướng dẫn nhanh: "Đăng nhập VinVoice để tạo và quản lý hoá đơn điện tử"

**File: `src/components/CreateEInvoiceDialog.tsx`**

4. Giữ dialog nhưng thêm nút "Mở VinVoice" bên cạnh nút tạo hoá đơn, để user có thể chọn tạo trực tiếp trên web Viettel
5. Giảm bớt logic gọi API `get_templates` — nếu không lấy được thì chỉ hiện link VinVoice thay vì báo lỗi

### Không thay đổi
- Edge function `vinvoice-api` vẫn giữ nguyên (có thể dùng sau)
- Bảng `einvoices` vẫn giữ để lưu lịch sử

