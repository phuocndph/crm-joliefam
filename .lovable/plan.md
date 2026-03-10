

# Phân quyền Kho Kiến Thức - Nhân viên chỉ được thêm, không được xóa tài liệu

## Vấn đề hiện tại

1. `KnowledgeBase.tsx` chỉ hiển thị panel quản lý tài liệu cho admin/manager (`isManager`). Nhân viên chỉ thấy chatbot.
2. `KnowledgeDocumentManager.tsx` không có khái niệm role - ai vào cũng thấy nút Xóa, Sửa.

## Thay đổi

### File 1: `src/components/KnowledgeDocumentManager.tsx`
- Thêm prop `canDelete?: boolean` (mặc định `true`)
- Khi `canDelete = false`: ẩn nút Xóa (Trash2) và nút Sửa (Edit) trên mỗi tài liệu
- Nhân viên vẫn thấy đầy đủ: upload file, thêm text, thêm FAQ, xem preview

### File 2: `src/pages/KnowledgeBase.tsx`
- Hiển thị panel tài liệu cho cả nhân viên (không chỉ manager)
- Truyền `canDelete={isManager}` vào `KnowledgeDocumentManager`
- Desktop: nhân viên cũng thấy layout 2 cột (tài liệu + chatbot)
- Mobile: nhân viên cũng thấy tabs Chat AI / Tài liệu (giống manager)

### Không cần thay đổi database
RLS trên `knowledge_documents` đã cho phép authenticated users full access. Việc ẩn nút xóa ở UI là đủ cho yêu cầu này. Nếu cần thắt chặt thêm ở DB level (chỉ manager mới xóa được), sẽ cần thêm RLS policy riêng.

