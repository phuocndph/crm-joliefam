

## Vấn đề: AI trả về ID giả thay vì UUID thực

### Nguyên nhân gốc

AI nhận catalog dạng `UUID|Tên|Quy cách|Mô tả|Giá` với ID thật (VD: `349a185f-94fd-4021-885a-51ad0b5f3647`), nhưng **ví dụ few-shot trong prompt dùng ID giả** (`id-tam-tt`, `id-goi-tt`, `id-ga`). AI học theo mẫu và tự bịa ID thay vì copy UUID từ bảng giá.

Kết quả: Frontend `products.find(p => p.id === item.matchedProductId)` không tìm được sản phẩm → chỉ hiển thị những item mà ID may mắn trùng (hoặc hiển thị nhưng thiếu thông tin gốc).

Trong ảnh user gửi: nhập 7 SP nhưng chỉ hiển thị 3 — vì 4 SP còn lại có ID giả, frontend không match được.

### Sửa đổi

#### File: `supabase/functions/lookup-tax-code/index.ts`

**1. Sửa ví dụ few-shot — dùng UUID format thật**

Thay:
```
{"matchedProductId":"id-tam-tt",...}
```
Bằng:
```
{"matchedProductId":"349a185f-94fd-4021-885a-51ad0b5f3647",...}
```

Dùng UUID thực từ DB cho ví dụ (Tấm Trang Trí 160, Vỏ gối trang trí 45x45, v.v.) để AI hiểu rằng phải copy chính xác ID từ cột đầu tiên.

**2. Thêm rule nhấn mạnh ID phải là UUID từ bảng giá**

Thêm vào phần OUTPUT:
```
- matchedProductId = PHẢI là UUID chính xác từ CỘT ĐẦU TIÊN của bảng giá (dạng xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). TUYỆT ĐỐI KHÔNG tự tạo ID.
```

**3. Thêm validation phía backend** (optional nhưng tốt)

Sau khi AI trả kết quả, validate `matchedProductId` — nếu không phải UUID format thì log warning.

### Kết quả kỳ vọng
- AI sẽ copy chính xác UUID từ catalog thay vì bịa ID
- Frontend match được 100% sản phẩm AI trả về
- Tất cả 7 SP trong ảnh user sẽ hiển thị đầy đủ

