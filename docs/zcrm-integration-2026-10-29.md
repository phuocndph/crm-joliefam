# CRM JolieFam ↔ ZCRM v1

## Phạm vi mã nguồn

Adapter `/api/zcrm/v1` thực hiện 11 API trong hợp đồng ZCRM commit
`7682fd65d998cf30fe335faa1fe53bdfd9b2cbb3`. Khách, sản phẩm và đơn lấy từ
`local_customers`, `local_products`, `local_orders`; không có hệ thống đơn thứ hai.
Khóa dịch vụ không dùng được để duyệt, thu tiền, xuất kho hoặc gọi GHN.

Migration tích hợp mới: `server/db/migrations/075_local_zcrm_commerce.sql` và
`076_local_zcrm_projection_events.sql`. Không sửa lịch sử migration và không tự
gán quyền cho hồ sơ cũ. Không thêm npm dependency trong công việc tích hợp này. Thêm biến
máy chủ `LOCAL_ZCRM_API` (mặc định `false`) và `ZCRM_ENCRYPTION_KEY` (64 ký tự hex
ngẫu nhiên, AES-256-GCM). Compose đã chuyển hai biến này vào API. File mẫu không
chứa khóa thật. Khóa mã hóa phải giữ ổn định, sao lưu tách khỏi database.

**Bootstrap tự áp dụng migration chưa chạy khi khởi động API. Chỉ khởi động bản
mới trên VPS sau khi quản trị đã sao lưu, kiểm tra và cho phép triển khai.** Công
việc phát triển này không áp dụng migration hoặc thay đổi cấu hình trên VPS thật.

HEAD nền là `50989dbf17748d18d5c2cb4e49926a190d74dc12` trên nhánh
`local-vps-20261014`; worktree đã có nhiều thay đổi chưa commit từ trước, bao gồm
migration 064–074 và package files. Bản phát hành phải giữ đầy đủ chuỗi migration
và các module nền hiện có. Chưa kiểm chứng việc chỉ chép riêng 075/076 vào phiên
bản VPS cũ; không áp dụng hai file này độc lập trên một schema chưa đối chiếu.
Những thay đổi dependency khác trong worktree không thuộc tác vụ ZCRM này.

## Cấu hình vận hành

1. Triển khai cả frontend, backend và migration bằng quy trình phát hành hiện có.
   Chuẩn bị khóa mã hóa trên máy chủ; giữ `LOCAL_ZCRM_API=false` trong giai đoạn
   chuẩn bị. Không dán khóa vào chat, Git hay log.
2. Quản trị thật đăng nhập **Cài đặt API → ZCRM**. Đặt tên kết nối, chọn đơn vị dữ
   liệu CRM. Dán đường dẫn webhook từ ZCRM để tự lấy mã tổ chức. Mã này là ID nội
   bộ đơn vị ZCRM, không phải ID Zalo.
3. Xác nhận hồ sơ khách cá nhân/khách sạn, người liên hệ và địa chỉ nhận hàng.
   Xác nhận hàng có sẵn/đặt riêng, đơn vị bán, biến thể của từng mã và trường quy
   cách bắt buộc. Không suy loại hàng từ tên sản phẩm hoặc phân loại may/nhập.
4. Chọn khách/sản phẩm và kho được phép chia sẻ. Hồ sơ không có tenant chỉ được
   chia sẻ khi quản trị chọn rõ. Đơn luôn phải có tenant chính xác của kết nối.
   Không có quyền mặc định với khách hoặc sản phẩm khác.
5. Ghép mã người dùng ZCRM với tài khoản CRM thật. Nhân viên CRM phải hoạt động và
   có quản lý đang hoạt động theo RBAC hiện tại. Người tạo/gửi được lưu riêng với
   quản lý sở hữu đơn.
6. Lưu ở trạng thái tắt, tạo cặp khóa. Khóa mới chỉ trả một lần cho quản trị, được
   che trên màn hình và không được lưu trong localStorage. Sao chép qua kênh riêng
   an toàn vào ZCRM rồi xác nhận ẩn. Khóa API được hash cho inbound và mã hóa cho
   việc nhận tài liệu; khóa ký webhook được mã hóa riêng. GET không trả lại khóa.
7. Sau khi xác minh ZCRM trên máy chủ đã triển khai API tương ứng, bật cổng API
   máy chủ và kết nối CRM đã cấu hình. Trong ZCRM **CRM Joliefam**, nhập:
   - Origin CRM: `https://crm.joliefam.vn`.
   - Đường dẫn API: `/api/zcrm/v1`.
   - Khóa API và khóa webhook vừa chuyển riêng.
   - Bảng ghép người dùng ZCRM → ID tài khoản CRM như màn cấu hình CRM.
   Lưu ZCRM khi tắt, bấm kiểm tra kết nối đã lưu, sau đó mới bật và chạy thử nhóm
   nhỏ. Không coi cấu hình đã lưu là kết nối thành công.

## Đơn nháp và tiền

Đơn ZCRM luôn là `approval_status=pending`, không giữ tồn, ghi thu tiền, xuất kho,
đưa sản xuất hoặc tạo vận đơn. Quản lý phụ trách và quản trị xem **Đơn hàng → Đơn
gửi từ ZCRM**, xem quy cách/tài liệu và quyết định duyệt/trả bổ sung/từ chối. Đơn
giá chính thức nhập từ giá nháp đã được CRM kiểm tra, không tự thay giá chưa biết
bằng 0. Giá đề xuất hàng đặt riêng và giá đã duyệt là hai trường khác nhau. Ngày
mong muốn và ngày xác nhận cũng riêng biệt.

Trả bổ sung dùng key revision mới và `existingOrderId`, cập nhật đúng đơn cũ cùng
mã. Chỉ người tạo ban đầu của cùng kết nối được gửi lại đơn `returned`. Duyệt
không tự tạo vận chuyển/thu tiền. Execution dùng những màn vận hành hiện có sau
khi đã duyệt; ràng buộc DB chặn bypass qua API tương thích.

Giá có sẵn lấy `local_products.price`; đơn giá công may không được dùng làm giá
bán. Tồn chỉ lấy ledger movement khi có mapping sản phẩm → item và đơn vị khớp
kho; thiếu mapping là `available:null`. Báo giá chưa giữ kho. Phí, VAT, giảm giá ở
bước nháp là chính sách **chưa thu**, giá trị 0 được cảnh báo và cần quản lý chốt
khi duyệt. Đây không phải lời hứa miễn phí giao hàng/VAT.

Số lượng tối đa 4 chữ số thập phân, VND nguyên và phép tính decimal half-up chung
của CRM. Hợp đồng ZCRM v1 dùng `Math.round(quantity*price)`, có lệch trên một số
biên nhị phân (ví dụ 1.005 × 100). CRM trả 422 `ROUNDING_CONTRACT_MISMATCH` trước
khi ghi đơn nếu hai kết quả khác nhau; cần sửa validator upstream để hỗ trợ đầy
đủ các biên này. Không thay công thức chuẩn CRM bằng phép tính sai.

Số tiền `deposit` là cọc **thỏa thuận**, không phải khoản thu đầu tiên. Khi có một
hợp đồng gắn đúng đơn/khách/tenant và chưa hủy, lấy `deposit_amount` hợp đồng; nếu
nhiều hợp đồng hoặc tổng/khách/tenant không khớp thì `DATA_INCOMPLETE`. Không có
hợp đồng thì dùng điều khoản đã duyệt/đối chiếu của đơn. `collected` từ ledger thu
thực, loại tombstone; `refunded` từ ledger hoàn thực; `due=max(0,total-credit-
collected+refunded)`. `netSales` trừ credit trả hàng đã chốt, loại nháp/hủy. Trạng
thái GHN hoàn không tạo ra số tiền hoàn.

Đơn cũ thiếu nguồn đầy đủ trả 503 `DATA_INCOMPLETE`, không thay số chưa biết bằng
0. API quản trị `POST /api/zcrm-admin/orders/:id/reconcile` nhận toàn bộ snapshot
thật, quy cách/kind/unit từng dòng, lý do nguồn và `history_complete:true`. Không
tự động backfill lịch sử. API này dành cho người có trách nhiệm đối chiếu, chưa
có công cụ nhập hàng loạt. Cần đối chiếu sổ gốc trước khi mở lịch sử mua hàng cũ.

Các ledger canonical `local_order_returns`, `local_order_refunds` cho phiếu trả/
hoàn có tham chiếu đơn/khoản thu, khóa chống lặp, kiểm tra hạn mức và phiếu đảo.
Human API `POST /api/zcrm-admin/orders/:id/returns|refunds` dành cho quản lý sở hữu
đơn hoặc admin; không cấp cho service. Chưa thêm màn kế toán hoàn/trả riêng; không
được dùng service ZCRM để ghi các bút toán này.

## Chống trùng và tài liệu

Key được giữ bền vững trong cùng transaction với đơn và response snapshot. Một
session advisory lock giữ thứ tự cùng key qua giai đoạn nhận tệp; không mở business
transaction trong lúc tải mạng. Lượt đồng thời đợi tối đa 12 giây, timeout trả 503
không xác định; kiểm tra `/requests/:key` trước khi thử lại. Receipt thành công
được trả trước khi xét hạn quote hoặc tải lại tệp. Cùng key khác payload trả 409
và không ghi dữ liệu. Không tự phát key mới khi mạng chậm.

Tài liệu phải khớp tên/mediaId của từng dòng và cùng nháp, URL HTTPS chính xác
`/api/v1/joliefam/transfer/:org/:draft/:media` trên origin đã cấu hình. Không nhận
URL tùy ý từ quy cách. DNS public được kiểm tra và pin vào TLS request, chặn mạng
private/reserved, redirect, query/fragment/encoded traversal. Tối đa 15 MB/tệp,
10 tệp/dòng, tối đa 100 tệp riêng biệt và tổng 100 MB/lượt; stream từng tệp bị giới
hạn theo dung lượng còn lại. Toàn lượt nhận tối đa 10,5 giây (gồm DNS và I/O),
DNS chậm hết hạn không được bắt đầu HTTP sau đó. Tệp dùng chung
nhiều dòng được nhận một lần. Không báo thành công trước khi tất cả byte được lưu
private trong DB cùng đơn. Tài liệu chỉ tải bằng session CRM được cấp quyền,
`Content-Disposition: attachment` và `nosniff`.

## Cập nhật trạng thái

Trigger lưu version tăng và outbox cùng transaction khi đơn, khách, thu/hoàn/trả,
hợp đồng, sản xuất, shipment hoặc GHN thay đổi. Worker claim bằng `SKIP LOCKED`,
lease 30 giây, timeout HTTP 8 giây, exponential retry tối đa chu kỳ 1 giờ, không
xóa event lỗi. Stable event ID/raw body; retry dùng timestamp mới và HMAC SHA256
`timestamp.eventId.rawBody`. ZCRM đọc lại API, không tin số tiền trong event.
Kết nối tắt hoặc thu hồi grant dừng gửi. Không gửi mạng trong transaction nghiệp
vụ. Lỗi/số event chờ hiện trong cấu hình.

Worker kiểm tra lại phạm vi đơn (khách, tenant, tombstone và grant) khi claim và
ngay trước gửi. Đơn đã đổi đơn vị/khách hoặc bị xóa logic không gửi ID cũ. Xóa/
khôi phục khách, GHN và hợp đồng qua tombstone cũng tăng version và tạo outbox.
Khách bị xóa logic vẫn được gửi thông báo tối thiểu `customerId/version` tới kết
nối còn grant để vô hiệu hóa cache; lần đọc hồ sơ sau đó trả 404 và ZCRM cần thể
hiện hồ sơ không còn khả dụng. Thu hồi grant hoặc tắt kết nối dừng cả thông báo
này. Trả hàng cộng số lượng bằng đơn vị decimal chính xác; 0,1 + 0,2 khớp 0,3.
Trạng thái danh sách/chi tiết cùng lấy từ đơn, production, shipment và GHN hiện
có; giao một phần vẫn đang hoạt động, giao thất bại/hoàn/thất lạc vào nhóm sự cố.
GHN hoặc một phiếu giao xác nhận đã nhận chỉ chứng minh kiện/đợt đó đã giao. Khi
đơn CRM chưa xác nhận đủ số lượng, hiển thị “Đã giao kiện; chờ xác nhận đủ đơn”
trong trạng thái `partially_delivered`, vẫn đối chiếu nền và nằm trong nhóm giao
hàng. Không tự coi một vận đơn đã giao là toàn bộ đơn đã hoàn thành.

## Kiểm chứng và giới hạn phát hành

`node --import tsx scripts/test-zcrm-isolated.mjs` tạo role NOSUPERUSER và database
Docker riêng trên port 16543, áp dụng migration, gọi đủ 11 endpoint HTTP với
validator chính ZCRM, hotel nhiều người liên hệ/địa chỉ, nháp hỗn hợp, tải tài liệu
fixture, cùng key đồng thời, quote hết hạn/replay, cùng mã sau trả bổ sung, quản lý
duyệt, nhiều khoản thu/hoàn/trả và outbox retry. Fixture được xóa khi kết thúc,
không gọi dịch vụ/khách thật. Test độc lập của reviewer/tester được báo riêng.

Chưa kiểm chứng kết nối có khóa thật giữa hai VPS, chưa cấp org/employee IDs thật,
chưa áp migration production và chưa commit/push/deploy trong công việc này. Cần
kiểm tra hostname, reverse proxy không redirect `/api/zcrm/v1`, DNS/TLS ZCRM, quyền
chuyển tài liệu, đồng hồ máy chủ và sổ tiền cũ trước nghiệm thu thực tế. Capabilities
của mã nguồn không chứng minh phiên bản đã chạy trên máy chủ.
Probe công khai không xác thực ngày 29/10/2026: transfer ZCRM với mã readiness
không tồn tại trả 404 JSON; capabilities CRM trả 401 JSON. Các mã này có thể do
router chung hoặc mã tổ chức không tồn tại, không chứng minh integration đã deploy.
Cần xác nhận ZCRM đã phát hành commit đầy đủ nêu trên trước khi bật kết nối thật.
