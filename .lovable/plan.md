
Mình sẽ fix theo hướng khác, vì nguyên nhân không chỉ nằm ở `InlineOrderEditTable` mà còn ở component `Table` dùng chung.

## Vấn đề gốc
Hiện tại có 2 lớp cuộn lồng nhau:

1. `InlineOrderEditTable.tsx` bọc ngoài bằng:
```tsx
<div className="rounded-md border max-h-[600px] overflow-auto">
```

2. `src/components/ui/table.tsx` lại tự bọc thêm:
```tsx
<div className="relative w-full overflow-auto">
  <table ... />
</div>
```

Kết quả:
- thanh cuộn ngang thực tế đang thuộc wrapper bên trong của `Table`
- còn bảng đơn hàng lại có thêm wrapper cuộn bên ngoài
- vì vậy scrollbar vẫn bị “tụt xuống dưới”, không nằm đúng vùng nhìn thấy như thanh cuộn dọc

## Cách fix mới
Chỉ giữ **1 scroll container duy nhất** cho bảng đơn hàng.

### 1. Cập nhật `src/components/ui/table.tsx`
Mở rộng component `Table` để có thể:
- tắt wrapper mặc định khi cần
- hoặc truyền class cho wrapper riêng

Hướng làm:
- thêm prop kiểu như `containerClassName`
- thêm prop kiểu như `disableWrapper`
- khi `disableWrapper` bật, render thẳng `<table />` không bọc `overflow-auto`

Ví dụ logic:
```tsx
<Table disableWrapper className="min-w-max" />
```

### 2. Cập nhật `src/components/InlineOrderEditTable.tsx`
Để **wrapper ngoài** là nơi cuộn duy nhất:
```tsx
<div className="rounded-md border max-h-[600px] overflow-auto">
  <Table disableWrapper className="min-w-max">
```

Ý nghĩa:
- `overflow-auto` ngoài sẽ quản lý cả cuộn dọc + ngang
- thanh cuộn ngang sẽ nằm ngay trong vùng bảng đang thấy
- không còn xung đột do nested scroll
- `min-w-max` giúp bảng giữ đủ chiều rộng để scrollbar ngang xuất hiện đúng

### 3. Giữ nguyên header sticky và cột hành động sticky
Vì hiện tại bảng đã có:
- `TableHeader className="sticky top-0 ..."`
- cột cuối `sticky right-0`

Mình sẽ giữ cấu trúc này, chỉ kiểm tra lại background/shadow để:
- header không bị trong suốt khi cuộn
- cột “Hành động” không chồng lỗi lên phần scrollbar

### 4. Dọn CSS scrollbar
Phần CSS trong `src/index.css` hiện đang target `.overflow-x-auto::-webkit-scrollbar`.
Sau khi chuyển sang 1 container duy nhất với `overflow-auto`, mình sẽ đổi selector sang class riêng cho bảng đơn hàng, ví dụ:
```css
.order-table-scroll::-webkit-scrollbar
```

để:
- chỉ áp dụng cho bảng này
- không ảnh hưởng các vùng cuộn khác trong app

## Kết quả mong đợi
- khi đang ở đầu bảng vẫn thấy vùng cuộn ngang ở đáy khung bảng
- không cần kéo xuống tận cuối nội dung
- cuộn dọc vẫn nằm bên phải như hiện tại
- header sticky và cột hành động sticky vẫn hoạt động bình thường

## Chi tiết kỹ thuật
Các file sẽ sửa:
- `src/components/ui/table.tsx`
- `src/components/InlineOrderEditTable.tsx`
- `src/index.css`

Điểm quan trọng nhất:
```text
Trước:
Outer scroll container
  -> Inner Table wrapper scroll container
    -> table

Sau:
Single scroll container
  -> table trực tiếp
```

Cách này đúng bản chất hơn so với việc cố “ghim” scrollbar bằng `sticky bottom-0`.
