# Kế hoạch đơn Sale → cắt vải → may → chấm công → tiền lương

Ngày lập: 06/10/2026. Phạm vi: bản local, tái sử dụng hệ thống CRM hiện có.
Tài liệu này là kế hoạch triển khai; các chức năng đề xuất chưa được coi là đã hoàn thành.

## 1. Mục tiêu và phạm vi

- Sale gửi đơn cần sản xuất; quản lý tiếp nhận, lập kế hoạch và phát hành lệnh.
- Quản lý hoặc nhân viên phụ trách cắt lập dự toán mét vải; quản lý duyệt và phát hành lệnh cắt.
- Nhân viên nhận việc phù hợp, bàn giao bán thành phẩm cắt và báo sản lượng may cuối ca.
- Theo dõi xuyên suốt đơn Sale, lệnh sản xuất, lô, dòng sản phẩm, người thực hiện và vật tư.
- Nhân viên thấy sản lượng và tiền dự kiến trong ngày/tháng ngay sau khi gửi; tiền được ghi nhận khi quản lý duyệt.
- Tích hợp công ngày/giờ, tăng ca, phụ cấp, bảo hiểm và kỳ lương hiện có.
- Giữ toàn bộ mô-đun CRM. Không ghi hay xóa dữ liệu bản Supabase public trong quá trình triển khai.

## 2. Nền tảng hiện có và phần cần nối thêm

| Phần | Hiện có | Cần triển khai tiếp |
|---|---|---|
| Đơn bán hàng | Đơn Sale và danh sách đơn nguồn khi tạo lệnh | Hàng đợi gửi/tiếp nhận sản xuất, số lượng đã đưa vào sản xuất và phần còn lại |
| Lệnh sản xuất | Tạo nhóm lệnh từ đơn hoặc thủ công, thông tin màu/cỡ/quy cách | Một luồng thao tác theo các bước, truy xuất ngược về đơn Sale |
| Vật tư | BOM, tính nhu cầu, snapshot khi phát hành, chứng từ xuất/trả vật tư | Bảng dự toán cắt dễ nhập; gắn dự toán, chứng từ và bàn giao vào từng lô |
| Giao việc | Giao cắt/may, nhận thực tế, trả/từ chối, tạo/tách lô | Lệnh công khai cho người đủ điều kiện tự nhận; nhận một phần, kiểm soát số còn được nhận |
| Sản lượng | Báo đạt/sửa/làm lại/lỗi, duyệt, dòng lương có liên kết nguồn | Báo cuối ca nhiều dòng; liên kết bán thành phẩm và việc sửa/làm bù |
| Chấm công | Công ngày/giờ, tăng ca, duyệt, chốt ngày | Lối vào mobile đúng tài khoản, xác nhận ngày cho nhân viên, xử lý nguồn sản lượng nhập trực tiếp |
| Tiền lương | Mã công may Excel, đơn giá theo hiệu lực, nguồn lương, kỳ lương | Số tiền chờ duyệt/đã ghi nhận theo ngày/tháng dành cho chính nhân viên |

## 3. Vai trò và quyền

Tái sử dụng tài khoản và phân quyền hiện có; chỉ bổ sung quyền nghiệp vụ còn thiếu.

| Vai trò | Được làm | Giới hạn |
|---|---|---|
| Sale | Gửi đơn, ghi hạn/ưu tiên, xem tiến độ đơn mình phụ trách | Không phát hành lệnh cắt, duyệt sản lượng hoặc sửa đơn giá |
| Quản lý sản xuất | Tiếp nhận, lập/phát hành lệnh, duyệt dự toán, giao việc, theo dõi và duyệt kết quả | Không thay đổi dữ liệu đã khóa kỳ lương |
| Phụ trách cắt | Lập dự toán và nhận/báo kết quả cắt nếu có quyền | Không tự duyệt dự toán hoặc sản lượng theo cơ chế người lập/người duyệt |
| Nhân viên cắt | Xem lệnh được phép nhận, nhận việc, báo kết quả và bàn giao | Chỉ xử lý phần việc mình đã nhận |
| Nhân viên may | Nhận việc may, báo sản lượng cuối ca, xem công và tiền của mình | Không xem tiền của người khác, không tự duyệt |
| Tổ trưởng | Theo dõi/duyệt trong phạm vi tổ được giao | Không tự duyệt báo cáo do mình nhập thay; không đảo lương ngoài quyền |
| Kế toán | Kiểm tra hồ sơ lương, đối chiếu, lập/khóa kỳ lương, xuất bảng | Không tự thay đổi sản lượng đã khóa để cân tiền |

Việc cho nhân viên xem tiền của chính mình cần được thực thi tại API, không chỉ ẩn cột trên giao diện.
Phân biệt khoản lương được ghi nhận với khoản đã thanh toán; tính lương không tự chuyển tiền.

## 4. Quy trình nghiệp vụ

### 4.1. Sale gửi đơn và quản lý tiếp nhận

- Thêm nút “Gửi sản xuất” trong đơn hàng; giữ nguyên mã đơn bán hàng.
- Dữ liệu gửi: dòng sản phẩm, màu/cỡ/quy cách, số lượng cần sản xuất, hạn giao, ưu tiên, ghi chú và tài liệu kỹ thuật nếu có.
- Kiểm tra đơn đủ điều kiện theo trạng thái phê duyệt hiện có; không tự thay đổi trạng thái kinh doanh/thanh toán.
- Quản lý xem hàng đợi “Đơn cần sản xuất”, tiếp nhận hoặc trả lại kèm lý do.
- Hiển thị cho từng dòng: số đặt, số đã lập lệnh, số còn chưa lập lệnh. Cho phép chia nhiều đợt sản xuất.
- Chặn tạo trùng khi nhấn/gửi lại; không cho tổng phân bổ vượt số đặt nếu chưa có điều chỉnh được duyệt.
- Một đơn Sale có nhiều dòng/lệnh/lô; truy xuất hai chiều bằng liên kết dữ liệu, không nối bằng chuỗi mã tự gõ.

### 4.2. Lập lệnh sản xuất

- Quản lý chọn số lượng từng dòng, chia lô, hạn từng lô và người/tổ phụ trách.
- Giữ cách tạo nhóm lệnh hiện có; không tạo thêm nguồn đơn sản xuất cạnh tranh.
- Mã lệnh, mã lô và mã đơn Sale đều hiển thị; mã SKU CRM và mã công may Excel có cột riêng.
- Bắt buộc chọn đúng dòng sản phẩm khi giao việc cho lệnh nhiều dòng.
- Chốt phiên bản BOM/quy trình khi phát hành; thay đổi định mức về sau không sửa lịch sử lệnh đã phát hành.
- Thiếu định mức hoặc mã công: hiển thị rõ việc còn thiếu; dự toán có thể ở nháp, chưa phát hành bước liên quan.

### 4.3. Lập và duyệt dự toán cắt

Các cột chính: dòng sản phẩm, loại/màu vải, khổ vải, số lượng cần cắt, phương pháp tính, định mức hoặc kết quả sơ đồ cắt, hao hụt, mét dự kiến, kho cấp và ghi chú.

- Ưu tiên lấy từ BOM/định mức cắt đã duyệt; quản lý hoặc phụ trách cắt kiểm tra và đề xuất điều chỉnh.
- Với định mức tuyến tính đã bao gồm quy cách: mét dự kiến = số lượng × mét/đơn vị × (1 + tỷ lệ hao hụt).
- Với trải vải/sơ đồ cắt: dùng bộ tính cắt hiện có; lưu chiều dài sơ đồ, số lớp, số sản phẩm/lớp và kết quả, không áp công thức tuyến tính cho mọi trường hợp.
- Định mức đã bao gồm hao hụt không được cộng hao hụt lần thứ hai.
- Nhập dự toán thủ công phải có phương pháp, lý do và người duyệt; lưu phiên bản trước/sau.
- Kiểm tra tồn khả dụng và số đã cấp; thiếu vải hiển thị “Thiếu vật tư”, cho phép chia đợt đủ vật tư.
- Phát hành lệnh cắt phải gắn với dự toán được duyệt và điều kiện cấp vật tư đã kiểm tra.

### 4.4. Nhận và thực hiện cắt

- Quản lý chọn “Giao người cụ thể” hoặc “Mở cho tổ cắt nhận”. Người đủ điều kiện thấy lệnh trên hệ thống.
- Nhân viên bấm nhận, nhập số lượng thực nhận; nhận thiếu phải ghi lý do. Phần chưa nhận còn trong hàng đợi.
- Hai người nhận đồng thời không thể giữ cùng phần số lượng hoặc vượt kế hoạch.
- Chứng từ xuất/trả vải dùng sổ kho hiện có. Phân biệt dự toán mét vải, mét đã cấp và mét đã trả.
- Không cho ghi đè tồn kho hoặc nhập một số “tiêu hao thực tế” độc lập với chứng từ. Số đối chiếu lấy từ xuất/trả; ghi nhận WIP và phế liệu theo quy tắc kho.
- Nhân viên có thể báo cắt từng phần: số bộ bán thành phẩm đạt, cần sửa, làm lại, hỏng; kèm nơi bàn giao và ghi chú.
- Nút “Hoàn thành cắt” gửi bàn giao chờ duyệt; không tự xác nhận chất lượng thay quản lý.
- Lượng cắt đạt đã duyệt trở thành lượng có thể giao may; có thể may một phần trước khi cả lô cắt xong.

### 4.5. Nhận và thực hiện may

- Lệnh may hiển thị mã đơn/lô, dòng sản phẩm, quy cách, mã công may, số đã cắt đạt và số còn được nhận.
- Quản lý chọn người cụ thể hoặc mở cho tổ may đủ điều kiện nhận; có thể chia một lô cho nhiều người.
- Nhân viên nhận số lượng mình phụ trách; trả phần chưa làm phải có lý do và giải phóng đúng số lượng.
- Giao may không vượt bán thành phẩm cắt đạt đã duyệt. Nếu có bán thành phẩm đầu kỳ/mua ngoài, cần nguồn tiếp nhận được duyệt riêng.
- Cuối ca nhập bảng nhiều dòng: đơn/lô, mã công, đạt, cần sửa, làm lại, lỗi/hỏng, ghi chú. Mỗi dòng gắn việc thực tế đã nhận.
- Báo cáo nhiều lần trong ngày được phép; hệ thống kiểm tra tổng số lượng đã nhận còn lại.
- Lượng chờ duyệt cũng giữ số lượng, không được đem giao cho người khác hoặc báo thêm vượt mức.
- Việc sửa/làm bù có liên kết báo cáo gốc; mỗi sản phẩm không được vừa tính là cần sửa vừa tính đạt trong cùng lần báo cáo.
- Không tự tạo thêm lương khi sản phẩm sửa được báo lại. Quy tắc trả công sửa/làm bù được cấu hình và quản lý duyệt riêng.

### 4.6. Duyệt, chất lượng và hoàn thành

- Quản lý duyệt/từ chối theo báo cáo; từ chối, sửa và đảo đều có lý do và nhật ký.
- Duyệt may đạt tạo duy nhất một dòng lương sản phẩm hiện có, có liên kết đến báo cáo nguồn.
- Nếu có công đoạn kiểm tra chất lượng sau may: theo dõi riêng “may đạt đã duyệt” và “thành phẩm được nghiệm thu”; không tự coi mọi sản phẩm may xong là hàng đã nhập kho.
- Khi có lỗi phát hiện sau duyệt, tạo yêu cầu sửa/đảo theo quyền; không âm thầm trừ lương.
- Hoàn thành lô/lệnh chỉ khi số lượng đã đối chiếu, không còn việc giữ dở hoặc báo cáo chờ duyệt, và đáp ứng các bước bắt buộc.
- Thiếu kế hoạch do hỏng không được tự coi là hoàn thành; quản lý tạo làm bù hoặc duyệt giảm kế hoạch có lưu lịch sử.
- Thành phẩm nhập kho qua chứng từ kho hiện có; Sale thấy tiến độ sản xuất nhưng giao hàng vẫn theo luồng giao hàng hiện có.

## 5. Trạng thái và số liệu tiến độ

Không dùng một chuỗi trạng thái dài duy nhất cho cả đơn vì các lô có thể cắt và may đồng thời.

- Trạng thái lệnh chính giữ: nháp, đã phát hành, đang làm, tạm dừng, hoàn thành, đã hủy.
- Trạng thái công đoạn theo lô: chưa sẵn sàng, chờ nhận, đang làm, chờ duyệt, còn thiếu, hoàn thành.
- Nhãn “Chờ cắt”, “Chờ may”, “Đang cắt và may” trên bảng điều hành được suy ra từ số liệu nguồn; không có hai bộ trạng thái cho phép sửa độc lập.
- Nhận việc và duyệt báo cáo có trạng thái riêng, không đánh đồng “đã nhận” với “đã hoàn thành”.

Theo từng dòng/lô phải có: kế hoạch, giao/nhận cắt, cắt đạt duyệt, may còn nhận được, may đã nhận, sản lượng chờ duyệt, may đạt duyệt, cần sửa/hỏng, thành phẩm nhập kho và số còn thiếu.
Số cắt, số may và số thành phẩm là các mốc của cùng sản phẩm; không cộng ba mốc thành tổng sản lượng.

## 6. Tiền lương cập nhật ngay

### 6.1. Nhân viên nhìn thấy gì

- “Chờ duyệt”: báo cáo mới gửi × đơn giá có hiệu lực tại ngày làm; hiển thị là dự kiến.
- “Đã ghi nhận”: tổng sản lượng đạt đã duyệt × đơn giá đã lưu ở dòng lương.
- “Lũy kế tháng”: hai số trên tách riêng, có chi tiết ngày/đơn/mã công.
- “Đã chốt kỳ”: số trong kỳ lương được khóa, gồm các khoản cộng/trừ được duyệt.
- “Đã thanh toán” chỉ hiện khi hệ thống có dữ liệu thanh toán hợp lệ; không đổi tên tiền dự kiến thành tiền đã nhận.
- Công nhân cắt hưởng lương ngày/giờ theo hồ sơ hiện có; không tự áp mã công may để trả lương cắt. Nếu trả theo sản phẩm cắt, bổ sung mã công cắt và quy chế riêng.

### 6.2. Quy tắc tính

- Mã tính công là mã từ Excel, SKU chỉ dùng nhận diện hàng hóa.
- Đơn giá có hiệu lực theo ngày làm và đơn vị; không dùng đơn giá mới nhất để tính ngược mọi ngày.
- Một báo cáo được duyệt chỉ tạo một dòng nguồn lương; gửi lại hoặc duyệt lại không nhân đôi tiền.
- Nhân viên lương tháng/giờ được cộng thêm sản lượng nếu hồ sơ nguồn lương đã bật khoản này.
- Công ngày/giờ, tăng ca, tiền ăn, phụ cấp, BHXH và khấu trừ giữ công thức hiện có; không biến sản lượng thành một ngày công nữa.
- Kỳ lương cộng nguồn đã duyệt, đúng phạm vi và hiệu lực. Số tiền sản phẩm trong tháng không đại diện cho toàn bộ thực lĩnh tháng.
- Đảo báo cáo khi kỳ mở điều chỉnh đúng nguồn và số lũy kế; kỳ đã khóa không được sửa ngầm.
- Chính sách thay đơn giá hoặc khấu trừ không sửa dòng lịch sử đã duyệt.
- Chặn nhập trực tiếp sản lượng cho công việc đã thuộc lệnh; chỉ giữ nhánh công việc ngoài lệnh nếu có quyền/lý do riêng và được duyệt.

## 7. Các màn hình cần hoàn thiện

| Màn hình | Thành phần chính | Mobile |
|---|---|---|
| Đơn hàng của Sale | Gửi sản xuất, số lượng đã giao/còn lại, xem tiến độ | Nút gửi và xem tiến độ trong chi tiết đơn |
| Bảng điều hành sản xuất | Bộ lọc, bảng đơn/lô, tiến độ cắt/may, thiếu vải, quá hạn, việc chờ duyệt | Thẻ đơn gọn, mở chi tiết; không ép toàn bộ bảng rộng vào màn hình nhỏ |
| Chi tiết lệnh | Các bước: đơn nguồn → dự toán → cắt → may → nghiệm thu; các bảng nằm trong cùng khu vực làm việc | Hành động chính rõ ràng, chỉ mở form cần dùng |
| Công việc của tôi | Việc mới được phép nhận, việc đang làm, báo cuối ca, lịch sử | Nhận việc/báo sản lượng thao tác ngắn; mở từ menu nhân viên |
| Chấm công xưởng | Công ngày/giờ, tăng ca, nguồn sản lượng liên kết, duyệt/chốt ngày | Xem theo nhân viên/ngày, nút đủ lớn |
| Công và tiền của tôi | Công, tăng ca, sản lượng, tiền chờ duyệt/đã ghi nhận theo ngày/tháng | Mặc định hôm nay, đổi tháng và xem từng đơn |
| Kỳ lương | Kiểm tra thiếu thiết lập, đối chiếu nguồn, xem trước, khóa và xuất | Xem/đối chiếu cơ bản; thao tác lớn ưu tiên desktop |

Desktop ưu tiên bảng như Excel: dòng rõ, bộ lọc ở đầu, cột quan trọng cố định không đè chữ, tổng cuối bảng, sửa qua bảng/form ngắn.
Không thêm nhiều thẻ giới thiệu hoặc số liệu trùng lặp. Toàn bộ nhãn nghiệp vụ dùng tiếng Việt.
Hiển thị rõ tải dữ liệu, rỗng, thiếu quyền, không có đơn giá, lỗi và thử lại.

## 8. Dữ liệu và API cần bổ sung

Tái sử dụng đơn hàng, lệnh/lô, local_assignments, local_production_stage_events, local_production_entries, chứng từ/sổ kho, hồ sơ lương và kỳ lương hiện có.

- Bổ sung liên kết yêu cầu Sale → dòng đơn → phần số lượng được lập lệnh, người gửi/tiếp nhận và lịch sử trả lại.
- Bổ sung phiên bản dự toán cắt gắn dòng/lô và snapshot BOM/định mức; liên kết chứng từ xuất/trả.
- Bổ sung thông tin phát hành việc và phạm vi được nhận; thiết kế sau khi kiểm tra ràng buộc worker của assignments để không tạo bảng phân công cạnh tranh.
- Bổ sung bàn giao bán thành phẩm, liên kết nguồn cắt với phần may, việc sửa/làm bù với báo cáo gốc.
- Bổ sung API tiền của chính nhân viên, tách tiền dự kiến và nguồn tiền đã duyệt; không mở API lương toàn xưởng cho employee.
- Các thao tác gửi/tiếp nhận, phát hành, nhận, trả, báo, duyệt, đảo có khóa gửi lại và giao dịch nguyên tử.
- Giữ thứ tự khóa thống nhất với tính lương và kho; API kiểm tra quota/quyền trước khi ghi.
- Tiến độ và tổng tiền là kết quả truy vấn/chiếu từ nguồn hiện có, không là số nhập tay thứ hai.
- Cập nhật dữ liệu giao diện sau sự kiện phù hợp; dùng làm mới tự động có khoảng thời gian dự phòng khi mất kết nối.
- Migration bổ sung nối tiếp, không sửa migration đã áp dụng. Lệnh/sản lượng local không bị sync public ghi đè.

## 9. Các tình huống bắt buộc xử lý

1. Đơn nhiều sản phẩm, nhiều màu/cỡ và chia sản xuất nhiều đợt.
2. Sale sửa/hủy đơn khi đã phát hành sản xuất: tạo yêu cầu thay đổi, không xóa việc/vật tư/lương đã ghi nhận.
3. Thiếu vải, thay loại vải, cấp thêm và trả dư: cần lý do/duyệt, đúng chứng từ.
4. Hai nhân viên nhận cùng lúc; không nhận vượt số còn lại.
5. Nhận thiếu, nhận một phần, đổi người, trả việc sau khi đã làm một phần.
6. Cắt từng phần rồi may từng phần; không vượt số cắt đạt.
7. Một người làm nhiều đơn trong ngày; một đơn có nhiều người cùng làm.
8. Hai báo cáo cùng số lượng cùng ngày là hai sự kiện hợp lệ; retry một báo cáo vẫn chỉ ghi một lần.
9. Sản phẩm cần sửa/hỏng/làm bù; giữ liên kết gốc và tránh tính tiền hai lần.
10. Tạm dừng/tiếp tục giữ nguyên định mức, lô và nguồn lương; hủy không xóa lịch sử.
11. Thiếu/đổi đơn giá, đổi tháng, đổi đơn vị, báo ngày sai hoặc ngoài thời gian nhận việc.
12. Tổ trưởng nhập thay và tự duyệt; nhân viên truy cập công/tiền người khác.
13. Chốt ngày khi còn công/sản lượng/tăng ca đang chờ xử lý; mở lại có lý do, không vượt khóa kỳ lương.
14. Mất mạng/mất phản hồi, tải lại trình duyệt và khởi động lại API: không mất hoặc nhân đôi đơn, vật tư, sản lượng, tiền.

## 10. Thứ tự triển khai và nghiệm thu

| Giai đoạn | Công việc | Điều kiện hoàn thành |
|---|---|---|
| 1. Chuẩn hóa liên kết và quy tắc | Chốt danh tính đơn/dòng/lô, nguồn lương, trạng thái theo công đoạn, quyền và dữ liệu cũ | Truy được từ đơn Sale đến báo cáo và dòng lương; không có nguồn nhập trùng |
| 2. Sale → lệnh sản xuất | Gửi/tiếp nhận/trả lại, phân bổ số lượng, tạo nhóm lệnh và xem tiến độ | Một đơn nhiều dòng chia được nhiều đợt, gửi lại không tạo trùng, không vượt số đặt |
| 3. Dự toán và lệnh cắt | Bảng tính vải, duyệt dự toán, kiểm tra cấp vật tư, mở/giao việc cắt, bàn giao | Có thể đi từ đơn đến cắt đạt từng phần; kho đối chiếu đúng chứng từ |
| 4. Lệnh may và cuối ca | Nhận phần may sẵn sàng, báo nhiều dòng, sửa/làm bù, duyệt | Không nhận/báo vượt bán thành phẩm; nhiều người làm cùng đơn đúng số lượng |
| 5. Công và tiền của nhân viên | Menu mobile đúng tài khoản, xác nhận ngày, tiền chờ duyệt/đã ghi nhận, lũy kế tháng | Gửi báo cáo thấy tiền dự kiến; duyệt cập nhật tiền ghi nhận; người khác không đọc được |
| 6. Điều hành và nghiệm thu | Bảng toàn xưởng, chờ duyệt, thiếu vải/quá hạn, đối chiếu thành phẩm, kỳ lương | Quản lý truy được toàn bộ tiến trình, tồn kho và tiền; đóng lệnh/kỳ theo đúng điều kiện |

Không phát hành đồng loạt trước khi nghiệm thu từng giai đoạn. Sau giai đoạn 4 có luồng sản xuất khép kín; giai đoạn 5 hoàn thiện trải nghiệm nhân viên, giai đoạn 6 hoàn thiện đối chiếu toàn xưởng.
Không ấn định số ngày khi chưa xong khảo sát dữ liệu thực và phạm vi API bổ sung.

## 11. Kiểm thử và tiêu chí bàn giao

- Kiểm thử trên database riêng; không tạo đơn/báo cáo thử vào dữ liệu kinh doanh hoặc Supabase public.
- Kiểm tra đơn nguồn, BOM/cắt, kho, nhận việc đồng thời, duyệt, nguồn lương và khóa kỳ trong cùng chuỗi.
- Kiểm tra quyền trực tiếp tại API; không chỉ kiểm tra nút ẩn trên UI.
- Kiểm tra desktop và mobile 320/390 px: không đè text, form không tràn, thao tác nhận/báo rõ.
- Kiểm tra lỗi mạng, retry, thay đổi lựa chọn nhanh và khởi động lại.
- TypeScript, lint phần sửa, build và các suite kho/sản xuất/lương liên quan phải đạt.
- Có mẫu nghiệm thu: đơn 100 sản phẩm, cắt 60 rồi 40, hai thợ may chia việc, báo nhiều ca, có lỗi/sửa và đối chiếu tiền theo từng người.
- Bàn giao kèm màn hình sử dụng, trạng thái dữ liệu cũ, kết quả kiểm tra và hạn chế thực tế; không kết luận toàn bộ hoàn thành nếu chưa thử luồng người dùng.

## 12. Mặc định đề xuất để triển khai

- Quản lý được giao người cụ thể hoặc mở nhận việc trong tổ đủ điều kiện, không mở cho mọi tài khoản.
- Cho phép cắt/may từng phần; tính tiến độ theo lô và dòng sản phẩm.
- Nhân viên thấy tiền dự kiến ngay; tiền chính thức vào kỳ lương sau duyệt.
- Chỉ sản lượng đạt được tính công sản phẩm mặc định; việc sửa/làm bù cần quy tắc riêng.
- Công việc theo lệnh phải báo qua việc đã nhận; nhập sản lượng ngoài lệnh cần quyền/lý do riêng.
- Giữ lương ngày/giờ/tăng ca/khấu trừ hiện có; không mặc định tiền sản phẩm là toàn bộ thực lĩnh.
