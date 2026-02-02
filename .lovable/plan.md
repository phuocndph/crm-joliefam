

# Cải thiện giao diện trang Quản lý vải - Giảm rối mắt

## Vấn đề hiện tại

Từ hình ảnh bạn cung cấp, tôi nhận thấy:

1. **Quá nhiều Card xếp chồng** - Mỗi section là 1 card riêng, tạo cảm giác phân mảnh
2. **Thông tin trùng lặp** - "Ghi nhận sử dụng vải" và "Chi tiết sử dụng vải" có header tương tự, gây nhầm lẫn
3. **Các badge thống kê nằm lộn xộn** - Badge "1 bản ghi", "1 đơn hàng", "Tổng: 165,4 m" nằm rải rác
4. **Thiếu phân cấp thị giác** - Không rõ đâu là thông tin chính, đâu là phụ
5. **Card "Tồn kho vải" bị thu nhỏ** - Thông tin quan trọng nhưng không nổi bật

---

## Giải pháp đề xuất

### Thay đổi 1: Gộp các section vào layout rõ ràng hơn

**Trước:** 4 Card riêng biệt xếp chồng lên nhau
**Sau:** Chia thành 2 phần chính:
- **Phần trên**: Tồn kho vải (collapsible) + Nút ghi nhận
- **Phần dưới**: Bảng chi tiết (mặc định hiện)

### Thay đổi 2: Di chuyển nút "Ghi nhận sử dụng vải" lên vị trí nổi bật

- Đặt nút cạnh tiêu đề "Kiểm soát vải Bắc Ninh" thay vì trong card riêng
- Bỏ card "Ghi nhận sử dụng vải" vì chỉ chứa 1 nút
- Tiết kiệm 1 hàng Card không cần thiết

### Thay đổi 3: Cải thiện thông tin thống kê

- Gộp các badge thống kê vào 1 hàng summary nhỏ gọn
- Dùng icon + số liệu thay vì badge rời rạc
- Hiển thị ngay dưới tiêu đề section

### Thay đổi 4: Bảng "Chi tiết sử dụng vải" mặc định mở

- Vì đây là thông tin chính người dùng cần xem
- Bỏ phần header card thừa, chỉ giữ bảng
- Bộ lọc thu gọn mặc định, có badge cho biết số filter đang active

---

## Chi tiết thay đổi theo file

### File 1: `src/components/FabricUsageRecording.tsx`

Đơn giản hóa component - chỉ export Dialog trigger button thay vì cả Card wrapper:

```tsx
// Trước: Card + CardHeader + Button
// Sau: Chỉ Button (sẽ được đặt trong component cha)
```

### File 2: `src/components/FabricUsageDetails.tsx`

Cải thiện layout và giảm chiều cao header:

| Thay đổi | Chi tiết |
|----------|----------|
| Giảm padding header | Từ `p-6` xuống `p-4` |
| Gộp badges thành 1 dòng | Inline với font nhỏ hơn |
| Bộ lọc trong Collapsible | Mặc định thu gọn |
| Bảng có sticky header | Cuộn dễ dàng hơn |

### File 3: `src/components/FabricControlByWarehouse.tsx`

Tích hợp nút "Ghi nhận sử dụng vải" vào header:

```tsx
<div className="flex justify-between items-center">
  <div>
    <h2>Kiểm soát vải {warehouseName}</h2>
    <p className="text-sm text-muted-foreground">...</p>
  </div>
  <Button onClick={openRecordDialog}>
    <Plus /> Ghi nhận sử dụng vải
  </Button>
</div>
```

### File 4: `src/pages/FabricManagement.tsx`

Cập nhật layout trong TabsContent:

```tsx
<TabsContent value="bacninh-control" className="space-y-4">
  {/* Bỏ FabricUsageRecording riêng */}
  <FabricControlByWarehouse 
    warehouseName="Bắc Ninh" 
    warehouseFilter="bacninh"
    showRecordButton={true}  // Tích hợp nút vào component này
  />
  <FabricUsageDetails warehouseName="Bắc Ninh" warehouseFilter="bacninh" />
  {/* Lịch sử giao dịch mặc định thu gọn */}
  <FabricTransactionsTable warehouseFilter="bacninh" defaultCollapsed={true} />
</TabsContent>
```

---

## Kết quả mong đợi

| Trước | Sau |
|-------|-----|
| 4 Card xếp chồng | 2-3 section gọn gàng |
| Nút trong Card riêng | Nút nằm cạnh tiêu đề |
| Badges rời rạc | Summary inline nhỏ gọn |
| Trang dài phải cuộn nhiều | Giao diện compact hơn |
| Khó phân biệt section | Phân cấp thị giác rõ ràng |

---

## Mockup layout mới

```
┌──────────────────────────────────────────────────────────────┐
│  Kiểm soát vải Bắc Ninh              [+ Ghi nhận sử dụng vải] │
│  ▼ Tồn kho vải (19/43 loại)                 Nhấn để xem chi tiết │
├──────────────────────────────────────────────────────────────┤
│  Chi tiết sử dụng vải         1 bản ghi · 1 đơn · Tổng: 165m │
│  ┌─[Bộ lọc ▼]────────────────────────────────────────────┐   │
│  │  (Thu gọn mặc định - click để mở)                     │   │
│  └───────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ Ngày │ Đơn hàng │ Khách hàng │ Vải │ SL │ Thao tác   │   │
│  ├──────┼──────────┼────────────┼─────┼────┼────────────┤   │
│  │ ...  │ ...      │ ...        │ ... │... │ ✏️ 🗑️       │   │
│  └───────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────┤
│  ▶ Lịch sử giao dịch (5 giao dịch)      [Thu gọn mặc định]   │
└──────────────────────────────────────────────────────────────┘
```

---

## Thứ tự thực hiện

1. **Cao**: Di chuyển nút "Ghi nhận sử dụng vải" vào header của FabricControlByWarehouse
2. **Cao**: Bọc bộ lọc trong Collapsible, mặc định thu gọn
3. **Trung bình**: Gộp badges thành summary inline
4. **Trung bình**: FabricTransactionsTable mặc định collapsed
5. **Thấp**: Giảm padding các Card header

