
Vấn đề hiện tại đã khá rõ.

Do I know what the issue is? Có.

Lỗi không nằm ở ô input tự nó, mà ở cách dialog địa chỉ đang được dựng:

1. `CreateGHNOrderDialog` dùng Radix `Dialog` chính.
2. Popup “Địa chỉ nhận” lại là một overlay custom được `createPortal(..., document.body)`.
3. Với Radix modal dialog, mọi tương tác ngoài `DialogContent` gốc bị xem là “outside interaction”.
4. Vì popup địa chỉ đang nằm ngoài `DialogContent`, nên click/focus vào input/select của popup bị parent dialog chặn hoặc trả sự kiện ra lớp phía sau, tạo cảm giác “click xuyên xuống form bên dưới”.

Trong code hiện tại, dấu hiệu rất rõ:
- `addressDialog` render ngoài `DialogContent` ở cuối component.
- Parent `DialogContent` chưa có chặn `onPointerDownOutside` / `onInteractOutside` khi popup địa chỉ đang mở.
- Chưa có cleanup `document.body.style.pointerEvents` như pattern đang dùng ở `QuotePreviewDialog`.
- Console cũng cho thấy dialog đang thiếu cấu trúc accessibility chuẩn (`DialogTitle` / `Description`) ở một nhánh, nghĩa là phần dialog này đang bị custom hóa khá mạnh và dễ xung đột với Radix behavior.

Kế hoạch sửa:

1. Sửa `src/components/CreateGHNOrderDialog.tsx` theo hướng ổn định hơn:
   - thêm cleanup/reset `document.body.style.pointerEvents = ''` khi đóng dialog chính, đóng address dialog, và khi component unmount.
   - khi `showAddressDialog === true`, ép overlay + panel địa chỉ có `pointer-events-auto`.
   - trên `DialogContent` chính, chặn outside interaction trong lúc address dialog đang mở:
     - `onPointerDownOutside={(e) => showAddressDialog && e.preventDefault()}`
     - `onInteractOutside={(e) => showAddressDialog && e.preventDefault()}`
   - điều này ngăn Radix coi thao tác trong popup địa chỉ là click ra ngoài dialog chính.

2. Nếu cần, điều chỉnh cấu trúc popup địa chỉ để an toàn hơn:
   - giữ portal ra `document.body`,
   - nhưng thêm lớp wrapper rõ ràng:
     - overlay: `fixed inset-0 z-[100] pointer-events-auto`
     - panel: `relative z-[101] pointer-events-auto`
   - thêm `onMouseDown/onPointerDown` stopPropagation ở panel để tránh bubbling ngược vào lớp ngoài.

3. Vá phần accessibility của dialog chính:
   - đảm bảo `DialogContent` luôn có `DialogTitle`
   - thêm `DialogDescription` hoặc `aria-describedby={undefined}` nếu không dùng description
   - việc này không trực tiếp sửa click bug, nhưng giúp Radix vận hành ít lỗi hơn.

4. Nếu sau bước trên vẫn còn hiện tượng click xuyên:
   - chuyển popup địa chỉ từ overlay custom sang một dialog sibling độc lập theo pattern “sibling dialogs, not nested in content”
   - tức là render một component dialog địa chỉ riêng, cùng cấp với GHN dialog, thay vì dialog con nằm logic bên trong form.
   - đây là fallback an toàn nhất theo memory `ui/dialog-nesting-constraint`.

Phạm vi file:
- `src/components/CreateGHNOrderDialog.tsx`
- có thể tham chiếu pattern cleanup từ `src/components/QuotePreviewDialog.tsx`

Kết quả mong đợi sau khi sửa:
- click vào ô “Địa chỉ nhận” nhập được bình thường
- dropdown Tỉnh/Quận/Phường chọn được
- không còn click xuyên xuống form phía sau
- đóng/mở popup không để lại trạng thái body bị khóa chuột
