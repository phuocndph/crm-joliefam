

# Fix Chatbot Speed - Giảm thời gian phản hồi & tránh WORKER_LIMIT

## Nguyên nhân

Edge Function đang thực hiện quá nhiều công việc trong 1 request:
- 7 database queries song song (role + docs + 5 data tables) ngay cả khi chỉ cần 1-2
- Fallback query bổ sung (line 131) nếu text search trả về rỗng
- System prompt lớn (~7KB) gửi cho AI mỗi lần
- Model `google/gemini-3-flash-preview` có thể chậm hơn `google/gemini-2.5-flash-lite`

## Thay đổi (1 file: `supabase/functions/knowledge-chat/index.ts`)

### 1. Dùng model nhanh hơn
Chuyển từ `google/gemini-3-flash-preview` sang `google/gemini-2.5-flash-lite` - nhanh nhất, phù hợp cho chatbot Q&A đơn giản.

### 2. Tách role query ra khỏi Promise.all
Gọi `get_user_role` trước, dùng kết quả để quyết định có cần fetch data không. Nếu câu hỏi conversational → skip toàn bộ, gọi AI ngay.

### 3. Giảm data fetch triệt để
- Chỉ fetch **tối đa 1-2 loại data** thay vì 5 loại song song
- Giảm limit xuống (10 customers, 10 products, 5 quotes/orders/transactions)
- Bỏ fallback query (line 131-137) - nếu text search không tìm thấy thì không cần context

### 4. Cắt giảm system prompt
- Rút gọn instructions xuống 2-3 dòng
- Giới hạn tổng context tối đa 4000 chars (thay vì 8000)

### 5. Thêm max_tokens để AI trả lời ngắn gọn hơn
Thêm `max_tokens: 500` vào AI request để giới hạn độ dài response, giảm thời gian generate.

### 6. Thêm timeout cho client
Trong `KnowledgeChatbot.tsx`, thêm `AbortController` với timeout 30s - nếu quá lâu thì báo lỗi thay vì loading mãi.

