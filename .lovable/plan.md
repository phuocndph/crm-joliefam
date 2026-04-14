
## Chỗ đang sai

1. **Sai ở bước prefill sản phẩm** trong `src/components/CreateGHNOrderDialog.tsx` (đoạn prefill khi mở dialog):
- Code đang **gộp toàn bộ `order.items` thành 1 dòng sản phẩm**
- Sau đó gán mặc định:
  - `weight: 1000`
  - `length: 30`
  - `width: 20`
  - `height: 10`
  - `quantity: totalQty`
- Nghĩa là hệ thống đang hiểu: “có `totalQty` kiện, mỗi kiện 1000g, cao 10cm”

2. **Vì vậy phần “Thông tin đơn hàng” không sai cách tính, mà sai từ dữ liệu đầu vào**
- `KL (gram)` ở đây đang lấy từ:
  - `displayWeight = totalItemWeight`
  - `totalItemWeight = sum(item.weight * item.quantity)`
- Tức là nó đang bám đúng theo “Thông tin sản phẩm”
- Nhưng “Thông tin sản phẩm” hiện bị prefill kiểu giả lập, nên nhìn thành “nhảy linh tinh”

3. **Có thêm 1 bug phụ**
- State `weight` cũ vẫn còn tồn tại
- Effect tính phí vẫn đang phụ thuộc `weight`, trong khi UI và payload đã chuyển sang `displayWeight`
- Điều này dễ làm tính phí/shop cập nhật không khớp với gram đang hiển thị

## Vì sao ảnh của bạn ra 213kg và 2130cm

```text
quantity = 213
weight mặc định mỗi dòng = 1000g
=> totalItemWeight = 213 * 1000 = 213000g = 213.0kg

height mặc định = 10cm
=> sumHeight = 213 * 10 = 2130cm
=> Kích thước tính = 30 × 20 × 2130
```

Nói ngắn gọn: **nó không tự nhảy ngẫu nhiên**, mà đang tính rất “đúng” trên một bộ dữ liệu prefill đang bị dựng sai.

## Kế hoạch sửa

1. **Sửa prefill `order.items`**
- Không gộp tất cả thành 1 dòng tổng hợp nữa
- Map từng sản phẩm từ đơn hàng sang `productItems`
- Nếu item có sẵn gram/kích thước thì lấy giá trị thật
- Chỉ fallback `1000 / 30 / 20 / 10` khi item thiếu dữ liệu

2. **Giữ KL đơn hàng luôn read-only**
- Ô KL ở “Thông tin đơn hàng” vẫn chỉ hiển thị tổng gram từ `productItems`
- Không cho sửa tay
- Khi “Thông tin sản phẩm” đúng thì KL tổng sẽ tự đúng

3. **Dọn state `weight` dư thừa**
- Xóa `weight` state cũ
- Sửa effect tính phí để theo dõi `displayWeight` hoặc `totalItemWeight`
- Tránh lệch giữa UI, tính cước và chọn shop

4. **Rà lại phần hàng nặng**
- `heavyCargoCalc` phải tính từ dữ liệu kiện hàng thực
- Sau khi prefill đúng, cảnh báo “Tổng KL / Kích thước tính” sẽ hết ra số vô lý như `2130cm`

## Điểm cần sửa trong file

`src/components/CreateGHNOrderDialog.tsx`
- Prefill khi mở dialog: khoảng `289-336`
- State `weight` cũ: khoảng `165`
- Effect auto-calculate fee: khoảng `617-623`
- `heavyCargoCalc`: khoảng `268-274`

## Kết quả mong đợi

- KL trong “Thông tin đơn hàng” luôn bám đúng gram ở “Thông tin sản phẩm”
- Không còn bị đội lên kiểu `213kg` chỉ vì tổng số lượng lớn
- Không còn xuất hiện kích thước vô lý như `30×20×2130`
