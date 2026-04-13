

## Sửa lỗi "In phiếu gửi" khi tạo đơn GHN xong

### Vấn đề
Nút "In phiếu gửi" trong dialog tạo đơn thành công đang dùng URL sai: `https://5sao.ghn.dev/order/print/${orderCode}` — đây là URL môi trường dev/staging của GHN, gây lỗi khi truy cập.

Trong khi đó, trang "Theo dõi đơn GHN" đã có logic in phiếu A5 chuẩn: gọi API GHN `gen-token` qua edge function `ghn-tracking`, rồi mở URL `https://online-gateway.ghn.vn/a5/public-api/printA5?token=...` trong tab mới.

### Giải pháp
Thay thế link tĩnh sai bằng logic gọi API in phiếu A5 giống trang tracking.

### Thay đổi

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. Thêm state `printing` và import `supabase`.
2. Thêm hàm `printA5` gọi edge function `ghn-tracking` với `action: 'print_a5'` và `orderCodes: [createdOrderCode]`, rồi mở `printUrl` trong tab mới.
3. Thay nút `<a href="https://5sao.ghn.dev/...">` bằng `<Button onClick={printA5}>` có loading state.

```typescript
const printA5 = async () => {
  if (!createdOrderCode) return;
  setPrintingA5(true);
  try {
    const { data, error } = await supabase.functions.invoke('ghn-tracking', {
      body: { action: 'print_a5', orderCodes: [createdOrderCode] }
    });
    if (error) throw error;
    if (data.success && data.data?.printUrl) {
      window.open(data.data.printUrl, '_blank');
    } else {
      throw new Error(data.error || 'Không thể tạo link in phiếu');
    }
  } catch (err: any) {
    toast.error(err.message || 'Lỗi in phiếu A5');
  } finally {
    setPrintingA5(false);
  }
};
```

