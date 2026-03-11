

# Tính năng Quản lý Hợp đồng

## Tổng quan
Xây dựng module quản lý hợp đồng tự động, tích hợp với hệ thống báo giá và đơn hàng hiện có. Hợp đồng được tạo nhanh từ báo giá hoặc đơn hàng, có template tùy chỉnh và theo dõi trạng thái.

## Database

### Bảng `contracts`
| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | uuid | PK |
| contract_number | text | Mã hợp đồng (tự động: HD-YYYYMMDD-XXX) |
| customer_id | uuid | Liên kết khách hàng |
| order_id | uuid | Liên kết đơn hàng (nullable) |
| quote_id | uuid | Liên kết báo giá (nullable) |
| title | text | Tiêu đề hợp đồng |
| content | text | Nội dung/điều khoản |
| total_amount | numeric | Tổng giá trị |
| deposit_amount | numeric | Tiền cọc |
| deposit_percentage | numeric | % cọc (mặc định 70) |
| status | text | draft/active/completed/cancelled |
| contract_date | timestamptz | Ngày ký |
| start_date | timestamptz | Ngày bắt đầu |
| end_date | timestamptz | Ngày kết thúc |
| items | jsonb | Danh sách sản phẩm/dịch vụ |
| terms | jsonb | Điều khoản hợp đồng |
| notes | text | Ghi chú |
| manager_id | text | RBAC |
| tenant_id | text | Multi-tenant |

RLS policies theo pattern RBAC hiện có (admin/manager/employee/accountant).

### Bảng `contract_template_settings`
Tương tự `quote_template_settings`, lưu thông tin công ty, điều khoản mặc định cho hợp đồng.

## Frontend

### 1. Trang `ContractManagement.tsx`
- Danh sách hợp đồng dạng bảng với tìm kiếm, lọc theo trạng thái
- Badge màu theo trạng thái (draft=gray, active=blue, completed=green, cancelled=red)
- Nút tạo hợp đồng mới hoặc tạo từ báo giá/đơn hàng

### 2. Form tạo hợp đồng `CreateContractForm.tsx`
- Chọn khách hàng, liên kết báo giá/đơn hàng (tự động điền thông tin)
- Nhập sản phẩm, giá trị, % cọc
- Chọn ngày ký, ngày bắt đầu, ngày kết thúc
- Điều khoản mặc định từ template, có thể chỉnh sửa

### 3. Xem trước & xuất hợp đồng `ContractPreviewDialog.tsx`
- Hiển thị hợp đồng dạng chuyên nghiệp (tương tự QuotePreviewDialog)
- Xuất PDF/ảnh (dùng html2canvas như báo giá)
- Xuất Excel (dùng ExcelJS)
- In trực tiếp

### 4. Tạo nhanh từ báo giá
- Thêm nút "Tạo hợp đồng" trên trang Báo giá
- Tự động map: khách hàng, sản phẩm, giá trị từ báo giá sang hợp đồng

### 5. Sidebar & Routing
- Thêm menu "Hợp đồng" vào sidebar (icon: FileSignature)
- Route: `/contracts`
- Permission: `contracts`

## Hooks
- `useContracts.ts`: CRUD operations, tìm kiếm, lọc
- `useContractTemplateSettings.ts`: Quản lý template hợp đồng

## Các file cần tạo/sửa

| File | Hành động |
|------|-----------|
| Migration SQL | Tạo bảng `contracts`, `contract_template_settings` + RLS |
| `src/pages/ContractManagement.tsx` | Tạo mới |
| `src/components/CreateContractForm.tsx` | Tạo mới |
| `src/components/ContractPreviewDialog.tsx` | Tạo mới |
| `src/components/EditContractDialog.tsx` | Tạo mới |
| `src/components/DeleteContractDialog.tsx` | Tạo mới |
| `src/components/ContractTemplateSettings.tsx` | Tạo mới |
| `src/hooks/useContracts.ts` | Tạo mới |
| `src/hooks/useContractTemplateSettings.ts` | Tạo mới |
| `src/components/ui/app-sidebar.tsx` | Thêm menu Hợp đồng |
| `src/App.tsx` | Thêm route `/contracts` |
| `src/pages/QuotesPage.tsx` | Thêm nút "Tạo hợp đồng" từ báo giá |

