

# Xây dựng Hệ thống Template Hợp đồng theo mẫu

## Phân tích hợp đồng mẫu

Hợp đồng mẫu có cấu trúc 7 điều khoản chuẩn:

```text
┌─────────────────────────────────────────────┐
│  CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM       │
│  HỢP ĐỒNG KINH TẾ - Số: XXXX              │
│                                             │
│  Căn cứ pháp lý (Luật thương mại, dân sự)  │
│                                             │
│  BÊN A (Bên bán): Tên, ĐD, địa chỉ, MST,  │
│    SĐT, STK ngân hàng                      │
│  BÊN B (Bên mua): Tên, ĐD, địa chỉ, MST   │
│                                             │
│  ĐIỀU 1: Bảng sản phẩm                     │
│  ┌──┬──────┬────────┬────┬───────┬────────┐ │
│  │TT│Sản phẩm│Kích thước│SL│Đơn giá│Tổng  │ │
│  ├──┼──────┼────────┼────┼───────┼────────┤ │
│  │..│......│........│...│.......│........│ │
│  └──┴──────┴────────┴────┴───────┴────────┘ │
│  TỔNG / VAT / TỔNG SAU VAT                 │
│                                             │
│  ĐIỀU 2: Giao nhận (địa điểm, thời gian)   │
│  ĐIỀU 3: Thanh toán (đợt cọc, đợt cuối)    │
│  ĐIỀU 4: Trách nhiệm mỗi bên              │
│  ĐIỀU 5: Bất khả kháng                     │
│  ĐIỀU 6: Giải quyết tranh chấp             │
│  ĐIỀU 7: Điều khoản chung                  │
│                                             │
│  ĐẠI DIỆN BÊN A          ĐẠI DIỆN BÊN B   │
└─────────────────────────────────────────────┘
```

## Kế hoạch triển khai

### 1. Database: Bảng `contract_templates`

Lưu các loại hợp đồng mẫu (VD: "HĐ Kinh tế", "HĐ Rèm cửa", "HĐ Nội thất"):

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | uuid | PK |
| name | text | Tên loại HĐ |
| legal_basis | jsonb | Các căn cứ pháp lý |
| seller_info | jsonb | Thông tin Bên A mặc định |
| item_columns | jsonb | Cấu hình cột bảng SP (tên, kích thước, SL, đơn giá...) |
| articles | jsonb | 7 điều khoản mẫu (mảng các điều) |
| include_vat | boolean | Có tính VAT không |
| vat_rate | numeric | % VAT |
| payment_terms | jsonb | Điều khoản thanh toán (% cọc, đợt) |
| manager_id, tenant_id | text | RBAC |

### 2. Cải thiện `CreateContractForm.tsx`

- **Bước 1**: Chọn loại hợp đồng (template) -> tự động điền điều khoản, cấu hình cột SP
- **Bước 2**: Nhập thông tin Bên B (khách hàng - tự động từ danh sách)
- **Bước 3**: Bảng sản phẩm động với các cột theo template (TT, Sản phẩm, Kích thước, SL, Đơn giá, Tổng)
  - Thêm/xóa dòng SP linh hoạt
  - Tự động tính: Tổng = SL x Đơn giá, TỔNG, VAT, TỔNG SAU VAT
- **Bước 4**: Chỉnh sửa điều khoản (có thể sửa nội dung từng điều)

### 3. Cải thiện `ContractPreviewDialog.tsx`

Render đúng format hợp đồng mẫu:
- Header: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" + tiêu đề
- Thông tin Bên A / Bên B đầy đủ (tên, đại diện, chức vụ, địa chỉ, MST, STK)
- Bảng sản phẩm với TỔNG / VAT / TỔNG SAU VAT
- 7 điều khoản đầy đủ
- Khung ký tên hai bên

### 4. Trang quản lý template `ContractTemplateManager.tsx`

- Danh sách các loại HĐ mẫu đã tạo
- Tạo mới / Sửa / Xóa template
- Form cấu hình: tên, căn cứ pháp lý, cột SP, điều khoản mẫu, VAT, thanh toán

### 5. Tích hợp thông tin Bên A từ `quote_template_settings`

Dùng lại thông tin công ty (tên, địa chỉ, MST, STK) đã cấu hình trong cài đặt báo giá làm thông tin Bên A mặc định.

## Các file cần tạo/sửa

| File | Hành động |
|------|-----------|
| Migration SQL | Tạo bảng `contract_templates` + RLS |
| `src/components/ContractTemplateManager.tsx` | Tạo mới - quản lý loại HĐ |
| `src/hooks/useContractTemplates.ts` | Tạo mới - CRUD templates |
| `src/components/CreateContractForm.tsx` | Sửa - thêm chọn template, bảng SP động, tính toán tự động |
| `src/components/ContractPreviewDialog.tsx` | Sửa - render đúng format chuẩn 7 điều |
| `src/pages/ContractManagement.tsx` | Sửa - thêm tab/nút quản lý template |

