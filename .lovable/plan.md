

# Nâng cấp toàn diện Kho Kiến Thức

## Trạng thái hiện tại

- **3 tài liệu** trong DB, tất cả dạng text (đã nhập thủ công), content length: 1,710 - 8,222 ký tự
- Edge function `extract-document` **không có log** → có thể chưa được deploy thành công hoặc chưa được gọi
- `btoa(String.fromCharCode(...chunk))` ở line 170 vẫn có thể gây stack overflow với chunk 32k
- Chatbot gửi **toàn bộ tài liệu** vào context (tối đa 30k chars) → không scale
- UI chatbot và document manager khá cơ bản

---

## 1. Fix đọc file PDF/DOCX

**Vấn đề**: `btoa(String.fromCharCode(...chunk))` spread operator vẫn crash với chunk 32k vì spread đẩy 32,768 arguments lên call stack.

**Sửa**: Dùng vòng lặp thay spread operator:
```typescript
// Thay vì: btoa(String.fromCharCode(...chunk))
// Dùng:
let binaryStr = "";
for (let j = 0; j < chunk.length; j++) {
  binaryStr += String.fromCharCode(chunk[j]);
}
base64 += btoa(binaryStr);
```

**Thêm**: Progress logging, retry logic, và file size limit check (> 5MB thì chia nhỏ gửi AI).

| File | Thay đổi |
|------|----------|
| `supabase/functions/extract-document/index.ts` | Fix btoa, thêm chunked AI extraction cho file lớn |

---

## 2. Streaming AI Response cho Chatbot

**Hiện tại**: Chatbot gọi edge function → chờ toàn bộ response → hiển thị. Với câu trả lời dài, user chờ 5-15 giây.

**Giải pháp**: 
- Edge function `knowledge-chat` dùng `stream: true` khi gọi AI Gateway
- Trả về `ReadableStream` (SSE) cho client
- Client component `KnowledgeChatbot` đọc stream và hiển thị từng token

| File | Thay đổi |
|------|----------|
| `supabase/functions/knowledge-chat/index.ts` | Thêm streaming mode, parse SSE từ AI Gateway |
| `src/components/KnowledgeChatbot.tsx` | Đọc streaming response, render incremental text |

---

## 3. Cải thiện giao diện

**Thay đổi UI**:
- **KnowledgeBase page**: Layout 2 cột rộng hơn cho desktop, full-screen chatbot cho employee
- **Document Manager**: Drag-and-drop upload area, progress bar khi upload, re-extract button cho file đã upload
- **Chatbot**: Bubble chat đẹp hơn, typing indicator animation, dark mode support, suggested follow-up questions
- **Responsive**: Mobile-friendly layout với bottom sheet chatbot

| File | Thay đổi |
|------|----------|
| `src/pages/KnowledgeBase.tsx` | Layout mới, responsive grid |
| `src/components/KnowledgeDocumentManager.tsx` | Drag-drop, progress bar, re-extract button |
| `src/components/KnowledgeChatbot.tsx` | UI nâng cấp, typing animation, follow-up suggestions |

---

## 4. Tìm kiếm thông minh hơn

**Hiện tại**: Gửi TOÀN BỘ tài liệu vào context AI → giới hạn 30k chars, không scale khi có nhiều tài liệu.

**Giải pháp**: Keyword-based relevance scoring (không cần embedding vector vì chưa có pgvector):
- Khi user hỏi, tách câu hỏi thành keywords
- Dùng PostgreSQL full-text search (`to_tsvector`, `plainto_tsquery`) hoặc ILIKE matching
- Chỉ gửi top 3-5 tài liệu liên quan nhất vào AI context
- Thêm cột `search_vector` (tsvector) vào `knowledge_documents`

| File | Thay đổi |
|------|----------|
| Migration SQL | Thêm `search_vector` column, GIN index, trigger auto-update |
| `supabase/functions/knowledge-chat/index.ts` | Query với full-text search thay vì fetch all |

---

## Tóm tắt thay đổi

| # | Hạng mục | Files |
|---|----------|-------|
| 1 | Fix PDF/DOCX extraction | `extract-document/index.ts` |
| 2 | Streaming chatbot | `knowledge-chat/index.ts`, `KnowledgeChatbot.tsx` |
| 3 | UI nâng cấp | `KnowledgeBase.tsx`, `KnowledgeDocumentManager.tsx`, `KnowledgeChatbot.tsx` |
| 4 | Full-text search | Migration SQL, `knowledge-chat/index.ts` |

