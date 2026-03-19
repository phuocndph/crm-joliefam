

## Phân tích: Tích hợp masothue.com để tra cứu MST

### Vấn đề
Trang masothue.com **không có API công khai**. Trang web chỉ hiển thị dữ liệu dưới dạng HTML và URL yêu cầu biết trước slug (ví dụ: `masothue.com/0110184566-cong-ty-tnhh-noi-that-remy`). Khi chỉ nhập MST đơn thuần (`masothue.com/0110184566`), trang trả về lỗi 404.

### Giải pháp đề xuất
Cập nhật edge function `lookup-tax-code` để **scrape HTML từ masothue.com** thay thế cho escodata.net:

1. Fetch trang tìm kiếm masothue.com với MST
2. Parse HTML để trích xuất: Tên công ty, Người đại diện, Địa chỉ
3. Giữ VietQR làm fallback nếu masothue.com không trả kết quả

### Cách hoạt động

```text
Người dùng nhập MST
  → Edge function fetch: https://masothue.com/{MST}-*
  → Parse HTML tìm: company name, representative, address
  → Nếu thất bại → fallback VietQR
  → Trả về kết quả cho form
```

### Thay đổi cụ thể

**File:** `supabase/functions/lookup-tax-code/index.ts`
- Thay thế logic gọi escodata.net (dòng 88-112) bằng logic scrape masothue.com
- Sử dụng regex để parse HTML response, trích xuất:
  - Tên công ty (từ thẻ `<h1>`)
  - Người đại diện (từ thẻ chứa "Người đại diện")
  - Địa chỉ (từ thẻ `<address>`)
  - Ngày hoạt động, trạng thái (nếu có)
- Giữ nguyên fallback VietQR và các chức năng khác (parse_text, parse_image, parse_order)

### Lưu ý
- Scraping HTML có thể bị chặn hoặc thay đổi cấu trúc bất cứ lúc nào
- masothue.com có thể rate-limit requests từ server
- Sẽ thêm User-Agent header để giảm khả năng bị chặn

### Không thay đổi
- Frontend component (vẫn gọi cùng edge function, cùng format response)
- Các chức năng khác của lookup-tax-code (parse_text, parse_image, etc.)
- Database schema

