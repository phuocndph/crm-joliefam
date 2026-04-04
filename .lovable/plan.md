

## Thêm chức năng "Đề nghị tạm ứng" + Kiểm tra lỗi dữ liệu công ty

### 1. Kiểm tra dữ liệu công ty

Dữ liệu công ty trong DB (`quote_template_settings`) và trong `seller_info` của hợp đồng đều chính xác (CÔNG TY TNHH GIA LỘC HƯNG PHÁT). Tuy nhiên, file `useTemplateSettings.ts` có `defaultSettings` hardcode dữ liệu cũ (REMY). Nếu DB fetch chậm hoặc lỗi, sẽ hiển thị sai. Cần xác nhận: bạn đang gặp lỗi cụ thể gì khi lấy dữ liệu công ty? (Hiển thị sai tên? Trống? Hay dữ liệu REMY cũ?)

**Sửa ngay**: Cập nhật `defaultSettings` trong `useTemplateSettings.ts` cho khớp với dữ liệu thực tế để tránh flash dữ liệu cũ khi loading.

### 2. Tạo component "Đề nghị tạm ứng" (AdvanceRequestDialog)

Tài liệu "Đề nghị tạm ứng" khác với "Đề nghị thanh toán":
- Mục đích: Yêu cầu tạm ứng tiền trước khi thực hiện hợp đồng (mua vật tư, nhân công...)
- Người nhận: Nội bộ công ty (Giám đốc duyệt cho nhân viên/phòng ban)

**File mới: `src/components/AdvanceRequestDialog.tsx`**
- Cấu trúc tương tự `PaymentRequestDialog` (cùng pattern: Dialog + preview + Print/PDF/Word)
- Các trường nhập:
  - Ngày đề nghị
  - Người đề nghị (tên, chức vụ)
  - Lý do tạm ứng (textarea)
  - Số tiền tạm ứng (input number)
  - Thời hạn hoàn ứng
- Bản xem trước theo mẫu chuẩn:
  - Tiêu đề: "GIẤY ĐỀ NGHỊ TẠM ỨNG"
  - Thông tin công ty (từ `seller_info` hoặc `companySettings`)
  - Bảng chi tiết khoản tạm ứng
  - Phần ký: "Người đề nghị" / "Kế toán trưởng" / "Giám đốc"
- Xuất PDF và Word (pattern giống PaymentRequestDialog)

### 3. Tích hợp vào ContractManagement

**File: `src/pages/ContractManagement.tsx`**
- Import `AdvanceRequestDialog`
- Thêm state: `const [advanceRequestContract, setAdvanceRequestContract] = useState<any>(null)`
- Thêm menu item trong dropdown (sau "Đề nghị thanh toán"):
  ```
  <DropdownMenuItem onClick={() => setAdvanceRequestContract(c)}>
    <Banknote className="h-4 w-4 mr-2" />Đề nghị tạm ứng
  </DropdownMenuItem>
  ```
- Render `AdvanceRequestDialog` ở cuối component

### Tổng kết thay đổi

| File | Hành động |
|------|-----------|
| `src/components/AdvanceRequestDialog.tsx` | Tạo mới |
| `src/pages/ContractManagement.tsx` | Thêm menu + state + render dialog |
| `src/hooks/useTemplateSettings.ts` | Cập nhật defaultSettings |

