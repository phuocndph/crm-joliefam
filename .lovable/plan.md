

## Fix: Hiển thị lỗi GHN chi tiết thay vì "Edge Function returned a non-2xx status code"

### Nguyên nhân gốc
- Edge function trả `status: 400` khi có lỗi GHN
- `supabase.functions.invoke()` khi nhận non-2xx: đặt `error` = generic message "Edge Function returned a non-2xx status code", nhưng response body (chứa message chi tiết) vẫn nằm trong `data`
- Client code (line 372): `if (error) throw error` → throw message generic, bỏ qua `data.error` chứa chi tiết

### Giải pháp

**File: `src/components/CreateGHNOrderDialog.tsx`** - Sửa hàm `callGHN` (line 368-375):

Thay đổi logic xử lý lỗi: ưu tiên đọc `data?.error` trước, chỉ dùng `error.message` khi không có data:

```typescript
const callGHN = useCallback(async (action: string, body: Record<string, any> = {}) => {
  const { data, error } = await supabase.functions.invoke('ghn-tracking', {
    body: { action, ...body }
  });
  if (error) {
    // Khi status non-2xx, data vẫn chứa response body với error chi tiết
    const detailMessage = data?.error || error.message;
    throw new Error(detailMessage);
  }
  if (!data?.success) throw new Error(data?.error || 'GHN API error');
  return data.data;
}, []);
```

**File: `src/components/EditGHNOrderDialog.tsx`** - Sửa tương tự hàm `callGHN` nếu có cùng pattern.

### Kết quả
Lỗi từ GHN như "Giá trị khai giá vượt quá mức cho phép: 8000000 - Chi tiết: Giá trị khai giá vượt mức cho phép" sẽ hiển thị đầy đủ trong toast thay vì message generic.

