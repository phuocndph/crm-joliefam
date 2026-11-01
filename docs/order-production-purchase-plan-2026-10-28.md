# Kế hoạch nối đơn bán – sản xuất – hàng nhập sẵn

Ngày lập: 28/10/2026. Phạm vi được cập nhật ngày 29/10/2026 theo quyết định không chia tổ/nhóm đơn giá. Đây là kế hoạch; trạng thái triển khai từng mục xem nhật ký, chưa coi toàn luồng đã hoạt động trên dữ liệu thật.

## 1. Mục tiêu và quyết định đã chốt

Quản lý mở một đơn bán, biết ngay món nào cần may, món nào lấy kho và món nào cần nhập thêm. Mỗi món luôn truy về đúng dòng đơn bán. Chỉ hàng thực sự cần may đi qua cắt, may và ghi nhận lương sản lượng.

| Nhóm hàng | Tuyến xử lý |
|---|---|
| Chăn, ga, vỏ gối và hàng chăn ga gối cần gia công | Cần may |
| Ruột chăn Microfiber mỏng/dày | Cần may |
| Đệm | Nhập sẵn |
| Các loại khăn | Nhập sẵn |
| Ruột chăn 10OZ, 6OZ, ruột chăn đông 3D và các ruột chăn/ruột gối khác ngoài Microfiber | Nhập sẵn |
| Ruột gối bông 3D | Nhập sẵn |
| Divan/Divang | Nhập sẵn |

Quyết định bổ sung từ người dùng:

- Hàng nhập sẵn: ưu tiên tồn khả dụng, chỉ yêu cầu nhập phần thiếu.
- Quy tắc “Microfiber may, còn lại nhập” áp dụng trong nhóm ruột chăn/ruột gối vừa được hỏi; không áp thành quy tắc toàn danh mục.
- Combo gồm cả đồ may và đồ nhập: Sale tách thành từng món trên đơn bán trước. Không xây bộ tách combo tự động trong đợt này.
- Không tự coi “Bảo vệ nệm” là đệm chỉ vì trùng từ; các sản phẩm chưa rõ để quản lý xác nhận.
- Quyết định 29/10/2026: ai may được sản lượng hợp lệ nào thì tính tiền cho phần người đó làm: số lượng × một đơn giá hiệu lực của mã công Excel. Không chia giá theo tổ/nhóm, không phân chia quỹ công và không chia/nhân tiền theo số người.

## 2. Những khoảng trống đã xác định

- Route local `/production-orders` đang chạy `ProductionWorkspacePage`.
- `ProductionSalesQueue` chọn sẵn gần như mọi dòng có sản phẩm và số lượng; chưa có phân loại may/nhập sẵn.
- Luồng tiếp nhận và phân bổ đã có liên kết dòng đơn, kiểm tra thay đổi nguồn và chống một số trường hợp vượt số lượng. Tái sử dụng nền tảng này.
- Danh mục có nhiều sản phẩm trùng SKU giữa các bảng giá. Không dùng riêng SKU hoặc tên để ghép sản phẩm, kho và lương.
- Phiếu giao sản xuất hiện bắt buộc liên kết lệnh sản xuất và thành phẩm đầu ra. Vì vậy chỉ thêm cột “Nhập sẵn” vào giao diện chưa đủ để hoàn tất đơn hỗn hợp đúng cách.
- Số lượng tồn phải lấy từ sổ chuyển động kho hiện có; cờ `in_stock` trong danh mục không chứng minh có hàng thực tế.
- Đơn nguồn có kiểu ID text, trong khi một nhánh tạo lệnh hiện chỉ truyền ID hợp lệ UUID. Dữ liệu đã kiểm tra hiện dùng UUID, nhưng thiết kế phải bảo toàn ID text thay vì âm thầm bỏ liên kết.

## 3. Luồng nghiệp vụ mới

### 3.1. Sale gửi đơn

1. Sale tạo hoặc mở đơn bán hiện có rồi chọn “Gửi xử lý”.
2. Hệ thống đưa toàn bộ hàng cần đáp ứng vào một kế hoạch; không mặc định đưa tất cả vào sản xuất.
3. Dòng không liên kết được sản phẩm, chưa rõ quy cách hoặc là combo may/nhập chưa tách được đánh dấu cần bổ sung. Sale sửa trên đơn bán gốc; không tạo bản đơn bán thứ hai.
4. Có thể lưu nháp khi thiếu thông tin; chưa xác nhận kế hoạch nếu còn dòng chưa rõ hoặc chưa được loại trừ có lý do hợp lệ.

### 3.2. Quản lý xác nhận kế hoạch

Bảng duy nhất:

`Sản phẩm / Quy cách | SL đặt | Đã xử lý | Còn cần | Cách đáp ứng | Kho khả dụng | Cần may / Cần nhập`

- Phân loại lấy sẵn từ danh mục đã được quản lý xác nhận.
- Có thể chỉnh tuyến cho phần chưa thực hiện, có lý do và lịch sử. Đã phát lệnh/giữ hàng phải thực hiện điều chỉnh rõ ràng.
- Với hàng nhập sẵn: tự đề xuất phân bổ tồn khả dụng và yêu cầu nhập phần thiếu. Nút xác nhận kiểm tra lại tồn trên máy chủ.
- Với hàng cần may: số cần may nối vào cơ chế lập lệnh/lô hiện có, giữ đúng màu, cỡ, quy cách và hạn giao.
- “Xác nhận kế hoạch” là thao tác chính. Khi thành công, tạo các liên kết/lệnh/yêu cầu cần thiết trong cùng giao dịch; bấm lại không sinh thêm bản ghi.
- Tạo lệnh thủ công vẫn có thể dùng cho sản xuất dự trữ, có nhãn riêng; không tính lệnh đó vào tiến độ một đơn bán khi chưa phân bổ rõ.

### 3.2.1. Tự xác định mã may, không bắt nhân viên chọn mã

Đây là điều kiện bắt buộc trước khi phát hành việc may, không để tới bước nhập sản lượng mới tìm mã. Chuỗi xác định:

`Dòng đơn → Cần may → Loại sản phẩm + quy cách + kỹ thuật → Mã công Excel → Một đơn giá hiệu lực → Sản lượng hợp lệ từng người → Tiền công từng người`

Phân biệt ba khái niệm:

- **SKU bán hàng:** xác định mặt hàng được khách đặt; không dùng thay mã công.
- **Mã công may:** xác định công việc gia công theo danh mục Excel đã nhập. Nhiều SKU có thể dùng một mã công; cùng một dòng sản phẩm có thể cần mã khác nếu yêu cầu kỹ thuật thực tế khác.
- **Đơn giá hiệu lực:** một mức đã duyệt cho đúng mã công và ngày làm. Người nhận việc thay đổi không làm đổi mã công hoặc tạo mức giá theo tổ; mỗi người được tính theo số lượng hợp lệ thực sự hoàn thành.

Ví dụ từ danh mục mã hiện có, chưa phải xác nhận ánh xạ cho toàn bộ sản phẩm:

| Đặc điểm công việc | Mã ứng viên có thật | Điều kiện tự áp dụng |
|---|---|---|
| Vỏ gối ôm | `Vgo` | Khớp loại và kỹ thuật tiêu chuẩn đã được quản lý xác nhận |
| Ga chun luồn | `gcl` | Đúng loại, không có yêu cầu can hoặc biến thể khác |
| Ga chun luồn can | `gclc` | Có thuộc tính gia công can, không chỉ dò chữ “ga” |
| Chăn hè Microfiber | `chm`, `chanhecm` | Phân biệt cách may; `chanhecm` có mô tả chạy máy T233. Thiếu thông tin thì chưa tự chọn |

**Dữ liệu và thứ tự áp quy tắc:**

1. Ưu tiên ánh xạ đã xác nhận cho đúng sản phẩm/biến thể và yêu cầu gia công. Nếu đơn có thay đổi kỹ thuật so với mẫu chuẩn, ánh xạ chuẩn chỉ dùng khi vẫn thỏa điều kiện.
2. Nếu chưa có ánh xạ cụ thể, áp quy tắc đã duyệt theo họ sản phẩm và thuộc tính bắt buộc: vỏ/ruột, loại ga/gối/chăn, chất liệu khi ảnh hưởng công, kích thước/ngưỡng kích thước, can nối, chần/diễu, khóa/chun/đai và phương pháp may. Chỉ bắt nhập thuộc tính thực sự ảnh hưởng quy tắc của loại hàng đó.
3. Chỉ tự gán khi có đúng một kết quả hợp lệ. Hai quy tắc cạnh tranh, thiếu thuộc tính, mã hết hiệu lực hoặc không có đơn giá phải trả trạng thái “Cần kiểm tra mã may”; không chọn dòng đầu tiên, không tính tiền 0 và không lấy SKU làm mã dự phòng.
4. Tìm gần đúng theo tên, hoặc AI nếu bổ sung sau, chỉ hỗ trợ đề xuất cho quản lý. Quy tắc được xác nhận mới dùng để tự áp cho đơn tiếp theo.
5. Quy tắc và ánh xạ có hiệu lực, phiên bản, phạm vi và lịch sử thay đổi; lưu tham chiếu danh mục mã công hiện có, không tạo một danh mục mã cạnh tranh.

**Màn hình quản lý tối thiểu:**

`Sản phẩm / Nhóm sản phẩm | Đặc điểm phân biệt | Mã may | Đơn vị công | Trạng thái`

- Đặt trong “Đơn giá & Nhân sự”, phân mục “Gán mã may”. Có bộ lọc **Chưa gán / Cần kiểm tra / Đã gán** và thao tác xác nhận hàng loạt cho nhóm cùng kỹ thuật.
- Khi khởi tạo, hệ thống quét sản phẩm và danh mục mã Excel để lập bản xem trước: tự khớp được, còn mơ hồ, thiếu mã hoặc thiếu thuộc tính. Quản lý kiểm tra quy tắc/ánh xạ ban đầu, không gán lại từng đơn.
- Trên đơn sản xuất chỉ hiện mã đã xác định; chi tiết lý do khớp mở khi cần. Quản lý sửa ngoại lệ có lý do, chọn áp riêng đơn này hoặc đề xuất sửa quy tắc chung. Nhân viên không có quyền đổi mã hay đơn giá.
- Không phát hành việc may có trả theo sản lượng khi mã/đơn vị chưa xác định. Vẫn lưu nháp, lập kế hoạch hoặc làm bước cắt nếu đủ điều kiện riêng; thiếu thông tin tiền công phải hiển thị rõ.

**Đơn vị và một đơn giá theo mã:**

- Khớp đơn vị sản phẩm/bộ/công với danh mục mã. Không tự coi một bộ là một chiếc; mọi hệ số quy đổi phải được quản lý xác nhận trước khi áp.
- Dùng một mức đơn giá đã duyệt cho đúng mã công Excel tại ngày làm; nếu có nhiều mức chồng ngày, thiếu giá hoặc giá chưa được xác nhận thì phải xử lý trước khi ghi tiền công. Không thêm chiều tổ/nhóm giá hoặc mặc định dùng mức đầu tiên.
- Giữ giá và lịch sử cũ; thay giá bằng phiên bản có hiệu lực, không sửa lại tiền đã duyệt. Không yêu cầu nhóm giá trong hồ sơ nhân viên và không dùng giá của công đoạn cắt cho công may.
- Nhiều người cùng làm một đơn vẫn ghi sản lượng riêng từng người: ai may được bao nhiêu thì tính bấy nhiêu. Tổng lượng đã giao/hoàn thành phải đúng phần việc còn lại; không có quỹ chung, tỷ lệ chia hoặc hệ số theo số người.
- Một sản phẩm mặc định dùng một mã công cho một phần việc may. Chỉ dùng nhiều mã khi quy trình có công đoạn độc lập được xác nhận và quy định chống cộng chồng; không tự cộng mọi mã có tên gần giống. Việc sửa/làm lại giữ quy chế trả công hiện có.

**Khi phát hành và báo sản lượng:**

- Lệnh lưu phiên bản ánh xạ/quy tắc, mã công, thuộc tính kỹ thuật và đơn vị. Giao việc tự kế thừa các thông tin này thay vì yêu cầu chọn mã thủ công như giao diện hiện tại.
- Với việc mở chưa biết người nhận, xác định mã và đơn vị trước; khi nhận việc kiểm tra quyền và số lượng còn lại. Lấy đúng một đơn giá hiệu lực ngày làm theo mã công, không theo tổ/nhóm người nhận.
- Bản ghi sản lượng giữ đúng người, đơn, ngày, mã công, phiên bản đơn giá, số lượng hợp lệ, đơn vị/quy đổi đã xác nhận khi cần và số tiền đã dùng. Tiền công người đó = số lượng hợp lệ × đơn giá. Thay cấu hình sau này không tự sửa lịch sử đã duyệt; điều chỉnh phải có chứng từ/lịch sử phù hợp.
- Hàng nhập sẵn không chạy bộ tìm mã may, kể cả khi tên giống một mã công có trong danh mục.

### 3.3. Tuyến cần may

`Chờ cắt → Đang cắt → Chờ may → Đang may → Gấp–là → Kiểm đếm → Sẵn sàng giao`

- Giữ dự toán mét vải và xuất/trả vải của hệ thống hiện có.
- Nhân viên chỉ thấy phần việc phù hợp vai trò và đã đủ điều kiện ở công đoạn trước.
- Báo sản lượng phải gắn dòng hàng/lô của đúng đơn; có thể hoàn thành từng phần.
- Dùng chung nguồn sản lượng cho tiến độ và tiền công, tránh nhập hai lần.
- Mã tính lương là mã công sản phẩm từ Excel, không tự thay bằng SKU bán hàng.
- Tiền công chờ duyệt và tiền đã ghi nhận phân biệt rõ; đơn giá lịch sử giữ theo thời điểm ghi nhận. Công thức tính lương hiện có không đổi.

### 3.4. Tuyến nhập sẵn

`Lấy kho nếu đủ → Yêu cầu nhập phần thiếu → Nhận/kiểm hàng → Nhập kho → Sẵn sàng giao`

- Ví dụ cần 10 đệm, kho khả dụng 6: giữ 6 cho đơn, yêu cầu nhập 4.
- Giữ hàng chỉ giảm số khả dụng, chưa ghi xuất kho. Khi giao mới phát sinh xuất kho.
- Yêu cầu nhập tối thiểu gồm sản phẩm/quy cách, số thiếu, hạn cần, người phụ trách; nhà cung cấp và ghi chú có thể bổ sung.
- Một yêu cầu được nhận nhiều đợt; số nhận chỉ ghi nhận sau khi chứng từ nhập kho được xác nhận. Nhận thiếu vẫn chờ phần thiếu; hàng lỗi chưa được tính là sẵn sàng giao.
- Dùng chứng từ nhập kho hiện có, liên kết từng dòng nhập với nhu cầu của đơn. Không lập thêm một sổ tồn độc lập.
- Không tạo lệnh cắt, lệnh may, thành phẩm giả hoặc lương sản phẩm cho hàng nhập sẵn. Công/giờ hợp lệ của nhân viên kho vẫn theo nghiệp vụ chấm công riêng.
- Đợt này chỉ làm yêu cầu nhập gắn đơn; không mở rộng sang hệ thống mua hàng/công nợ nhà cung cấp đầy đủ.

### 3.5. Giao hàng chung theo đơn bán

- Một khu vực “Giao hàng” cho cả hàng may và hàng nhập sẵn.
- Mỗi dòng thể hiện số đặt, số sẵn sàng, số đã xuất và số đã giao xác nhận.
- Cho giao từng phần; trạng thái “Sẵn sàng” không đồng nghĩa “Đã giao”.
- Một phiếu có thể gồm cả hai tuyến. Mỗi dòng truy được nguồn hàng, dòng đơn và chứng từ xuất kho.
- Chỉ hoàn tất giao đơn khi tất cả dòng còn hiệu lực đã được giao đủ có xác nhận; hoàn thành may hoặc nhận đủ hàng không tự hoàn tất đơn.
- Không thay đổi trạng thái thanh toán/công nợ khi chỉ xác nhận tiến độ sản xuất hoặc giao hàng.

## 4. Giao diện gọn theo vai trò

Trong `/production-orders`, dùng ba khu vực: **Đơn cần xử lý – Đang thực hiện – Giao hàng**. Phân loại sản phẩm đặt trong danh mục/cài đặt của quản lý, không buộc nhân viên chọn.

- Quản lý: chọn đơn, xem bảng món hàng và một nút “Xác nhận kế hoạch”; mở chi tiết chỉ khi cần.
- Nhân viên cắt/may: thấy hàng chờ của công đoạn mình, số lượng và quy cách; không thấy yêu cầu mua hay cấu hình.
- Người phụ trách nhập/kho: thấy hàng còn thiếu, hạn cần, số đã nhận và nút nhận hàng qua chứng từ kho.
- Sale: xem tiến độ chung của đúng đơn mình được quyền xem, bổ sung thông tin khi có yêu cầu.
- Desktop dùng bảng gọn; mobile dùng từng dòng hàng với số lượng và một thao tác chính, nút tối thiểu 44px. Chi tiết và lịch sử thu gọn, không đặt đoạn hướng dẫn dài trên màn hình chính.

## 5. Thiết kế dữ liệu và API

### Dữ liệu cần bổ sung, không thay nguồn dữ liệu hiện có

1. Phân loại có quản lý xác nhận trên đúng sản phẩm: `SEW`, `PURCHASE`, `UNCLASSIFIED`; lưu người xác nhận, thời điểm và phiên bản. Nhận diện tên/danh mục chỉ dùng để gợi ý rà soát ban đầu.
2. Kế hoạch đáp ứng theo đơn và các dòng: `order_id`, `source_line_key`, snapshot sản phẩm/quy cách/số lượng, tuyến, phiên bản đơn nguồn và liên kết phần việc đã tạo.
3. Nhu cầu nhập theo dòng kế hoạch và liên kết tới dòng chứng từ nhập hiện có.
4. Phân bổ/giữ hàng theo dòng kế hoạch, mặt hàng kho và kho; có số lượng đang hiệu lực, được tiêu thụ hoặc đã giải phóng.
5. Phiếu giao cấp đơn bán và các dòng giao dùng chung cho hai tuyến; nối đến chứng từ xuất và nguồn hàng thực tế.

Tên bảng/API được chốt ở bước thiết kế migration; các quan hệ, quyền và bất biến trên là bắt buộc. API dự kiến gồm xem/nháp/xác nhận/điều chỉnh kế hoạch, nhu cầu nhập, phân bổ tồn, lập phiếu giao và xác nhận giao. Tái sử dụng API chứng từ kho và nghiệp vụ cắt/may hiện có.

### Quy tắc bảo toàn dữ liệu

- Dòng đơn bán là đơn vị kiểm soát số lượng. Tổng phần đã giao và phần còn cam kết không vượt nhu cầu hợp lệ; các giai đoạn kế hoạch, giữ hàng, sản xuất và giao là cùng một chuỗi, không cộng trùng chúng.
- Mọi xác nhận dùng transaction, khóa dòng nguồn và tồn liên quan, kiểm tra quyền phía API, chống retry tạo trùng và lưu audit. Dùng số thập phân của cơ sở dữ liệu cho số lượng/tiền, kiểm tra đơn vị quy đổi.
- Tất cả đường tiêu thụ kho, gồm xuất tay và giao từ sản xuất cũ, phải dùng chung kiểm tra tồn đã giữ; không chỉ kiểm soát ở màn hình mới.
- Ghép bằng ID sản phẩm/dòng đơn và mặt hàng kho đã xác nhận. Với SKU xuất hiện trong nhiều bảng giá, cho ánh xạ nhiều bản ghi thương mại về mặt hàng kho chuẩn sau kiểm tra; không tự gộp bằng tên/SKU và không phá ánh xạ cũ.
- ID đơn bán được lưu nguyên vẹn theo kiểu text ở liên kết chuẩn. Không đặt `null` nếu ID không phải UUID; giữ cầu nối với trường cũ khi cần.
- Đơn nguồn đổi số lượng, sản phẩm, màu/cỡ/quy cách hoặc bị hủy: đánh dấu cần đối chiếu. Giải phóng phần chưa dùng/điều chỉnh phần chưa thực hiện; không xóa phần đã may, nhập hoặc giao. Chứng từ đã xác nhận chỉ sửa bằng nghiệp vụ đảo/trả/điều chỉnh.
- Đổi phân loại danh mục không tự đổi tuyến của kế hoạch đã phát hành.
- Quyền Sale, quản lý, kho, người nhận việc và người giao hàng theo module/phạm vi dữ liệu hiện có; không cấp rộng thêm để giao diện hoạt động.

## 6. Tương thích và phạm vi triển khai

- Migration chỉ bổ sung, không sửa migration đã áp dụng.
- Tính phần đã xử lý từ yêu cầu/lệnh/phân bổ/giao hàng cũ trước khi lập phần còn lại. Không tái tạo toàn bộ lệnh cho đơn đã chạy.
- Phiếu giao sản xuất cũ được chiếu vào báo cáo giao cấp đơn qua liên kết rõ ràng; một movement/dòng giao chỉ được tính một lần.
- Không tạo thành phẩm hoặc lệnh giả cho hàng nhập để né ràng buộc `output_id` của bảng cũ.
- Kế hoạch mới áp dụng theo đợt cho đơn nháp/chưa xử lý. Đơn đang chạy tiếp tục phiên bản cũ cho đến khi quản lý đối chiếu phần còn lại.
- Đợt này triển khai và kiểm thử trên local PostgreSQL; không ghi ngược Supabase. Bản Supabase cũ giữ hoạt động hiện tại; muốn có luồng mới phải có đợt chuyển đổi riêng, không được coi là tự tương thích.
- Chưa thay công thức lương, chưa tự xử lý combo, chưa tự đặt hàng nhà cung cấp hay tạo vận đơn bên ngoài.

## 7. Thứ tự thực hiện và điều kiện qua từng bước

1. **Chuẩn hóa phân loại và mã may:** xuất danh sách rà soát, quản lý xác nhận nhóm may/nhập và ánh xạ kho; chuẩn hóa thuộc tính kỹ thuật, lập quy tắc tự gán mã công Excel và xử lý các trường hợp chưa rõ. Kiểm tra một đơn giá hiệu lực theo mã và đơn vị; không yêu cầu nhóm giá của người làm. Không tự áp chỉ theo từ khóa.
2. **Nối đúng đơn:** dựng kế hoạch và kiểm soát số lượng chung theo dòng; xử lý ID text, dòng trùng và thay đổi đơn; chạy được đơn toàn may bằng cơ chế lệnh hiện có.
3. **Thêm hàng nhập:** giữ tồn, yêu cầu nhập thiếu, nhận từng phần qua kho; thử đơn toàn nhập và cạnh tranh tồn.
4. **Giao hàng chung:** hoàn tất đơn hỗn hợp, giao nhiều đợt, đọc lịch sử cũ không đếm đôi.
5. **Nối chấm công/lương:** từ phần việc may hợp lệ ghi một nguồn sản lượng, tiến độ và tiền công; sau đó hoàn thiện giao diện nhập nhanh theo nhân viên.

Không đưa vào sử dụng đại trà trước khi bước 1–4 đối soát đủ; việc tinh gọn nhập sản lượng không thay thế bước xác định hàng nào thực sự phải may.

## 8. Nghiệm thu

- Phân loại đúng Microfiber và các ruột còn lại, đệm, khăn, divan; “Bảo vệ nệm” không tự bị coi là đệm. SKU trùng bảng giá không bị ghép nhầm.
- Combo hỗn hợp bị yêu cầu Sale tách; không tự sửa giá, thuế hoặc dòng bán. Đơn sau khi tách được đối soát lại trước xác nhận.
- Đơn toàn may, toàn nhập và hỗn hợp đều truy ngược được dòng đơn; thử cả ID UUID và ID text, dòng trùng sản phẩm nhưng khác quy cách.
- Tồn đủ, thiếu một phần, nhập nhiều lần, hàng lỗi, giao nhiều lần; hai quản lý giữ cùng một tồn và hai yêu cầu phân bổ cùng một dòng không được vượt số lượng.
- Bấm lại/retry không tạo trùng kế hoạch, lệnh, chứng từ, phiếu giao hoặc sản lượng lương.
- Đổi/hủy đơn, đổi phân loại, giảm nhu cầu sau khi đã giữ hàng/phát lệnh/nhập/giao phải vào đúng luồng điều chỉnh và giữ lịch sử.
- Xuất kho thủ công không sử dụng được hàng đang giữ cho đơn khác; hủy giữ trả lại đúng số khả dụng.
- Giao cũ và mới được tính đúng một lần. Không hoàn tất đơn khi còn dòng chưa giao; nhập hàng không tự sinh lương sản phẩm.
- Tự gán đúng mã vỏ gối ôm, ga chun luồn thường/can, Microfiber theo kỹ thuật; mã Excel khác SKU vẫn hoạt động. Nhiều SKU cùng công dùng đúng một mã; sản phẩm cùng tên nhưng khác kỹ thuật không bị gán chung.
- Quy tắc trùng, thiếu dữ liệu, sai đơn vị, mã/giá hết hiệu lực, thiếu giá hoặc nhiều giá chồng ngày phải được phát hiện; không tự lấy mã gần giống hay mức giá đầu tiên. Thử nhiều người cùng đơn với sản lượng riêng khác nhau, đổi ngày làm, quy đổi bộ/chiếc đã xác nhận khi cần và chống cộng trùng công đoạn; không chia/nhân tiền theo số người.
- Sửa quy tắc/mã/giá không làm đổi lương lịch sử đã duyệt. API chặn nhân viên đổi mã và chặn hàng nhập sẵn sinh công may.
- Nhân viên chỉ xem/nhận/báo phần việc được phép, không xem lương người khác. Kiểm tra trạng thái tải, trống, lỗi, mất mạng và lưu lại.
- Kiểm tra giao diện desktop 1280px và mobile 390px; chạy TypeScript, lint phần thay đổi, build và các bộ kiểm thử sản xuất/kho/lương liên quan trong môi trường cách ly.

## 9. Ví dụ đích

Đơn gồm 20 vỏ gối, 10 ruột chăn Microfiber, 10 đệm, 30 khăn và 5 ruột gối bông 3D:

- 20 vỏ gối và 10 ruột Microfiber tạo phần việc sản xuất.
- Kho khả dụng có 6 đệm, 30 khăn, 2 ruột gối 3D: giữ các số này cho đơn, yêu cầu nhập thêm 4 đệm và 3 ruột gối 3D.
- Tiến độ sản xuất, nhận hàng và giao hàng cùng hiển thị trên một đơn; có thể giao từng phần theo quyền hiện có.
- Chỉ sản lượng gia công hợp lệ có mã công mới chuyển sang lương; hàng mua không phát sinh tiền công may.


### Cập nhật phạm vi 29/10/2026 — không chia tổ/nhóm giá

- Quyết định người dùng: “ko tân ra tổ , ai may đc số lượng sản phẩm nào thì tính theo số lượng sản phẩm đó”. Quy tắc hiện hành: mỗi người được tính sản lượng hợp lệ thực sự hoàn thành × một đơn giá có hiệu lực của mã công Excel; không chia/nhân theo số người, không chia quỹ công chung, không cấu hình nhóm giá cho nhân viên. Quy đổi đơn vị chỉ dùng khi cần và đã được xác nhận.
- Các đề xuất chưa nghiệm thu 5P.1a/5P.1b/5P.1c về sáu nhóm giá và nhánh gán nhóm giá cho người làm là **SUPERSEDED**. Giữ tài liệu/biên bản lịch sử và checkpoint làm bằng chứng, không coi các nhóm giá là điều kiện còn thiếu của mục 5. Nhóm tổ phục vụ tổ chức công việc, nếu có, không quyết định giá sản lượng.
- Mục 5A về dữ kiện kỹ thuật, yêu cầu mã có phiên bản, ngữ nghĩa/đơn vị và ánh xạ được duyệt giữ nguyên. Còn phải hoàn thiện một giá hiệu lực theo mã và tích hợp việc/người/đơn/ngày/sản lượng; toàn mục 5/5A chưa hoàn tất, chưa mở mục 6 hoặc đưa vào vận hành.
- 5P.1a theo nhóm: **UNRUN, STOPPED_AND_ROLLED_BACK**, không phải PASS. Đã soạn thay đổi nguồn nhưng dừng trước compile, QA, fixture hoặc áp migration. Sáu tệp nguồn được khôi phục đúng hash trước sửa; migration 074 và tệp kiểm thử mới chỉ tồn tại trong checkpoint, đã loại khỏi nguồn hoạt động. Không thay dữ liệu thật/Supabase hoặc kích hoạt hệ thống.
- Bằng chứng: checkpoint `.local-staging-runtime/item5p1a-baseline/stopped-unaccepted/checkpoint.json` SHA256 `682e5e2a62f68b7e710226350667de31256877a4d691570d5c87a023e8b6533a`; rollback `.local-staging-runtime/item5p1a-baseline/rollback-proof.json` SHA256 `dc156a9767f55141b9150ab4f5864f46581ff5cb523198031bfb61084928a23b`; root kiểm lại `.local-staging-runtime/item5-baseline/root-no-groups-scope-and-rollback-proof.json`: khôi phục 6/xóa 2, 199 tệp đã nghiệm thu chỉ có 3 thay đổi tài liệu có chủ đích từ trước, không có drift nguồn ngoài dự kiến.
