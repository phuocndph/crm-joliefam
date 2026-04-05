

## So sánh 3 phương án tối ưu chi phí API cho AI Báo giá

### Phương án A: Pre-filter ở Frontend (đã đề xuất)

```text
User nhập yêu cầu → Frontend trích keyword → Lọc products → Gửi 20-50 SP cho AI
```

| | |
|---|---|
| **Ưu điểm** | Đơn giản, chỉ sửa 1 file frontend. Giảm ~70-90% token. Không cần thay đổi DB hay edge function |
| **Nhược điểm** | Keyword matching có thể bỏ sót sản phẩm (VD: tên viết tắt lạ). Phải maintain mapping vải ở cả frontend lẫn prompt. Vẫn gọi AI mỗi lần |
| **Rủi ro** | Lọc sai → AI không có SP cần thiết trong danh sách → trả kết quả sai |
| **Tiết kiệm** | ~70-90% token/request |

---

### Phương án B: Bỏ AI hoàn toàn — Matching thuần code (rule-based)

```text
User nhập yêu cầu → Frontend parse regex (tên SP, kích thước, SL, giá) → Match trực tiếp từ DB → Hiển thị kết quả
```

| | |
|---|---|
| **Ưu điểm** | **Chi phí API = 0**. Cực nhanh (< 0.5s). Không phụ thuộc AI gateway. Hoạt động offline |
| **Nhược điểm** | Phải viết parser phức tạp cho nhiều cách diễn đạt tiếng Việt. Không linh hoạt với yêu cầu mơ hồ. Khó maintain khi thêm sản phẩm mới hoặc cách gọi tên khác |
| **Rủi ro** | Không hiểu ngữ cảnh (VD: "gối" = vỏ gối, suy luận vải...). Phải code cứng mọi rule thay vì AI tự suy luận |
| **Tiết kiệm** | 100% — không tốn API |

---

### Phương án C (Đề xuất): Hybrid — Matching code trước, AI chỉ xử lý phần khó

```text
User nhập yêu cầu
    ↓
Bước 1: Frontend parse cơ bản (regex) → trích xuất: loại SP, vải, kích thước, SL, giá
    ↓
Bước 2: Fuzzy match từ DB products (tên + kích thước + vải)
    ↓  
Nếu match được >= 80% items rõ ràng → KHÔNG GỌI AI, dùng luôn
Nếu có items mơ hồ/không match → Chỉ gửi phần mơ hồ + danh sách SP liên quan cho AI
    ↓
Kết hợp kết quả code + AI → hiển thị
```

| | |
|---|---|
| **Ưu điểm** | Phần lớn request KHÔNG cần AI (đơn hàng rõ ràng). Khi cần AI, chỉ gửi 1-5 items mơ hồ thay vì cả đơn. Nhanh nhất cho case thông thường, vẫn thông minh cho case phức tạp |
| **Nhược điểm** | Phức tạp nhất để implement. Cần viết parser + fuzzy matcher tốt. Logic 2 nhánh (code vs AI) phải test kỹ |
| **Rủi ro** | Parser sai → bypass AI khi không nên → kết quả sai. Nhưng có thể fallback: nếu user không hài lòng → nhấn "Thử lại với AI" |
| **Tiết kiệm** | ~90-95% — đa số request không gọi AI |

---

### Bảng so sánh tổng hợp

```text
                    │ Phương án A      │ Phương án B       │ Phương án C
────────────────────┼──────────────────┼───────────────────┼──────────────────
Tiết kiệm token     │ 70-90%           │ 100%              │ 90-95%
Tốc độ              │ 1-3s             │ < 0.5s            │ 0.2-2s
Độ chính xác        │ Cao (AI)         │ Trung bình        │ Cao
Độ phức tạp code    │ Thấp (1 file)    │ Trung bình        │ Cao (parser+AI)
Xử lý mơ hồ        │ Tốt (AI)         │ Kém               │ Tốt (fallback AI)
Bảo trì             │ Dễ               │ Khó (rule cứng)   │ Trung bình
Files thay đổi      │ 1                │ 1-2               │ 1-2
```

### Khuyến nghị

**Phương án C (Hybrid)** là tối ưu nhất về lâu dài, nhưng **Phương án A (Pre-filter)** là bước đầu hợp lý nhất vì:
- Implement nhanh, ít rủi ro
- Đã giảm được 70-90% chi phí ngay lập tức
- Sau này có thể nâng cấp lên Phương án C bằng cách thêm parser trước bước gọi AI

Bạn muốn triển khai phương án nào?

