

## Triển khai tích hợp Hoá đơn điện tử Viettel S-Invoice

### Thông tin cấu hình
- **Username**: `0108652480`
- **Password**: `123456aA@`
- **Tax code**: `0108652480`
- **API URL**: `https://api-vinvoice.viettel.vn`

### Các bước triển khai

#### 1. Thêm 4 secrets
Lưu thông tin đăng nhập S-Invoice vào Supabase secrets:
- `VINVOICE_USERNAME` = `0108652480`
- `VINVOICE_PASSWORD` = `123456aA@`
- `VINVOICE_TAX_CODE` = `0108652480`
- `VINVOICE_API_URL` = `https://api-vinvoice.viettel.vn`

#### 2. Database migration: Bảng `einvoices`
Tạo bảng lưu lịch sử hoá đơn điện tử với RLS policies theo pattern hiện có (manager_id based).

#### 3. Edge Function: `vinvoice-api`
**File:** `supabase/functions/vinvoice-api/index.ts`

Xử lý các actions:
- `login` → `POST /auth/login` lấy access_token
- `create_invoice` → Map dữ liệu hợp đồng sang format S-Invoice, gọi API tạo HĐ, lưu kết quả vào DB
- `get_invoice_file` → Tải PDF hoá đơn
- `get_templates` → Lấy danh sách mẫu HĐ

Auth flow: Login trước mỗi request → dùng token trong Cookie header.

#### 4. Frontend: `CreateEInvoiceDialog`
**File:** `src/components/CreateEInvoiceDialog.tsx`

Dialog hiển thị:
- Thông tin bên bán/bên mua (từ hợp đồng)
- Bảng sản phẩm với VAT
- Chọn hình thức thanh toán
- Nút phát hành hoá đơn

#### 5. Cập nhật `ContractManagement.tsx`
- Thêm menu item "Xuất hoá đơn ĐT" vào dropdown actions
- Thêm tab "Hoá đơn ĐT" hiển thị danh sách hoá đơn đã phát hành

### Không thay đổi
- Logic hợp đồng hiện tại, các trang khác, schema bảng contracts

