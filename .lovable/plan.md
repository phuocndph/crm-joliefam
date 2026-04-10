

## Tính năng: Tự động điền thông tin khách hàng từ AI báo giá

Khi người dùng nhập nội dung có chứa tên khách, địa chỉ, SĐT, ngày báo giá — AI sẽ tự động trích xuất và điền vào các ô thông tin phía trên form.

## Cách thực hiện

### 1. Cập nhật Edge Function (`supabase/functions/lookup-tax-code/index.ts`)
- Thêm vào prompt AI yêu cầu trích xuất thông tin khách hàng nếu có trong nội dung:
  ```
  customerInfo: { name, phone, address, date }
  ```
- Thêm trường `customerInfo` vào JSON output format, bên cạnh `items`
- Nếu không tìm thấy thông tin khách → trả `customerInfo: null`

### 2. Cập nhật `AIQuoteFill.tsx`
- Thêm callback prop `onCustomerInfoExtracted` để truyền thông tin khách lên form cha
- Interface mới:
  ```typescript
  interface CustomerInfo {
    name?: string;
    phone?: string;
    address?: string;
    date?: string; // ISO date string
  }
  ```
- Sau khi AI trả kết quả, nếu có `customerInfo` → gọi callback

### 3. Cập nhật `CreateQuoteForm.tsx`
- Truyền thêm prop `onCustomerInfoExtracted` vào `AIQuoteFill`
- Khi nhận được `customerInfo`, dùng `form.setValue()` để điền vào các trường:
  - `customerName` ← name
  - `phone` ← phone  
  - `address` ← address
  - `quoteDate` ← date (parse thành Date)
- Chỉ điền những trường có giá trị, không ghi đè trường đã có dữ liệu

### Files cần sửa
1. `supabase/functions/lookup-tax-code/index.ts` — thêm trích xuất customerInfo vào prompt
2. `src/components/AIQuoteFill.tsx` — thêm prop callback + xử lý response
3. `src/components/CreateQuoteForm.tsx` — nhận callback và điền form

