

## Thêm mapping tên vải: LTH = T225

### Vấn đề
AI không biết "LTH" chính là "T225", nên khi khách nói "vải LTH trắng sọc" thì AI không tìm được sản phẩm T225 tương ứng trong bảng giá.

### Thay đổi

**File: `supabase/functions/lookup-tax-code/index.ts`**

Thêm Rule 11 vào prompt (sau rule 10):

```text
11. MAPPING TÊN VẢI TƯƠNG ĐƯƠNG:
    - "LTH" = "T225" — đây là CÙNG MỘT loại vải, tên gọi khác nhau
    - Khi khách nói "LTH" → tìm sản phẩm có tên chứa "T225" trong bảng giá
    - Khi khách nói "T225" → cũng có thể match sản phẩm tên "LTH" nếu có
    - VD: "Ga chun LTH trắng sọc 160x200x20cm" → tìm "Ga chun ks T225 trắng sọc 160x200x20cm"
```

Chỉ sửa 1 file duy nhất, thêm vài dòng vào prompt.

