

## Plan: Bổ sung nguồn dữ liệu masothue.com để lấy đầy đủ thông tin Người đại diện

### Vấn đề hiện tại
- escodata.net trả về đủ dữ liệu cho nhiều công ty nhưng **thiếu Người đại diện** cho một số MST (ví dụ: `0107455698` - CÔNG TY TNHH FOMEX)
- VietQR chỉ trả về tên + địa chỉ, không bao giờ có Người đại diện
- masothue.com có đầy đủ thông tin nhưng yêu cầu URL dạng slug: `/0107455698-cong-ty-tnhh-fomex`

### Giải pháp: Chuỗi tra cứu 3 bước

```text
Bước 1: escodata.net → Lấy tên, địa chỉ, SĐT, người đại diện
  ↓ (nếu thiếu người đại diện)
Bước 2: masothue.com → Dùng tên công ty từ bước 1 để tạo slug URL
  → Fetch trang chi tiết → Parse HTML lấy Người đại diện + SĐT
  ↓ (nếu bước 1 hoàn toàn thất bại)  
Bước 3: VietQR (fallback) → Lấy tên + địa chỉ cơ bản
  → Rồi thử masothue.com với tên từ VietQR
```

### Thay đổi cụ thể

**File:** `supabase/functions/lookup-tax-code/index.ts`

1. **Thêm hàm `convertToSlug(companyName)`**: Chuyển tên công ty tiếng Việt thành slug URL (bỏ dấu, thay khoảng trắng bằng `-`, lowercase)
   - Ví dụ: "CÔNG TY TNHH FOMEX" → "cong-ty-tnhh-fomex"

2. **Thêm hàm `scrapemasothue(taxCode, companyName)`**: 
   - Tạo URL: `https://masothue.com/{taxCode}-{slug}`
   - Fetch HTML với User-Agent header
   - Parse bằng regex để trích xuất:
     - Người đại diện: từ `<tr>` chứa `fa-user` + `itemprop="name"`
     - SĐT: từ `<tr>` chứa `fa-phone` + `itemprop="telephone"`
     - Địa chỉ: từ `itemprop="address"`

3. **Cập nhật logic chính**:
   - Sau khi escodata.net trả về kết quả nhưng thiếu `daidien` → gọi `scrapemasothue()` để bổ sung
   - Sau khi VietQR trả về kết quả → gọi `scrapemasothue()` để bổ sung Người đại diện
   - Merge dữ liệu: ưu tiên dữ liệu đã có, chỉ bổ sung trường còn thiếu

### Chi tiết kỹ thuật

**Regex parse HTML masothue.com:**
```typescript
// Người đại diện - pattern đã xác nhận từ HTML thực tế
const repMatch = html.match(/Người đại diện<\/td>\s*<td>.*?itemprop="name"[^>]*>([^<]+)</);

// SĐT  
const phoneMatch = html.match(/itemprop="telephone"[^>]*>\s*([^<]+)</);

// Tên công ty
const nameMatch = html.match(/class="table-taxinfo"[\s\S]*?itemprop="name"[^>]*>([^<]+)</);
```

**Hàm chuyển slug tiếng Việt:**
```typescript
function toSlug(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}
```

### Không thay đổi
- Frontend code (cùng response format)
- Các chức năng khác (parse_text, parse_image, parse_order)
- Database schema

