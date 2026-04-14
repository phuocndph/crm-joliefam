

## Fix: Phường/Xã trong chế độ "Địa chỉ mới" đang lấy sai

### Vấn đề
Khi bật "Địa chỉ mới", hệ thống vẫn load phường/xã qua cấu trúc quận/huyện cũ (gọi API lấy từng quận → lấy ward). Kết quả là danh sách phường/xã vẫn theo hành chính cũ, không phản ánh đúng cấu trúc mới (sáp nhập phường/xã, bỏ quận/huyện).

### Giải pháp

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. **Bỏ hiển thị tên quận/huyện trong dropdown phường/xã** khi ở chế độ Địa chỉ mới - vì chế độ này không còn quận/huyện:
   - Xóa `sub: w.districtName` khỏi options của ward dropdown trong new address mode
   - Chỉ hiển thị `WardName` thuần túy

2. **Loại bỏ ward trùng lặp**: Khi gộp ward từ nhiều quận, có thể có ward trùng tên. Thêm logic deduplicate theo `WardCode` để tránh hiển thị trùng.

3. **Sắp xếp ward theo alphabet** để dễ tìm hơn thay vì theo thứ tự quận.

4. **Thêm log chi tiết hơn** để debug: log số ward mỗi quận, tổng số, và danh sách ward đầu tiên.

### Chi tiết thay đổi

```
// Ward options trong new address mode - bỏ sub district name
options={allWardsFlat.map(w => ({ value: w.WardCode, label: w.WardName }))}

// Sort alphabetically  
allWards.sort((a, b) => a.WardName.localeCompare(b.WardName, 'vi'));

// Deduplicate by WardCode
const uniqueWards = allWards.filter((w, i, arr) => arr.findIndex(x => x.WardCode === w.WardCode) === i);
```

