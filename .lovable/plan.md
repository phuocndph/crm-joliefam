

## Thêm chức năng tạo báo giá bằng AI (với logic so khớp thông minh)

### Yêu cầu đặc biệt
Khi sản phẩm không khớp 100%, AI phải:
- **Tìm sản phẩm gần nhất có kích thước lớn hơn** (ví dụ: khách yêu cầu 12cm → bảng giá có 10cm và 15cm → lấy giá 15cm)
- **Tự sửa tên sản phẩm** theo đúng yêu cầu khách (hiển thị 12cm thay vì 15cm)
- Giá lấy từ sản phẩm cao hơn, tên hiển thị theo yêu cầu thực tế

### Thay đổi

#### 1. Edge Function `lookup-tax-code` — Thêm type `ai_quote_fill`

Nhận:
- `products`: danh sách sản phẩm từ bảng giá (id, name, price, specifications)
- `request`: mô tả yêu cầu khách hàng

AI prompt sẽ bao gồm quy tắc so khớp thông minh:
```
QUY TẮC SO KHỚP:
1. Nếu sản phẩm khớp chính xác → lấy trực tiếp
2. Nếu kích thước không khớp → lấy sản phẩm có kích thước LỚN HƠN gần nhất
3. Trường "customName" = tên sản phẩm đã sửa theo yêu cầu thực tế của khách
4. Trường "matchedProductId" = ID sản phẩm gốc trong bảng giá (để lấy giá)
5. Trường "note" = ghi chú lý do chọn (ví dụ: "Khách yêu cầu 12cm, lấy giá 15cm")
```

Trả về:
```json
{"items": [
  {
    "matchedProductId": "uuid-of-15cm-product",
    "customName": "Ga giường 160x200x12cm",
    "quantity": 1,
    "price": 500000,
    "specifications": "160x200x12cm",
    "note": "Khách yêu cầu 12cm, lấy giá sản phẩm 15cm"
  }
]}
```

#### 2. Component `AIQuoteFill.tsx` — Giao diện AI điền báo giá

- Textarea nhập yêu cầu khách hàng
- Nút "AI tự chọn sản phẩm" với loading state
- Hiển thị kết quả trước khi áp dụng: bảng preview với cột ghi chú (cho trường hợp không khớp 100%)
- Nút "Áp dụng" để điền vào bảng báo giá, nút "Hủy" để bỏ qua

#### 3. `CreateQuoteForm.tsx` — Tích hợp

- Thêm `AIQuoteFill` phía trên bảng sản phẩm (chỉ hiện khi đã chọn bảng giá)
- Truyền `products` và callback `onProductsSelected`
- Callback nhận kết quả AI → tạo `QuoteItem[]` với tên đã sửa + giá từ sản phẩm gốc → set vào `selectedProducts`

### Files thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/functions/lookup-tax-code/index.ts` | Thêm case `ai_quote_fill` với prompt so khớp thông minh |
| `src/components/AIQuoteFill.tsx` | Tạo mới — UI + preview kết quả AI |
| `src/components/CreateQuoteForm.tsx` | Tích hợp `AIQuoteFill` vào form |

