

## Sửa logic suy luận chất liệu trong prompt AI Quote Fill

### Vấn đề

Dòng 564-565 hiện tại:
```
Khi chất liệu hoặc mẫu chỉ ghi 1 lần hoặc ở cuối câu → áp dụng cho TẤT CẢ sản phẩm.
Nếu không ghi chất liệu → ưu tiên T250.
```

Rule "mặc định T250" sai — phải suy luận chất liệu từ các SP khác trong cùng báo giá. Ví dụ: khách ghi "ga chun T250 trắng, vỏ chăn trắng 2.0x2.2" → vỏ chăn phải lấy T250 theo ga chun, không phải mặc định cứng.

Khi khách dùng nhiều loại vải (VD: "ga T250 trắng 1m8, ga T300 sọc 1m6") thì phải phân tách đúng nhóm — không áp dụng chung.

### Sửa đổi

**File**: `supabase/functions/lookup-tax-code/index.ts` — dòng 563-565

Thay section `THUỘC TÍNH CHUNG` thành:

```text
## SUY LUẬN CHẤT LIỆU
1. Nếu SP ghi rõ chất liệu (T250, T300...) → dùng đúng chất liệu đó
2. Nếu SP KHÔNG ghi chất liệu → suy luận từ các SP KHÁC trong cùng báo giá:
   - Nếu tất cả SP khác dùng cùng 1 chất liệu → áp dụng chất liệu đó
   - Nếu có NHIỀU chất liệu khác nhau → xác định theo VỊ TRÍ/NGỮ CẢNH: SP nằm gần SP nào (trước/sau) thì dùng chất liệu của SP đó
3. Khi mẫu (trơn/sọc) chỉ ghi 1 lần → áp dụng cho tất cả SP cùng nhóm chất liệu
4. CHỈ KHI không có bất kỳ chất liệu nào trong toàn bộ yêu cầu → mới dùng T250 làm mặc định

VD: "ga chun t250 trắng 1m8, vỏ chăn trắng 2.0x2.2, vỏ gối 50x70 x2"
→ Tất cả = T250 trơn (vì chỉ có 1 chất liệu T250)

VD: "ga chun t300 sọc 1m8 x1, ga chun t250 trắng 1m6 x1, vỏ chăn sọc 2.0x2.2"
→ vỏ chăn sọc → gần "ga t300 sọc" hơn → T300 sọc
```

Cập nhật ví dụ few-shot (dòng 581-589) để phản ánh logic mới — vỏ chăn lấy T250 từ ga chun cùng báo giá thay vì mặc định.

### Kết quả
- AI suy luận chất liệu từ ngữ cảnh thay vì mặc định cứng T250
- Xử lý đúng cả trường hợp 1 loại vải và nhiều loại vải trong cùng báo giá
- Phân tách chính xác theo vị trí/nhóm khi có nhiều chất liệu

