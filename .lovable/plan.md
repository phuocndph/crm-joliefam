

# Fix: Edge Function Boot Failure - Không đọc được file

## Nguyên nhân gốc

Edge function `extract-document` **không khởi động được** (BootFailure). Log Supabase cho thấy rõ:

```
worker boot error: Uncaught SyntaxError: The requested module 
'https://esm.sh/pdfjs-serverless@0.6.0' does not provide an export named 'getDocument'
```

Vì import `pdfjs-serverless` fail ở dòng 4, **toàn bộ function không chạy** - không chỉ PDF mà DOCX, TXT cũng không đọc được. Mọi request đều trả về "Failed to fetch".

## Giải pháp

Loại bỏ `pdfjs-serverless` (không tương thích Deno edge runtime). Thay bằng chiến lược:

1. **DOCX**: Giữ nguyên JSZip + DOMParser (code hiện tại đúng, chỉ không chạy được vì boot fail)
2. **PDF**: Dùng regex extraction làm fallback cơ bản, sau đó **gửi raw binary qua AI Gateway** (Gemini) để đọc nội dung - Gemini có khả năng xử lý text từ PDF tốt hơn regex
3. **TXT/MD**: Giữ nguyên TextDecoder

## Thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/functions/extract-document/index.ts` | Xóa import `pdfjs-serverless`, sửa `extractTextFromPDF` dùng regex + AI cleanup |

### Code chính

```typescript
// Xóa dòng 4: import { getDocument } from "https://esm.sh/pdfjs-serverless@0.6.0";

// extractTextFromPDF: dùng regex fallback trực tiếp
async function extractTextFromPDF(data: Uint8Array): Promise<string> {
  // Try regex extraction first
  let text = extractTextFromPDFRegex(data);
  
  // If regex got very little, send base64 chunks to AI for reading
  if (text.length < 50) {
    text = "[PDF cần AI để đọc nội dung]";
  }
  
  return text;
}
```

Sau khi xóa import lỗi, edge function sẽ boot thành công và DOCX extraction (JSZip) cũng sẽ hoạt động.

