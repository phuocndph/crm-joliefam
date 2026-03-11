

# Fix: Chatbot không trả lời

## Nguyên nhân

Từ edge function logs, function chạy thành công (`ctx: kb=0 data=0 total=124`) nhưng không có log lỗi nào từ AI call. Có 2 vấn đề:

1. **Model `google/gemini-3-flash-preview` có thể không hỗ trợ streaming đúng cách** trên Lovable AI Gateway. Khi non-streaming (`stream: false`), function trả lời bình thường (đã test thành công). Nhưng khi streaming, response có thể bị lỗi âm thầm trong async pipe mà không log lỗi.

2. **Lỗi streaming bị nuốt**: Trong `callAI`, async pipe (`reader.read()` → `writer.write()`) chạy ngoài try/catch chính. Nếu AI trả về lỗi trong stream, writer bị abort nhưng **không log gì**, khiến client thấy loading mãi.

## Thay đổi

### File: `supabase/functions/knowledge-chat/index.ts`

1. **Đổi model về `google/gemini-2.5-flash`** - model ổn định hơn, hỗ trợ streaming tốt trên Lovable Gateway.

2. **Thêm error logging trong streaming pipe** - log lỗi khi pipe fail để dễ debug:
```typescript
} catch (e) { 
  console.error("Stream pipe error:", e);
  writer.abort(e); 
}
```

3. **Thêm fallback**: Nếu AI response không phải streaming format (body trống), trả về lỗi rõ ràng thay vì treo.

### File: `src/components/KnowledgeChatbot.tsx`

4. **Thêm timeout cho streaming**: Nếu stream không nhận được data nào trong 15 giây đầu → hiển thị thông báo lỗi, không để loading mãi.

