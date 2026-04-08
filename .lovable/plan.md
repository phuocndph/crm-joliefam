

## Phương án tối ưu: Bỏ hardcode rules, dựa hoàn toàn vào catalog data

### Phân tích gốc rễ

Prompt hiện tại liệt kê rules cho từng loại SP cụ thể (ga chun, vỏ chăn, vỏ gối, ruột gối...) nhưng catalog có **1769 sản phẩm, 512 danh mục** — bao gồm tấm trang trí, gối trang trí, áo choàng tắm, bảo vệ nệm, đệm, topper, chăn seoul, rèm, bộ combo... Không thể viết rule cho từng loại.

**Vấn đề thực sự**: AI đang bị "giới hạn tầm nhìn" vì prompt dạy nó chỉ biết vài loại SP, khiến nó bỏ qua các SP khác dù chúng có sẵn trong bảng giá.

### Phương án: Prompt tổng quát hóa

Thay vì liệt kê rules cho từng danh mục, viết lại prompt theo hướng:
1. Dạy AI **cách đọc catalog** (format 5 cột, cách so khớp)
2. Giữ lại các rule **chung** (viết tắt tiếng Việt, quy đổi kích thước, ưu tiên giá)
3. Xóa bỏ rules gắn với danh mục cụ thể — để AI tự hiểu từ tên + mô tả sản phẩm trong catalog

### Chi tiết sửa đổi

**File**: `supabase/functions/lookup-tax-code/index.ts`

#### 1. Viết lại `aiQuoteFillPrompt` — tổng quát hóa

Xóa toàn bộ các block:
- "PHÂN BIỆT RUỘT GỐI vs VỎ GỐI" (không cần, tên SP trong catalog đã phân biệt rõ)
- Các rule cụ thể như `"gối" không nói rõ → mặc định "Vỏ gối"` 

Thay bằng rule tổng quát:
```text
## CÁCH SO KHỚP SẢN PHẨM
1. Đọc KỸ tên tất cả sản phẩm trong bảng giá — bảng giá chứa TOÀN BỘ danh mục (ga, chăn, gối, tấm trang trí, đệm, topper, rèm, áo choàng, bảo vệ nệm, v.v.)
2. So khớp từ khóa từ yêu cầu khách với TÊN sản phẩm trong bảng giá
3. Dùng CẢ 3 cột Tên + Quy cách + Mô tả để xác định đúng sản phẩm
4. Khi có nhiều SP tên giống, phân biệt bằng: chất liệu (T200/T250/T300...), mẫu (trơn/sọc), kích thước
5. Chọn kích thước LỚN HƠN gần nhất nếu không khớp chính xác
6. KHÔNG tự giới hạn vào vài loại SP — tìm kiếm TOÀN BỘ bảng giá
```

#### 2. Giữ lại rules chung (đã ổn)
- Hiểu tiếng Việt không dấu (trang=trơn, soc=sọc...)
- Chuẩn hóa kích thước (1m6=160, 14p=14cm...)
- Thuộc tính chung (chất liệu cuối câu áp dụng cho tất cả)
- Giá & số lượng
- LTH = T225

#### 3. Cập nhật ví dụ few-shot thêm SP đa dạng
Thêm 1 ví dụ phức tạp có tấm trang trí + gối trang trí để chứng minh AI phải tìm trong toàn bộ catalog:
```text
Input: "tam trang tri 1m6 x1, vo goi trang tri 45x45 x2, ga chun t250 tron 1m8x2mx20p x1"
Output:
{"items":[
  {"matchedProductId":"id-tam","customName":"Tấm trang trí 160 : 50x235","quantity":1,"price":210000,...},
  {"matchedProductId":"id-goi-tt","customName":"Vỏ gối trang trí 45x45","quantity":2,"price":60000,...},
  {"matchedProductId":"id-ga","customName":"Ga chun T250 trơn 180x200x20cm","quantity":1,"price":...,...}
]}
```

### Kết quả kỳ vọng
- AI không còn bị giới hạn vào vài loại SP hardcoded
- Match được tất cả 512 danh mục có trong catalog (tấm trang trí, gối trang trí, đệm, topper, rèm, áo choàng...)
- Prompt ngắn hơn (bỏ rules cụ thể) → ít token hơn, AI xử lý nhanh hơn
- Vẫn giữ chính xác các quy tắc chung (viết tắt, kích thước, giá)

