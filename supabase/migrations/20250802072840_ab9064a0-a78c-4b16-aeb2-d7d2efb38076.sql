-- Tạo trigger để tự động cập nhật payment status khi có payment mới
CREATE OR REPLACE TRIGGER update_order_payment_status_trigger
  AFTER INSERT OR UPDATE OR DELETE ON order_payments
  FOR EACH ROW EXECUTE FUNCTION update_order_payment_status();

-- Trigger để tự động cập nhật payment status khi xóa payment
CREATE OR REPLACE TRIGGER update_order_payment_status_delete_trigger
  AFTER DELETE ON order_payments
  FOR EACH ROW EXECUTE FUNCTION update_order_payment_status();