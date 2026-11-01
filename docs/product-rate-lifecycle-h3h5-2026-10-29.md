# Nhập và duyệt đơn giá công may — H3–H5, 29/10/2026

Đơn giá Excel tính cho **một sản phẩm hoàn thành (PIECE)**. Không suy ra đơn giá từ
SKU bán hàng, không chia tổ/nhóm lương. Quản lý nhập và duyệt tại
`/production-attendance?tab=rates`; nhân viên báo số lượng theo công việc hợp lệ.

## Phạm vi chuyển đổi

- Danh mục sản phẩm chỉ lưu thông tin sản phẩm, giá bán và giá vốn. Gửi trường đơn
  giá công may vào API tạo sản phẩm, hoặc gọi API đơn giá catalog cũ, nhận 409
  `PRODUCT_RATE_CANONICAL_REQUIRED` trước khi mở kết nối SQL cho handler.
- Import CLI dùng đúng API nhập Excel hiện có, chỉ tạo **DRAFT**, không tự duyệt.
  Đã bỏ truy cập PostgreSQL trực tiếp, biến môi trường database/workbook và cờ
  `--price-list`. Không tạo sản phẩm hoặc bảng giá bán khi nhập đơn giá.
- API kiểm tra hồ sơ/role hiện hành của quản lý hoặc quản trị viên trước kết quả
  xem trước và trong giao dịch apply, kể cả khi trả lại kết quả nhập cũ. Thu hồi
  quyền sau lần nhập thành công sẽ chặn cả đọc lại receipt.

## Cách sử dụng

Ưu tiên nhập Excel trong giao diện quản lý. CLI dành cho vận hành nâng cao với
**phiên đăng nhập cá nhân đã có**, truyền qua stdin; không truyền token vào argv,
biến môi trường, tệp hoặc lịch sử lệnh. CLI không đăng nhập hộ hay tạo phiên.

Cột A:C của sheet `don-gia-moi`: `ma_sp`, tên công may, `don_gia`. Giữ mã nguyên
văn (kể cả số 0 đầu và khoảng trắng bên trong); tiền thập phân/giá lớn phải là
**Text** để không bị Excel làm tròn. Không dùng công thức, ô ngày hay rich text
trong A:C. Các cột D trở đi là ghi chú. Tối đa 10000 dòng. Mặc định ngày hiệu lực
`2026-01-01`; có thể chọn ngày hợp lệ dạng `YYYY-MM-DD`.

Ví dụ dưới đây **chỉ dùng phiên giả** nên sẽ bị API thực từ chối; không thay phiên
giả bằng token thật trong lịch sử PowerShell. Công cụ vận hành tin cậy phải cấp
phiên hiện có trực tiếp vào stdin, hoặc dùng giao diện quản lý:

```powershell
'synthetic-session-not-a-real-secret' | npm run import:local-piece-rates -- --file="C:\path\to\luong_2026.xlsx" --api-url=http://127.0.0.1:8787 --session-stdin --effective-from=2026-01-01
'synthetic-session-not-a-real-secret' | npm run import:local-piece-rates:apply -- --file="C:\path\to\luong_2026.xlsx" --api-url=http://127.0.0.1:8787 --session-stdin --effective-from=2026-01-01
```

Chỉ nhận `http://127.0.0.1:<port>` hoặc `http://[::1]:<port>`, cổng 1–65535;
không nhận DNS/localhost, HTTPS, URL có đường dẫn/query hay chuyển hướng.
Phiên stdin tối đa 8192 byte, không rỗng, chỉ một dòng (cho phép LF/CRLF cuối).
Các cờ duy nhất: `--file=`, `--sheet=`, `--effective-from=`, `--api-url=`,
`--session-stdin`, `--apply`. Sai/lặp cờ bị từ chối và không in giá trị nhập.

## Xem trước, nhập nháp và chạy lại

Không có `--apply`: chỉ GET thông tin phiên và POST xem trước; đầu ra ghi
`PREVIEW_ONLY / CHUA_NHAP`, số dòng và vị trí lỗi an toàn. Lỗi chi tiết xem trong
giao diện quản lý. Không có batch/draft/audit được tạo bởi preview chỉ có đơn giá.

Có `--apply`: GET thông tin phiên rồi POST apply **trực tiếp**, không preview lại.
Kết quả ghi `DRAFT_OR_SUBMITTED`, fingerprint và ID nháp. Quản lý phải mở mục
Đơn giá công may, xem và duyệt bằng luồng canonical hiện có.

Nguồn nhập dùng `piece-rate-workbook-http-v1:<SHA256>` từ toàn bộ nội dung ngữ
nghĩa: schema, thứ tự/số dòng gốc, mã, tên, đơn giá chính xác, ghi chú và ngày hiệu
lực. Không đưa tên/đường dẫn file, thời gian hay tài khoản vào nguồn. Đổi tên file
giữ nguyên body/fingerprint. Ghi chú được chuẩn hóa khoảng trắng như parser cũ;
tiền tương đương được chuẩn hóa về chuỗi hai chữ số lẻ. Dòng/ghi chú/ngày thay đổi
về ngữ nghĩa tạo nguồn khác. `ly_do` có tiền tố cố định
`Nhập Excel công may (HTTP v1)` và ghi chú của dòng.

Nếu mất phản hồi khi apply, **không tự thử lại ngầm**. Lặp lại đúng lệnh, cùng nội
dung file, ngày và tài khoản; server trả lại receipt đã COMMITTED cho
actor+fingerprint, không tạo thêm nháp/audit. Giá đã duyệt/hủy sau lần nhập vẫn
trả receipt lịch sử (`HISTORICAL_SAVED_RESULT_REFRESH_REVIEW`); tải lại giao diện
để xem trạng thái hiện tại. Đổi tài khoản không nhận receipt của người trước.
Nguồn direct-PG cũ không phải receipt API và không được tự nhận làm batch mới.

Mỗi request tối đa 30 giây; phản hồi stream tối đa 2 MiB; body tối đa 25 MiB.
Deadline bao gồm chờ header, đọc toàn bộ stream và phân tích JSON. Khi hết hạn,
CLI hủy request và reader, trả lỗi cố định; không chờ stream treo đóng lại.
CLI chỉ gọi `/api/local-auth/me`, `/api/payroll/import/preview` hoặc
`/api/payroll/import/apply`, không gọi approve hoặc tạo phiên. Không ghi token,
response thô, stack mạng hay URL tùy ý ra đầu ra.

## Kiểm chứng và giới hạn

Hai suite tập trung trong lần chuyển đổi này:

```powershell
node scripts/test-product-rate-lifecycle-h3h5.mjs
node scripts/test-product-rate-lifecycle-h3h5-isolated.mjs
```

Suite đầu kiểm tra handler thực được trích xuất, cầu nối serializer thực của
server, parser, determinism và HTTP CLI. Suite thứ hai chỉ dùng database/role
synthetic mới, non-superuser, API riêng, migrations tới 074 và chặn outbound;
kiểm tra preview, DRAFT, mất phản hồi/replay, đồng thời, quyền hiện hành, duyệt
canonical, lịch sử hiệu lực, rollback và giải phóng client. Chạy từ QA snapshot
đóng băng; kết quả máy đọc và manifest nằm trong staging của lần QA. Tài liệu này
mô tả phạm vi kiểm tra, không tự thay thế kết quả chạy hay chấp thuận độc lập.

Không sửa công thức lương, phân quyền chung, migration, UI hay dữ liệu thực. Giá
APPROVED cũ được giữ nguyên, không tự sửa đơn vị hoặc backfill. Đây chỉ đóng đường
ghi giá thay thế; chưa chứng minh đủ 126 mã thực, quy cách sản phẩm, mapping 5A
hoặc sẵn sàng tính lương. S13 còn lỗi đã biết; item5/5A chưa tự hoàn tất, item6
chưa mở, kích hoạt và triển khai vẫn tắt.


### Nghiệm thu giới hạn H3–H5 V3 — vòng đời các đường ghi đơn giá, 29/10/2026

- Root chấp nhận **ACCEPTED_BOUNDED_H3_H4_H5_SUPPORTED_RATE_WRITER_LIFECYCLE_V3** tại `.local-staging-runtime/item5h3h5-baseline/root-v3-acceptance.json`, SHA256 `2e9bb8836737f056c037d1b3e419296156dab0ce0d732c98fa679488542f1cc7`. Snapshot QA cố định `.local-staging-runtime/item5h3h5-fixed-qa-1793251961478-de2a76` có 899 tệp, không ngoại lệ hash; manifest SHA256 `4675e017e8fca17de79695546576f1af9ff94ec68e5492764162a4985b711628`. Sáu tệp gốc đúng bản đã kiểm trước khi append tài liệu. Phạm vi nghiệm thu chỉ vòng đời các writer đơn giá được hỗ trợ, không phải toàn bộ mục 5/5A hay toàn luồng lương.
- Catalog chỉ lưu sản phẩm/giá bán/giá vốn; yêu cầu ghi đơn giá công cũ nhận 409 trước kết nối handler. CLI dùng phiên cá nhân quản lý/admin qua stdin, HTTP loopback, API nhập nháp DRAFT; không ghi PostgreSQL trực tiếp, không tạo sản phẩm/bảng giá bán và không tự duyệt. Preview không ghi; apply gửi trực tiếp cùng body/fingerprint ổn định, receipt actor+fingerprint phục vụ chạy lại khi mất phản hồi. Quyền hiện hành kiểm lại trước preview và trước ghi hoặc trả receipt; duyệt/hủy vẫn qua luồng canonical.
- Own **8 nhóm pure/HTTP và 8 nhóm PostgreSQL/API/CLI đạt**; type ứng dụng/server, lint trong phạm vi, build server/packaging và no-env UI build đạt. Root kiểm lại 184 artifact build thực. Kiểm thử độc lập mới trên V3 gồm **9 nhóm transport, 4 nhóm native deadline và 2 nhóm API/PG/CLI**; reviewer V3 thực hiện **8 kiểm tra tập trung**. Đây là các bộ kiểm riêng, không cộng số nhóm thành chứng minh ngoài phạm vi.
- Bằng chứng server V2 được **tái sử dụng theo hash không đổi**, không ghi là đã chạy lại toàn bộ trên V3: **11 nhóm API thật**, 155 bảng public, 6 quan sát khóa PostgreSQL và 30 giao dịch đơn giá xác nhận thứ tự source → config. Bằng chứng rà nguồn/mock V2 cũng được tái sử dụng: **5 nhóm, 1088 tình huống**. V3 chỉ đổi cơ chế deadline CLI cùng kiểm thử/tài liệu tương ứng; fresh V3 API kiểm wire/lifecycle vẫn đúng. Kết quả kiểm có DRAFT, exact max18,2, receipt mất phản hồi, duyệt/hủy canonical, lịch sử hiệu lực/continuation, quyền bị thu hồi và rollback; không chứng nhận dữ liệu lịch sử thật.
- Giữ nguyên FAIL thật V1 bỏ sót dữ liệu Excel sau dòng trống và FAIL thật V2 native abort đã gọi gần 30 giây nhưng reader partial JSON vẫn treo tới watchdog 40 giây. Không đổi FAIL cũ thành PASS. V3 sửa rowCount/columnCount đã có ở V2 và bổ sung deadline toàn fetch/stream/JSON, hủy reader không chờ; native độc lập thoát **30,37–30,45 giây**, code1, lỗi cố định, stdout rỗng, socket0 trước cleanup, không bị cưỡng dừng và không tự retry. Ca non2xx body treo thoát khoảng 385ms. Không thêm process.exit hoặc đổi global dispatcher.
- Fixture mới đã dừng child/API/proxy/server và xóa đúng DB/role/temp sở hữu; hash snapshot và pin được kiểm sau cleanup. Tài nguyên H2 cũ bị automatic approval review từ chối cleanup vẫn được giữ nguyên, không retry hoặc bypass; không tuyên bố tất cả tài nguyên lịch sử đã sạch. V1/V2 freeze, báo cáo FAIL, bằng chứng và quyết định nghiệm thu giữ bất biến.
- Đơn giá người dùng cung cấp tính cho **một sản phẩm hoàn thành (PIECE)**, không chia tổ/số người. Đơn vị/nguồn/lịch sử APPROVED thật và 126 mã, dữ kiện kỹ thuật/coverage/ánh xạ 5A còn **UNVERIFIED_UNMODIFIED**; chưa backfill, đổi đơn vị hoặc tự duyệt dữ liệu thật. S13 **KNOWN_FAIL_PRESERVED_NOT_RERUN** và tích hợp người/đơn/ngày/sản lượng 8/11/13 còn lại. Toàn mục 5/5A **INCOMPLETE**, mục 6 **NOT_OPENED**, activation **DISABLED**, `pay_ready=false`; business DB writes0, Supabase calls0, không deploy.
- Hậu nghiệm thu chỉ append đúng ba tài liệu lifecycle/log/master, giữ toàn bộ byte lịch sử làm prefix. Kiểm trước/sau đầy đủ manifest hiện tại, 899 tệp snapshot và 52 mục pin quyết định; không sửa mã nguồn chạy hoặc evidence. Sau rà tài liệu chỉ chuẩn bị hợp đồng 5A dạng chỉ đọc; chưa mở chỉnh sửa production tiếp theo.
