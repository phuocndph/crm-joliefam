
Mình đã đối chiếu code hiện tại với log mới nhất, và đúng là có lý do để bạn “không thấy thay đổi gì”: các fix trước đã vào payload fee, nhưng luồng chọn dịch vụ và dữ liệu item mặc định vẫn làm GHN tính sai nên kết quả nhìn như cũ.

## Nguyên nhân còn sót

### 1. Đơn nặng vẫn đang bị chọn nhầm sang dịch vụ nhẹ
Trong `CreateGHNOrderDialog.tsx`, sau khi gọi `get_services`, code đang luôn chọn:
- `data[0].service_type_id`

Trong log hiện tại shop 20kg+ trả về:
- `service_id: 53322`, `service_type_id: 2` = Hàng nhẹ
- `service_id: 100039`, `service_type_id: 5` = Hàng nặng

Nhưng code lại auto-pick service đầu tiên, nên payload fee đang gửi:
- `service_type_id: 2`
- `service_id: 53322`

Dù đơn là 70–72kg. Đây là sai lệch lớn nhất.

### 2. Dữ liệu sản phẩm đang bị gộp thành 1 kiện giả 10×10×10
Khi prefill từ `order.items`, code hiện đang gộp toàn bộ đơn thành 1 dòng:
- `quantity: 1`
- `weight: 72000`
- `length/width/height: 10/10/10`

Nghĩa là với đơn rất nặng, GHN vẫn nhận 1 kiện 72kg kích thước 10×10×10. Payload đã “đúng cấu trúc”, nhưng dữ liệu đầu vào vẫn sai thực tế nên cước vẫn sai.

### 3. `order.items` chỉ đọc được khi là array, không parse khi là JSON string
Trong project này nhiều chỗ khác đã parse:
- `typeof order.items === 'string' ? JSON.parse(order.items) : order.items`

Nhưng `CreateGHNOrderDialog.tsx` hiện chỉ dùng:
- `Array.isArray(order.items) ? order.items : []`

Nếu `order.items` đang lưu dạng string JSON thì dialog GHN bỏ qua toàn bộ item gốc, rồi rơi về default giả. Đây là thêm một lý do khiến bạn không thấy fee thay đổi đúng theo đơn thật.

### 4. `EditGHNOrderDialog` vẫn chưa đồng bộ hoàn toàn
Dialog sửa GHN vẫn còn:
- default `length=30`, `width=20`
- `items` không có `length/width/height`
- chưa có heavy-cargo dimension logic như dialog tạo mới

Nên dù dialog tạo đã sửa một phần, dialog sửa vẫn cho kết quả khác.

## Điều sẽ sửa

### A. Ưu tiên auto-chọn Service 5 khi đơn nặng
Trong cả create/edit dialog:
- nếu `isOverweight` hoặc `isHeavyCargo` thì ưu tiên service có `service_type_id === 5`
- chỉ fallback sang service đầu tiên nếu shop đó thật sự không có Service 5

Kết quả:
- đơn 70kg sẽ dùng `service_id 100039 / service_type_id 5`
- không còn tính nhầm theo “Hàng nhẹ”

### B. Parse đúng `order.items` từ DB
Trong `CreateGHNOrderDialog.tsx`:
- hỗ trợ cả 2 dạng `order.items` là array hoặc JSON string
- nếu parse lỗi thì mới fallback về default

Kết quả:
- dialog sẽ lấy đúng danh sách sản phẩm gốc thay vì coi như không có item

### C. Không gộp item thành 1 kiện giả nữa
Khi mở dialog tạo GHN:
- map từng item của đơn hàng thành từng `productItem`
- mỗi item mặc định:
  - `quantity: 1`
  - `length: 10`
  - `width: 10`
  - `height: 10`
- nhưng tổng quantity/weight phải phản ánh đúng đơn gốc, không bị “1 kiện 72kg”

Nếu item gốc không có weight/dims:
- giữ default 1000g, 10×10×10 để user chỉnh
- đồng thời hiển thị cảnh báo rằng đây chỉ là giá trị tạm

### D. Cảnh báo rõ khi đơn nặng nhưng vẫn đang dùng dữ liệu placeholder
Trong create dialog, nếu:
- tổng cân nặng lớn
- nhưng item dims vẫn toàn 10×10×10

thì thêm badge/cảnh báo nổi bật:
- “Đơn nặng đang dùng kích thước mặc định 10×10×10, cước GHN có thể sai lớn. Vui lòng nhập kích thước từng kiện.”

Như vậy user sẽ thấy ngay lý do fee chưa đáng tin.

### E. Đồng bộ `EditGHNOrderDialog`
Áp dụng cùng logic cho dialog sửa:
- parse item đầy đủ
- item có `length/width/height`
- heavy cargo calc
- effective dimensions
- auto chọn Service 5 cho đơn nặng
- fee payload và update payload cùng một nguồn dữ liệu

### F. Hiển thị rõ dịch vụ GHN đang được dùng để tính cước
Trong phần “Gói dịch vụ” và sidebar phí:
- hiển thị rõ service hiện tại là “Hàng nhẹ” hay “Hàng nặng”
- nếu đơn ≥ 20kg mà service hiện tại không phải type 5 thì show cảnh báo đỏ

Cái này giúp bạn nhìn phát biết hệ thống có đang dùng đúng luồng GHN chưa.

## File sẽ cập nhật
- `src/components/CreateGHNOrderDialog.tsx`
- `src/components/EditGHNOrderDialog.tsx`

## Kết quả mong đợi
Sau khi sửa:
- đơn 20kg+ sẽ không còn bị auto tính bằng service nhẹ
- fee preview sẽ thay đổi thấy rõ khi đổi item/dims thật
- dialog sẽ không còn “trông như không có gì đổi” vì service hiện tại và cảnh báo placeholder được hiện rõ
- create và edit GHN sẽ cho kết quả nhất quán hơn

## Chi tiết kỹ thuật
Các thay đổi chính:
1. Thay `setServiceTypeId(String(data[0].service_type_id))` bằng logic chọn service ưu tiên theo trọng lượng.
2. Parse `order.items` an toàn từ cả `array` và `string`.
3. Prefill `productItems` từ item thật thay vì gộp summary thành 1 dòng.
4. Bổ sung heavy-cargo logic đầy đủ cho dialog edit.
5. Thêm UI warning khi fee đang dựa trên dữ liệu mặc định, không phải dữ liệu kiện thực.

Sơ đồ logic mới:

```text
Load items from order
  -> parse array/string
  -> build productItems thực
  -> compute total weight
  -> if total >= 20kg
       prefer service_type_id = 5
       compute heavy dims from items
       warn if item dims still placeholder
  -> calculate_fee with matched service + item data thực
```
