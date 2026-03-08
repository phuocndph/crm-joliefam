

# Fix Streaming - Response hiện từng token real-time

## Vấn đề

Streaming code logic đúng nhưng response headers thiếu các header quan trọng để ngăn proxy/CDN buffering:
- Thiếu `Cache-Control: no-cache` 
- Thiếu `Connection: keep-alive`
- Thiếu `X-Accel-Buffering: no` (nginx proxy)

Supabase Edge Functions chạy qua reverse proxy, nếu không có các header này, proxy sẽ buffer toàn bộ response rồi mới gửi cho client => user thấy chờ lâu rồi hiện hết một lúc.

## Thay đổi

### File: `supabase/functions/knowledge-chat/index.ts`

1. **Thêm SSE headers** vào response streaming (line 367-369):
```typescript
return new Response(transformStream.readable, {
  headers: {
    ...corsHeaders,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive", 
    "X-Accel-Buffering": "no",
  },
});
```

2. **Cũng thêm headers cho blocked message streaming response** (line 74-76) để nhất quán.

3. **Flush từng chunk nhỏ hơn**: Thay vì `pipeTo` trực tiếp (có thể bị batch), đọc từng chunk từ AI Gateway và enqueue ngay lập tức qua manual read loop để đảm bảo mỗi chunk được flush ngay:
```typescript
const reader = response.body!.getReader();
const writer = transformStream.writable.getWriter();
await writer.write(encoder.encode(sourcesEvent));

(async () => {
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { writer.close(); break; }
      await writer.write(value);
    }
  } catch (e) { writer.abort(e); }
})();

return new Response(transformStream.readable, { ... });
```

Tổng cộng chỉ sửa 1 file edge function, deploy lại.

