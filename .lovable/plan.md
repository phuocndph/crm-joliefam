
## Mục tiêu
Làm cho dropdown tìm kiếm (Command/cmdk trong Popover) **cuộn được bằng con lăn chuột** để tìm sản phẩm/vải dễ dàng, ổn định trên Chrome/Edge/Safari.

---

## Chẩn đoán nhanh (vì sao hiện tại vẫn không cuộn)
Hiện `CommandList` đang được bọc bởi `ScrollArea` với `className="max-h-[300px]"`.

Trong Radix `ScrollArea`, **Root cần có chiều cao cụ thể** để tạo vùng “viewport” có overflow.  
Nhưng component `ScrollArea` của dự án đang set:

- `Root`: `relative overflow-hidden` (không tự tạo scroll)
- `Viewport`: `className="h-full w-full"`

Khi `Root` chỉ có `max-height` (không có `height`), `h-full` của Viewport thường **không có chiều cao thực để bám theo**, dẫn đến:
- Vùng list không trở thành vùng scroll đúng nghĩa, hoặc
- Trông như có giới hạn hiển thị, nhưng wheel event không làm list cuộn.

Kết quả: danh sách dài nhưng **mouse wheel không “ăn”**.

---

## Cách sửa (ổn định nhất)
### 1) Sửa `CommandList` để ScrollArea có “height” thật (không chỉ max-height)
**File:** `src/components/ui/command.tsx`

- Đổi `ScrollArea className="max-h-[300px]"` thành chiều cao rõ ràng:
  - `h-[300px]` (đơn giản nhất, chắc chắn hoạt động)
  - hoặc dùng chiều cao linh hoạt theo màn hình:
    - `h-[min(320px,calc(100vh-220px))]` để không bị tràn màn hình khi ở laptop nhỏ.

Đồng thời giữ padding của list như hiện tại.

**Kỳ vọng:** ngay lập tức wheel scroll hoạt động vì viewport đã có height => overflow thật.

---

### 2) Tăng “khả năng bắt cuộn” (tránh scroll bị Popover/parent nuốt event)
**File:** `src/components/ui/scroll-area.tsx`

Cập nhật `Viewport` để:
- Thêm `overscroll-contain` / `overscroll-y-contain` (Tailwind) để wheel không “bị kéo” lên body
- Thêm `style={{ overscrollBehavior: "contain" }}` nếu cần chắc chắn
- Đảm bảo viewport là nơi scroll (Radix đã làm đúng), nhưng thêm class giúp browser xử lý tốt hơn trong popup.

**Kỳ vọng:** cuộn mượt, không bị “khựng”, không cuộn cả trang phía sau khi scroll tới đáy.

---

### 3) Kiểm tra các dropdown “tìm sản phẩm” khác có dùng `CommandList` không
Hiện trong repo chỉ thấy `SearchableFabricSelect` dùng `CommandList`.  
Nhưng nếu phần “tìm sản phẩm” đang dùng component khác (ví dụ một searchable select riêng), ta sẽ:
- Chuyển nó qua dùng `CommandList` chung (đã fix scroll), hoặc
- Áp dụng cùng pattern: vùng list phải có height cố định + overflow/ScrollArea đúng.

---

## Tiêu chí nghiệm thu (bắt buộc test)
1) Mở dropdown tìm vải/sản phẩm.
2) Dùng con lăn chuột cuộn xuống liên tục ít nhất 30–50 item: phải cuộn mượt.
3) Cuộn tới đáy: không làm trang phía sau bị cuộn giật.
4) Test trên laptop touchpad (2-finger scroll) nếu có.

---

## Các file sẽ chỉnh
- `src/components/ui/command.tsx`
  - Thay `max-h-[300px]` bằng `h-[...]` cho `ScrollArea` wrapper của `CommandList`.
- `src/components/ui/scroll-area.tsx`
  - Bổ sung `overscroll`/style cho `Viewport` để tối ưu wheel scroll trong popup.

---

## Rủi ro & phương án dự phòng
- Nếu vẫn không cuộn: khả năng có `wheel` event bị chặn ở một layer khác.
  - Khi đó sẽ bổ sung `onWheelCapture={(e)=>e.stopPropagation()}` vào Viewport hoặc PopoverContent để đảm bảo event đi đúng vùng scroll (chỉ dùng khi cần, tránh tác dụng phụ).

