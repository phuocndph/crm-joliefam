# Rà soát khoản nợ dự án — 11/10/2026

Đây là báo cáo kiểm tra hiện trạng, không phải biên bản xác nhận toàn bộ dự án đã hoàn thiện. Trong lượt rà soát này không sửa mã nghiệp vụ, không chạy đồng bộ thủ công, không thay đổi dữ liệu public và không chạy bộ thử nghiệm ghi vào cơ sở dữ liệu dùng chung.

## Kết quả kiểm tra trực tiếp

- Frontend tại cổng 8090 và API tại cổng 8787 đang hoạt động. API health xác nhận PostgreSQL local, cơ sở dữ liệu crm_local.
- TypeScript frontend và backend: đạt.
- Build production: đạt; còn cảnh báo gói JavaScript lớn và dữ liệu Browserslist cũ.
- Kiểm tra tương thích truy vấn local và xuất Excel chấm công: đạt.
- 23 yêu cầu GET tới các API chính đều trả HTTP 200: tổng quan, khách hàng, báo giá, đơn hàng, hợp đồng, chi phí, giao dịch, thanh toán, người dùng, kho kiến thức, hóa đơn, GHN, vải, sản phẩm, kho, đối soát kho, sản xuất, yêu cầu sản xuất, chấm công, hồ sơ lương, kỳ lương và duyệt hồ sơ.
- Trang tổng quan đang mở không ghi nhận lỗi console mức error tại thời điểm kiểm tra.
- Các kết quả trên chỉ xác nhận đọc dữ liệu/build trong phạm vi kiểm tra. Chưa kiểm chứng toàn bộ thao tác tạo/sửa/xóa, mọi vai trò, mobile, toàn bộ file đính kèm hoặc đối soát trực tiếp từng dòng với Supabase.
- Lint toàn dự án: 787 lỗi, 48 cảnh báo. Đây là nợ kiểm tra mã, không phải 787 lỗi thao tác đã tái hiện.

## Các vấn đề ưu tiên cao

### 1. Đồng bộ nguồn đang bị chặn do hạn mức — P1, xác nhận tại dữ liệu local

Phiên đồng bộ gần nhất được kiểm tra có 103 mục lỗi; cả 103 cùng chứa exceed_egress_quota. Supabase báo dịch vụ bị hạn chế vì vượt hạn mức truyền dữ liệu. Đây là lỗi vận hành ở nguồn, không phải mất cơ sở dữ liệu local.

Phiên hoàn thành không lỗi gần nhất: 15:26:50 ngày 10/10/2026, giờ Việt Nam. Sau mốc này không nên coi local đã cập nhật đầy đủ từ public; một số phiên lỗi từng phần vẫn có thể cập nhật được một số nguồn.

Cần khôi phục quyền đọc ở nguồn, giảm lượng dữ liệu tải/lặp lại, rồi đối soát kết quả đồng bộ. Không tự chuyển sang ghi lên public.

### 2. Mốc đồng bộ có thể bỏ sót cập nhật trong lúc một phiên đang chạy — P1, xác nhận qua mã

[Script đồng bộ](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/scripts/sync-supabase-to-local.mjs:494>) lấy completed_at của phiên trước làm mốc, trong khi bảng được đọc lần lượt và lọc updated_at > mốc.

Ví dụ: bảng đơn hàng được đọc lúc 10:00, đơn thay đổi lúc 10:01, phiên hoàn thành lúc 10:02. Phiên sau chỉ đọc các thay đổi sau 10:02, nên thay đổi 10:01 có thể không được lấy. Chưa xác nhận một bản ghi cụ thể đã bị mất cập nhật; đây là lỗ hổng thuật toán có thể tái hiện từ thứ tự xử lý.

Cần cửa sổ đọc có mốc bắt đầu/kết thúc rõ ràng, khoảng chồng lấn hoặc con trỏ theo từng bảng, kèm upsert chống trùng.

### 3. Đồng bộ tự động chưa nhận đầy đủ việc xóa ở public — P1, xác nhận qua mã

[Điều kiện nhận bản ghi bị xóa](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/scripts/sync-supabase-to-local.mjs:541>) chỉ thực hiện khi không chạy incremental. [Bộ lập lịch](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/server/index.ts:1998>) luôn gọi --incremental. Bản ghi bị xóa ở nguồn không có updated_at mới để truy vấn.

Cần đối soát định kỳ toàn bộ khóa hoặc nhật ký xóa, với điều kiện đọc nguồn đầy đủ trước khi đánh dấu xóa. Không được xóa nhầm các thay đổi độc lập tại local.

Ngoài ra, có hai phiên còn trạng thái RUNNING từ 02/10 và 10/10 dù đã quá thời gian chạy hợp lý. Mã hiện chỉ bỏ qua phiên RUNNING quá hai giờ, chưa kết thúc/ghi lỗi các phiên bị gián đoạn. Cần phục hồi trạng thái và hiển thị lỗi cụ thể thay vì chỉ “Có lỗi cần xem”.

### 4. Chính sách tăng ca và tiền ăn chưa đúng mức chi tiết đã duyệt — P1, thiếu nghiệp vụ tài chính

[Bộ tính lương](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/server/index.ts:16575>) dùng một OVERTIME_MULTIPLIER chung; overtime_type chỉ được lưu vào chi tiết, không dùng để chọn công thức. Tiền ăn dùng một MEAL_RATE chung.

[Quyết định nghiệp vụ đã duyệt](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/docs/open-business-questions.md:38>) yêu cầu phân biệt ngày thường/Chủ nhật/ngày lễ; mức cố định hoặc quy đổi lương theo nhóm; tiền ăn theo nhóm/cơ sở/ngày hiệu lực.

Vì vậy hiện chưa thể khẳng định kết quả lương khớp đầy đủ Excel và các quy định đã duyệt. Cần bộ giải chính sách theo nhân sự, nhóm, loại ngày và ngày hiệu lực; thiếu cấu hình thì chặn tính, không dùng giá mặc định.

### 5. Cấu hình lương hiện tại chưa đủ để chốt cả nhóm — P1, thiếu dữ liệu cấu hình

GET kiểm tra trước khi tính kỳ 01–31/10/2026, 26 ngày chuẩn, giới hạn đúng sáu nhân sự hiển thị mặc định, trả 15 lỗi chặn trên năm người:

| Mã nhân sự | Thiếu |
|---|---|
| DAY-001 | Phân loại lương đã duyệt, nhóm chính sách, hồ sơ nguồn lương đã duyệt |
| PIECE-001 | Ba mục trên |
| HOUR-001 | Ba mục trên |
| NV-ONL | Ba mục trên |
| DEMO-20260914 | Ba mục trên |

DEMO-LOCAL không có lỗi trong lần kiểm tra này. Đây là thiếu cấu hình hiện tại; chức năng chặn tính lương đang phản ánh đúng các thiếu sót đó. Không tự chọn mức lương thay cho chủ dự án.

## Chức năng và dữ liệu cần hoàn thiện

| Khoản nợ | Mức / bằng chứng | Ảnh hưởng và việc cần làm |
|---|---|---|
| GHN chưa tích hợp dịch vụ thật | P2; [adapter local](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/server/index.ts:1647>) | Danh sách địa chỉ/cửa hàng trả rỗng; tính cước trả thành công với 0 đồng; tạo đơn chỉ lưu local. Cần kết nối GHN độc lập và phân biệt dữ liệu thật với bản nháp. |
| Hóa đơn điện tử chưa phát hành được từ local | P2; [trang hóa đơn](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/src/pages/EInvoiceManagement.tsx:68>) | Dữ liệu/dự thảo được giữ, nhưng tác vụ Viettel bị chặn. Cần adapter phát hành, thay thế, điều chỉnh, tra cứu và quản lý bí mật phía server. |
| Dự đoán AI đang trình bày kết quả mặc định như phân tích thật | P2; [server](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/server/index.ts:1381>) và [giao diện](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/src/components/PredictiveAnalyticsCell.tsx:83>) | Server trả xác suất mua/rời bỏ đều 50 và giờ liên hệ cố định; giao diện vẫn báo AI đã phân tích. Cần dùng mô hình thật hoặc ghi rõ đây là dữ liệu tham khảo theo quy tắc. |
| Nhập tài liệu/OCR chưa đủ | P2; [xử lý tài liệu](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/server/index.ts:1407>) | Ảnh chưa OCR; trích xuất PDF dùng cách đọc đơn giản, không bảo đảm PDF nén/font đặc biệt; định dạng chưa hỗ trợ trả không trích xuất được. Cần parser/OCR và báo kết quả nhập rõ ràng. |
| Quy chế lương chưa ban hành được | P2; [màn hình quy chế](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/src/pages/PayrollSettingsPage.tsx:332>) | Chỉ có danh mục công thức tham khảo. Chưa có phiên bản văn bản, duyệt, đính kèm, công bố, nhân viên xem và xác nhận. |
| Trạng thái tổng quan lương chưa đồng nhất với kiểm tra trước khi tính | P2; [ma trận tổng quan](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/src/pages/PayrollSettingsPage.tsx:234>) | “Sẵn sàng khung” chưa xét hồ sơ nguồn lương, nhóm đang hoạt động và đầy đủ điều kiện tiền ăn/BHXH/tăng ca. Sản phẩm bổ sung hiển thị theo đơn giá toàn hệ thống dù nguồn sản lượng của người đó có thể tắt. Cần dùng chung kết quả kiểm tra nghiệp vụ. |
| Dữ liệu kiểm thử còn lẫn dữ liệu vận hành | P2; SQL xác nhận 43 nhân sự hoạt động, 37 dòng HARDEN/PAYTEST | Trang lương có ẩn kiểm thử, nhưng tổng quan vẫn đếm 43 nhân sự. Cần nhận diện dữ liệu kiểm thử thống nhất, đối soát phụ thuộc rồi mới dọn hoặc tách khỏi môi trường vận hành. |
| Đơn sản xuất lịch sử đã hoàn thành nhưng không có sản lượng | P2; SQL xác nhận SX-LOCAL-1789871865141, kế hoạch 4, tốt 0, phế phẩm 0 | Kiểm tra chặn hoàn thành mới đã được thêm trước đó; dòng lịch sử vẫn cần đối soát và điều chỉnh có nhật ký. Không tự suy đoán sản lượng để sửa số liệu. |
| Ngôn ngữ chưa 100% tiếng Việt | P3; quan sát trực tiếp tổng quan và mã AI | Tổng quan còn hiện shipped, AI còn “Predictions Updated” và tên yếu tố tiếng Anh. Cần bảng nhãn trạng thái thống nhất và rà soát thông báo/Excel. |
| Chấm công qua đêm chưa hỗ trợ | P3, giới hạn tính năng; [hàm tính giờ](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/server/index.ts:7036>) | Giờ ra phải sau giờ vào trong cùng ngày. Chỉ cần mở rộng nếu xưởng có ca qua đêm; khi mở rộng phải xử lý ngày công, nghỉ giữa ca và tăng ca. |

## Phụ thuộc đăng nhập còn tồn tại — chủ động theo yêu cầu trước đây

Có 12 tài khoản hoạt động; 10 tài khoản đồng bộ chưa có password_hash local. Các tài khoản này vẫn phải kiểm tra mật khẩu qua cầu nối Supabase Auth khi đăng nhập bằng mật khẩu cũ.

Đây là lựa chọn chuyển tiếp đã được yêu cầu để giữ tài khoản cũ, không phải lỗi tự phát. Tuy nhiên, mục tiêu ngừng Supabase hoàn toàn vẫn chưa đạt ở phần đăng nhập.

[Luồng đăng nhập hiện tại](<C:/Users/Lenovo/Desktop/Tổng hợp dự án/crm-joliefam-main (1)/crm-joliefam-main/docs/local-auth-transition.md:1>) không tự lưu mật khẩu local sau khi xác thực qua Supabase. Trước khi tắt cầu nối phải thiết lập/đổi mật khẩu local cho các tài khoản còn thiếu và kiểm thử đăng nhập với cầu nối tắt. Không kết luận tài khoản đang bị lỗi đăng nhập chỉ từ lỗi quota của đồng bộ; lượt này chưa thử mật khẩu người dùng.

## Nợ chất lượng và vận hành

- npm audit --omit=dev báo sáu gói có cảnh báo: một mức cao, bốn trung bình, một thấp. Mức cao là brace-expansion; các gói khác gồm DOMPurify, ExcelJS, React Router và uuid. Đây là cảnh báo phiên bản phụ thuộc, chưa chứng minh có đường khai thác trong CRM. Cần xét khả năng ảnh hưởng thực tế và nâng cấp có kiểm tra; không chạy audit fix --force vì đề xuất có thay đổi phiên bản lớn.
- Lint: src có 671 lỗi/48 cảnh báo; Supabase functions cũ có 115 lỗi; mục khác một lỗi. Phần lớn là any; có cảnh báo phụ thuộc React hooks. Cần xử lý theo rủi ro, không đánh đồng các cảnh báo với lỗi runtime.
- Build còn hai gói JavaScript khoảng 939 và 950 kB sau minify; cần xem lượng tải ban đầu, chia gói và đo trên mobile. Browserslist báo dữ liệu 24 tháng tuổi.
- Có nhiều thay đổi/chức năng local chưa được đưa vào commit trong checkout hiện tại. Cần mốc phiên bản có thể phục hồi và quy trình kiểm thử trước phát hành; lượt kiểm tra này không tạo commit hay thay đổi lịch sử.
- Tài liệu runtime có chỗ đã lạc hậu so với mã về đăng nhập và đánh dấu xóa nguồn. Cần cập nhật sau khi thống nhất cơ chế đồng bộ.

## Thứ tự xử lý đề nghị

1. Sửa tính đúng/đầy đủ của đồng bộ và khôi phục quyền đọc nguồn; đối soát số liệu và file đính kèm.
2. Hoàn thiện chính sách tiền lương theo quy định đã duyệt; cấu hình năm nhân sự còn thiếu; kiểm thử đối chiếu Excel trước chốt kỳ.
3. Đồng nhất trạng thái tổng quan với kiểm tra nghiệp vụ; xử lý dữ liệu kiểm thử và đơn lịch sử có vấn đề.
4. Hoàn thiện GHN, hóa đơn, AI/tài liệu theo phạm vi vận hành cần dùng.
5. Hoàn thiện ban hành quy chế và chuyển mật khẩu local nếu chuẩn bị ngừng Supabase.
6. Kiểm thử toàn bộ luồng theo từng vai trò trên desktop/mobile; xử lý phụ thuộc bảo mật, lint, hiệu năng và chốt mốc phiên bản.

Chưa đủ bằng chứng để tuyên bố toàn bộ dự án hết lỗi hoặc đủ điều kiện phát hành.

