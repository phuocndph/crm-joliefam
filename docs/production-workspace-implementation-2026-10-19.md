# Triển khai màn điều hành sản xuất local — 19/10/2026

## Trạng thái mới nhất — 20/10/2026

Đã kích hoạt source mới trên loopback8090/API8787 và migration058 trên
`crm_local`. Fingerprint trước/sau nâng cấp xác nhận dữ liệu124bảng cũ,
sequence, tài khoản/quyền và lịch sử không đổi; thêm4bảng mới rỗng.
Vẫn4lệnh lịch sử và43workers. Sync/demo/integration tắt trong lần chuyển.

Chạy lại workspace616HTTP + restart14lệnh và TypeScript app/server PASS.
Review helper Vite `envFile:false` PASS; frontend chỉ có cấu hình local chủ
động, không thừa kế biến Supabase cũ. Không deploy VPS hoặc ghi Supabase.

Chưa chốt nghiệm thu phiên live sau đăng nhập vì browser tool từ chối quan
sát URL ở lượt cuối. UI đã kiểm trên fixture riêng; HTTP/module/proxy live
đạt nhưng không được coi thay cho thao tác trình duyệt live. Chi tiết bằng
chứng và giới hạn: `production-workspace-verification-2026-10-19.md`.

## Phạm vi mã đã triển khai

`/production-orders` chọn màn local `ProductionWorkspacePage`; đường Supabase
tiếp tục dùng `ProductionOrdersPage`. `/production-orders-legacy` là lối tiếp tục
lệnh lịch sử. Không tự biến lệnh cũ thành các công đoạn chưa thực hiện.

Lệnh mới từ tạo thủ công, tạo nhóm hoặc phân bổ yêu cầu Sale dùng
`WORKFLOW_V3`, do máy chủ xác định. Luồng gồm cắt → may → gấp–là → kiểm đếm,
nhập thành phẩm từng phần và xuất giao/khách nhận từng phần. Chốt sản xuất
độc lập với giao hàng. Lệnh nội bộ không bắt buộc có đơn bán.

Migration local nối tiếp `058_local_production_workspace.sql` mở rộng các
bảng giao việc hiện có, thêm liên kết output tới phiếu nhập/movement, ánh xạ
sản phẩm với thành phẩm kho, phiếu giao và phiếu trả sửa. Không sửa migration
lịch sử. Fresh-development seed được điều chỉnh xác nhận ngày theo guard056;
seed có sổ phiên bản nên không chạy lại trên dữ liệu đã seed.

## Tính toàn vẹn nghiệp vụ

- Bốn công đoạn dùng chung assignments, publications và stage events. Số
  được giao/nhận theo lệnh, lô, dòng và kết quả đạt đã duyệt của bước trước.
  Báo cáo chờ duyệt giữ quota; công việc mở cũng giữ quota. Tổng giao cắt
  bị chặn theo lô và kế hoạch dòng qua các lô.
- Nhập thành phẩm ghi phiếu RECEIPT, dòng phiếu, movement và output trong một
  giao dịch. Số nhận không vượt kiểm đếm đạt đã duyệt trừ số đã nhập. Mã thành
  phẩm phải có ánh xạ sản phẩm xác nhận. Giá chưa có giữ null/UNVALUED.
- Xuất giao ghi ISSUE và movement một lần, gắn output và dòng Sale. Kiểm tra
  số chưa giao của output, số còn đặt của dòng và tồn kho. Giá xuất dùng bình
  quân hiện có cùng sổ kho. Xác nhận khách nhận lưu người/bằng chứng/thời điểm,
  không xuất kho thêm; chỉ đánh dấu đơn delivered khi mọi dòng đã giao đủ.
- Các thao tác dùng idempotency, transaction, khóa stock/order và audit.
  Dữ liệu xuất/nhập không tạo số dư song song. Local fulfillment đánh dấu
  local_modified_at để snapshot không ghi đè trạng thái giao.
- Lương may giữ mã tính công Excel, đơn giá hiệu lực ngày làm và nguồn lương
  tạo duy nhất khi duyệt. Tiền dự kiến/đã ghi nhận ngày và tháng tính numeric
  SQL. Công gấp–là/kiểm đếm giữ hồ sơ ngày/giờ hiện có.
- Phiếu trả sửa phát hiện tại gấp–là/kiểm đếm đi lại từ may/gấp–là tới nơi
  kiểm tra. Quota sửa riêng theo phiếu. Kết quả giữa đường không cộng lại
  sản lượng thường; chỉ kết quả kiểm tra cuối cộng vào công đoạn phát hiện.
  Mọi kết quả theo phiếu sửa đều không phát sinh tiền sản phẩm lần hai.
- Đảo báo cáo kiểm tra phần công đoạn sau đang giữ/nhận và lượng đã nhập kho.
  Chốt V3 không tạo lại output; cần đủ nhập + lỗi hỏng được duyệt của các
  assignment đúng lệnh/dòng/lô, không còn việc dở/báo cáo chờ/sửa/phiếu nháp.
  API generic cũ không được bỏ qua công đoạn hoặc chốt lô V3 sớm.

## Giao diện

Desktop có bảng tiến độ, tìm kiếm, lọc công đoạn/quá hạn/chờ duyệt/vật tư và
cột tác vụ cố định bên phải. Tablet/mobile dùng thẻ có nút tối thiểu44px.
Chi tiết nhóm theo Tiến độ & giao việc, Vải & dự toán, Thành phẩm & giao hàng.
Có biểu mẫu thật để giao/mở việc, chia lô, phát hành/chốt, dự toán/cấp vải,
ánh xạ vải, nhập/xuất thành phẩm, xác nhận giao, trả sửa và thiết lập tổ nhân sự.

Nhân viên vào cùng route thấy “Công việc sản xuất của tôi”, chỉ việc đúng loại
và công việc của mình, nhận/trả/báo/sửa bằng cùng API với “Công của tôi”. Thợ
cắt thấy mét dự toán và mét đã cấp của lô, không tải toàn bộ giá kho. Màn tự
làm mới15giây và khi trở lại tab; gửi sản lượng cập nhật tiền ngay. API kiểm
tra quyền/nhân sự riêng, không dựa trên nút bị ẩn.

## Bằng chứng tại mốc đóng vòng sửa đầu

- `npx tsc --noEmit -p tsconfig.app.json`: PASS.
- `npm run typecheck:server`: PASS.
- Scoped ESLint trên mã workspace/dispatch/UI mới: không lỗi; cảnh báo hook
  của MyProductionDispatch đã sửa và chạy lại riêng không cảnh báo.
- Tester độc lập báo suite workspace ban đầu209 kiểm tra HTTP và kiểm tra
  khởi động lại4 lệnh PASS; sau đó đang mở rộng hồi quy theo review.
- Coordinator đang kiểm giao diện thật trên fixture local riêng và chạy
  build/hồi quy cuối. Báo cáo kiểm chứng cuối của coordinator là nguồn kết
  quả nghiệm thu; tài liệu này không khẳng định các lượt đang chạy đã PASS.

Không push GitHub, deploy VPS, gửi Supabase hoặc tạo dữ liệu test trong
`crm_local` ở đợt này. Các fixture và API kiểm thử do harness riêng quản lý.
