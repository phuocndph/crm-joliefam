# Kế hoạch UX/UI và nghiệp vụ lệnh sản xuất — 20/10/2026

## Mục tiêu và phạm vi

Một nơi làm việc tại `/production-orders`, dùng chung dữ liệu từ đơn bán đến
giao hàng. Giao diện và nút thao tác thay đổi theo quyền, tổ và loại nhân viên
đã cấu hình; không bắt nhân viên tự chọn nghề hoặc cách tính lương.

Luồng chính:

Tạo lệnh → chuẩn bị/cấp vải → cắt → may → gấp–là → kiểm đếm → nhập thành phẩm
→ xuất giao → xác nhận giao xong.

Nhập thành phẩm là điểm kiểm soát kho phía sau kiểm đếm, không phải một biểu
mẫu chấm công mới cho công nhân. Có thể giao từng phần theo số đã nhập.

Đây là kế hoạch và tiêu chí nghiệm thu, không phải xác nhận hoàn thành.
Goal tiếp tục triển khai theo kế hoạch đã được xác nhận. Repository đã có
phần triển khai nền và một batch bổ sung đang dở; cần đối chiếu, hoàn thiện
và kiểm chứng thay vì viết lại toàn bộ hoặc xóa dữ liệu cũ. Không kích hoạt
batch dở hoặc triển khai VPS; migration local chỉ sau review, sao lưu và
diễn tập đạt trên bản sao.

### Cập nhật triển khai mới nhất

Đợt riêng21/10 đã được duyệt “bắt đầu4mục”: sửa đường vào chỉ-duyệt đã
freeze/review source, TypeScript/lint/build và cô lập1904checks/restart57
đạt; lượt giữQA1943/restart58, legacy310 và Sale512 cũng đạt. Không còn
P1/P2 trong phạm vi5file sửa theo reviewer. Chưa nghiệm thu UX thực do
frontendQA bị policy từ chối khởi tạo; không đi đường vòng. Source-only060
gate đã dừng exit1 vì live có phiên đổi và yêu cầu Sale mới11dòng so với
baseline cũ; không nới gate/xóa dữ liệu, chưa kích hoạt source mới.
Chi tiết: `production-review-access-batch-2026-10-21.md`.
Các đoạn repair2 dưới là lịch sử, không phải finding chỉ-duyệt còn mở ở mã.

Repair2 đã freeze32file, đạt kiểm tĩnh/build và kiểm thử cô lập workspace1801,
dispatch310, Sale512checks kèm restart. Review cuối còn P2: tài khoản chỉ
quyền duyệt có API nhưng không vào hàng đợi từ workspace. Chưa kích hoạt;
frontend8090 vẫn dừng, API repair1/database giữ nguyên. Theo giới hạn hai
vòng sửa, ghi finding cho đợt xử lý riêng, không tự nới quyền hoặc mở vòng3.
UI thực375/768/1440 và lifecycle vẫn chưa nghiệm thu. Các mốc dưới là lịch sử.

Batch060 repair1 đã đạt review source, TypeScript/lint phạm vi và kiểm thử
cô lập1.480HTTP, restart49lệnh. Giới hạn hủy phần chưa cắt chỉ sau phát hành;
nháp chưa phát sinh dùng hủy toàn lệnh. Chưa diễn tập060 trên clone hoặc kích
hoạt trên database đang dùng. Các trạng thái trong mục6 là mốc bàn giao cũ.

UX mục8 đã đóng bản sửa vòng1 và review source: mở đúng ngữ cảnh công đoạn,
tồn sổ theo kho, tạm dừng/tiếp tục có lý do, bảng nhân viên, báo nhiều việc
cuối ca và duyệt nhanh. Kiểm cô lập1.580HTTP/restart51lệnh, queue14ca,
auth10ca và build đã đạt. Diễn tập060 trên clone059 và gate dữ liệu live
READ ONLY trước/sau059+060 đạt; đã kích hoạt local workspace5 tại8787 và
frontend8090. HTTPsmoke đạt, dữ liệu cũ giữ nguyên. Chưa chứng nhận giao diện
desktop/mobile mới. Các mốc lịch sử phía dưới không phải trạng thái mới nhất.

Rà nghiệm thu đầy đủ sau kích hoạt mở bounded repair2 ở mục9. Frontend đã
tạm dừng có kiểm sở hữu trước chỉnh; API/database060 giữ nguyên. PASS repair1
không chứng nhận bản repair2 chưa freeze.

## 1. Thiết kế màn hình

### Quản lý: một bảng điều hành

- Thanh trên: tìm mã lệnh/đơn bán/sản phẩm, bộ lọc hạn giao, công đoạn và vấn đề;
  nút chính **Tạo lệnh** với hai lựa chọn **Tạo thủ công / Từ đơn hàng**.
- Nhóm lọc nhanh: Tất cả, Thiếu vải, Chờ cắt, Chờ may, Gấp–là, Kiểm đếm,
  Chờ nhập/giao, Cần xử lý. Các nhóm có thể trùng nhau khi bàn giao từng phần.
- Bảng desktop: mã lệnh/đơn nguồn, sản phẩm–quy cách, kế hoạch, vải,
  cắt, may, gấp–là, kiểm đếm, nhập/giao, hạn, việc tiếp theo.
- Mỗi công đoạn hiển thị số đạt/kế hoạch và dấu chờ duyệt; không chỉ một màu
  trạng thái cho cả đơn. Bấm ô công đoạn để mở đúng chi tiết liên quan.
- Chi tiết có thông tin sản phẩm/ảnh/hướng dẫn, tiến độ, vật tư, phân công,
  báo cáo chờ duyệt và lịch sử. Chỉ đưa thao tác cần làm lên vùng chính.
- Không xếp nhiều banner, thẻ thống kê hay phần giải thích lặp lại trên bảng.

### Nhân viên: ba nhóm rõ ràng

**Việc có thể nhận / Đang làm / Đã báo**. Mỗi thẻ có mã lệnh, ảnh, sản phẩm,
màu/cỡ/quy cách, số lượng, hướng dẫn, hạn và một nút chính phù hợp trạng thái.

Desktop có bảng gọn; điện thoại dùng thẻ, chữ chính 16–18px, nút tối thiểu
44–48px, không bắt kéo ngang để tìm nút nhận hoặc báo sản lượng. Form giữ dữ
liệu khi lưu lỗi, chặn gửi lặp và không thông báo thành công trước máy chủ.

## 2. Nghiệp vụ từng bước

| Bước | Người thực hiện | Thao tác và dữ liệu chính | Điều kiện bàn giao |
| --- | --- | --- | --- |
| Tạo lệnh | Quản lý; Sale gửi đơn nguồn theo quyền | Tạo thủ công hoặc lấy phần chưa phân bổ của đơn bán; nhập nhiều dòng sản phẩm/màu/cỡ, số lượng, ngày, ưu tiên, ảnh và hướng dẫn | Lưu nháp; kiểm sẵn sàng trước phát hành |
| Chuẩn bị vải | Quản lý hoặc người cắt có quyền lập dự toán | Chọn mã vải/biến thể từ quản lý vải, kho, đơn vị, định mức hoặc dự toán có lý do; tính mét cần, tồn khả dụng, thiếu, đã cấp và trả dư | Dự toán được duyệt; xuất vải có chứng từ; đủ điều kiện mở cắt |
| Cắt | Thợ cắt được giao hoặc nhận việc mở | Xem mét vải, màu/khổ, quy cách, kho, ảnh; nhận số lượng; báo đạt, sửa/hỏng và lý do | Số cắt đạt được duyệt mở hạn mức may |
| May | Thợ may đúng tổ | Chỉ thấy phần đã cắt đạt và đã mở/giao; nhận một phần; cuối ca nhập sản lượng theo lệnh/dòng/ngày | Số may đạt được duyệt mở gấp–là và tạo một nguồn tiền công |
| Gấp–là | Nhân viên gấp–là | Nhận phần may đạt; báo đạt, cần sửa, hỏng | Số đạt được duyệt mở kiểm đếm |
| Kiểm đếm | QC/nhân viên kiểm đếm | Đối chiếu lệnh, màu/cỡ, số đạt/thiếu/lỗi; trả sửa có lý do và truy vết | Số đạt được duyệt cho phép nhập thành phẩm |
| Nhập/giao | Kho và người giao có quyền | Nhập đúng lô/dòng/kho; xuất giao từng phần; ghi người nhận, ngày và bằng chứng giao | Không vượt số đã nhập, tồn kho hoặc số còn phải giao; xác nhận nhận hàng không trừ kho lần nữa |

### Tạo lệnh và ảnh kỹ thuật

- Sản phẩm và vải dùng danh mục đang có, không tạo danh mục riêng cho sản xuất.
- Mã sản phẩm tính công theo bảng Excel, không thay bằng SKU bán hàng.
- Ảnh chọn từ thư viện sản phẩm, đề xuất tối đa 8 ảnh mỗi dòng; hướng dẫn gồm
  mức toàn lệnh, dòng sản phẩm và công việc cụ thể.
- Cho sửa nội dung kế hoạch khi còn nháp nếu chưa có ràng buộc phát sinh;
  phát hành thì khóa bản tham chiếu. Đổi ảnh trong danh mục sau đó không được
  làm thay đổi ảnh của lệnh đã phát hành.
- Thay đổi sau phát hành cần quyền, lý do và lịch sử; không sửa ngầm lệnh cũ.

### Vải và dự toán

- Hiển thị riêng **Cần dự kiến / Đã cấp / Đã trả / Còn cần cấp**.
- Không mặc định vải nào cũng tính bằng mét: khác đơn vị cần quy đổi được
  duyệt. Không tự suy ra mét từ kg hoặc từ số sản phẩm khi thiếu định mức.
- Phân biệt người lập dự toán, người duyệt và người có quyền xuất kho.
- Tiêu hao thực tế theo chứng từ xuất/trả và quy tắc quyết toán, không lấy
  một con số nhập tay để ghi đè số dư kho hoặc giá vốn.

### Báo sản lượng và tiền công

- Nhân viên chỉ nhập ngày làm, số đạt, số cần sửa/hỏng và ghi chú cần thiết.
  Lệnh, sản phẩm, mã tính công, đơn vị và đơn giá được hệ thống xác định.
- Màn báo cuối ca có các việc đang nhận; không chọn lại mã lệnh từ đầu.
- Tiền dự kiến = số đạt × đơn giá hiệu lực theo ngày làm và hồ sơ áp dụng.
  Thiếu mã/giá phải báo rõ, không im lặng dùng giá 0 hoặc giá hôm nay.
- Hiện ba nhãn riêng: **Dự kiến / Chờ duyệt / Đã duyệt**; tổng ngày và tháng
  dùng cùng nguồn dữ liệu với bảng lương, không cộng thêm một bảng độc lập.
- Đã duyệt không đồng nghĩa thực lĩnh/đã trả: vẫn còn phụ cấp, bảo hiểm,
  khấu trừ và chốt kỳ theo phân hệ lương hiện có.
- Công đoạn khác giữ chế độ lương đã cấu hình; không mặc định ai cũng ăn
  lương sản phẩm. Công sửa không trả trùng, trừ khi có quy chế riêng được duyệt.

## 3. Quy tắc chống sai số và xử lý ngoại lệ

1. Bàn giao từng phần: ví dụ kế hoạch 100, cắt đạt đã duyệt 40 thì mở may tối
   đa 40; còn 60 vẫn ở cắt. Không ép cả đơn có duy nhất một trạng thái.
2. Báo chờ duyệt giữ phần đã nhận nhưng chưa mở số cho bước sau; hai người
   nhận cùng lúc hoặc bấm lặp không được vượt hạn mức.
3. Có trả phần chưa làm, tạm dừng, thiếu vật tư, báo sai, từ chối duyệt,
   trả sửa, hỏng không sửa được và hủy phần chưa thực hiện.
4. Sửa/làm lại phải tham chiếu báo cáo gốc; không tạo thêm hàng hoặc tiền
   chỉ vì hàng đi qua công đoạn lần hai.
5. Đảo kết quả đã duyệt phải kiểm tra bước sau, kho và kỳ lương khóa. Có phát
   sinh thì dùng quy trình điều chỉnh phù hợp, không xóa lịch sử.
6. Hoàn thành sản xuất khác giao xong; lệnh làm hàng tồn kho không cần giao khách.
7. Quyền kiểm ở API, không chỉ ẩn nút. Nhân viên không xem lương người khác,
   giá vốn, dữ liệu ngoài tổ hoặc tự nhận sai loại công việc.
8. Lệnh cũ giữ dấu quy trình lịch sử; không tự gán là đã gấp–là/kiểm đếm khi
   dữ liệu cũ chưa có bằng chứng.

## 4. Lộ trình thực hiện

### Mốc 0 — Ổn định bản đang phát triển

Chưa kích hoạt phần hủy chưa cắt đang dở. Khi được duyệt triển khai, hoàn thiện
đồng bộ contract API, kiểu dữ liệu, giao diện và launcher; kiểm TypeScript,
review và kiểm thử trên database riêng trước khi khởi động bản cập nhật.
Không dùng kết quả kiểm batch059 để chứng nhận batch060 hoặc toàn bộ luồng.
Giữ nguyên mọi thay đổi hiện có; không tự rollback, sửa tài khoản hoặc chạy
migration trên database đang dùng trong lượt lập kế hoạch.

### Mốc A — Chốt dữ liệu nền và mẫu màn hình

Rà liên kết tài khoản–nhân sự–tổ–vai trò, mã công Excel/đơn giá/ngày hiệu lực,
danh mục sản phẩm/vải/kho, quyền lập/duyệt/cấp vải. Dựng bảng quản lý và thẻ
nhân viên bằng dữ liệu kiểm thử. Chốt người duyệt và quy tắc ngoại lệ trước
khi sử dụng thực tế, không tự gán hàng loạt.

### Mốc B — Tạo lệnh → vải → cắt → may

Làm hoàn chỉnh một lát cắt: tạo nhiều dòng từ hai nguồn, nháp/phát hành,
ảnh/hướng dẫn, dự toán–cấp–trả, nhận/báo cắt, mở may từng phần, báo cuối ca và
tiền công. Đây là phần ưu tiên nghiệm thu đầu tiên, không làm giao diện tất
cả công đoạn trước khi kiểm được số lượng và tiền của một lệnh.

### Mốc C — Gấp–là → kiểm đếm → nhập/giao

Hoàn thiện chuyển bước, trả sửa, nhập kho từng phần, xuất giao và xác nhận.
Giữ liên kết mã lệnh/dòng/lô xuyên suốt để truy được ai làm, số nào và chứng từ nào.

### Mốc D — Làm gọn và kiểm chứng đầy đủ

Kiểm từng vai trò trên desktop/mobile; các trạng thái tải/rỗng/lỗi/mất quyền,
retry, đồng thời, sai ngày giá, thiếu vải, thiếu cấu hình, sửa nhiều vòng và
kỳ lương đã khóa. Rà tương thích lệnh lịch sử và đường backend cũ.

### Mốc E — Đưa vào local an toàn

Sao lưu, diễn tập migration trên bản sao, kiểm hash/số dòng dữ liệu cũ, review
cùng một diff đã đóng, sau đó mới kích hoạt local và xác nhận màn hình thực.
VPS/Supabase/public là bước riêng, cần yêu cầu triển khai riêng.

## 5. Tiêu chí nghiệm thu

- Đơn thử 100: cắt duyệt 40 → may chỉ nhận tối đa 40; các bước sau tuân theo
  số đạt đã duyệt tương tự, không chặn bàn giao từng phần.
- Hai nhân viên nhận cùng lúc không vượt phần còn lại; gửi báo/duyệt lại
  không nhân đôi tiền công. Nhập/giao đồng thời không vượt lượng hoặc trừ kho lặp.
- Một nhân viên báo nhiều dòng cuối ca: tiền ngày/tháng và nguồn bảng lương
  đối chiếu được theo đúng mã Excel, ngày hiệu lực, không theo SKU.
- Thiếu vải, cần sửa, thiếu đơn giá hiện rõ lý do và người cần xử lý.
- Thợ may không thấy việc chưa cắt đạt; người khác công đoạn/tổ không nhận được
  việc qua cả UI lẫn gọi API trực tiếp.
- Ảnh/hướng dẫn có trước và sau nhận việc; thay ảnh danh mục không đổi lệnh
  đã phát hành. Lệnh lịch sử không bị backfill bằng dữ liệu hiện tại.
- Desktop cuộn trong bảng, cột cố định không đè chữ. Mobile thao tác nhận,
  báo cuối ca và xem tiền không cần kéo bảng rộng.
- Có bằng chứng TypeScript/build/lint phần sửa, kiểm thử nghiệp vụ cô lập,
  quyền, retry/đồng thời, đối chiếu kho/lương và kiểm màn hình thực.

## 6. Hiện trạng cần phân biệt với kế hoạch

Nền workspace, bốn công đoạn, liên kết vật tư và nguồn lương đã có trong mã;
không cần tạo hệ thống thứ hai. Route local dùng `ProductionWorkspacePage`,
route backend cũ giữ `ProductionOrdersPage`.

Theo bàn giao kiểm chứng trước lượt lập kế hoạch này:

- Batch059 ảnh/hướng dẫn và đơn giá theo ngày đã đóng kiểm chứng ở mức
  source/test/clone: 942 HTTP checks, restart25, TypeScript/lint/build và review
  đạt. Đây là bằng chứng lịch sử của batch059, không phải kết quả mới của lượt này.
- Database đang dùng vẫn058; clone diễn tập đã059. Không kích hoạt059/060
  hoặc thay đổi runtime trong lượt lập kế hoạch.
- Batch060 hủy phần chưa cắt đã tiếp tục sau xác nhận goal: đang hoàn thiện
  contract API SELF/manager, UI, launcher, action và types trên cùng diff.
  Chưa freeze, chưa đạt kiểm chứng nghiệp vụ, không được kích hoạt.
- UX còn phải hoàn thiện: tồn/thiếu vải theo kho trước cấp; bấm công đoạn mở
  đúng ngữ cảnh; tạm dừng/tiếp tục; hạn việc mở; bảng desktop cho nhân viên;
  chọn mã công theo ngày độc lập cho form mở việc của đường cũ.
- Chưa có nghiệm thu màn hình thực cho bản mới. Kiểm HTTP/source hoặc ảnh QA
  cũ không thay thế bằng chứng desktop/mobile hiện tại.

## 7. Mặc định đề xuất để chốt khi duyệt kế hoạch

- Mọi công đoạn bàn giao từng phần sau khi người có quyền xác nhận số đạt;
  không tự mở bước sau chỉ từ báo cáo nhân viên chưa duyệt. Có màn duyệt nhanh
  nhiều dòng để quản lý không phải mở từng lệnh.
- Một tài khoản có thể có nhiều quyền nhưng chỉ nhận công việc phù hợp hồ sơ
  và phạm vi tổ được cấu hình. Không yêu cầu nhân viên tự chọn chế độ lương.
- Tiền cập nhật ngay là tiền dự kiến/chờ duyệt; chỉ số đạt đã duyệt tạo nguồn
  lương. Thiếu mã tính công hoặc giá hiệu lực phải hiện rõ và không mặc định0.
- Cắt, gấp–là và kiểm đếm dùng chế độ lương đã cấu hình; chỉ tính công sản phẩm
  nếu có chính sách được duyệt, không mặc định tất cả theo đơn giá may.
- Số đã nhận chưa làm có thể trả lại; hàng sửa và hỏng thực tế ghi riêng. Hủy
  phần chưa cắt giữ kế hoạch gốc, không biến phần hủy thành phế phẩm, không tự
  hoàn vải hoặc giảm số lượng khách đã đặt.
- Duyệt dự toán, duyệt kết quả và xác nhận kho là các quyền riêng; dùng hệ
  thống tài khoản/phân quyền hiện có, không tạo cơ chế đăng nhập mới.
- Triển khai và nghiệm thu trên local trước; giữ tương thích dữ liệu lịch sử
  và backend cũ. VPS/public/Supabase không thuộc bước lập kế hoạch này.

## 8. Chi tiết đợt UX tiếp theo sau khi batch060 đạt kiểm chứng

Không cần thêm migration chỉ để làm gọn giao diện. Tái sử dụng API báo/duyệt
từng dòng và quyền domain hiện có; không nới quy tắc lương hoặc kho để lưu được.

- Bấm ô công đoạn hoặc việc tiếp theo truyền context section/stage/lô/dòng
  sang chi tiết, điền sẵn giao việc. Mở chi tiết không tự thực hiện nghiệp vụ.
- Tạm dừng/tiếp tục có lý do, quyền production_manage tại máy chủ, không cho
  employee/team_leader chuyển trạng thái qua gọi API trực tiếp. Yêu cầu Sale
  ADJUSTMENT_REQUIRED tiếp tục chặn resume. Không mở lại lệnh đã chốt.
- Tồn vải lấy đúng cặp vật tư/kho từ movement, chỉ trả số lượng cần cho dự toán
  đang xem; không gọi broad inventoryBalances hoặc gửi giá vốn xuống planner.
  Dùng nhãn Tồn sổ tại kho, không khẳng định đã trừ giữ chỗ. Xác nhận phiếu vẫn
  kiểm tồn nguyên tử; số xem trước không phải cam kết giữ hàng.
- Việc mở hiện ngày bắt đầu và hạn nhận. Desktop dùng bảng, mobile giữ thẻ
  và nút lớn; ảnh/hướng dẫn/lịch sử mở theo nhu cầu từ cùng một nguồn dữ liệu.
- Báo cuối ca nhiều việc chỉ lấy assignment đã nhận, còn lượng và đang hoạt
  động. Mỗi dòng có ngày, số đạt, tiền xem trước; sửa/hỏng/ghi chú mở rộng.
  Gửi tuần tự từng dòng qua API hiện có, trạng thái chưa gửi/đang gửi/đã gửi/lỗi.
  Nếu chỉ3/5 thành công phải báo đúng3/5, khóa dòng thành công, giữ draft và
  retry cùng nội dung/khóa ở dòng lỗi. Không quảng cáo lưu tất cả nguyên tử.
  Lỗi mạng chưa rõ kết quả không cho đổi payload rồi gửi khóa mới khi chưa
  đối chiếu kết quả cũ. Refresh quota/tiền không xóa draft chưa gửi.
- Quản lý chọn báo cáo chờ duyệt trong đúng context để duyệt nhanh. Không tự
  chọn báo cáo do mình tạo; từng dòng có kết quả/retry riêng và không bỏ qua
  quyền, phạm vi ngày/tổ hoặc kỳ lương đã khóa. Từ chối cần lý do.
- Form mở việc legacy tải mã công theo ngày/công đoạn của chính form đó,
  độc lập form giao trực tiếp; reset mã khi đổi ngày, chặn response cũ, có
  loading/error/retry và không gửi mã ngoài kết quả hợp lệ.

Nghiệm thu từng vai trò, bàn phím và375/768/1440px bằng màn hình thực sau khi
runtime sẵn sàng. Do công cụ quan sát browser từng bị policy từ chối, không
dùng đường vòng; cần phương thức quan sát được phép hoặc xác nhận trực tiếp
từ người dùng. Kiểm HTTP/source không thay thế kiểm giao diện.

## 9. Repair2 từ rà nghiệm thu đầy đủ kế hoạch

Không thêm migration, không đổi hạn mức công đoạn, công thức/nguồn lương,
quyền duyệt hoặc cách ghi ledger kho. Đây là vòng sửa thứ2 của NextUX;
finding còn lại sau vòng này phải báo rõ, không lặp sửa vô hạn.

- Lọc từng công đoạn độc lập với nhãn việc tiếp theo. Một dòng có thể thuộc
  Cắt và May cùng lúc khi bàn giao từng phần; có báo chờ duyệt không làm nó
  biến mất khỏi công đoạn liên quan. Dùng cùng predicate đã kiểm trên helper
  thật, không sao chép thuật toán riêng trong test.
- Trả số báo SUBMITTED theo stage, đúng order/batch/item, từ bảng báo hiện có;
  giữ tổng pending_reports, không lưu bộ đếm riêng. Desktop/mobile hiện số
  đạt/kế hoạch và dấu chờ duyệt tại từng ô, bấm mở đúng context.
- Hồ sơ đúng một nhân sự active vẫn có Công việc của tôi kể cả modeOPERATIONS
  do quyền lập dự toán/kho. Giữ bảng nghiệp vụ của họ, không nới quyền điều
  hành. Không tự chọn giữa nhiều hồ sơ, không tạo/liên kết tài khoản tự động;
  thiếu hoặc trùng hồ sơ có hướng dẫn cấu hình rõ ràng.
- Duyệt nhanh nhiều lệnh từ màn chính, không bắt mở từng chi tiết. Chỉ đọc
  báo SUBMITTED đúng quyền review và phạm vi từng nhân sự/ngày; loại báo do
  chính người duyệt tạo. Từng dòng vẫn gửi qua API review hiện có, kiểm lại
  quyền/ngày/kỳ khóa, idempotency và actor/session. Có giới hạn/phân trang
  rõ ràng, không ngầm gọi một trang dữ liệu là tất cả báo cáo.
- Báo chờ duyệt của lệnh/lô đã tạm dừng, hoàn thành hoặc hủy vẫn cần đường
  xử lý rõ ràng: chỉ cho từ chối kèm lý do, mặc định từ chối và không cho
  duyệt đạt. Bộ dựng payload cũng chặn duyệt đạt, không chỉ vô hiệu hóa nút.
  API review hiện có vẫn kiểm lại quyền, ngày, kỳ lương và trạng thái; không
  thay đổi quyền máy chủ. Báo sản lượng mới vẫn chỉ từ công việc đang hoạt động.
- Gộp thao tác tạo thủ công/từ đơn bán trong menu Tạo lệnh khi tài khoản có
  các quyền tương ứng; giữ đường truy cập hàng đợi Sale đúng quyền.
- Đóng cùng một diff cho review/test: stage membership chồng nhau, pending
  đúng phạm vi/công đoạn, CUTTER+planner vẫn nhận/báo, deny quản lý, reviewqueue
  đa lệnh/tổ/ngày, self-review, retry/phân trang và không lộ dữ liệu ngoài quyền.
  Chạy lại kiểm tĩnh/build và hồi quy cô lập trên bản freeze cuối.
- Vì clone/live đã060, diễn tập lại mã mới là source-only trên clone060:
  đối chiếu toàn bộ129bảng/cột/hash/count/sequence/ledger với report060 đã đạt;
  chỉ cập nhật source manifest sau review/test, không áp lại058/059/060.
  Local restart chỉ sau gate trước/sau đạt và sao lưu vẫn xác minh được.

React lifecycle/CAS, rate-form stale/loading/error và UI375/768/1440/bàn phím
vẫn cần phương thức kiểm được phép. Không dùng SSR hoặc mock auth để thay
thế nghiệm thu thao tác thật, không cài dependency ngoài phạm vi để né chặn.
