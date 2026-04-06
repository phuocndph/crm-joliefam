

## Sửa lỗi Beeknoee fallback: Model không tồn tại

### Nguyên nhân
Fallback đang hoạt động đúng (Lovable AI trả 402 "Not enough credits" → chuyển sang Beeknoee), nhưng Beeknoee trả lỗi 400 vì model `gpt-4o-mini` **không tồn tại** trên nền tảng của họ.

### Giải pháp
Đổi model Beeknoee từ `gpt-4o-mini` sang `gemini-2.5-flash` (có sẵn trên Beeknoee, rẻ, nhanh, cùng loại model đang dùng ở Lovable AI).

### Thay đổi cụ thể

Thay tất cả `model: "gpt-4o-mini"` thành `model: "gemini-2.5-flash"` trong 3 file:

| File | Dòng cần sửa |
|------|-------------|
| `supabase/functions/lookup-tax-code/index.ts` | Dòng 81 |
| `supabase/functions/knowledge-chat/index.ts` | Dòng 372 |
| `supabase/functions/extract-document/index.ts` | Dòng 229, 310 |

Sau đó redeploy cả 3 Edge Functions.

