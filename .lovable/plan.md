

## Hiển thị lỗi GHN chi tiết và rõ ràng

### Vấn đề
Khi GHN trả lỗi (quá COD, khu vực không hỗ trợ...), API trả về `data.message` và có thể kèm `data.code_message_value`. Hiện tại chỉ truyền `data.message` — đôi khi là message tiếng Anh hoặc chung chung.

### Giải pháp

**1. Edge Function (`supabase/functions/ghn-tracking/index.ts`)**

Tại tất cả các chỗ kiểm tra `data.code !== 200`, thay vì chỉ throw `data.message`, sẽ gộp thêm `data.code_message_value` (nếu có) để trả về chi tiết hơn:

```typescript
if (data.code !== 200) {
  const detail = data.code_message_value 
    ? JSON.stringify(data.code_message_value) 
    : '';
  throw new Error(
    `${data.message || 'Lỗi GHN'}${detail ? ` - Chi tiết: ${detail}` : ''}`
  );
}
```

Áp dụng cho các action: `create_order`, `calculate_fee`, `update_order`, `update_cod` (4 chỗ).

Ngoài ra, ở catch block chung (line 516-521), trả thêm field `details` để client có thể hiển thị:

```typescript
return new Response(JSON.stringify({ 
  success: false, 
  error: error.message,
}), { status: 400, headers: ... });
```

**2. Client (`src/components/CreateGHNOrderDialog.tsx` và `EditGHNOrderDialog.tsx`)**

Toast lỗi đã hiển thị `e.message` — sau khi edge function trả message chi tiết hơn, toast sẽ tự động hiện đầy đủ. Thêm `duration: 8000` để user có thời gian đọc lỗi dài:

```typescript
toast({ 
  title: "Lỗi tạo đơn GHN", 
  description: e.message, 
  variant: "destructive",
  duration: 8000,
});
```

Cũng cập nhật tương tự ở các chỗ gọi `callGHN` cho tính phí, load địa chỉ — hiện đang `console.error` mà không thông báo user. Thêm toast cho các lỗi quan trọng (tính phí, load quận/huyện/phường).

### Kết quả
Mọi lỗi từ GHN (COD vượt hạn mức, khu vực không hỗ trợ, sai địa chỉ...) đều hiển thị rõ ràng bằng toast với nội dung chi tiết từ API.

