# Cước GHN local và kiện hàng đã đóng gói

## Nguồn dữ liệu vật lý

Mỗi vận đơn dùng đúng một **kiện hàng đã đóng gói** đã được cân và đo thực tế. Đây là nguồn duy nhất cho `weight`, `length`, `width`, `height` ở cả báo giá và tạo vận đơn. Các dòng sản phẩm chỉ mô tả nội dung (`name`, `quantity`), không được dùng để cộng cân nặng, suy kích thước hoặc tạo nhiều kiện.

- Giao diện nhập khối lượng bằng kg, chấp nhận dấu phẩy hoặc dấu chấm và tối đa ba chữ số thập phân. Giá trị được đổi chính xác một lần sang gram.
- GHN dùng gram. Giá trị hợp lệ là 1–50.000 g (0,001–50 kg).
- Dưới 20.000 g chỉ dùng dịch vụ loại 2. Từ 20.000 g, kể cả đúng 20 kg, chỉ dùng loại 5.
- Báo giá sơ bộ có thể chỉ gửi cân nặng, địa chỉ, COD và bảo hiểm. Nó không gửi `length`, `width`, `height` hoặc `items`.
- Nếu đã nhập một chiều thì phải nhập đủ dài × rộng × cao, mỗi chiều 1–200 cm. Báo giá hoàn chỉnh chứa đúng một item có các số đo bằng với trường gốc.
- Tạo vận đơn luôn cần báo giá hoàn chỉnh, một item `quantity: 1` trùng khớp toàn bộ số đo kiện. Tên item được suy từ nội dung thực gửi (tối đa 200 ký tự); trường `content` giữ mô tả đầy đủ tối đa 2.000 ký tự.

Server lặp lại kiểm tra một-kiện, khớp số đo và biên dịch vụ trước khi tìm dịch vụ/gửi nhà cung cấp. Lượt idempotency lịch sử vẫn được trả lại trước các kiểm tra mới để giữ nguyên khả năng khôi phục `IN_FLIGHT`, `UNKNOWN` và `REMOTE_CREATED`.

Tham chiếu GHN:

- [Calculate fee](https://developer.ghn.vn/en/docs/order/calculate-fee)
- [Create order](https://developer.ghn.vn/en/docs/order/create)

## Tự chọn và làm mới cước

Mặc định dialog đợi 400 ms sau lần sửa hợp lệ rồi so sánh mọi cửa hàng/dịch vụ phù hợp. Báo giá cũ bị xóa ngay khi địa chỉ, kiện, COD hoặc bảo hiểm thay đổi. Chế độ tự động chỉ chọn rẻ nhất khi toàn bộ kết quả hợp lệ; có thể chuyển sang chọn thủ công. Hàng đợi giới hạn ba request đồng thời. Kết quả và cache luôn gắn với snapshot kiện hiện tại.

Sản phẩm có thể chưa đặt tên khi lấy báo giá. Tên/số lượng sản phẩm chỉ chặn bước tạo đơn. Nếu GHN không nhận báo giá chỉ theo cân nặng, giao diện nêu rõ cần kích thước kiện và vẫn hiển thị lỗi nhà cung cấp để người dùng có thể thử lại.

## Fixture và kiểm thử

`scripts/start-ghn-orders-ui-fixture.mjs` chỉ là fixture bộ nhớ, không đọc `.env`, không truy cập database hay gọi GHN. Trong chế độ `quotes-weight-service`, mức giá **tổng hợp** được tính từ `feeData.items[0].weight`: 20 kg là 80.000 đ và 40 kg là 160.000 đ trước phần điều chỉnh theo fixture. Đây chỉ là số để phát hiện lỗi payload 20 → 40 kg vẫn giữ item 1 kg, không phải biểu cước GHN.

Các kiểm thử không gọi GHN thật:

- `node --import tsx scripts/test-ghn-quote-comparison.mjs`
- `node --import tsx scripts/test-ghn-quote-comparison-independent.mjs`
- `node --import tsx scripts/test-ghn-parcel-host-independent.mjs`
- `node --import tsx scripts/test-ghn-quote-refresh-regression.mjs`
- `node --import tsx scripts/test-ghn-auto-selection-ux.mjs`
- `node --import tsx scripts/test-ghn-success-lifecycle.mjs`

Không có cam kết cước trong fixture. Cước thực tế vẫn do GHN quyết định sau khi nhận kiện, cân và đo.

## Nghiệm thu ngày 24/10/2026

Phát hiện gốc: thay đổi cân nặng kiện từ 20.000 lên 40.000 g tạo request mới nhưng các `items` cũ vẫn có cân nặng độc lập. Theo hợp đồng GHN, loại 5 tính cước theo từng kiện trong `items`. Bản sửa thống nhất một kiện giữa báo cước và tạo đơn; không tự xây biểu giá vận chuyển.

- Reviewer độc lập không phát hiện lỗi production trên bộ hash đã đóng băng. Kiểm thử riêng xác minh gram/kg, ngưỡng dịch vụ, payload, phản hồi cũ, báo giá sơ bộ/đầy đủ và replay UNKNOWN lịch sử.
- `tsc --noEmit -p tsconfig.app.json`, `tsc --noEmit -p tsconfig.server.json` và `npm run build:server`: đạt. Build frontend local bằng `vite build --mode crmdev`: đạt, 4.322 module, 16,50 giây; còn cảnh báo Browserslist/chunk lớn.
- ESLint bốn tệp production còn một lỗi nền có sẵn `no-explicit-any` tại dòng 1 của `server/external-read-adapters.ts`; không phải kết quả lint sạch toàn dự án.
- Trình duyệt fixture: địa chỉ tự nhận diện; chưa đặt tên sản phẩm/chưa nhập kích thước vẫn lấy cước sơ bộ. Nhập một chiều xóa cước cũ ngay. Đủ kích thước: 20 kg → 80.000 đ, 40 kg → 160.000 đ theo **giá giả lập**. `19,999` kg được đổi thành 19.999 g và chọn loại 2; 20/40 kg chọn loại 5.
- Tạo đúng một vận đơn bộ nhớ `FIXTUREGHN0001`, shop 123, loại 5, 40.000 g; popup mã đơn và liên kết in A5 hoạt động. Không mở liên kết in GHN thật. Bấm tạo đơn mới xóa mã/thông tin cũ.
- Mobile 390 × 720: dialog có `clientWidth = scrollWidth = 372`, chân thao tác nằm trong viewport (mép dưới 697,4 px). Không còn checkbox xác nhận thừa.
- Ảnh nghiệm thu chỉ chứa dữ liệu giả: `C:/Users/Lenovo/.codex/tmp/ghn-billing-proof/final-40kg-synthetic.png`.
- Runtime local: kiểm tra chỉ đọc xác nhận không có migration thiếu/checksum lệch, seed đã được ghi và không có lượt GHN đang gửi. Khởi động lại API nguồn tại 8787, tắt đồng bộ tự động trong tiến trình khởi động này. Health/CORS đạt cho UI 8083. UI phục vụ entry `index-DGG4org4.js`, chunk mới `OrderManagement-B1UnesKr.js`, HTTP 200.

Không tạo vận đơn GHN thật, không kiểm chứng mức cước tài khoản GHN thật, không thêm migration, commit, push hay deploy lên bản chính trong lần sửa này. Báo giá loại 5 chỉ theo cân nặng có thể bị GHN từ chối; cần nhập kích thước thật để có báo giá đầy đủ và tạo đơn. Luồng hiện tại hỗ trợ một kiện/vận đơn, chưa phải đóng gói nhiều kiện.

### Kiểm tra lại sau khi khôi phục coverage

Đã khôi phục các kiểm thử giới hạn ba request qua nhiều thế hệ, cache/retry chỉ lỗi, phản hồi cũ, tổng cước sai kiểu, ID dịch vụ trùng và fingerprint địa chỉ/COD/bảo hiểm. Khi chạy lại, ca test giới hạn nội dung mới có lỗi tính dữ liệu mẫu: 1.984 thay vì 2.000 ký tự. Chỉ sửa dữ liệu mẫu cuối từ 126 thành 142 ký tự và nhãn tổng nhóm từ 7 thành 6; không đổi production.

Rerun cuối: comparison độc lập 10 nhóm, refresh 6 nhóm, billing độc lập 13 nhóm đều đạt. Các suite comparison, auto UX, lifecycle, parcel/host, auth và địa chỉ đạt; orders integration 14 nhóm đạt với PostgreSQL dùng một lần, đã dọn container. TypeScript app/server đạt. Bốn tệp production và fixture giữ nguyên hash đã review. Sau phiên trước tiến trình local đã dừng; đã mở lại đúng API 8787 và UI 8083, kiểm tra HTTP 200 cho cả hai và entry/chunk mới. Chưa kiểm tra cước tài khoản GHN thật.
