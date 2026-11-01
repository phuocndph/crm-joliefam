# Đánh giá và kế hoạch quản lý hóa đơn — 27/10/2026

## 1. Mục tiêu đã chốt

Nguồn đầu ra là **Viettel S-Invoice/VinVoice**. Nguồn đầu vào là **cổng hóa đơn điện tử của cơ quan thuế**. CRM cần đồng bộ, quản lý hóa đơn, tạo nháp và liên kết bộ hồ sơ hợp đồng/chứng từ/thanh toán. **Chưa ký hoặc phát hành hóa đơn từ CRM.**

Đây là báo cáo đánh giá và đề xuất triển khai; chưa sửa ứng dụng, database, kết nối tài khoản hay thực hiện nghiệp vụ trên nhà cung cấp.

## 2. Kết luận về trang hiện tại

Trang `/einvoices` chưa đáp ứng việc quản lý đầu vào–đầu ra và hồ sơ hợp đồng chặt chẽ. Đã có nền danh sách hóa đơn, nháp, dữ liệu Viettel lịch sử và liên kết hợp đồng đơn giản. Phần local hiện chưa có adapter đồng bộ Viettel, chưa có nguồn cổng thuế, chưa có phân bổ hợp đồng/thanh toán và kho chứng từ đầy đủ.

Quan sát trực tiếp trên `http://127.0.0.1:8083/einvoices`:

- Trang hiển thị **90 nháp và 412 hóa đơn đã phát hành**. Đây là số bản ghi được hiển thị, chưa phải bằng chứng đã đồng bộ đủ hoặc đã đối chiếu hợp lệ.
- Banner ghi “Đang kết nối” theo lần đăng nhập thành công **23/08/2026**, trong khi ngày đánh giá là 27/10/2026. Trạng thái này không chứng minh kết nối hiện tại đang hoạt động.
- Thanh công cụ nhiều màu, nhiều nút ngang hàng; bảng 15–17 cột phải cuộn ngang trong khung ứng dụng. Các thông tin cần làm việc như hợp đồng, hồ sơ thiếu và người xử lý chưa có vị trí rõ.
- Ở các dòng đầu của tab đã phát hành, có tên người mua đang trống và số hóa đơn hiển thị giống chuỗi ký hiệu. Cần đối chiếu nguồn gốc trước khi kết luận dữ liệu hóa đơn sai; không tự sửa hàng loạt.

### Các vấn đề phải xử lý trước tích hợp

| Mức ưu tiên | Bằng chứng hiện tại | Việc cần làm |
|---|---|---|
| P0 — đúng tiền | Nháp local tính subtotal nhưng ghi tổng sau thuế vào cả `total_amount` và `total_with_vat` (`server/index.ts:5336`, `5363`). UI lại gọi `total_amount` là trước thuế. | Chuẩn hóa tiền/thuế phía server, làm tròn rõ ràng; xác minh nháp hiện có bằng đối chiếu, không tự ghi đè lịch sử. |
| P0 — giữ trạng thái nguồn | Route `/api/einvoices/:id/issue` local có thể đổi một bản ghi bất kỳ thành nháp; update và action log tách nhau (`server/index.ts:5386`). | Khóa tác vụ phát hành trong phạm vi này ở cả UI/API; bảo vệ hóa đơn đã đồng bộ, ghi audit cùng giao dịch cho các thay đổi nội bộ. Không thử lỗi trên hóa đơn thật. |
| P0 — phạm vi truy cập | API list chưa lọc doanh nghiệp/owner; settings lấy bản mới nhất toàn bảng; quyền đang dùng chung module hợp đồng (`server/index.ts:5261`, `5310`; `server/module-permissions.ts:93`). | Tách doanh nghiệp/MST với người quản lý; quyền xem, nhập, sửa nháp, đối chiếu, duyệt nội bộ và cấu hình theo phạm vi được cấp. |
| P1 — trạng thái đáng tin | Banner dựa vào `last_login_status`; cột Mã CQT có dấu xanh cố định (`EInvoiceManagement.tsx:202`; `IssuedInvoicesTable.tsx:275`). | Hiển thị nguồn, lần kiểm tra, khoảng dữ liệu đã đồng bộ; chưa có bằng chứng phải ghi “Chưa xác minh”. Không dùng icon cố định để khẳng định CQT xác nhận. |
| P1 — thao tác đúng tên | Nút Sửa mở xem trước; “Phát hành nhiều” mở đồng bộ nháp; “Nhập hóa đơn” chưa có handler (`EInvoiceManagement.tsx:270`; `DraftInvoicesTable.tsx:197`, `203`). | Bỏ nút chưa hỗ trợ; đúng một thao tác cho mỗi nhãn. Nháp phải sửa và lưu lại được. |
| P1 — chứng từ gốc | PDF local tự sinh là bản tóm tắt nội bộ (`server/index.ts:5422`). | Phân biệt PDF nháp CRM với XML/PDF gốc từ nguồn. Không coi tải PDF nội bộ là đã có bộ hóa đơn gốc. |

Hosted Edge Function `supabase/functions/vinvoice-api/index.ts` có các nhánh tích hợp Viettel nhưng không chạy trong đường local. Chỉ dùng làm tài liệu tham khảo: fallback sync hiện có một trang dữ liệu, định danh dự phòng thiếu ký hiệu/mẫu, trạng thái lạ mặc định thành issued. Cần thiết kế và kiểm thử adapter local thay vì chuyển nguyên trạng.

## 3. Hai nguồn kết nối

### Viettel — hóa đơn đầu ra và nháp

Kết nối qua API chính thức được cấp cho đúng doanh nghiệp/MST. Cần xác nhận endpoint, phương thức xác thực, quyền tài khoản/gói dịch vụ, phiên bản dữ liệu, mẫu/ký hiệu và môi trường thử nghiệm với Viettel.

Các chức năng trong phạm vi:

- Lấy danh sách, chi tiết, trạng thái và XML/PDF của hóa đơn đầu ra đã có.
- Lấy nháp Viettel nếu API được cấp hỗ trợ.
- Tạo/sửa **nháp CRM** từ hợp đồng/đơn hàng.
- Thiết kế riêng bước **Lưu nháp lên Viettel** nếu tài khoản/API hỗ trợ và được đưa vào đợt triển khai. Bước này là thao tác ghi lên nhà cung cấp, phải có định danh ổn định và đối soát khi timeout; không dùng API phát hành để thay thế.

Hai nhãn phải phân biệt: **“Nháp CRM — chưa gửi Viettel”** và **“Nháp Viettel — chưa phát hành”**. Không coi HTTP 200 hoặc lưu nháp thành công là đã phát hành.

### Cổng thuế — hóa đơn đầu vào và nguồn đối chiếu

Đã kiểm tra trang công khai `https://hoadondientu.gdt.gov.vn/`: có tra cứu từng hóa đơn, yêu cầu MST người bán/ký hiệu/số hóa đơn/CAPTCHA, có đọc XML và đăng nhập. Chưa đăng nhập tài khoản doanh nghiệp, chưa xác minh giao diện nghiệp vụ sau đăng nhập hoặc quyền truy cập dữ liệu hàng loạt.

**Chưa xác minh được API đồng bộ hàng loạt được hỗ trợ dành cho tài khoản này.** Không cam kết chỉ nhập tài khoản là CRM tự lấy đủ toàn bộ hóa đơn.

Kế hoạch hai đường:

1. Ưu tiên connector/API chính thức hoặc dịch vụ được doanh nghiệp cấp quyền, sau khi xác minh tài liệu và phạm vi sử dụng.
2. Có đường nhập hàng loạt từ tệp được người dùng tải hợp lệ: danh sách Excel và XML/PDF/ZIP tương ứng trong phạm vi nguồn cho phép. Nếu chỉ có danh sách Excel, hiển thị rõ **“Thiếu chứng từ gốc”**; có thể bổ sung XML từ nhà cung cấp sau.

Nếu cần đăng nhập/xác nhận phiên, người có quyền thực hiện trên cổng chính thức. Không thiết kế lấy cookie, né CAPTCHA hoặc phụ thuộc API nội bộ không được công bố làm nền đồng bộ ổn định.

Cổng thuế có thể là nguồn đối chiếu cả đầu ra. Một hóa đơn đầu ra xuất hiện ở Viettel và cổng thuế phải được hợp nhất thành **một hồ sơ với hai nguồn bằng chứng**, không tạo hai hóa đơn.

## 4. Luồng vận hành đề xuất

```text
Viettel đầu ra ───────────┐
Cổng thuế đầu vào ───────┼→ Tiếp nhận → Kiểm tra → Gắn hồ sơ → Đối chiếu → Theo dõi/chốt kỳ
Tệp XML/PDF/danh sách ───┘

Hợp đồng/đơn hàng → Chọn đợt/dòng hàng → Nháp CRM → Kiểm tra nội bộ
                                                   └→ Nháp Viettel (khi hỗ trợ)
```

### Bước 1 — tiếp nhận

Chọn doanh nghiệp/MST, nguồn và khoảng ngày. Mỗi lần nhận báo rõ: mới, cập nhật, đã có, cần kiểm tra, lỗi. Có nhật ký khoảng ngày, trang dữ liệu và thời điểm hoàn tất. Mất kết nối không xóa dữ liệu đã nhận; đồng bộ chưa đủ không được báo “đã lấy đầy đủ”.

Xác định đầu vào/đầu ra theo MST người mua/người bán so với doanh nghiệp đang quản lý. MST không thuộc doanh nghiệp, hoặc cả hai bên cùng trùng doanh nghiệp, phải đưa vào hàng chờ, không tự gắn chiều.

### Bước 2 — kiểm tra hóa đơn

Kiểm tra định danh, thông tin hai bên, trước thuế/VAT/tổng theo dòng và từng mức thuế, ngày, loại tiền, tệp gốc và trạng thái nguồn. Giữ các quan hệ điều chỉnh/thay thế đã có theo nguồn. Trạng thái chưa hiểu phải đưa vào “Cần kiểm tra”, không mặc định hợp lệ.

Lưu XML/PDF gốc bất biến, checksum, nơi lấy, thời điểm lấy và phiên bản nội dung. URL tải tạm không thay thế kho file. Nếu nguồn không cung cấp một file, ghi nhận thiếu cụ thể; không tự tạo bản giả để lấp chỗ thiếu.

Tải được XML hoặc xuất hiện trên cổng thuế không tự đồng nghĩa được khấu trừ thuế hay đã đủ điều kiện ghi nhận chi phí. Kế toán xác nhận theo hồ sơ và quy định áp dụng.

### Bước 3 — gắn hồ sơ hợp đồng/chứng từ

- **Đầu ra:** hợp đồng bán, phụ lục, đơn hàng, giao hàng/biên bản nghiệm thu, phiếu thu hoặc giao dịch liên quan.
- **Đầu vào:** hợp đồng mua/đơn mua nếu có, giao nhận/nhập kho hoặc chứng từ dịch vụ, đề nghị/phiếu chi và giao dịch liên quan.
- Điện, nước, vận chuyển và chi phí không có hợp đồng được gắn hồ sơ chi phí và lý do phù hợp, không ép tạo hợp đồng giả.

Gợi ý theo MST đối tác, mã tham chiếu, thời gian và giá trị; người dùng xác nhận. Không tự gắn chỉ vì tên gần giống.

Hỗ trợ một hợp đồng nhiều hóa đơn theo đợt; khi cần, một hóa đơn phân bổ cho nhiều hợp đồng/chứng từ. Tổng phân bổ không vượt phần giá trị hợp lệ của hóa đơn, có kiểm soát chênh lệch và lịch sử sửa. Giữ hợp đồng bán hiện có; phần hợp đồng mua cần mở rộng có chủ đích vì hiện mô hình hợp đồng chủ yếu phục vụ bán hàng.

### Bước 4 — đối chiếu và thanh toán

Trong từng hợp đồng, hiển thị rõ:

- Giá trị hợp đồng và phụ lục hiệu lực, giá trị theo đợt/biên bản nếu có.
- Giá trị hóa đơn đã phân bổ, giá trị nháp đang giữ chỗ và phần còn lại; tránh đếm nháp và hóa đơn phát hành cho cùng một phần nghĩa vụ hai lần.
- Đã thu/chi được phân bổ từ sổ giao dịch hiện có; còn phải thu/phải trả dựa nghĩa vụ được xác nhận.
- Thiếu XML/PDF, hợp đồng/phụ lục, giao nhận/nghiệm thu hay chứng từ thanh toán nào.

Hóa đơn, hợp đồng, hàng đã nhận/giao và tiền đã thu/chi là các sự kiện khác nhau. Nhận hóa đơn không tự ghi nhận doanh thu/chi phí, tạo thu/chi hoặc nhập kho. Nếu một phiếu thu/chi liên quan nhiều hóa đơn, phân bổ rõ ràng và không cộng lại vào sổ tiền.

### Bước 5 — nháp và chốt hồ sơ

Nháp chọn từ hợp đồng/đơn hàng, chọn đợt hoặc dòng cần lập, kiểm tra phần còn lại. Lưu snapshot pháp nhân, MST, địa chỉ, dòng hàng, thuế và tiền; master khách hàng/hợp đồng đổi về sau không âm thầm sửa nội dung nháp đã kiểm tra.

Tạo nháp thủ công vẫn được phép trong quyền phù hợp nhưng phải có lý do và nguồn nghiệp vụ. Có sửa, xem trước, lịch sử và chống lưu trùng khi retry. Sửa nội dung nháp đã kiểm tra phải đưa về “Cần kiểm tra lại”. Mẫu/ký hiệu chưa lấy được từ nguồn phải ghi là chưa xác minh, không tự chọn mẫu lịch sử cho mọi kỳ.

Cuối kỳ xuất danh sách đầu vào/đầu ra, danh sách chênh lệch và bộ chứng từ theo quyền. Chốt kỳ là mốc kiểm tra nội bộ; không ngăn nhận bằng chứng mới từ nguồn. Thay đổi sau chốt tạo cảnh báo và quy trình mở lại, không âm thầm sửa báo cáo đã chốt.

## 5. UX đề xuất

Ba tab chính: **Cần xử lý | Đầu vào | Đầu ra**. Nháp nằm trong Đầu ra với bộ lọc riêng; không cần một trang vận hành nháp song song.

Trên cùng:

- Doanh nghiệp/MST và kỳ xem.
- Số hóa đơn đầu vào, đầu ra, chưa gắn hồ sơ và hồ sơ thiếu; mỗi thẻ bấm để lọc.
- Các thao tác rõ: **Đồng bộ**, **Nhập tệp**, **Tạo nháp**. Cấu hình nguồn đặt riêng sau biểu tượng cài đặt theo quyền.

Bảng chỉ giữ: số/ký hiệu + ngày, đối tác/MST, trước thuế–VAT–tổng, hợp đồng/hồ sơ, tình trạng xử lý. Cột kỹ thuật và ít dùng mở theo nhu cầu. Bộ lọc: kỳ/ngày, đối tác/MST, trạng thái, hợp đồng, thiếu file, nguồn. Phân trang và lọc phía server, không tải mọi payload hóa đơn vào trình duyệt.

Bấm một dòng mở chi tiết: **Tổng quan | XML/PDF gốc | Hợp đồng & chứng từ | Thanh toán | Lịch sử**. Có các việc tiếp theo cụ thể như “Gắn hợp đồng”, “Bổ sung XML”, “Xác nhận chênh lệch”. Không chỉ báo lỗi chung.

Trong trang hợp đồng hiện có, bổ sung phần **Hóa đơn & thanh toán** của đúng hợp đồng: các đợt, hóa đơn, phân bổ, số còn lại và tài liệu thiếu.

Tách các nhóm trạng thái:

| Nhóm | Ví dụ |
|---|---|
| Nguồn/kết nối | Đã cấu hình; kiểm tra thành công lúc…; hết phiên; đồng bộ chưa đủ |
| Hóa đơn theo nguồn | Nháp; đã phát hành; bị thay thế; điều chỉnh; trạng thái khác cần xác minh |
| Hồ sơ nội bộ | Chưa kiểm tra; chưa gắn hồ sơ; thiếu chứng từ; lệch; đã đối chiếu |
| Tiền | Chưa phân bổ thanh toán; một phần; đủ; cần đối soát |

Những nhóm này không tự suy ra lẫn nhau. Không dùng một badge “Đã phát hành” để biểu thị đã kiểm tra, đã có hợp đồng và đã trả tiền.

## 6. Nền dữ liệu và kết nối

Mở rộng sổ `local_einvoices` hiện có làm hồ sơ hóa đơn chuẩn; thêm các bảng con cần thiết, không tạo một sổ hóa đơn độc lập cho từng nguồn.

- Doanh nghiệp/MST, chiều hóa đơn, hai bên giao dịch và định danh nguồn.
- Dòng hóa đơn, thuế theo dòng/nhóm, tiền tệ và dữ liệu nguyên bản.
- Nhiều bằng chứng nguồn cho cùng một hóa đơn; XML/PDF và lịch sử phiên bản.
- Các lần đồng bộ, lỗi, checkpoint, độ phủ dữ liệu.
- Liên kết/phân bổ hợp đồng, đơn hàng/chứng từ, thanh toán và quan hệ điều chỉnh/thay thế.
- Nhật ký ai nhập, ai xác nhận, thời điểm và lý do thay đổi.

Chống trùng bằng định danh provider hoặc khóa gồm doanh nghiệp, MST người bán, mẫu/ký hiệu, số hóa đơn và yếu tố cần thiết theo đặc tả nguồn; không chỉ dùng số hóa đơn hoặc checksum file. Nháp chưa có số phải có ID ổn định riêng. Đối chiếu hai nguồn chưa chắc chắn phải chờ xác nhận.

Đồng bộ chỉ cập nhật dữ liệu nguồn; không ghi đè phân bổ hợp đồng, ghi chú, thanh toán hoặc kết quả kiểm tra nội bộ. Xung đột trạng thái/tiền từ hai nguồn cần được lưu và hiển thị.

Credentials chỉ lưu/đọc phía server theo phạm vi doanh nghiệp, không trong bundle trình duyệt hay log. Quản lý cấu hình, xem hóa đơn và xem tệp gốc đều kiểm tra quyền riêng. Có backup database + file chứng từ và kiểm thử phục hồi; chỉ backup database là chưa đủ.

## 7. Các đợt triển khai

| Đợt | Kết quả phải bàn giao | Điều kiện hoàn tất |
|---|---|---|
| 1 — nền đúng và UI rõ | Sửa tiền/nháp/trạng thái/quyền; gỡ thao tác phát hành và nút giả; hiển thị đúng chế độ local và tuổi dữ liệu; sổ đầu vào/đầu ra cùng kho file | Không nhầm trạng thái, không sửa hóa đơn đã đồng bộ thành nháp; tiền và phạm vi dữ liệu có kiểm thử cô lập |
| 2 — nhận dữ liệu | Connector Viettel chỉ đọc; nhập tệp cổng thuế; connector cổng thuế tự động nếu đã xác minh hỗ trợ; chống trùng và độ phủ kỳ | Đồng bộ/import lặp không trùng, lấy đủ phân trang, có nguồn và file/báo thiếu, mất kết nối giữ dữ liệu cũ |
| 3 — quản lý hồ sơ | Hàng chờ cần xử lý, gắn/phân bổ hợp đồng–chứng từ–thanh toán, đối chiếu và báo cáo thiếu | Hợp đồng nhiều đợt hoạt động; không phân bổ vượt, không tính tiền hai lần; tra được bộ hồ sơ từ hóa đơn và hợp đồng |
| 4 — nháp thuận tiện | Tạo/sửa nháp từ hợp đồng/đơn hàng theo phần còn lại; xem trước, kiểm tra nội bộ; lưu nháp Viettel khi API được xác minh | Retry không tạo trùng; tách nháp CRM/Viettel; không có thao tác ký/phát hành trong cả UI/API |

Đợt 2 không bị chặn toàn bộ nếu chưa có connector cổng thuế: nhập tệp là đường vận hành chính thức ban đầu, không coi đó là đồng bộ tự động. Chưa ước lượng thời gian trước khi xác minh API, quyền tài khoản và mẫu dữ liệu nguồn.

## 8. Tiêu chí nghiệm thu nghiệp vụ

1. Nhập cùng hóa đơn ba lần từ cùng nguồn vẫn một hồ sơ; nhận thêm từ nguồn khác không nhân đôi.
2. Cùng số hóa đơn nhưng khác ký hiệu/MST không gộp nhầm; cùng file đổi tên vẫn nhận diện đã nhập.
3. Sai MST doanh nghiệp không tự gắn; người ngoài phạm vi không xem được hóa đơn, tệp hoặc cấu hình.
4. Tiền trước thuế + VAT khớp tổng theo quy tắc được chốt; hỗ trợ nhiều mức thuế và loại tiền, chênh lệch phải hiện rõ.
5. Đồng bộ lại không mất liên kết hợp đồng, ghi chú, lịch sử hay phân bổ thanh toán.
6. Hợp đồng nhiều hóa đơn; hóa đơn chia nhiều hồ sơ; nháp giữ chỗ không cho lập trùng hoặc vượt phần còn lại.
7. Hóa đơn điều chỉnh/thay thế giữ chuỗi gốc; báo cáo không cộng trùng hóa đơn bị thay thế và bản thay thế. Điều chỉnh tăng/giảm được tính theo bản chất, không bỏ mọi bản gốc một cách máy móc.
8. Chỉ có Excel thì cảnh báo thiếu hồ sơ gốc; PDF nháp CRM không được đánh dấu là XML/PDF gốc.
9. Mất mạng, hết phiên hoặc lỗi một trang đồng bộ báo chưa hoàn tất và chạy tiếp an toàn.
10. Nháp sửa/lưu/retry không phát hành, không thay đổi phiếu thu/chi hay kho; backup phục hồi được cả dữ liệu và chứng từ.

## 9. Phạm vi kiểm tra và nguồn

- Rà soát chỉ đọc mã, schema và tài liệu tại commit `50989db`; hai nhánh audit độc lập về đường thực thi và nghiệp vụ. Không chạy payload lỗi trên API/database thật và không thực hiện thao tác ghi/đăng nhập nhà cung cấp.
- Đọc trang CRM đang có phiên, hai tab nháp/đã phát hành. Các thao tác thử không bao gồm tạo, xóa, phát hành, đồng bộ hoặc tải hóa đơn thật.
- Đã mở cổng [Viettel VinVoice](https://vinvoice.viettel.vn/); trang đăng nhập trỏ tới [hướng dẫn sử dụng/tích hợp API](https://sme.viettel.vn/content_v2/guideline_v2/service/37/SINVOICE#). Trang tài liệu đích không tải được nội dung trong phiên kiểm tra; chưa xác minh đặc tả API hiện hành.
- Đã mở [cổng hóa đơn điện tử cơ quan thuế](https://hoadondientu.gdt.gov.vn/), xem tra cứu công khai và mục hỗ trợ. Chưa đăng nhập hoặc giải CAPTCHA, chưa xác minh API/gói dịch vụ hay khả năng xuất hàng loạt sau đăng nhập.
- Quy chế thời điểm lập, điều chỉnh, khấu trừ, lưu trữ và nghiệp vụ thuế phải được kế toán xác nhận theo quy định áp dụng khi triển khai. Báo cáo này không xác nhận tính hợp lệ thuế của 502 bản ghi đang hiển thị.

**Ưu tiên đề xuất:** hoàn thiện nền dữ liệu và luồng nhận–đối chiếu hồ sơ trước, sau đó đưa nháp từ hợp đồng vào cùng quy trình. Phát hành giữ ngoài phạm vi đã chốt.
