
## Mục tiêu
Sửa triệt để lỗi “tài khoản kế toán” khi **Ghi nhận sử dụng vải** (FabricUsageRecording) — hiện tại UI chỉ báo “lỗi chung”, nên cần:
1) Bóc tách đúng nguyên nhân (Supabase trả lỗi gì)  
2) Sửa logic để không bị lỗi do dữ liệu/trigger/RLS  
3) Làm thao tác ghi nhận **atomic** (một lần bấm = ghi usage + ghi transaction + update tồn kho) để tránh “nửa thành công nửa thất bại”.

---

## Nhận định từ code hiện tại (nguyên nhân có xác suất cao)
Trong `src/components/FabricUsageRecording.tsx`, khi bấm “Ghi nhận”, code đang làm **2 lần ghi DB** cho mỗi loại vải:
1) `insert` vào `fabric_usage` (qua `useCreateFabricUsage`)
2) `insert` vào `fabric_transactions` (qua `useCreateTransaction`)

Chỉ cần **1 trong 2 bước fail** (RLS, trigger, NOT NULL, session, …) là UI sẽ báo lỗi chung.

Ngoài ra, `fabric_usage.order_id` là **NOT NULL** trong schema, nhưng UI có nhánh có thể gửi `order_id: null` nếu không tìm thấy đơn. Bạn chọn “Có tìm thấy đơn”, nhưng để an toàn vẫn phải fix vì đây là lỗi tiềm ẩn rất dễ bùng lại.

Và quan trọng nhất: hiện UI đang “nuốt” chi tiết lỗi (toast chỉ hiển thị chung chung), nên người dùng luôn thấy “lỗi” nhưng không biết do đâu.

---

## Kế hoạch xử lý (ưu tiên theo hiệu quả)

### 1) Bắt lỗi đúng cách để biết “do đâu”
**Thay đổi frontend** để khi Supabase trả lỗi, toast hiển thị:
- `error.message`
- `error.code` (nếu có)
- `error.details` / `hint` (nếu có)

Và log rõ ràng theo từng bước:
- “insert fabric_usage start/ok/fail”
- “insert fabric_transactions start/ok/fail”

Kết quả mong đợi: bạn sẽ thấy lỗi cụ thể kiểu:
- `null value in column "order_id" violates not-null constraint`
- `new row violates row-level security policy`
- `Authentication required`
- `permission denied ...`
=> xác định nguyên nhân trong 1 lần thử.

---

### 2) Fix logic dữ liệu “chắc chắn không fail” ở Usage Recording
**Thay đổi `FabricUsageRecording.tsx`**:
- Đảm bảo `order_id` luôn là UUID hợp lệ:
  - Nếu tìm được order => dùng `order.id`
  - Nếu không tìm được order => tự tạo `crypto.randomUUID()` (giữ `order_number` để tra cứu)
- Kiểm tra session trước khi ghi:
  - `const { data: { session } } = await supabase.auth.getSession()`
  - Nếu không có session => báo “Phiên đăng nhập hết hạn, vui lòng đăng nhập lại” (khớp với constraint “Authentication required” mà hệ thống đang dùng)
- Với mỗi `fabricItem`, validate thêm:
  - `warehouse_id` phải có
  - `quantity_used > 0`
  - `fabric_variant_id` có

---

### 3) Làm thao tác “ghi nhận sử dụng vải” thành 1 transaction (khuyến nghị mạnh)
Hiện tại UI ghi 2 bảng tách rời → dễ lỗi/khó rollback.

**Giải pháp tốt nhất**: tạo 1 Postgres function (RPC) ví dụ:
- `public.record_fabric_usage_and_transaction(...)`
- Bên trong function:
  1) INSERT `fabric_usage`
  2) INSERT `fabric_transactions` (outbound) tương ứng (quantity âm hoặc dương tùy quy ước)
  3) (Inventory đang được trigger tự cập nhật sau insert fabric_usage) — giữ nguyên, không update từ client nữa
- Function chạy trong **một transaction** → hoặc thành công hết, hoặc fail hết.

**Vì sao cách này hay nhất cho “tài khoản kế toán vẫn lỗi”**
- Nếu lỗi nằm ở RLS/trigger, bạn sẽ có 1 điểm lỗi duy nhất (RPC) với message rõ ràng.
- Tránh tình trạng “đã ghi usage nhưng chưa ghi transaction” (hoặc ngược lại).
- Dễ kiểm soát quyền: function kiểm tra role (admin/manager/accountant/employee) rồi mới cho chạy.

Lưu ý kỹ thuật:
- Function nên `SECURITY DEFINER` *hoặc* giữ `SECURITY INVOKER` nhưng thiết kế RLS chuẩn.  
  - Nếu dùng `SECURITY DEFINER`, vẫn phải check `auth.uid()` và role trong function để không tạo lỗ hổng.
- Dùng `set search_path = public` trong function.

---

### 4) Kiểm tra lại RLS & trigger liên quan (chỉ làm nếu log cho thấy lỗi RLS/permission)
Nếu log cho thấy lỗi kiểu “violates row-level security policy” hoặc “permission denied”, ta sẽ:
- Rà lại policy trên:
  - `fabric_usage`
  - `fabric_transactions`
  - `fabric_inventory` (vì trigger update inventory chạy theo quyền người gọi)
  - `orders` (vì trigger update note trên orders)
- Đảm bảo accountant có `FOR ALL` + `WITH CHECK` đúng như migrations dự kiến.
- Nếu thiếu policy trên môi trường Live/Test, tạo migration bổ sung.

---

## Tiêu chí hoàn thành
1) Kế toán bấm “Ghi nhận sử dụng vải” không còn lỗi (trên máy nào cũng vậy).
2) Tồn kho (`fabric_inventory`) giảm đúng theo trigger.
3) Lịch sử giao dịch (`fabric_transactions`) có dòng outbound tương ứng.
4) Nếu có lỗi phát sinh, UI hiển thị thông báo lỗi cụ thể (không còn “lỗi chung chung”).

---

## Test end-to-end cần chạy (sau khi sửa)
1) Đăng nhập bằng tài khoản kế toán → vào Quản lý vải → Ghi nhận sử dụng vải:
   - Case A: đơn hàng có tồn tại (auto fill được)
   - Case B: nhập số đơn không tồn tại (nếu vẫn cho phép) → vẫn phải lưu được
2) Sau khi ghi nhận:
   - Inventory giảm
   - Transactions có outbound
   - Usage list có record mới
3) Thử trên máy khác / trình duyệt khác (đúng case bạn gặp).

---

## File dự kiến sẽ đụng tới
- `src/components/FabricUsageRecording.tsx` (hiển thị lỗi chi tiết, fix order_id, check session)
- `src/hooks/useFabrics.ts` (thêm mutation gọi RPC mới, hoặc điều chỉnh createTransaction/createFabricUsage flow)
- `supabase/migrations/*.sql` (tạo RPC function + (nếu cần) fix RLS)
