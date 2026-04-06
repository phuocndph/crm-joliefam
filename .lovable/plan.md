

## Chuyển sang model miễn phí trên Beeknoee

### Vấn đề
Tài khoản Beeknoee hết số dư, model `gemini-2.5-flash` tính phí nên không dùng được.

### Giải pháp
Đổi model Beeknoee sang `glm-4.7-flash` — model miễn phí, tốc độ 26 tok/s, unlimited tokens. Đây là model mạnh nhất trong 3 model miễn phí (GLM-4.7 > GLM-4.5, và nhanh hơn GPT-OSS-120B).

### Thay đổi

Thay `model: "gemini-2.5-flash"` → `model: "glm-4.7-flash"` tại 4 vị trí trong 3 file:

| File | Dòng |
|------|------|
| `supabase/functions/lookup-tax-code/index.ts` | 81 |
| `supabase/functions/knowledge-chat/index.ts` | 372 |
| `supabase/functions/extract-document/index.ts` | 229, 310 |

Sau đó redeploy cả 3 Edge Functions.

