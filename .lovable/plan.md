

## Các lỗi và vấn đề cần tối ưu

### 1. `build-product-catalog`: Auth logic sai (BUG NGHIÊM TRỌNG)

**Vấn đề**: Dòng 82-91 kiểm tra auth với `if (authHeader)` — nếu KHÔNG có auth header thì function vẫn chạy bình thường (bypass auth). Nhưng config.toml đã set `verify_jwt = true` nên Supabase gateway chặn trước → lỗi 401 khi test. Khi gọi từ client có token, nếu token hết hạn hoặc sai thì function vẫn skip auth check và chạy tiếp vì chỉ check `if (authHeader)`.

**Fix**: Luôn yêu cầu auth header, throw 401 nếu thiếu.

### 2. `build-product-catalog`: Không query theo manager_id (BUG LOGIC)

**Vấn đề**: Dùng service role key query tất cả products, không lọc theo manager_id/RLS. Nếu có nhiều manager, catalog sẽ trộn sản phẩm của tất cả manager.

**Fix**: Trích xuất user từ token → xác định manager_id → query products với filter manager_id (hoặc dùng user client thay vì service role).

### 3. `AIQuoteFill.tsx`: Frontend gửi data lồng 2 lớp

**Vấn đề** (dòng 253-255): Gửi `{ type: "ai_quote_fill", data: requestBody }` nhưng backend (dòng 504) destructure `data` là `{ products, request, ... }`. Cấu trúc đúng nhưng có rủi ro: `requestBody` chứa key `request` trùng tên với biến state `request`. Nếu `request` bị trim sai hoặc rỗng ở edge case, backend sẽ trả 400.

**Không cần fix** — hoạt động đúng, chỉ note.

### 4. Catalog download lỗi im lặng khi Storage bucket không public cho folder `catalog/`

**Vấn đề**: Bucket `product-images` là public, nhưng download dùng `supabase.storage.download()` từ client (dùng anon key). Nếu RLS chặn, sẽ lỗi im lặng → fallback raw products mỗi lần.

**Fix**: Thêm error logging rõ ràng khi download catalog thất bại.

### 5. `lookup-tax-code`: Beeknoee fallback model luôn là `gemini-2.5-flash`

**Vấn đề**: Dù user chọn "Cao cấp nhất" (gemini-2.5-pro), Beeknoee vẫn dùng `gemini-2.5-flash`. Không có thông báo cho user biết model thực tế đang dùng là gì.

**Fix nhẹ**: Trả thêm `usedModel` trong response để frontend hiển thị.

### 6. Catalog text quá dài có thể vượt context window

**Vấn đề**: 917 sản phẩm × ~60 chars/sản phẩm = ~55K chars. Cộng với prompt ~2K chars → có thể gây chậm hoặc bị cắt với model nhẹ.

**Không cần fix ngay** — theo dõi khi sản phẩm tăng.

---

### Plan sửa lỗi

| File | Thay đổi |
|------|----------|
| `supabase/functions/build-product-catalog/index.ts` | (1) Fix auth: yêu cầu bắt buộc Authorization header, trả 401 nếu thiếu. (2) Xác định manager_id từ user → query products theo manager_id. (3) Xử lý case user là admin → query tất cả. |
| `src/components/AIQuoteFill.tsx` | (1) Thêm log rõ ràng khi download catalog thất bại (error message cụ thể). (2) Hiển thị model thực tế đang dùng nếu backend trả `usedModel`. |
| `supabase/functions/lookup-tax-code/index.ts` | Trả thêm `usedModel` và `usedProvider` trong response cho `ai_quote_fill` type. |

