

## Vấn đề

Edge function `web-scraper` sử dụng **sai URL** cho Beeknoee API:
- **Sai**: `https://api.beeknoee.com/v1/chat/completions` và `https://api.beeknoee.com/v1/models`
- **Đúng**: `https://platform.beeknoee.com/api/v1/chat/completions` và `https://platform.beeknoee.com/api/v1/models`

Đây là lý do:
1. Fetch models trả về lỗi `"Cannot GET /v1/models"` → dropdown model rỗng
2. AI extraction trả về 404 → kết quả luôn 0 bản ghi

## Giải pháp

**File: `supabase/functions/web-scraper/index.ts`**

Thay đổi 2 URL:
1. `https://api.beeknoee.com/v1/models` → `https://platform.beeknoee.com/api/v1/models`
2. `https://api.beeknoee.com/v1/chat/completions` → `https://platform.beeknoee.com/api/v1/chat/completions`

Sau đó redeploy edge function. Không cần thay đổi gì ở frontend.

