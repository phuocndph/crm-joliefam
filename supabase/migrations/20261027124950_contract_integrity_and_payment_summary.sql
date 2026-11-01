CREATE SCHEMA IF NOT EXISTS contract_private;
REVOKE ALL ON SCHEMA contract_private FROM PUBLIC;
GRANT USAGE ON SCHEMA contract_private TO authenticated;

-- Additive guards: old financial snapshots/duplicate numbers are not rewritten.
CREATE INDEX IF NOT EXISTS contracts_number_lookup_idx
ON public.contracts (tenant_id, lower(btrim(contract_number)));

CREATE OR REPLACE FUNCTION contract_private.contract_integrity_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
 financial boolean; line jsonb; result jsonb := '[]'; qty numeric; price numeric;
 amount numeric; sub numeric := 0; tax numeric; total numeric; mode text;
 field text; relation text; linked jsonb; current_body jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Bạn cần đăng nhập.' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN
   IF EXISTS(SELECT 1 FROM public.einvoices WHERE contract_id=OLD.id) THEN
     RAISE EXCEPTION 'Hợp đồng đã có hóa đơn liên kết. Hãy hủy hợp đồng để giữ chứng từ.' USING ERRCODE='23503';
   END IF;
   RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
   RAISE EXCEPTION 'Không đổi người phụ trách qua chỉnh sửa hợp đồng.' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' OR (NEW.contract_number,NEW.tenant_id) IS DISTINCT FROM (OLD.contract_number,OLD.tenant_id) THEN
   IF nullif(btrim(NEW.contract_number),'') IS NULL THEN RAISE EXCEPTION 'Số hợp đồng là bắt buộc.' USING ERRCODE='22023'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(NEW.tenant_id,'')||':'||lower(btrim(NEW.contract_number)),0));
   IF EXISTS(SELECT 1 FROM public.contracts c WHERE c.tenant_id=NEW.tenant_id AND lower(btrim(c.contract_number))=lower(btrim(NEW.contract_number)) AND c.id<>NEW.id) THEN
     RAISE EXCEPTION 'Số hợp đồng đã tồn tại.' USING ERRCODE='23505';
   END IF;
   NEW.contract_number=btrim(NEW.contract_number);
 END IF;
 IF NEW.status NOT IN ('draft','active','completed','cancelled') OR (NEW.end_date IS NOT NULL AND NEW.start_date IS NOT NULL AND NEW.end_date<NEW.start_date) THEN
   RAISE EXCEPTION 'Trạng thái hoặc ngày hợp đồng không hợp lệ.' USING ERRCODE='22023';
 END IF;
 current_body=to_jsonb(NEW);
 FOR field,relation IN SELECT * FROM (VALUES ('customer_id','customers'),('quote_id','quotes'),('order_id','orders'),('template_id','contract_templates')) AS links(f,t) LOOP
   IF current_body->>field IS NOT NULL AND (TG_OP='INSERT' OR (NEW.customer_id,NEW.quote_id,NEW.order_id,NEW.template_id,NEW.tenant_id) IS DISTINCT FROM (OLD.customer_id,OLD.quote_id,OLD.order_id,OLD.template_id,OLD.tenant_id)) THEN
     EXECUTE format('select to_jsonb(t) from public.%I t where id::text=$1',relation) INTO linked USING current_body->>field;
     IF linked IS NULL THEN RAISE EXCEPTION 'Không tìm thấy dữ liệu liên kết.' USING ERRCODE='22023'; END IF;
     IF field='template_id' AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR (public.has_role(auth.uid(),'manager') AND (linked->>'manager_id' IS NULL OR linked->>'manager_id'=auth.uid()::text)) OR (public.has_role(auth.uid(),'employee') AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='employee' AND assigned_by::text=linked->>'manager_id'))) THEN RAISE EXCEPTION 'Không có quyền đọc mẫu hợp đồng.' USING ERRCODE='42501'; END IF;
     IF (field<>'template_id' AND linked->>'manager_id' IS DISTINCT FROM NEW.manager_id)
       OR (linked->>'tenant_id' IS NOT NULL AND linked->>'tenant_id'<>NEW.tenant_id AND NOT(field='template_id' AND linked->>'manager_id' IS NULL)) THEN
       RAISE EXCEPTION 'Dữ liệu liên kết khác đơn vị/người phụ trách.' USING ERRCODE='42501';
     END IF;
     IF field IN ('quote_id','order_id') AND NEW.customer_id IS NOT NULL AND linked->>'customer_id' IS NOT NULL AND linked->>'customer_id'<>NEW.customer_id::text THEN
       RAISE EXCEPTION 'Khách hàng không khớp dữ liệu liên kết.' USING ERRCODE='22023';
     END IF;
   END IF;
 END LOOP;
 financial=TG_OP='INSERT' OR (NEW.items,NEW.include_vat,NEW.vat_rate,NEW.subtotal,NEW.vat_amount,NEW.total_amount,NEW.deposit_amount,NEW.deposit_percentage,NEW.seller_info->>'deposit_mode') IS DISTINCT FROM
   (OLD.items,OLD.include_vat,OLD.vat_rate,OLD.subtotal,OLD.vat_amount,OLD.total_amount,OLD.deposit_amount,OLD.deposit_percentage,OLD.seller_info->>'deposit_mode');
 IF TG_OP='INSERT' OR NEW.buyer_info IS DISTINCT FROM OLD.buyer_info OR financial THEN
   IF jsonb_typeof(NEW.buyer_info)<>'object' OR nullif(btrim(NEW.buyer_info->>'company_name'),'') IS NULL THEN RAISE EXCEPTION 'Tên Bên B là bắt buộc.' USING ERRCODE='22023'; END IF;
 END IF;
 IF NOT financial THEN RETURN NEW; END IF;
 IF coalesce(jsonb_typeof(NEW.seller_info),'null')<>'object' THEN RAISE EXCEPTION 'Thông tin Bên A không hợp lệ.' USING ERRCODE='22023'; END IF;
 IF coalesce(NEW.deposit_percentage,0)<0 OR coalesce(NEW.deposit_percentage,0)>100 OR coalesce(NEW.vat_rate,0)<0 OR coalesce(NEW.vat_rate,0)>100
   OR scale(trim_scale(coalesce(NEW.deposit_percentage,0)))>3 OR scale(trim_scale(coalesce(NEW.vat_rate,0)))>3 THEN RAISE EXCEPTION 'Tỷ lệ VAT/đặt cọc không hợp lệ.' USING ERRCODE='22023'; END IF;
 FOREACH field IN ARRAY ARRAY['subtotal','vat_amount','total_amount','deposit_amount'] LOOP
   IF current_body->>field IS NOT NULL AND (current_body->>field !~ '^\d+(\.\d+)?$' OR (current_body->>field)::numeric>9007199254740991) THEN RAISE EXCEPTION 'Số tiền không hợp lệ.' USING ERRCODE='22023'; END IF;
 END LOOP;
 mode=coalesce(NEW.seller_info->>'deposit_mode',CASE WHEN coalesce(NEW.deposit_percentage,0)>0 THEN 'percent' ELSE 'amount' END);
 IF mode NOT IN ('none','percent','amount') THEN RAISE EXCEPTION 'Cách đặt cọc không hợp lệ.' USING ERRCODE='22023'; END IF;
 IF NEW.contract_number LIKE 'HDNT-%' AND coalesce(NEW.items,'[]')='[]'::jsonb THEN
   IF coalesce(NEW.total_amount,0)<>0 OR coalesce(NEW.deposit_amount,0)<>0 OR coalesce(NEW.subtotal,0)<>0 OR coalesce(NEW.vat_amount,0)<>0 THEN RAISE EXCEPTION 'Hợp đồng nguyên tắc không có sản phẩm phải có giá trị 0.' USING ERRCODE='22023'; END IF;
   NEW.items='[]'; NEW.subtotal=0; NEW.vat_amount=0; NEW.total_amount=0; NEW.deposit_amount=0; NEW.deposit_percentage=0; NEW.include_vat=false; NEW.vat_rate=0; NEW.seller_info=jsonb_set(NEW.seller_info,'{deposit_mode}','"none"'); RETURN NEW;
 END IF;
 IF coalesce(jsonb_typeof(NEW.items),'null')<>'array' OR jsonb_array_length(NEW.items) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Cần 1 đến 1.000 sản phẩm.' USING ERRCODE='22023'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
   IF jsonb_typeof(line)<>'object' OR jsonb_typeof(line->'name')<>'string' OR nullif(btrim(line->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Tên sản phẩm là bắt buộc.' USING ERRCODE='22023'; END IF;
   IF coalesce(line->>'quantity','') !~ '^\d+(\.\d+)?$' OR coalesce(line->>'price','') !~ '^\d+(\.\d+)?$' THEN RAISE EXCEPTION 'Số lượng/đơn giá không hợp lệ.' USING ERRCODE='22023'; END IF;
   qty=(line->>'quantity')::numeric; price=(line->>'price')::numeric;
   IF qty<=0 OR qty>9007199254740991 OR price>9007199254740991 OR scale(trim_scale(qty))>6 OR scale(trim_scale(price))>6 THEN RAISE EXCEPTION 'Số lượng/đơn giá vượt giới hạn.' USING ERRCODE='22023'; END IF;
   IF line ? 'total' AND (coalesce(line->>'total','') !~ '^\d+(\.\d+)?$' OR (line->>'total')::numeric>9007199254740991) THEN RAISE EXCEPTION 'Thành tiền không hợp lệ.' USING ERRCODE='22023'; END IF;
   amount=round(qty*price); sub=sub+amount;
   result=result||jsonb_build_array(line||jsonb_build_object('name',btrim(line->>'name'),'quantity',qty,'price',price,'total',amount));
 END LOOP;
 tax=CASE WHEN coalesce(NEW.include_vat,false) THEN round(sub*coalesce(NEW.vat_rate,0)/100) ELSE 0 END; total=sub+tax;
 IF total>9007199254740991 THEN RAISE EXCEPTION 'Giá trị hợp đồng vượt giới hạn.' USING ERRCODE='22023'; END IF;
 amount=CASE mode WHEN 'none' THEN 0 WHEN 'percent' THEN round(total*coalesce(NEW.deposit_percentage,0)/100) ELSE coalesce(NEW.deposit_amount,0) END;
 IF amount>total THEN RAISE EXCEPTION 'Đặt cọc vượt giá trị hợp đồng.' USING ERRCODE='22023'; END IF;
 NEW.items=result; NEW.subtotal=sub; NEW.vat_amount=tax; NEW.total_amount=total; NEW.deposit_amount=amount;
 NEW.deposit_percentage=CASE WHEN mode='percent' THEN coalesce(NEW.deposit_percentage,0) ELSE 0 END;
 NEW.seller_info=jsonb_set(NEW.seller_info,'{deposit_mode}',to_jsonb(mode));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS z_contract_integrity_guard ON public.contracts;
CREATE TRIGGER z_contract_integrity_guard BEFORE INSERT OR UPDATE OR DELETE ON public.contracts FOR EACH ROW EXECUTE FUNCTION contract_private.contract_integrity_guard();

-- Definer is necessary to detect competing contracts hidden by row policies.
-- Explicit caller scope is checked before exposing only aggregate receipt amounts.
CREATE OR REPLACE FUNCTION contract_private.payment_summary(p_contract_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.contracts; o public.orders; paid numeric; allowed boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Bạn cần đăng nhập.' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.contracts WHERE id=p_contract_id;
 allowed=public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')
   OR (public.has_role(auth.uid(),'manager') AND c.manager_id=auth.uid()::text)
   OR (public.has_role(auth.uid(),'employee') AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='employee' AND assigned_by::text=c.manager_id));
 IF c.id IS NULL OR NOT coalesce(allowed,false) THEN RAISE EXCEPTION 'Không có quyền xem hợp đồng.' USING ERRCODE='42501'; END IF;
 IF c.order_id IS NULL THEN RETURN jsonb_build_object('known',false,'paid',null,'remaining',null,'reason','Hợp đồng chưa liên kết đơn hàng có chứng từ thu.'); END IF;
 SELECT * INTO o FROM public.orders WHERE id=c.order_id;
 IF o.id IS NULL OR o.manager_id IS DISTINCT FROM c.manager_id OR o.tenant_id IS DISTINCT FROM c.tenant_id OR (SELECT count(*) FROM public.contracts WHERE order_id=c.order_id)<>1 THEN
   RETURN jsonb_build_object('known',false,'paid',null,'remaining',null,'reason','Cần đối chiếu đơn hàng và phân bổ tiền thu giữa các hợp đồng.');
 END IF;
 SELECT coalesce(sum(payment_amount),0) INTO paid FROM public.order_payments WHERE order_id=c.order_id;
 RETURN jsonb_build_object('known',true,'paid',paid,'remaining',greatest(0,c.total_amount-paid),'reason','Theo chứng từ thu của đơn hàng liên kết.');
END $$;
REVOKE ALL ON FUNCTION contract_private.contract_integrity_guard() FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION contract_private.payment_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contract_private.payment_summary(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.contract_payment_summary(p_contract_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$ SELECT contract_private.payment_summary(p_contract_id) $$;
REVOKE ALL ON FUNCTION public.contract_payment_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contract_payment_summary(uuid) TO authenticated;
