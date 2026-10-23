\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('98000000-0000-0000-0000-000000000001','permission-admin@fixture.invalid'),
 ('98000000-0000-0000-0000-000000000002','permission-manager@fixture.invalid'),
 ('98000000-0000-0000-0000-000000000003','permission-employee@fixture.invalid'),
 ('98000000-0000-0000-0000-000000000004','permission-foreign@fixture.invalid'),
 ('98000000-0000-0000-0000-000000000005','permission-accountant@fixture.invalid');
INSERT INTO public.user_roles(user_id,role,assigned_by) VALUES
 ('98000000-0000-0000-0000-000000000001','admin',NULL),
 ('98000000-0000-0000-0000-000000000002','manager','98000000-0000-0000-0000-000000000001'),
 ('98000000-0000-0000-0000-000000000003','employee','98000000-0000-0000-0000-000000000002'),
 ('98000000-0000-0000-0000-000000000004','employee','98000000-0000-0000-0000-000000000001'),
 ('98000000-0000-0000-0000-000000000005','accountant','98000000-0000-0000-0000-000000000001');
INSERT INTO public.employee_permissions(user_id,permission_type,enabled) VALUES
 ('98000000-0000-0000-0000-000000000003','production_view',true),
 ('98000000-0000-0000-0000-000000000003','legacy_hidden_permission',true);

DO $$ BEGIN
 IF has_function_privilege('anon','public.patch_employee_permissions(uuid,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'anon has patch permission'; END IF;
 IF NOT has_function_privilege('authenticated','public.patch_employee_permissions(uuid,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'authenticated missing patch permission'; END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE fixture record; allowed text[];
BEGIN
 FOR fixture IN SELECT * FROM (VALUES
  ('98000000-0000-0000-0000-000000000001',ARRAY['payroll_audit','payroll_bank_manage','payroll_insurance_manage','payroll_policy_manage','payroll_rate_manage','payroll_rate_view','payroll_team_view','payroll_view','payroll_worker_manage']),
  ('98000000-0000-0000-0000-000000000002',ARRAY['payroll_audit','payroll_policy_manage','payroll_rate_manage','payroll_rate_view','payroll_team_view','payroll_view','payroll_worker_manage']),
  ('98000000-0000-0000-0000-000000000005',ARRAY['payroll_audit','payroll_bank_manage','payroll_insurance_manage','payroll_rate_view','payroll_view']),
  ('98000000-0000-0000-0000-000000000003',ARRAY[]::text[])
 ) f(user_id,expected) LOOP
  PERFORM set_config('request.jwt.claim.sub',fixture.user_id,true);
  SELECT array_agg(permission_type ORDER BY permission_type) FILTER(WHERE c.allowed) INTO allowed FROM public.list_payroll_capabilities() c;
  IF coalesce(allowed,ARRAY[]::text[]) <> fixture.expected THEN RAISE EXCEPTION 'public capability mismatch for %: %',fixture.user_id,allowed; END IF;
 END LOOP;
END $$;
SELECT set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000002',true);
SELECT public.patch_employee_permissions('98000000-0000-0000-0000-000000000003','[{"permission_type":"orders","enabled":true}]','Kiểm thử patch');
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.employee_permissions WHERE user_id='98000000-0000-0000-0000-000000000003' AND enabled) <> 3 THEN RAISE EXCEPTION 'patch destroyed omitted grants'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_events WHERE entity_type='employee_permissions' AND entity_id='98000000-0000-0000-0000-000000000003' AND actor_id='98000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'patch missing caller audit'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT public.patch_employee_permissions('98000000-0000-0000-0000-000000000003','[{"permission_type":"orders","enabled":false}]','Thu hồi đúng mục');
DO $$
DECLARE payload jsonb; accepted boolean;
BEGIN
 FOR payload IN SELECT value FROM jsonb_array_elements('[null,{},[{"permission_type":"orders"}],[{"permission_type":"orders","enabled":null}],[{"permission_type":"orders","enabled":"false"}],[{"permission_type":"unknown","enabled":true}],[{"permission_type":"orders","enabled":true},{"permission_type":"orders","enabled":false}],[{"permission_type":"orders","enabled":true},{"permission_type":"customers"}]]'::jsonb) LOOP
  accepted := false;
  BEGIN
   PERFORM public.patch_employee_permissions('98000000-0000-0000-0000-000000000003',payload,'Phải thất bại');
   accepted := true;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF accepted THEN RAISE EXCEPTION 'malformed patch accepted: %',payload; END IF;
 END LOOP;
END $$;
DO $$
DECLARE target uuid; accepted boolean;
BEGIN
 FOREACH target IN ARRAY ARRAY['98000000-0000-0000-0000-000000000004'::uuid,'98000000-0000-0000-0000-000000000005'::uuid,'98000000-0000-0000-0000-000000000001'::uuid] LOOP
  accepted := false;
  BEGIN
   PERFORM public.patch_employee_permissions(target,'[{"permission_type":"orders","enabled":true}]','Ngoài phạm vi');
   accepted := true;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF accepted THEN RAISE EXCEPTION 'manager modified forbidden target %',target; END IF;
 END LOOP;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.employee_permissions WHERE user_id='98000000-0000-0000-0000-000000000003' AND permission_type='orders' AND enabled) THEN RAISE EXCEPTION 'invalid batch partially mutated orders'; END IF;
 IF (SELECT count(*) FROM public.employee_permissions WHERE user_id='98000000-0000-0000-0000-000000000003' AND enabled) <> 2 THEN RAISE EXCEPTION 'revoke/invalid patch damaged omitted grants'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE permission text; accepted boolean;
BEGIN
 FOREACH permission IN ARRAY ARRAY['payroll_rate_manage','payroll_policy_manage','payroll_bank_manage','payroll_insurance_manage'] LOOP
  accepted := false;
  BEGIN
   PERFORM public.patch_employee_permissions('98000000-0000-0000-0000-000000000003',jsonb_build_array(jsonb_build_object('permission_type',permission,'enabled',true)),'Không được nâng quyền');
   accepted := true;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF accepted THEN RAISE EXCEPTION 'sensitive payroll delegated %',permission; END IF;
 END LOOP;
END $$;
-- Legacy clients still send complete lists. Their original replacement contract
-- must remain intact when the new patch API is introduced.
SELECT public.replace_employee_permissions('98000000-0000-0000-0000-000000000003','[{"permission_type":"customers","enabled":true}]','Kiểm tra tương thích bản cũ');
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.employee_permissions WHERE user_id='98000000-0000-0000-0000-000000000003') <> 1 OR NOT EXISTS(SELECT 1 FROM public.employee_permissions WHERE user_id='98000000-0000-0000-0000-000000000003' AND permission_type='customers' AND enabled) THEN RAISE EXCEPTION 'legacy replacement contract changed'; END IF;
END $$;
ROLLBACK;
\echo permission_patch_consistency_test: PASS
