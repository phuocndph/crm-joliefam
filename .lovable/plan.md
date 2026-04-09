

## Chỉ dùng gemini-2.0-flash-lite và gemini-2.5-flash

### Thay đổi

**File: `supabase/functions/lookup-tax-code/index.ts`**

1. **Model chain cho image tasks (line 1021-1026)**: Bỏ `gemini-2.0-flash`, chỉ giữ 2 model:
```typescript
const models = hasImage
  ? [
      { name: "gemini-2.0-flash-lite", timeout: 30000 },
      { name: "gemini-2.5-flash", timeout: 90000 },
    ]
```

2. **Model chain cho text/default tasks (line 1032-1037)**: Bỏ `glm-4.7-flash`, `glm-4.5-flash`, `openai/gpt-oss-120b`, chỉ giữ:
```typescript
: [
    { name: "gemini-2.0-flash-lite", timeout: 30000 },
    { name: "gemini-2.5-flash", timeout: 55000 },
  ];
```

3. **OCR model default (line 1451)**: Giữ nguyên `google/gemini-2.0-flash-lite` (đã đúng).

### Tóm tắt
- Xóa tất cả model khác khỏi chain, chỉ dùng `gemini-2.0-flash-lite` (nhanh, rẻ) và `gemini-2.5-flash` (fallback mạnh)
- Deploy lại edge function

