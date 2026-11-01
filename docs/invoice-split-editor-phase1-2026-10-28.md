# Phần 1 — sửa phần chia khoản thu đã lưu và danh sách admin

Phạm vi này tiếp tục từ V6 theo yêu cầu làm từng phần, chưa tuyên bố hoàn tất cả bốn phần còn lại. Chỉ bốn tệp production thay đổi: `server/invoice-dossier-routes.ts`, `server/invoice-workspace.ts`, `src/lib/invoice-workspace-api.ts`, `src/components/einvoice/InvoiceDossierPanels.tsx`. Không cần migration; 064–069 bất biến, không đổi tiền hóa đơn/phiếu thu/khoản phân bổ.

`GET /api/invoice-workspace/invoices/:id/payments/:allocationId/contract-splits` trả baseline `invoice_revision`, allocation ID/amount/currency, current source revision, saved lines `{contract_id, contract_number, amount}`, total/remaining và editable/stale/reasons. GET và POST cùng kiểm toàn bộ danh sách đã lưu, module tiền/hợp đồng, owner/tenant, current source, tombstone/revision, liên kết hợp đồng/đơn hàng và cap. Một dòng đã lưu mất quyền khiến toàn bộ request trả 403, không trả phần danh sách được lọc rồi thay thế âm thầm. Trạng thái stale còn đủ quyền chỉ được xem hoặc bị từ chối rõ, không giả danh sách rỗng có thể sửa.

UI tải và giữ baseline trước khi sửa, hiển thị loading/error/empty riêng, hỗ trợ sửa số tiền trên dòng đã lưu. Query/cache tách theo invoice/allocation/revision/session; response cũ bị hủy khi chuyển lựa chọn. Refetch không ghi đè bản sửa chưa lưu. Detail revision mới khóa lưu cho tới khi người dùng chủ động bỏ bản sửa và tải lại. POST gửi đúng revision lấy từ GET; action helper không ghi đè nó bằng detail revision mới hơn. Session scope không chứa token và được kiểm trước request để không gửi bản sửa cũ dưới phiên mới. Lỗi truy cập ẩn baseline cũ.

POST bình thường cần danh sách không rỗng. Xóa toàn bộ dùng riêng `{splits:[],clear:true,source_revision,expected_revision,reason}`, chỉ áp dụng khi có phần chia đã lưu, qua checkbox có nhãn và lý do bắt buộc. Server kiểm cùng ACL/revision/source/cap, audit `CLEAR_CONTRACT_RECEIPT_SPLITS` lưu before/after. Các nút có vùng chạm, nhãn và xuống dòng phù hợp màn hình hẹp.

Lỗi admin chọn doanh nghiệp xuất phát từ SQL đẩy cả actor/assigned vào parameters nhưng nhánh admin bỏ predicate dùng assigned, để một tham số null không có kiểu. Nhánh admin nay không thêm hai tham số không cần thiết; predicate owner của manager/employee và kiểm quyền doanh nghiệp vẫn giữ. List, thống kê và CSV dùng chung builder đã sửa.

Implementer chạy app/server TypeScript, scoped ESLint, app/server builds và diff-check. Build còn cảnh báo Browserslist/bundle lớn và static/dynamic quote import từ phần khác của checkout. Reviewer/tester độc lập và UI nghiệm thu phần này do coordinator thực hiện sau freeze; không dùng việc build đạt để thay thế nghiệm thu nghiệp vụ.

Không sửa test, đọc `.env`/credentials, gọi provider, ghi database vận hành/auth/grants, tạo doanh nghiệp, restart service, commit/push hay deploy. Những thay đổi báo giá/hợp đồng đang có trong checkout được giữ nguyên.
