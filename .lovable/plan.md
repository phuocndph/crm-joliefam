

## Thêm chức năng chỉnh sửa và lưu Hợp đồng Nguyên tắc

### Vấn đề hiện tại

Khi bấm "Sửa" trên một HĐ Nguyên tắc, hệ thống mở `EditContractDialog` — dialog này chỉ dành cho HĐ Kinh tế (có bảng sản phẩm, VAT, đặt cọc...), không phù hợp với HĐ Nguyên tắc. Ngoài ra, `FrameworkContractDialog` (dialog xem trước) cho phép chỉnh sửa điều khoản nhưng **không lưu thay đổi về database**.

### Giải pháp

Tạo component `EditFrameworkContractDialog` mới, dựa trên cấu trúc của `CreateFrameworkContractForm`, cho phép chỉnh sửa và lưu tất cả thông tin HĐ Nguyên tắc.

### Chi tiết thay đổi

**1. Tạo file `src/components/EditFrameworkContractDialog.tsx`**
- Dialog cho phép sửa: trạng thái, ngày ký, thông tin Bên A (người đại diện, chức vụ), thông tin Bên B (công ty, đại diện, chức vụ, địa chỉ, MST, ĐT), các điều khoản (thêm/xóa/sắp xếp/chỉnh nội dung), căn cứ pháp lý, ghi chú
- Load dữ liệu từ `contract` prop vào state khi mở
- Dùng `useUpdateContract` để lưu thay đổi
- Giữ tra cứu MST giống form tạo mới

**2. Sửa `src/pages/ContractManagement.tsx`**
- Import `EditFrameworkContractDialog`
- Khi bấm "Sửa" trên HĐ Nguyên tắc (`isFrameworkContract`), mở `EditFrameworkContractDialog` thay vì `EditContractDialog`
- Thêm state `editFrameworkContract` riêng

**3. Cập nhật `FrameworkContractDialog` (dialog xem trước)**
- Thêm nút "Lưu thay đổi" để lưu các chỉnh sửa điều khoản ngay trong dialog xem trước về DB (dùng `useUpdateContract` cập nhật field `articles`)

