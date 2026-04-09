

## Tách UX thành 2 bước: Phân tích ảnh → AI chọn sản phẩm

### Hiện tại
Nút "AI tự chọn sản phẩm" làm cả 2 việc (OCR + matching) trong 1 lần bấm. User không thấy/sửa được text OCR trước khi matching.

### Thay đổi

**File: `src/components/AIQuoteFill.tsx`**

1. **Thêm state `isAnalyzingImage`** để theo dõi trạng thái đang OCR ảnh

2. **Thêm hàm `handleAnalyzeImage`** — chỉ gọi OCR (không matching):
   - Gửi ảnh lên edge function với type mới hoặc flag `ocrOnly: true`
   - Nhận text OCR trả về → đưa vào `setRequest(ocrText)`
   - Xóa ảnh sau khi OCR xong (vì đã chuyển thành text)

3. **Đổi logic nút chính (line 342)**:
   - Khi **có ảnh** (`imageFile != null`): hiện nút "Phân tích ảnh" (chạy OCR only → điền text vào textarea)
   - Khi **không có ảnh**: hiện nút "AI tự chọn sản phẩm" như cũ (chạy matching từ text)

4. **Sửa `handleAIFill`**: Bỏ phần gửi `imageBase64` — chỉ gửi text thuần (vì ảnh đã được OCR thành text ở bước trước)

**File: `supabase/functions/lookup-tax-code/index.ts`**

5. **Thêm xử lý `ocrOnly` flag**: Khi nhận `data.ocrOnly === true`, chỉ chạy Step 1 OCR rồi trả text về client ngay — không chạy Step 2 matching.

### Flow mới
```text
User gửi ảnh → Nút đổi thành "Phân tích ảnh"
  → Bấm → OCR → Text điền vào textarea
  → Nút đổi lại "AI tự chọn sản phẩm"
  → User xem/sửa text → Bấm → Matching → Kết quả
```

### Lợi ích
- User kiểm tra/sửa text OCR trước khi matching
- Tách rõ 2 bước, dễ debug
- Matching không gửi ảnh nữa → nhanh hơn

