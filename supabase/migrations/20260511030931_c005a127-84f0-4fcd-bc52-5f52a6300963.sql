-- Thu hồi policy cho phép tất cả user đăng nhập xem toàn bộ sản phẩm.
-- Khôi phục phạm vi xem theo vai trò (admin/accountant xem toàn bộ, manager xem của mình, employee xem theo manager được phân công).
DROP POLICY IF EXISTS "Authenticated can view products" ON public.products;
DROP POLICY IF EXISTS "Users can view products" ON public.products;