
# ✅ Kế hoạch khắc phục lỗi đồng bộ dữ liệu Realtime - ĐÃ HOÀN THÀNH


## Tổng quan vấn đề

Sau khi kiểm tra hệ thống, tôi phát hiện:

### Bảng đã có trong Realtime Publication (6 bảng):
- customers
- orders
- quotes
- products
- transactions
- finance_data

### Bảng CHƯA có trong Realtime Publication (20 bảng):
| Bảng | Mức độ quan trọng | Lý do cần Realtime |
|------|-------------------|---------------------|
| `fabric_inventory` | CAO | Cập nhật tồn kho liên tục |
| `fabric_transactions` | CAO | Giao dịch nhập/xuất vải |
| `fabric_usage` | CAO | Ghi nhận sử dụng vải |
| `fabric_variants` | CAO | Thay đổi biến thể vải |
| `fabric_transfers` | CAO | Chuyển kho giữa các warehouse |
| `fabric_types` | TRUNG BÌNH | Loại vải ít thay đổi |
| `fabric_widths` | TRUNG BÌNH | Khổ vải ít thay đổi |
| `warehouses` | TRUNG BÌNH | Kho ít thay đổi |
| `order_payments` | CAO | Thanh toán đơn hàng |
| `assignees` | TRUNG BÌNH | Người phụ trách |
| `ghn_tracking` | CAO | Tracking vận chuyển GHN |
| `profiles` | TRUNG BÌNH | Thông tin người dùng |
| `user_roles` | THẤP | Phân quyền |
| `price_lists` | TRUNG BÌNH | Bảng giá |
| `expenses` | CAO | Chi phí |
| `ai_settings` | THẤP | Cài đặt AI |
| `customer_predictions` | THẤP | Dự đoán khách hàng |
| `employee_permissions` | THẤP | Quyền nhân viên |
| `password_reset_logs` | KHÔNG CẦN | Logs không cần realtime |
| `quote_template_settings` | THẤP | Template báo giá |

### Vấn đề với Channel Names

| Hook | Channel Name | Vấn đề |
|------|--------------|--------|
| `useOrders` | `orders-and-payments-realtime` | Static - xung đột nhiều tab |
| `useAssignees` | `assignees-sync` | Static - xung đột nhiều tab |
| `useFabricRealtime` | `fabrics-sync-{Date.now()}` | Đã unique |
| `useCustomers` | `customers-sync-{Date.now()}` | Đã unique |

---

## Giải pháp chi tiết

### Thay đổi 1: Migration thêm bảng vào Realtime Publication

Tạo migration SQL để thêm tất cả các bảng quan trọng vào `supabase_realtime` publication:

```sql
-- Thêm các bảng fabric vào realtime
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_usage;
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_variants;
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_transfers;
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_types;
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_widths;
ALTER PUBLICATION supabase_realtime ADD TABLE warehouses;

-- Thêm các bảng order/payment
ALTER PUBLICATION supabase_realtime ADD TABLE order_payments;

-- Thêm các bảng khác
ALTER PUBLICATION supabase_realtime ADD TABLE assignees;
ALTER PUBLICATION supabase_realtime ADD TABLE ghn_tracking;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE price_lists;
```

### Thay đổi 2: Cập nhật `useOrders.ts`

Sửa channel name thành unique và thêm error handling:

```tsx
// Trước:
.channel('orders-and-payments-realtime')

// Sau:
.channel('orders-payments-quotes-' + Date.now())
.subscribe((status) => {
  if (status === 'CHANNEL_ERROR') {
    console.error('❌ Orders realtime subscription failed, will retry on mount');
  }
});
```

### Thay đổi 3: Cập nhật `useAssignees.ts`

Sửa channel name thành unique:

```tsx
// Trước:
.channel('assignees-sync')

// Sau:
.channel('assignees-sync-' + Date.now())
```

### Thay đổi 4: Tạo utility hook để tái sử dụng

Tạo file `src/hooks/useRealtimeSubscription.ts` để chuẩn hóa realtime subscription:

```tsx
export const useRealtimeSubscription = (
  tables: { table: string; event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE' }[],
  queryKeys: string[][],
  channelPrefix: string
) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channelName = `${channelPrefix}-${Date.now()}`;
    let channel = supabase.channel(channelName);

    tables.forEach(({ table, event = '*' }) => {
      channel = channel.on(
        'postgres_changes',
        { event, schema: 'public', table },
        (payload) => {
          console.log(`🔄 ${table} change:`, payload.eventType);
          queryKeys.forEach(key => {
            queryClient.invalidateQueries({ queryKey: key });
          });
        }
      );
    });

    channel.subscribe((status) => {
      console.log(`📡 ${channelPrefix} status:`, status);
      if (status === 'CHANNEL_ERROR') {
        console.error(`❌ ${channelPrefix} subscription failed`);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, channelPrefix]);
};
```

---

## File cần thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/migrations/[new].sql` | Thêm 14 bảng vào realtime publication |
| `src/hooks/useOrders.ts` | Unique channel name + error handling |
| `src/hooks/useAssignees.ts` | Unique channel name |
| `src/hooks/useRealtimeSubscription.ts` (mới) | Utility hook chuẩn hóa |

---

## Kết quả mong đợi

| Trước | Sau |
|-------|-----|
| 6 bảng có realtime | 20 bảng có realtime |
| CHANNEL_ERROR khi mở nhiều tab | Không còn xung đột channel |
| Dữ liệu fabric không tự cập nhật | Fabric sync ngay lập tức |
| Thanh toán order không sync | Payment sync realtime |

---

## Thứ tự thực hiện

1. **Migration** - Thêm các bảng vào `supabase_realtime` publication
2. **useOrders.ts** - Sửa channel name thành unique
3. **useAssignees.ts** - Sửa channel name thành unique
4. **useRealtimeSubscription.ts** - Tạo utility hook (tùy chọn, có thể làm sau)

---

## Lưu ý kỹ thuật

- Migration sẽ tự động apply khi deploy
- Các bảng đã có trong publication sẽ bị bỏ qua (idempotent)
- Unique channel name = `prefix-{Date.now()}` đảm bảo không xung đột
- Real-time subscription chỉ hoạt động nếu bảng đã có trong publication
