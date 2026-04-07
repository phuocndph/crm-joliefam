

## Phân tích lỗi còn lại & kế hoạch fix

### Vấn đề gốc: Beeknoee concurrent limit 1/1

Từ logs thực tế, mỗi lần đều thất bại theo cùng pattern:

```text
t=0s    Lovable AI → 402 (hết credits)
t=0s    → Beeknoee gemini-2.5-flash (timeout 15s)
t=15s   gemini-2.5-flash bị ABORT (client-side)
t=15s   → glm-4.7-flash → 429 (previous request still active on server)
t=16s   → glm-4.5-flash → 429
t=17s   → gpt-oss-120b → 429  
t=18s   "All AI providers failed"
```

**Nguyên nhân**: Khi client abort request sau 15s, Beeknoee server vẫn đang xử lý request đó. Concurrent limit = 1/1, nên TẤT CẢ model sau đều bị 429. Delay 1s giữa các lần thử quá ngắn.

### 3 lỗi cần fix

| # | Lỗi | Tác động |
|---|------|----------|
| **1** | Lovable AI fetch không có timeout | Có thể hang vô thời hạn trước khi fallback |
| **2** | Beeknoee: abort client-side không giải phóng server slot | Tất cả model fallback đều 429 |
| **3** | Delay 429 chỉ 1s, không đủ để server giải phóng slot | Model sau vẫn bị 429 |

### Kế hoạch fix

#### File: `supabase/functions/lookup-tax-code/index.ts`

**Fix 1: Thêm timeout cho Lovable AI** (line 54-59)
- Thêm AbortController với timeout 20s cho Lovable AI fetch
- Nếu timeout → fallback ngay sang Beeknoee

**Fix 2: Chờ đủ lâu khi gặp 429**
- Tăng delay từ 1s → 5s khi gặp 429 (đợi server hoàn tất request trước)
- Thêm tối đa 2 lần retry cho model đầu tiên với delay 5s (vì model đầu thường mạnh nhất)

**Fix 3: Tăng timeout model đầu, giảm model sau**
- gemini-2.5-flash: 15s → 25s (cho model chính đủ thời gian hoàn thành thay vì abort rồi block cả chain)
- Bỏ bớt model thừa, chỉ giữ 2 model: gemini-2.5-flash (25s) + glm-4.7-flash (20s)
- Giữ 1 model dự phòng cuối: openai/gpt-oss-120b (15s) nhưng delay 8s trước khi gọi

**Fix 4: Skip model nếu biết chắc 429**
- Nếu model đầu bị abort (timeout), đợi 8s trước khi thử model tiếp theo
- Nếu 2 model liên tiếp 429 → dừng ngay, trả lỗi rõ ràng "Server bận, thử lại sau 30s"

### Tổng kết thay đổi

| File | Nội dung |
|------|----------|
| `supabase/functions/lookup-tax-code/index.ts` | (1) Thêm timeout 20s cho Lovable AI. (2) gemini-2.5-flash timeout 25s. (3) Delay 5-8s giữa các model khi abort/429. (4) Giảm còn 3 model fallback. (5) Trả lỗi "server bận" nếu 2 model liên tiếp 429. |

### Hiệu quả dự kiến

| Metric | Hiện tại | Sau fix |
|--------|----------|---------|
| Lovable AI timeout | Vô hạn | 20s |
| Beeknoee model 1 timeout | 15s (quá ngắn → abort → block chain) | 25s (đủ để hoàn thành) |
| Delay giữa 429 | 1s (quá ngắn) | 5-8s (đủ để server giải phóng) |
| Worst case total | ~30s rồi fail | ~35s nhưng có thể thành công |
| Best case (model đầu OK) | Không bao giờ | 5-10s |

