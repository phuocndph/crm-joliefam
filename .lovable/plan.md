

## Plan: Thêm tính năng tạo Hợp đồng Nguyên tắc từ Hợp đồng mua bán

Hợp đồng nguyên tắc (HĐNT) sẽ được tạo tương tự Biên bản bàn giao và Đề nghị thanh toán — là một tài liệu phụ trợ sinh ra từ dữ liệu hợp đồng gốc, không lưu bảng riêng.

### Nội dung HĐNT
- Thông tin pháp lý hai bên (Bên A, Bên B) lấy từ `seller_info` và `buyer_info` của hợp đồng gốc
- Các điều khoản khung: phạm vi hợp tác, phương thức thanh toán chung, thời hạn hiệu lực, trách nhiệm các bên, giải quyết tranh chấp
- Không có bảng sản phẩm chi tiết (khác với HĐ mua bán)
- Tham chiếu đến hợp đồng gốc (mã HĐ, ngày ký)
- Hỗ trợ In, xuất PDF, xuất Word

### Thay đổi cụ thể

#### 1. Tạo `src/components/FrameworkContractDialog.tsx`
- Theo pattern của `HandoverReportDialog.tsx` và `PaymentRequestDialog.tsx`
- Props: `open`, `onOpenChange`, `contract`
- Cho phép chỉnh sửa: ngày ký HĐNT, thời hạn hiệu lực, phạm vi hợp tác, điều khoản bổ sung
- Nội dung mẫu 6 điều: Phạm vi hợp tác, Giá cả & thanh toán, Giao nhận, Trách nhiệm, Thời hạn, Điều khoản chung
- Hỗ trợ: In, PDF, Word (docx)

#### 2. Cập nhật `ContractManagement.tsx`
- Thêm state `frameworkContract`
- Thêm menu item "HĐ Nguyên tắc" trong dropdown actions (icon: `FileSignature`)

#### 3. Cập nhật `ContractPreviewDialog.tsx`
- Thêm nút "HĐ Nguyên tắc" cạnh nút Biên bản bàn giao và Đề nghị thanh toán

### Không thay đổi
- Database, RLS, schema
- Logic hợp đồng mua bán hiện tại

