

## Sửa prompt AI Quote Fill: phân tích chính xác trơn/sọc

### Vấn đề hiện tại
1. Prompt dòng 505 ghi: `Nếu sản phẩm có "tron" và "soc", không ghi cụ thể → ưu tiên "sọc" (soc)` — điều này khiến AI tự động chọn sọc ngay cả khi không cần thiết
2. Prompt không nhấn mạnh đủ việc **phải tuân thủ chính xác** yêu cầu trơn/sọc của khách
3. Không có quy tắc rõ ràng khi khách ghi rõ nhưng bảng giá không có biến thể đó

### Giải pháp
Sửa prompt trong `supabase/functions/lookup-tax-code/index.ts` (dòng 485-526) với các thay đổi:

**1. Sửa quy tắc phân tích input (mục 4)**
- Thêm nhấn mạnh: khi khách ghi rõ "trơn" thì **BẮT BUỘC** chọn sản phẩm trơn, ghi rõ "sọc" thì **BẮT BUỘC** chọn sọc
- Không được tự ý đổi trơn thành sọc hoặc ngược lại

**2. Xóa dòng 505 (mặc định ưu tiên sọc)**
- Thay bằng: nếu khách không ghi rõ trơn hay sọc → trả `clarification` hỏi lại

**3. Thêm quy tắc ưu tiên matching rõ ràng**
```
## THỨ TỰ ƯU TIÊN KHI SO KHỚP
1. Loại sản phẩm (ga chun, ga phủ, vỏ chăn, vỏ gối...)
2. Chất liệu vải (T250, T300, LTH...) — BẮT BUỘC đúng
3. Mẫu (trơn/sọc/chần) — BẮT BUỘC đúng nếu khách ghi rõ
4. Kích thước — chọn lớn hơn gần nhất nếu không khớp chính xác
→ Nếu không tìm được sản phẩm khớp mẫu trơn/sọc → dùng clarification hỏi lại
→ KHÔNG BAO GIỜ tự đổi trơn↔sọc khi khách đã ghi rõ
```

**4. Thêm quy tắc khi thiếu thông tin mẫu**
- Khách không ghi trơn/sọc → trả `clarification` hỏi: "Vui lòng cho biết [sản phẩm] cần loại trơn hay sọc?"

### File thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/functions/lookup-tax-code/index.ts` | Sửa prompt dòng 485-526: thêm quy tắc matching chặt cho trơn/sọc, xóa default ưu tiên sọc, thêm clarification khi thiếu info |

### Redeploy
- Edge Function `lookup-tax-code`

