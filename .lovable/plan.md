

# Tối ưu tốc độ phản hồi Chatbot AI

## Phân tích bottleneck hiện tại

1. **Model**: đang dùng `gemini-2.5-flash-lite` - nhanh nhưng `gemini-3-flash-preview` mới hơn và được khuyến nghị
2. **Tuần tự không cần thiết**: `getUser()` → `get_user_role()` → data fetch. Role check có thể chạy song song với data fetch
3. **Knowledge docs search chạy luôn** kể cả khi câu hỏi rõ ràng là về dữ liệu (khách hàng, đơn hàng...)
4. **Chat history gửi quá nhiều**: 4 tin nhắn x 300 ký tự = thêm ~1200 token vào prompt
5. **Thiếu `temperature: 0`**: model mất thêm thời gian sampling

## Thay đổi

### File: `supabase/functions/knowledge-chat/index.ts`

1. **Đổi model sang `google/gemini-3-flash-preview`** - model mới nhất, nhanh hơn

2. **Song song hóa auth + role**: Gộp `getUser()` và `get_user_role()` thành 1 bước, sau đó chạy song song knowledge docs + data fetch

3. **Skip knowledge docs search cho câu hỏi dữ liệu thuần**: Khi detect rõ intent (doanh thu, đơn hàng, khách hàng...) → không cần search tài liệu, tiết kiệm 200-500ms

4. **Giảm chat history xuống 2 tin nhắn** (từ 4), cắt content xuống 150 ký tự (từ 300)

5. **Thêm `temperature: 0`** để model trả lời nhanh hơn, không cần sampling

6. **Giảm `max_tokens` xuống 400** cho câu hỏi dữ liệu (vốn chỉ cần trả lời ngắn)

### File: `src/components/KnowledgeChatbot.tsx`

7. **Giảm chat history gửi lên từ 4 xuống 2 tin nhắn** - giảm payload size

Ước tính cải thiện: giảm ~30-50% thời gian phản hồi (từ 5-8s xuống 2-4s).

