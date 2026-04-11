

## Chức năng Cào dữ liệu từ Link (Web Scraper)

Tạo trang mới cho phép người dùng nhập nhiều URL, chọn model AI, tùy chỉnh prompt, và cào dữ liệu từ các trang web. Dữ liệu trích xuất sẽ hiển thị dạng bảng và có thể xuất CSV.

### Cách hoạt động

```text
Nhập URLs → Firecrawl scrape HTML/markdown → AI phân tích theo prompt → Bảng kết quả → Xuất CSV
```

### Thay đổi cụ thể

**1. Tạo Edge Function `supabase/functions/web-scraper/index.ts`**
- Nhận danh sách URLs, model, prompt từ client
- Dùng Firecrawl API scrape từng URL lấy markdown/html
- Gửi nội dung đã scrape + prompt tùy chỉnh đến Beeknoee AI để trích xuất dữ liệu có cấu trúc (JSON)
- Trả về kết quả đã parse cho từng URL
- Hỗ trợ xử lý tuần tự với delay để tránh rate limit

**2. Tạo trang `src/pages/WebScraperPage.tsx`**
- Form nhập nhiều URL (textarea, mỗi dòng 1 link)
- Dropdown chọn model AI (fetch từ Beeknoee giống AISettingsPage)
- Textarea tùy chỉnh prompt (mặc định prompt trích xuất bảng: Tên, Công ty, Ngành nghề, SĐT, Email)
- Nút "Bắt đầu cào" với progress bar
- Bảng kết quả hiển thị dữ liệu đã trích xuất
- Nút xuất CSV/Excel

**3. Cập nhật routing `src/App.tsx`**
- Thêm route `/web-scraper`

**4. Cập nhật sidebar `src/components/ui/app-sidebar.tsx`**
- Thêm menu item "Cào dữ liệu" với icon Globe

**5. Cập nhật `supabase/config.toml`**
- Khai báo function web-scraper

### Prompt mặc định

Prompt sẽ hướng dẫn AI trích xuất dữ liệu dạng bảng từ nội dung HTML/markdown, trả về JSON array với các trường tùy chỉnh. Mặc định sẽ trích xuất: Tên, Công ty, Ngành nghề, SĐT — khớp với dữ liệu mẫu trong ảnh.

