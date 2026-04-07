
## Mục tiêu
Tối ưu lại AI Quote Fill để AI hiểu đúng ngữ cảnh tiếng Việt có dấu/không dấu và giảm tình trạng “không tìm thấy sản phẩm” do prompt thiếu dữ liệu thực tế.

## Vấn đề gốc đã thấy trong code
1. `lookup-tax-code` đang chỉ đưa vào prompt dạng `id|name|price`.
2. Dù frontend đã gửi thêm `description` và `specifications`, edge function hiện không đưa các trường này vào prompt.
3. Vì vậy AI gần như phải đoán từ tên sản phẩm, nên dễ không hiểu:
   - từ viết tắt/không dấu
   - alias như `chan he`, `ga tham`, `trang`, `tron`
   - ngữ cảnh chung cuối câu như `t250 trang`
   - khác biệt giữa loại sản phẩm gần giống nhau

## Cách sửa
### 1) Nâng dữ liệu catalog gửi vào prompt
File: `supabase/functions/lookup-tax-code/index.ts`

Thay `productListText` từ:
- `id|name|price`

thành format giàu ngữ cảnh hơn, ví dụ:
- `id|name|specifications|description|price`

Mục tiêu:
- cho AI thấy cả tên + quy cách + mô tả thật của từng sản phẩm trong bảng giá
- giúp AI match theo chất liệu, trơn/sọc, chần, alias sản phẩm tốt hơn

### 2) Viết lại prompt theo hướng “hiểu ngữ cảnh”, không dài dòng định nghĩa
Giữ prompt ngắn nhưng thêm các quy tắc bắt buộc sau:

- hiểu không dấu/có dấu là như nhau
- áp dụng thuộc tính chung cho toàn câu nếu chỉ xuất hiện 1 lần ở cuối
  - ví dụ: `chan he ... ga chun ... t250 trang`
- `trang/trắng/tron/trơn` => nhóm trơn
- `soc/sọc` => nhóm sọc
- `chan/chần` chỉ là chần, không được hiểu nhầm sang trơn/sọc
- `chan he` phải ưu tiên tìm đúng dòng “chăn hè” hoặc nhóm tương đương trong catalog, không chỉ đoán theo chữ “chăn”
- bắt buộc match đúng theo thứ tự:
  1. loại sản phẩm
  2. chất liệu
  3. mẫu trơn/sọc/chần
  4. kích thước
- nếu thiếu dữ liệu thật sự mới hỏi lại bằng `clarification`, không hỏi lại khi catalog đã đủ ngữ cảnh để suy ra

### 3) Thêm few-shot examples rất sát nghiệp vụ
Trong prompt thêm 3-5 ví dụ ngắn, đúng kiểu nhân viên gõ thực tế:
- `ga chun 1.6x2.0x14p t250 trang`
- `chan he 2.0x2.2 t250 trang`
- `vo goi nam 45x65 t300 soc`
- `ga chun 1m8 cao 12 lth`
- câu nhiều sản phẩm có thuộc tính chung cuối câu

Mục tiêu:
- dạy AI cách tách ý
- dạy AI cách phân bổ chất liệu/mẫu cho từng sản phẩm
- dạy AI cách hiểu “trắng = trơn” trong ngữ cảnh catalog này

### 4) Tận dụng `specifications` và `description` như nguồn verify
Prompt sẽ yêu cầu AI:
- không chỉ nhìn tên sản phẩm
- phải dùng cả `specifications` và `description` để verify loại vải, mẫu, kích thước
- nếu tên sản phẩm thiếu chữ nhưng mô tả có đủ thì vẫn được dùng để match

### 5) Cải thiện fallback khi không match
Nếu không tìm được:
- trả `clarification` thật cụ thể theo từng món
- ví dụ hỏi thiếu loại, thiếu chất liệu, thiếu mẫu
- tránh trả `items: []` chung chung quá sớm

## Phạm vi file
- `supabase/functions/lookup-tax-code/index.ts`

## Không cần đổi
- `src/components/AIQuoteFill.tsx` gần như không cần sửa logic gọi API
- UI preview/apply hiện tại có thể giữ nguyên

## Kết quả kỳ vọng
Sau khi sửa, các input như:
- `Chan he tran hai mat 2.0 x 2.2 ga chun 1.6 x 2.0 x 14p t250 trang`
- `ga chun 1m6 14p t250 trắng`
- `vỏ gối nằm t300 sọc`

sẽ có tỷ lệ match đúng cao hơn vì AI được nhìn thấy catalog thật đầy đủ, thay vì chỉ `id|name|price`.

## Chi tiết kỹ thuật
```text
Hiện tại lỗi chính không nằm ở frontend mà ở việc prompt thiếu dữ liệu catalog thực tế.

Frontend đã gửi:
- id
- name
- price
- specifications
- description

Nhưng edge function chỉ nhúng:
- id|name|price

=> AI mất ngữ cảnh quan trọng để suy luận đúng.
```
