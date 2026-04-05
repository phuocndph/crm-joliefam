

## Sửa lỗi AI điền báo giá: thiếu mô tả, quy cách sai, thiếu hình ảnh, giá không theo yêu cầu

### Vấn đề

1. **Mô tả bị trống**: Callback đã lấy `description` từ `originalProduct` nhưng có thể product không match đúng ID
2. **Quy cách không sửa**: AI prompt đã có rule nhưng AI vẫn trả specs gốc — cần làm prompt mạnh hơn
3. **Hình ảnh chưa tự lấy**: Không có logic tìm ảnh từ thư viện `product-images` bucket
4. **Giá trong yêu cầu bị bỏ qua**: Prompt yêu cầu AI luôn lấy giá gốc, nhưng khách có thể đã ghi giá riêng

### Giải pháp

#### 1. Edge Function — Cải thiện prompt (`lookup-tax-code/index.ts`)

- Thêm rule: Nếu khách ghi rõ giá trong yêu cầu → dùng giá khách ghi, KHÔNG dùng giá bảng giá
- Nhấn mạnh hơn: `specifications` PHẢI là quy cách theo yêu cầu khách, KHÔNG ĐƯỢC copy specs gốc
- Sửa rule 5 từ "đơn giá từ sản phẩm gốc" → "ưu tiên giá khách yêu cầu, nếu không có thì lấy giá sản phẩm gốc"

#### 2. `CreateQuoteForm.tsx` — Tự động tìm ảnh từ thư viện

Sau khi nhận kết quả AI, với mỗi item:
- Lấy `customName` hoặc `originalProduct.name`
- Gọi `supabase.storage.from('product-images').list()` để tìm ảnh có tên gần giống tên sản phẩm
- Nếu tìm thấy → gán `selectedImage` = public URL của ảnh đó
- Logic tìm kiếm: normalize tên (bỏ dấu, lowercase) → so sánh với tên file ảnh

#### 3. `AIQuoteFill.tsx` — Truyền thêm callback với image lookup

Mở rộng `AIMatchedItem` interface không cần thay đổi vì image sẽ được tìm ở tầng `CreateQuoteForm`.

### Files thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/functions/lookup-tax-code/index.ts` | Sửa prompt: ưu tiên giá khách ghi, nhấn mạnh specs phải sửa theo yêu cầu |
| `src/components/CreateQuoteForm.tsx` | Thêm logic tìm ảnh từ `product-images` bucket theo tên sản phẩm khi AI điền, gán `selectedImage` |

### Chi tiết kỹ thuật

**Tìm ảnh tự động**: Khi callback `onProductsSelected` được gọi:
1. Fetch danh sách tất cả ảnh từ bucket `product-images` (tất cả thư mục)
2. Với mỗi item AI trả về, normalize tên sản phẩm gốc (bỏ dấu tiếng Việt, lowercase)
3. So sánh với tên file ảnh (cũng normalize) — dùng `includes` hoặc fuzzy match
4. Nếu match → lấy public URL gán vào `selectedImage`

**Prompt sửa giá**:
```
5. "price" = nếu khách ghi rõ giá trong yêu cầu thì dùng giá đó. 
   Nếu KHÔNG ghi giá → lấy đơn giá từ sản phẩm gốc đã chọn.
```

