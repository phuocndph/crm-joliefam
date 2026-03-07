

# Kho Kiến Thức AI cho Nhân Viên

## Tổng quan
Xây dựng trang "Kho Kiến Thức" với chatbot AI, nơi admin/manager upload tài liệu (PDF, Word, text, FAQ), nhân viên hỏi đáp và AI trả lời dựa trên nội dung tài liệu đã tải lên.

## Kiến trúc

```text
┌─────────────────────────────────────────┐
│  Trang Kho Kiến Thức (/knowledge-base) │
├──────────────┬──────────────────────────┤
│  Quản lý     │  Chatbot AI              │
│  tài liệu   │  (Hỏi đáp)              │
│  (Admin/Mgr) │  (Tất cả nhân viên)     │
└──────────────┴──────────────────────────┘
         │                    │
         ▼                    ▼
   Supabase Storage    Edge Function
   + DB metadata       (knowledge-chat)
                            │
                            ▼
                    Google Gemini API
                    (GOOGLE_GEMINI_API_KEY)
```

## Database

### Bảng `knowledge_documents`
- `id`, `title`, `content` (text đã extract), `document_type` (pdf/text/faq), `file_url` (nếu upload file), `manager_id`, `created_by`, `created_at`, `updated_at`
- RLS: Manager/Admin tạo & quản lý, Employee đọc

### Bảng `knowledge_chat_history`
- `id`, `user_id`, `question`, `answer`, `sources` (jsonb - tài liệu tham chiếu), `manager_id`, `created_at`
- RLS: User chỉ xem lịch sử chat của mình

### Storage bucket: `knowledge-files`
- Lưu file PDF/Word upload

## Edge Function: `knowledge-chat`
- Nhận câu hỏi từ nhân viên
- Query tất cả `knowledge_documents` (theo manager_id) để lấy context
- Gửi prompt + context tới Gemini API (đã có `GOOGLE_GEMINI_API_KEY`)
- Trả lời kèm tài liệu tham chiếu

## Frontend

### 1. Trang KnowledgeBase (`src/pages/KnowledgeBase.tsx`)
Layout 2 phần:
- **Bên trái**: Quản lý tài liệu (chỉ admin/manager)
  - Upload file PDF/Word
  - Nhập nội dung text trực tiếp
  - Tạo FAQ (câu hỏi + trả lời)
  - Danh sách tài liệu đã tải, xóa/sửa
- **Bên phải**: Chatbot
  - Ô nhập câu hỏi
  - Hiển thị câu trả lời từ AI (render markdown)
  - Hiển thị tài liệu tham chiếu
  - Lịch sử chat

### 2. Thêm vào sidebar
- Menu item "Kho Kiến Thức" với icon `BookOpen`
- Permission: tất cả nhân viên đều truy cập được

### 3. Extract nội dung file
- Sử dụng Edge Function `extract-document` để đọc nội dung PDF/Word khi upload
- Lưu text đã extract vào cột `content` của `knowledge_documents`

## Các file cần tạo/sửa

| File | Hành động |
|------|-----------|
| Migration SQL | Tạo bảng + RLS + bucket |
| `supabase/functions/knowledge-chat/index.ts` | Edge function chatbot |
| `supabase/functions/extract-document/index.ts` | Extract text từ PDF |
| `src/pages/KnowledgeBase.tsx` | Trang chính |
| `src/components/KnowledgeDocumentManager.tsx` | Quản lý tài liệu |
| `src/components/KnowledgeChatbot.tsx` | Chatbot UI |
| `src/components/ui/app-sidebar.tsx` | Thêm menu |
| `src/App.tsx` | Thêm route |
| `src/hooks/useEmployeePermissions.tsx` | Thêm permission type |
| `supabase/config.toml` | Thêm edge functions |

## Lưu ý kỹ thuật
- Sử dụng `GOOGLE_GEMINI_API_KEY` đã có sẵn (không cần thêm secret)
- Giới hạn context gửi cho Gemini: ghép nội dung tài liệu, cắt tối đa ~30k ký tự
- Prompt tiếng Việt, yêu cầu AI chỉ trả lời dựa trên tài liệu, nếu không biết thì nói rõ
- Nhân viên chỉ thấy tài liệu của manager mình

