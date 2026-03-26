

## Redesign form tạo hoá đơn theo giao diện VinVoice

Chuyển layout dialog từ dạng card xếp dọc sang **2 cột ngang** giống vinvoice.viettel.vn:

### Layout mới

```text
┌─────────────────────────────┬──────────────────────────────┐
│  THÔNG TIN KHÁCH HÀNG       │  THÔNG TIN HOÁ ĐƠN          │
│                              │                              │
│  ☐ Người mua không lấy HĐ   │  Mã cửa hàng | Tên cửa hàng │
│  Tìm kiếm [MST]        [+]  │  Hình thức TT | Chi tiết HTTT│
│  Tên người mua               │  Loại tiền    | Tỷ giá       │
│  Địa chỉ                    │  Mẫu hoá đơn *               │
│  Tên đơn vị                 │  Ký hiệu hoá đơn *           │
│  MST        | Hợp đồng số   │  Số bảng kê                  │
│  SĐT        | Email         │  Ngày bảng kê                │
│  Loại giấy tờ | Số giấy tờ  │  Số lượng nhân bản           │
│  Tên NH     | Số TK         │                              │
└─────────────────────────────┴──────────────────────────────┘
├── Bảng hàng hoá / dịch vụ (full width) ──────────────────────┤
├── Tổng cộng ─────────────────────────────────────────────────┤
├── [Quay lại] [Xoá dữ liệu] [Xem trước] [Lập HĐ nháp] ─────┤
```

### Thay đổi trong `CreateEInvoiceDialog.tsx`

**Phần trên - 2 cột:**

1. **Cột trái - THÔNG TIN KHÁCH HÀNG**: Thêm các trường mới theo VinVoice:
   - Checkbox "Người mua không lấy hoá đơn"
   - Tìm kiếm MST (giữ nguyên logic lookup hiện tại)
   - Tên người mua, Địa chỉ, Tên đơn vị (company)
   - MST + Hợp đồng số (2 cột)
   - SĐT + Email (2 cột)
   - Loại giấy tờ (Select) + Số giấy tờ
   - Tên ngân hàng + Số tài khoản

2. **Cột phải - THÔNG TIN HOÁ ĐƠN**: Gộp cấu hình hoá đơn vào đây:
   - Hình thức thanh toán + Chi tiết hình thức
   - Loại tiền (VND) + Tỷ giá
   - Mẫu hoá đơn (templateCode) + Ký hiệu hoá đơn (invoiceSeries)
   - Số lượng nhân bản

**Phần dưới - full width:**
- Bảng hàng hoá / dịch vụ (giữ nguyên)
- Tổng cộng (giữ nguyên)

**Nút actions:**
- Thay đổi style nút: Quay lại, Xoá dữ liệu nhập, Xem trước, Lập hoá đơn nháp

### State mới cần thêm
- `noInvoiceBuyer` (boolean) - checkbox người mua không lấy HĐ
- `paymentDetail` (string) - chi tiết hình thức TT
- `currency` (string, default "VND")
- `exchangeRate` (number, default 1)
- `contractNumber` (string) - hợp đồng số
- `buyerIdType` (string) - loại giấy tờ
- `buyerIdNumber` (string) - số giấy tờ
- `buyerBankName` (string) - tên ngân hàng
- `buyerBankAccount` (string) - số tài khoản
- `copyCount` (number) - số lượng nhân bản

### File thay đổi
| File | Thay đổi |
|------|----------|
| `src/components/CreateEInvoiceDialog.tsx` | Redesign layout 2 cột, thêm state & fields mới |

### Không thay đổi
- Logic API (buildInvoicePayload, handleCreateInvoice, handleSaveDraft)
- Edge function
- Database schema

