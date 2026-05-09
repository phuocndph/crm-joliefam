## Nguyên nhân AI phân tích báo giá chậm

Dựa trên log edge function `lookup-tax-code` (mới nhất) và code tại `supabase/functions/lookup-tax-code/index.ts` (hàm `callAI`, dòng 1266–1334).

### Bằng chứng từ log thực tế (1 request gần nhất)

```
T+0s    AI Quote Fill: Step 2 — text matching, model=gemini-2.5-flash
T+0s    Beeknoee model chain: gemini-2.5-flash -> gemini-2.5-flash-lite
T+35s   Beeknoee gemini-2.5-flash error: The signal has been aborted   ← timeout 35s
T+65s   Beeknoee gemini-2.5-flash-lite error: The signal has been aborted ← timeout 30s
T+65s   All models failed on first attempt, retrying after 2s...
T+67s+  (retry vòng 2 với cùng chain)
```

Tức là **provider Beeknoee đang phản hồi rất chậm hoặc treo**, không trả lời trong timeout, nên hệ thống chạy hết chain rồi retry → tổng thời gian có thể lên 2–3 phút trước khi báo lỗi hoặc trả kết quả.

### Các nguyên nhân chính

1. **Provider AI (Beeknoee) bị treo / quá tải**
   Cả 2 model `gemini-2.5-flash` và `gemini-2.5-flash-lite` đều bị abort do hết timeout. Đây là nguyên nhân số 1 hôm nay. Có thể do Beeknoee bị rate-limit nội bộ, hoặc đang downtime cục bộ.

2. **Pipeline 2 bước (OCR + Text matching) chạy tuần tự**
   Khi user dán ảnh báo giá: bước OCR gọi Beeknoee 1 lần, rồi bước matching gọi Beeknoee lần 2. Nếu mỗi bước 20–30s → tổng 40–60s là bình thường ngay cả khi không lỗi.

3. **Chain fallback + retry cộng dồn timeout**
   Code hiện tại: `[model chính 35s] → [flash-lite 30s] → [flash 55s]`, rồi **retry toàn bộ chain 1 lần nữa**. Trường hợp xấu nhất: 35+30+55 = 120s × 2 vòng = **~240s** trước khi fail. Đây là lý do dù chỉ 1 request user vẫn thấy "treo lâu".

4. **Prompt + danh sách sản phẩm lớn**
   Log cho thấy lọc 920 → 880 → 58 sản phẩm theo segment. Nếu segment matching không thu hẹp tốt (vd. segment lạ), payload gửi AI sẽ rất to → model xử lý lâu, dễ timeout.

5. **Không dùng Lovable AI Gateway**
   Comment trong code: `// Direct Beeknoee with model chain (no Lovable AI)`. Toàn bộ traffic đang đi qua một provider thứ 3 (Beeknoee) thay vì Lovable AI Gateway có sẵn — nên độ ổn định phụ thuộc vào provider đó.

### Điều có thể làm để cải thiện (tóm tắt, chưa thực hiện trong plan mode)

- **Giảm timeout chain + bỏ retry vòng 2** → khi provider treo sẽ fail nhanh trong 30–40s thay vì 2–4 phút.
- **Thêm Lovable AI Gateway làm fallback** (`google/gemini-3-flash-preview`) — khi Beeknoee chậm/lỗi sẽ tự chuyển sang gateway ổn định.
- **Stream response** thay vì đợi xong — user thấy kết quả gõ ra dần thay vì chờ trống.
- **Cache kết quả OCR theo hash ảnh** để paste lại cùng ảnh không phải gọi AI lần 2.
- **Cắt ngắn payload sản phẩm**: với segment đã lọc còn ~58 sản phẩm vẫn ổn, nhưng đảm bảo không gửi field thừa (mô tả dài, ảnh base64…) trong messages.
- **Pattern bất đồng bộ (job queue)** chỉ cần khi yêu cầu chạm trần 150s của edge function. Hiện tại chưa cần thiết — sửa timeout + thêm fallback gateway là đủ.

### Kết luận

Nguyên nhân chính lúc này: **Beeknoee provider đang treo / timeout**, cộng với chain fallback + retry dài (tới ~4 phút worst-case) khiến mỗi request chậm hoặc đứng. Không phải do code logic AI Quote sai, mà do thiết kế retry quá rộng và phụ thuộc 1 provider không ổn định.

Khi bạn muốn, mình sẽ sang chế độ build để: (1) rút gọn timeout chain + bỏ retry vòng 2, (2) thêm Lovable AI Gateway làm fallback ngoài cùng.
