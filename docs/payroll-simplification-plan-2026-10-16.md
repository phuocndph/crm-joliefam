# Kế hoạch đơn giản hóa luồng tiền lương

Ngày: 16/10/2026. Trạng thái: đã triển khai mã nguồn và kiểm thử cách ly; xem `payroll-simplification-report-2026-10-16.md` để biết kết quả và trạng thái khởi chạy. Không thao tác duyệt/tính/khóa trên dữ liệu kinh doanh.

## Vấn đề hiện tại

1. Có 10 tab cùng cấp. Thiết lập ít thay đổi (nhóm, mức lương, BHXH) nằm ngang với vận hành tháng (kỳ lương, phụ cấp/khấu trừ).
2. Tổng quan và Nhân sự cùng hiển thị ma trận cấu hình rộng. Hồ sơ lương tập trung đã lưu nhiều thành phần, nhưng các tab lương tháng/giờ, BHXH và bảng phân loại vẫn là lối thiết lập song song.
3. Nhãn “Sẵn sàng” chưa cùng nghĩa: Tổng quan xét hôm nay và một số trường cơ bản; Nhân sự tự kiểm tra khác, còn đòi đơn giá giờ cho mọi OT. Engine v3 hỗ trợ OT cố định và OT quy đổi lương tháng, và kiểm tra đúng từng ngày trong kỳ.
4. Quy chế lương chứa cả cấu hình tính thật đã duyệt và danh mục tài liệu “Chưa ban hành/Tham khảo”, khiến người dùng khó biết thứ gì có tác dụng tính tiền.
5. Nút “Duyệt tất cả” hồ sơ lương gọi nhiều API tuần tự. Lưu hồ sơ là một giao dịch, nhưng duyệt hiện chưa nguyên khối; có thể duyệt dở nếu bước sau thất bại.
6. Điều hướng lỗi kỳ lương chỉ xử lý một số mã cũ. Lỗi lịch công, quy tắc, quyết toán có thể dẫn về chấm công; người dùng phải tự tìm nơi sửa.
7. Duyệt hồ sơ nhân viên tự khai ở `/profile-review` và duyệt cấu hình lương là hai việc khác nhau, nhưng thiếu chỉ dẫn nối luồng.
8. Biểu mẫu tập trung nói thay đổi là nháp nhưng thông tin master nhân sự (cơ sở, ngày vào/nghỉ, trạng thái) đang cập nhật ngay trong giao dịch; chỉ các phiên bản lương/BHXH chờ duyệt. Cần nói rõ tác dụng từng phần.

Bằng chứng: `src/pages/PayrollSettingsPage.tsx` (tab:125, readiness:253–282/657–675, duyệt:625–633, điều hướng lỗi:184–194); `src/components/PayrollVersionSettings.tsx`; `src/pages/ProfileReviewPage.tsx`; `server/payroll-rules.ts`.

## Cấu trúc đề xuất: 3 mục chính

Đổi tên phân hệ thành **Tiền lương**. Mặc định mở **Bảng lương tháng**; lần đầu chưa có cấu hình thì hiển thị danh sách việc cần hoàn thiện ngay trong màn hình này.

| Mục chính | Nội dung | Chức năng hiện có đưa vào |
|---|---|---|
| Bảng lương tháng | Chọn kỳ/cơ sở, việc cần xử lý, khoản cộng/trừ trong kỳ, kiểm tra, tính thử, đối soát, khóa và lịch sử | Kỳ lương, phụ cấp/khấu trừ phát sinh, phần công việc của Tổng quan |
| Nhân sự & mức lương | Danh sách gọn; mở từng nhân sự để xem/thiết lập lương, khoản cố định, BHXH, ngân hàng và lịch sử | Nhân sự, lương tháng/giờ, BHXH, ngân hàng; liên kết Duyệt hồ sơ nhân sự |
| Thiết lập chung | Nhóm áp dụng, tăng ca/tiền ăn, lịch công, bảng giá công may; lịch sử cấu hình | Quy chế, nhóm chính sách, bảng giá công may |

Các danh mục nâng cao vẫn truy cập được trong mục tương ứng để người có quyền riêng làm việc. Giữ điều hướng tương thích với mọi `?tab=` cũ. Không để người dùng mất lối thao tác chỉ vì không có đủ bốn quyền của biểu mẫu hồ sơ tập trung hiện tại.

## Luồng người dùng

### Nhân sự mới

1. Nhân viên gửi hồ sơ cá nhân; quản lý kiểm tra và duyệt hồ sơ nhân sự tại màn hình hiện hữu.
2. Sau khi duyệt, hiển thị **Thiết lập lương cho nhân sự này** nếu người duyệt có quyền. Dùng lại liên kết user/worker hiện có, không tạo worker trùng khi bấm lại.
3. Mở một hồ sơ lương gồm ba bước: **Cách trả lương → Các khoản áp dụng → Kiểm tra & lưu nháp**.
4. Cách trả lương chỉ hiện trường phù hợp: tháng thì số tiền/tháng; giờ thì số tiền/giờ; sản phẩm thì nhóm/bảng giá áp dụng. Tăng ca/tiền ăn chọn chính sách chung; chỉ hiện thêm trường khi bật khoản đó.
5. Phụ cấp và khấu trừ tách rõ **cố định theo hồ sơ** với **phát sinh riêng trong tháng**. BHXH và tài khoản nhận lương nằm trong chi tiết nhân sự, hiển thị theo quyền.
6. Trước duyệt, hiện mức cũ → mức mới, ngày hiệu lực, các thành phần sẽ duyệt và lý do. Trạng thái hồ sơ cá nhân và trạng thái cấu hình lương hiển thị riêng.

Thông tin nhân sự áp dụng ngay được tách khỏi phần phiên bản lương chờ duyệt. Nếu muốn cả cơ sở/ngày làm/trạng thái cũng chờ duyệt thì cần thiết kế lưu thay đổi chờ duyệt ở backend, không thể chỉ đổi nhãn biểu mẫu.

### Vận hành mỗi tháng

1. **Chọn kỳ và phạm vi**: giữ nguyên kỳ/cơ sở khi chuyển sang màn hình xử lý lỗi rồi quay lại. Phạm vi nhân sự hợp lệ do máy chủ xác định, gồm cả người nghỉ còn nguồn; tìm kiếm bảng không làm thay đổi phạm vi tính.
2. **Hoàn thiện đầu vào**: các nhóm việc gọn như lịch công chưa duyệt, cấu hình thiếu, nguồn chưa duyệt, khoản cộng/trừ cần xử lý. Mỗi dòng có tên người, ngày liên quan và nút mở đúng nơi sửa. Phân biệt rõ thiếu dữ liệu với không có quyền xử lý.
3. **Tính thử & đối soát**: kiểm tra trên máy chủ, sau đó tạo preview. Có thể dùng một nút “Kiểm tra và tính thử”; chỉ tạo preview nếu kiểm tra đạt. Không tự duyệt nguồn hoặc cấu hình.
4. **Khóa & xuất**: hiển thị kỳ/phạm vi, số người, tổng thu nhập, khấu trừ, thực nhận và cảnh báo trước khi khóa. Xuất CSV hiện có. Khóa bảng lương không đồng nghĩa đã chuyển khoản.

Màn hình chính ưu tiên “Còn việc gì?” và “Thao tác tiếp theo”. Danh sách lần tính cũ thu gọn vào **Lịch sử kỳ**, không đặt ngang phần đang làm. Tiến độ là cách trình bày luồng hiện có, không tạo trạng thái nghiệp vụ mới ở database trong đợt đầu.

### Thiết lập dùng lâu dài

- Mỗi nhóm hiển thị tóm tắt ai đang áp dụng, tăng ca ngày thường/Chủ nhật/lễ và tiền ăn. Tạo nhóm/quy tắc vẫn dùng dữ liệu và API hiện hữu; nếu có bước lưu nhiều cấu hình thì không gọi đó là một giao dịch cho đến khi backend hỗ trợ.
- Lịch công đặt cạnh kỳ lương với nút tạo lịch đúng tháng/cơ sở. Cho nhập giờ/phút thân thiện, chuyển đổi sang phút ở biên API chính xác và giữ giới hạn hiện tại.
- Có thể sao chép cấu hình đã có sang **bản nháp** kỳ tiếp theo, nhưng phải chọn và kiểm tra lại ngày công/ngày hiệu lực; không tự duyệt, không tự đặt 26 ngày hay tiền ăn/hệ số.
- Chọn cơ sở từ dữ liệu cơ sở hiện có; nếu chưa có danh mục chuẩn thì giữ nhập mã có kiểm tra, không tự dựng danh mục mới. Không trộn “tất cả cơ sở” với “chưa gán cơ sở”.
- Rule/lịch công đã duyệt hiện chưa có quy trình kết thúc hoặc thay thế. Chỉ cho tạo nháp trong khoảng không giao nhau; thay thế khoảng đang có hiệu lực cần thiết kế API/migration riêng, không hứa làm chỉ bằng nút giao diện.
- Tài liệu công thức tham khảo đưa vào phần **Hướng dẫn**, tách khỏi cấu hình đang dùng. Việt hóa trạng thái và loại OT; mã kỹ thuật chỉ hiện trong chi tiết hỗ trợ.

## Các ranh giới phải giữ

- “Hồ sơ đã thiết lập” khác “Đủ dữ liệu tính kỳ này”. Chỉ kết quả kiểm tra máy chủ mới được hiển thị là sẵn sàng tính; kiểm tra cũ phải hết hiệu lực khi kỳ/phạm vi/nguồn thay đổi.
- Lương, BHXH, ngân hàng và tổng tiền hiển thị theo quyền. Bộ đếm công việc cũng không được tiết lộ dữ liệu ngoài phạm vi. Giao diện không tự cấp thêm quyền.
- Cấu hình duyệt theo phiên bản và ngày hiệu lực; dữ liệu đã duyệt/đã khóa bất biến. Đổi bố cục không đổi công thức hoặc kết quả tiền.
- Quyết toán người nghỉ có khoản cố định, nghỉ hưởng lương và công thường ngày lễ chưa được hỗ trợ vẫn hiện việc cần đối soát; không biến thành nút tự bỏ qua lỗi.
- Nút duyệt một hồ sơ phải chọn rõ bộ phiên bản cần duyệt. Không duyệt mọi bản nháp lịch sử hoặc nhiều ngày hiệu lực chỉ vì cùng một nhân viên.

## Thứ tự triển khai

### Đợt 1 — Gỡ rối điều hướng và chỉ dẫn

- Đổi thành 3 mục chính, mặc định Bảng lương tháng; tái sử dụng thành phần/API và bảo toàn link cũ.
- Thay Tổng quan ma trận bằng danh sách việc theo kỳ; bỏ nhãn sẵn sàng dựa trên kiểm tra frontend chưa đầy đủ. Dùng preflight hiện có cho kết luận tính lương; các chỉ báo chưa đủ nguồn ghi đúng “chưa kiểm tra”.
- Sửa đường dẫn xử lý lỗi theo đầy đủ mã engine v3, mang theo kỳ/phạm vi/nhân sự và lọc bản ghi khi màn hình đích hỗ trợ.
- Tách tài liệu tham khảo; ẩn chi tiết kỹ thuật sau phần mở rộng; đưa bảng nâng cao ra khỏi lối mặc định.
- Phạm vi chính: `PayrollSettingsPage.tsx`, `PayrollVersionSettings.tsx`, thành phần tiền lương mới, nhãn menu và điều hướng liên quan. Ưu tiên không thay schema hoặc công thức ở đợt này.

### Đợt 2 — Một hồ sơ lương, duyệt nhất quán

- Tách hồ sơ thành biểu mẫu theo bước; dùng bundle lưu nháp hiện có.
- Bổ sung endpoint duyệt bộ hồ sơ nguyên khối: kiểm tra đủ quyền, worker/phạm vi, ID phiên bản và nội dung đã đối chiếu, ngày hiệu lực, trạng thái, khóa đồng thời, audit và retry; lỗi ở bất kỳ thành phần nào phải hoàn tác toàn bộ.
- Cập nhật bộ nhớ đệm của mọi phần liên quan sau lưu/duyệt; không giữ trạng thái “sẵn sàng” từ dữ liệu cũ.
- Thêm liên kết từ duyệt hồ sơ nhân sự và lịch sử thay đổi lương. Ngân hàng giữ quy trình riêng khi không thuộc bộ phiên bản lương; không gộp duyệt ngầm.
- Backend/API và test database có thay đổi; chỉ thêm migration nếu thực sự cần bảo toàn định danh bộ phiên bản/idempotency, không sửa migration cũ.

### Đợt 3 — Hoàn thiện trải nghiệm tính tháng

- Trình bày bốn bước vận hành, điều hướng xử lý lỗi rồi trở lại, bảng đối soát gọn và phần lịch sử riêng.
- Nối calendar/adjustment editors hiện hữu vào đúng bước. Nhóm công việc nào API hiện có không cung cấp thì bổ sung API đọc theo quyền; không suy đoán từ các danh sách bị lọc.
- Chưa có tài khoản ngân hàng không tự biến thành lỗi chặn tính lương nếu máy chủ không yêu cầu; hiển thị đúng việc chuẩn bị chi trả riêng.
- Thêm tạo nháp từ kỳ trước sau khi luồng cơ bản ổn định. Kiểm thử mobile, tải dữ liệu, trống, lỗi, retry và đổi kỳ khi request đang chạy.

Không đưa phát hành văn bản quy chế, gửi phiếu lương, file chuyển khoản ngân hàng hay công thức quyết toán mới vào đợt đơn giản hóa giao diện này.

## Điều kiện nghiệm thu

1. Người quản lý mở Tiền lương thấy kỳ đang làm và việc cần xử lý; chỉ còn ba mục cấp cao trên desktop lẫn mobile.
2. Thiết lập một nhân sự từ một hồ sơ, không bắt đi qua các tab lương/BHXH riêng; người có quyền hạn chế vẫn dùng được đúng phần đã được cấp.
3. Thông báo sẵn sàng theo đúng kỳ và kết quả server; OT cố định hợp lệ không bị yêu cầu thêm đơn giá giờ nhân viên.
4. Mỗi lỗi lịch công/quy tắc/nhân sự/nguồn dẫn đúng nơi sửa và quay lại đúng kỳ. Trường hợp chưa hỗ trợ giải thích rõ, không có nút bỏ qua.
5. Nếu duyệt bộ thất bại ở BHXH hoặc mức lương, không phần nào được duyệt dở; thử đồng thời và thử gửi lại không duyệt nhầm phiên bản mới.
6. Số tiền các ca golden, chống khóa khi nguồn đổi, snapshot lịch sử và quyền hiện có đều giữ đúng. Chạy lại bộ chính sách, integrity, v2/scope-concurrency và phân quyền trên database dùng một lần khi có thay đổi tương ứng.
7. Link cũ hoạt động; không rò rỉ lương qua màn hình tổng hợp; không mất dữ liệu nhập khi lỗi mạng. TypeScript, lint phạm vi sửa, build và kiểm tra UI/mobile đạt.
8. Kiểm tra màn hình 375/768/1440px, bàn phím, back/forward, lưu bộ lọc theo kỳ và loading/error riêng từng khu vực. Không yêu cầu tải hết các danh mục mới cho phép dùng phần đã sẵn sàng.

Khuyến nghị thực hiện Đợt 1 trước để giảm rối ngay, sau đó Đợt 2 để bảo đảm lời hứa “một hồ sơ, một lần duyệt”, cuối cùng hoàn thiện Đợt 3 trên nền luồng đã thống nhất.
