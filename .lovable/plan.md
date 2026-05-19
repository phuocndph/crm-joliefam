## Vấn đề

Các biểu mẫu (Đề nghị thanh toán, Đề nghị tạm ứng, Biên bản bàn giao, Hoá đơn ĐT) lấy số HĐ từ `contract.contract_number` lúc khởi tạo, nhưng sau đó merge với `document_overrides` đã lưu trong DB. Khi:
- Người dùng từng lưu biểu mẫu rồi sau đó đổi số HĐ gốc, hoặc
- Copy/paste lẫn lộn giữa các HĐ,

thì các trường text như `subtitle`, `intro`, `bank_text`, "Nội dung chuyển khoản: Thanh toán HĐ số …" vẫn giữ số HĐ cũ trong override → hiển thị sai, phải sửa tay.

## Giải pháp

Tự động đồng bộ mọi tham chiếu số HĐ trong các trường text đã lưu về đúng `contract.contract_number` hiện tại mỗi khi mở dialog. Người dùng không cần sửa tay nữa.

### Cách làm

Thêm hàm tiện ích `syncContractNumberInOverrides(saved, currentNumber)`:
- Regex thay thế mọi chuỗi khớp `HD-\d{6,8}-\d{3,}` và `HDNT-\d{6,8}-\d{3,}` trong tất cả string field của `saved` bằng `currentNumber`.
- Bỏ qua nếu `currentNumber` rỗng hoặc bản thân `saved` không chứa pattern.

Áp dụng trong `useEffect` merge của 4 dialog:
- `src/components/PaymentRequestDialog.tsx`
- `src/components/AdvanceRequestDialog.tsx`
- `src/components/HandoverReportDialog.tsx`
- `src/components/CreateEInvoiceDialog.tsx` (nếu có field text lưu HD)

Đặt hàm ở `src/lib/contractUtils.ts` (file mới, gọn nhẹ) để dùng chung.

### Phạm vi

- Chỉ sửa frontend, không đụng DB schema, không đụng edge functions.
- Không thay đổi cấu trúc form, chỉ "rửa" số HĐ sai trong override khi load.
- Tên file PDF/DOCX và DialogTitle vốn đã dùng `contract.contract_number` trực tiếp — không cần sửa.

### Lưu ý

Đây là sửa hiển thị: nếu người dùng *cố tình* viết số HĐ khác (ví dụ tham chiếu HĐ phụ lục) trong override, hàm sẽ ghi đè. Theo yêu cầu hiện tại điều này là mong muốn — luôn thống nhất theo HĐ gốc.