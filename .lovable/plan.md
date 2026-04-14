
## Gốc rễ thật sự

Không phải ô KL tự nhảy ngẫu nhiên. Hiện có 3 lớp sai chồng nhau:

1. **Sai contract dữ liệu `order.items` giữa các luồng tạo đơn**
   - `CreateOrderForm.tsx` lưu `items` = `JSON.stringify(orderItems)` và mỗi item có dạng:
     `product + quantity + price + total...`
     => không có `name`, `weight`, `length`, `width`, `height` ở top-level.
   - `QuotesPage.tsx` lại lưu `items` theo shape khác.
   - `CreateGHNOrderDialog.tsx` đang giả định `order.items` là array và item có sẵn `name/weight/length/...`.
   - Kết quả: cùng là đơn hàng nhưng đầu vào GHN không đồng nhất.

2. **Dialog GHN đang tự đoán dữ liệu logistics**
   - Khi thiếu dữ liệu, code fallback:
     - `weight = 1000`
     - `length = 30`
     - `width = 20`
     - `height = 10`
   - Với đơn số lượng lớn, các số fallback này làm tổng KG/KT phình rất mạnh.

3. **Logic hiện tại đang gộp toàn bộ sản phẩm thành 1 dòng giả**
   - Trong `CreateGHNOrderDialog.tsx`, sau khi map item, code lại `setProductItems([ ... ])` thành **1 dòng duy nhất**:
     - `quantity = totalQty`
     - `weight = avgWeight`
     - `length/width/height = max`
   - Sau đó:
     - `totalItemWeight = weight * quantity`
     - `heavyCargoCalc.sumHeight = height * quantity`
   - Đây chính là lý do ra kiểu `2130cm`.

## Vì sao ảnh của bạn ra sai

Với dữ liệu đang hiển thị:

```text
1 dòng GHN
quantity = 213
weight = 2000g
height = 10cm

=> KL tổng = 213 × 2000 = 426000g
=> Tổng cao = 213 × 10 = 2130cm
```

Tức là hệ thống đang dùng **số lượng bán hàng** như **số kiện vận chuyển**. Đây mới là lỗi gốc.

## Kết luận

Bug không nằm riêng ở ô “Thông tin đơn hàng”.

Gốc rễ là:
- dữ liệu `order.items` không đồng nhất,
- nhiều đơn không có logistics thật,
- và dialog GHN đang biến `quantity` thành số kiện bằng cách gộp sai.

## Kế hoạch sửa

1. **Thêm bước normalize `order.items`**
   - Parse được cả:
     - chuỗi JSON
     - array object
     - item dạng `{ product: {...} }`
     - item dạng `{ name, quantity, ... }`
   - Lấy tên từ `item.name || item.product?.name`.

2. **Bỏ gộp `productItems` thành 1 dòng giả**
   - “Thông tin sản phẩm” phải giữ **đủ từng dòng thật** từ đơn hàng.
   - KL đơn hàng = tổng `weight × quantity` của các dòng đã normalize.

3. **Tách khái niệm `số lượng sản phẩm` và `số kiện GHN`**
   - Không dùng `quantity` bán hàng để cộng `sumHeight`.
   - Với hàng nặng:
     - либо thêm `parcelCount`,
     - hoặc mặc định mỗi dòng là 1 kiện nếu chưa có dữ liệu kiện thật.
   - Nếu chưa có dữ liệu kiện, bắt user nhập rõ số kiện/kích thước kiện.

4. **Chỉ gộp ở bước tạo payload GHN nếu business vẫn cần**
   - Có thể vẫn gộp `content/items` khi submit,
   - nhưng không dùng dữ liệu gộp đó để tính KL/KT trong form.

5. **Bỏ fallback gây hiểu lầm**
   - Nếu thiếu weight/dimension thật:
     - để trống hoặc cảnh báo “chưa có dữ liệu logistics”
     - không tự nhét `1000 / 30 / 20 / 10` rồi tính như dữ liệu thật.

## File cần sửa

- `src/components/CreateGHNOrderDialog.tsx`
  - normalize `order.items`
  - bỏ `setProductItems([summary])`
  - sửa `heavyCargoCalc`
  - giữ KL đơn hàng bám đúng theo sản phẩm
- `src/components/CreateOrderForm.tsx`
  - chuẩn hóa schema `items` khi lưu order
- `src/pages/QuotesPage.tsx`
  - đảm bảo cùng 1 schema `items` với order tạo tay

## Kết quả mong muốn

- “Thông tin sản phẩm” hiện đúng từng dòng sản phẩm gốc
- “Thông tin đơn hàng” chỉ bám theo dữ liệu đã normalize
- Không còn ra số vô lý như `426kg` hay `2130cm` chỉ vì số lượng bán hàng lớn
- Hệ thống phân biệt rõ **sản phẩm bán ra** với **kiện vận chuyển**
