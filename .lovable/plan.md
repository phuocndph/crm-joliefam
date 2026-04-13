

## Phân tích logic "Hàng nặng" và chuyển đổi shop theo KG

### 1. "Hàng nặng" / "Hàng nhẹ" là gì?

Đây là **gói dịch vụ** do GHN API trả về (endpoint `available-services`), không phải logic của app. GHN tự quyết định dịch vụ nào khả dụng dựa trên quận gửi/nhận. App chỉ hiển thị kết quả API -- không cần sửa gì ở đây.

### 2. Logic chuyển đổi shop theo KG hiện tại

**Hàm `parseWeightRange`** (line 29-41) parse tên shop để xác định khoảng KG:

```text
Tên shop             → min   max (exclusive)
─────────────────────────────────────────────
"0-2kg"              → 0     3    (bao phủ 0 - 2.99kg)
"3-9kg"              → 3     10   (bao phủ 3 - 9.99kg)
"10-19kg"            → 10    20   (bao phủ 10 - 19.99kg)
"từ 20kg trở lên"    → 20    ∞    (20kg+)
"dưới 5kg"           → 0     5
```

**Vấn đề phát hiện**: Logic `max = parseInt(rangeMatch[2]) + 1` trên line 33 có thể SAI nếu tên shop thực tế là:
- **"0-2kg"** → max thành 3 (đúng, vì 2kg vẫn nằm trong shop này)
- **"3-9kg"** → max thành 10 (đúng)
- Nhưng nếu tên shop là **"0-3kg"** và **"3-9kg"** → 3kg sẽ rơi vào shop "0-3kg" (max=4) thay vì "3-9kg" (min=3) -- ưu tiên shop tìm thấy trước (find)

### 3. Logic auto-select (line 126-151)

```text
effectiveWeightKg = max(weight, dimensionalWeight) / 1000

1. Tìm shop có min <= weight < max → chọn shop đó
2. Nếu không tìm thấy → fallback: chọn shop có min cao nhất mà <= weight
```

### 4. Đề xuất kiểm tra và cải thiện

Cần xác minh tên shop thực tế trên tài khoản GHN của bạn để đảm bảo logic parse đúng. Ngoài ra có thể cải thiện:

**a) Thêm debug log hiển thị tất cả shop và range đã parse** -- để dễ kiểm tra:
- Trong auto-select useEffect, log `shops.map(s => ({ name: s.name, ...parseWeightRange(s.name) }))` ra console

**b) Sửa logic biên** nếu tên shop dùng format liền mạch (ví dụ "0-2kg", "3-9kg"):
- Hiện tại `max = số_cuối + 1` → "0-2kg" bao phủ đến 2.99kg. Nếu muốn "0-2kg" chỉ bao phủ đến **dưới 3kg** thì logic đúng. Nhưng nếu shop "3-9kg" bắt đầu từ 3kg thì không có gap.

**c) Hiển thị bảng shop + range trong UI** để user dễ kiểm chứng -- thêm tooltip hoặc expandable section hiển thị danh sách shop cùng khoảng KG tương ứng.

### Thay đổi đề xuất

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. Thêm console.log debug trong auto-select useEffect để log toàn bộ shop + range đã parse
2. Thêm hiển thị nhỏ (expandable) danh sách tất cả shop kèm khoảng KG tại phần "Bên gửi", giúp user thấy rõ shop nào đang active và tại sao

Nếu bạn cho tôi biết **tên chính xác các shop** trên tài khoản GHN, tôi sẽ xác nhận logic parse có đúng hay cần sửa.

