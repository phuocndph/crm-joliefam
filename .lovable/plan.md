

## Plan: Đổi API tra cứu MST sang escodata.net

### Vấn đề
VietQR API (`api.vietqr.io`) không trả về trường **người đại diện** và **chức vụ** — chỉ có tên công ty và địa chỉ.

### Giải pháp
Chuyển sang API **escodata.net** — API miễn phí, trả về đầy đủ thông tin:
- `ten` → Tên công ty
- `daidien` → Người đại diện (**trường đang thiếu**)
- `dc` → Địa chỉ
- `dt` → Số điện thoại
- `mst` → Mã số thuế
- `tinhtrang` → Tình trạng hoạt động

### Chiến lược: Dùng escodata làm nguồn chính, VietQR làm backup

Vì escodata không có 100% MST (ví dụ FPT `0101248141` không tìm thấy), nên sẽ:
1. **Thử escodata.net trước** — nếu thành công, dùng dữ liệu (có đầy đủ người đại diện)
2. **Nếu escodata lỗi → fallback sang VietQR** — lấy được tên + địa chỉ, người đại diện để trống cho user tự điền

### Chi tiết kỹ thuật

**File: `supabase/functions/lookup-tax-code/index.ts`**

Thay đổi phần `type === "tax_code"`:
- Gọi `https://escodata.net/api-mst/{taxCode}.htm` trước
- Nếu `error === 0` và có `data.daidien`: trả về mapping đầy đủ
- Nếu không: fallback sang VietQR API hiện tại (giữ nguyên logic cũ)
- Xóa bỏ hoàn toàn phần AI supplement representative (ngăn hallucination)

Mapping escodata → response:

```text
escodata field  →  response field
data.ten        →  company_name
data.daidien    →  representative
"Giám đốc"     →  position (default)
data.dc         →  address
data.mst        →  tax_code
data.dt         →  phone
```

### Không cần thay đổi
- Frontend code — response format giữ nguyên
- Secrets — escodata.net không cần API key
- Database — không thay đổi

