

## Fix: AI không nhận diện "microfiber" = "micro" và khăn kích thước gần đúng

### Nguyên nhân gốc

Kiểm tra database thực tế cho thấy:

| User yêu cầu | Tên trong DB | Vấn đề |
|---|---|---|
| Ruột gối **microfiber** 50x70 | Ruột gối bông **micro** 50x70 | AI không biết "microfiber" = "micro" |
| Khăn **34x70**x120g | Khăn mặt **30x70**x120g | Kích thước khác nhau, AI không match |
| Khăn 34x34x60g | Khăn mặt 34x34x60g dệt logo | Tên gần giống nhưng có thêm "dệt logo" |

AI thấy tên không khớp chính xác → báo "không có trong bảng giá" thay vì match sản phẩm gần nhất.

### Thay đổi

#### 1. Edge Function prompt — thêm Rule 12 (`supabase/functions/lookup-tax-code/index.ts`)

Thêm rule mapping tên viết tắt/đầy đủ:

```text
12. MAPPING TÊN VIẾT TẮT / TÊN ĐẦY ĐỦ:
    - "microfiber" = "micro" — cùng một chất liệu
    - "Ruột gối microfiber" → tìm "Ruột gối bông micro" trong bảng giá
    - Khăn: nếu kích thước không khớp chính xác, chọn sản phẩm có kích thước GẦN NHẤT
    - Nếu tên SP trong bảng giá có thêm "dệt logo" → vẫn match nếu tên cơ bản giống nhau
    - KHÔNG báo "không có trong bảng giá" nếu có sản phẩm CÙNG LOẠI với kích thước/tên gần giống
```

#### 2. Frontend pre-filter — thêm "microfiber" vào fabric pattern (`src/components/AIQuoteFill.tsx`)

Thêm `microfiber|micro` vào `fabricPattern` để pre-filter không loại bỏ sản phẩm micro/microfiber.

### Files thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/functions/lookup-tax-code/index.ts` | Thêm Rule 12 vào prompt |
| `src/components/AIQuoteFill.tsx` | Thêm `microfiber|micro` vào fabricPattern |

