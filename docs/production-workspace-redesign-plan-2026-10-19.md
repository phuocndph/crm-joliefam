# Luồng lệnh sản xuất và màn làm việc mới — 19/10/2026

## Phạm vi theo yêu cầu

Thiết kế mục tiêu tại `/production-orders`: tạo lệnh thủ công
hoặc từ đơn bán có sẵn → chuẩn bị/cấp vải → cắt → may → gấp–là → kiểm đếm → nhập
thành phẩm → giao hàng. Mỗi người làm việc trên cùng nguồn lệnh, nhìn thấy đúng
phần việc theo vai trò. Quản lý theo dõi toàn bộ tiến độ, vật tư và kết quả.

Đích triển khai là bản local. Giữ đường thực thi Supabase cũ để tương thích;
không ghi dữ liệu, triển khai migration hoặc đồng bộ ngược lên dịch vụ public.

Tài liệu này xác định kế hoạch và tiêu chí nghiệm thu, không thay thế báo cáo
kiểm chứng. Cập nhật20/10/2026: đã từng sao lưu, diễn tập và kích hoạt058;
hiện tiếp tục batch059 ảnh/hướng dẫn và ngày hiệu lực mã công. Frontend8090
đang dừng trong lúc hoàn thiện mã, API8787 còn listen; chưa kích hoạt059.
UI batch trước đã kiểm trên fixture riêng, không chứng nhận batch mới. Còn
xác nhận trực quan live do browser tool từng từ chối quan sát. Xem báo cáo
`production-workspace-verification-2026-10-19.md` và kế hoạch chi tiết
`production-orders-ux-workflow-plan-2026-10-20.md` cho trạng thái/phạm vi mới.

## Các mặc định nghiệp vụ

- Cho phép chia lô và bàn giao từng phần. Số đạt đã duyệt của bước trước là hạn
  mức cho bước kế tiếp, theo đúng lệnh, lô và dòng sản phẩm.
- Nhân viên nhận việc hoặc được giao trực tiếp. Loại nhân sự tự xác định công
  đoạn: thợ cắt, thợ may, gấp–là, kiểm đếm. Không yêu cầu tự chọn loại chấm công.
- Báo cáo chờ duyệt giữ số lượng đã nhận nhưng chưa mở số lượng cho bước sau.
- Nhân viên may thấy tiền dự kiến khi báo sản lượng. Báo cáo đạt đã duyệt tạo
  đúng một nguồn lương, theo mã tính công Excel và đơn giá hiệu lực ngày làm.
- Gấp–là và kiểm đếm giữ chế độ lương ngày/giờ hiện có; không tự tạo tiền sản phẩm.
- Sửa/làm lại có liên kết báo cáo gốc, mặc định không tạo tiền sản phẩm lần hai.
- Hoàn thành sản xuất sau kiểm đếm và nhập kho; xác nhận đã giao là trạng thái
  riêng. Lệnh nội bộ sản xuất tồn kho không bắt buộc giao khách.
- Lệnh lịch sử giữ quy tắc lịch sử. Lệnh mới sử dụng thế hệ quy trình mới;
  không gán ngầm các bước chưa xảy ra cho lệnh cũ.

## Giao diện và thao tác

Desktop dùng bảng có bộ lọc tìm kiếm, công đoạn, hạn giao và tình trạng xử lý.
Mỗi dòng thể hiện lệnh/đơn nguồn, sản phẩm/quy cách, kế hoạch, tiến độ cắt/may/
gấp–là/kiểm đếm/nhập kho/giao, vướng mắc và tác vụ tiếp theo. Chi tiết mở theo
ngữ cảnh, không bắt người dùng tìm thao tác qua nhiều nhóm tab kỹ thuật.

Mobile dùng thẻ công việc, chữ rõ và nút chính tối thiểu 44 px. Nhân viên chỉ
nhìn việc phù hợp, việc đang làm và lịch sử của mình; thao tác nhận, trả phần
chưa làm, báo cuối ca và sửa/làm lại gắn cùng dữ liệu với mục Công của tôi.

Tạo lệnh có hai nguồn: nội bộ và đơn bán. Đơn bán tiếp tục qua gửi, tiếp nhận
và phân bổ có kiểm soát số lượng; một nhóm sản xuất có thể có nhiều dòng/lô.

### Màn hình theo vai trò

- Quản lý: bảng điều hành; lọc thiếu vải, chờ nhận, đang làm, chờ duyệt, cần sửa,
  quá hạn, chờ nhập và chờ giao. Nút chính dẫn đúng công việc tiếp theo.
- Nhân viên: việc có thể nhận, đang làm và đã báo. Loại công việc lấy từ hồ sơ
  đã cấu hình, không để nhân viên tự chọn vai trò hay đơn giá.
- Thợ cắt thấy vải, màu/khổ, mét cần cắt, đã cấp và quy cách. Thợ may chỉ thấy
  số đã cắt đạt và được mở/giao; gấp–là và kiểm đếm theo cùng quy tắc bàn giao.
- Kho/người giao có quyền riêng cho cấp vải, nhập thành phẩm, xuất giao và xác
  nhận nhận hàng. Tổ trưởng duyệt trong phạm vi tổ, không mặc nhiên có quyền kho.

Biểu mẫu tạo lệnh gồm nguồn đơn, các dòng sản phẩm/màu/cỡ, số lượng, hạn giao,
ảnh/hướng dẫn kỹ thuật và mã tính công. Lưu nháp rồi phát hành sau kiểm tra sẵn
sàng. Đơn bán chỉ phân bổ phần chưa tạo lệnh, không nhân đôi số lượng.

### Mặc định và quyết định cần chốt trước vận hành

- Bàn giao từng phần; báo chờ duyệt chưa được chuyển sang bước sau.
- Quản lý giao trực tiếp hoặc mở việc cho đúng nhóm nhận. Máy chủ giữ hạn mức
  khi nhiều người thao tác cùng lúc.
- Tiền hiện ngay dưới nhãn dự kiến/chờ duyệt; chỉ số đạt được duyệt mới ghi nhận
  vào lương. Không coi đó là thực lĩnh hoặc đã thanh toán.
- Chưa tự tính thêm công sửa hàng. Nếu trả công sửa, cần quy chế và nguồn lương
  riêng, không cộng ngầm vào sản lượng ban đầu.
- Cần xác nhận người duyệt từng công đoạn, quyền nhập dự toán thủ công, mức hao
  hụt, xử lý thiếu/hỏng và bằng chứng giao hàng.
- Quy tắc cấp bù/trả dư/quyết toán vật tư cần chốt trước khi dùng tính giá vốn;
  không suy ra tiêu hao thực tế bằng một con số nhập tay.

### Trình tự triển khai

1. Dữ liệu nền: nhân viên–tài khoản–tổ, quyền, mã tính công Excel, đơn giá hiệu
   lực, sản phẩm/quy cách, liên kết vải/kho và định mức.
2. Tạo lệnh và bảng điều hành: thủ công/đơn bán, nháp/phát hành, dòng/lô, tiến độ
   và tác vụ tiếp theo; giữ lệnh lịch sử không đổi quy trình.
3. Dự toán/cấp vải và cắt: kiểm tồn, thiếu vật tư, cấp/trả, nhận và báo cắt.
4. May và tiền công: cuối ca báo đạt/sửa/hỏng, duyệt, tính theo mã Excel một lần;
   cập nhật tổng ngày/tháng trong cùng luồng.
5. Gấp–là, kiểm đếm và trả sửa truy vết, kể cả nhiều vòng và hỏng khi sửa.
6. Nhập thành phẩm, xuất từng phần và xác nhận giao; tách hoàn thành sản xuất
   với giao xong; lệnh tồn kho không bắt buộc giao khách.
7. Nghiệm thu theo vai trò/kích thước màn hình; sao lưu local, cập nhật API sau
   khi đạt kiểm chứng, kiểm tra dữ liệu cũ và khả năng khôi phục. Không tự triển
   khai VPS hay ghi lên Supabase trong công việc này.

## Nguồn dữ liệu và bất biến

Tái sử dụng đơn bán, lệnh, dòng lệnh, lô, `local_assignments`, công việc mở,
`local_production_stage_events`, `local_production_entries`, dự toán cắt và sổ
kho hiện có. Các bảng nhập thành phẩm và chứng từ giao bổ sung liên kết truy
xuất; không tạo bộ đếm tiến độ hoặc số dư kho nhập tay song song.

1. Số lượng ở mỗi bước không vượt phần đã duyệt của bước trước trừ số giữ chỗ.
   Kiểm tra cả công việc mở, giao chờ nhận, nhận thực tế và báo cáo chờ duyệt.
2. Mét vải dự kiến, số xuất ròng và số trả dư có nhãn riêng, lấy từ dự toán và
   chứng từ/movement. Không ghi trực tiếp số dư hoặc quy đổi kg/m thiếu định mức.
3. Duyệt, đảo, nhập thành phẩm, xuất giao và nhận việc chạy nguyên tử, có khóa
   chống gửi lặp, quyền ở máy chủ và audit. Phép tính dùng numeric SQL.
4. Đảo kết quả phải kiểm tra phần công đoạn sau đã giữ/nhận, thành phẩm nhập,
   nguồn lương và kỳ đã khóa; không âm thầm xóa hoặc điều chỉnh lịch sử.
5. Nhập thành phẩm tạo phiếu RECEIPT, dòng, movement và output trong cùng giao
   dịch; hạn mức bằng kiểm đếm đạt đã duyệt trừ lượng đã nhập trước đó.
6. Giao hàng truy được output/lô/dòng đơn bán và phiếu ISSUE. Tổng giao không
   vượt lượng đã nhập chưa giao, tồn kho và lượng còn phải giao của dòng đơn.
   Xác nhận nhận hàng không tạo thêm movement xuất.
7. Tiền công chỉ cho phép nhân viên đọc nguồn của chính mình. Giá vốn, lương
   người khác, bảng quản lý và dữ liệu ngoài tổ không được gửi cho API self.
8. Hoàn thành lệnh không tạo thêm output đã nhập. Không chốt khi còn việc dở,
   báo cáo chờ duyệt, sửa/làm lại, phiếu nháp hoặc lượng chưa đối chiếu.

## Phần mã và database dự kiến ảnh hưởng

- Migration local nối tiếp sau 057: công đoạn mới, liên kết output/phiếu nhập,
  chứng từ giao hàng, khóa ngoại, ràng buộc và chỉ mục. Không sửa migration cũ.
- `server/production-dispatch.ts`: công đoạn, loại nhân sự, quota, read self và
  kiểm soát đảo, giữ cơ chế tạo nguồn lương may hiện có.
- Module workspace local: bảng tiến độ có quyền, nhập thành phẩm, giao/nhận
  hàng và audit; đăng ký với server qua cùng cơ chế auth/transaction hiện có.
- `server/index.ts`: điểm đăng ký, tạo lệnh mới, điều kiện chốt và đọc output.
- Local API/types, local workspace page/components, route và menu đúng vai trò.
- Supabase page hiện có giữ làm đường tương thích riêng.

## Mốc triển khai và bằng chứng nghiệm thu

| Yêu cầu | Bằng chứng cần có |
| --- | --- |
| Tạo thủ công và từ đơn bán | Thao tác thật trên fixture; nguồn/dòng/quota truy xuất đúng |
| Tính và cấp vải | Dự toán duyệt, phiếu xuất/trả và movement liên kết đúng lô |
| Cắt → may → gấp–là → kiểm đếm | API chặn vượt/bỏ bước; nhận và báo từng phần được |
| Cuối ca và tiền may | Một duyệt tạo một nguồn lương; retry/sửa không nhân đôi |
| Nhập thành phẩm | Nhập 3 rồi 7 cho kế hoạch 10; ledger/output cùng 10; 11 bị chặn |
| Hoàn thành sản xuất | Chỉ may xong chưa chốt được; đủ các bước/nhập kho chốt được |
| Giao từng phần | Hai lần giao có nguồn lô và phiếu xuất; không vượt lượng hoặc trừ kho hai lần |
| Lệnh tồn kho | Nhập/chốt được mà không cần đơn bán hoặc giao hàng |
| Quyền | Worker sai loại/ngoài phạm vi không nhận, sửa, duyệt hoặc đọc dữ liệu người khác |
| Đồng thời và retry | Hai người nhận/giao cùng phần không vượt; retry trả đúng kết quả gốc |
| Responsive | Kiểm tra desktop, tablet và mobile; form không tràn/đè chữ, thao tác đúng vai trò |
| Tương thích | Lệnh cũ và đường Supabase cũ không bị áp ngầm quy tắc quy trình mới |

Kiểm thử nghiệp vụ dùng database/API riêng, đồng bộ tắt, không dùng dữ liệu
kinh doanh để tạo đơn hoặc duyệt thử. Kiểm TypeScript app/server, lint phần sửa,
build, suite giao việc và Sale → sản xuất hiện có, cùng suite mới end-to-end.
Kết quả thực tế sẽ ghi trong báo cáo triển khai; tài liệu kế hoạch này không
được dùng thay cho bằng chứng hoàn thành.
