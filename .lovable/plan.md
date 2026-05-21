## Mục tiêu

Đưa 6 trang nghiệp vụ chính lên chuẩn mobile-first giống `OrderManagement` + `MobileCustomerManagement` đã có sẵn: card list thay bảng, infinite scroll, pull-to-refresh, bottom sheet thay dialog, FAB tạo mới, thao tác chính trong tầm ngón cái.

Phạm vi: **không đổi business logic, không đổi phân quyền, không sửa schema**. Chỉ thêm lớp UI mobile, desktop giữ nguyên.

## Trang xử lý (thứ tự ưu tiên)

1. **QuotesPage** — đã có `useInfiniteQuotes`, dễ làm trước
2. **CustomerManagement** — đã có `MobileCustomerManagement` nhưng chưa wire vào page → chỉ cần nhánh `isMobile`
3. **TransactionManagement** — đã có `useInfiniteTransactions`
4. **CustomerCare** — list chăm sóc + form note
5. **CashFlowManagement** — phức tạp hơn (nhiều tab, biểu đồ)
6. **ProductManagement** — đã có `MobileProductCard` chưa wire

## Pattern áp dụng cho mỗi trang

```text
PageX.tsx
 ├─ const isMobile = useIsMobile()
 ├─ if (isMobile) return <MobileX />
 └─ // desktop code giữ nguyên

components/mobile/MobileX.tsx
 ├─ Header: title + count + FAB "+"
 ├─ Sticky search + filter chips
 ├─ Sort sheet (bottom)
 ├─ PullToRefresh
 │   └─ InfiniteScroll
 │       └─ MobileXCard list (border-l-4 theo status, badge sidebar-primary cho paid)
 └─ Sheet (bottom 90vh) cho Create/Edit/View thay Dialog
```

## Chi tiết từng trang

### 1. QuotesPage → `MobileQuotesPage` + `MobileQuoteCard`
- Card: số báo giá, KH, ngày, tổng tiền, trạng thái duyệt, người tạo
- Action: Xem, Sửa, Duyệt (nếu có quyền theo memory `quote-actions-hierarchy`), Tạo đơn, Xóa
- Sheet cho Create/Edit/Preview

### 2. CustomerManagement
- Wire sẵn `MobileCustomerManagement` (đã tồn tại): chỉ thêm `if (isMobile) return <MobileCustomerManagement />`
- Bổ sung: chip filter theo nhóm KH, gọi/nhắn nhanh (`tel:`, `sms:`)

### 3. TransactionManagement → `MobileTransactionsPage` + `MobileTransactionCard`
- Card: ngày, loại (thu/chi), số tiền (màu xanh/đỏ), KH/đơn liên quan, ghi chú
- Filter chips: hôm nay / 7 ngày / tháng, loại thu-chi
- Tổng thu/chi sticky đầu trang

### 4. CustomerCare → `MobileCustomerCarePage` + `MobileCareCard`
- Card: tên KH, lần liên hệ cuối, điểm chốt, next action (parse theo memory)
- Sheet thêm/sửa note
- Quick call/sms

### 5. CashFlowManagement → `MobileCashFlowPage`
- Tabs scroll ngang (Tổng quan / Yêu cầu thanh toán / Ứng / …)
- Summary cards (Tổng vào, Tổng ra, Còn lại) — grid 2 cột
- List card cho từng yêu cầu, sheet duyệt/từ chối
- Ẩn tab/profit cho role accountant (giữ logic hiện có)

### 6. ProductManagement
- Wire `MobileProductCard` (đã có) trong `MobileProductsPage` mới
- Filter chips: loại vải, còn hàng/hết
- Sheet thêm/sửa sản phẩm, library ảnh full-screen

## Thành phần dùng chung (đã có, tái sử dụng)

- `useIsMobile`, `PullToRefresh`, `InfiniteScroll`, `useInfiniteScroll`
- Sheet (`bottom`, `h-[90vh]`) thay Dialog để tránh nested Radix Dialog
- `border-l-4` theo trạng thái, `sidebar-primary` cho trạng thái paid (theo Core memory)
- Format tiền có dấu phân cách nghìn

## Kỹ thuật / lưu ý

- Giữ nguyên hooks data & RLS (`useInfiniteQuotes`, `useCustomers`, `useTransactions`, …); chỉ thêm `enabled: authReady && !!user && !!role` nếu trang nào còn chưa gate (đã làm cho Orders/GHN).
- Dùng `Sheet` thay `Dialog` ở mobile; nested Select set `bg-popover z-[100]`.
- Mỗi MobileX là 1 file mới ở `src/components/mobile/`; page chỉ thêm 2 dòng `if (isMobile)`.
- Không tách logic ra hook mới — gọi lại hook hiện có để tránh duplicate.
- Test viewport 360, 390, 414; kiểm tra không vỡ desktop.

## Deliverables

- 5 file mobile mới: `MobileQuotesPage`, `MobileTransactionsPage`, `MobileCustomerCarePage`, `MobileCashFlowPage`, `MobileProductsPage` + các card con tương ứng
- 6 page sửa: thêm nhánh `isMobile`
- 1 file wire lại CustomerManagement
