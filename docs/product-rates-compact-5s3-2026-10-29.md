# Đơn giá công local gọn và xuất Excel chính xác — 5S.3

Ngày 29/10/2026. Phạm vi: giao diện danh sách/soạn đơn giá công local và xuất Excel thông tin. Không thay công thức lương, máy chủ, cấu trúc dữ liệu, nguồn giá chuẩn hoặc bản Supabase.

## Thay đổi

- Local có bảng năm cột trên desktop và dòng dạng thẻ trên mobile. Mã/tên/giá đầy đủ được xuống dòng, một menu thao tác 44px mỗi dòng. Thanh công cụ giữ tìm kiếm, trạng thái, nguồn, sắp xếp và xuất đúng danh sách đang lọc.
- Form chính gồm mã, tên, giá chính xác, ngày bắt đầu và lý do. Liên kết CRM, nguồn và ngày kết thúc nằm trong phần mở rộng. Thân form cuộn trong màn hình; thanh Hủy/Lưu giữ nhìn thấy.
- Theo xác nhận nghiệp vụ, mọi giá Excel đã cung cấp tính cho một sản phẩm hoàn thành (PIECE). Nháp local mới mặc định PIECE. Khi sửa/sao chép bản cũ SET/HOUR/METER, giao diện ghi đúng đơn vị đang lưu và giữ payload; không tự chuyển dữ liệu thật hoặc duyệt ánh xạ.
- Local dùng `rate_exact` để hiển thị, so sánh và xuất; không dùng Number làm giá dự phòng. Giá lỗi hiển thị rõ và nằm cuối ở cả hai chiều sắp xếp.
- Excel giữ chín cột thông tin. Giá có phần lẻ hoặc trên 15 chữ số nguyên được ghi dạng văn bản thập phân chuẩn để giữ chính xác. Giá nguyên tối đa 15 chữ số dùng ô số. Ngày Gregorian 0001–9999 ghi nguyên ISO dạng chữ; mã/tên/nguồn giữ literal, không tạo công thức. Dòng lỗi trong phạm vi xuất chặn toàn tệp với thông báo dòng/mã.
- Giữ API tải xuống, tệp đã chuẩn bị và nút tải trực tiếp. Giữ các closure đã nghiệm thu về basis, ý định và khóa retry; không tự tải basis mới khi lưu.

## Kiểm chứng và giới hạn

Bằng chứng riêng lưu trong `.local-staging-runtime/item5s3-baseline/`. Kiểm thử own xuất Excel bao gồm parser/sort chính xác, sáu mức giá sát cực đại, ô số/văn bản, bốn đơn vị, ngày cổ/leap, XML không có công thức, chuỗi giống công thức, ký tự XML bất hợp lệ, API tải xuống và closure thực tế của bộ lọc/xuất. Lần đầu có hai lỗi oracle của harness, đã giữ proof FAIL riêng và sửa assertion; không đổi nguồn nghiệp vụ để tạo PASS.

Own QA trước freeze: 9 nhóm helper/XLSX/download/closure đạt; 5 nhóm fixture health, dữ liệu exact, replay API/quyền kế toán, full-app build không .env và proxy/bootstrap đạt. TypeScript app/server và lint đúng sáu tệp phạm vi áp dụng đạt. Root source-invariants xác nhận đúng hai tệp cũ thay đổi/bốn tệp mới; 41 statement ngoài ProductRatesTab/RateForm, năm closure đã nghiệm thu và toàn hàm download giữ nguyên. Fixture own đã dừng API/UI, xóa database/role sở hữu. Browser acceptance desktop/mobile và bốn thao tác sau mất phản hồi vẫn chờ root/tester, chưa tuyên bố đạt bằng smoke.

Fixture own tạo database/role không superuser riêng trên PostgreSQL local cách ly, chạy nguyên ứng dụng với build không đọc .env, chặn outbound và chỉ proxy API của fixture. Có capture và mô phỏng mất phản hồi sau commit để kiểm retry từ trình duyệt. Script hỗ trợ giữ fixture cho QA độc lập và xóa đúng tài nguyên sở hữu khi kết thúc. Readiness/build không thay thế kiểm giao diện thực tế; kết quả desktop/mobile, bốn thao tác và audit phải ghi bằng bằng chứng riêng trước nghiệm thu.

Tài liệu này được soạn trước freeze; kết quả cuối cùng theo manifest và quyết định nghiệm thu độc lập. Toàn mục 5/5A chưa hoàn tất. Còn writer catalog/bulk/CLI kế thừa, dữ kiện/ánh xạ/đơn vị thật, lỗi hồi quy lương S13 đã ghi nhận và tích hợp việc/người/đơn/ngày/sản lượng ở mục 8/11/13. Không mở mục 6, không ghi business DB, không Supabase hoặc triển khai; activation giữ DISABLED, pay_ready=false.

## V2 — khôi phục focus sau khi đóng hộp thoại

Root kiểm trình duyệt thực tế V1 phát hiện đóng hộp chi tiết hoặc thêm giá bằng Escape trả focus về BODY. Own V1 PASS chỉ phản ánh phạm vi kiểm thử own; giữ freeze và bằng chứng lỗi V1 riêng, không sửa kết quả lịch sử thành PASS.

V2 chỉ bổ sung quản lý focus trong ProductRatesTab local: ghi nhận nút Thêm hoặc menu dòng đã mở hộp thoại; khi đóng trả về nút còn kết nối và đang hiển thị. Nếu refresh thay nút, tìm nút hiển thị cùng ID dòng rồi cùng mã; nếu mất quyền/không còn dòng thì về ô tìm kiếm. Không chọn bản desktop/mobile đang ẩn. Sau refresh bất đồng bộ chỉ sửa focus khi đang ở BODY hoặc mục tiêu trước; không giành focus người dùng đã chuyển hoặc khi hộp thoại khác đang mở. Không thêm truy vấn nghiệp vụ, tải basis hay đổi closure lưu/duyệt/retry.

Kiểm thử callback thực được biên dịch với DOM mock bổ sung các ca nút còn/mất kết nối, trùng desktop/mobile ẩn, thay dòng sau refresh, dự phòng mã/tìm kiếm, mất quyền, hộp thoại khác mở trước animation frame và người dùng đã chuyển focus. Kiểm GUI thực tế V2 tiếp tục chờ root/tester trên freeze mới; mock không được coi là nghiệm thu trình duyệt.

## V3 — sửa ba trường hợp cạnh tranh focus còn lại

Kiểm độc lập V2 phát hiện ba lỗi callback: lần khôi phục đầu giành focus người dùng vừa chọn, callback cũ đọc yêu cầu mới, và mục có client rect nhưng `visibility:hidden` làm mất đường dự phòng. Root kiểm thao tác đóng thông thường V2 đạt nhưng không nghiệm thu vì các lỗi biên này; giữ cả bằng chứng đạt giới hạn và FAIL độc lập.

V3 gắn từng callback chờ vào đúng đối tượng yêu cầu và phạm vi hộp thoại đang đóng. Lần khôi phục đầu cũng tôn trọng focus mới đang dùng ngoài hộp thoại. Nút bị ẩn, inert, aria-hidden hoặc CSS visibility/display không phù hợp bị loại; sau gọi focus phải kiểm lại activeElement, nếu không thành công thử mục tiêu tiếp theo và chỉ ghi đã khôi phục khi focus thực sự tới nơi. Kiểm own bổ sung các tình huống này bằng callback nguồn thực; GUI V3 vẫn phải kiểm độc lập trên freeze mới. Không sửa exporter/helper, máy chủ, basis, công thức hoặc phạm vi ngoài ba tệp focus của V2.


### Nghiệm thu giới hạn 5S.3 V3 — 29/10/2026

- Root chấp nhận ACCEPTED_BOUNDED_COMPACT_RATES_EXACT_EXPORT_AND_FOCUS_V3; quyết định `.local-staging-runtime/item5s3-baseline/root-v3-acceptance.json` SHA256 `18833a49b3dc9d3fe5d2d2a9509c177485f8e1688ebf63b2e8227d6b05828055`; freeze849 tệp SHA256 `9b9daafce6fceda687ee255ffc06dfa99f8629567125e003bbea5e889a4c9e2b`. Chỉ giao diện giá công local, hiển thị/sắp xếp chính xác, Excel thông tin và vòng đời focus; không nghiệm thu toàn mục5/payroll.
- Own10 nhóm; architect9 nhóm focus và4 nhóm workbook actual XLSX V1 áp dụng cho helper/exporter giữ nguyên. Root12 kiểm focus GUI desktop1280/mobile390; bốn thao tác CREATE/UPDATE/APPROVE/DISCARD mất phản hồi sau commit rồi retry giữ key/basis, mỗi thao tác đúng một audit/receipt. Đối chiếu155 bảng public trong fixture, Blob Excel thật giữ giá/cents, danh sách lọc/thứ tự và prepared-download; không tuyên bố tệp đã lưu xuống filesystem native. App/server types, focused lint và no-env build184 artifact đạt trong phạm vi evidence.
- V1 lỗi focus thực tế và V2 ba lỗi callback cạnh tranh được giữ nguyên cùng freeze/ownPASS/rootFAIL hoặc normalGUI PASS giới hạn. V3 kiểm riêng identity callback, focus mới của người dùng, visibility/inert/aria-hidden, fallback có xác nhận focus. Không đổi lịch sử lỗi thành PASS.
- Giữ41 statement ngoài tab, năm closure authoring, nhánh Supabase, download function, server/schema/công thức. Optional thiếuexact/basis GUI NOT_RUN (pure/source đã kiểm); queued focus edge do synthetic DOM chứng minh, vòng đời normal/error/success kiểm bằng GUI riêng. Tester đã xác nhận cleanup fixture và849 hash/pins trước append tài liệu.
- Còn inherited writers, dữ kiện/kỹ thuật/đơn vị/ánh xạ thật5A, S13 FAIL đã ghi nhận và tích hợp8/11/13. Toàn mục5 INCOMPLETE; mục6 chưa mở, businessDB0, Supabase0, không deploy/activation; pay_ready=false.
