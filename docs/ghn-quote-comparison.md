# Cước GHN local và kiện hàng đã đóng gói

## Nguồn dữ liệu vật lý

Mỗi vận đơn dùng đúng một **kiện hàng đã đóng gói** đã được cân và đo thực tế. Đây là nguồn duy nhất cho `weight`, `length`, `width`, `height` ở cả báo giá và tạo vận đơn. Các dòng sản phẩm chỉ mô tả nội dung (`name`, `quantity`), không được dùng để cộng cân nặng, suy kích thước hoặc tạo nhiều kiện.

- Giao diện hiện tại nhập trực tiếp **gram nguyên** như GHN: 20 kg nhập `20000`. Không đoán dấu phân cách, không có ô kg thứ hai. Hàm kg cũ chỉ còn để tương thích caller/kiểm thử lịch sử.
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

Mặc định dialog đợi 400 ms sau lần sửa hợp lệ rồi so sánh mọi cửa hàng/dịch vụ phù hợp. Báo giá cũ bị xóa ngay khi địa chỉ đã áp dụng, kiện, COD, tiền thu khi giao thất bại hoặc bảo hiểm thay đổi. Chế độ tự động chỉ chọn rẻ nhất khi toàn bộ kết quả hợp lệ; có thể chuyển sang chọn thủ công. Hàng đợi giới hạn ba request đồng thời. Kết quả và cache luôn gắn với snapshot kiện hiện tại.

Báo giá có giờ nhận và thời hạn **60 giây do CRM đặt để làm mới**, không phải cam kết giữ giá của GHN. Cache hết hạn đi qua cùng hàng đợi tối đa ba request; timer giao diện xóa giá/chi tiết cũ và lấy lại. Bước bấm Tạo đơn kiểm tra lại đồng hồ, kể cả khi tab nền làm timer tạm ngừng. Tự chọn rẻ nhất đòi hỏi mọi dòng trong bảng so sánh còn hạn. Nếu so sánh quá lâu khiến một số giá hết hạn ngay trong quá trình tải, các dòng đó trở thành lỗi kết quả chưa đầy đủ; không tự lặp vô hạn, người dùng chọn Tính lại cước hoặc chọn thủ công. Tải lại cửa hàng / địa chỉ xóa cả cache dịch vụ và giá theo luồng hiện có.

Sản phẩm có thể chưa đặt tên khi lấy báo giá. Tên/số lượng sản phẩm chỉ chặn bước tạo đơn. Nếu GHN không nhận báo giá chỉ theo cân nặng, giao diện nêu rõ cần kích thước kiện và vẫn hiển thị lỗi nhà cung cấp để người dùng có thể thử lại.

## Đồng bộ tiền, địa chỉ gửi và phụ phí (26/10/2026)

- COD (`cod_value` khi báo cước, `cod_amount` khi tạo): số nguyên 0–50.000.000 đ, chưa gồm tiền cước. Giá trị khai báo bảo hiểm (`insurance_value`): số nguyên 0–5.000.000 đ; đây không phải phí bảo hiểm hoặc COD. Tiền thu khi giao thất bại (`cod_failed_amount`): số nguyên 0–50.000.000 đ, chỉ gửi giá trị đã chọn hoặc 0 khi tắt. UI/snapshot, adapter báo giá và schema tạo đơn dùng cùng giới hạn; không ép COD ≤ giá trị khai báo bảo hiểm.
- Tổng giá trị đơn CRM được giữ nguyên khi điền sẵn giá trị khai báo, dùng nullish fallback chứ không thay 0. Giá trị trên 5 triệu **không tự cắt xuống 5 triệu**: giữ lại, báo lỗi và chặn cước/tạo cho đến khi người vận hành chủ động kiểm tra/điều chỉnh. Không thay đổi tổng tiền nguồn CRM.
- Khi tạo trực tiếp, giá trị khai báo bảo hiểm mặc định **Theo COD**: mỗi lần sửa COD sao chép nguyên nội dung sang giá trị khai báo trong cùng sự kiện. Sửa riêng bảo hiểm tắt đồng bộ; nút **Dùng COD** sao chép COD hiện tại và bật lại. Đơn CRM có tổng giá trị khác tiền còn thu giữ hai số độc lập khi mở; chỉ các giá trị điền sẵn bằng nhau và hợp lệ mới bật đồng bộ. Không tự hạ số sao chép vượt 5 triệu, không ép COD bằng hoặc nhỏ hơn bảo hiểm. Nội dung trống/sai/đang IME vẫn chặn cước và tạo đơn. Đơn mới đặt lại chế độ; tải lại danh mục/thử lại đơn bị từ chối giữ lựa chọn hiện tại.
- API báo cước chỉ nhận số tiền JSON dạng number nguyên; `null`, boolean, chuỗi, số lẻ, âm, quá giới hạn bị chặn trước request fee. Giá trị nguồn sai kiểu/ngoài giới hạn không tạo báo giá giả.
- Quận gửi và phường/xã gửi lấy từ shop GHN đã xác minh phía server, không tin origin do trình duyệt gửi tùy ý. Gửi `from_ward_code` khi metadata shop có mã hợp lệ; thiếu mã thì để GHN áp dụng địa chỉ ShopId mặc định theo tài liệu. Tạo đơn dùng cùng origin đáng tin cậy.
- Tổng cước hiển thị/so sánh luôn là `data.total` GHN trả về. Không cộng các cấu phần để thay tổng, không tự thêm 10%, không suy biểu phí vùng sâu/vùng xa. Cước cuối vẫn có thể đổi sau GHN cân đo.
- Giữ các trường được tài liệu hóa nếu là số nguyên an toàn: `service_fee`, `insurance_fee`, `cod_fee`, `pick_station_fee`, `coupon_value`, `r2s_fee`, `return_again`, `document_return`, `double_check`, `pick_remote_areas_fee`, `deliver_remote_areas_fee`, `cod_failed_fee`, `change_to_address_fee`, `change_return_address_fee`, `return`. `coupon_value` chấp nhận số nguyên có dấu và hiển thị khoản giảm bằng giá trị tuyệt đối một lần; không tính lại tổng. Các khoản phí khác không âm. Known field sai kiểu/âm bất hợp lệ làm báo giá lỗi; thiếu trường vẫn là chưa được GHN tách phí, không tự mặc định 0. Phụ phí lấy vùng xa và giao vùng xa hiển thị riêng ở chi tiết cước.
- Người nhận trả dự kiến khi giao thành công = COD + tổng cước GHN khi người nhận trả cước; nếu người gửi trả thì chỉ COD. Không cộng tiền gốc bảo hiểm hay tiền thu khi giao thất bại. Khi cước người nhận trả đang tải/hết hạn thì tổng này chờ báo giá, không dùng giá cũ/0. Số không hợp lệ/overflow không hiển thị `NaN` hoặc tổng giả.
- Đối soát UNKNOWN kiểm tra cả `cod_failed_amount`: phải khớp số đã gửi; thiếu chỉ tương thích với giá trị đã gửi 0, không được nhận thành công một lượt thu khi thất bại dương mà thiếu bằng chứng. UNKNOWN không tự gửi create lại.

Hợp đồng tham chiếu công khai kiểm tra ngày 26/10/2026: [Calculate fee](https://developer.ghn.vn/en/docs/order/calculate-fee), [Create](https://developer.ghn.vn/en/docs/order/create), [Detail by client code](https://developer.ghn.vn/en/docs/order/info-by-client-code) và [Detail](https://developer.ghn.vn/en/docs/order/info). Phiên sửa này không xác minh biểu giá hoặc phụ phí của tài khoản GHN thật.

### Khối lượng quy đổi và giao diện gọn (26/10/2026)

Ngay dưới ba kích thước, form hiển thị cân thực tế và **khối lượng quy đổi tham khảo**. Theo [Quy định cân đo và niêm phong hàng hóa của GHN Express](https://ghn.vn/blogs/tin-tuc-ghn/quy-dinh-can-do-niem-phong-hang-hoa-cua-ghn-express) (đăng 21/04/2022, cập nhật 23/07/2023; đối chiếu 26/10/2026), công thức là `Dài × Rộng × Cao (cm) / 5.000 = kg`, tương đương chia 5 để ra gram. Chỉ tính khi đủ ba chiều nguyên 1–200 cm; xóa hoặc nhập sai một chiều thì xóa kết quả ngay. Giữ đến 0,1 gram (0,0001 kg), không làm tròn theo bậc cước, không cắt kết quả ở giới hạn cân thực 50 kg. Ví dụ 200 × 200 × 200 cm cho 1.600 kg quy đổi tham khảo.

Giá trị này chỉ để nhân viên hiểu thể tích kiện, **không thay thế `weight` đo thực tế** trong báo giá, item hoặc tạo đơn, không đổi điều kiện dịch vụ theo cân thực và không dùng để tự tính tiền. GHN tiếp tục nhận số đo gốc và trả tổng cước.

Mục **Chi tiết cước** đóng mặc định, giữ đủ 15 khoản phí, thời điểm báo giá và phân biệt phí 0 với chưa được GHN tách phí khi mở. Tổng cước, COD và tiền người nhận trả vẫn dễ xem. Bỏ các ghi chú kỹ thuật/thông tin điểm lấy lặp; đơn tạo trực tiếp không còn hộp mã CRM trống. Mã tham chiếu đơn CRM vẫn có khi tạo từ đơn liên kết. Không đổi trạng thái chờ, lỗi, hết hạn, retry hay khôi phục lượt tạo chưa xác định.

## Fixture và kiểm thử

`scripts/start-ghn-orders-ui-fixture.mjs` chỉ là fixture bộ nhớ, không đọc `.env`, không truy cập database hay gọi GHN. Trong chế độ `quotes-weight-service`, mức giá **tổng hợp** được tính từ `feeData.items[0].weight`: 20 kg là 80.000 đ và 40 kg là 160.000 đ trước phần điều chỉnh theo fixture. Đây chỉ là số để phát hiện lỗi payload 20 → 40 kg vẫn giữ item 1 kg, không phải biểu cước GHN.

Các kiểm thử không gọi GHN thật:

- `node --import tsx scripts/test-ghn-quote-comparison.mjs`
- `node --import tsx scripts/test-ghn-quote-comparison-independent.mjs`
- `node --import tsx scripts/test-ghn-parcel-host-independent.mjs`
- `node --import tsx scripts/test-ghn-quote-refresh-regression.mjs`
- `node --import tsx scripts/test-ghn-auto-selection-ux.mjs`
- `node --import tsx scripts/test-ghn-success-lifecycle.mjs`
- `node --import tsx scripts/test-ghn-fee-financial-sync.mjs`
- `node --import tsx scripts/test-ghn-dimensional-ui.mjs`
- `node --import tsx scripts/test-ghn-orders-independent.mjs` (PostgreSQL Docker dùng một lần + transport GHN giả lập)

Fixture có thêm `quotes-breakdown-remote`, `quotes-breakdown-missing`, `quotes-breakdown-malformed`; đây chỉ là dữ liệu thử để kiểm tra hiển thị/phí thiếu/lỗi kiểu. Không phải quy tắc tính phí GHN. `quotes-weight-service` kết hợp được với breakdown; tạo fixture nhận cùng tổng tổng hợp với báo giá.

Không có cam kết cước trong fixture. Cước thực tế vẫn do GHN quyết định sau khi nhận kiện, cân và đo.

## Nhiều kiện trong một vận đơn (26/10/2026)

Phần này thay thế giới hạn một kiện được mô tả trong các biên bản cũ bên dưới. Form có hai khối **Thông tin sản phẩm** và **Thông tin đơn hàng**. Sản phẩm là nội dung của cả đơn; mỗi dòng kiện là một gói đã cân, đo độc lập. Có thể thêm, sao chép hoặc xóa kiện, tối thiểu một và tối đa 100 kiện. Mỗi kiện có gram, dài/rộng/cao và khối lượng quy đổi tham khảo. Tổng cân thực không vượt 50.000 g theo giới hạn `weight` công khai của GHN; không tự chia thành nhiều vận đơn.

Danh sách sản phẩm không nhân cân nặng hoặc số kiện. COD, khai giá bảo hiểm, bên trả cước và tiền thu khi giao thất bại khai một lần cho toàn bộ vận đơn. Đồng bộ khai giá theo COD và sửa riêng được giữ nguyên. Tên hàng thực tế nằm trong nội dung đơn và tên kiện đầu tiên; các kiện tiếp theo có nhãn số thứ tự, không lặp lại toàn bộ số lượng sản phẩm.

- Một kiện giữ hành vi cũ: báo giá sơ bộ khi chỉ có cân nặng; đủ ba chiều mới tạo đơn. Nhiều kiện yêu cầu đủ cân nặng và ba chiều của **mọi kiện** trước khi báo giá.
- Theo [Create Order](https://developer.ghn.vn/en/docs/order/create) và [Calculate Fee](https://developer.ghn.vn/en/docs/order/calculate-fee), dịch vụ loại 5 dùng cho nhiều kiện, kể cả tổng dưới 20 kg. Nhân viên không phải chọn phân loại nặng/nhẹ.
- Báo cước và tạo đơn gửi cùng tổng cân thực và cùng danh sách thông số từng kiện, mỗi item `quantity: 1`. Cước hiển thị là tổng do GHN trả về; không tự cộng bảng giá hoặc nhân COD theo kiện. Fingerprint chứa toàn bộ phân bố cân nặng/kích thước, nên thêm/xóa/sửa một kiện làm mất hiệu lực giá cũ ngay.
- Không có công thức gộp dài/rộng/cao nhiều kiện được tài liệu công khai xác nhận. Payload nhiều kiện **bỏ ba kích thước root**, chỉ gửi kích thước từng item; không lấy số đo kiện đầu hoặc cộng chiều cao làm hình hộp giả. Đây là điểm **chưa kiểm chứng với API GHN thật**: bảng create đánh dấu kích thước root bắt buộc, trong khi chú thích loại 5 mô tả tính theo từng item. Nếu GHN từ chối, phải hiện lỗi và giữ thao tác thất bại; không fallback số đo giả, không tự tạo nhiều vận đơn. Cần kiểm chứng khả năng này trên tài khoản/môi trường GHN được phép trước khi coi là hỗ trợ đã nghiệm thu với nhà cung cấp.
- UNKNOWN của đơn nhiều kiện chỉ nhận thành công khi đối soát được toàn bộ danh sách: số kiện, tên, số lượng, gram và ba kích thước phải khớp; thứ tự trả về có thể khác. Thiếu hoặc phân bố khác dù tổng cân bằng nhau vẫn giữ UNKNOWN, không gọi create lại. Replay lịch sử một kiện giữ cách tra cứu trước kiểm tra canonical mới.

Không đổi schema: JSON `request_data` đã lưu toàn bộ manifest và hash của lượt tạo. Kiểm thử bổ sung `node --import tsx scripts/test-ghn-multi-parcel.mjs`; bộ `test-ghn-parcel-billing-independent.mjs` có thêm báo cước/tạo nhiều kiện, từ chối payload sai và phục hồi UNKNOWN dùng transport giả lập. Fixture tổng hợp lấy tổng cân của tất cả kiện; số cước trong fixture không phải biểu giá GHN.

## Bố cục theo mẫu GHN và khối lượng sản phẩm

Mặc định, **Thông tin sản phẩm** có tên, KL gram của **một sản phẩm**, số lượng và mã sản phẩm tùy chọn. Ví dụ `2.000 g × số lượng 2` tạo tổng **4.000 g trong một kiện**, không biến thành hai kiện. Khối **Thông tin đơn hàng** đặt tổng gram, dài/rộng/cao và KL quy đổi gram trên cùng hàng khi đủ chiều rộng; bên dưới là COD/thu khi thất bại, tổng giá trị hàng hóa/mã đơn riêng. “Tổng giá trị hàng hóa” chính là giá trị khai báo `insurance_value` hiện có, tối đa 5 triệu, không phải một tổng tiền mới và không thay đổi đơn nguồn CRM.

Khối lượng đơn tự cộng từ sản phẩm trong render; không dùng effect có thể báo cước với giá trị cũ. Sửa KL đơn chuyển sang cân thực tế sau đóng gói và giữ số đã nhập khi sửa sản phẩm. **Dùng tổng KL sản phẩm** bật lại tự cộng. Khi đã cân tay, KL mỗi sản phẩm có thể để trống; giá trị không trống nhưng sai kiểu/giới hạn vẫn chặn báo giá và tạo. Trường gram, tiền giữ định dạng nhóm nghìn, caret và IME. Nhập/cộng vượt 50 kg không tự cắt về giới hạn.

Chỉ khi chọn **Đơn có nhiều kiện? Thêm kiện**, form mới mở bảng cân đo từng kiện. Khi thêm kiện thứ hai, số cân đang hiển thị của kiện đầu được giữ lại, tắt cộng sản phẩm. Thu gọn bảng không xóa dữ liệu; trở lại một kiện tiếp tục dùng số đã cân tay. Root nhiều kiện chỉ hiện tổng gram và “Theo từng kiện” cho kích thước; không tạo hộp gộp giả. Quy tắc nhiều kiện, giới hạn, đối soát UNKNOWN và điểm chưa kiểm chứng GHN thật ở mục trên vẫn áp dụng.

Khi tạo, `productLines` là metadata cấp CRM tùy chọn gồm tên, số lượng, gram **mỗi đơn vị** và mã; được lưu trong `request_data` cùng hash. Server kiểm tra giới hạn và nội dung phải khớp trước gửi. Metadata này không được gửi như các kiện GHN; số lượng sản phẩm không nhân physical item. Mã sản phẩm được đưa vào nội dung dạng `[mã]`, output cũ không có mã giữ nguyên. Không đọc trường `weight` CRM chưa rõ đơn vị để đoán gram; chỉ điền sẵn các trường gram theo đơn vị rõ ràng, SKU hoặc mã sản phẩm, giữ giá trị nguồn sai để sửa.

Mã đơn riêng của khách dùng `orderNumber` để tra cứu tại CRM. Với đơn liên kết, luôn giữ mã CRM nguồn và hiển thị chỉ đọc. Mã chống trùng gửi GHN (`client_order_code`) vẫn do server sinh, không lấy từ ô này. Schema metadata mới không thêm default/transform, nên payload lịch sử không có metadata giữ hash/replay cũ. Không cần migration.

Kiểm tra bổ sung: `node --import tsx scripts/test-ghn-product-weight-form.mjs` (cộng đơn vị, thao tác thật, override/reset, payload, mã); `test-ghn-parcel-billing-independent.mjs` kiểm tra persistence và phân tách metadata bằng service/adapter thật với transport giả lập. Chưa dùng cước hoặc vận đơn GHN thật để nghiệm thu.

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
