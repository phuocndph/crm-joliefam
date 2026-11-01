# H2 — đọc đơn giá chính xác, mã công may thống nhất và ngày hợp lệ

Phạm vi 29/10/2026: bốn đường ghi kế thừa (catalog có giá công, catalog thêm giá riêng, sheet BANG_GIA_CONG_MAY và CLI Excel). Chưa phải nghiệm thu toàn mục 5/5A hoặc cho phép vận hành.

## Quy tắc nhập

- Đơn giá dương, tối đa 16 chữ số nguyên và 2 số lẻ; lưu chuỗi decimal chính xác vào PostgreSQL numeric(18,2). Ví dụ `12500.25`, `9999999999999999.99`. Không bỏ dấu chấm/phẩy, không đoán dấu hàng nghìn, không làm tròn.
- Ô số/JSON number chỉ nhận số nguyên dương tối đa 15 chữ số. Số lẻ hoặc lớn hơn phải nhập lại số gốc dạng Text/chuỗi. Không thể khôi phục chữ số Excel đã làm tròn trước đó. Không thay parser canonical đã nghiệm thu.
- Mã công may Excel và tên công may phải được khai báo; không lấy SKU hoặc tên hàng bán làm mặc định. Giữ chữ hoa/thường, số 0 đầu, dấu tiếng Việt và khoảng trắng bên trong. Khóa nhận diện theo `codeKey` NFC/trim/toLowerCase hiện có; cầu nối CLI được kiểm đối chiếu trực tiếp với resolver thật, không dùng vi-lower.
- Đơn vị mới: bỏ trống, PIECE, PRODUCT, CÁI, SẢN PHẨM đều là một sản phẩm hoàn thành và lưu PIECE. SET/BỘ/HOUR/METER không được nhập mới qua các đường này; dữ liệu đơn vị cũ không bị sửa.
- Ngày dạng Text YYYY-MM-DD, Gregorian thật từ năm 0001 đến 9999; không Date.UTC, không timestamp/serial date. Kết thúc không trước bắt đầu. Catalog chỉ dùng ngày nghiệp vụ mặc định khi không cung cấp ngày; ngày trống đã cung cấp không tự đổi thành mặc định.
- Sheet giá trong trình duyệt và CLI kiểm giá trị ô gốc trước khi gỡ cached-result: không nhận formula/shared-formula, lỗi, richtext, Date hoặc object ở mã/tên/giá/ngày/đơn vị. Dòng DEMO vẫn được bỏ qua. Các sheet khác giữ cách đọc hiện có.

## Ghi và nhập lại

Giữ thứ tự khóa H1: shared source → exclusive config → khóa riêng → hàng/ghi. Catalog giữ transaction và APPROVED kế thừa; cùng mã có khoảng APPROVED giao nhau luôn bị từ chối, kể cả cùng tiền. Mã/tên/đơn vị hoặc nguồn liên quan sai không được tự chọn một bản ghi thắng; hàng sai khác mã không chặn toàn bộ danh mục.

Bulk tiếp tục tạo DRAFT. Kiểm trùng mã/khoảng ngày độc lập khóa do người dùng nhập, đồng thời giữ kiểm khóa nhập trùng giữa các dòng khác mã. Một nguồn giá được tải một lần trong transaction và cập nhật trong bộ nhớ sau mỗi insert; không quét toàn bảng cho từng dòng. Bản nháp đang tồn tại gây xung đột; bản batch COMMITTED được phát lại nguyên kết quả đã lưu.

CLI dùng hash nguồn H2 cho dữ liệu mới. Chỉ tạo đối chiếu hash cũ nếu ô gốc là số nguyên an toàn tối đa 15 chữ số hoặc chuỗi toàn chữ số tối đa 15 ký tự, mã/tên không thay ngữ nghĩa theo chuẩn cũ. Chuỗi `100.00` không được tạo hash tương thích từ giá đã chuẩn hóa. Chỉ đúng một bản ghi cùng nguồn, APPROVED, cùng toàn bộ mã/tên/tiền/PIECE/ngày/link/source_row mới được dùng lại. Nguồn khác dù cùng tiền, hoặc trùng APPROVED ở tương lai, đều bị từ chối; điều chỉnh giá dùng màn hình canonical.

Replay chỉ đọc không sửa cả timestamp hay kích hoạt bảng giá. Bảng giá chỉ được tạo/cập nhật khi thực sự thêm giá mới, trong cùng transaction; lỗi ở dòng sau hoàn tác toàn bộ. Phát hiện thực tế trước freeze: CLI kế thừa cập nhật `local_price_lists.updated_at` ngay cả khi dùng lại toàn bộ nguồn. Đã giữ bằng chứng FAIL và sửa lazy ensure theo phê duyệt root; không coi kết quả trước sửa là PASS.

Catalog UI cũ bỏ ô nhập/lưu giá công và cột số đã làm tròn; liên kết tới `/production-attendance?tab=rates`. Giá bán/giá vốn không thuộc sửa đổi này. API catalog còn DTO Number kế thừa: H2 chỉ chứng minh số lưu qua `rate::text`, không tuyên bố DTO này chính xác. Màn hình canonical mới là nguồn hiển thị giá công chính xác.

## Kiểm chứng và giới hạn

Các tệp kiểm thử: `scripts/test-product-rate-inputs-h2.mjs` và `scripts/test-product-rate-inputs-h2-isolated.mjs`. Pure kiểm helper thật, parser trích từ component thật, workbook ExcelJS thật, parity canonical và chạy build-server thật trong thư mục sở hữu rồi biên dịch/thực thi NodeNext. Đây không phải thao tác GUI. Isolated mở API/CLI thật với PostgreSQL riêng không superuser, snapshot toàn bảng public trừ last_seen_at; tái chạy khóa H1 với dữ kiện tên thống nhất và kỳ vọng bulk trùng nháp bị từ chối theo chính sách H2. Fixture chỉ áp schema đến 074 theo cấu hình kiểm thử; không sửa migration 075 hoặc mã ZCRM đang được chat khác phát triển.

Lần kiểm trước freeze có lỗi công cụ: kỳ vọng H1 cũ cho phép hai nháp cùng mã đã không còn đúng với H2; promise fetch chưa được chờ làm cleanup driver gián đoạn. Đã sửa driver settle và giữ bằng chứng. **Một bộ DB/role/temp synthetic từ lần đó vẫn còn: automatic approval review từ chối lệnh cleanup với lý do “blocked by policy”. Không chạy lại hoặc dùng đường khác để xóa.** Trạng thái và tên tài nguyên nằm trong staging `own-retained-resource-readonly-observation.json`; không được tuyên bố mọi tài nguyên H2 đã sạch. Các fixture mới dùng tên riêng, cleanup riêng; không đụng bộ bị từ chối.

Type/build phải ghi đúng kết quả thực tế: thay đổi ZCRM đồng thời ngoài phạm vi H2 có thể làm typecheck server toàn dự án thất bại. Không sửa ngoài 10 tệp để che lỗi, không quy kết lỗi đó là PASS; bằng chứng trước/sau H2 trong cùng bối cảnh ngoại lai và compile vùng H2 được ghi riêng. Hash freeze, own proof và nghiệm thu độc lập sẽ xác định kết quả cuối; tài liệu này không tự nghiệm thu.

H3 quyền duyệt kế thừa, H4 receipt/retry, H5 lịch sử đã duyệt, cấu hình/ánh xạ thật 5A và tích hợp 8/11/13 còn lại. S13 KNOWN_FAIL_PRESERVED_NOT_RERUN; không sửa công thức/worker/oracle. Business DB writes 0, Supabase calls 0, không backfill/tự duyệt/deploy; activation DISABLED, pay_ready=false, mục 6 NOT_OPENED.


### Nghiệm thu giới hạn H2 trên snapshot QA cố định — 29/10/2026

- Root chấp nhận **ACCEPTED_BOUNDED_H2_EXACT_INHERITED_INPUTS_ON_FIXED_QA_SNAPSHOT** tại `.local-staging-runtime/item5h2-baseline/root-v1-acceptance.json`, SHA256 `d5d20af04b33570b80f5b2396cd6049787a4fb5a543deb71477a9fbf93c941a6`. Nghiệm thu snapshot riêng 924 tệp, không ngoại lệ hash; manifest SHA256 `b2fbfd0f6c4366e3cce9244ba86df7e8859cd3b9f85b92f3f20e82f343841ceb`. Mười tệp H2 trong workspace gốc khớp đúng bản đã kiểm. Freeze toàn workspace gốc từng FAIL vì mã ZCRM đồng thời thay đổi; snapshot là bằng chứng mới, không đổi FAIL cũ thành PASS, không nghiệm thu chức năng ZCRM.
- Kiểm thử độc lập PostgreSQL/API/CLI thật **36 nhóm đạt**, parser/packaging **5 nhóm đạt**; reviewer **10 nhóm**, 598 ca đối chiếu và 26 mock handler đạt. Bằng chứng có 18 quan sát khóa, 179 transaction và snapshot 155 bảng public. Giá decimal lưu chính xác, mã Unicode theo codeKey, ngày Gregorian 0001–9999, xung đột khoảng hiệu lực, replay nguồn đúng trạng thái và không sửa timestamp bảng giá được kiểm. Giữ khóa H1 và kiểm lỗi hoàn tác; không suy rộng thành H3–H5 hoặc toàn luồng lương.
- Root thực hiện **10 kiểm tra CUA** trên component thật được mount với API giả lập, desktop 1280/mobile 390: Text giá tối đa giữ đúng preview/apply, ô công thức và số lẻ numeric bị từ chối, tạo/sửa sản phẩm không gọi writer giá công cũ, modal không tràn ngang và nút liên quan đủ 44px. Đây không phải route nghiệp vụ thật, upload/download native hoặc dữ liệu thật. 185 artifact build đã được đối chiếu theo proof của bản build ban đầu; không tuyên bố build đó chứng nhận mọi thay đổi ngoại lai hiện tại.
- Bộ tester mới đã dừng API/CLI và xóa đúng DB/role/temp sở hữu, sau đó kiểm lại nghiêm ngặt 924 hash snapshot và 10 tệp H2 gốc. GUI sở hữu đã dừng, PID/cổng không còn. Các FAIL cũ về fixture, dữ liệu nguồn và drift vẫn giữ nguyên; bộ synthetic cũ bị automatic approval review từ chối cleanup với lý do “blocked by policy” tiếp tục được giữ, không thử xóa lại hay dùng đường khác. Không tuyên bố toàn bộ tài nguyên H2 đã sạch.
- Còn H3 quyền/lifecycle kế thừa, H4 audit/receipt/retry, H5 lịch sử giá, cấu hình/đối soát PIECE và 126 mã cùng dữ kiện/ánh xạ kỹ thuật thật 5A; S13 **KNOWN_FAIL_PRESERVED_NOT_RERUN**; tích hợp người/đơn/ngày/sản lượng 8/11/13. Đơn giá mỗi mã tính cho một sản phẩm hoàn thành, không chia tổ/số người; chưa backfill, đổi đơn vị cũ hoặc tự duyệt dữ liệu thật. Toàn mục 5/5A **INCOMPLETE**, mục 6 **NOT_OPENED**, activation **DISABLED**, `pay_ready=false`; business DB writes 0, Supabase calls 0, không deploy.
- Hậu nghiệm thu chỉ append đúng ba tài liệu H2/log/master; giữ nguyên toàn bộ byte lịch sử làm prefix, nguồn chạy và snapshot được nghiệm thu. Quyết định cùng 42 mục pin bằng chứng được kiểm nguyên trước/sau; không sửa mã nguồn cho tới hợp đồng riêng tiếp theo.
