# Vấn đề: Không thấy sản phẩm

## Nguyên nhân gốc (đã xác định bằng truy vấn DB)

1. **Toàn bộ 1.772 sản phẩm và 7 bảng giá** trong database đều đang thuộc sở hữu của tài khoản **admin** (`manager_id = 3dc07420-…`).
2. Các tài khoản vận hành (manager `6a1faecc-…`, `722bd658-…`, employees, accountant) **không sở hữu sản phẩm nào**.
3. Trước đây có policy `Users can view products in accessible price_lists` cho phép mọi user xem sản phẩm thông qua bảng giá → các manager/employee vẫn thấy được sản phẩm của admin.
4. **Migration ngày 20/05** (`20260520105913_…`) đã **DROP policy này** với lý do "leaks cost_price across managers".
5. Sau khi drop, RLS hiện tại chỉ cho:
   - Admin và Accountant: xem tất cả ✓
   - Manager: chỉ xem `manager_id = auth.uid()` → **không khớp** → 0 dòng
   - Employee: chỉ xem `manager_id IN (assigned_by)` → **không khớp** → 0 dòng

Vì vậy mọi manager/employee đang đăng nhập đều thấy danh sách sản phẩm trống — đây cũng là lý do dropdown bảng giá có thể trông như rỗng nếu được lọc theo dữ liệu sản phẩm.

## Giải pháp tận gốc

Đây là mô hình **catalog dùng chung toàn công ty**: 1 admin tạo bảng giá + sản phẩm, các manager/employee chỉ sử dụng để bán. Cần khôi phục khả năng xem sản phẩm dùng chung, nhưng vẫn **bịt lỗ rò `cost_price`** mà migration trước lo ngại.

### Migration mới sẽ thực hiện

1. **Tạo view `products_public`** (`security_invoker = on`) chứa mọi cột **trừ `cost_price`**.
2. **Khôi phục policy SELECT** trên `public.products` cho mọi user `authenticated` có thể xem qua bảng giá hợp lệ — nhưng cấp qua view để ẩn `cost_price`. Cụ thể:
   - Policy SELECT trên `products`: chỉ cho admin / accountant / chủ sở hữu (`manager_id = auth.uid()`) / employee của chủ sở hữu được xem **toàn bộ cột** (bao gồm `cost_price`).
   - Thêm policy SELECT thứ hai: cho phép mọi user `authenticated` xem các dòng `products` mà `price_list_id` tồn tại — **NHƯNG** truy vấn từ frontend cho danh sách sản phẩm sẽ đi qua view `products_public` (không có `cost_price`). Do RLS áp dụng theo hàng, ta tách quyền cột bằng view + revoke `SELECT (cost_price)` ở cấp column-grant cho role `authenticated` (chỉ cấp lại cho admin/accountant/manager-sở-hữu/employee-của-sở-hữu thông qua một function `can_see_cost_price`).
3. **Áp dụng tương tự** cho các trang khác đang dùng chung dữ liệu của admin nếu cần (kiểm tra: customers, expenses cũng đang chạy theo model "mỗi manager 1 bộ dữ liệu" — nhưng người dùng chỉ phản ánh sản phẩm, sẽ không sửa thêm để tránh tác động ngoài phạm vi).

### Thay đổi code frontend

- `ProductManagement.tsx` (danh sách + bộ chọn bảng giá), `CreateQuoteForm`, `CreateOrderForm`, `ProductSelectionForm`, `MobileProductList`, mobile product card và các nơi liệt kê sản phẩm: đổi `from('products')` → `from('products_public')` cho **các truy vấn chỉ-đọc danh sách**.
- Giữ nguyên `from('products')` cho:
  - Insert/Update/Delete (ghi).
  - Trang/Section cần `cost_price` (vd. tính lãi, phân tích lợi nhuận).
- Cập nhật type cast `as any` hiện có để không vỡ TypeScript (file `types.ts` tự sinh sẽ có view).

### Kiểm thử sau khi áp dụng

1. Đăng nhập bằng manager `6a1faecc-…` → mở Quản lý sản phẩm → dropdown bảng giá có 7 mục → chọn → thấy 1.772 sản phẩm; **không** thấy cột "Giá gốc" có giá trị (hoặc thấy `null`).
2. Đăng nhập bằng admin → thấy đầy đủ kể cả `cost_price`.
3. Tạo báo giá / đơn hàng: dropdown chọn sản phẩm có dữ liệu trên cả desktop và mobile.
4. Accountant xem được sản phẩm + `cost_price` để đối chiếu chi phí.

## Lưu ý cho người dùng

- Sau khi sửa, mọi tài khoản đều dùng chung **danh mục sản phẩm và bảng giá của admin** (đây vốn là mô hình thực tế của bạn).
- Nếu sau này muốn mỗi manager có **bộ sản phẩm/bảng giá riêng**, ta sẽ cần tách dữ liệu rõ ràng và tắt policy "view via price_list". Hiện tại giữ mô hình dùng chung để không làm vỡ dữ liệu cũ.

## Phạm vi file thay đổi

- 1 migration SQL mới (view + policy + column grant + helper function).
- ~6 file frontend chuyển `products` → `products_public` cho query đọc danh sách.
- Không sửa nghiệp vụ ghi, không động đến các bảng khác.
