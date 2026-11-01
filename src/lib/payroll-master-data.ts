import { supabase } from "@/integrations/supabase/client";
import type {
  BankAccountStatus,
  CompensationType,
  PayrollCapability,
  PayrollBankAccount,
  PayrollPolicyGroup,
  PayrollTeamAssignment,
  PayrollProduct,
  PayrollStatus,
  PayrollWorker,
  PayrollVersionStatus,
  PieceRateUnit,
  ProductPieceRateVersion,
  SocialInsuranceVersion,
  WorkerCompensationAssignment,
  WorkerCompensationRate,
  WorkerPayrollProfile,
} from "@/integrations/supabase/production-execution-types";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";
import type {LocalProductRateCreate,LocalProductRateUpdate,LocalProductRateAction} from '@/lib/product-rate-authoring-types';

// Local authoring is closed and exact. These adapters never fetch a newer basis.
export const createLocalProductPieceRateDraft=(input:LocalProductRateCreate)=>localApi.createProductRate(input);
export const updateLocalProductPieceRateDraft=(id:string,input:LocalProductRateUpdate)=>localApi.updateProductRate(id,input);
export const approveLocalProductPieceRate=(id:string,input:LocalProductRateAction)=>localApi.approveProductRate(id,input);
export const discardLocalProductPieceRateDraft=(id:string,input:LocalProductRateAction)=>localApi.discardProductRate(id,input);

export type {
  BankAccountStatus,
  CompensationType,
  PayrollCapability,
  PayrollBankAccount,
  PayrollPolicyGroup,
  PayrollTeamAssignment,
  PayrollProduct,
  PayrollStatus,
  PayrollWorker,
  PayrollVersionStatus,
  PieceRateUnit,
  ProductPieceRateVersion,
  SocialInsuranceVersion,
  WorkerCompensationAssignment,
  WorkerCompensationRate,
  WorkerPayrollProfile,
};

function asObject<T>(value: unknown, label: string): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} trả về dữ liệu không hợp lệ`);
  }
  return value as T;
}

export async function listPayrollWorkers(includeInactive = false): Promise<PayrollWorker[]> {
  if (isLocalBackend()) return localApi.payrollWorkers(includeInactive) as unknown as Promise<PayrollWorker[]>;
  const { data, error } = await supabase.rpc("list_payroll_workers", { p_include_inactive: includeInactive });
  if (error) throw error;
  return data ?? [];
}

export async function listPayrollCapabilities(userId?: string | null): Promise<PayrollCapability[]> {
  if (isLocalBackend()) return localApi.payrollCapabilities(userId) as unknown as Promise<PayrollCapability[]>;
  const { data, error } = await supabase.rpc("list_payroll_capabilities", {});
  if (error) throw error;
  return data ?? [];
}

export async function updatePayrollWorkerMaster(input: {
  worker_id: string;
  location_code?: string | null;
  position_title?: string | null;
  employment_start_date?: string | null;
  employment_end_date?: string | null;
  payroll_status?: PayrollStatus;
  reason: string;
}): Promise<PayrollWorker> {
  if (isLocalBackend()) return localApi.updatePayrollWorker(input.worker_id, input) as unknown as Promise<PayrollWorker>;
  const { data, error } = await supabase.rpc("update_payroll_worker_master", {
    p_worker_id: input.worker_id,
    p_location_code: input.location_code ?? null,
    p_position_title: input.position_title ?? null,
    p_employment_type: null,
    p_employment_start_date: input.employment_start_date ?? null,
    p_employment_end_date: input.employment_end_date ?? null,
    p_payroll_status: input.payroll_status ?? "ACTIVE",
    p_reason: input.reason,
  });
  if (error) throw error;
  return asObject<PayrollWorker>(data, "Hồ sơ nhân sự");
}

export async function listPayrollTeamAssignments(filters: {
  supervisor_worker_id?: string | null;
  worker_id?: string | null;
  on_date?: string | null;
} = {}): Promise<PayrollTeamAssignment[]> {
  if (isLocalBackend()) return localApi.payrollTeamAssignments({ supervisorWorkerId: filters.supervisor_worker_id, workerId: filters.worker_id, onDate: filters.on_date }) as unknown as Promise<PayrollTeamAssignment[]>;
  const { data, error } = await supabase.rpc("list_payroll_team_assignments", {
    p_supervisor_worker_id: filters.supervisor_worker_id ?? null,
    p_worker_id: filters.worker_id ?? null,
    p_on_date: filters.on_date ?? null,
  });
  if (error) throw error;
  return data ?? [];
}

export async function createPayrollTeamAssignment(input: {
  supervisor_worker_id: string;
  worker_id: string;
  effective_from: string;
  effective_to?: string | null;
  reason: string;
}): Promise<PayrollTeamAssignment> {
  if (isLocalBackend()) return localApi.createPayrollTeamAssignment(input) as unknown as Promise<PayrollTeamAssignment>;
  const { data, error } = await supabase.rpc("create_payroll_team_assignment", {
    p_supervisor_worker_id: input.supervisor_worker_id,
    p_worker_id: input.worker_id,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to ?? null,
    p_reason: input.reason,
  });
  if (error) throw error;
  return asObject<PayrollTeamAssignment>(data, "Phân công tổ");
}

export async function retirePayrollTeamAssignment(
  id: string,
  effectiveTo: string,
  reason: string,
): Promise<PayrollTeamAssignment> {
  if (isLocalBackend()) return localApi.retirePayrollTeamAssignment(id, { effective_to: effectiveTo, reason }) as unknown as Promise<PayrollTeamAssignment>;
  const { data, error } = await supabase.rpc("retire_payroll_team_assignment", {
    p_assignment_id: id,
    p_effective_to: effectiveTo,
    p_reason: reason,
  });
  if (error) throw error;
  return asObject<PayrollTeamAssignment>(data, "Phân công tổ");
}

export async function listPayrollPolicyGroups(): Promise<PayrollPolicyGroup[]> {
  if (isLocalBackend()) return localApi.payrollPolicyGroups() as unknown as Promise<PayrollPolicyGroup[]>;
  const { data, error } = await supabase.rpc("list_payroll_policy_groups", {});
  if (error) throw error;
  return data ?? [];
}

export async function upsertPayrollPolicyGroup(input: {
  code: string; name: string; description?: string | null; is_active?: boolean; reason: string;
}): Promise<PayrollPolicyGroup> {
  if (isLocalBackend()) return localApi.upsertPayrollPolicyGroup(input) as unknown as Promise<PayrollPolicyGroup>;
  const { data, error } = await supabase.rpc("upsert_payroll_policy_group", {
    p_code: input.code,
    p_name: input.name,
    p_description: input.description ?? null,
    p_is_active: input.is_active ?? true,
    p_reason: input.reason,
  });
  if (error) throw error;
  return asObject<PayrollPolicyGroup>(data, "Nhóm chính sách lương");
}

export async function listWorkerCompensationAssignments(workerId?: string | null): Promise<WorkerCompensationAssignment[]> {
  if (isLocalBackend()) return localApi.payrollCompensationAssignments(workerId) as unknown as Promise<WorkerCompensationAssignment[]>;
  const { data, error } = await supabase.rpc("list_worker_compensation_assignments", { p_worker_id: workerId ?? null });
  if (error) throw error;
  return data ?? [];
}

export async function listWorkerPayrollRates(workerId?: string | null): Promise<WorkerCompensationRate[]> {
  if (isLocalBackend()) return localApi.payrollRates(workerId);
  const { data, error } = await supabase.rpc("list_worker_compensation_rates", {
    p_worker_id: workerId ?? null,
  });
  if (error) throw error;
  return data ?? [];
}

type WorkerPayrollRateInput = {
  worker_id: string;
  compensation_type: CompensationType;
  effective_from: string;
  effective_to?: string | null;
  hourly_rate?: number | null;
  piece_rate?: number | null;
  monthly_rate?: number | null;
  monthly_productive_minutes?: number | null;
  source_reference?: string | null;
  reason: string;
  is_estimated?: boolean;
};

export async function createWorkerPayrollRateDraft(input: WorkerPayrollRateInput): Promise<WorkerCompensationRate> {
  if (isLocalBackend()) return localApi.createPayrollRate({ ...input, status: "DRAFT" });
  const { data, error } = await supabase.rpc("create_worker_payroll_rate_draft", {
    p_worker_id: input.worker_id,
    p_compensation_type: input.compensation_type,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to ?? null,
    p_hourly_rate: input.hourly_rate ?? null,
    p_piece_rate: input.piece_rate ?? null,
    p_monthly_rate: input.monthly_rate ?? null,
    p_monthly_productive_minutes: input.monthly_productive_minutes ?? null,
    p_source_reference: input.source_reference ?? null,
    p_reason: input.reason,
    p_is_estimated: input.is_estimated ?? false,
  });
  if (error) throw error;
  return asObject<WorkerCompensationRate>(data, "Mức lương nhân sự");
}

export async function updateWorkerPayrollRateDraft(
  input: Omit<WorkerPayrollRateInput, "worker_id" | "compensation_type"> & { id: string },
): Promise<WorkerCompensationRate> {
  if (isLocalBackend()) return localApi.updatePayrollRate(input.id, input) as unknown as Promise<WorkerCompensationRate>;
  const { data, error } = await supabase.rpc("update_worker_payroll_rate_draft", {
    p_rate_id: input.id,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to ?? null,
    p_hourly_rate: input.hourly_rate ?? null,
    p_piece_rate: input.piece_rate ?? null,
    p_monthly_rate: input.monthly_rate ?? null,
    p_monthly_productive_minutes: input.monthly_productive_minutes ?? null,
    p_source_reference: input.source_reference ?? null,
    p_reason: input.reason,
    p_is_estimated: input.is_estimated ?? false,
  });
  if (error) throw error;
  return asObject<WorkerCompensationRate>(data, "Mức lương nhân sự");
}

export async function approveWorkerPayrollRate(id: string, reason: string): Promise<WorkerCompensationRate> {
  if (isLocalBackend()) return localApi.approvePayrollRate(id, { reason }) as unknown as Promise<WorkerCompensationRate>;
  const { data, error } = await supabase.rpc("approve_worker_payroll_rate", {
    p_rate_id: id,
    p_reason: reason,
    p_supersede_previous: true,
  });
  if (error) throw error;
  return asObject<WorkerCompensationRate>(data, "Mức lương nhân sự");
}

export async function discardWorkerPayrollRateDraft(id: string, reason: string): Promise<WorkerCompensationRate> {
  if (isLocalBackend()) return localApi.discardPayrollRate(id, { reason }) as unknown as Promise<WorkerCompensationRate>;
  const { data, error } = await supabase.rpc("discard_worker_payroll_rate_draft", {
    p_rate_id: id,
    p_reason: reason,
  });
  if (error) throw error;
  return asObject<WorkerCompensationRate>(data, "Mức lương nhân sự");
}

export async function createWorkerCompensationAssignment(input: {
  worker_id: string; compensation_type: CompensationType; payroll_policy_group_id: string;
  effective_from: string; effective_to?: string | null; reason: string;
}): Promise<WorkerCompensationAssignment> {
  if (isLocalBackend()) return localApi.createPayrollCompensationAssignment(input) as unknown as Promise<WorkerCompensationAssignment>;
  const { data, error } = await supabase.rpc("create_worker_compensation_assignment", {
    p_worker_id: input.worker_id,
    p_compensation_type: input.compensation_type,
    p_payroll_policy_group_id: input.payroll_policy_group_id,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to ?? null,
    p_reason: input.reason,
  });
  if (error) throw error;
  return asObject<WorkerCompensationAssignment>(data, "Phân loại lương");
}

export async function approveWorkerCompensationAssignment(id: string, reason: string) {
  if (isLocalBackend()) return localApi.approvePayrollCompensationAssignment(id, { reason }) as unknown as Promise<WorkerCompensationAssignment>;
  const { data, error } = await supabase.rpc("approve_worker_compensation_assignment", {
    p_assignment_id: id, p_reason: reason, p_supersede_previous: true,
  });
  if (error) throw error;
  return asObject<WorkerCompensationAssignment>(data, "Phân loại lương");
}

export async function updateWorkerCompensationAssignmentDraft(input: {
  id: string; compensation_type: CompensationType; payroll_policy_group_id: string;
  effective_from: string; effective_to?: string | null; reason: string;
}): Promise<WorkerCompensationAssignment> {
  if (isLocalBackend()) return localApi.updatePayrollCompensationAssignment(input.id, input) as unknown as Promise<WorkerCompensationAssignment>;
  const { data, error } = await supabase.rpc("update_worker_compensation_assignment_draft", {
    p_assignment_id: input.id,
    p_compensation_type: input.compensation_type,
    p_payroll_policy_group_id: input.payroll_policy_group_id,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to ?? null,
    p_reason: input.reason,
  });
  if (error) throw error;
  return asObject<WorkerCompensationAssignment>(data, "Phân loại lương");
}

export async function discardWorkerCompensationAssignmentDraft(id: string, reason: string) {
  if (isLocalBackend()) return localApi.discardPayrollCompensationAssignment(id, { reason }) as unknown as Promise<WorkerCompensationAssignment>;
  const { data, error } = await supabase.rpc("discard_worker_compensation_assignment_draft", {
    p_assignment_id: id,
    p_reason: reason,
  });
  if (error) throw error;
  return asObject<WorkerCompensationAssignment>(data, "Phân loại lương");
}

export type WorkerPayrollProfileInput = {
  worker_id: string;
  piece_output_enabled: boolean;
  overtime_enabled: boolean;
  meal_enabled: boolean;
  allowances_enabled: boolean;
  deductions_enabled: boolean;
  insurance_enabled: boolean;
  fixed_allowance_amount: number;
  fixed_deduction_amount: number;
  effective_from: string;
  effective_to?: string | null;
  source_reference?: string | null;
  reason: string;
  idempotency_key: string;
};

export type WorkerPayrollBundleInput = Omit<WorkerPayrollProfileInput,"insurance_enabled"> & {
  insurance_enabled?: boolean;
  selected_drafts?: {assignment_id?:string|null;profile_id?:string|null;rate_id?:string|null;insurance_id?:string|null};
  location_code?: string | null;
  position_title?: string | null;
  employment_start_date?: string | null;
  employment_end_date?: string | null;
  payroll_status?: PayrollStatus;
  compensation_type: CompensationType;
  payroll_policy_group_id: string;
  primary_amount: number | null;
  monthly_productive_minutes?: number | null;
  insurance_amount?: number | null;
  insurance_source_reference?: string | null;
};

const localProfilesOnly = () => {
  if (!isLocalBackend()) throw new Error("Hồ sơ nguồn lương tập trung hiện chỉ khả dụng trên SQL cục bộ.");
};

export async function listWorkerPayrollProfiles(workerId?: string | null): Promise<WorkerPayrollProfile[]> {
  localProfilesOnly();
  return localApi.workerPayrollProfiles(workerId);
}

export async function createWorkerPayrollProfileDraft(input: WorkerPayrollProfileInput): Promise<WorkerPayrollProfile> {
  localProfilesOnly();
  return localApi.createWorkerPayrollProfile(input);
}

export async function saveWorkerPayrollBundle(input: WorkerPayrollBundleInput): Promise<Record<string, unknown>> {
  localProfilesOnly();
  return localApi.saveWorkerPayrollBundle(input as unknown as Record<string, unknown>);
}

export async function updateWorkerPayrollProfileDraft(input: Omit<WorkerPayrollProfileInput, "worker_id" | "idempotency_key"> & { id: string }): Promise<WorkerPayrollProfile> {
  localProfilesOnly();
  return localApi.updateWorkerPayrollProfile(input.id, input);
}

export async function approveWorkerPayrollProfile(id: string, reason: string): Promise<WorkerPayrollProfile> {
  localProfilesOnly();
  return localApi.approveWorkerPayrollProfile(id, { reason });
}

export async function discardWorkerPayrollProfileDraft(id: string, reason: string): Promise<WorkerPayrollProfile> {
  localProfilesOnly();
  return localApi.discardWorkerPayrollProfile(id, { reason });
}

export async function listPayrollProducts(search?: string): Promise<PayrollProduct[]> {
  if (isLocalBackend()) return localApi.payrollProducts() as unknown as Promise<PayrollProduct[]>;
  const { data, error } = await supabase.rpc("list_payroll_products_v2", { p_search: search?.trim() || null });
  if (error) throw error;
  return data ?? [];
}

export async function listProductPieceRates(productId?: string | null): Promise<ProductPieceRateVersion[]> {
  if (isLocalBackend()) return localApi.payrollProductRates(productId) as unknown as Promise<ProductPieceRateVersion[]>;
  const { data, error } = await supabase.rpc("list_product_piece_rates", { p_product_id: productId ?? null });
  if (error) throw error;
  return data ?? [];
}

export async function createProductPieceRateDraft(input: {
  product_id?: string | null; piece_rate_code: string; piece_rate_name?: string | null;
  rate: number; effective_from: string; effective_to?: string | null;
  unit?: PieceRateUnit; reason: string; source_reference?: string | null;
}): Promise<ProductPieceRateVersion> {
  if (isLocalBackend()) throw new Error('Dùng biểu mẫu đơn giá local có chuỗi giá và mã thao tác.');
  const { data, error } = await supabase.rpc("create_product_piece_rate_draft", {
    p_product_id: input.product_id || "",
    p_rate: input.rate,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to ?? null,
    p_unit: input.unit ?? "PIECE",
    p_reason: input.reason,
    p_source_reference: input.source_reference ?? null,
  });
  if (error) throw error;
  return asObject<ProductPieceRateVersion>(data, "Đơn giá sản phẩm");
}

export async function approveProductPieceRate(id: string, reason: string) {
  if (isLocalBackend()) throw new Error('Dùng thao tác duyệt local có phiên bản nguồn và mã thao tác.');
  const { data, error } = await supabase.rpc("approve_product_piece_rate", {
    p_rate_version_id: id, p_reason: reason, p_supersede_previous: true,
  });
  if (error) throw error;
  return asObject<ProductPieceRateVersion>(data, "Đơn giá sản phẩm");
}

export async function updateProductPieceRateDraft(input: {
  id: string; product_id?: string | null; piece_rate_code?: string | null; piece_rate_name?: string | null;
  rate: number; effective_from: string; effective_to?: string | null;
  unit?: PieceRateUnit; source_reference?: string | null; reason: string;
}): Promise<ProductPieceRateVersion> {
  if (isLocalBackend()) throw new Error('Dùng biểu mẫu đơn giá local có chuỗi giá và phiên bản nguồn.');
  const { data, error } = await supabase.rpc("update_product_piece_rate_draft", {
    p_rate_version_id: input.id,
    p_rate: input.rate,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to ?? null,
    p_unit: input.unit ?? "PIECE",
    p_source_reference: input.source_reference ?? null,
    p_reason: input.reason,
  });
  if (error) throw error;
  return asObject<ProductPieceRateVersion>(data, "Đơn giá sản phẩm");
}

export async function discardProductPieceRateDraft(id: string, reason: string) {
  if (isLocalBackend()) throw new Error('Dùng thao tác hủy local có phiên bản nguồn và mã thao tác.');
  const { data, error } = await supabase.rpc("discard_product_piece_rate_draft", {
    p_rate_version_id: id,
    p_reason: reason,
  });
  if (error) throw error;
  return asObject<ProductPieceRateVersion>(data, "Đơn giá sản phẩm");
}

export async function listSocialInsuranceVersions(workerId?: string | null): Promise<SocialInsuranceVersion[]> {
  if (isLocalBackend()) return localApi.payrollInsurance(workerId) as unknown as Promise<SocialInsuranceVersion[]>;
  const { data, error } = await supabase.rpc("list_social_insurance_versions", { p_worker_id: workerId ?? null });
  if (error) throw error;
  return data ?? [];
}

export async function createSocialInsuranceDraft(input: {
  worker_id: string; employee_amount: number; effective_from: string; effective_to?: string | null;
  source_reference: string; reason: string;
}): Promise<SocialInsuranceVersion> {
  if (isLocalBackend()) return localApi.createPayrollInsurance(input) as unknown as Promise<SocialInsuranceVersion>;
  const { data, error } = await supabase.rpc("create_social_insurance_draft", {
    p_worker_id: input.worker_id,
    p_employee_amount: input.employee_amount,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to ?? null,
    p_source_reference: input.source_reference,
    p_reason: input.reason,
  });
  if (error) throw error;
  return asObject<SocialInsuranceVersion>(data, "BHXH");
}

export async function approveSocialInsuranceVersion(id: string, reason: string) {
  if (isLocalBackend()) return localApi.approvePayrollInsurance(id, { reason }) as unknown as Promise<SocialInsuranceVersion>;
  const { data, error } = await supabase.rpc("approve_social_insurance_version", {
    p_version_id: id, p_reason: reason, p_supersede_previous: true,
  });
  if (error) throw error;
  return asObject<SocialInsuranceVersion>(data, "BHXH");
}

export async function updateSocialInsuranceDraft(input: {
  id: string; employee_amount: number; effective_from: string; effective_to?: string | null;
  source_reference: string; reason: string;
}): Promise<SocialInsuranceVersion> {
  if (isLocalBackend()) return localApi.updatePayrollInsurance(input.id, input) as unknown as Promise<SocialInsuranceVersion>;
  const { data, error } = await supabase.rpc("update_social_insurance_draft", {
    p_version_id: input.id,
    p_employee_amount: input.employee_amount,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to ?? null,
    p_source_reference: input.source_reference,
    p_reason: input.reason,
  });
  if (error) throw error;
  return asObject<SocialInsuranceVersion>(data, "BHXH");
}

export async function discardSocialInsuranceDraft(id: string, reason: string) {
  if (isLocalBackend()) return localApi.discardPayrollInsurance(id, { reason }) as unknown as Promise<SocialInsuranceVersion>;
  const { data, error } = await supabase.rpc("discard_social_insurance_draft", {
    p_version_id: id,
    p_reason: reason,
  });
  if (error) throw error;
  return asObject<SocialInsuranceVersion>(data, "BHXH");
}

export async function listWorkerBankAccounts(workerId?: string | null): Promise<PayrollBankAccount[]> {
  if (isLocalBackend()) return localApi.payrollBankAccounts(workerId) as unknown as Promise<PayrollBankAccount[]>;
  const { data, error } = await supabase.rpc("list_worker_bank_accounts", { p_worker_id: workerId ?? null });
  if (error) throw error;
  return data ?? [];
}

export async function createBankAccountDraft(input: {
  worker_id: string; account_number: string; account_name: string; bank_name: string;
  bank_code?: string | null; is_primary?: boolean; effective_from: string;
  effective_to?: string | null; source_reference?: string | null; reason: string;
}): Promise<PayrollBankAccount> {
  if (isLocalBackend()) return localApi.createPayrollBankAccount(input) as unknown as Promise<PayrollBankAccount>;
  const { data, error } = await supabase.rpc("create_bank_account_draft", {
    p_worker_id: input.worker_id,
    p_account_number: input.account_number,
    p_account_name: input.account_name,
    p_bank_name: input.bank_name,
    p_bank_code: input.bank_code ?? null,
    p_is_primary: input.is_primary ?? true,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to ?? null,
    p_source_reference: input.source_reference ?? null,
    p_reason: input.reason,
  });
  if (error) throw error;
  return asObject<PayrollBankAccount>(data, "Tài khoản nhận lương");
}

export async function verifyBankAccount(id: string, reason: string) {
  if (isLocalBackend()) return localApi.verifyPayrollBankAccount(id, { reason }) as unknown as Promise<PayrollBankAccount>;
  const { data, error } = await supabase.rpc("verify_bank_account", {
    p_bank_account_id: id, p_reason: reason, p_supersede_previous: true,
  });
  if (error) throw error;
  return asObject<PayrollBankAccount>(data, "Tài khoản nhận lương");
}

export async function updateBankAccountDraft(input: {
  id: string; account_number: string; account_name: string; bank_name: string;
  bank_code?: string | null; is_primary?: boolean; effective_from: string;
  effective_to?: string | null; source_reference?: string | null; reason: string;
}): Promise<PayrollBankAccount> {
  if (isLocalBackend()) return localApi.updatePayrollBankAccount(input.id, input) as unknown as Promise<PayrollBankAccount>;
  const { data, error } = await supabase.rpc("update_bank_account_draft", {
    p_bank_account_id: input.id,
    p_account_number: input.account_number,
    p_account_name: input.account_name,
    p_bank_name: input.bank_name,
    p_bank_code: input.bank_code ?? null,
    p_is_primary: input.is_primary ?? true,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to ?? null,
    p_source_reference: input.source_reference ?? null,
    p_reason: input.reason,
  });
  if (error) throw error;
  return asObject<PayrollBankAccount>(data, "Tài khoản nhận lương");
}

export async function discardBankAccountDraft(id: string, reason: string) {
  if (isLocalBackend()) return localApi.discardPayrollBankAccount(id, { reason }) as unknown as Promise<PayrollBankAccount>;
  const { data, error } = await supabase.rpc("discard_bank_account_draft", {
    p_bank_account_id: id,
    p_reason: reason,
  });
  if (error) throw error;
  return asObject<PayrollBankAccount>(data, "Tài khoản nhận lương");
}
