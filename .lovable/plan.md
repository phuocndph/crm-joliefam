

## Bỏ pre-filter, gửi toàn bộ sản phẩm cho AI

### Vấn đề
Pre-filter client-side dựa trên keyword matching quá đơn giản, bỏ sót sản phẩm mà AI cần để match chính xác. Ví dụ khách nói "ga T225 1m8" nhưng tên sản phẩm trong DB có thể viết khác hoàn toàn → bị loại khỏi danh sách gửi AI.

### Giải pháp
Bỏ `preFilterProducts()`, gửi toàn bộ 917 sản phẩm cho AI. Để bù đắp token tăng lên:
- Chỉ gửi fields tối thiểu: `id`, `name`, `price`, `specifications` (bỏ `description` trừ khi bật ảnh)
- Gợi ý model tự động dựa trên tổng số sản phẩm thay vì số filtered

### Thay đổi

| File | Nội dung |
|------|----------|
| `src/components/AIQuoteFill.tsx` | Bỏ gọi `preFilterProducts()` trong `handleAIFill`, gửi trực tiếp `products`. Cập nhật `suggestedModel` dựa trên `products.length` và `request.length` thay vì filtered count. Giữ nguyên hàm `preFilterProducts` nhưng không dùng. |

### Chi tiết
- `handleAIFill`: thay `preFilterProducts(products, request.trim())` bằng `products` trực tiếp
- `suggestedModel`: với 917 SP → mặc định gợi ý "Cân bằng" hoặc "Chính xác cao"
- Log vẫn hiển thị số sản phẩm gửi đi để debug

