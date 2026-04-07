

## Tối ưu tốc độ và độ chính xác AI báo giá

### Vấn đề hiện tại
1. **Lovable AI luôn lỗi 402** (hết credits) → mất thời gian thử rồi mới fallback sang Beeknoee
2. **Gửi toàn bộ 917 sản phẩm** lên AI dù khách chỉ cần 3-5 sản phẩm → prompt quá dài, AI xử lý chậm và dễ nhầm
3. **Model `google/gemini-3-flash-preview`** không có trên Beeknoee → luôn phải dùng model khác
4. **Yêu cầu AI trả JSON text** → dễ bị format sai, phải clean markdown

### Giải pháp

#### 1. Bỏ qua Lovable AI khi đã hết credits (tiết kiệm 2-3s)
Phát hiện lỗi 402 → ghi nhớ và chuyển thẳng Beeknoee, không thử lại Lovable trong cùng request.

#### 2. Lọc sản phẩm trước khi gửi AI (giảm 70-80% token)
Client-side pre-filter: phân tích keywords từ yêu cầu khách → chỉ gửi sản phẩm có tên liên quan. Ví dụ khách nói "ga T225 1m8" → chỉ gửi ~50 sản phẩm chứa "ga", "T225", "160", "180" thay vì 917 sản phẩm.

#### 3. Dùng tool calling thay vì yêu cầu JSON text (chính xác hơn)
Sử dụng `tools` + `tool_choice` trong API call để AI trả về structured output chuẩn, không cần parse/clean JSON thủ công.

#### 4. Tối ưu prompt (gọn hơn, rõ hơn)
Rút gọn prompt hướng dẫn, giữ nguyên logic nhưng bớt lặp lại.

### Thay đổi chi tiết

| File | Nội dung |
|------|----------|
| `src/components/AIQuoteFill.tsx` | Thêm hàm `preFilterProducts()` lọc sản phẩm theo keywords trước khi gửi AI. Giới hạn tối đa 100 sản phẩm liên quan nhất |
| `supabase/functions/lookup-tax-code/index.ts` | (1) Xử lý nhanh lỗi 402 Lovable AI, (2) Dùng tool calling cho `ai_quote_fill`, (3) Rút gọn prompt |

### Ước tính cải thiện
- Tốc độ: nhanh hơn **2-3x** (ít token + bỏ retry Lovable)
- Chính xác: cao hơn nhờ ít sản phẩm nhiễu + structured output

