
Mình đã rà soát phần `/quotes` và nguyên nhân chính không phải là “bấm không lưu”, mà là dữ liệu ngày đang bị đọc/ghi không nhất quán nên sau khi sửa xong vẫn hiện sai hoặc bị ghi đè lại.

1. Vấn đề đã tìm thấy
- Ở `src/pages/QuotesPage.tsx`, chỉnh “Ngày tạo” đang update trực tiếp `quotes.created_at` và có toast thành công.
- Nhưng ở `src/components/CreateQuoteForm.tsx`, khi mở báo giá để sửa lại, form lại lấy `initialData.quote_date` thay vì `created_at`. Nếu `quote_date` không có thì nó fallback về `new Date()`, tức là ngày hiện tại.
- Kết quả: bạn vừa sửa ngày xong, nhưng lần sau mở form sửa báo giá hoặc lưu lại báo giá, ngày có thể bị trả về ngày hiện tại hoặc không đúng ngày đã chọn.
- Với “Ngày hết hạn”, inline edit đang ghi vào `notes` theo format `yyyy-MM-dd`, trong khi phần tạo/sửa báo giá và preview chủ yếu đang dùng/parse theo format `dd/MM/yyyy`. Dữ liệu vẫn có thể lưu, nhưng hiển thị và parse về sau dễ lệch.

2. Kế hoạch sửa
- Đồng bộ nguồn dữ liệu cho “Ngày tạo”:
  - Trong `CreateQuoteForm`, khi reset form cho báo giá đang sửa, ưu tiên lấy ngày từ:
    1) `initialData.quoteDate`
    2) `initialData.created_at`
    3) dữ liệu trong `quote_data.quoteDate` nếu có
    4) cuối cùng mới fallback về ngày hiện tại
- Đồng bộ cách lưu “Ngày tạo”:
  - Khi cập nhật báo giá từ form edit, ghi lại `created_at` nếu người dùng đổi ngày báo giá.
  - Tránh tình trạng inline edit sửa một nơi, còn form edit lại lưu theo chỗ khác.
- Đồng bộ format “Ngày hết hạn”:
  - Chọn một format chuẩn duy nhất cho `notes`, tốt nhất là `dd/MM/yyyy` để khớp toàn bộ logic hiện có trong form và preview.
  - Cập nhật inline edit ở `QuotesPage` để ghi đúng format này.
  - Giữ parser hỗ trợ cả `dd/MM/yyyy` và `yyyy-MM-dd` để không làm hỏng dữ liệu cũ.
- Cải thiện phản hồi lỗi:
  - Nếu update Supabase lỗi, hiển thị chi tiết `message`, `code`, `hint` trong toast thay vì báo lỗi chung chung, đúng theo pattern dự án đang yêu cầu.
- Làm mới UI chắc chắn hơn:
  - Sau khi update ngày, invalidate đúng query key hiện tại của quotes để danh sách reload đúng.
  - Nếu cần, cập nhật optimistic/local display để người dùng thấy đổi ngay.

3. File sẽ cần chỉnh
- `src/pages/QuotesPage.tsx`
- `src/components/CreateQuoteForm.tsx`
- Có thể thêm chỉnh nhẹ ở:
  - `src/hooks/useQuotes.ts` để parse ngày hết hạn ổn định hơn
  - `src/components/QuotePreviewDialog.tsx` nếu cần chuẩn hóa cách đọc hạn báo giá

4. Kết quả mong đợi sau khi sửa
- Sửa “Ngày tạo” xong sẽ giữ đúng ngày đã chọn.
- Mở lại báo giá để sửa tiếp sẽ không tự nhảy về ngày hiện tại.
- “Ngày hết hạn” sửa xong sẽ hiển thị lại đúng, không bị lệch format.
- Nếu Supabase chặn hoặc lỗi thật, màn hình sẽ báo rõ nguyên nhân thay vì chỉ hiện “không thể cập nhật”.

5. Chi tiết kỹ thuật
```text
Hiện tại:
inline edit created_at -> thành công
nhưng form edit đọc quote_date -> thiếu dữ liệu -> fallback new Date()
=> lưu lần sau bị ghi đè sai

Hiện tại:
expiry inline edit -> notes: yyyy-MM-dd
create/edit/preview -> chủ yếu parse dd/MM/yyyy
=> cùng 1 field nhưng 2 chuẩn ngày khác nhau
```

Khi bạn duyệt plan, mình sẽ sửa đồng bộ toàn bộ luồng này để ngày sửa xong lưu đúng như yêu cầu.
