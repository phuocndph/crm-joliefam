

## Bỏ Lovable AI, dùng prompt OCR mới trích xuất JSON trực tiếp từ ảnh

### Phân tích

Hiện tại `callAI()` luôn thử Lovable AI trước (dòng 1018-1044) → bị 402 hết credits → mất ~2-5s rồi mới fallback Beeknoee. Bỏ hoàn toàn Lovable AI sẽ giảm latency ngay.

Prompt OCR hiện tại (dòng 1512-1514) trích xuất text thô rồi phải qua Step 2 matching. User muốn dùng prompt mới trích xuất JSON có cấu trúc trực tiếp từ ảnh → có thể bỏ Step 2 nếu OCR trả đủ thông tin.

### Thay đổi

**File: `supabase/functions/lookup-tax-code/index.ts`**

#### 1. Bỏ Lovable AI khỏi `callAI()`
- Xóa block thử Lovable AI (dòng 1017-1045)
- `callAI()` chỉ gọi thẳng Beeknoee

#### 2. Thay prompt OCR Step 1
- Thay prompt hiện tại bằng prompt user cung cấp:
```
Trích xuất thông tin bảng sản phẩm từ ảnh, xuất JSON như sau:
{"san_pham":[{"stt":1,"ten_san_pham":"","quy_cach":"","chat_lieu":"","so_luong":0,"don_gia":0,"thanh_tien":0}]}
Lưu ý:
- Chỉ lấy dữ liệu trong bảng sản phẩm, bỏ qua mọi thông tin khác
- Giữ nguyên số (không thêm/bỏ ký tự)
- Ô chat_lieu nào trống thì để ""
- Chỉ trả về JSON, không giải thích
```

#### 3. Xử lý kết quả OCR JSON mới
- Parse kết quả `san_pham[]` từ OCR
- Chuyển thành text format cho Step 2 matching (vẫn cần match với catalog để lấy `matchedProductId`)
- Format: `"{ten_san_pham} {quy_cach} {chat_lieu} x{so_luong}"` mỗi dòng

#### 4. Cho phép config prompt OCR từ DB
- Đọc `ai_quote_ocr_prompt` từ `aiConfig` — nếu có thì dùng, không thì dùng prompt mặc định mới

### Files thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/functions/lookup-tax-code/index.ts` | Bỏ Lovable AI, thay prompt OCR, parse JSON result |

