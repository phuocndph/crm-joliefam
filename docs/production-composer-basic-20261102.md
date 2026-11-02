# Tạo lệnh sản xuất cơ bản — 02/11/2026

## Phạm vi

Luồng chính: chọn đơn CRM → xem từng dòng hàng/quy cách và số lượng còn lại → chọn mã may Excel có sẵn → tạo lệnh nháp. Tìm đơn và tìm mã may là hai ô riêng. Ngày, ghi chú, dự toán vải và ảnh nằm trong Thông tin bổ sung. Tạo xong mở tổng quan lệnh, không tự chuyển sang dự toán cắt.

Mã may được gắn riêng cho từng dòng lệnh; hai dòng cùng sản phẩm nhưng khác cỡ có thể chọn hai mã khác nhau. Chọn mã không sửa ánh xạ sản phẩm toàn cục. Giá hiển thị là giá đã duyệt có hiệu lực ngày chọn; tiền công khi làm vẫn lấy giá hiệu lực theo ngày làm.

Chọn mã may và số lượng là quyết định sản xuất riêng cho dòng đơn. Sản phẩm chưa từng được phân loại toàn cục (revision0) được chọn mã trực tiếp, kể cả người phụ trách danh mục khác người phụ trách đơn. Không mở cửa sổ xác nhận cách đáp ứng và không ghi phân loại danh mục. Dòng đã xác nhận nhập sẵn, đang cần đối soát, đã chủ động để chưa xác định, bộ cần tách món, sản phẩm ngừng dùng hoặc mã công không phải hàng hóa đều bị khóa với lý do cụ thể. Luồng cũ không gửi mã may vẫn yêu cầu xác nhận SEW như trước.

## Căn cứ mã may

Danh mục dùng duy nhất local_product_rates: APPROVED, cùng ngày hiệu lực, đúng một dòng cho mã chuẩn, đơn vị PIECE, giá dương và có tên. Phân loại trùng thực hiện trên toàn bộ nguồn trước tìm kiếm/phân trang. Mã sửa rèm được quản trị riêng và mã có yêu cầu APPROVE còn hiệu lực thuộc công đoạn khác bị chặn. Yêu cầu đã RETIRE hoặc hết hiệu lực không chặn mã may hợp lệ.

Snapshot ORDER_SELECTION giữ mã chuẩn, dấu vân tay nội dung mã và đặc điểm dòng, người chọn/ngày chọn. Metadata production_decision do server tạo ghi basis ORDER_LINE_CODE_SELECTION, mã đơn và khóa dòng nguồn, dấu vân tay nguồn/sản phẩm, người quyết định và trạng thái/phiên bản danh mục quan sát được. Mỗi dòng có audit CREATE_ORDER; không sao chép quyền sở hữu hay mở quyền sửa danh mục. Giao may và xuất giao dùng chung validator kiểm nguồn/sản phẩm hiện hành; xuất giao không yêu cầu đơn giá lương còn hiệu lực. Xác nhận SEW hợp lệ về sau vẫn được chấp nhận nếu nguồn/sản phẩm không thay đổi; trạng thái bất lợi mới sẽ chặn để đối soát. Nếu có yêu cầu may hợp lệ tại lúc chọn thì ghim thêm phiên bản yêu cầu. Nếu không có, snapshot giữ NULL; thêm metadata may về sau không tự đổi căn cứ cũ. Metadata mới cấm dùng may, đổi nghĩa mã, đổi đặc điểm dòng hoặc giá trùng sẽ chặn giao việc và yêu cầu đối soát. Giá đổi đúng kỳ không đổi mã đã chọn. Dòng lịch sử NULL tiếp tục dùng PRODUCT_MAPPING như trước.

## Database và triển khai

- Thêm migration append-only `server/db/migrations/083_local_production_sewing_selection.sql`: cột JSONB nullable trên bảng dòng lệnh; ràng buộc hình dạng và trigger cấm sửa lựa chọn đã lưu. Quyền và bảng nghiệp vụ hiện có được giữ nguyên.
- Migration083 đã áp dụng riêng vào PostgreSQL local `crm_local`, sau bản sao lưu `.local-staging-runtime/production-basic-local-20261102/before-083.dump`. Receipt `installed.json` cùng thư mục xác nhận checksum `1a4f23ab7865151fc0c33bc2d896504b5377a6c6a6ef39e26ca75c2b2ccc23f3`, 14 bảng nghiệp vụ giữ nguyên số lượng và dấu vân tay dữ liệu. Chưa áp dụng trên VPS.
- Không có dependency mới, không đổi cấu hình triển khai; backend mới cần migration083 trước khi bật giao diện mới trên môi trường khác. Backend local và UI đã build đạt và được khởi chạy lại; API cổng8787 trả health200 với DB `crm_local`, UI cổng8083 phục vụ giao diện mới.
- Runtime local dùng chế độ `normal` sau preflight chỉ đọc đối chiếu các migration hiện có. Chế độ `serve-installed` chỉ dựa receipt chưa dùng được vì schema có sẵn các bảng refunds/returns; không xóa bảng hoặc dữ liệu để vượt kiểm tra này.
- Không commit, push, deploy lên VPS, gọi nhà cung cấp hay tạo/sửa đơn hàng và phân loại sản phẩm thật trong lúc kiểm tra.

## Kiểm tra

- TypeScript app và server `--noEmit`: đạt.
- ESLint các component/helper mới và tệp điều phối liên quan: đạt. Tệp sales-workflow có lỗi `no-control-regex` có sẵn ở bộ lọc tìm đơn; không thay quy tắc tìm trong phạm vi này.
- `node scripts/test-production-composer-api-isolated.mjs --frozen`: 38/38, PostgreSQL Docker dùng một lần, chặn fetch ra ngoài; bao gồm18 case legacy,13 case mã may/ACL/quota/atomic/idempotency/immutable/metadata/rate/dispatch và7 case quyết định trực tiếp theo dòng (khác chủ danh mục, không ghi phân loại, accepted/ZCRM, trạng thái bất lợi, provenance, xuất giao không phụ thuộc giá lương).
- Fixture `node scripts/start-production-basic-ui-fixture.mjs`: actual composer/picker, toàn bộ IO giả lập; dùng Cua để kiểm tra desktop/mobile, hai cỡ cùng sản phẩm chọn hai mã, pagination, tìm không dấu, retry, mã may trực tiếp trên sản phẩm chưa phân loại và lý do khóa hàng nhập sẵn; không gọi API phân loại.
- Hai script browser cũ `test-production-composer-ui-isolated.mjs` và `test-production-composer-code-chain-isolated.mjs` ghi nhận UI/chain authoring cũ, không phải hợp đồng cho giao diện basic mới; thay bằng fixture Cua và API suite nêu trên. Không chạy browser automation ngoài Cua.

Sau khi kích hoạt bản điều chỉnh local, build server/UI đạt, API tiến trình6064 cổng8787 trả health200 với DB `crm_local`; UI cổng8083 phục vụ bản mới. Cua trên đơn thật2876 thấy3 dòng có số lượng và picker mã may được mở, không có bước xác nhận danh mục. Tìm “gối” trả28 mã thật kèm giá, gồm vgbt2000. Không lưu đơn hoặc phân loại thật; chưa triển khai VPS.

## Điều chỉnh luồng chọn mã trực tiếp

Bản điều chỉnh chỉ dùng thêm metadata trong JSON083 hiện có; không có migration mới, không sửa migration đã áp dụng, không thêm dependency hoặc đổi cấu hình. Đã kích hoạt và kiểm tra trên runtime local sau review; chưa triển khai VPS. Kiểm thử API chỉ ghi vào PostgreSQL Docker dùng một lần; thao tác trên dữ liệu thật chỉ đọc và hủy biểu mẫu trước khi lưu.

Review độc lập đối chiếu20/20 tệp production với manifest freeze, không có blocker. Tester độc lập chạy38/38 đạt, báo cáo `.local-staging-runtime/production-composer-20261031/focused-api-1793635235221.json`. Cua fixture kiểm tra hai quy cách cùng sản phẩm chọn GACN12500.25 và GACL15000, payload giả lập giữ đúng mã theo từng dòng; hàng nhập sẵn bị khóa với lý do cụ thể; màn hình390×844 không tràn ngang (document390, dialog374). Fixture đã dừng sau QA.

## Bỏ qua dòng không may trong lệnh hiện tại

Trên mỗi dòng đơn CRM đủ điều kiện chọn mã may có nút **Không may**. Khi chọn, hàng gốc vẫn hiển thị với quy cách và số lượng đơn; số lượng lập lệnh hiển thị0 và bị khóa, không cần mã may hay dự toán vải. Dòng bị bỏ qua không tính vào tổng lệnh và không gửi trong payload tạo lệnh, nên không tạo vật tư hoặc tiền công cho dòng đó. Nút **Đưa vào may** phục hồi số lượng và mã đã chọn trong cùng biểu mẫu; đổi ngày bắt đầu vẫn xóa mã may, tải lại/chuyển đơn hoặc đổi phiên không phục hồi lựa chọn cũ.

Đây chỉ là lựa chọn cho bản nháp đang lập, không sửa dòng đơn CRM, phân loại sản phẩm toàn cục, tuyến đáp ứng hay lập kế hoạch mua hàng. Không suy đoán hàng mua theo tên. Dòng đã được hệ thống xác nhận PURCHASE tiếp tục bị khóa, hiện **Hàng đặt mua · Không lập lệnh may** và không có nút đưa vào may. Trạng thái cần đối soát/thiếu sản phẩm/ngừng dùng vẫn giữ lý do khóa riêng. Bỏ qua tất cả các dòng làm nút tạo bị khóa và hướng dẫn đưa dòng cần sản xuất trở lại.

Điều chỉnh này chỉ thay giao diện composer và bổ sung dữ liệu giả lập mixed/blocked cho fixture Cua. Không đổi backend, migration, dependency hoặc cấu hình triển khai. TypeScript app, ESLint composer, `node --check` fixture và diffcheck tập trung đều đạt; reviewer độc lập đối chiếu3/3 tệp, không có blocker. Đối chiếu182 tệp backend không đổi; không chạy lại suite API38 vì không thay hợp đồng/backend. Build UI đạt bằng helper giữ runtime local hoạt động. Kiểm tra cuối verify-final đạt:14 bảng nghiệp vụ giữ nguyên, API/UI đều trả200.

Cua fixture mixed kiểm tra bỏ dòng thảm làm tổng giảm37→25, đưa vào may phục hồi12 và giữ mã đã chọn trong cùng ngữ cảnh; bỏ qua tất cả làm tổng0, hiện hướng dẫn và khóa nút tạo. Lần tạo giả lập chỉ gửi dòng1 số lượng25/mãGACN, không gửi dòng thảm. Dòng PURCHASE xác nhận không có nút đưa vào may và không thể đưa lại vào lệnh. Fixture đã dừng đúng tiến trình sau QA.

Trên biểu mẫu local đơn2876, Cua phục hồi lựa chọn vgbt giá2000/số lượng20 và vck giá8000/số lượng10; dòng thảm được đặt Không may, số lượng0 và không yêu cầu mã. Tổng hiện2 dòng/30 sản phẩm và nút tạo được bật. Không bấm tạo thật, không ghi phân loại hoặc sửa đơn CRM. Ảnh xác nhận: `../outputs/production-composer-basic-20261102/skip-nonsewing/order-2876-skip-mat.png`. Chưa triển khai VPS.

## Tiền công cộng thêm theo từng sản phẩm

Trong mỗi dòng cần may có mục thu gọn **Tiền công cộng thêm**: nội dung công việc, số lượng, đơn vị (cái/lần/bộ/mét/giờ) và đơn giá. Số lượng độc lập với số lượng sản phẩm: một việc trọn gói có thể ghi1 lần. Từng dòng giữ khoản riêng, không sao chép vào tất cả lệnh. Dòng Không may không gửi khoản cộng thêm. Tổng may cơ bản và tổng cộng thêm hiển thị riêng; đây là dự toán, chưa phải lương đã duyệt hoặc chi phí thực tế đã ghi sổ.

Khi hoàn thành, quản trị/quản lý chọn một người làm và ngày hoàn thành cho toàn bộ một khoản, rồi **Gửi duyệt tiền công**. Nhiều người làm cần tách thành nhiều khoản. Hệ thống tạo đúng một `local_payroll_adjustments` nguồn MANUAL_ADJUSTMENT/EARNING ở trạng thái SUBMITTED, có FK duy nhất đến khoản gốc; bảng lương hiện có chỉ lấy sau khi duyệt qua **Khoản cộng/trừ lương**. Không tăng số sản phẩm may, không tạo sản lượng lần hai, không tự ghi sổ chi phí hoặc chi tiền. Phiếu trả sửa hiện hữu vẫn không tự trả tiền may lần hai.

Nội dung khoản đã lưu là bất biến; sai thì hủy kèm lý do rồi thêm khoản thay thế. Khoản đang chờ duyệt, đã duyệt hoặc đã khóa lương không được hủy. Khoản bị từ chối không gửi lại cùng nguồn; có thể hủy và thêm khoản đúng. Lệnh đã hoàn thành vật lý vẫn được bổ sung/hủy khoản chưa ghi lương hoặc bị từ chối để hoàn thiện tiền công, không sửa snapshot sản xuất đã phát hành. Lệnh CANCELLED không bổ sung, hủy hoặc xác nhận mới. Xác nhận người làm chỉ từ trạng thái RELEASED/IN_PROGRESS/ON_HOLD/COMPLETED. Kiểm tra hồ sơ lương có hiệu lực, nhân viên đang hoạt động, ngày công, kỳ đóng và kỳ đã khóa dùng các guard lương hiện có.

Quyền thêm/hủy dùng quyền quản lý sản xuất hiện hữu kèm `inventory_cost_view`; admin/manager được hưởng quyền tương ứng theo chính sách hiện có. Chỉ admin/manager xác nhận người làm sang lương. Người không có quyền xem chi phí vẫn đọc nội dung/số lượng/trạng thái theo phạm vi lệnh, nhưng đơn giá, thành tiền và tổng cộng thêm bị ẩn từ server; luồng audit sản xuất không chứa số tiền. Tạo lệnh không có khoản cộng thêm vẫn giữ quyền cũ.

Tối đa50 khoản đang dùng mỗi sản phẩm, nội dung1–200 ký tự; số lượng dương và đơn giá không âm có tối đa2 chữ số thập phân. PostgreSQL `numeric` sinh thành tiền chính xác với4 chữ số thập phân (1,25 ×0,25 =0,3125đ), UI dùng BigInt hiển thị cùng giá trị. Thành tiền không vượt99.999.999.999.999,9999đ để vừa nguồn điều chỉnh lương `numeric(20,6)`. Đơn giá0 chỉ là dự toán, không gửi duyệt lương. Client không được gửi thành tiền tự tính. FK kép kiểm sản phẩm thuộc đúng lệnh; chống gửi trùng, khóa dòng cha và audit nằm chung giao dịch. Lỗi bất kỳ dòng nào hoàn tác toàn bộ lệnh/khoản đang tạo.

### Migration và cập nhật

Thêm append-only `server/db/migrations/085_local_production_planned_extras.sql`: bảng khoản cộng thêm, FK kép về dòng lệnh, số tiền generated numeric, trigger bất biến/cancel; thêm hai cột nullable nguồn công thêm/ngày làm và UNIQUE FK trên bảng điều chỉnh lương canonical. Không sửa083 đã áp dụng. Không thêm dependency, không đổi biến môi trường hay cấu hình triển khai chuẩn. Cần backup và áp dụng085 trước khi chạy backend/UI mới trên môi trường được phép; dùng đúng lịch sử migration của môi trường, không chạy hàng loạt migration084 của tích hợp khác khi chưa được yêu cầu. Chưa commit/push hoặc triển khai VPS.

Kết quả cuối sau vòng sửa và freeze: reviewer độc lập không còn blocker; tester độc lập đạt47/47 (`focused-api-1793638946421.json`), đối chiếu188 tệp server/migration không lệch và xác nhận đã dừng API/container kiểm thử. Bao gồm case lệnh đã hoàn thành → từ chối → hủy → thay thế → chờ duyệt, cùng duyệt khoản vào bảng lương đúng một lần và khóa bằng luồng lương hiện có. App/server TypeScript, focused lint, cú pháp fixture và scoped diffcheck đạt; lỗi `no-control-regex` đã có ở sales-workflow dòng431 không thay đổi trong phạm vi này. Build server và UI đạt; UI còn cảnh báo bundle/Browserslist đã biết. Baseline/candidate riêng lưu tại `../outputs/production-composer-basic-20261102/extras/`.

Cua fixture kiểm tra khoản May tem20 ×500đ =10.000đ tách khỏi dự toán may cơ bản312.506,25đ; Không may/Đưa vào may loại/phục hồi khoản đúng dòng và payload giả lập chỉ gửi dòng được chọn. Panel chi tiết xác nhận một người làm tạo trạng thái chờ duyệt, chặn giá âm, bổ sung rồi hủy50.000đ vẫn giữ lịch sử; lệnh COMPLETED có nút bổ sung phù hợp. Fixture cấp dữ liệu còn giá nhưng thiếu quyền xem chi phí cũng không hiển thị giá trên UI. Ảnh `mobile-no-cost-pass.png` xác nhận màn390px không tràn ngang. Đã dừng đúng fixture session5435 sau QA.

### Trạng thái local sau kiểm tra

Migration085 checksum `85ff566e6f5d2b3f390d3a79caed2ab3bf813c3291fd213ef2c14c85e55e18ce` đã được điều phối áp dụng riêng vào **PostgreSQL local crm_local** sau backup riêng `.local-staging-runtime/production-extras-local-20261102/before-085.dump`. Đối chiếu18 bảng nghiệp vụ trước/sau không thay đổi; bảng cộng thêm mới có0 dòng. Migration084 tích hợp khác **chưa áp dụng**. Runtime thử local dùng bản server đã đóng băng tại `.local-staging-runtime/production-extras-local-20261102/server-dist`, loại riêng084 chưa được yêu cầu và tắt tích hợp. Đây là cách kích hoạt local có kiểm soát, không phải thay đổi cấu hình triển khai chuẩn của dự án.

Kiểm tra `.local-staging-runtime/production-extras-local-20261102/verify.json` đạt: API8787 và UI8083 trả200,18 bảng nghiệp vụ giữ nguyên. API local PID42244, UI8083 giữ tiến trình3140. Cua mở đơn2876 và phục hồi biểu mẫu đang nhập: số lượng20/10, thảm Không may, chưa chọn mã may như trạng thái quan sát trước tải lại, ngày bắt đầu02/11, ghi chú trống; mở phần cộng thêm dòng đầu để người dùng tiếp tục. Ảnh `../outputs/production-composer-basic-20261102/extras/local-2876-extras-ready.png`. Không bấm lưu lệnh, ghi tiền công hoặc sửa phân loại/đơn CRM thật khi QA. Chưa commit, push GitHub hoặc triển khai VPS; môi trường VPS cần backup và áp dụng migration085 đã review trước khi dùng phiên bản backend/UI này.
