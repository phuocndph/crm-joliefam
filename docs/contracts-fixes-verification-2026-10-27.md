# Kết quả sửa hợp đồng và hóa đơn liên quan — 27/10/2026

## Phạm vi đã hoàn thành

- Áp dụng đúng quyền quản trị, quản lý, kế toán và nhân viên cho hợp đồng, mẫu và hóa đơn; chặn đường vòng qua bảng/snapshot. Không tự chuyển chủ sở hữu hồ sơ lịch sử.
- Máy chủ tính lại tiền theo số thập phân chính xác, kiểm tra VAT/đặt cọc, ngày và dữ liệu liên kết. Ngăn trùng số hợp đồng khi tạo đồng thời; giữ số trùng lịch sử.
- Sửa nội dung không tính lại tiền hoặc ghi lại ngày lịch sử. Ngày hiển thị theo múi giờ Việt Nam; giữ giá trị 0% hợp lệ.
- Chứng từ sử dụng thông tin người bán đã lưu, kể cả trường cố ý để trống. Cấu hình hiện tại chỉ là dự phòng khi hồ sơ thiếu trường.
- Đề nghị thanh toán lấy thực thu từ chứng từ thu của đơn hàng, không coi tiền cọc thỏa thuận là đã thu; thiếu liên kết/phân bổ rõ ràng thì báo chưa xác định.
- Chuyển báo giá mở được biểu mẫu, giữ sản phẩm/VAT và bỏ dòng mẫu hoàn toàn trống. Dữ liệu tính tiền không hợp lệ có thông báo, không hiển thị tổng 0 gây hiểu nhầm.
- Danh sách có phân trang, tìm theo doanh nghiệp, nút có nhãn, trạng thái lỗi/thử lại và bố cục điện thoại không tràn ngang.
- Local chỉ lưu nháp nội bộ; không phát hành Viettel hay hạ trạng thái hóa đơn nguồn. Chặn xóa hợp đồng có hóa đơn liên kết.

## Tệp thay đổi chính trong nhiệm vụ

- Máy chủ: `server/contract-calculation.ts`, `contract-policy.ts`, `contract-routes.ts`; tích hợp tại `server/index.ts`, `module-permissions.ts`, `quote-calculation.ts`.
- Cơ sở dữ liệu: `server/db/migrations/064_local_contract_integrity.sql`; `supabase/migrations/20261027124950_contract_integrity_and_payment_summary.sql`.
- Trang: `src/pages/ContractManagement.tsx`, `EInvoiceManagement.tsx`.
- Biểu mẫu/chứng từ: Create/Edit Contract và Framework Contract; ContractPreview, FrameworkContract, AdvanceRequest, HandoverReport, PaymentRequest; ContractTemplateManager và CreateEInvoiceDialog; hai bảng Draft/IssuedInvoicesTable.
- Hook/kết nối: `useContracts.ts`, `useContractTemplates.ts`, `useEInvoices.ts`, `src/integrations/supabase/client.ts`, `src/lib/local-api.ts`, `contract-calculation.ts`, `contract-document.ts`.
- Kiểm thử: `scripts/test-contract-fixes-isolated.mjs`.

## Kiểm chứng

- `node scripts/test-contract-fixes-isolated.mjs`: 15/15 nhóm đạt, được chạy lại độc lập. Cơ sở dữ liệu, vai trò và API tạm riêng; dọn sạch sau thử; chặn kết nối ra ngoài.
- `npx tsc --noEmit -p tsconfig.app.json`: đạt.
- `npm run typecheck:server`: đạt.
- `npm run build`: đạt; còn cảnh báo kích thước bundle.
- ESLint năm tệp mới về hợp đồng và `git diff --check`: đạt. Lint toàn dự án có lỗi tồn tại từ trước, không được coi là đã sạch toàn bộ.
- Trình duyệt: chuyển báo giá có sẵn sang biểu mẫu, 11 dòng hợp lệ, không còn dòng tên trống, tổng 2.400.250 đồng. Không tạo/lưu chứng từ thử vào dữ liệu đang dùng.
- Điện thoại 390×844: chiều rộng trang hợp đồng và hóa đơn đều 390px; biểu mẫu vừa màn hình. Đã trả viewport về mặc định.

## Bản local đang chạy

- Giao diện: `http://127.0.0.1:8083/contracts`; API: cổng 8787; PostgreSQL: cổng 16543.
- Đã sao lưu trước khi cập nhật: `backups/before-contract-fixes-20261027-195942.dump` (8.075.845 byte; kiểm tra được danh mục archive).
- Đã nạp migration local 064 và 065 theo bootstrap giao dịch. Migration 065 do nhiệm vụ hóa đơn khác tạo; đã rà tương thích cấu trúc bổ sung và xác nhận không ghi lại nghiệp vụ lịch sử. Đây không phải kết luận kiểm thử đầy đủ tính năng invoice workspace mới của nhiệm vụ đó.
- Trước/sau: 50 hợp đồng, 502 hóa đơn. Dấu kiểm tra tập dữ liệu tiền, nội dung sản phẩm/người bán và trạng thái giữ nguyên. Migration chỉ bổ sung cấu trúc và thông tin phạm vi nguồn có căn cứ.
- API health sau khởi động: đạt. Đồng bộ tự động tắt trong tiến trình local này.

## Giới hạn còn lại

- Migration Supabase đã kiểm thử trong PostgreSQL cô lập tương thích schema; chưa áp dụng lên Supabase từ xa. Không phát hành hóa đơn thật, gọi Viettel, đồng bộ ngược, commit, push hoặc triển khai VPS trong nhiệm vụ này.
- Thư mục có thay đổi đồng thời của nhiệm vụ hóa đơn/báo giá khác; không coi toàn bộ diff của thư mục là phạm vi sửa hợp đồng này.
