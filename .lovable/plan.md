

## Vấn đề

38 bản ghi trong bảng `order_payments` có `manager_id = NULL`. Nhân viên chỉ thấy được payments có `manager_id` trùng với manager của mình (theo RLS policy). Kết quả là nhân viên thấy số "Đã thanh toán" bị thiếu, dẫn đến "Còn lại" sai.

## Giải pháp

### 1. Backfill dữ liệu cũ
Cập nhật 38 payments thiếu `manager_id` bằng cách lấy `manager_id` từ đơn hàng tương ứng:

```sql
UPDATE order_payments op
SET manager_id = o.manager_id
FROM orders o
WHERE op.order_id = o.id
AND op.manager_id IS NULL;
```

### 2. Thêm trigger tự động set `manager_id` cho `order_payments`
Tạo trigger BEFORE INSERT trên `order_payments` để tự động copy `manager_id` từ order nếu chưa được set. Điều này đảm bảo mọi payment mới luôn có `manager_id` đúng, kể cả khi frontend không truyền vào.

```sql
CREATE OR REPLACE FUNCTION public.set_order_payment_manager_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.manager_id IS NULL THEN
    SELECT manager_id INTO NEW.manager_id
    FROM public.orders
    WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_order_payment_manager_id_trigger
BEFORE INSERT ON public.order_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_order_payment_manager_id();
```

### File cần chỉnh
- 1 migration file duy nhất chứa cả backfill + trigger
- Không cần sửa frontend code

### Kết quả
- Nhân viên sẽ thấy đúng số tiền đã thanh toán cho tất cả đơn hàng
- Mọi payment mới sẽ tự động có `manager_id` đúng

