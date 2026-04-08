

## Sửa lỗi Edge Function không boot được

### Nguyên nhân
Dòng 638-639 trong `supabase/functions/lookup-tax-code/index.ts` khai báo **trùng** biến `const fullChunk` — lỗi syntax khiến function không khởi động được.

### Sửa
**File**: `supabase/functions/lookup-tax-code/index.ts`
- Xóa dòng 639 (dòng duplicate `const fullChunk = (leadingText + ' ' + chunk).trim();`)
- Deploy lại edge function

### Kết quả
- Edge function boot thành công, AI Quote Fill hoạt động trở lại

