# Kết quả triển khai quản lý hóa đơn — V6, 27/10/2026

## Trạng thái hiện tại

**Phần mã V6 đã qua kiểm thử tự động và chạy trên local; kiểm tra UI tiếp ngày 28/10 phát hiện một lỗi P2 còn mở. Chưa nghiệm thu toàn bộ hoặc kết nối tài khoản/tệp thực tế.** Đây là kết quả mới nhất, thay thế các kết luận tạm của V3–V5. Ma trận 11 hạng mục và lịch sử sửa nằm trong `invoice-completion-delivery-2026-10-27.md`; ca UI và lỗi còn lại nằm trong `invoice-ui-followup-2026-10-28.md`.

Pháp nhân người dùng xác nhận: **Công Ty TNHH Gia Lộc Hưng Phát — MST 0108652480**. Đã nhập thử đúng tên/MST trên giao diện vận hành; server từ chối với thông báo “Chỉ quản trị/quản lý tạo phạm vi doanh nghiệp”. Không tạo pháp nhân, thay quyền, chuyển hóa đơn cũ hoặc sao chép tài khoản nguồn. Đã mở màn hình đăng nhập cổng 8083 để người dùng đăng nhập bằng tài khoản có quyền. Cần hoàn thành bước này trước cấu hình Viettel.

## Phạm vi đã bàn giao

- Sổ hóa đơn hiện có hỗ trợ đầu vào/đầu ra, nháp CRM, phạm vi doanh nghiệp/MST và quyền theo thao tác; ba tab Cần xử lý / Đầu vào / Đầu ra.
- Nhập XML/CSV/XLSX/ZIP qua xem trước rồi xác nhận; chống trùng theo định danh/checksum, giữ file chưa ghép ở hàng chờ. Phân biệt XML hóa đơn gốc và hồ sơ nghiệp vụ đính kèm.
- Adapter Viettel chỉ đọc, origin cố định theo tài liệu chính thức; tài khoản lưu riêng phía server theo doanh nghiệp. Đồng bộ theo trang, checkpoint, biên nhận từng mục, lỗi/tiếp tục và file gốc.
- Lưu bằng chứng dòng/nhóm thuế/quan hệ theo observation bất biến; đối chiếu nguồn với canonical. Dữ liệu mới nhất mâu thuẫn trả trạng thái cần đối soát, không quay lại nguồn cũ để khẳng định tiền.
- Quan hệ thay thế/điều chỉnh được kiểm tra bằng chứng, quyền, revision và lý do. Viettel loại 3 là thay thế, loại 9 là điều chỉnh; tăng/giảm chỉ tính khi đủ bằng chứng nhất quán. Trường hợp chưa rõ chặn chốt kỳ và nêu lý do.
- Phân bổ nghĩa vụ/giao nhận/thanh toán riêng; hợp đồng và tiền thực dùng dữ liệu chuẩn hiện có, bảo vệ cap/concurrency/rollback/ACL. Không tạo thêm sổ thu chi hoặc biến động kho.
- Nháp từ hợp đồng/đơn hàng theo dòng và phần còn lại, snapshot/revision/idempotency/giữ chỗ nguồn. Nháp chỉ lưu tại CRM; không ký hoặc phát hành.
- Hồ sơ có liên kết canonical hoặc bằng chứng ngoài hệ thống đã xác nhận, checklist bảy mục, N/A có lý do, nguồn hết hiệu lực/quyền được kiểm lại.
- Bộ lọc hợp đồng/ngày/thanh toán/tệp/hồ sơ dùng chung list/stats/CSV; ZIP gồm originals/attachments/snapshots/manifest/checksum/purpose/missing. Kỳ chốt có snapshot/hash, cảnh báo thay đổi và kiểm lại ACL khi xuất.
- Tiền nguồn, projection và tổng kỳ dùng số thập phân chính xác tới sáu chữ số. Giới hạn phân bổ vận hành vẫn theo độ chính xác tiền tệ của sổ hiện có. Ngày nghiệp vụ theo Việt Nam, PostgreSQL DATE được truyền đúng.

## Bằng chứng bản chốt

Manifest: `.local-staging-runtime/invoice-20261027/freeze-v6.json`, **43 tệp**, SHA256 `569E12D7B44C9BFE09BD6D2DEC319AA77F1C6E2A33B0300085D1B52F72B13658`. Reviewer và tester kiểm cùng manifest; coordinator kiểm lại sau kích hoạt, **0 tệp lệch hash**. Đã dùng đủ hai vòng sửa của đợt bổ sung; không tiếp tục sửa production ngoài mốc chốt.

| Kiểm tra | Kết quả |
|---|---|
| TypeScript app và server | PASS |
| ESLint các tệp hóa đơn và tích hợp trong phạm vi | PASS, không lỗi/cảnh báo |
| Build app và server | PASS |
| Diff whitespace | PASS |
| `node scripts/test-invoice-workspace-isolated.mjs` | **63/63 nhóm PASS** |
| `node scripts/test-contract-fixes-isolated.mjs` | **15/15 nhóm PASS** |
| Invoice suite chạy lại trên fixture HOLD mới | **63/63 nhóm PASS** |
| Review độc lập V6 tại mốc freeze | PASS tại mốc rà soát; kiểm tra UI tiếp theo phát hiện P2 và reviewer đã xác nhận, còn mở |

Log cuối nằm trong `.local-staging-runtime/invoice-20261027/`: `test-invoice-freeze-v6.log`, `test-contract-freeze-v6.log`, `test-invoice-freeze-v6-hold.log`. Toàn repository còn lỗi lint baseline; không tuyên bố toàn bộ sạch lint. Build còn cảnh báo Browserslist cũ và chunk lớn.

Kiểm thử bao phủ quyền/tenant/owner/file/snapshot, nguồn tiền và quan hệ, kiểm tra từng mức thuế, latest-source mismatch, sáu chữ số thập phân, nhập lặp/retry/rollback, phân bổ/shared-order/split, kiểm tra nguồn cũ/mất quyền, nháp/giữ chỗ, checklist/tệp/ZIP, checkpoint và trạng thái thay đổi sau chốt.

## Kiểm tra giao diện

- Trên fixture V4 đã thực hiện XML → xem trước → tiếp nhận, xem nguồn/delta, N/A có lý do, đính kèm hồ sơ, liên kết chi phí ngoài hệ thống, lọc và tải ZIP; đã đọc lại cấu trúc và checksum ZIP. Đây là bằng chứng V4, không ghi thành thao tác lặp lại trên V6.
- Trên fixture V6 hồi quy đã xem danh sách/tìm/chi tiết, trạng thái NEEDS_RECONCILIATION và biểu mẫu chia tiền với hai hợp đồng. Nguồn fixture đó đã stale nên không dùng để chứng minh lưu UI thành công.
- Kiểm tra tiếp ngày 28/10 trên fixture mới `QA-V6-UI-SPLIT-READY`: lưu thành công khoản thu 100 thành 60/40 cho hai hợp đồng. Database có đúng hai phần chia tổng 100, revision 3→4; vẫn một phiếu thu 100 và hóa đơn tổng 110. Tuy nhiên sau tải lại/mở lại/chọn khoản thu, biểu mẫu không tải hai phần đã lưu. Reviewer xác nhận P2: lưu biểu mẫu rỗng có thể xóa các phần chia hiện có, làm mất căn cứ quy tiền cho hợp đồng dù không đổi tổng phiếu thu/hóa đơn. **Chưa sửa**, đã hết hai vòng sửa. Bằng chứng: `ui-split-v6-proof.json`, `invoice-v6-split-reopen-missing.png` trong runtime.
- Trên local V6 xác nhận trang chạy, trạng thái rỗng khi lọc tháng không có dữ liệu và lỗi quyền tạo doanh nghiệp. Ảnh: `invoice-v6-company-role-required.png` trong thư mục runtime.
- Đã mở `http://127.0.0.1:8083/auth` để người dùng đăng nhập tài khoản quản trị/quản lý. Ảnh hướng dẫn: `invoice-v6-login-handoff.png`.
- Layout hẹp desktop đã quan sát, mã responsive đã review. Chưa kiểm chứng viewport điện thoại hoặc thiết bị di động thật; không tuyên bố mobile PASS.

## Kích hoạt local và bảo toàn dữ liệu

- API `http://127.0.0.1:8787`, UI `http://127.0.0.1:8083/einvoices`; health trả `ok:true`, database `crm_local`. Giao diện hiện chạy bằng Vite preview từ bản build V6, không phải hot dev.
- Migration 064–069 bất biến. 069 được áp dụng local, SHA256 `8ac6d63346ca821db4afaf298336307a9ac3c4304266265b1a4d0e51d1f49a7a`; không chạy migration remote.
- Trước/sau kích hoạt vẫn **50 hợp đồng, 502 hóa đơn**. Fingerprint ID và ba trường tiền, dùng biểu diễn text chưa chuẩn hóa: `af836efc96c86a4c584c17a3da4e7420`.
- **53 tệp storage** khớp checksum với bản sao lưu. Không tự tiếp nhận 502 hóa đơn cũ vào pháp nhân mới.
- Backup được kiểm chứng: `backups/invoice-workspace-before-v5-2026-10-27T16-20-24-510Z/`. `database.dump` 8.126.317 byte, SHA256 `4ee41aafbaf0b6384fd6a960695ab6ccec798651589fd792000fe92d7f8c73aa`. Có storage, danh sách hash, backup-proof và restore-proof.
- Đã thực sự khôi phục dump vào database tạm, kiểm đủ số bản ghi/fingerprint và sau đó dọn database khôi phục. Lần thử backup đầu thiếu tham số Docker không được tính là bản đã xác minh.
- Các API/UI/DB/role của hai fixture HOLD V4 và V6 đã dừng/dọn, tab QA đã đóng. Xóa thư mục tệp thử bị bộ kiểm duyệt tự động từ chối “blocked by policy”; giữ nguyên thư mục, không thử vượt chặn. Hai thư mục V3 từng bị từ chối trước đó cũng được giữ. Chúng chỉ chứa fixture giả lập, không phục vụ CRM.
- Không đọc/copy giá trị cấu hình bí mật, không gọi tài khoản provider thực, commit/push/deploy hoặc sửa dữ liệu từ chat khác. Các thay đổi báo giá/hợp đồng cùng checkout được giữ nguyên.

## Việc chưa nghiệm thu và điều kiện tiếp theo

1. Người dùng đăng nhập quản trị/quản lý để khai báo đúng pháp nhân/MST; hiện server từ chối quyền nên bước này chưa lưu thành công.
2. Người dùng nhập tài khoản Viettel trực tiếp trong cấu hình CRM. Cần kiểm tra đọc một trang, chạy kỳ mẫu, so với nguồn thật và kiểm đủ XML/PDF. Test transport giả không chứng minh tài khoản có quyền API hoặc đã đồng bộ đủ.
3. Cần tệp xuất XML/Excel/ZIP thực của doanh nghiệp từ cổng thuế để đối chiếu ánh xạ, số liệu, chống trùng và bộ hồ sơ. Parser không thay thế kiểm tra XSD/chữ ký hoặc kết luận pháp lý hóa đơn.
4. Tự động lấy cổng thuế chưa bật vì chưa xác minh được API được hỗ trợ. Nhập tệp xuất hợp lệ là luồng đầu vào hiện có. Không tự giải CAPTCHA/gọi API nội bộ.
5. Gửi nháp sang Viettel chưa triển khai; nháp hiện nằm tại CRM, đúng phạm vi chưa phát hành. Ký/phát hành vẫn không thuộc nhiệm vụ.
6. Chưa có sổ chuẩn hợp đồng mua/PO/phụ lục/đợt/nghiệm thu đã ký/nghĩa vụ đến hạn. Hỗ trợ bằng chứng ngoài hệ thống có kiểm tra; số tiền đến hạn hoặc giá trị hiệu lực chưa có căn cứ trả unknown kèm lý do.
7. UI V6 đã lưu split thành công nhưng **mở lại không hiển thị các phần chia và có thể ghi đè bằng danh sách rỗng**. Cần DTO trả các dòng có kiểm quyền, nạp lại editor theo khoản thu/revision và phân biệt xóa chủ động với trạng thái chưa tải. Không gọi đây là nghiệm thu luồng sửa split; chi tiết ở báo cáo UI 28/10.
8. Nghiệm thu trên điện thoại còn chưa thực hiện. Không lấy số lượng test làm bằng chứng hoàn thành bước này.

Tài liệu API chính thức và giới hạn connector: `docs/invoice-viettel-api-reference-2026-10-27.md`. Trạng thái mục tiêu vẫn đang thực hiện, chờ xác minh thực tế; chưa đánh dấu hoàn thành toàn kế hoạch.
