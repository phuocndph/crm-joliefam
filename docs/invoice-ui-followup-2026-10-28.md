# Kiểm tra tiếp UI hóa đơn V6 — 28/10/2026

## Kết quả

**Chưa nghiệm thu toàn luồng chỉnh sửa chia tiền.** Lưu mới qua UI thành công, nhưng mở lại không hiển thị các phần chia đã lưu. Reviewer độc lập xác nhận P2 còn mở. Không sửa production sau manifest V6 hoặc bắt đầu vòng sửa thứ ba.

## Bằng chứng thao tác thật trên fixture

Fixture riêng, chỉ dữ liệu giả lập: `invoice_workspace_qa_44580_1793120019953`. Không dùng database vận hành. Helper tái lập: `.local-staging-runtime/invoice-20261027/create-ui-split-ready-fixture-v6.mjs`.

1. Đăng nhập tài khoản manager giả lập; mở `QA-V6-UI-SPLIT-READY`, tab Thanh toán.
2. Mở Chia khoản thu cho hợp đồng cùng đơn hàng; chọn khoản thu đã phân bổ 100.
3. Thêm `QA-V6-CONTRACT-60` với 60 và `QA-V6-CONTRACT-40` với 40; nhập lý do; Lưu danh sách chia khoản thu.
4. Server tăng revision hóa đơn từ 3 lên 4. Truy vấn độc lập xác nhận hai dòng 60.000000 và 40.000000, tổng 100.000000. Vẫn một phiếu thu 100.00; tổng hóa đơn 110.000000 không đổi.
5. Tải lại toàn trang, mở lại cùng hóa đơn/tab/panel, chọn lại khoản thu. Biểu mẫu không hiển thị hai dòng chia đã lưu dù database vẫn giữ chúng.

Bằng chứng được giữ trong `.local-staging-runtime/invoice-20261027/`: `ui-split-v6-proof.json` và `invoice-v6-split-reopen-missing.png`. Manifest V6 vẫn 43/43 hash khớp, SHA256 `569E12D7B44C9BFE09BD6D2DEC319AA77F1C6E2A33B0300085D1B52F72B13658`.

Sau khi lưu bằng chứng, đã đóng tab QA, kiểm tra và dừng ba process thuộc fixture, drop đúng database/role QA nói trên. Giữ thư mục dữ liệu giả lập để truy vết; không thử lại các thao tác xóa thư mục đã bị chặn. API vận hành 8787 vẫn `ok:true`, database `crm_local`, trang đăng nhập 8083 trả 200.

## P2 — Không nạp phần chia hiện có khi mở lại

`InvoiceContractSplitPanel` khởi tạo danh sách rỗng và xóa state khi chọn khoản thu (`src/components/einvoice/InvoiceDossierPanels.tsx:803`, `:843`); không nạp các dòng đã lưu. Invoice detail và payment-source không trả DTO phần chia theo allocation. ZIP có các dòng gốc, summary chỉ có số tổng, nên người dùng không xem/sửa an toàn danh sách hiện hành qua editor.

Khi có lý do và nguồn, editor rỗng có thể gửi `splits: []`. Route chấp nhận danh sách rỗng rồi xóa các dòng hiện có (`server/invoice-dossier-routes.ts:681`, `:731`). Mở lại rồi lưu có thể làm mất quy thuộc 60/40, khiến tiền hợp đồng cùng đơn hàng thành chưa xác định. Tổng tiền hóa đơn/phiếu thu không bị đổi. Chưa thực hiện thao tác xóa qua UI; hậu quả được chứng minh từ đường code và reviewer, không tuyên bố đã tái hiện xóa UI.

Yêu cầu sửa tiếp: đọc các dòng chia còn quyền theo allocation; nạp editor sau tải/chọn/revision; hiển thị tiền đã chia/còn lại; phân biệt trạng thái chưa tải với yêu cầu xóa chủ động. Kiểm tra tải lại giữ 60/40, đổi khoản thu không lẫn state, mất quyền/stale không lộ dữ liệu, lưu không đổi không xóa ngầm, xóa chủ động có lý do và không tạo thêm phiếu thu.

Quy trình `.agents/skills/crm-orchestrator/SKILL.md` yêu cầu “Stop after two repair cycles and report any unresolved issue instead of looping indefinitely.” Hai vòng đã dùng; báo cáo này giữ finding mở thay vì tiếp tục sửa không giới hạn.

## Các điều kiện vận hành còn thiếu

Phiên CRM vận hành vẫn ở màn hình đăng nhập cổng 8083, chờ tài khoản quản trị/quản lý. Kiểm tra chỉ đọc xác nhận local có các role admin/manager đang active; không thay quyền. Pháp nhân Công Ty TNHH Gia Lộc Hưng Phát — MST 0108652480 chưa lưu thành công do phiên trước không đủ quyền.

Chưa kiểm tra tài khoản Viettel, tệp cổng thuế thực hoặc viewport điện thoại. Tự động CQT/gửi nháp provider vẫn là phần có điều kiện; không ký/phát hành. Không dùng 63 nhóm test tự động để phủ nhận finding UI mới hoặc chứng minh các điều kiện này đã hoàn thành.
