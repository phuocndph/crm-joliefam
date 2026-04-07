

## Tối ưu Prompt AI Quote Fill theo format SKU|Tên|Giá

### Mục tiêu
Thay thế prompt hiện tại (dài dòng, format `[i] ID: ... | Tên: ... | Giá: ... | Quy cách: ... | Mô tả: ...`) bằng prompt mới ngắn gọn, chuyên biệt cho ga gối đệm, với format `SKU|Tên sản phẩm|Giá bán` và quy tắc nghiệp vụ rõ ràng hơn.

### Thay đổi

**File: `supabase/functions/lookup-tax-code/index.ts`**

1. **Sửa `productListText` format** (dòng 481-483):
   - Từ: `[i] ID: ... | Tên: ... | Giá: ... | Quy cách: ... | Mô tả: ...`
   - Thành: `ID|Tên sản phẩm|Giá bán` (dùng `p.id` thay vì index, bỏ quy cách/mô tả thừa)
   - Giảm token ~60% do bỏ quy cách + mô tả + label dài dòng

2. **Thay toàn bộ `aiQuoteFillPrompt`** (dòng 485-513) bằng prompt mới theo mẫu user cung cấp:
   - System prompt mở đầu: "Bạn là chuyên gia báo giá sản phẩm ga gối đệm..."
   - Bảng giá format: `SKU|Tên sản phẩm|Giá bán` (tự động từ products)
   - Quy tắc phân tích input (chuẩn hóa kích thước, chất liệu)
   - Quy tắc chọn kích thước (lớn hơn gần nhất)
   - Quy tắc số lượng
   - Format trả lời JSON thuần túy
   - Thêm hỗ trợ hình ảnh khi có ảnh

3. **Sửa JSON output format** để map lại với frontend:
   - Backend nhận `sku` từ AI → map sang `matchedProductId` bằng cách tìm product có id trùng SKU
   - Giữ nguyên interface `AIMatchedItem` phía frontend

4. **Redeploy** Edge Function `lookup-tax-code`

### Chi tiết prompt mới

```text
Bạn là chuyên gia báo giá sản phẩm ga gối đệm. Nhiệm vụ: đọc yêu cầu (text hoặc hình ảnh), tách từng sản phẩm, tìm đúng trong bảng giá, xử lý kích thước thông minh.

## BẢNG GIÁ (định dạng: SKU|Tên sản phẩm|Giá bán)
{productListText - tự động generate từ products array}

## QUY TẮC PHÂN TÍCH INPUT
1. Tách câu thành từng sản phẩm riêng lẻ
2. Chuẩn hóa kích thước: 1.6→160, 1.8→180...
3. T250/T300/T350/T400/T200/LTH là chất liệu vải
4. "trang"/"tron" = trơn/trắng, "soc" = sọc, "chan" = chần
5. Nếu không ghi chất liệu → ưu tiên T250
6. "gối" mà không nói rõ → mặc định "Vỏ gối"
7. LTH = T225 là cùng một loại vải
8. Phụ kiện (vỏ gối, gối ôm) mặc định dùng chung loại vải với ga giường

## QUY TẮC CHỌN KÍCH THƯỚC
- Khi kích thước yêu cầu KHÔNG CÓ → chọn kích thước LỚN HƠN GẦN NHẤT
- KHÔNG BAO GIỜ chọn kích thước nhỏ hơn yêu cầu

## QUY TẮC GIÁ
- Nếu khách ghi rõ giá → dùng giá khách ghi
- Nếu không → lấy giá từ bảng giá

## NẾU NHẬN HÌNH ẢNH
Phân tích ảnh (đơn hàng, tin nhắn, ghi chép tay...) để trích xuất sản phẩm.

## FORMAT TRẢ LỜI (JSON thuần túy)
{"items":[{"matchedProductId":"product-uuid","customName":"tên theo yêu cầu","quantity":1,"price":0,"specifications":"quy cách theo khách","note":"ghi chú"}]}
Nếu thiếu thông tin: {"items":[],"clarification":"câu hỏi"}
```

### Mapping logic
- Frontend gửi `products` array với `p.id` (UUID) và `p.name`
- Prompt hiển thị `p.id|p.name|p.price` cho AI
- AI trả `matchedProductId` = UUID trực tiếp → frontend dùng ngay, không cần convert

### Không thay đổi
- Frontend `AIQuoteFill.tsx` — giữ nguyên hoàn toàn
- `callAI()` function — giữ nguyên
- Logic nén ảnh, multimodal — giữ nguyên

| File | Thay đổi |
|------|----------|
| `supabase/functions/lookup-tax-code/index.ts` | Sửa `productListText` format + thay `aiQuoteFillPrompt` |

