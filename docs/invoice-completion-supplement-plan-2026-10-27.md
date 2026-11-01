# Đợt hoàn thiện các mục còn thiếu của kế hoạch hóa đơn

## Mục tiêu và giới hạn

Đây là phần còn lại của kế hoạch đã được duyệt, được phát hiện trong `invoice-completion-audit-2026-10-27.md`. V3 vẫn giữ nguyên kết quả kiểm thử và dữ liệu. Chưa đánh dấu mục tiêu hoàn tất chỉ vì bộ kiểm thử V3 đạt.

Một implementer duy nhất sửa production; reviewer và tester độc lập kiểm tra cùng bản chốt sau triển khai. Giữ nguyên mọi migration 064–068 đã áp dụng và các thay đổi hợp đồng/báo giá từ công việc khác. Migration mới được chuẩn bị ngoài thư mục loader cho tới khi hoàn chỉnh nhằm tránh một phiên khởi động khác áp dụng bản đang viết. Không đọc thông tin đăng nhập, không tạo giao dịch tiền/kho, không ký/phát hành hoặc triển khai remote.

## Hạng mục và điều kiện nghiệm thu

| Hạng mục | Kết quả phải có | Bằng chứng nghiệm thu |
|---|---|---|
| Bằng chứng tài chính nguồn | Dòng và nhóm thuế nguyên bản gắn observation bất biến, nullable nếu thiếu, giữ mã loại dòng/chiết khấu/tăng giảm, đối chiếu nguồn–tính lại–chênh lệch | XML/Viettel normal parser giữ số lớn/thập phân và nhóm nhiều thuế; không tự biến thiếu tiền thành 0 hoặc giá dòng thành đơn giá |
| Quan hệ hóa đơn | Nguồn nhập/đồng bộ tạo relation evidence; server phân giải full tuple hoặc exact `invoiceNo` có scope, người dùng xác nhận có lý do | Normal bytes/transport → candidate → relation → báo cáo; trùng số/alias/thiếu gốc/khác doanh nghiệp/mâu thuẫn không gộp; gốc đến sau được đối chiếu lại |
| Hồ sơ nghiệp vụ | Typed canonical source/id/revision/snapshot + tài liệu ngoài hệ thống có file/lý do/xác nhận; lịch sử cũ chưa xác minh không được nâng cấp ngầm | ACL qua nguồn chuẩn, source stale, xem ngược, attachment không làm đủ originals; không gọi URL tùy ý |
| Phân bổ hồ sơ | Tách OBLIGATION, FULFILMENT, SETTLEMENT; khóa/revision/currency/cap trong từng trục và nguồn | Hợp đồng 100 + giao 100 + thu 100 không thành 300; hai phân bổ cùng trục không vượt; nguồn không có basis chỉ gắn bằng chứng |
| Hợp đồng và tiền | Thu thật từ nguồn tiền chuẩn, không cộng mirror; shared order cần chia rõ hoặc unknown; tiền đã phân bổ và giá trị còn lại tách khỏi tiền đến hạn | OUT order payment, shared-order split đồng thời/cap, nguồn thay đổi; summary trả số thập phân và lý do unknown |
| Trạng thái tiền | NONE/PARTIAL/FULL/NEEDS_RECONCILIATION dùng chung list/detail/summary/export/period | Cùng dữ liệu cho kết quả nhất quán; không tạo thu/chi mới |
| Checklist hồ sơ | XML/PDF/hợp đồng hoặc chi phí/phụ lục/giao nhận/nghiệm thu/thanh toán; REQUIRED/NOT_APPLICABLE/NOT_ASSESSED có người/lý do; presence từ evidence hiện hành | Không bắt chi phí tiện ích tạo hợp đồng giả; N/A có quyền và lý do; XML business attachment không tính XML hóa đơn |
| Gợi ý nguồn | Chỉ những nguồn có quyền; giải thích bằng MST/tham chiếu/ngày/giá trị; người dùng xác nhận | Không tự gắn theo tên/điểm số; count/ranking không lộ ngoài quyền |
| Kết quả sync | Receipts và số NEW/OBSERVED_UPDATE/EXISTING/cần kiểm tra/lỗi; counts/cursor cùng transaction; ngày PostgreSQL truyền đúng ngày lịch Việt Nam | Rollback/retry không tăng đếm thành công; lỗi file không báo đủ hồ sơ; actual date_from/date_to → transport không lùi một ngày |
| Bộ lọc | Hợp đồng, từ–đến ngày, trạng thái tiền, thiếu PDF/nghiệp vụ/chưa đánh giá; query params từ hợp đồng | List/stats/export dùng cùng điều kiện; inclusive ngày bắt đầu và hết ngày kết thúc theo múi giờ Việt Nam |
| Xuất bộ hồ sơ | Originals + attachments có quyền + snapshot/link/allocation/checklist/lineage và manifest missing/checksum | Không lộ file ngoài quyền, không gọi URL ngoài, không giả bản CRM thành bản gốc, giới hạn dung lượng và dedupe |

## Dùng lại dữ liệu chuẩn

Nguồn sẵn có: hợp đồng; giao dịch nghiệp vụ; phiếu kho; giao hàng sản xuất kế thừa quyền qua đơn hàng; `document_overrides` hợp đồng là bản nội bộ; phiếu thu đơn hàng/giao dịch chi theo semantics đã kiểm tra. Phiếu kho hiện chưa có tenant/owner riêng nên cần giới hạn tenant local và quyền module, cùng xác nhận liên hệ với doanh nghiệp hóa đơn; không suy pháp nhân từ người tạo.

Chưa có sổ hợp đồng mua/phụ lục/đợt/nghiệm thu đã ký riêng. Hồ sơ ngoài hệ thống được quản lý bằng bằng chứng và người xác nhận, không tạo sổ tài chính thứ hai hoặc xem bản biên bản nội bộ là đã ký. Giá trị hợp đồng trừ tiền thu là giá trị chưa thu, không tự là số phải thu đã đến hạn. Khi thiếu basis, hiển thị unknown và việc cần bổ sung.

## Thứ tự thực hiện

1. Migration mới và read model bằng chứng; parser/adapter/quan hệ.
2. Typed documents, giới hạn phân bổ, attachments và checklist.
3. Thanh toán/phân chia rõ theo hợp đồng, summary/trạng thái tiền.
4. Sync receipts/ngày, bộ lọc, UI và xuất hồ sơ.
5. Freeze manifest mới → reviewer/tester độc lập → sửa tối đa hai vòng có bằng chứng → UI trên DB tạm → backup và cập nhật local sau khi đủ điều kiện.

Kiểm thử V3 vẫn phải giữ. Các bài mới đi từ đường tiếp nhận thông thường, không dùng riêng `verified_original_identity` chèn vào hàm nội bộ để tuyên bố quan hệ nguồn đã hoạt động.

Nghiệm thu thật vẫn cần tên pháp nhân/MST, quyền tài khoản API Viettel và tệp cổng thuế thực tế. Tự động CQT hoặc gửi nháp Viettel chỉ bật khi đã xác minh giao thức/quyền và phạm vi ghi; phát hành tiếp tục ngoài phạm vi.
