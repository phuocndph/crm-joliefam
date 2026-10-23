# Kiểm thử bàn làm việc kỳ lương và đối soát

Ngày 16/10/2026. Phạm vi: đợt 1–2 của kế hoạch chuẩn hóa luồng tính lương.

## Môi trường

Mọi ca tạo/duyệt/tính/khóa dùng database và role dùng một lần do harness sở hữu trong PostgreSQL Docker local. Role không có quyền superuser. API kiểm thử chạy production trên cổng ngẫu nhiên, chặn outbound fetch, tắt đồng bộ/bridge/integration; không nạp file `.env`. Harness đã xóa database, role và API của từng lần chạy. Không dùng dữ liệu nghiệp vụ hiện tại, không gọi VPS/GitHub/Supabase remote.

## Kết quả thực chạy

Tất cả lệnh sau kết thúc mã thoát 0:

| Lệnh | Kết quả |
|---|---|
| `node --check scripts/test-payroll-console-isolated.mjs` | Cú pháp đạt |
| `node --check scripts/test-payroll-integrity-isolated.mjs` | Cú pháp đạt |
| `npm.cmd run build:server` | Đạt; build lại sau khi bổ sung trạng thái độ mới dữ liệu và scope_guard |
| `node scripts/test-payroll-console-isolated.mjs` | 13/13 nhóm đạt trên backend cuối |
| `node scripts/test-payroll-integrity-isolated.mjs` | 10/10 nhóm đạt; chạy lại trên backend cuối |
| `node scripts/test-payroll-flow-optimization-isolated.mjs` | 13/13 nhóm đạt; chạy lại sau phần freshness, trước phần scope_guard chỉ đọc |
| `node scripts/test-payroll-simplification-isolated.mjs` | 15/15 nhóm đạt |
| `node scripts/test-payroll-policies-isolated.mjs` | 12/12 nhóm đạt |
| `node scripts/test-permissions-isolated.mjs` | 22/22 nhóm đạt |
| `node scripts/test-payroll-integrity-isolated.mjs --v2` | Golden V2 đạt: 3 người; gross `6224230.769231`, deductions `1000000`, payment `5224231` |
| `node scripts/test-payroll-integrity-isolated.mjs --scope-concurrency` | Validation, canonical retries, roster lock, trigger049, thứ tự khóa nguồn đạt; chạy lại trên backend cuối |

Tổng cộng 85 nhóm trong sáu suite có số nhóm, cộng suite golden V2 và scope/concurrency. Các suite simplification/policy/permission/V2 chạy trên bản backend đã cố định đầu tiên. Thay đổi backend sau đó chỉ bổ sung đọc `freshness`, `scope_guard` trong reconciliation và sửa comment fingerprint; đã build lại rồi chạy lại console, integrity và scope/concurrency trên backend cuối; optimization chạy lại sau freshness. Không thay đổi công thức tính hay đường ghi tiền giữa các lần cố định.

## Phủ nghiệp vụ mới

- Phân loại lương chính, sản lượng/tăng ca, khoản khác, khấu trừ và tổng kỳ đối chiếu với PostgreSQL `numeric`. Dùng số `12345678901234.123456` để phát hiện mất phần lẻ khi đi qua JavaScript Number. Item, tổng và delta trả chuỗi decimal chính xác.
- CSV so sánh giá trị từng item và tổng từng người với SQL; chỉ lấy tổng mỗi người một lần khi đối chiếu vì mỗi dòng item lặp lại tổng người đó. Người không có item vẫn xuất hiện khi người khác có item.
- So sánh run cùng kỳ, version, ngày chuẩn, requested/resolved scope chuẩn hóa. Không mượn baseline thiếu/hỏng metadata hoặc khác scope/version/ngày chuẩn. Nhận diện ADDED/REMOVED/CHANGED/UNCHANGED và delta chính xác. Hai preview thật có bản trước SUPERSEDED vẫn đối chiếu được. Timestamp trùng và UUID đảo thứ tự không làm chọn nhầm run.
- Preview mới là CURRENT; nguồn công hợp lệ được duyệt thêm vẫn có thể cho preflight sẵn sàng nhưng preview cũ chuyển STALE. Thiếu fingerprint là UNVERIFIABLE. LOCKED/SUPERSEDED là NOT_APPLICABLE. Bản khóa và danh tính snapshot không bị preview sau hay sửa tên master làm thay đổi.
- Preview lọc một người vẫn CURRENT và không có nguồn chờ, nhưng người inactive ngoài phạm vi có nguồn đã duyệt chưa thanh toán: scope_guard trả đúng danh sách/count 1 và khóa vẫn trả 409. Tính lại toàn bộ đưa đủ hai người vào preview, scope_guard count 0, khóa thành công. scope_guard của run đã khóa là NOT_APPLICABLE tĩnh; thêm nhân sự active sau đó không làm đổi kết quả đọc bản khóa.
- API đối soát từ chối anonymous/employee/team leader; kế toán được đọc. Đổi vai trò trên phiên đang đăng nhập có hiệu lực ngay. Các lượt đọc không tạo/sửa run, record, item, audit hoặc ngân hàng.
- Hàng đợi gộp lỗi trùng giữa issues/lock_issues; vẫn giữ nguồn khác ID, ngày và cơ sở. Liên kết xử lý giữ kỳ/cơ sở/người và đường quay về. Ngày sai lịch hoặc khác kỳ không dẫn đến ngày công sai. Lỗi MISSING_PAYROLL_PROFILE không có resolution_target vẫn mở đúng nhân sự; PAYROLL_CALENDAR mở lịch tại chính sách; các lỗi nguồn mở chấm công đúng ngày. Đích explicit do server trả luôn ưu tiên trước suy luận từ mã. Bộ console cuối gồm các ca định tuyến và scope_guard đã đạt 13/13, exit 0 và cleanup đạt.
- Đề nghị ngân hàng chỉ đọc bốn trường ngân hàng từ approved_data của đúng worker cùng provenance; hồ sơ nháp/chờ/cần bổ sung, revision chưa duyệt/không khớp hoặc user không hoạt động không được đề nghị. Manager/employee không đọc được số tài khoản qua lối này. Đọc không tự tạo tài khoản; chấp nhận tạo thủ công vẫn DRAFT, chưa xác minh.
- Roster chỉ thêm tóm tắt không chứa số tiền hoặc ngân hàng; đếm nháp assignment/profile đúng phạm vi. Các danh sách chi tiết lọc worker không trả người khác. Employee/team giữ phạm vi, thu hồi quyền trên phiên cũ có hiệu lực.
- Khóa vẫn chặn preview cũ và nguồn chờ của người inactive ngoài phạm vi tính; giải quyết đúng nguồn rồi tính lại/khóa được. Các bộ hồi quy tiếp tục phủ lịch sử hiệu lực, rollback audit, idempotency và đồng thời.

## Manifest đã kiểm tra

| File | SHA256 |
|---|---|
| server/index.ts | `0E46781B9D417B6D4648F8A1946EC0EC2138224A2FE0326A6E6E1F363256AE91` |
| server/payroll-access.ts | `F11F5F459FF92087EFA4F769E02289784FBC06231266B2D56554CB65AF96A92A` |
| server/payroll-reconciliation.ts | `C1EB53456E3437BF624ED47AB25E73BF15CF92E01070BFB45E7D17C50D596ACF` |
| server/payroll-snapshot.ts | `02A516015AA7465E00D9F7BF8096430A0F05ABF676A677D1C020853E10C05AD2` |
| src/lib/payroll-reconciliation.ts | `4B38CA999C5C2F5CCA27D6442315F07383EEBBBE48BDC87E40A536758A900CDE` |
| scripts/test-payroll-console-isolated.mjs | `91CD3E50C8DE94A735C4657C6204AD24A603C8DFB83BD41FF47F862202079264` |
| scripts/test-payroll-integrity-isolated.mjs | `8EB8A633A4087F073EF8E30BC56284BCEB64D40B9354207797FD6FEDC973D411` |

## Giới hạn

Chưa chạy tương tác trình duyệt mới, viewport/bàn phím hay giả lập mạng. Lối trình duyệt đã bị chính sách công cụ chặn ở đợt trước; không dùng công cụ khác để vượt chặn. Kiểm thử UI ở đây giới hạn ở các helper thật được giao diện dùng và kiểm tra tĩnh/build do coordinator thực hiện. Các quy tắc đợt 3 và quy trình chi trả đợt 4 chưa thuộc đợt này.
