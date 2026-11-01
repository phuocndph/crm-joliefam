-- Incremental invoice evidence protections after workspace bootstrap.
CREATE OR REPLACE FUNCTION local_invoice_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='local_contracts' THEN
  IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM local_invoice_document_links WHERE kind='CONTRACT' AND reference IN (OLD.id,OLD.contract_number)) THEN RAISE EXCEPTION 'Hợp đồng có hồ sơ hóa đơn liên kết.' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM local_invoice_contract_allocations WHERE contract_id=OLD.id) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Hợp đồng có phân bổ hóa đơn; giữ hồ sơ để đối chiếu.' USING ERRCODE='23514'; END IF;
   IF (NEW.total_amount,NEW.items,NEW.vat_rate,NEW.manager_id,NEW.tenant_id,NEW.buyer_info,NEW.seller_info,NEW.order_id,NEW.status) IS DISTINCT FROM (OLD.total_amount,OLD.items,OLD.vat_rate,OLD.manager_id,OLD.tenant_id,OLD.buyer_info,OLD.seller_info,OLD.order_id,OLD.status) THEN RAISE EXCEPTION 'Hợp đồng đã giữ chỗ/phân bổ hóa đơn. Gỡ phân bổ có lý do trước khi đổi nguồn.' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM local_invoice_payment_allocations WHERE source_id=OLD.id AND source_type=CASE WHEN TG_TABLE_NAME='local_order_payments' THEN 'ORDER_PAYMENT' ELSE 'TRANSACTION' END) THEN
   RAISE EXCEPTION 'Khoản tiền đã phân bổ hóa đơn. Gỡ phân bổ có lý do trước.' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;

-- A legacy delete or generic refresh cannot silently remove a scoped invoice.
CREATE OR REPLACE FUNCTION local_invoice_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.company_id IS NOT NULL THEN RAISE EXCEPTION 'Hủy nháp qua workspace có revision; không xóa sổ hóa đơn.' USING ERRCODE='23514'; END IF; RETURN OLD; END $$;
CREATE TRIGGER invoice_ledger_delete_guard BEFORE DELETE ON local_einvoices FOR EACH ROW EXECUTE FUNCTION local_invoice_delete_guard();

CREATE UNIQUE INDEX local_invoice_files_dedupe ON local_invoice_files(company_id,coalesce(invoice_id,''),sha256,media_type);
