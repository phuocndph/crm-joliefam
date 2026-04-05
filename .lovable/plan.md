## Cải thiện AI chọn sản phẩm báo giá: suy luận loại vải & hỏi lại khi thiếu thông tin

### Vấn đề

1. **Nhầm vỏ gối / ruột gối**: AI không phân biệt đúng giữa "vỏ gối" và "ruột gối" — đây là 2 sản phẩm hoàn toàn khác nhau
2. **Không suy luận loại vải**: Khi khách ghi "ga T225" thì gối, vỏ gối cùng đơn cũng phải theo loại vải T225, trừ khi ghi rõ loại vải khác
3. **Không hỏi lại khi thiếu thông tin**: Nếu không xác định được loại vải hoặc sản phẩm cụ thể, AI nên trả về thông báo yêu cầu bổ sung thay vì đoán sai

### Giải pháp

Cập nhật prompt AI trong edge function `lookup-tax-code/index.ts`, thêm 3 quy tắc mới:

#### Quy tắc suy luận loại vải
```
8. SUY LUẬN LOẠI VẢI: Nếu đơn hàng có GA loại vải cụ thể (VD: T225, T250, Lụa, Tencel...), 
   thì TẤT CẢ sản phẩm khác (vỏ gối, gối ôm, ga trải...) trong cùng đơn PHẢI theo cùng loại vải đó,
   TRỪ KHI khách ghi rõ loại vải riêng cho từng sản phẩm.
```

#### Quy tắc phân biệt sản phẩm
```
9. PHÂN BIỆT SẢN PHẨM CHÍNH XÁC:
   - "Vỏ gối" ≠ "Ruột gối" — vỏ gối là bao bọc bên ngoài (theo loại vải), ruột gối là phần lõi bên trong
   - "Ga giường" ≠ "Ga trải" — chú ý tên chính xác trong bảng giá
   - Nếu khách chỉ nói "gối" mà không rõ vỏ hay ruột → mặc định là "vỏ gối" (phổ biến hơn trong báo giá)
```

#### Quy tắc hỏi lại
```
10. NẾU KHÔNG XÁC ĐỊNH ĐƯỢC loại vải, loại sản phẩm, hoặc kích thước cụ thể → 
    KHÔNG đoán. Trả về: {"items": [], "clarification": "Mô tả chi tiết những gì cần bổ sung"}
```

#### Xử lý clarification ở frontend (`AIQuoteFill.tsx`)
Khi nhận `clarification` từ AI, hiển thị thông báo yêu cầu người dùng bổ sung thông tin thay vì báo "không tìm thấy sản phẩm".

### Files thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/functions/lookup-tax-code/index.ts` | Thêm 3 quy tắc mới vào prompt AI quote fill |
| `src/components/AIQuoteFill.tsx` | Xử lý response `clarification` — hiển thị câu hỏi bổ sung cho user |
