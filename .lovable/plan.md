
Mình đã xem từ gốc rễ “lúc lấy từ đơn hàng” và nguyên nhân chính nằm ở đây:

1. Dữ liệu `order.items` không đồng nhất  
- Có nơi lưu `items: JSON.stringify(orderItems)` từ `CreateOrderForm`
- Có nơi lưu `items: JSON.stringify(selectedProducts)` từ `CreateQuoteForm`
- Schema item cũng khác nhau:
  - đơn tay: `item.product.name`
  - từ báo giá: `item.name`
- Nhưng `CreateGHNOrderDialog` hiện chỉ đọc:
```ts
const parsedItems = Array.isArray(order.items) ? order.items : [];
```
Nghĩa là nếu `order.items` là string JSON thì bị rớt hết, không parse được từ gốc.

2. Sau khi đọc được item, code lại gộp tất cả thành 1 GHN item  
Hiện tại dialog tạo GHN đang làm:
```ts
const summary = parsedItems.map(item => item.name).join('\n');
setProductItems([{ name: summary, weight: 200, quantity: totalQty }]);
```
Tức là toàn bộ sản phẩm trong đơn bị ép thành 1 dòng item duy nhất. Vì vậy dù có `\n`, GHN/A5 vẫn có thể coi đó là 1 “nội dung hàng” dài, không phải nhiều item tách biệt.

3. Edit dialog thì khác create dialog  
`EditGHNOrderDialog` ưu tiên `raw.items` từ GHN và giữ từng item riêng:
```ts
setProductItems(items.map(...))
```
nên create và edit đang không cùng logic, dẫn đến hành vi không nhất quán.

Kế hoạch sửa đúng từ gốc:

1. Chuẩn hóa hàm đọc item từ đơn hàng trong `CreateGHNOrderDialog.tsx`
- Parse được cả:
  - `order.items` là JSON string
  - `order.items` là array
- Normalize về cùng 1 schema:
```ts
{ name, quantity, weight }
```
- Ưu tiên tên theo thứ tự:
  - `item.name`
  - `item.product?.name`
  - fallback `Sản phẩm X`

2. Bỏ logic gộp toàn bộ sản phẩm thành 1 item
- Không dùng:
```ts
join('\n')
setProductItems([{ ... }])
```
- Thay bằng map từng dòng đơn hàng thành từng `productItems` riêng
- Như vậy payload gửi GHN sẽ có:
```ts
items: productItems.map(...)
```
đúng theo từng sản phẩm thực tế

3. Tách rõ 2 khái niệm `content` và `items`
- `items`: danh sách item thật gửi lên GHN
- `content`: chỉ là chuỗi tóm tắt để fallback
- `content` nên sinh từ danh sách item đã normalize, không phải từ dữ liệu thô
- Có thể dùng format ngắn gọn kiểu:
```ts
Ga chun ks T225 x2 | Vỏ gối trắng x1
```
thay vì newline, vì A5 thực tế đang render tốt hơn khi GHN lấy từ `items` hơn là trông chờ `content`

4. Đồng bộ logic giữa Create và Edit GHN dialog
- Tạo cùng 1 helper dùng chung để:
  - parse `order.items`
  - normalize item name/qty
  - sinh `content`
- Khi đó create/edit sẽ hiển thị và gửi dữ liệu nhất quán

5. Giữ nguyên phần shop theo kg, chỉ sửa nguồn dữ liệu sản phẩm
- Tính shop vẫn dựa trên `productItems`
- Sau khi normalize từng item riêng, tổng weight vẫn tính đúng
- Không đụng vào regex shop nếu không cần

6. Kiểm tra sau khi implement
- Đơn tạo tay từ `CreateOrderForm`
- Đơn sinh từ báo giá `CreateQuoteForm`
- Mở “Tạo đơn GHN” để xác nhận:
  - sản phẩm được đổ lên từng dòng riêng
  - không còn bị gộp thành 1 item
  - payload `items` gửi GHN có nhiều dòng đúng
- In phiếu A5 để xác nhận nội dung hiển thị đúng gốc dữ liệu đơn hàng

Chi tiết kỹ thuật cần sửa:
- `src/components/CreateGHNOrderDialog.tsx`
  - thêm helper parse/normalize `order.items`
  - thay prefill hiện tại đang `join('\n')` thành map item riêng
  - tách logic `content` fallback khỏi logic `items`
- Có thể trích helper sang:
  - `src/lib/orderItemUtils.ts`
  nếu muốn dùng chung cho cả `CreateGHNOrderDialog.tsx` và `EditGHNOrderDialog.tsx`
- `src/components/EditGHNOrderDialog.tsx`
  - đồng bộ cách build `itemContent` / display item với create dialog

Kết luận ngắn:
Lỗi không nằm ở bước “in phiếu” mà nằm từ đầu nguồn: `CreateGHNOrderDialog` đang đọc sai `order.items` và còn gộp toàn bộ item thành 1 item GHN. Muốn hết triệt để thì phải sửa từ bước parse dữ liệu đơn hàng sang GHN, không chỉ đổi `join('\n')`.
