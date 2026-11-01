# 5S.1 — kiểm tra đơn giá theo mã Excel, chỉ đọc

Ngày 29/10/2026. Phạm vi: một đơn giá hiệu lực của mã công Excel × số lượng nhập theo đơn vị đang ghi trong bảng giá. Đây là kiểm tra cấu hình, không phải tiền đã duyệt cho nhân viên.

## Kết quả được triển khai

- `GET /api/payroll/product-rates/quote?code=&date=&quantity=` chỉ nhận ba giá trị bắt buộc, không nhận SKU, mã đơn giá tùy chọn, nhân viên, nhóm hoặc hệ số quy đổi. Mã theo `codeKey`, ngày lịch hợp lệ, số lượng thập phân dương tối đa 10 chữ số nguyên và 2 chữ số lẻ.
- Đọc lại hồ sơ đang hoạt động, vai trò và quyền hiện tại trong giao dịch `REPEATABLE READ READ ONLY`. Admin, quản lý và kế toán được đọc theo chính sách quyền lương; nhân viên/tổ trưởng không được cấp quyền nhạy cảm qua grant thông thường.
- Xét toàn bộ giá đã duyệt còn hiệu lực theo mã chuẩn. Không giá, nhiều giá kể cả trùng hoàn toàn, nguồn tên/đơn vị/giá không hợp lệ hoặc giá 0 đều trả lý do chặn. Tính phép nhân và làm tròn bằng PostgreSQL `numeric`, trả chuỗi số; không dùng JavaScript Number cho tiền/số lượng.
- Kết quả luôn `CONFIG_PRICE_INSPECTION`, `quantity_basis=RECORDED_UNIT`, đơn vị thật và ánh xạ `NOT_ASSESSED`, `pay_ready=false`, `operational_activation=DISABLED`. Không cung cấp token ghi tiền hoặc tự quy đổi đơn vị.
- Chặn alias thô/action alias `product_rates`/`local_product_rates` tại các adapter table/snapshot/rpc/functions, kể cả mã hóa chữ và khoảng trắng quanh tên. Không đổi đường API giá chính thức.
- Chỉ sửa đúng hai câu chữ giao diện đã được giao để bỏ yêu cầu nhóm giá; không thay bố cục, sự kiện hay trạng thái giao diện.

## Bất biến và phạm vi không thay đổi

Không migration/schema/seed, nhóm giá, hồ sơ nhân viên, công thức hay bộ chọn giá của nghiệp vụ đang chạy; không sửa resolver, yêu cầu kỹ thuật, phiên bản ánh xạ, fingerprint lương hoặc lịch sử đã duyệt. API mới chỉ đọc, local-only; không ghi dữ liệu thật, Supabase hoặc kích hoạt vận hành.

## Kiểm chứng và giới hạn

Nguồn được đóng băng trước QA tại `.local-staging-runtime/item5s1-baseline/`. Các bài kiểm tra mới gồm grammar/alias/quyền thuần, PostgreSQL/API cách ly với số cực đại, NaN, mã Unicode, ngày hiệu lực, trùng giá, quyền đổi giữa middleware và handler, writer đồng thời và đối chiếu dữ liệu trước/sau. Hồi quy tài chính dùng fixture V2 hiện có trong cơ sở dữ liệu do lượt kiểm thử sở hữu.

5S.1 V2 đã được root nghiệm thu riêng phần lõi kiểm tra một đơn giá chỉ đọc, với sai lệch hồi quy tài chính có từ trước được ghi rõ; không nghiệm thu toàn bộ tính lương. Nguồn 797/797 hash khớp, drift 0 tại nghiệm thu. Mục 5/5A và luồng vận hành 8/11/13 chưa hoàn tất; mục 6 chưa mở. Không thêm thao tác UI, không kích hoạt vận hành; `pay_ready=false`.


## Nghiệm thu giới hạn 5S.1 V2 — 29/10/2026

- Quyết định: `ACCEPTED_READ_ONLY_SINGLE_PRICE_CORE_WITH_DOCUMENTED_PREEXISTING_FAILURE` tại `.local-staging-runtime/item5s1-baseline/root-v2-acceptance.json`, SHA256 `ad4e965b96e4b4f304b2516e79bf57ebd8545a1ccbe3cc36598180ac4c2f6ad0`. Freeze V2 SHA256 `b31af7c7450b9f64dc516a94fca9b07cb7809518a2a01841f0e06f4cd129a921`; 797/797 tệp nguyên tại nghiệm thu.
- Kiểm chứng đạt đúng phạm vi: own core API 12 nhóm; pure 9 nhóm/8.400 tổ hợp alias; reviewer 10 nhóm/360 alias; tester độc lập 10 nhóm/1.728 alias; root actual API 6 nhóm. Pure, TypeScript app/server và focused lint đạt. Build không .env có 173 artifact/498 nguồn, SHA256 `46e626b7860a03b193cc165421861b7033f0a721d5003f78cbb8bcc548110efc`. Các bộ kiểm thử không được cộng thành chứng minh toàn bộ payroll.
- Hồi quy tài chính S13 vẫn **FAIL**: gross hiện tại 6.215.000 so với oracle lịch sử 6.224.230,769231. Tính lại bằng source prechange trên clone synthetic riêng cũng 6.215.000; nguyên nhân chưa giải quyết. Không sửa công thức hoặc oracle, không đổi kết quả lỗi thành PASS. Bằng chứng `payroll-prechange-differential-proof.json` và `own-v2-proof.json` trong cùng staging.
- Mã chứa NUL trả HTTP 400 qua handler PostgreSQL 22021 hiện có; parser chưa từ chối trước kết nối và thông báo driver chưa Việt hóa. Đây là giới hạn validation/ngôn ngữ được ghi nhận, không phải lỗi 500 hoặc bằng chứng bộ nhập liệu đã hoàn thiện.
- Giữ nguyên lỗi lint V1, các lần thử harness/status/cleanup của tester và lỗi helper/root-proof trong lịch sử. Ghi business database 0; gọi dịch vụ ngoài 0; không Supabase/deploy/activation. Nghiệm thu không mở item 6 hoặc xác nhận toàn mục 5/5A.
- Sau nghiệm thu chỉ cập nhật báo cáo này và implementation log; manifest/quyết định nghiệm thu giữ nguyên. Đối chiếu freeze hiện tại: 795 tệp nguyên, đúng 2 tài liệu đổi có chủ đích; nguồn/kiểm thử không đổi. Giữ HOLD chờ hợp đồng 5S.2: an toàn soạn/duyệt giá và lịch sử, UI một giá gọn/xuất số chính xác, dữ kiện/đơn vị thật và tích hợp sản lượng/người/đơn/ngày ở 8/11/13 vẫn còn.
