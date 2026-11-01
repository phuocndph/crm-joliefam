# Hoàn thành bốn phần còn lại — 28/10/2026

Người dùng đã đổi mục tiêu sang triển khai dứt điểm bốn phần còn lại. Đây là đợt mới có phạm vi cụ thể; giữ bằng chứng V6 và finding cũ, không coi việc đổi đợt là đã sửa lỗi.

| Phần | Điều kiện hoàn thành | Bằng chứng cần có |
|---|---|---|
| 1. Chia tiền an toàn | Mở lại có phần chia đã lưu; không ghi đè ngầm bằng rỗng; tải/sửa/xóa chủ động kiểm quyền và revision | Regression API cô lập + review cùng freeze + UI lưu/mở lại/đổi khoản/refetch/stale/lỗi |
| 2. Doanh nghiệp và truy cập | Đúng pháp nhân/MST hiện có, tài khoản có quyền sử dụng; danh sách và bộ lọc hoạt động | Cấu hình UI và truy vấn danh sách thực không lỗi; không tạo doanh nghiệp trùng hoặc tự tăng quyền |
| 3. Viettel thực | Đọc được tài khoản API hiện hành, đồng bộ một kỳ, đối chiếu nguồn và tình trạng XML/PDF | Biên nhận đọc/sync thực, số liệu và tệp đối chiếu; test giả không thay thế |
| 4. Tệp cổng thuế và mobile | Tiếp nhận tệp thực với preview/commit/chống trùng/đối chiếu; thao tác được trên viewport điện thoại | Tệp do doanh nghiệp cung cấp và kết quả đối chiếu; ảnh/thao tác ở 360–390px, không chỉ review CSS |

## Trạng thái ban đầu được kiểm lại

API 8787 đang `ok:true`, database `crm_local`. Root đã đăng nhập qua thông tin được điền sẵn trên form CRM; không đọc mật khẩu. Pháp nhân **Công Ty TNHH Gia Lộc Hưng Phát — 0108652480** đã có, đang được chọn. Thông tin trước đây “chưa có pháp nhân” đã hết hiệu lực, không tạo thêm.

Danh sách phạm vi doanh nghiệp trên tài khoản hiện tại lỗi PostgreSQL `could not determine data type of parameter $3`. Đã xác định admin predicate tạo một tham số null không được dùng; đưa vào sửa hẹp trong đợt này, không bỏ kiểm quyền. Cấu hình nguồn Viettel đã có; kết quả cũ FAILED/READ_FAILED cần kiểm tra hiện tại, không đọc hoặc sao chép mật khẩu từ DB.

## Phạm vi sửa và bất biến

Sole writer `crm_implementer`; explorer và architect đã kiểm tra độc lập. Dự kiến sửa route/helper/DTO/panel chia tiền và builder danh sách admin. Không cần migration; 064–069 giữ nguyên. Tiền là decimal string; GET/POST kiểm toàn bộ phần chia hiện có, không để dữ liệu bị lọc thiếu rồi thay toàn bộ. Editor giữ revision baseline, chặn save khi chưa tải/stale/refetch không tương thích; xóa phải là yêu cầu riêng có lý do.

Không tạo/sửa phiếu thu hoặc tổng tiền hóa đơn, không tự cấp quyền, không tự chuyển dữ liệu lịch sử, không ký/phát hành, không commit/push/deploy. Bảo toàn thay đổi báo giá/hợp đồng từ công việc khác. Mọi thử mutation dùng database cô lập; runtime vận hành chỉ cập nhật sau freeze/review/test và backup phù hợp.

Sau freeze mới, tester và reviewer kiểm cùng hash; tối đa hai vòng sửa finding có bằng chứng cho đợt này. Root nghiệm thu UI/runtime và cập nhật từng phần theo kết quả thực tế. Phần tài khoản/tệp thiếu phải nêu đúng điều kiện, không đổi mục tiêu hoặc đánh dấu xong từ test giả.

## Kiểm tra nguồn thực trong đợt mới

Đã chạy thao tác **Kiểm tra đọc một trang (không nhập)** bằng cấu hình đang có của GLHP. Kết quả hiện tại FAILED/READ_FAILED, thời điểm lưu 28/10/2026 03:44:30 UTC (10:44:30 Việt Nam). UI không trả nguyên nhân cụ thể. Không đọc/copy mật khẩu; chỉ kiểm `enabled`/`password_present` và trạng thái an toàn. Chưa đồng bộ dữ liệu hoặc tệp, không tuyên bố kết nối thành công.

Kiểm tra kết nối Node không kèm xác thực tới gốc API công khai truy cập được, trả HTTP 500 cho GET gốc. Kết quả này chỉ loại trừ mất kết nối hoàn toàn; không chứng minh endpoint đọc có lỗi hoặc tài khoản sai. Cần phân loại lỗi an toàn tại adapter/check route trước khi quyết định sửa giao thức hay yêu cầu cập nhật tài khoản.

Đã xác nhận đúng một pháp nhân active theo MST 0108652480, 502 hóa đơn vận hành. Hiện chưa có bản ghi trong `local_invoice_files`; 53 tệp storage bảo toàn trước đó không đồng nghĩa có XML/PDF gốc của doanh nghiệp trong sổ hóa đơn mới. Đã hỏi đường dẫn tệp xuất thật để nghiệm thu phần 4, chưa nhận được.

## Kết quả phần 1 trên bản cố định

Manifest `.local-staging-runtime/invoice-20261027/phase-20261028-v1.json`, SHA256 `80FC3B857D0092CC346CB99D1181194CA3FAB1C56303E5732BCA6BCD37483C19`, 43 tệp production. Reviewer độc lập PASS; **75/75 nhóm hóa đơn và 15/15 nhóm hợp đồng PASS**. Ba lỗi lượt thử đầu do fixture cố thay đổi nguồn đang có guard; tester sửa fixture hợp lệ và giữ log đầu, không sửa production để làm test xanh. Migrations 064–069 không đổi.

Root thực hiện UI trên fixture riêng: mở khoản đã chia hiện đúng 60/40; sửa và lưu 70/30; chủ động tải lại hiện đúng 70/30; chuyển sang khoản chưa chia hiển thị rỗng thật, nút lưu rỗng bị khóa. Truy vấn DB xác nhận vẫn hai phiếu thu tổng 200 và hóa đơn 220; khoản thứ hai chưa bị tạo phần chia. Bằng chứng `ui-split-part1-20261028-proof.json`, `invoice-part1-split-reload-70-30.png` trong runtime.

Kiểm tra viewport 390x844 phát hiện hộp chi tiết tràn ngang: dialog clientWidth 373, scrollWidth 645, nội dung con rộng khoảng 597. Finding mobile đã giao sole writer sửa hẹp trong hộp chi tiết/preview, không đổi Dialog toàn hệ thống. Không dùng kết quả desktop để đánh dấu mobile đạt. Bản vận hành vẫn đang V6 trong lúc chờ chốt đợt chẩn đoán và mobile tiếp theo.

Backup trước cập nhật đợt mới: `backups/invoice-workspace-before-remaining-20261028-2026-10-28T03-52-56-928Z/`; dump SHA256 `014fc035e8d1acb36defdf8034cbc118324616ad91cf97ccec22e5b099a08421`. Đã restore thật vào DB tạm và kiểm đủ 502 hóa đơn, 50 hợp đồng, fingerprint `af836efc96c86a4c584c17a3da4e7420` cùng 53 tệp storage, sau đó dọn DB restore.

## Yêu cầu tham khảo GitHub

Người dùng yêu cầu tìm dự án tương tự rồi áp dụng. Đã đọc public metadata/README và source/license qua reviewer, không cài/chạy code ngoài:

- `cassostation8/demo-api-gdt` (MIT), commit `f6d43d9e0b7acaf9afb0345e9a20d91ef2363ee5`: mô hình trạng thái kết nối/sync/độ phủ/tệp và chống phản hồi cũ. Dự án dùng dịch vụ Casso; việc tham khảo không tự cấp quyền gửi dữ liệu doanh nghiệp sang Casso hoặc tạo tài khoản dịch vụ.
- `ngoquangthanhphu/vn-einvoice` (MIT), commit `78e72e6416663170bae2351eb718d86ad11bd602`: preview có cấu trúc và cảnh báo khi nhập XML. CRM giữ số thập phân chính xác và giá trị thiếu; không dùng số thực/tự điền 0 như thư viện tham khảo.
- `thuanhuynh247/gdt-invoice-hub`: tham khảo hành vi sản phẩm; chưa thấy license repository nên không sao chép nguồn. README mô tả API GDT nội bộ/best effort không chứng minh đó là giao thức chính thức ổn định cho CRM.

Đưa vào đợt đang làm: chẩn đoán nguồn an toàn và trạng thái kiểm tra nhất quán; preview đọc được MST hai bên, chiều hóa đơn, dòng hàng, cảnh báo và giới hạn xác minh chữ ký; layout mobile dùng được. Không đổi nguồn dữ liệu thật thành dữ liệu GitHub mẫu, không thay thế kiểm tra tài khoản/tệp thật bằng demo.
