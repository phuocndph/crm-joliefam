

# Cải thiện UI hiển thị tin nhắn chatbot

## Thay đổi chính

### 1. Bong bóng tin nhắn đẹp hơn
- **User messages**: Thêm gradient xanh đậm, shadow mềm, và hiệu ứng xuất hiện mượt
- **Assistant messages**: Nền trắng/gray với border mỏng, shadow nhẹ, typography cải thiện
- **Animations**: Thêm `animate-in slide-in` cho tin nhắn mới

### 2. Avatar và header
- **AI Avatar**: Gradient background với icon Bot, thêm hiệu ứng pulse khi đang trả lời
- **User Avatar**: Gradient cam/xanh đậm hơn
- **Typing indicator**: 3 chấm với animation mượt hơn, có hiệu ứng wave

### 3. Markdown rendering đẹp hơn
- **Headings**: Font weight đậm, màu primary, spacing tốt hơn
- **Lists**: Custom bullet points với màu primary, indent đẹp
- **Code blocks**: Background xám nhạt, rounded corners, font monospace
- **Links**: Màu primary với hover underline
- **Paragraphs**: Line height 1.6, margin hợp lý

### 4. Sources (Tài liệu tham khảo)
- **Card style**: Badge có màu theo loại tài liệu (PDF, DOC, URL...)
- **Icon**: Thêm icon file-type cho từng loại
- **Layout**: Hiển thị dạng flex wrap với gap đều

### 5. Input area
- **Textarea thay vì Input**: Cho phép nhập nhiều dòng, auto-resize
- **Focus ring**: Gradient border khi focus
- **Send button**: Gradient background, hiệu ứng scale khi hover

### 6. Scroll và layout
- **Smooth scroll**: Cải thiện scroll behavior
- **Message grouping**: Giảm gap giữa tin nhắn cùng role
- **Timestamp**: Hiển thị thời gian gửi (tùy chọn)

## Các file cần sửa

### `src/components/KnowledgeChatbot.tsx`
- Thêm imports mới (Textarea, các icon bổ sung)
- Cải thiện CSS classes cho message bubbles
- Thêm animation keyframes
- Cải thiện ReactMarkdown styling với components prop
- Thêm icon cho sources theo type

### CSS bổ sung trong file
- Custom animations cho message appear
- Typing indicator animation
- Markdown content styling

