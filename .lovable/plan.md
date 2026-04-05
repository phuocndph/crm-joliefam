

## Sửa lỗi AI điền báo giá thiếu mô tả, hình ảnh và quy cách sai

### Vấn đề hiện tại

1. **Thiếu mô tả (description)**: Khi AI chọn sản phẩm, callback không lấy `description` từ sản phẩm gốc → ô mô tả trong bảng báo giá bị trống
2. **Thiếu hình ảnh**: Không tìm hình ảnh sản phẩm gốc để gán vào `selectedImage`
3. **Quy cách không sửa**: AI trả về `specifications` nhưng callback không dùng nó — hoặc AI trả specifications gốc thay vì specs đã sửa theo yêu cầu khách

### Giải pháp

#### 1. `AIQuoteFill.tsx` — Mở rộng Product interface

Thêm `description` vào interface Product để truyền xuống edge function và dùng khi áp dụng:

```typescript
interface Product {
  id: string;
  name: string;
  price: number | null;
  specifications: string | null;
  description: string | null;  // THÊM
}
```

Khi gửi lên AI, thêm `description` vào product list để AI có thể tham khảo.

#### 2. `AIQuoteFill.tsx` — Mở rộng AIMatchedItem

Thêm `description` vào interface trả về:

```typescript
interface AIMatchedItem {
  matchedProductId: string;
  customName: string;
  quantity: number;
  price: number;
  specifications: string;  // Đã sửa theo yêu cầu khách
  description: string;     // THÊM - từ sản phẩm gốc
  note: string;
}
```

#### 3. `CreateQuoteForm.tsx` — Sửa callback onProductsSelected

Khi nhận kết quả AI, tìm sản phẩm gốc để lấy `description` và tìm hình ảnh từ product_images:

```typescript
onProductsSelected={(items) => {
  const newItems = items.map((item) => {
    const originalProduct = products.find(p => p.id === item.matchedProductId);
    return {
      id: `${item.matchedProductId}-${Date.now()}-${Math.random()}`,
      name: item.customName,
      sku: originalProduct?.sku || '',
      price: item.price,
      quantity: item.quantity,
      total: item.price * item.quantity,
      description: originalProduct?.description || '',  // LẤY TỪ SẢN PHẨM GỐC
      specifications: item.specifications,               // DÙNG SPECS ĐÃ SỬA TỪ AI
      originalProductId: item.matchedProductId,
    };
  });
  setSelectedProducts(prev => [...prev, ...newItems]);
}}
```

#### 4. Edge Function — Cải thiện prompt về specifications

Cập nhật prompt trong `lookup-tax-code/index.ts` để AI rõ ràng sửa specifications theo yêu cầu khách (không giữ specs gốc):

```
5. "specifications" = quy cách ĐÃ SỬA theo yêu cầu thực tế của khách 
   (VD: khách yêu cầu 160x200x12cm thì ghi "160x200x12cm", KHÔNG ghi "160x200x15cm")
```

Thêm `description` vào product list gửi cho AI để AI tham khảo.

### Files thay đổi

| File | Thay đổi |
|------|----------|
| `src/components/AIQuoteFill.tsx` | Thêm `description` vào Product + AIMatchedItem interfaces, gửi description lên AI |
| `src/components/CreateQuoteForm.tsx` | Sửa callback lấy description + sku từ sản phẩm gốc |
| `supabase/functions/lookup-tax-code/index.ts` | Cập nhật prompt: specifications phải sửa theo yêu cầu khách, thêm description vào product list |

