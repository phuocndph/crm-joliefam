

## Sửa logic Pre-filter: Lọc theo nhóm vải/loại SP thay vì lọc quá sát

### Vấn đề hiện tại

Pre-filter hiện tại match từng keyword riêng lẻ (màu, kích thước, tên SP) → lọc quá sát, bỏ sót sản phẩm cùng nhóm vải. Ví dụ: yêu cầu "ga chun T250 trắng 160x200" chỉ giữ đúng SP match cả "T250" + "trang" + "160x200", loại bỏ các SP T250 khác kích thước mà AI cần để so sánh giá.

### Giải pháp

Thay đổi chiến lược lọc: **chỉ dùng loại vải (fabric) và loại sản phẩm (category) để lọc**, KHÔNG dùng màu sắc hay kích thước để loại bỏ. Kích thước và màu sắc vẫn trích xuất nhưng chỉ để gửi cho AI tham khảo, không dùng để filter.

Luồng mới:
```text
User: "100 ga chun T250 trắng sọc 160x200, 50 vỏ gối T250 60x80"
                    ↓
Trích xuất: fabric = [t250], category = [gachun, vogoi]
                    ↓
Lọc: GIỮ TẤT CẢ sản phẩm có tên chứa "t250" HOẶC chứa "gachun"/"vogoi"
     → Toàn bộ dòng T250 + toàn bộ ga chun/vỏ gối các loại vải
                    ↓
Gửi cho AI (có thể 50-100 SP thay vì 300, nhưng đủ đầy đủ theo nhóm)
```

### Thay đổi cụ thể

**File: `src/components/AIQuoteFill.tsx`**

1. Tách `extractSearchTerms` thành 2 nhóm riêng:
   - `fabricTerms`: loại vải (t250, lth, cotton...) — dùng để filter
   - `categoryTerms`: loại SP (ga chun, vỏ gối...) — dùng để filter
   - Màu sắc + kích thước: KHÔNG dùng để filter

2. Sửa `preFilterProducts`: Giữ sản phẩm match **fabric HOẶC category**, không yêu cầu match cả 2. Nâng giới hạn từ 60 lên 150 SP.

3. Nếu sau filter vẫn < 10 SP → gửi toàn bộ (fallback an toàn).

