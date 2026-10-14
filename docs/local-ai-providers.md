# AI local: F5 Quota và Beeknoee

Trang Cài đặt AI giữ nguyên luồng báo giá xem trước/xác nhận. Mục Kết nối AI cho
admin chọn quy tắc local (mặc định), F5 Quota hoặc Beeknoee. Manager chỉ đọc trạng
thái kết nối. Lưu khóa trống giữ khóa cũ; gỡ khóa không tự lấy lại khóa môi trường.
Hai khóa độc lập, không chuyển/fallback âm thầm giữa nhà cung cấp.

## Giao thức và nguồn tham khảo

- F5: tài liệu công khai https://f5quota.store/docs (mã tài liệu
  `DocsView-TD7J5Vu2.js` được coordinator đọc). API cố định
  `https://f5quota.store/v1/responses`, Bearer, model/input. Model ví dụ tài liệu
  `gpt-5.6-sol`; tài khoản cụ thể có thể cần mã khác.
- Responses schema đối chiếu tại
  https://developers.openai.com/api/reference/resources/responses/methods/create.
  Input text/image data URL, `store:false`, không tools; đọc `output_text` hoặc
  `output[].content[]` loại `output_text`. Không coi trạng thái incomplete là đạt.
- Beeknoee giữ API dự án hiện có
  `https://platform.beeknoee.com/api/v1/chat/completions`; đọc choices/message.
- Tải danh sách dùng GET `/models` tại base cố định. Không lọc bỏ model thiếu
  context_window hay chưa rõ khả năng đọc ảnh. Giữ nguyên ID, loại dòng trùng và
  sắp xếp; không cắt ngầm ở 1000 mô hình. Phản hồi vẫn chịu giới hạn 256 KB.
  Nếu API báo còn trang qua `has_more`, `next_page` hoặc `next_cursor`, trả lỗi
  rõ ràng thay vì hiển thị một trang như toàn bộ danh sách.

Không cho chỉnh host/base URL hoặc tải URL ảnh ngoài. Mã model giữ nguyên cả
prefix như `google/`; đổi nhà cung cấp dùng model chính cho tới khi lưu cấu hình
model riêng với marker provider tương ứng. Prompt/quy tắc không mất khi đổi.

## Chọn mô hình trên giao diện local

Mô hình chính và ba mô hình từng bước trong tab Mô hình dùng bảng chọn có tìm
kiếm, cuộn và thao tác bàn phím. Mô hình hiện tại không có trong kết quả vẫn
hiển thị riêng với nhãn “Hiện tại / chưa xác minh”; không thêm danh sách mẫu
để giả kết quả nhà cung cấp. Trạng thái rỗng/lỗi có nút tải lại; nhập mã thủ công
chỉ nằm trong mục Nâng cao khi danh sách rỗng hoặc tải thất bại.

Admin có thể dán khóa mới rồi tải danh sách trước khi lưu. Frontend gửi
`POST /api/ai/providers/:provider/models` với `{api_key}`; máy chủ chỉ dùng khóa
tạm thời để GET danh sách tại host cố định, không lưu, bật nhà cung cấp, ghi
nhật ký khóa hoặc trả lại khóa. Khóa đã lưu dùng GET cùng route. Cả hai cách
chỉ dành cho admin và có chung giới hạn, kiểm tra khóa, che khóa trong phản hồi.
Việc tải danh sách không gửi yêu cầu tạo nội dung; nút kiểm tra bằng dữ liệu mẫu
là thao tác riêng có thể tính phí và bị khóa khi khóa mới chưa lưu.

Đổi provider hoặc sửa khóa xóa danh sách cũ ngay; kết quả yêu cầu cũ, trả sai
thứ tự hoặc sau khi rời trang bị bỏ qua. Duyệt provider chưa lưu không đổi
provider đang dùng hay mô hình từng bước của provider đang dùng. Xóa khóa
provider không hoạt động không reset mô hình riêng của provider hoạt động.
Tải lại trạng thái xóa khóa đang nhập để không gắn khóa nháp cho provider khác.
Lưu/khôi phục cài đặt và thao tác kết nối dùng chung khóa thao tác trên giao diện;
không chạy chồng nhau, kết quả cũ không ghi đè mô hình của provider mới.

Ngày 2026-10-13 coordinator đọc danh sách F5 bằng khóa đã lưu, không đọc/in khóa:
API trả 100 mô hình, trong đó `claude-opus-4-8[1m]` có dấu ngoặc vuông hợp lệ.
Validator dùng chung cho tải/lưu/gửi model giữ nguyên hậu tố này, không bỏ dòng
khỏi danh sách. Danh sách Beeknoee thực tế chưa xác minh. Việc liệt kê không
chứng minh từng mô hình có thể tạo nội dung, có hạn mức hay hỗ trợ ảnh; chưa gọi
API tạo nội dung thật. Không coi model ví dụ tài liệu là danh sách đầy đủ.

## Khóa và giới hạn

Khóa chỉ lưu backend trong schema `ai_private`, không trả về frontend (chỉ boolean
configured), không nằm ai_config/snapshot; adapter reserved aliases bị từ chối kể
cả admin. Khóa trong SQL là plaintext, không tuyên bố đã mã hóa: tài khoản DB,
backup và máy chủ phải bảo vệ thông tin này. Biến server `F5QUOTA_API_KEY` hoặc
`BEEKNOEE_API_KEY` chỉ là fallback nếu chưa có dòng cấu hình; không đọc `.env` để
thiết lập trong nhiệm vụ này. Lưu/gỡ/chọn local có transaction và audit không khóa.

Mỗi tài khoản tối đa 20 yêu cầu/phút, 3 yêu cầu đồng thời trên một tiến trình,
timeout 30 giây, đầu vào text 100 KB, output 4096 tokens/256 KB; không retry.
Ảnh JPEG/PNG/WebP tối đa 6 MB, một ảnh/lượt, kiểm magic bytes. Không đảm bảo mọi
model có vision. Upstream sai khóa không trả CRM401/đăng xuất; thông báo tiếng Việt
không echo lỗi upstream, prompt hoặc khóa. Đầu ra nếu echo khóa đã cấu hình sẽ bị ẩn.

## Chức năng đã nối

- Báo giá: text/OCR ảnh/debug; chỉ ID sản phẩm trong danh mục ứng viên SQL/bảng giá
  đã chọn, giá SQL canonical, tối đa 100 dòng. Danh mục lớn chọn tối đa 200 ứng
  viên theo từ khóa; UI cảnh báo shortlist và vẫn cần người dùng xác nhận.
- Phân tích đơn: văn bản/ảnh trả items chuẩn hiện có, kiểm số lượng/giá hữu hạn.
- Gợi ý khách hàng và dự đoán: dữ liệu SQL theo quyền, DTO tối thiểu không email,
  điện thoại, địa chỉ. Không tự gọi trả phí khi mở từng dòng danh sách; bấm nút.
- Kho kiến thức: tối đa 5 trích đoạn nguồn SQL đã xếp hạng, mỗi đoạn 2500 ký tự;
  không gửi toàn CRM, không tools. Nguồn trả về do SQL cung cấp, không tin nguồn AI.
- Kiểm tra kết nối chỉ gửi văn bản mẫu, có thể tính phí; dữ liệu thật không được
  gửi trong kiểm tra nút này. Bộ test dùng mock, không gọi API có phí.

## Giới hạn còn lại

Web scraper giữ trích HTML deterministic, không nối AI mới. Parse thông tin công
ty text/image giữ baseline hiện có, không giả nhận đã có OCR mới. PDF/Excel/binary
document chưa có pipeline chuyển đổi an toàn ở backend; thông báo dùng text/ảnh.
TTL/delay cấu hình hiện không áp dụng cache hosted-call server; giới hạn AI phía
server là cố định như trên. Danh sách F5 đã đọc như ghi ở trên; chưa xác minh
hạn mức, khả năng tạo nội dung/đọc ảnh thật của F5 hoặc Beeknoee. Chỉ người vận
hành mới chạy kiểm tra tạo nội dung sau khi nhập khóa và đồng ý chi phí.
Chưa deploy VPS hoặc thay backend public Supabase. Không gọi API thật có phí,
không xác minh hạn mức hoặc khả năng tạo nội dung thật; kiểm thử tạo nội dung là mock.

## Kết quả triển khai local đã xác minh trước cập nhật bộ chọn mô hình

Reviewer chấp nhận v3; bộ kiểm thử độc lập đạt 25 nhóm core và 27 nhóm có giao diện
desktop/mobile, bao gồm model chính xác sau reload, quyền admin/manager, khóa
write-only, provider pin, nested JSON redaction, bounded payload/output và lỗi
provider. Regression auth 16 nhóm/integration 16 nhóm đạt. TypeScript frontend/
backend, scoped lint modules mới/panel, build:server và build:vps đạt; build còn
cảnh báo Browserslist cũ và bundle lớn, không coi lint toàn CRM đã sạch.

Coordinator đã bootstrap migration `051_local_ai_provider.sql` trên SQL local
và khởi động lại API dự án. Tại thời điểm nghiệm thu v3 chọn `local`, có 0 dòng
khóa provider, scheduler đồng bộ tự động tắt; chưa tự bật AI ngoài. Số dòng và fingerprint đầy đủ 9 bảng
nghiệp vụ không đổi: profiles 15, roles 16, permissions 37, workers 43, products
2265, customers 1121, quotes 1205, orders 932, knowledge 4. Health và UI trả 200;
me/providers/integrations chưa xác thực đều trả 401. Không đọc/sửa `.env` thật,
không ghi dữ liệu public, không tạo fixture trong SQL đang sử dụng.

## Kiểm thử bộ chọn mô hình V2 — 2026-10-12

Reviewer chấp nhận V2 sau khi đóng lỗi giữ khóa nháp khi tải lại trạng thái và
lỗi thao tác lưu/khôi phục chồng với đổi kết nối. Tester độc lập xác nhận 42/42
nhóm (28 core + 14 giao diện desktop/mobile 390 px) đạt, gồm tìm kiếm/cuộn/bàn phím,
ID chính xác, danh sách trên 1000 mô hình, loại trùng, lỗi phân trang/rỗng,
khóa tạm không ghi DB, không lẫn provider, phản hồi cũ và hai ca hồi quy trên.
Kiểm thử đăng nhập 16 nhóm, integration 16 nhóm và VPS API/fail-closed/query
compatibility đạt. QA dùng API mock; database và role kiểm thử đã được dọn sạch
và kiểm tra không còn trong `pg_database`/`pg_roles`.

TypeScript frontend/backend, scoped lint provider/panel/picker, build:server và
build:vps đạt. Build vẫn có cảnh báo Browserslist cũ và bundle lớn; không khẳng
định lint toàn CRM sạch. Cập nhật này không có migration, không ghi SQL đang sử
dụng và không gọi model thật. Sau các gate coordinator đã khởi động lại API
local cổng 8787, đồng bộ tự động tắt; health/UI trả 200, GET models chưa xác thực
trả 401. Fingerprint đầy đủ 9 bảng nghiệp vụ trước/sau khởi động không đổi;
không suy diễn số dòng khóa hoặc provider hiện tại từ baseline v3.
Chưa triển khai VPS hay thay đổi bản public.

## Sửa mã mô hình có hậu tố ngoặc vuông — 2026-10-13

Reviewer độc lập chấp nhận thay đổi chỉ thêm `[` và `]` vào validator dùng
chung. Mã `claude-opus-4-8[1m]`, mã có prefix và giới hạn 200 ký tự được giữ
nguyên; mã quá dài, khoảng trắng, ký tự điều khiển, dấu nháy, dấu gạch ngược và
ký tự ngoài whitelist vẫn bị từ chối. Model nằm trong JSON, không đổi host/path.

Tester xác nhận 46/46 nhóm (30 core + 8 desktop + 8 mobile) đạt: tải đầy đủ ID,
lưu SQL chính xác, request Responses mock giữ nguyên ID, tìm/chọn/lưu trên giao
diện và các ca đầu vào lỗi bị chặn trước khi gọi provider. QA database/role đã
dọn sạch và xác nhận không còn. TypeScript backend, scoped lint và build:server
đạt. Không đổi frontend, không migration, không ghi SQL đang sử dụng, không
gọi API tạo nội dung thật. Khởi động lại local do coordinator thực hiện riêng.

Coordinator đã đọc lại danh sách F5 sau sửa: 100 mã, có mã ngoặc vuông, không
trùng ID. API local đã khởi động lại ở cổng 8787 với đồng bộ tự động tắt;
health/UI 200, tải models chưa xác thực 401. Fingerprint đầy đủ 9 bảng nghiệp
vụ không đổi; không migration hay thay đổi bản public.

## Quy tắc phân loại JSON local

Ba mục Phân loại sản phẩm, Từ khóa loại sản phẩm và Từ khóa chất liệu được đọc
nguyên văn từ cấu hình đã lưu; không cắt chuỗi JSON ở 20.000 ký tự. Mỗi mục
giới hạn 64 KB (65.536 byte UTF-8), kiểm tra cả văn bản gốc và JSON sau tuần tự
hóa. JSON sai cú pháp trả lỗi 400 nêu tên mục; quá giới hạn trả 413 riêng, không
echo nội dung. Quy tắc hợp lệ không bị bỏ đi khi dài hơn 15.000 ký tự.

Để trống hoặc chỉ có khoảng trắng trong giới hạn cho phép bỏ mục tùy chọn; trong
kiểm tra nháp, giá trị trống chủ động bỏ mục đó, không tự lấy lại quy tắc đã lưu.
Frontend local kiểm tra cùng giới hạn và gửi nguyên chuỗi JSON để máy chủ kiểm
tra lại. Giới hạn tổng text/prompt 100 KB và tối đa 200 ứng viên SQL vẫn giữ
nguyên; ba mục hợp lệ riêng lẻ vẫn có thể bị từ chối nếu tổng yêu cầu quá lớn.
Không sửa dữ liệu cấu hình đã lưu hoặc thay đổi hành vi frontend public.

Reviewer độc lập chấp nhận bản sửa; tester xác nhận 54/54 nhóm (36 core + 9
desktop + 9 mobile) đạt. Kiểm thử gồm ba trường đã lưu/bản nháp dạng chuỗi và
object dài 34.022 byte, marker cuối nội dung không mất, lưu/tải lại/kiểm tra và
báo giá thường; đúng 65.536 byte nhận, 65.537 byte bị chặn, lỗi cú pháp 400 và
kích thước 413 nêu đúng trường, quy tắc trống/falsy, giới hạn tổng 100 KB.
Các ca lỗi không gửi request provider; QA database/role đã dọn sạch và xác nhận
độc lập. TypeScript frontend/backend, scoped lint workflow/helper, build:server
và build:vps đạt; cảnh báo baseline Browserslist/bundle lớn còn tồn tại.
Toàn bộ kiểm thử tạo nội dung dùng mock, không ghi SQL đang sử dụng.

Coordinator đã đọc cấu hình SQL hiện có và kiểm tra báo giá thường/bản nháp
bằng AI adapter giả lập: nội dung phân loại được giữ nguyên trong cả hai luồng,
tổng đầu vào 87.055 byte nhỏ hơn giới hạn 100 KB, không gọi ra ngoài hoặc ghi
SQL. Sau khởi động lại API local cổng 8787, đồng bộ tự động tắt; health/UI trả
200, providers chưa xác thực trả 401. Fingerprint đầy đủ 9 bảng nghiệp vụ không
đổi. Cấu hình snapshot cũ được bảo toàn, không migration hoặc ghi dữ liệu public.
