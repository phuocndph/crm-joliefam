

# Fix Chatbot "Tư Duy" - Cải thiện cách xử lý câu hỏi có ngày tháng và tổng hợp dữ liệu

## Vấn đề cốt lõi

Dữ liệu đã có sẵn trong database, nhưng Edge Function không biết cách:
1. **Parse ngày tháng** từ câu hỏi ("1/3/2026 đến 8/3/2026") để filter query
2. **Tổng hợp dữ liệu** trước khi gửi cho AI - thay vì gửi 10 dòng giao dịch gần nhất (không đúng khoảng thời gian), nên tính tổng thu/chi rồi gửi summary
3. **System prompt quá sơ sài** - AI không biết mình cần tính toán gì từ data

## Thay đổi

### File: `supabase/functions/knowledge-chat/index.ts`

**1. Thêm date range parser**
- Detect các pattern: `dd/mm/yyyy`, `dd/mm`, `tháng X`, `tháng X/yyyy`
- Convert sang ISO date để dùng `.gte()` / `.lte()` trên Supabase query
- Ví dụ: "doanh thu từ 1/3/2026 đến 8/3/2026" → `startDate=2026-03-01`, `endDate=2026-03-08`

**2. Filter transactions theo date range**
- Khi có ngày: `.gte("date", startDate).lte("date", endDate)` thay vì `.limit(10)` mặc định
- Khi không có ngày: giữ nguyên logic hiện tại (10 giao dịch gần nhất)

**3. Server-side aggregation cho câu hỏi doanh thu**
- Khi detect "doanh thu/revenue/tổng thu/tổng chi": tính `totalIncome`, `totalExpense`, `net` ngay trong function
- Gửi cho AI 2-3 dòng summary thay vì raw rows → AI trả lời nhanh và chính xác hơn

**4. Cải thiện system prompt**
- Thêm hướng dẫn ngắn gọn: "Dữ liệu đã được tổng hợp sẵn. Trả lời dựa trên dữ liệu được cung cấp."
- Khi có date range, ghi rõ khoảng thời gian trong context để AI biết

**5. Tương tự cho orders**
- Khi hỏi "đơn hàng tháng 3" → filter `.gte("created_at", startDate).lte("created_at", endDate)`

### File: `src/components/KnowledgeChatbot.tsx`

- Tăng timeout từ 30s lên 45s cho các câu hỏi cần aggregate nhiều data

## Ví dụ kết quả

Câu hỏi: "Xem doanh thu từ 1/3/2026 đến 8/3/2026"

Trước: Fetch 10 giao dịch gần nhất → AI đoán bừa → timeout
Sau: Filter transactions trong khoảng 1/3-8/3 → tính tổng thu 50tr, chi 20tr, lãi 30tr → AI trả lời chính xác trong 2-3 giây

