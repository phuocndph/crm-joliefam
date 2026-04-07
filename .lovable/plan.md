

## Kết nối tất cả model miễn phí Beeknoee với fallback chain

### Vấn đề
Hiện tại chỉ dùng 1 model `glm-4.7-flash`. Khi model này timeout (524) hoặc bị concurrent limit (429), request thất bại hoàn toàn.

### Giải pháp
Tạo **fallback chain** thử lần lượt nhiều model miễn phí trên Beeknoee. Nếu model đầu lỗi → tự động thử model tiếp theo.

Thứ tự ưu tiên (dựa trên hiệu năng):
1. `glm-4.7-flash` — mạnh nhất, 26 tok/s
2. `glm-4.5-flash` — backup, tốc độ tương đương
3. `gpt-oss-120b` — model lớn nhất, chậm hơn nhưng vẫn miễn phí

### Thay đổi cụ thể

Tạo hàm helper `callBeeknoee(apiKey, payload)` chung cho cả 3 file, thử lần lượt từng model với timeout 25s mỗi model:

```text
callBeeknoee(apiKey, payload):
  models = ["glm-4.7-flash", "glm-4.5-flash", "gpt-oss-120b"]
  for each model:
    try fetch with AbortController timeout 25s
    if 429 (concurrent): wait 2s, try next model
    if 524 (timeout): try next model  
    if ok: return response
  throw "All Beeknoee models failed"
```

| File | Thay đổi |
|------|----------|
| `supabase/functions/lookup-tax-code/index.ts` | Thay fetch Beeknoee đơn lẻ → gọi `callBeeknoee` với fallback chain |
| `supabase/functions/knowledge-chat/index.ts` | Tương tự |
| `supabase/functions/extract-document/index.ts` | Tương tự cho cả `extractPDFWithAI` và `cleanWithAI` |

Sau đó redeploy cả 3 Edge Functions.

