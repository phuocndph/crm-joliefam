

## Tối ưu xử lý ảnh AI Quote Fill — Giảm thời gian chờ

### Nguyên nhân gốc

Từ logs thấy rõ:
- **Lovable AI hết credits (402)** → tất cả request phải fallback Beeknoee
- **Beeknoee rate limit 1 concurrent** → Bước 1 OCR dùng gemini-2.5-flash xong, Bước 2 gọi lại gemini-2.5-flash ngay → bị 429
- Sau đó thử lần lượt 3 model khác (glm, gpt-oss) đều 429 → chờ 5s retry → lặp lại
- Tổng: 30-60s+ thay vì 10-15s

### Giải pháp

**File: `supabase/functions/lookup-tax-code/index.ts`**

#### 1. Tách model giữa 2 bước để tránh rate limit
- Bước 1 OCR: dùng `gemini-2.5-flash` (vision)
- Bước 2 Text matching: dùng model **khác** đầu tiên (vd `glm-4.7-flash`) rồi mới fallback gemini
- Tránh 2 bước cùng model → 429

#### 2. Thêm delay nhỏ giữa 2 bước khi dùng Beeknoee
- Sau bước 1 OCR thành công, chờ 1-2s trước khi gọi bước 2
- Cho Beeknoee giải phóng concurrent slot

#### 3. Giảm retry overhead
- Bước 2 (text-only) không cần vision → ưu tiên model text nhanh (glm) trước gemini
- Giảm retry wait từ 5s → 2s
- Chỉ retry 1 lần thay vì 2

#### 4. Log thời gian từng bước
- Thêm `console.log` với timestamp để dễ debug: "Step 1 OCR took Xms", "Step 2 matching took Xms"

### Kết quả mong đợi
- Bước 1 OCR: ~5-10s (không đổi)
- Bước 2 Text: ~3-5s (dùng model khác, tránh 429)
- Tổng: ~10-15s thay vì 30-60s+

