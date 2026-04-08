
Đã xem log, lỗi hiện tại đã khá rõ:

### Lỗi chính đang làm ảnh vẫn fail
- Edge function `lookup-tax-code` không fail ở OCR hay matching nữa.
- Log cho thấy:
  - `Step 1 OCR parsed 8 structured products`
  - `Step 2 took 43672ms`
  - `AI response from: Beeknoee (gemini-2.5-flash)`
- Nhưng ngay sau đó function bị crash với:
  - `ReferenceError: step1Start is not defined`

### Nguyên nhân gốc trong code
- Trong `supabase/functions/lookup-tax-code/index.ts`:
  - `step1Start` được khai báo bên trong block `if (hasImage)` ở phần OCR.
  - Sau đó lại bị dùng ở đoạn build `parsed.pipeline` bên ngoài block này.
- Vì vậy:
  - OCR chạy xong
  - Step 2 chạy xong
  - Validation chạy xong
  - Đến lúc gắn metadata `pipeline` thì throw lỗi
  - Client nhận `FunctionsHttpError: Edge Function returned a non-2xx status code`

### Vấn đề phụ còn tồn tại
- Log cũng cho thấy:
  - `Beeknoee gemini-3-flash-preview failed (400): Model "gemini-3-flash-preview" không tồn tại hoặc đã bị vô hiệu`
- Nghĩa là model Step 2 bạn muốn dùng đầu tiên hiện không hợp lệ ở Beeknoee, nên request đang luôn:
  - thử `gemini-3-flash-preview` → 400
  - rồi mới fallback `gemini-2.5-flash`
- Tức là ngoài lỗi crash, còn có một lỗi cấu hình model gây chậm và bẩn log.

### Kế hoạch sửa
1. Sửa biến thời gian pipeline
- Đưa `step1Start` ra scope ngoài, hoặc đổi sang `let step1Start: number | null = null`
- Chỉ tính `parsed.pipeline` khi biến này thực sự tồn tại
- An toàn hơn nữa là lưu riêng:
  - `step1Duration`
  - `step2Duration`
  - `totalDuration`

2. Sửa model Step 2 theo model thực sự có trên Beeknoee
- Không dùng `gemini-3-flash-preview` nếu provider trả 400
- Chuẩn hóa tên model theo đúng danh sách model Beeknoee hỗ trợ
- Nếu chưa có Gemini 3 hợp lệ, tạm thời để Step 2 dùng thẳng `gemini-2.5-flash` để ổn định

3. Giữ response thành công ngay cả khi chỉ lỗi metadata
- Phần `pipeline` nên là metadata phụ, không được phép làm hỏng toàn bộ response
- Nếu tính pipeline lỗi thì bỏ metadata đó, vẫn trả `items`

4. Cải thiện hiển thị lỗi phía UI
- `AIQuoteFill.tsx` hiện chỉ toast chung: `Không thể xử lý yêu cầu AI`
- Nên đọc body lỗi từ edge function để hiện đúng nguyên nhân khi có lỗi runtime/server

### Kết luận hiện tại
- Luồng xử lý ảnh không phải “không OCR được”.
- Thực tế là:
  - OCR đang chạy
  - Matching cũng đang chạy
  - Nhưng function bị vỡ ở bước cuối do bug biến `step1Start`
- Sau khi sửa bug scope này, khả năng cao ảnh sẽ trả kết quả lại bình thường.
- Sau đó mới cần xử lý tiếp chuyện `gemini-3-flash-preview` không tồn tại trên Beeknoee để tối ưu tốc độ và độ ổn định.

### Thứ tự ưu tiên nên làm
1. Fix `step1Start is not defined`
2. Chặn metadata pipeline làm crash response
3. Sửa model Step 2 về model Gemini hợp lệ trên Beeknoee
4. Test lại flow ảnh end-to-end với 1 ảnh báo giá thật
