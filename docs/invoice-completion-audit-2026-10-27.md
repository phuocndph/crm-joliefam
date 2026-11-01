# Đối chiếu phạm vi kế hoạch hóa đơn — 27/10/2026

## Kết luận kiểm tra lại V3

Manifest V3 vẫn khớp 35/35 file. Log kiểm thử xác nhận 29 nhóm hóa đơn và 15 nhóm hợp đồng đạt. Những bằng chứng này xác nhận phần đã triển khai; **chưa chứng minh toàn bộ kế hoạch đã hoàn tất**. Báo cáo triển khai V3 cần đọc cùng tài liệu đối chiếu này.

Nguồn yêu cầu là `docs/invoice-management-audit-plan-2026-10-27.md`, đặc biệt các mục 3–8. Reviewer đã đối chiếu độc lập từng yêu cầu với đường thực thi và nội dung kiểm thử, không chỉ với tên bài kiểm thử.

## Ma trận bàn giao

| Yêu cầu | Bằng chứng V3 | Kết luận / việc còn lại |
|---|---|---|
| Một sổ hóa đơn, phạm vi doanh nghiệp/MST/owner, quyền xem/file/cấu hình riêng | Canonical `local_einvoices`, grants, generic adapter guards; test ACL/adoption | Đạt bằng kiểm thử cô lập |
| Dedupe định danh nguồn và tự nhiên, nhiều nguồn bằng chứng, file đổi tên | Import/ingest/observations/checksum; test lặp và khác nguồn | Đạt bằng kiểm thử cô lập |
| Tiền chính xác, đa thuế/tiền tệ, sai lệch nguồn | Decimal calculator, persistence 3–4 decimals, discrepancy tests | Phép tính đạt; còn thiếu dữ liệu tiền/thuế gốc từng dòng và tổng nhóm thuế để đối chiếu trong nghiệp vụ |
| Đồng bộ Viettel chính thức chỉ đọc, phân trang/checkpoint, mất mạng không mất dữ liệu | Fixed-origin adapter, provider files, page rollback/resume tests | Triển khai đạt; chưa có tài khoản thật để nghiệm thu dữ liệu thực |
| Báo mới/cập nhật/đã có/cần kiểm tra/lỗi cho mỗi lần nhận | Import có outcomes; sync chỉ pages/received/last_error | Cần bổ sung thống kê outcome của sync với rollback/retry chính xác |
| Nhập đầu vào từ cổng thuế; không giả lập kết nối tự động | XML/CSV/XLSX/ZIP preview/commit; direct CQT bị từ chối rõ | Nhập tệp đạt bằng fixture; chưa có tệp xuất thực của doanh nghiệp. API tự động còn điều kiện xác minh |
| File gốc bất biến, phân biệt bản xem nội bộ | Bytes/checksum/ACL/original flag và tests | Đạt cho file lưu; còn thiếu trạng thái thiếu PDF và checklist bộ hồ sơ nghiệp vụ |
| Quan hệ điều chỉnh/thay thế từ nguồn nhập/đồng bộ, báo cáo không đếm trùng | Relation API/cycle guard/period snapshot; test inject verified fields trực tiếp | Chưa đạt đường tiếp nhận thực tế: XML không đọc quan hệ, Viettel chỉ giữ original_reference chưa phân giải |
| Gắn hồ sơ mua/bán/giao nhận/nghiệm thu, gợi ý có chứng cứ, không ép chi phí tạo hợp đồng | Contract allocations; document kind + reference tự do + optional invoice-file | Cần liên kết/tra ngược canonical documents đang có, gợi ý theo MST/tham chiếu/ngày/giá trị và phân bổ có kiểm soát; hồ sơ ngoài hệ thống phải phân biệt rõ |
| Tổng hợp hợp đồng: giá trị, hóa đơn, giữ chỗ, thu/chi, còn phải thu/trả, hồ sơ thiếu | Summary chỉ total/reserved/invoiced/remaining | Cần tổng hợp từ chứng từ tiền thật và bộ hồ sơ, phân biệt giá trị hiện có với giá trị phụ lục/đợt chưa đủ nguồn xác minh |
| Phân bổ tiền, không nhân đôi sổ tiền/kho | Payment source/cap/revision/mirror guards; input tests | Lõi đạt; cần trạng thái chưa/một phần/đủ/cần đối soát, tổng đã phân bổ/còn lại và nhóm kiểm thử riêng đầy đủ cho thu đầu ra |
| Nháp CRM từ hợp đồng/đơn hàng, snapshot/remaining/retry/review | Source revisions, global obligation locks, target receipts, date tests và UI create/edit | Đạt theo dòng/phần lượng; đợt/biên bản cần dựa mô hình và chứng cứ thực, không tạo nghĩa vụ tài chính thứ hai |
| Chốt kỳ bất biến, tiếp nhận bằng chứng sau chốt và cảnh báo/mở lại | Snapshot/content hash/revision; period tests | Đạt với các quan hệ đã được xác minh; phải nối được nguồn quan hệ thực tế ở trên |
| Xuất danh sách, chênh lệch, bộ chứng từ theo quyền | CSV đúng trang; ZIP invoice files + manifest | CSV đạt; ZIP cần bao gồm bộ hồ sơ nghiệp vụ đã liên kết khi có quyền và file nguồn |
| UX ba tab, bảng gọn/năm tab chi tiết, server pagination | UI V3 và kiểm tra trực tiếp | Cấu trúc đạt; còn thiếu bộ lọc hợp đồng và khoảng ngày tùy ý, trạng thái tiền và completeness |
| Backup database + files và phục hồi | Backup/restore thử 502 hóa đơn + 53 file, checksums | Đạt bằng kiểm chứng local; chưa có originals tải bằng tài khoản thật |
| Ký/phát hành | API/UI chặn | Ngoài phạm vi, đúng yêu cầu |

## Chi tiết quyết định

- `server/invoice-workspace.ts` yêu cầu observation có `raw.verified_original_identity` và `relation_kind` khi tạo quan hệ. `server/viettel-read-adapter.ts` chỉ giữ `original_reference`; `server/invoice-import.ts` chưa đọc `TTHDLQuan`. Nhóm quan hệ trong test V3 tự đưa verified fields vào ingest. Cần bài kiểm thử từ bytes/transport bình thường tới quan hệ và báo cáo.
- `originalInvoiceId` trong tài liệu Viettel v2.54 là số hóa đơn ghép ký hiệu, không được coi là opaque `invoiceId` hoặc tự tách chuỗi để gán hồ sơ. Thiếu định danh đầy đủ phải giữ chờ đối chiếu.
- `ContractInvoiceSummary` hiện chỉ trình bày giá trị hợp đồng, phân bổ, giữ chỗ, phần còn lại để lập hóa đơn; không được diễn giải phần còn lại này thành công nợ tiền.
- Thiếu hồ sơ trong V3 chủ yếu nghĩa là thiếu XML. Cần tách XML/PDF/chứng từ nghiệp vụ và các trường hợp không áp dụng có lý do.

## Trạng thái vận hành được kiểm tra lại

API local cổng 8787 trả health 200, database `crm_local`; migration 066–068 đã áp dụng, checksum lịch sử được giữ. Hiện có 502 hóa đơn cũ, **0 doanh nghiệp, 0 hóa đơn đã gắn doanh nghiệp, 0 tài khoản provider trong luồng mới, 0 lượt sync mới**.

Có một bản cấu hình Viettel lịch sử với các trường MST/tên đăng nhập/mật khẩu đã có dữ liệu (chỉ truy vấn trạng thái có/không, không đọc nội dung đăng nhập). Điều đó không chứng minh quyền API còn hoạt động hoặc đủ bằng chứng để tự chuyển 502 hóa đơn sang một pháp nhân. Cần xác định đúng doanh nghiệp và quyền quản lý trước khi nghiệm thu thật.

## Việc tiếp tục

Hoàn thiện các mục còn một phần bằng thiết kế bổ sung có giới hạn, dùng lại dữ liệu chuẩn hiện có. Kiểm thử từ đường nhập/đồng bộ thông thường, không chỉ bơm dữ liệu vào hàm nội bộ. Giữ nguyên dữ liệu vận hành và không bật phát hành. Việc kiểm tra tài khoản/nguồn thật vẫn là điều kiện nghiệm thu riêng; chưa được đánh dấu mục tiêu hoàn tất.
