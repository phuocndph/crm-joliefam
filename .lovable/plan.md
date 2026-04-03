

## Mở báo giá phụ khi click đơn hàng trong bảng lợi nhuận

### Thay đổi

**File: `src/pages/CashFlowManagement.tsx`**

1. **Import** `QuoteSupplementDialog` từ `@/components/QuoteSupplementDialog`
2. **Thêm `quote_id`** vào query select orders (dòng 250-263), thêm field `quote_id`
3. **Thêm state**: `const [supplementQuote, setSupplementQuote] = useState<any>(null);`
4. **Thêm hàm `handleOrderClick`**:
   - Tìm order trong `orders` state theo `profit.id` để lấy `quote_id`
   - Nếu có `quote_id`: fetch quote từ Supabase (`quotes` table kèm `customers`, `assignees`) → `setSupplementQuote(quoteData)`
   - Nếu không có: toast "Đơn hàng này chưa có báo giá liên kết"
5. **Thêm `onClick`** vào `TableRow` trong bảng orderProfits (dòng 1028): `onClick={() => handleOrderClick(profit.id)}`
6. **Render `QuoteSupplementDialog`** ở cuối component (trước `</main>`), dạng sibling (không lồng trong dialog khác):
   ```tsx
   <QuoteSupplementDialog
     open={!!supplementQuote}
     onOpenChange={(open) => !open && setSupplementQuote(null)}
     quote={supplementQuote}
   />
   ```

### Cập nhật interface OrderDetail
- Thêm `quote_id?: string | null` vào interface `OrderDetail` (dòng 69-80)

### Không thay đổi
- `QuoteSupplementDialog` giữ nguyên
- Logic tính lợi nhuận giữ nguyên
- Các tab khác không ảnh hưởng

