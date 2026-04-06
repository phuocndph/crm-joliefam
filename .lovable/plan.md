

## Tích hợp API Beeknoee song song với Lovable AI

### Tổng quan

Beeknoee (https://platform.beeknoee.com) là API gateway tương thích 100% OpenAI SDK, hỗ trợ 100+ model AI (ChatGPT, Claude, Gemini, Grok...) với chi phí rẻ hơn 80%.

- **Base URL**: `https://platform.beeknoee.com/api/v1/chat/completions`
- **API Key**: `sk-bee-...` (sẽ lưu an toàn làm secret)

### Cách hoạt động: Fallback tự động

Thay vì chạy 2 API cùng lúc, hệ thống sẽ **thử Lovable AI trước**, nếu lỗi (429 rate limit, 402 hết quota, timeout, 500...) thì **tự động chuyển sang Beeknoee**. Người dùng không cần làm gì.

```text
Lovable AI (ưu tiên)
   ↓ lỗi?
Beeknoee API (fallback)
   ↓ lỗi?
Thông báo lỗi cho user
```

### Thay đổi cụ thể

#### 1. Lưu API key (Secret)
Lưu `sk-bee-891a86a43ae845188226542bc1268101` làm secret tên `BEEKNOEE_API_KEY` trong Supabase Edge Functions.

#### 2. Edge Function: `lookup-tax-code/index.ts`
Sửa hàm `callAI()` — thêm logic fallback:

- Thử gọi Lovable AI Gateway trước
- Nếu thất bại (429/402/500/timeout) → gọi Beeknoee API với cùng payload
- Model mặc định Beeknoee: `gpt-4o-mini` hoặc `deepseek-chat` (rẻ, nhanh)
- Log rõ nguồn AI nào đang trả lời

#### 3. Edge Function: `knowledge-chat/index.ts`
Sửa hàm `callAI()` tương tự — fallback cho cả streaming và non-streaming.

#### 4. Edge Function: `extract-document/index.ts`
Sửa các hàm `extractPDFWithAI()` và `cleanWithAI()` — thêm fallback.

### Files thay đổi

| File | Thay đổi |
|------|----------|
| Secret `BEEKNOEE_API_KEY` | Thêm mới |
| `supabase/functions/lookup-tax-code/index.ts` | Sửa `callAI()` thêm fallback Beeknoee |
| `supabase/functions/knowledge-chat/index.ts` | Sửa `callAI()` thêm fallback Beeknoee |
| `supabase/functions/extract-document/index.ts` | Sửa `extractPDFWithAI()` và `cleanWithAI()` thêm fallback |

### Chi tiết kỹ thuật

Hàm `callAI` sẽ có cấu trúc:

```text
1. Gọi Lovable AI Gateway
2. Nếu response.ok → trả kết quả
3. Nếu lỗi 429/402/500:
   a. Log: "Lovable AI failed, falling back to Beeknoee"
   b. Gọi https://platform.beeknoee.com/api/v1/chat/completions
      với Bearer BEEKNOEE_API_KEY
   c. Model: deepseek-chat (hoặc tùy chỉnh)
4. Nếu cả 2 đều lỗi → throw error
```

