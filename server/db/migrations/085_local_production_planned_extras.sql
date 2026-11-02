-- Per-item extra labor plan; completion is bound to one canonical pending adjustment.
alter table local_production_order_items add constraint production_item_order_pair unique(id,production_order_id);
create table local_production_planned_extras (
 id uuid primary key default gen_random_uuid(),
 production_order_id uuid not null references local_production_orders(id) on delete restrict,
 order_item_id uuid not null,
 description text not null check(length(btrim(description)) between 1 and 200),
 quantity numeric(12,2) not null check(quantity>0 and quantity<=9999999999.99),
 unit text not null check(unit in ('cái','lần','bộ','mét','giờ')),
 unit_price numeric(16,2) not null check(unit_price>=0 and unit_price<=99999999999999.99),
 planned_amount numeric(28,4) generated always as (quantity*unit_price) stored check(planned_amount<=99999999999999.9999),
 status text not null default 'PLANNED' check(status in ('PLANNED','CANCELLED')),
 created_by text not null check(length(btrim(created_by))>0),created_at timestamptz not null default clock_timestamp(),
 cancelled_by text,cancelled_at timestamptz,cancel_reason text,
 foreign key(order_item_id,production_order_id) references local_production_order_items(id,production_order_id) on delete restrict,
 check((status='PLANNED' and cancelled_by is null and cancelled_at is null and cancel_reason is null) or
       (status='CANCELLED' and cancelled_by is not null and length(btrim(cancelled_by))>0 and cancelled_at is not null and cancel_reason is not null and length(btrim(cancel_reason)) between 3 and 500))
);
create index production_planned_extras_order_idx on local_production_planned_extras(production_order_id,created_at,id);
create index production_planned_extras_item_idx on local_production_planned_extras(order_item_id,status);
create function protect_production_planned_extra() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'Dự toán cộng thêm không được xóa; hãy hủy kèm lý do.'; end if;
 if exists(select 1 from local_payroll_adjustments where production_extra_id=old.id and status<>'REJECTED') then
  raise exception 'Tiền công cộng thêm đã gửi duyệt lương, không được hủy.';
 end if;
 if old.status<>'PLANNED' or new.status<>'CANCELLED' or
    (new.id,new.production_order_id,new.order_item_id,new.description,new.quantity,new.unit,new.unit_price,new.created_by,new.created_at)
    is distinct from
    (old.id,old.production_order_id,old.order_item_id,old.description,old.quantity,old.unit,old.unit_price,old.created_by,old.created_at)
 then raise exception 'Nội dung dự toán cộng thêm bất biến; chỉ được hủy một lần.'; end if;
 return new;
end $$;
create trigger production_planned_extra_immutable before update or delete on local_production_planned_extras
 for each row execute function protect_production_planned_extra();
revoke all on local_production_planned_extras from public;
revoke all on function protect_production_planned_extra() from public;

alter table local_payroll_adjustments add column production_extra_id uuid unique references local_production_planned_extras(id) on delete restrict;
alter table local_payroll_adjustments add column production_extra_work_date date;
alter table local_payroll_adjustments add constraint payroll_extra_source_pair check((production_extra_id is null)=(production_extra_work_date is null));
create function protect_production_extra_payroll_source() returns trigger language plpgsql as $$
declare source local_production_planned_extras%rowtype; period local_payroll_periods%rowtype;
begin
 if tg_op<>'INSERT' and old.production_extra_id is not null then
  if tg_op='DELETE' then raise exception 'Nguồn tiền công cộng thêm không được xóa.'; end if;
  if (to_jsonb(new)-array['status','approved_by','approved_at','rejected_by','rejected_at','locked_run_id','locked_at','updated_at'])
     is distinct from
     (to_jsonb(old)-array['status','approved_by','approved_at','rejected_by','rejected_at','locked_run_id','locked_at','updated_at'])
     or not ((old.status='SUBMITTED' and new.status in ('APPROVED','REJECTED')) or (old.status='APPROVED' and new.status='LOCKED'))
  then raise exception 'Nguồn tiền công cộng thêm bất biến; chỉ duyệt, từ chối hoặc khóa theo kỳ lương.'; end if;
  return new;
 end if;
 if tg_op='UPDATE' and new.production_extra_id is not null then raise exception 'Không được ghép nguồn cộng thêm vào điều chỉnh có sẵn.'; end if;
 if tg_op='INSERT' and new.production_extra_id is not null then
  select * into source from local_production_planned_extras where id=new.production_extra_id for update;
  select * into period from local_payroll_periods where id=new.period_id;
  if source.id is null or source.status<>'PLANNED' or new.amount<>source.planned_amount or new.amount<=0
     or new.item_type<>'MANUAL_ADJUSTMENT' or new.item_direction<>'EARNING' or new.status<>'SUBMITTED'
     or new.production_extra_work_date is null or new.production_extra_work_date not between period.period_start and period.period_end
     or new.idempotency_key is distinct from 'production-extra:'||source.id::text
     or new.source_reference is distinct from 'production-extra:'||source.id::text
     or new.submitted_by is null or new.submitted_at is null
  then raise exception 'Nguồn, số tiền hoặc kỳ lương cộng thêm không hợp lệ.'; end if;
 elsif tg_op<>'DELETE' and (new.source_reference like 'production-extra:%' or new.idempotency_key like 'production-extra:%') then
  raise exception 'Tiền công sản xuất phải được ghi từ dòng cộng thêm có liên kết nguồn.';
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger production_extra_payroll_source_guard before insert or update or delete on local_payroll_adjustments
 for each row execute function protect_production_extra_payroll_source();
revoke all on function protect_production_extra_payroll_source() from public;
