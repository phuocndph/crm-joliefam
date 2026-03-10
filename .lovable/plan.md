

# Fix: UI bị đơ sau khi đóng dialog xem báo giá

## Nguyên nhân gốc

`QuotePreviewDialog.tsx` chứa một **Dialog lồng bên trong Dialog** (dòng 1244-1250): `QuoteSupplementDialog` được render **bên trong** thẻ `<Dialog>` chính. Khi dialog cha đóng, Radix UI không cleanup đúng `pointer-events: none` trên `document.body`, khiến toàn bộ trang không click được.

Ngoài ra, khi dialog đóng, các state nội bộ (`showQuoteSupplementDialog`, `showTemplateSettings`) không được reset → có thể gây xung đột overlay.

## Thay đổi

### File: `src/components/QuotePreviewDialog.tsx`

1. **Di chuyển QuoteSupplementDialog ra ngoài thẻ `<Dialog>` chính** - render nó ở cùng cấp (sibling), không phải con (child) của Dialog. Thay đổi từ:
```
<Dialog>
  <DialogContent>...</DialogContent>
  <QuoteSupplementDialog ... />  ← BÊN TRONG
</Dialog>
```
thành:
```
<Dialog>
  <DialogContent>...</DialogContent>
</Dialog>
<QuoteSupplementDialog ... />  ← BÊN NGOÀI
```

2. **Reset tất cả state nội bộ khi dialog đóng**: Thêm `useEffect` theo dõi `open`, khi `open = false` thì reset `showQuoteSupplementDialog`, `showTemplateSettings` về `false`.

3. **Thêm safety cleanup**: Trong `onOpenChange` callback, đảm bảo xóa `pointer-events: none` khỏi `document.body` khi đóng.

### File: `src/pages/QuotesPage.tsx`

4. **Thêm `DialogTitle` cho Create/Edit Quote dialogs** (dòng 641-658) để fix console error accessibility warning.

