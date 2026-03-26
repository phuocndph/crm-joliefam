

## Tích hợp Hoá đơn điện tử Viettel S-Invoice (VinVoice)

### Tổng quan
Thêm chức năng tạo và quản lý hoá đơn điện tử trực tiếp từ hợp đồng, kết nối API Viettel S-Invoice (vinvoice.viettel.vn). Từ mỗi hợp đồng kinh tế, người dùng có thể xuất hoá đơn điện tử với dữ liệu được tự động điền từ thông tin hợp đồng.

### Yêu cầu trước khi triển khai
Bạn cần có tài khoản Viettel S-Invoice (vinvoice.viettel.vn) với:
- Username (thường là MST + mã chi nhánh, ví dụ: `0316956049-001`)
- Password
- Mã số thuế doanh nghiệp (supplierTaxCode)
- Template code và Invoice series (khai báo trên hệ thống S-Invoice)
- API endpoint (mặc định: `https://api-vinvoice.viettel.vn`)

### Thay đổi cụ thể

#### 1. Thêm Secrets (4 secrets mới)
- `VINVOICE_USERNAME` - Tài khoản đăng nhập S-Invoice
- `VINVOICE_PASSWORD` - Mật khẩu S-Invoice
- `VINVOICE_TAX_CODE` - MST doanh nghiệp (supplierTaxCode)
- `VINVOICE_API_URL` - API endpoint (mặc định `https://api-vinvoice.viettel.vn`)

#### 2. Edge Function: `vinvoice-api`
**File:** `supabase/functions/vinvoice-api/index.ts`

Xử lý các actions:
- **login**: Gọi `POST /auth/login` để lấy access_token
- **create_invoice**: Gọi `POST /services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/{taxCode}` - Tự động map dữ liệu hợp đồng sang format S-Invoice (generalInvoiceInfo, buyerInfo, sellerInfo, itemInfo, summarizeInfo)
- **get_invoice**: Tra cứu hoá đơn theo transactionUuid
- **get_invoice_file**: Tải file PDF/ZIP hoá đơn
- **get_templates**: Lấy danh sách mẫu hoá đơn

```text
Flow tạo hoá đơn:
Frontend → Edge Function → Login (lấy token) → createInvoice → Lưu kết quả vào DB
```

Mapping dữ liệu hợp đồng → S-Invoice:
```text
contract.seller_info    → sellerInfo (tên, MST, địa chỉ, SĐT, email, ngân hàng)
contract.buyer_info     → buyerInfo (tên, MST, địa chỉ, SĐT, email)
contract.items          → itemInfo[] (tên SP, đơn giá, SL, thành tiền, thuế)
contract.total_amount   → summarizeInfo (tổng tiền, thuế, tổng cộng)
contract.vat_rate       → taxBreakdowns
```

#### 3. Database: Bảng `einvoices`
Lưu lịch sử hoá đơn đã phát hành:

| Column | Type | Mô tả |
|--------|------|-------|
| id | uuid | PK |
| contract_id | uuid | FK → contracts |
| transaction_uuid | text | UUID giao dịch S-Invoice |
| invoice_number | text | Số hoá đơn (từ S-Invoice) |
| invoice_type | text | Loại HĐ (01GTKT0, ...) |
| template_code | text | Mã mẫu |
| invoice_series | text | Ký hiệu |
| status | text | draft/issued/cancelled |
| issued_date | timestamptz | Ngày phát hành |
| total_amount | numeric | Tổng tiền |
| response_data | jsonb | Response đầy đủ từ API |
| manager_id, tenant_id | text | RLS fields |

#### 4. Frontend: Component `CreateEInvoiceDialog`
**File:** `src/components/CreateEInvoiceDialog.tsx`

Dialog cho phép:
- Xem trước dữ liệu hoá đơn (tự động điền từ hợp đồng)
- Chọn mẫu hoá đơn (template_code, invoice_series)
- Chọn hình thức thanh toán (TM/CK/TM/CK)
- Chỉnh sửa thông tin người mua nếu cần
- Xem trước nháp (preview draft) trước khi phát hành
- Nút "Phát hành hoá đơn" gọi edge function

#### 5. Trang ContractManagement: Thêm nút + tab
**File:** `src/pages/ContractManagement.tsx`
- Thêm menu item "Xuất hoá đơn điện tử" vào dropdown actions của mỗi hợp đồng kinh tế
- Thêm tab "Hoá đơn điện tử" hiển thị danh sách hoá đơn đã phát hành (bảng einvoices)
- Nút tải PDF hoá đơn

### Chi tiết kỹ thuật

**API Viettel S-Invoice v2.0 (VinVoice):**
- Base URL: `https://api-vinvoice.viettel.vn`
- Auth: `POST /auth/login` → trả về `access_token`
- Tạo HĐ: `POST /services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/{taxCode}`
- Cookie header: `access_token:{token}`
- Content-Type: `application/json`
- Xem nháp: `POST /services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/previewDraftInvoice`
- Tải file: `POST /services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile`

**IP Whitelist**: S-Invoice yêu cầu whitelist IP. Edge function chạy trên Supabase infrastructure, IP có thể thay đổi → cần hướng dẫn user cấu hình IP trên hệ thống S-Invoice hoặc tắt whitelist.

### Không thay đổi
- Logic hợp đồng hiện tại
- Các trang khác
- Schema bảng contracts

