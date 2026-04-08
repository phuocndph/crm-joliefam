
Mục tiêu là xử lý triệt để việc AI Quote Fill vẫn báo sai kiểu “T300 sọc không có trong bảng giá” dù sản phẩm có thật, đồng thời nâng độ chính xác khi đọc nhiều yêu cầu trong cùng một đoạn.

1. Khoanh đúng nguyên nhân hiện tại
- Parser đã có fix cơ bản cho section, quantity và “chăn hè chần”, nhưng vẫn còn 3 điểm yếu lớn:
  - Auto-fix `matchedProductId` đang so khớp lại trên `allProducts` thay vì danh sách ứng viên của từng segment, nên có thể kéo item sang sản phẩm “gần giống” nhưng sai section/chất liệu.
  - `findClosestProduct()` vẫn chấm điểm khá thô, đặc biệt phần pattern/material còn đơn giản, nên dễ chọn nhầm T250 khi yêu cầu là T300.
  - UI không hiển thị cảnh báo mức parser/toàn request, nên lỗi phân tích nghiêm trọng vẫn trông như “đã match ổn”.

2. Nâng cấp parser để đọc nhiều yêu cầu cùng lúc ổn định hơn
- Mở rộng logic section để hiểu nhiều kiểu nhập thực tế, không chỉ `Vải T250...`:
  - Header có dấu `:`
  - Header xuống dòng
  - Dấu phân tách `-`, `---`, dòng trống
  - Cụm ngắn như `T300 trắng sọc` không có chữ `Vải`
- Bổ sung cơ chế “section carry-forward”:
  - Trong cùng một block, các sản phẩm kế thừa material/pattern của header gần nhất
  - Khi sang block mới, context cũ không được rò sang block mới
- Chuẩn hóa thêm cách đọc:
  - `12p`, `12cm`, `cao 12`, `1m6`, `1.6x2.0`
  - `4c`, `4 cái`, `x4`
  - Từ đồng nghĩa như `drap`, `rap`, `ga`

3. Chuyển từ “filter toàn cục” sang “ứng viên theo từng segment”
- Với mỗi segment sau khi parse:
  - Tạo danh sách candidate riêng theo category + material + pattern + size
  - Lưu candidate IDs/map theo từng segment
- Khi AI trả item:
  - Không chỉ kiểm tra UUID có tồn tại hay không
  - Phải đối chiếu item đó với segment tương ứng
  - Nếu UUID không thuộc candidate hợp lệ của segment đó, xem là sai match dù UUID có tồn tại trong catalog
- Đây là điểm quan trọng nhất để chặn kiểu:
  - Tên hiện là “Ga chun T300 sọc”
  - Nhưng `matchedProductId` lại đang trỏ sang sản phẩm T250

4. Nâng cấp thuật toán auto-fix để không “bịa đúng kiểu mới”
- Thay `findClosestProduct(itemName, allProducts)` bằng logic có ngữ cảnh:
  - Ưu tiên candidate của segment hiện tại
  - Chỉ fallback ra toàn catalog nếu candidate rỗng
- Chấm điểm mới nên ưu tiên theo thứ tự:
  - Cùng loại sản phẩm
  - Cùng material
  - Cùng pattern
  - Kích thước bằng hoặc lớn hơn gần nhất
  - Tên gần giống
- Thêm luật cứng:
  - Nếu request ghi rõ T300 thì không được fallback sang T250, trừ khi có note cảnh báo rõ ràng và không còn candidate cùng material
  - Nếu ghi rõ sọc thì không được đổi sang trơn
  - Nếu khách ghi kích thước không có trong bảng, được phép lấy size lớn hơn gần nhất nhưng phải giữ `customName/specifications` theo yêu cầu gốc

5. Bắt buộc kiểm tra “đủ dòng, đúng dòng”
- Sau khi AI trả kết quả:
  - So số item với số segment
  - So từng item xem có segment tương ứng chưa
  - Nếu còn segment chưa được map, trả warning mạnh hoặc yêu cầu clarification thay vì âm thầm trả kết quả sai
- Với input nhiều cụm như T250 + T300:
  - Phải có ít nhất 1 item cho mỗi dòng đã parse
  - Không được phép gộp 2 dòng ga chun khác kích thước thành 1

6. Cải thiện hiển thị trên UI để người dùng phát hiện sai ngay
- Trong `AIQuoteFill`:
  - Hiển thị warning tổng nếu parser phát hiện thiếu dòng / mismatch với segment
  - Hiển thị trạng thái từng dòng:
    - Exact match
    - Fallback size
    - Fallback product
    - Uncertain match
- Trong note hiện tại:
  - Tách rõ “Giá theo SP ...” với “Auto-match ...”
  - Nếu material/pattern bị đổi khác yêu cầu, badge phải nổi bật hơn mức cảnh báo hiện tại

7. Thêm test hồi quy cho các ca đang lỗi
- Tạo test cho edge function/parser với ít nhất các ca:
  - T250 sọc + T300 sọc trong cùng request
  - `4c`, `8c`, `x4`
  - `chăn hè chần`
  - Yêu cầu size không tồn tại → lấy size lớn hơn gần nhất
  - Không được đổi T300 thành T250
  - Không được đổi sọc thành trơn
- Đây là phần bắt buộc nếu muốn “triệt để”, vì hiện chưa có test nào cho `lookup-tax-code`.

Chi tiết kỹ thuật
- File chính cần chỉnh:
  - `supabase/functions/lookup-tax-code/index.ts`
- File UI nên cập nhật thêm:
  - `src/components/AIQuoteFill.tsx`
- Hướng refactor nên làm:
  - Tách parser output thành cấu trúc giàu ngữ cảnh hơn, ví dụ segment có `id`, `_pos`, `sourceText`, `constraints`
  - Tạo map `segment -> candidate products`
  - Tạo bước hậu kiểm `validateAIItemsAgainstSegments()`
  - Tạo bước sửa lỗi `repairAIItemsWithSegmentCandidates()`
- Test cases nên bám các ví dụ thực tế bạn đã gửi, đặc biệt case T250/T300 trắng sọc.

Kết quả kỳ vọng sau khi làm
- Không còn báo sai “T300 sọc không có trong bảng giá” khi bảng giá thực sự có
- Đọc được nhiều yêu cầu cùng lúc ổn định hơn
- Không bịa mã sản phẩm, không trỏ nhầm sang material khác
- Nếu không match chính xác, hệ thống phải nói rõ đang fallback theo quy tắc nào
- Người dùng nhìn vào preview là biết dòng nào chắc chắn đúng, dòng nào cần kiểm tra

