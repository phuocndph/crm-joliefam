export type GhnEditResult = { attemptId: string; info: { status: string }; cod: { status: string }; snapshotSynced: boolean };
import type { QuoteQueryOptions } from '@/lib/quote-filters';
import type {ProductRateQuote,ProductRateQuoteRequest} from '@/lib/product-rate-quote-types';
import type {LocalProductRateRow,LocalProductRateCreate,LocalProductRateUpdate,LocalProductRateAction} from '@/lib/product-rate-authoring-types';
import type { ProductSupplyPage, ProductSupplyDecision, ProductSupplyHistory } from '@/lib/product-supply-types';
import type {TechnicalProduct,TechnicalProfileDetail,TechnicalProfileInput,TechnicalProfileSaved,TechnicalProfileHistory} from '@/lib/product-technical-types';
import type {LaborCode,LaborResolution,LaborDecisionInput,LaborDecisionVersion} from '@/lib/product-labor-types';
import type {
  AttendanceMethod,
  AttendanceWorkflowStatus,
  FactoryAttendanceClosureRow,
  FactoryAttendanceDayStatus,
  FactoryAttendanceDayStatusRow,
  FactoryAttendanceHistoryRow,
  FactoryAttendanceRow,
  FactoryOvertimeRow,
  OvertimeType,
  ProductionAttendanceRow,
  ProductionEntryProduct,
  ProductionEntryRow,
  ProductionOrderWorkerAssignment,
  ProductionWorker,
  PayrollAdjustment,
  WorkerAttendanceMethod,
  WorkerCompensationProfile,
  WorkerCompensationRate,
  WorkerPayrollProfile,
} from "@/integrations/supabase/production-execution-types";
import type {
  InventoryAuditEvent,
  InventoryBalance,
  InventoryBusinessTransaction,
  InventoryDocument,
  InventoryDocumentLineInput,
  InventoryDocumentType,
  InventoryItem,
  InventoryMovement,
  InventoryReconciliation,
  InventoryReturnSource,
  InventoryWarehouse,
  ProductionOrderForIssue,
} from "@/lib/inventory-management";
import { localApiUrl } from "./runtime-config";
import { localFetch,type LocalAuthGuard } from "./local-auth";

export interface LocalWorkerLinkResponse {
  user_id: string;
  worker: {
    worker_id: string;
    employee_code: string;
    worker_name?: string;
    display_name?: string;
    worker_type: string;
    is_active: boolean;
  } | null;
}

export type SelfPayrollMonth = {
  month:string;status:'PREVIEW'|'LOCKED'|'BLOCKED';calculated_at:string;
  amounts:{gross:string;deductions:string;net:string;payment:string}|null;
  items:Array<{item_type:string;item_direction:'EARNING'|'DEDUCTION';quantity:string;unit_rate:string;multiplier:string;amount_precise:string;formula:string}>;
  pending_count:number;pending_message:string|null;issues:Array<{code:string;message:string}>;
};

export interface LocalProfileRequest {
  user_id: string; email: string; first_name: string | null; last_name: string | null; phone: string | null;
  profile_data: Record<string, unknown>; revision: string; status: string; submitted_at: string | null;
}
export interface LocalProfileReviewRequest {
  decision: "APPROVED" | "NEEDS_INFO"; expected_revision: string; note?: string; worker_id?: string;
}
export interface QuoteCustomerCandidate { id: string; name: string; phone: string; email: string; address: string; is_active: boolean }
type LocalApiErrorDetails = { code: 'QUOTE_CUSTOMER_CONFLICT'; candidates: QuoteCustomerCandidate[] };
export class LocalApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly structuredResponse = true, public readonly details?: LocalApiErrorDetails) { super(message); this.name = "LocalApiError"; }
}
const quoteCustomerErrorDetails = (payload: unknown): LocalApiErrorDetails | undefined => {
  if (!payload || typeof payload !== 'object' || !('code' in payload) || payload.code !== 'QUOTE_CUSTOMER_CONFLICT') return undefined;
  const candidates = 'candidates' in payload && Array.isArray(payload.candidates) ? payload.candidates.slice(0,20).flatMap(row => {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || typeof row.name !== 'string') return [];
    const text = (key: string) => typeof row[key] === 'string' ? row[key].slice(0,2000) : '';
    return [{ id: row.id, name: row.name, phone: text('phone'), email: text('email'), address: text('address'), is_active: row.is_active !== false }];
  }) : [];
  return { code: 'QUOTE_CUSTOMER_CONFLICT', candidates };
};
export type GhnOrderAttempt = { attempt_status:'IN_FLIGHT'|'UNKNOWN'|'REMOTE_CREATED'|'SUCCESS'|'REJECTED'; reference:string; request_key:string; order_code?:string; total_fee?:number; expected_delivery_time?:string; message?:string };
export type LocalGoongSettings = { configured: boolean; source: 'server_env' | 'saved' | 'disabled'; mode: 'INHERIT_ENV' | 'ENABLED' | 'DISABLED'; revision: number; has_saved_key: boolean; provider: 'goong' };

export interface LocalSelfProfile {
  user_id: string;
  email: string;
  profile: Record<string, string | null>;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "NEEDS_INFO";
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  linked_worker: Record<string, unknown> | null;
}

export interface LocalCatalogProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  specifications: string | null;
  price: number | null;
  cost_price: number | null;
  in_stock: boolean;
  is_active: boolean;
  rate_unit: string;
  current_rate: number | null;
  current_rate_unit: string | null;
  current_rate_effective_from: string | null;
  price_list_id: string | null;
  tenant_id?: string | null;
  images?: unknown[];
  image_url?: string | null;
  is_snapshot_record?: boolean;
  created_at: string;
  updated_at: string;
}

export interface MyAttendanceContext {
  work_date: string;
  configured: boolean;
  mode: AttendanceMethod | "MIXED" | "MONTHLY" | null;
  primary_method: AttendanceMethod | null;
  methods: AttendanceMethod[];
  label: string;
  instructions: string;
  components: Array<{
    rate_id: string;
    compensation_type: string;
    attendance_method: AttendanceMethod;
    rate_amount: number | null;
    unit_basis: string;
    effective_from: string;
    effective_to: string | null;
    label: string;
  }>;
}

export interface LocalCustomer {
  id: string;
  customer_code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  company: string | null;
  notes: string | null;
  phones: Array<{ number: string; label?: string; isPrimary?: boolean }>;
  addresses: Array<{ address: string; label?: string; isPrimary?: boolean }>;
  tags: string[];
  auto_tags: string[];
  current_status: string | null;
  purchase_count: number;
  order_count: number;
  quote_count: number;
  total_spent: number;
  last_purchase_date: string | null;
  is_active: boolean;
  is_snapshot_record: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocalCustomerDetails {
  customer: LocalCustomer;
  orders: Array<Record<string, unknown>>;
  quotes: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
}

export interface LocalDashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  totalQuotes: number;
  totalProducts: number;
  pendingOrders: number;
  approvedQuotes: number;
  monthlyRevenue: number;
  previousMonthRevenue: number;
  monthlyOrders: number;
  monthlyCustomers: number;
  totalContracts: number;
  monthlyExpenses: number;
  activeWorkers: number;
  attendanceEntries: number;
  productionQuantity: number;
  inventoryValue: number;
  payrollRuns: number;
}

export interface LocalSyncRun {
  id: string;
  source: string;
  mode: string;
  status: string;
  requested_tables: string[] | null;
  table_stats: Record<string, unknown> | null;
  error_count: number;
  started_at: string;
  completed_at: string | null;
}

export type LocalAttendanceBulkWorkflowSourceType = "ATTENDANCE" | "PRODUCTION_ENTRY" | "OVERTIME";
export type LocalAttendanceBulkWorkflowTargetStatus = "APPROVED" | "REJECTED";

export interface AttendanceDaySummary {
  worker_id:string;work_date:string;current_revision:string;source_fingerprint:string;
  closure:(FactoryAttendanceClosureRow & {id:string})|null;day_status:string|null;day_status_reason:string|null;
  sources:Array<{source_type:string;id:string;status:string;facts:Record<string,unknown>;recorded_by:string|null;recorded_at:string|null}>;
  payroll_locked:boolean;confirmation_current:boolean;classified:boolean;
}
export interface AttendanceBulkPreview { scope:unknown;candidates:Array<{sourceType:string;id:string;workerId:string;workDate:string}>;counts:LocalAttendanceBulkWorkflowCounts;record_count:number;worker_day_count:number;fingerprint:string;ignored_filters:string[]; }
export interface LocalAttendanceBulkWorkflowInput {
  preview_fingerprint?: string;
  target_status: LocalAttendanceBulkWorkflowTargetStatus;
  reason?: string | null;
  month: string;
  worker_ids?: string[];
  source_types?: LocalAttendanceBulkWorkflowSourceType[];
  idempotency_key: string;
}

export interface LocalAttendanceBulkWorkflowCounts {
  ATTENDANCE: number;
  PRODUCTION_ENTRY: number;
  OVERTIME: number;
}

export interface LocalAttendanceBulkWorkflowResult {
  target_status: LocalAttendanceBulkWorkflowTargetStatus;
  scope: {
    month: string;
    worker_ids: string[] | null;
    source_types: LocalAttendanceBulkWorkflowSourceType[];
  };
  discovered: { count: number; by_source: LocalAttendanceBulkWorkflowCounts };
  eligible: { count: number; by_source: LocalAttendanceBulkWorkflowCounts };
  processed: { count: number; by_source: LocalAttendanceBulkWorkflowCounts };
  skipped: { count: number; by_source: LocalAttendanceBulkWorkflowCounts };
  reused: boolean;
}

type RequestOptions = { signal?:AbortSignal; authGuard?:LocalAuthGuard;method?: string; body?: unknown; query?: Record<string, string | number | boolean | null | undefined> };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const query = options.query
    ? Object.entries(options.query).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")
    : "";
  const response = await localFetch(`${localApiUrl()}${path}${query ? `?${query}` : ""}`, {
    signal:options.signal,
    method: options.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  },true,options.authGuard);
  const payload = await response.json().catch(() => ({}));
  options.authGuard?.assertCurrent();
  if (!response.ok) {
    const error = new LocalApiError(payload?.message || payload?.error || `Local API lỗi (${response.status})`, response.status,typeof (payload?.message || payload?.error)==='string', quoteCustomerErrorDetails(payload));
    if (typeof payload?.ghn_edit_not_dispatched === 'boolean') Object.assign(error, {ghnEditNotDispatched:payload.ghn_edit_not_dispatched});
    if (payload?.code === 'GHN_SERVICE_UNSUPPORTED') Object.assign(error,{code:'GHN_SERVICE_UNSUPPORTED'});
    throw error;
  }
  return payload as T;
}

/** Invoke an endpoint implemented by the local server instead of Supabase Edge Functions. */
async function localFunction<T>(name: string, body?: unknown, method = "POST", authGuard?:LocalAuthGuard): Promise<T> {
  return request<T>(`/api/local-functions/${encodeURIComponent(name)}`, {
    method,
    body: method === "GET" ? undefined : body ?? {},
    authGuard,
  });
}

const blobToDataUrl = async (file: Blob | ArrayBuffer): Promise<string> => {
  const blob = file instanceof Blob ? file : new Blob([file]);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Không thể đọc tệp local."));
    reader.readAsDataURL(blob);
  });
};

async function localStorageUpload(bucket: string, path: string, file: Blob | ArrayBuffer, upsert = false) {
  return request<{ path: string; bucket: string; size: number; contentType: string; publicUrl: string }>(
    `/api/local-storage/${encodeURIComponent(bucket)}/upload`,
    { method: "POST", body: { path, dataUrl: await blobToDataUrl(file), upsert } },
  );
}

async function localStorageRemove(bucket: string, paths: string[]) {
  return request<{ data: Array<{ name: string }>; error: null }>(
    `/api/local-storage/${encodeURIComponent(bucket)}`,
    { method: "DELETE", body: { paths } },
  );
}

export async function downloadLocalPayrollRunCsv(id: string): Promise<void> {
  const response = await localFetch(`${localApiUrl()}/api/payroll/runs/${encodeURIComponent(id)}/export.csv`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Local API lỗi (${response.status})`);
  }
  const disposition = response.headers.get("content-disposition") || "";
  const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || `payroll-${id}.csv`;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const localApi = {
  laborRequirementCoverage:(query:{date:string;search?:string;status?:string;offset?:number;limit?:number;review?:'SUBMITTED'})=>request<{rows:import('./product-labor-requirement-types').RequirementCoverageRow[];total:number;counts:Record<string,number>;date:string}>('/api/payroll/labor-code-requirements',{query}),
  laborRequirementInventory:(date:string)=>request<import('./product-labor-requirement-types').LaborCoverageInventory>('/api/payroll/labor-code-requirements/inventory',{query:{date}}),
  laborRequirementSchema:(version:1|2=1,authGuard?:LocalAuthGuard)=>request<import('./product-labor-requirement-types').RequirementAuthoringSchema>('/api/payroll/labor-code-requirements/schema',{query:{version},authGuard}),
  validateLaborRequirement:(body:{definition:import('./product-labor-requirement-types').LaborRequirementDefinition;semantic_fingerprint:string},authGuard?:LocalAuthGuard)=>request<{valid:true;definition:import('./product-labor-requirement-types').LaborRequirementDefinition;content_hash:string}>('/api/payroll/labor-code-requirements/validate',{method:'POST',body,authGuard}),
  laborRequirementDetail:(code:string,date:string,authGuard?:LocalAuthGuard)=>request<import('./product-labor-requirement-types').RequirementDetail>('/api/payroll/labor-code-requirements/code/'+encodeURIComponent(code),{query:{date},authGuard}),
  saveLaborRequirementProposal:(body:import('./product-labor-requirement-types').RequirementCommand,authGuard?:LocalAuthGuard)=>request<import('./product-labor-requirement-types').RequirementCommandResult>('/api/payroll/labor-code-requirements/proposals',{method:'POST',body,authGuard}),
  approveLaborRequirement:(body:import('./product-labor-requirement-types').RequirementCommand,authGuard?:LocalAuthGuard)=>request<import('./product-labor-requirement-types').RequirementCommandResult>('/api/payroll/labor-code-requirements/approve',{method:'POST',body,authGuard}),
  retireLaborRequirement:(body:import('./product-labor-requirement-types').RequirementCommand,authGuard?:LocalAuthGuard)=>request<import('./product-labor-requirement-types').RequirementCommandResult>('/api/payroll/labor-code-requirements/retire',{method:'POST',body,authGuard}),
  productSupplyClassifications: (query: {search?: string;status?: string;price_list_id?: string;offset?: number;limit?: number}) => request<ProductSupplyPage>('/api/product-supply-classifications',{query}),
  productSupplyClassification: (id:string) => request<import('./product-supply-types').ProductSupplyRow>('/api/product-supply-classifications/'+encodeURIComponent(id)),
  confirmProductSupplyClassifications: (body: {rows: ProductSupplyDecision[];reason: string;idempotency_key: string}) => request<{confirmed: Array<{product_id: string;version: number;route: string}>;reused: boolean}>('/api/product-supply-classifications/confirm',{method:'POST',body}),
  productSupplyHistory: (id: string) => request<ProductSupplyHistory[]>('/api/product-supply-classifications/'+encodeURIComponent(id)+'/history'),
  productTechnicalCatalog: (query:{search?:string;offset?:number;limit?:number}) => request<{rows:TechnicalProduct[];total:number}>('/api/product-technical-profiles/catalog',{query}),
  productTechnicalProfile: (id:string) => request<TechnicalProfileDetail>('/api/product-technical-profiles/'+encodeURIComponent(id)),
  saveProductTechnicalProfile: (id:string,body:TechnicalProfileInput) => request<TechnicalProfileSaved>('/api/product-technical-profiles/'+encodeURIComponent(id),{method:'PUT',body}),
  productTechnicalHistory: (id:string) => request<TechnicalProfileHistory[]>('/api/product-technical-profiles/'+encodeURIComponent(id)+'/history'),
  laborMappingCatalog:(query:{search?:string;date:string;offset?:number})=>request<{rows:LaborCode[];total:number}>('/api/payroll/labor-mappings/catalog',{query:{...query,limit:50}}),
  laborMappingProducts:(query:{search?:string;date:string;offset?:number;status?:string;price_list_id?:string;view?:'ATTENTION'|'ALL';issue?:string})=>request<import('./product-labor-types').LaborProductPage>('/api/payroll/labor-mappings/products',{query}),
  laborMappingProduct:(id:string,date:string,diagnostics=false)=>request<LaborResolution>('/api/payroll/labor-mappings/products/'+encodeURIComponent(id),{query:{date,diagnostics:diagnostics?'true':undefined}}),
  laborMappingVersions:()=>request<LaborDecisionVersion[]>('/api/payroll/labor-mappings/decisions'),
  saveLaborMapping:(body:LaborDecisionInput)=>request<{results:Array<{decision_id:string;version:number}>;reused:boolean}>('/api/payroll/labor-mappings/decisions',{method:'POST',body}),
  laborMappingHistory:(id:string)=>request<LaborDecisionVersion[]>('/api/payroll/labor-mappings/decisions/'+encodeURIComponent(id)+'/history'),
  laborMappingPreview:(product_ids:string[],date:string)=>request<{rows:LaborResolution[];read_only:true}>('/api/payroll/labor-mappings/batch-preview',{method:'POST',body:{product_ids,date}}),
  confirmLaborMappingBatch:(body:Record<string,unknown>)=>request<{results:Array<{decision_id:string;version:number}>;reused:boolean}>('/api/payroll/labor-mappings/batch-confirm',{method:'POST',body}),
  aiProviders: () => request<{selected:'local'|'f5quota'|'beeknoee';providers:Array<{provider:'f5quota'|'beeknoee';configured:boolean;model:string;base_url:string;protocol:string}>}>('/api/ai/providers'),
  saveAiProvider: (provider:string,body:{api_key?:string;model?:string;activate?:boolean}) => request<{selected:'local'|'f5quota'|'beeknoee';providers:Array<{provider:'f5quota'|'beeknoee';configured:boolean;model:string;base_url:string;protocol:string}>}>('/api/ai/providers/'+encodeURIComponent(provider),{method:'PUT',body}),
  removeAiKey: (provider:string) => request<{selected:'local'|'f5quota'|'beeknoee';providers:Array<{provider:'f5quota'|'beeknoee';configured:boolean;model:string;base_url:string;protocol:string}>}>('/api/ai/providers/'+encodeURIComponent(provider)+'/key',{method:'DELETE'}),
  aiProviderModels: (provider:string,apiKey?:string) => request<{data:Array<{id:string;owned_by:string}>}>('/api/ai/providers/'+encodeURIComponent(provider)+'/models',apiKey===undefined?{}:{method:'POST',body:{api_key:apiKey}}),
  testAiProvider: (provider:string,model:string) => request<{success:boolean;message:string}>('/api/ai/providers/'+encodeURIComponent(provider)+'/test',{method:'POST',body:{model}}),
  myAiSettings: () => request<Array<{setting_name:string;setting_value:boolean}>>('/api/ai/my-settings'),
  health: () => request<{ ok: boolean; backend: string }>("/health"),
  localFunction,
  externalIntegrationStatus: () => request<{ghn:{configured:boolean};tax:{configured:boolean}}>("/api/external-integrations/status"),
  externalGoongSettings: (authGuard?: LocalAuthGuard) => request<LocalGoongSettings>('/api/external-integrations/goong', { authGuard }),
  saveExternalGoongSettings: (body: { mode: LocalGoongSettings['mode']; revision: number; api_key?: string }, authGuard?: LocalAuthGuard) => request<LocalGoongSettings>('/api/external-integrations/goong', { method: 'PUT', body, authGuard }),
  externalGhnSettings: () => request<{configured:boolean;source:'server_env'|'saved'|'disabled';mode:'INHERIT_ENV'|'ENABLED'|'DISABLED';revision:number;configured_shop_count:number;has_saved_key:boolean;primary_shop_id:string;allowed_shop_ids:string[]}>('/api/external-integrations/ghn'),
  saveExternalGhnSettings: (body:{mode:'INHERIT_ENV'|'ENABLED'|'DISABLED';revision:number;api_key?:string;primary_shop_id?:string;allowed_shop_ids?:string}) => request<{configured:boolean;source:'server_env'|'saved'|'disabled';mode:'INHERIT_ENV'|'ENABLED'|'DISABLED';revision:number;configured_shop_count:number;has_saved_key:boolean;primary_shop_id:string;allowed_shop_ids:string[]}>('/api/external-integrations/ghn',{method:'PUT',body}),
  testExternalGhnSettings: () => request<{configured:boolean;connected:boolean;message:string;checked_at:string}>('/api/external-integrations/ghn/test',{method:'POST',body:{}}),
  discoverGhnShops: (api_key?:string) => request<{shops:Array<{_id:number;name:string;address:string;district_id:number;ward_code:string;status:number}>}>('/api/external-integrations/ghn/shops-discovery',{method:'POST',body:api_key?{api_key}:{}}),
  previewGhnOrder: (body:Record<string,unknown>,authGuard?:LocalAuthGuard) => request<{total:number}>('/api/ghn-orders/preview',{method:'POST',body,authGuard}),
  createGhnOrder: (body:Record<string,unknown>,authGuard?:LocalAuthGuard) => request<{success:boolean;data:GhnOrderAttempt}>('/api/ghn-orders',{method:'POST',body,authGuard}),
  recentGhnOrder: (orderId?:string,authGuard?:LocalAuthGuard) => request<{success:boolean;data:GhnOrderAttempt|null}>('/api/ghn-orders/recent',{query:{orderId},authGuard}),
  ghnOrderStatus: (key:string,reconcile=false,authGuard?:LocalAuthGuard) => request<{success:boolean;data:GhnOrderAttempt}>(`/api/ghn-orders/${encodeURIComponent(key)}${reconcile?'/reconcile':''}`,{method:reconcile?'POST':'GET',...(reconcile?{body:{}}:{}),authGuard}),
  printGhnOrder: (key:string,authGuard?:LocalAuthGuard) => request<{success:boolean;data:{printUrl:string}}>(`/api/ghn-orders/${encodeURIComponent(key)}/print`,{method:'POST',body:{},authGuard}),
  localStorageUpload,
  localStorageRemove,
  localStoragePublicUrl: (bucket: string, path: string) => `/api/local-storage/${encodeURIComponent(bucket)}/object?path=${encodeURIComponent(path)}`,
  dashboardStats: () => request<LocalDashboardStats>("/api/dashboard/stats"),
  syncRuns: () => request<LocalSyncRun[]>("/api/local-sync/runs"),
  startSync: () => request<{ started: boolean; mode: string; message: string }>("/api/local-sync/start", { method: "POST", body: {} }),
  snapshot: (table: string, query?: { search?: string; limit?: number; offset?: number }) => request<{ table: string; rows: Array<{ source_key: string; source_updated_at: string | null; last_seen_at: string; payload: Record<string, unknown> }>; total: number; limit: number; offset: number }>(`/api/local-snapshot/${encodeURIComponent(table)}`, { query }),
  customers: (query?: { search?: string; includeInactive?: boolean }) => request<LocalCustomer[]>("/api/customers", { query }),
  customer: (id: string,signal?:AbortSignal) => request<LocalCustomerDetails>(`/api/customers/${encodeURIComponent(id)}`,{signal}),
  createCustomer: (body: Record<string, unknown>) => request<LocalCustomer>("/api/customers", { method: "POST", body }),
  updateCustomer: (id: string, body: Record<string, unknown>) => request<LocalCustomer>(`/api/customers/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  archiveCustomer: (id: string) => request<{ id: string; is_active: boolean; archived: boolean }>(`/api/customers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  quotes: (query?: QuoteQueryOptions & { limit?: number; offset?: number }) => request<Array<Record<string, unknown>>>("/api/quotes", { query: { ...query } }),
  quoteCustomerSuggestions: (query: { search: string; managerId?: string | null; quoteId?: string }) => request<QuoteCustomerCandidate[]>("/api/quotes/customer-suggestions", { query }),
  quoteStats: (query?: QuoteQueryOptions) => request<Record<string, unknown>>("/api/quotes/stats", { query: { ...query } }),
  quoteData: (id: string) => request<{ quote_data: unknown }>(`/api/quotes/${encodeURIComponent(id)}/quote-data`),
  createQuote: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/quotes", { method: "POST", body }),
  updateQuote: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/quotes/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  approveQuote: (id: string) => request<{ quote: Record<string, unknown>; order: Record<string, unknown>; reused: boolean }>(`/api/quotes/${encodeURIComponent(id)}/approve`, { method: "POST", body: {} }),
  deleteQuote: (id: string) => request<{ id: string }>(`/api/quotes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  order: (id:string,signal?:AbortSignal) => request<Record<string,unknown>>(`/api/orders/${encodeURIComponent(id)}`,{signal}),
  orders: (query?: { search?: string; managerId?: string | null; limit?: number; offset?: number }) => request<Array<Record<string, unknown>>>("/api/orders", { query }),
  createOrder: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/orders", { method: "POST", body }),
  deleteOrder: (id: string) => request<Record<string, unknown>>(`/api/orders/${encodeURIComponent(id)}`, { method: "DELETE" }),
  orderStats: (managerId?: string | null) => request<Record<string, unknown>>("/api/orders/stats", { query: { managerId } }),
  duplicateOrders: () => request<Array<{ display_number: string; dup_count: number }>>("/api/orders/duplicates"),
  updateOrder: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/orders/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  contracts: (query?: { search?: string; managerId?: string | null }) => request<Array<Record<string, unknown>>>('/api/contracts', { query }),
  contractPaymentSummary: (id: string) => request<{ known: boolean; paid: number | null; remaining: number | null; reason: string }>(`/api/contracts/${encodeURIComponent(id)}/payment-summary`),
  createContract: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/contracts', { method: 'POST', body }),
  updateContract: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/contracts/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteContract: (id: string) => request<Record<string, unknown>>(`/api/contracts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  contractTemplates: () => request<Array<Record<string, unknown>>>('/api/contract-templates'),
  createContractTemplate: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/contract-templates', { method: 'POST', body }),
  updateContractTemplate: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/contract-templates/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteContractTemplate: (id: string) => request<Record<string, unknown>>(`/api/contract-templates/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  quoteTemplateSettings: () => request<Record<string, unknown> | null>('/api/quote-template-settings'),
  saveQuoteTemplateSettings: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/quote-template-settings', { method: 'PUT', body }),
  expenses: (query?: { managerId?: string | null; start?: string | null; end?: string | null }) => request<Array<Record<string, unknown>>>('/api/expenses', { query }),
  createExpense: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/expenses', { method: 'POST', body }),
  updateExpense: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/expenses/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteExpense: (id: string) => request<Record<string, unknown>>(`/api/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  transactions: (query?: { managerId?: string | null; orderId?: string | null; search?: string },signal?:AbortSignal) => request<Array<Record<string, unknown>>>('/api/transactions', { query,signal }),
  createTransaction: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/transactions', { method: 'POST', body }),
  deleteTransaction: (id: string) => request<Record<string, unknown>>(`/api/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createOrderPayment: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/order-payments', { method: 'POST', body }),
  recordOrderPayment: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/order-payments/record', { method: 'POST', body }),
  deleteOrderPayments: (orderId: string) => request<Record<string, unknown>>(`/api/order-payments/${encodeURIComponent(orderId)}`, { method: 'DELETE' }),
  assignees: () => request<Array<Record<string, unknown>>>('/api/assignees'),
  createAssignee: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/assignees', { method: 'POST', body }),
  updateAssignee: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/assignees/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteAssignee: (id: string) => request<Record<string, unknown>>(`/api/assignees/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  users: () => request<Record<string, unknown>[]>('/api/users'),
  createUser: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/users', { method: 'POST', body }),
  updateUser: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteUser: (id: string) => request<Record<string, unknown>>(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  changeUserPassword: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/users/${encodeURIComponent(id)}/password`, { method: 'POST', body }),
  employeePermissions: (userId: string) => request<Array<{ user_id: string; permission_type: string; enabled: boolean; assigned_by: string | null; reason: string | null }>>(`/api/users/${encodeURIComponent(userId)}/permissions`),
  saveEmployeePermissions: (userId: string, permissions: Array<{ permission_type: string; enabled: boolean }>, reason: string) => request<{ user_id: string; permissions: Array<{ permission_type: string; enabled: boolean }>; audit_id: string }>(`/api/users/${encodeURIComponent(userId)}/permissions`, { method: 'PUT', body: { permissions, reason } }),
  knowledgeDocuments: () => request<Record<string, unknown>[]>('/api/knowledge/documents'),
  knowledgeChat: (question: string, chatHistory?: Array<Record<string, unknown>>) => request<{ answer: string; sources: Array<{ id: string; title: string; type: string }>; local_only: boolean }>('/api/knowledge/chat', { method: 'POST', body: { question, chatHistory } }),
  knowledgeChatHistory: (limit = 20) => request<Array<{ question: string; answer: string; sources: unknown[]; created_at: string }>>(`/api/knowledge/chat-history?limit=${limit}`),
  saveKnowledgeChatHistory: (body: { question: string; answer: string; sources: unknown[] }) => request<Record<string, unknown>>('/api/knowledge/chat-history', { method: 'POST', body }),
  createKnowledgeDocument: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/knowledge/documents', { method: 'POST', body }),
  updateKnowledgeDocument: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/knowledge/documents/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteKnowledgeDocument: (id: string) => request<Record<string, unknown>>(`/api/knowledge/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  costCategories: () => request<Record<string, unknown>[]>('/api/cost/categories'),
  createCostCategory: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/cost/categories', { method: 'POST', body }),
  updateCostCategory: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/cost/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  setCostCategoryActive: (id: string, isActive: boolean) => request<Record<string, unknown>>(`/api/cost/categories/${encodeURIComponent(id)}/active`, { method: 'POST', body: { is_active: isActive } }),
  costCenters: () => request<Record<string, unknown>[]>('/api/cost/centers'),
  createCostCenter: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/cost/centers', { method: 'POST', body }),
  updateCostCenter: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/cost/centers/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  setCostCenterActive: (id: string, isActive: boolean) => request<Record<string, unknown>>(`/api/cost/centers/${encodeURIComponent(id)}/active`, { method: 'POST', body: { is_active: isActive } }),
  costObjects: () => request<Record<string, unknown>[]>('/api/cost/objects'),
  createCostObject: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/cost/objects', { method: 'POST', body }),
  setCostObjectActive: (id: string, isActive: boolean) => request<Record<string, unknown>>(`/api/cost/objects/${encodeURIComponent(id)}/active`, { method: 'POST', body: { is_active: isActive } }),
  transactionTypes: () => request<Record<string, unknown>[]>('/api/cost/transaction-types'),
  costUsers: () => request<Record<string, unknown>[]>('/api/cost/users'),
  costAudit: () => request<Record<string, unknown>[]>('/api/cost/audit'),
  businessTransactions: () => request<Record<string, unknown>[]>('/api/cost/business-transactions'),
  createBusinessTransaction: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/cost/business-transactions', { method: 'POST', body }),
  confirmBusinessTransaction: (id: string, reason?: string) => request<Record<string, unknown>>(`/api/cost/business-transactions/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: { reason } }),
  voidBusinessTransaction: (id: string, reason: string) => request<Record<string, unknown>>(`/api/cost/business-transactions/${encodeURIComponent(id)}/void`, { method: 'POST', body: { reason } }),
  einvoices: (contractId?: string) => request<Record<string, unknown>[]>('/api/einvoices', { query: { contractId } }),
  createEInvoiceDraft: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/einvoices/draft', { method: 'POST', body }),
  issueLocalEInvoice: (id: string) => request<Record<string, unknown>>(`/api/einvoices/${encodeURIComponent(id)}/issue`, { method: 'POST', body: {} }),
  previewLocalEInvoice: (id: string) => request<Record<string, unknown>>(`/api/einvoices/${encodeURIComponent(id)}/preview`, { method: 'POST', body: {} }),
  deleteLocalEInvoice: (id: string) => request<Record<string, unknown>>(`/api/einvoices/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  einvoiceTemplates: () => request<Record<string, unknown>>('/api/einvoice-templates'),
  einvoiceSettings: () => request<Record<string, unknown>>('/api/einvoice-settings'),
  saveEinvoiceSettings: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/einvoice-settings', { method: 'POST', body }),
  shippingCompanies: () => request<Record<string, unknown>[]>('/api/shipping-companies'),
  createShippingCompany: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/shipping-companies', { method: 'POST', body }),
  updateShippingCompany: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/shipping-companies/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteShippingCompany: (id: string) => request<Record<string, unknown>>(`/api/shipping-companies/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  ghnEditDetail: (code: string) => request<{ data: Record<string, unknown>; fingerprint: string; pendingAttempt?: GhnEditResult | null }>(`/api/ghn-edit/${encodeURIComponent(code)}/detail`),
  editGhnOrder: (code: string, body: Record<string, unknown>) => request<GhnEditResult>(`/api/ghn-edit/${encodeURIComponent(code)}`, { method: 'POST', body }),
  reconcileGhnEdit: (id: string) => request<GhnEditResult>(`/api/ghn-edit-attempts/${encodeURIComponent(id)}/reconcile`, { method: 'POST', body: {} }),
  ghnTracking: (query?: { page?: number; pageSize?: number; search?: string; status?: string; sortBy?: string; sortOrder?: string }) => request<{ rows: Record<string, unknown>[]; total: number; page: number; pageSize: number }>('/api/ghn-tracking', { query }),
  ghnTrackingByOrder: (orderId: string) => request<{ rows: Record<string, unknown>[]; orderCodes: string[] }>(`/api/ghn-tracking/by-order/${encodeURIComponent(orderId)}`),
  replaceGhnTrackingByOrder: (orderId: string, body: { orderCodes: string[]; expectedOrderCodes: string[] }) => request<{ rows: Record<string, unknown>[]; orderCodes: string[] }>(`/api/ghn-tracking/by-order/${encodeURIComponent(orderId)}`, { method: 'PUT', body }),
  checkGhnConnection: () => request<{ configured: boolean; connected: boolean; message: string; checked_at: string }>('/api/ghn-tracking/connection-check', { method: 'POST', body: {} }),
  refreshGhnTracking: (body: { id?: string; orderCode?: string; staleOnly?: boolean; cursor?: string }) => request<{ updated: number; skipped: number; failed: number; has_more: boolean; next_cursor: string | null; limit: number; errors: Array<{ orderCode: string; message: string }> }>('/api/ghn-tracking/refresh', { method: 'POST', body }),
  importGhnCodes: (codes: string[]) => request<{added:number;skipped:number;processed:number;failed:number;errors:Array<{orderCode:string;message:string}>}>('/api/ghn-tracking/import-codes',{method:'POST',body:{codes}}),
  importGhnPage: (cursor?: string) => request<{added:number;skipped:number;failed:number;scanned:number;halted:boolean;complete:boolean;totals:Array<{shop_id:string;scanned:number;added:number;skipped:number;failed:number;complete:boolean}>;errors:Array<{orderCode:string;message:string}>;has_more:boolean;next_cursor:string|null;truncated:boolean}>('/api/ghn-tracking/import-page',{method:'POST',body:cursor?{cursor}:{}}),
  createGhnTracking: (body: { ghn_order_code: string; order_id?: string | null }) => request<Record<string, unknown>>('/api/ghn-tracking', { method: 'POST', body }),
  deleteGhnTracking: (id: string) => request<Record<string, unknown>>(`/api/ghn-tracking/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  printGhnTracking: (ids: string[]) => request<{ success: boolean; data: { documents: Array<{ shopId: string; orderCodes: string[]; printUrl: string }> } }>('/api/ghn-tracking/print', { method: 'POST', body: { ids } }),
  workers: () => request<ProductionWorker[]>("/api/workers"),
  createWorker: (body: Record<string, unknown>) => request<ProductionWorker>("/api/workers", { method: "POST", body }),
  workerMethods: (onDate?: string) => request<WorkerAttendanceMethod[]>("/api/worker-methods", { query: { onDate } }),
  configureWorkerMethod: (body: Record<string, unknown>) => request<{ attendance_method: AttendanceMethod; profile: WorkerCompensationProfile; rate: WorkerCompensationRate }>("/api/worker-methods", { method: "POST", body }),
  rates: (workerId?: string | null) => request<WorkerCompensationRate[]>("/api/rates", { query: { workerId } }),
  createRate: (body: Record<string, unknown>) => request<WorkerCompensationRate>("/api/rates", { method: "POST", body }),
  factoryAttendance: (monthStart: string, includeReversed = false) => request<{ rows: FactoryAttendanceRow[]; timeClockAvailable: boolean; workflowAvailable: boolean }>("/api/attendance", { query: { month: monthStart.slice(0, 7), includeReversed } }),
  recordFactoryAttendance: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/attendance", { method: "POST", body }),
  recordFactoryHourAttendance: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/attendance/hour", { method: "POST", body }),
  reverseFactoryAttendance: (id: string, reason: string, idempotencyKey: string) => request<Record<string, unknown>>(`/api/attendance/${id}/reverse`, { method: "POST", body: { reason, idempotencyKey } }),
  setFactoryAttendanceStatus: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/attendance/status", { method: "POST", body }),
  bulkAttendanceWorkflow: (body: LocalAttendanceBulkWorkflowInput) => request<LocalAttendanceBulkWorkflowResult>("/api/attendance/bulk-workflow", { method: "POST", body }),
  attendanceDaySummary: (workerId:string,date:string) => request<AttendanceDaySummary>('/api/attendance/day-summary',{query:{worker_id:workerId,date}}),
  myAttendanceDaySummary: (date:string) => request<AttendanceDaySummary>('/api/my-attendance/day-summary',{query:{date}}),
  myAttendanceClosures: (month:string) => request<FactoryAttendanceClosureRow[]>('/api/my-attendance/closures',{query:{month}}),
  approveCloseAttendanceDay: (body:Record<string,unknown>) => request<Record<string,unknown>>('/api/attendance/approve-close',{method:'POST',body}),
  previewAttendanceBulk: (body:Record<string,unknown>) => request<AttendanceBulkPreview>('/api/attendance/bulk-preview',{method:'POST',body}),
  closures: (monthStart: string) => request<FactoryAttendanceClosureRow[]>("/api/attendance/closures", { query: { month: monthStart.slice(0, 7) } }),
  dayStatuses: (monthStart: string) => request<FactoryAttendanceDayStatusRow[]>("/api/attendance/day-status", { query: { month: monthStart.slice(0, 7) } }),
  attendanceHistory: (monthStart: string) => request<FactoryAttendanceHistoryRow[]>("/api/attendance/history", { query: { month: monthStart.slice(0, 7) } }),
  setDayStatus: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/attendance/day-status", { method: "POST", body }),
  setDayClosure: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/attendance/closures", { method: "POST", body }),
  overtime: (monthStart: string) => request<FactoryOvertimeRow[]>("/api/attendance/overtime", { query: { month: monthStart.slice(0, 7) } }),
  recordOvertime: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/attendance/overtime", { method: "POST", body }),
  setOvertimeStatus: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/attendance/overtime/status", { method: "POST", body }),
  productionAttendance: (orderId: string, monthStart: string, includeReversed = false) => request<ProductionAttendanceRow[]>("/api/production-attendance", { query: { orderId, month: monthStart.slice(0, 7), includeReversed } }),
  assignments: (orderId: string) => request<ProductionOrderWorkerAssignment[]>("/api/production-attendance/assignments", { query: { orderId } }),
  assign: (body: Record<string, unknown>) => request<ProductionOrderWorkerAssignment>("/api/production-attendance/assignments", { method: "POST", body }),
  endAssignment: (id: string, body: Record<string, unknown>) => request<ProductionOrderWorkerAssignment>(`/api/production-attendance/assignments/${id}`, { method: "PATCH", body }),
  setAssignmentEnforcement: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production-attendance/assignment-enforcement", { method: "POST", body }),
  recordProductionAttendance: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production-attendance", { method: "POST", body }),
  reverseProductionAttendance: (id: string, reason: string, idempotencyKey: string) => request<Record<string, unknown>>(`/api/production-attendance/${id}/reverse`, { method: "POST", body: { reason, idempotencyKey } }),
  productionProducts: (workDate: string, search?: string) => request<ProductionEntryProduct[]>("/api/production/products", { query: { workDate, search } }),
  productionEntries: (monthStart: string, includeReversed = false) => request<ProductionEntryRow[]>("/api/production/entries", { query: { month: monthStart.slice(0, 7), includeReversed } }),
  recordProductionEntry: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production/entries", { method: "POST", body }),
  recordMyProductionEntry: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production/entries", { method: "POST", body: { ...body, self_service: true } }),
  setProductionEntryStatus: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production/entries/status", { method: "POST", body }),
  reverseProductionEntry: (id: string, reason: string, idempotencyKey: string) => request<Record<string, unknown>>(`/api/production/entries/${id}/reverse`, { method: "POST", body: { reason, idempotencyKey } }),
  catalogProducts: (query?: { search?: string; category?: string; priceListId?: string; includeInactive?: boolean }) => request<LocalCatalogProduct[]>("/api/catalog/products", { query }),
  catalogPriceLists: () => request<Array<{ id: string; name: string; year: number | null; status: string | null; product_count: number }>>("/api/catalog/price-lists"),
  createCatalogProduct: (body: Record<string, unknown>) => request<LocalCatalogProduct>("/api/catalog/products", { method: "POST", body }),
  updateCatalogProduct: (id: string, body: Record<string, unknown>) => request<LocalCatalogProduct>(`/api/catalog/products/${id}`, { method: "PATCH", body }),
  setCatalogProductActive: (id: string, isActive: boolean) => request<{ id: string; is_active: boolean }>(`/api/catalog/products/${id}/active`, { method: "POST", body: { is_active: isActive } }),
  setCatalogProductRate: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/catalog/products/${id}/rate`, { method: "POST", body }),
  inventoryItems: () => request<InventoryItem[]>("/api/inventory/items"),
  createInventoryItem: (body: Record<string, unknown>) => request<InventoryItem>("/api/inventory/items", { method: "POST", body }),
  updateInventoryItem: (id: string, body: Record<string, unknown>) => request<InventoryItem>(`/api/inventory/items/${id}`, { method: "PATCH", body }),
  setInventoryItemActive: (id: string, isActive: boolean) => request<Record<string, unknown>>(`/api/inventory/items/${id}/active`, { method: "POST", body: { is_active: isActive } }),
  inventoryWarehouses: () => request<InventoryWarehouse[]>("/api/inventory/warehouses"),
  inventoryBusinessTransactions: (documentType: InventoryDocumentType) => request<InventoryBusinessTransaction[]>("/api/inventory/business-transactions", { query: { documentType } }),
  inventorySummary: () => request<Record<string, unknown>[]>("/api/inventory/summary"),
  inventoryBalances: () => request<InventoryBalance[]>("/api/inventory/balances"),
  inventoryDocuments: (limit = 500) => request<InventoryDocument[]>("/api/inventory/documents", { query: { limit } }),
  inventoryMovements: (itemId?: string | null, limit = 1000) => request<InventoryMovement[]>("/api/inventory/movements", { query: { itemId, limit } }),
  inventoryReturnSources: (productionOrderId?:string,batchId?:string) => request<InventoryReturnSource[]>("/api/inventory/return-sources",{query:{productionOrderId,batchId}}),
  inventoryReconciliation: () => request<InventoryReconciliation[]>("/api/inventory/reconciliation"),
  inventoryAudit: () => request<InventoryAuditEvent[]>("/api/inventory/audit"),
  inventoryProductionOrders: () => request<ProductionOrderForIssue[]>("/api/inventory/production-orders"),
  productionOrders: (query?: { status?: string; product_id?: string; order_id?: string }) => request<Record<string, unknown>[]>("/api/production-orders", { query: { status: query?.status, productId: query?.product_id, orderId: query?.order_id } }),
  productionSewingCodes: (query:{date:string;search?:string;offset?:number},authGuard?:LocalAuthGuard) => request<import('./production-sewing-selection').ProductionSewingCatalog>('/api/production-dispatch/sewing-codes',{query,authGuard}),
  productionWorkspace: (authGuard?:LocalAuthGuard) => request<import('./production-workspace-types').ProductionWorkspaceData>('/api/production-workspace',{authGuard}),
  productionWorkspaceDetails:(id:string)=>request<import('./production-workspace-types').ProductionWorkspaceDetails>(`/api/production-workspace/${encodeURIComponent(id)}/details`),
  addProductionPlannedExtras:(id:string,body:Record<string,unknown>,authGuard?:LocalAuthGuard)=>request<Record<string,unknown>>(`/api/production-workspace/${encodeURIComponent(id)}/planned-extras`,{method:'POST',body,authGuard}),
  cancelProductionPlannedExtra:(id:string,extraId:string,body:Record<string,unknown>,authGuard?:LocalAuthGuard)=>request<Record<string,unknown>>(`/api/production-workspace/${encodeURIComponent(id)}/planned-extras/${encodeURIComponent(extraId)}/cancel`,{method:'POST',body,authGuard}),
  completeProductionPlannedExtra:(id:string,extraId:string,body:Record<string,unknown>,authGuard?:LocalAuthGuard)=>request<Record<string,unknown>>(`/api/production-workspace/${encodeURIComponent(id)}/planned-extras/${encodeURIComponent(extraId)}/complete`,{method:'POST',body,authGuard}),
  productionWorkspaceAction:(id:string,action:'receive'|'ship'|'complete'|'repair-tickets'|'cancel-uncut',body:Record<string,unknown>)=>request<Record<string,unknown>>(`/api/production-workspace/${encodeURIComponent(id)}/${action}`,{method:'POST',body}),
  orderShipments:(orderId:string,authGuard?:LocalAuthGuard)=>request<import('./order-shipment-types').OrderShipmentData>('/api/order-shipments',{query:{order_id:orderId},authGuard}),
  dispatchOrderShipment:(body:Record<string,unknown>,authGuard?:LocalAuthGuard)=>request<Record<string,unknown>>('/api/order-shipments',{method:'POST',body,authGuard}),
  receiveOrderShipment:(id:string,body:Record<string,unknown>,authGuard?:LocalAuthGuard)=>request<Record<string,unknown>>(`/api/order-shipments/${encodeURIComponent(id)}/deliver`,{method:'POST',body,authGuard}),
  deliverProductionShipment:(id:string,body:Record<string,unknown>)=>request<Record<string,unknown>>(`/api/production-workspace/shipments/${encodeURIComponent(id)}/deliver`,{method:'POST',body}),
  setProductionWorkerType:(id:string,body:Record<string,unknown>)=>request<Record<string,unknown>>(`/api/production-workspace/workers/${encodeURIComponent(id)}/type`,{method:'POST',body}),
  productionDispatch: (orderId: string) => request<import('./production-dispatch-types').ProductionDispatchData>(`/api/production-dispatch?orderId=${encodeURIComponent(orderId)}`),
  productionReviewQueue:(cursor?:string)=>request<import('./production-dispatch-types').ProductionReviewQueueData>('/api/production-dispatch/review-queue',{query:{limit:50,...(cursor?{cursor}:{})}}),
  myProductionDispatch: () => request<import('./production-dispatch-types').ProductionDispatchData>("/api/production-dispatch/mine"),
  productionDispatchPayPreview: (id:string,workDate:string,quantityGood:string) => request<import('./production-dispatch-types').DispatchPayPreview>(`/api/production-dispatch/assignments/${encodeURIComponent(id)}/pay-preview`,{query:{work_date:workDate,quantity_good:quantityGood}}),
  productionLaborPreview:(orderId:string,itemId:string,date:string,authGuard?:LocalAuthGuard)=>request<{status:'RESOLVED';piece_rate_code:string;rate_unit:string;reason:string}>('/api/production-dispatch/labor-preview',{query:{production_order_id:orderId,order_item_id:itemId,date},authGuard}),
  receivedProductionWork:(workerId:string,date:string)=>request<Array<{id:string;piece_rate_code:string;product_name:string;production_order_number:string;remaining_quantity:string}>>('/api/production-dispatch/received-work',{query:{worker_id:workerId,date}}),
  productionDispatchRates: (date: string) => request<import('./production-dispatch-types').DispatchRate[]>(`/api/production-dispatch/rates?date=${encodeURIComponent(date)}`),
  productionDispatchPublications: (mine = false) => request<import('./production-dispatch-types').DispatchPublication[]>("/api/production-dispatch/publications", { query: { mine: mine ? "1" : "0" } }),
  createProductionDispatchPublication: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production-dispatch/publications", { method: "POST", body }),
  claimProductionDispatchPublication: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-dispatch/publications/${encodeURIComponent(id)}/claim`, { method: "POST", body }),
  closeProductionDispatchPublication: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-dispatch/publications/${encodeURIComponent(id)}/close`, { method: "POST", body }),
  createProductionDispatchAssignment: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production-dispatch/assignments", { method: "POST", body }),
  acceptProductionDispatchAssignment: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-dispatch/assignments/${encodeURIComponent(id)}/accept`, { method: "POST", body }),
  returnProductionDispatchAssignment: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-dispatch/assignments/${encodeURIComponent(id)}/return`, { method: "POST", body }),
  rejectProductionDispatchAssignment: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-dispatch/assignments/${encodeURIComponent(id)}/reject`, { method: "POST", body }),
  reportProductionDispatchAssignment: (id: string, body: Record<string, unknown>,authGuard?:LocalAuthGuard) => request<Record<string, unknown>>(`/api/production-dispatch/assignments/${encodeURIComponent(id)}/reports`, { method: "POST", body,authGuard }),
  reconcileProductionDispatchLabor: (id: string, body: Record<string, unknown>,authGuard?:LocalAuthGuard) => request<Record<string, unknown>>(`/api/production-dispatch/assignments/${encodeURIComponent(id)}/reconcile-labor`, { method: "POST", body,authGuard }),
  reviewProductionDispatchReport: (id: string, body: Record<string, unknown>,authGuard?:LocalAuthGuard) => request<Record<string, unknown>>(`/api/production-dispatch/reports/${encodeURIComponent(id)}/review`, { method: "POST", body,authGuard }),
  reverseProductionDispatchReport: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-dispatch/reports/${encodeURIComponent(id)}/reverse`, { method: "POST", body }),
  repairProductionDispatchReport: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-dispatch/reports/${encodeURIComponent(id)}/repair`, { method: "POST", body }),
  createProductionDispatchBatch: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production-dispatch/batches", { method: "POST", body }),
  updateProductionDispatchBatch: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-dispatch/batches/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  splitProductionDispatchBatch: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-dispatch/batches/${encodeURIComponent(id)}/split`, { method: "POST", body }),
  productionOrder: (id: string) => request<Record<string, unknown>>(`/api/production-orders/${encodeURIComponent(id)}`),
  createProductionOrder: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production-orders", { method: "POST", body }),
  createProductionOrderGroup: (body: Record<string, unknown>, authGuard?:LocalAuthGuard) => request<Record<string, unknown>>("/api/production-orders/groups", { method: "POST", body, authGuard }),
  productionReferenceImages: (productId:string) => request<{product_id:string;reference_images:string[]}>(`/api/production-workspace/reference-images?product_id=${encodeURIComponent(productId)}`),
  saveProductionDraftReference: (id:string,body:Record<string,unknown>) => request<Record<string,unknown>>(`/api/production-workspace/${encodeURIComponent(id)}/draft-reference`,{method:'POST',body}),
  releaseProductionOrder: (id: string, body?: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-orders/${encodeURIComponent(id)}/release`, { method: "POST", body: body ?? {} }),
  completeProductionOrder: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-orders/${encodeURIComponent(id)}/complete`, { method: "POST", body }),
  transitionProductionOrder: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-orders/${encodeURIComponent(id)}/transition`, { method: "POST", body }),
  createProductionFromCrmOrder: (id:string,body:Record<string,unknown>,authGuard?:LocalAuthGuard) => request<Record<string,unknown>>(`/api/production/source-orders/${encodeURIComponent(id)}/create`,{method:'POST',body,authGuard}),
  productionSourceOrders: (orderId?: string, options?: { includeDone?: boolean; search?: string }) => request<Record<string, unknown>[]>("/api/production/source-orders", { query: orderId ? { order_id: orderId } : options?.includeDone || options?.search ? { ...(options.includeDone ? { include_done: "1" } : {}), ...(options.search ? { q: options.search } : {}) } : undefined }),
  productionSalesPendingCount: () => request<{ pending: number; adjustment: number; can_review: boolean }>("/api/production-sales/requests/pending-count"),
  productionSewingSuggestions: (productIds: string[]) => request<import('./production-dispatch-types').ProductionSewingSuggestion[]>("/api/production/sewing-code-suggestions", { query: { product_ids: productIds.join(",") } }),
  productionSalesRequests: (mine = false, scope?: 'purchase') => request<import('./production-dispatch-types').ProductionSalesRequest[]>("/api/production-sales/requests", { query: { mine: mine ? '1' : '0', scope } }),
  createProductionSalesRequest: (body: Record<string, unknown>,authGuard?:LocalAuthGuard) => request<import('./production-dispatch-types').ProductionSalesRequest>("/api/production-sales/requests", { method: "POST", body,authGuard }),
  reviewProductionSalesRequest: (id: string, body: Record<string, unknown>,authGuard?:LocalAuthGuard) => request<Record<string, unknown>>(`/api/production-sales/requests/${encodeURIComponent(id)}/review`, { method: "POST", body,authGuard }),
  requestProductionSalesChange: (id: string, body: Record<string, unknown>,authGuard?:LocalAuthGuard) => request<Record<string, unknown>>(`/api/production-sales/requests/${encodeURIComponent(id)}/change-request`, { method: "POST", body,authGuard }),
  allocateProductionSalesRequest: (id: string, body: Record<string, unknown>, authGuard?:LocalAuthGuard) => request<Record<string, unknown>>(`/api/production-sales/requests/${encodeURIComponent(id)}/allocate`, { method: "POST", body, authGuard }),
  purchaseFulfillment: (requestId:string) => request<import('./production-dispatch-types').PurchaseFulfillmentData>('/api/purchase-fulfillment',{query:{request_id:requestId}}),
  createPurchaseFulfillmentPlans: (body:Record<string,unknown>) => request<import('./production-dispatch-types').PurchaseFulfillmentData>('/api/purchase-fulfillment/plans',{method:'POST',body}),
  releasePurchaseFulfillmentPlan: (id:string,body:Record<string,unknown>) => request<Record<string,unknown>>(`/api/purchase-fulfillment/plans/${encodeURIComponent(id)}/release`,{method:'POST',body}),
  receivePurchaseShortage: (id:string,body:Record<string,unknown>) => request<import('./production-dispatch-types').PurchaseFulfillmentData>(`/api/purchase-fulfillment/shortages/${encodeURIComponent(id)}/receipts`,{method:'POST',body}),
  cuttingEstimates: (orderId: string) => request<import('./production-dispatch-types').CuttingEstimate[]>(`/api/production-orders/${encodeURIComponent(orderId)}/cutting-estimates`),
  createCuttingEstimate: (orderId: string, body: Record<string, unknown>) => request<import('./production-dispatch-types').CuttingEstimate>(`/api/production-orders/${encodeURIComponent(orderId)}/cutting-estimates`, { method: "POST", body }),
  submitCuttingEstimate: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/cutting-estimates/${encodeURIComponent(id)}/submit`, { method: "POST", body }),
  reviewCuttingEstimate: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/cutting-estimates/${encodeURIComponent(id)}/review`, { method: "POST", body }),
  issueCuttingEstimateMaterial: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/cutting-estimates/${encodeURIComponent(id)}/material-issue`, { method: "POST", body }),
  saveFabricInventoryMapping: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/fabric-inventory-mappings", { method: "POST", body }),
  productionFabricVariants: (search?: string | null) => request<Record<string, unknown>[]>("/api/production/fabric-variants", { query: { search } }),
  productionOrderItems: (id: string) => request<Record<string, unknown>[]>(`/api/production-orders/${encodeURIComponent(id)}/items`),
  productionMaterialRequirements: (id: string) => request<Record<string, unknown>[]>(`/api/production-orders/${encodeURIComponent(id)}/material-requirements`),
  productionOperations: (id: string) => request<Record<string, unknown>[]>(`/api/production-orders/${encodeURIComponent(id)}/operations`),
  productionOutputs: (id: string) => request<Record<string, unknown>[]>(`/api/production-orders/${encodeURIComponent(id)}/outputs`),
  productionOperationLogs: (id: string) => request<Record<string, unknown>[]>(`/api/production-operations/${encodeURIComponent(id)}/logs`),
  createProductionOperationLog: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-operations/${encodeURIComponent(id)}/logs`, { method: "POST", body }),
  calculateProductionOrderLaborCost: (id: string) => request<Record<string, unknown>>(`/api/production-orders/${encodeURIComponent(id)}/labor-cost`),
  recordProductionScrap: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production/scrap", { method: "POST", body }),
  recordProductionRework: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production/rework", { method: "POST", body }),
  startProductionOperation: (id: string, body?: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-operations/${encodeURIComponent(id)}/start`, { method: "POST", body: body ?? {} }),
  completeProductionOperation: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-operations/${encodeURIComponent(id)}/complete`, { method: "POST", body }),
  productionBatches: (id: string) => request<Record<string, unknown>[]>(`/api/production-orders/${encodeURIComponent(id)}/batches`),
  setProductionBatchStatus: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-batches/${encodeURIComponent(id)}/status`, { method: "POST", body }),
  productionStageEvents: (id: string) => request<Record<string, unknown>[]>(`/api/production-orders/${encodeURIComponent(id)}/stage-events`),
  createProductionStageEvent: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production-stage-events", { method: "POST", body }),
  setProductionStageEventStatus: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-stage-events/${encodeURIComponent(id)}/status`, { method: "POST", body }),
  reverseProductionStageEvent: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production-stage-events/${encodeURIComponent(id)}/reverse`, { method: "POST", body }),
  productionFabricAllocations: (id: string) => request<Record<string, unknown>[]>(`/api/production-orders/${encodeURIComponent(id)}/fabric-allocations`),
  productionFabricStock: (fabricVariantId?: string | null) => request<Record<string, unknown>[]>("/api/production/fabric-stock", { query: { fabricVariantId } }),
  issueProductionFabric: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/production/fabric-allocations", { method: "POST", body }),
  updateProductionFabricAllocation: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/production/fabric-allocations/${encodeURIComponent(id)}/adjust`, { method: "POST", body }),
  manufacturingProducts: (search?: string) => request<Record<string, unknown>[]>("/api/manufacturing/products", { query: { search } }),
  manufacturingProfile: (productId: string) => request<Record<string, unknown> | null>(`/api/manufacturing/products/${encodeURIComponent(productId)}/profile`),
  saveManufacturingProfile: (body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/manufacturing/products/${encodeURIComponent(String(body.product_id))}/profile`, { method: "PUT", body }),
  bomWorkspace: (productId: string) => request<Record<string, unknown>>(`/api/manufacturing/products/${encodeURIComponent(productId)}/bom`),
  bomLines: (versionId: string) => request<Record<string, unknown>[]>(`/api/manufacturing/bom/versions/${encodeURIComponent(versionId)}/lines`),
  createBomDraft: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/manufacturing/bom/drafts", { method: "POST", body }),
  saveBomDraft: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/manufacturing/bom/versions/${encodeURIComponent(id)}`, { method: "PUT", body }),
  approveBomVersion: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/manufacturing/bom/versions/${encodeURIComponent(id)}/approve`, { method: "POST", body }),
  routingWorkspace: (productId: string) => request<Record<string, unknown>>(`/api/manufacturing/products/${encodeURIComponent(productId)}/routing`),
  routingOperations: (versionId: string) => request<Record<string, unknown>[]>(`/api/manufacturing/routing/versions/${encodeURIComponent(versionId)}/operations`),
  createRoutingDraft: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/manufacturing/routing/drafts", { method: "POST", body }),
  saveRoutingDraft: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/manufacturing/routing/versions/${encodeURIComponent(id)}`, { method: "PUT", body }),
  approveRoutingVersion: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/manufacturing/routing/versions/${encodeURIComponent(id)}/approve`, { method: "POST", body }),
  cuttingProfiles: (productId: string) => request<Record<string, unknown>[]>(`/api/manufacturing/products/${encodeURIComponent(productId)}/cutting-profiles`),
  cuttingVersions: (profileId: string) => request<Record<string, unknown>[]>(`/api/manufacturing/cutting-profiles/${encodeURIComponent(profileId)}/versions`),
  createCuttingDraft: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/manufacturing/cutting-profiles/drafts", { method: "POST", body }),
  saveCuttingDraft: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/manufacturing/cutting-versions/${encodeURIComponent(id)}`, { method: "PUT", body }),
  approveCuttingVersion: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/manufacturing/cutting-versions/${encodeURIComponent(id)}/approve`, { method: "POST", body }),
  calculateCutting: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/manufacturing/cutting-versions/${encodeURIComponent(id)}/calculate`, { method: "POST", body }),
  calculateMaterialRequirements: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/manufacturing/material-requirements/calculate", { method: "POST", body }),
  fabricTypes: () => request<Array<Record<string, unknown>>>("/api/fabrics/types"),
  fabricVariants: () => request<Array<Record<string, unknown>>>("/api/fabrics/variants"),
  fabricWidths: () => request<Array<Record<string, unknown>>>("/api/fabrics/widths"),
  fabricWarehouses: () => request<Array<Record<string, unknown>>>("/api/fabrics/warehouses"),
  fabricInventory: () => request<Array<Record<string, unknown>>>("/api/fabrics/inventory"),
  fabricTransactions: () => request<Array<Record<string, unknown>>>("/api/fabrics/transactions"),
  fabricTransfers: () => request<Array<Record<string, unknown>>>("/api/fabrics/transfers"),
  fabricUsage: (orderId?: string | null) => request<Array<Record<string, unknown>>>("/api/fabrics/usage", { query: { orderId } }),
  createFabricUsageBatch: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/fabrics/usage/batch", { method: "POST", body }),
  updateFabricUsage: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/fabrics/usage/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  deleteFabricUsage: (id: string) => request<Record<string, unknown>>(`/api/fabrics/usage/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createFabricType: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/fabrics/types", { method: "POST", body }),
  updateFabricType: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/fabrics/types/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  deleteFabricType: (id: string) => request<Record<string, unknown>>(`/api/fabrics/types/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createFabricVariant: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/fabrics/variants", { method: "POST", body }),
  createFabricWidth: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/fabrics/widths", { method: "POST", body }),
  updateFabricInventory: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/fabrics/inventory", { method: "POST", body }),
  createFabricTransaction: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/fabrics/transactions", { method: "POST", body }),
  updateFabricTransaction: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/fabrics/transactions/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  createFabricTransfer: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/fabrics/transfers", { method: "POST", body }),
  updateFabricTransferStatus: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/fabrics/transfers/${encodeURIComponent(id)}/status`, { method: "PATCH", body }),
  createInventoryDocument: (body: { document_type: InventoryDocumentType; transaction_at: string; warehouse_id: string; to_warehouse_id?: string | null; description: string; idempotency_key: string; lines: InventoryDocumentLineInput[]; business_transaction_id?: string | null; counterparty_name?: string | null; external_reference?: string | null; reason?: string | null; production_order_id?: string | null }) => request<Record<string, unknown>>("/api/inventory/documents", { method: "POST", body }),
  confirmInventoryDocument: (id: string) => request<Record<string, unknown>>(`/api/inventory/documents/${id}/confirm`, { method: "POST", body: {} }),
  voidInventoryDocument: (id: string, reason: string) => request<Record<string, unknown>>(`/api/inventory/documents/${id}/void`, { method: "POST", body: { reason } }),
  payrollWorkers: (includeInactive = false) => request<Record<string, unknown>[]>("/api/payroll/workers", { query: { includeInactive } }),
  updatePayrollWorker: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/workers/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  payrollCapabilities: (userId?: string | null) => request<Record<string, unknown>[]>("/api/payroll/capabilities", { query: { userId } }),
  payrollTeamAssignments: (query?: { supervisorWorkerId?: string | null; workerId?: string | null; onDate?: string | null }) => request<Record<string, unknown>[]>("/api/payroll/team-assignments", { query }),
  createPayrollTeamAssignment: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/payroll/team-assignments", { method: "POST", body }),
  retirePayrollTeamAssignment: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/team-assignments/${encodeURIComponent(id)}/retire`, { method: "POST", body }),
  payrollVersions: (resource: 'rule-versions' | 'calendar-versions') => request<Record<string, unknown>[]>(`/api/payroll/${resource}`),
  createPayrollVersion: (resource: 'rule-versions' | 'calendar-versions', body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/${resource}`, { method: "POST", body }),
  updatePayrollVersion: (resource: 'rule-versions' | 'calendar-versions', id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/${resource}/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  approvePayrollVersion: (resource: 'rule-versions' | 'calendar-versions', id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/${resource}/${encodeURIComponent(id)}/approve`, { method: "POST", body }),
  deletePayrollVersion: (resource: 'rule-versions' | 'calendar-versions', id: string) => request<Record<string, unknown>>(`/api/payroll/${resource}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  payrollPolicyGroups: () => request<Record<string, unknown>[]>("/api/payroll/policy-groups"),
  upsertPayrollPolicyGroup: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/payroll/policy-groups", { method: "POST", body }),
  payrollRates: (workerId?: string | null) => request<WorkerCompensationRate[]>("/api/payroll/rates", { query: { workerId } }),
  createPayrollRate: (body: Record<string, unknown>) => request<WorkerCompensationRate>("/api/payroll/rates", { method: "POST", body }),
  updatePayrollRate: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/rates/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  approvePayrollRate: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/rates/${encodeURIComponent(id)}/approve`, { method: "POST", body }),
  discardPayrollRate: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/rates/${encodeURIComponent(id)}/discard`, { method: "POST", body }),
  payrollCompensationAssignments: (workerId?: string | null) => request<Record<string, unknown>[]>("/api/payroll/compensation-assignments", { query: { workerId } }),
  createPayrollCompensationAssignment: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/payroll/compensation-assignments", { method: "POST", body }),
  updatePayrollCompensationAssignment: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/compensation-assignments/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  approvePayrollCompensationAssignment: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/compensation-assignments/${encodeURIComponent(id)}/approve`, { method: "POST", body }),
  discardPayrollCompensationAssignment: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/compensation-assignments/${encodeURIComponent(id)}/discard`, { method: "POST", body }),
  workerPayrollProfiles: (workerId?: string | null) => request<WorkerPayrollProfile[]>("/api/payroll/worker-profiles", { query: { workerId } }),
  reviewWorkerPayrollBundle: (body: {worker_id:string;selection:PayrollBundleSelection}) => request<PayrollBundleReview>("/api/payroll/worker-profile-bundle/review", {method:"POST",body}),
  approveWorkerPayrollBundle: (body: {worker_id:string;selection:PayrollBundleSelection;expected_fingerprint:string;idempotency_key:string;reason:string}) => request<{approved:boolean;reused:boolean}>("/api/payroll/worker-profile-bundle/approve", {method:"POST",body}),
  saveWorkerPayrollBundle: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/payroll/worker-profile-bundle", { method: "POST", body }),
  createWorkerPayrollProfile: (body: Record<string, unknown>) => request<WorkerPayrollProfile>("/api/payroll/worker-profiles", { method: "POST", body }),
  updateWorkerPayrollProfile: (id: string, body: Record<string, unknown>) => request<WorkerPayrollProfile>(`/api/payroll/worker-profiles/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  approveWorkerPayrollProfile: (id: string, body: Record<string, unknown>) => request<WorkerPayrollProfile>(`/api/payroll/worker-profiles/${encodeURIComponent(id)}/approve`, { method: "POST", body }),
  discardWorkerPayrollProfile: (id: string, body: Record<string, unknown>) => request<WorkerPayrollProfile>(`/api/payroll/worker-profiles/${encodeURIComponent(id)}/discard`, { method: "POST", body }),
  payrollProducts: () => request<Record<string, unknown>[]>("/api/payroll/products"),
  payrollProductRates: (productId?: string | null) => request<LocalProductRateRow[]>("/api/payroll/product-rates", { query: { productId } }),
  inspectProductRateQuote: (query:ProductRateQuoteRequest) => request<ProductRateQuote>("/api/payroll/product-rates/quote", {query}),
  createProductRate: (body: LocalProductRateCreate,authGuard?:LocalAuthGuard) => request<LocalProductRateRow>("/api/payroll/product-rates", { method: "POST", body,authGuard }),
  updateProductRate: (id: string, body: LocalProductRateUpdate) => request<LocalProductRateRow>(`/api/payroll/product-rates/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  approveProductRate: (id: string, body: LocalProductRateAction,authGuard?:LocalAuthGuard) => request<LocalProductRateRow>(`/api/payroll/product-rates/${encodeURIComponent(id)}/approve`, { method: "POST", body,authGuard }),
  discardProductRate: (id: string, body: LocalProductRateAction) => request<LocalProductRateRow>(`/api/payroll/product-rates/${encodeURIComponent(id)}/discard`, { method: "POST", body }),
  payrollInsurance: (workerId?: string | null) => request<Record<string, unknown>[]>("/api/payroll/insurance", { query: { workerId } }),
  createPayrollInsurance: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/payroll/insurance", { method: "POST", body }),
  updatePayrollInsurance: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/insurance/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  approvePayrollInsurance: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/insurance/${encodeURIComponent(id)}/approve`, { method: "POST", body }),
  discardPayrollInsurance: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/insurance/${encodeURIComponent(id)}/discard`, { method: "POST", body }),
  payrollAdjustments: (query?: { workerId?: string | null; status?: string | null; periodStart?: string | null; periodEnd?: string | null }) => request<PayrollAdjustment[]>("/api/payroll/adjustments", { query }),
  createPayrollAdjustment: (body: Record<string, unknown>) => request<PayrollAdjustment & { reused?: boolean }>("/api/payroll/adjustments", { method: "POST", body }),
  updatePayrollAdjustment: (id: string, body: Record<string, unknown>) => request<PayrollAdjustment>(`/api/payroll/adjustments/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  submitPayrollAdjustment: (id: string, body: Record<string, unknown>) => request<{ id: string; status: string }>(`/api/payroll/adjustments/${encodeURIComponent(id)}/submit`, { method: "POST", body }),
  approvePayrollAdjustment: (id: string, body: Record<string, unknown>) => request<{ id: string; status: string }>(`/api/payroll/adjustments/${encodeURIComponent(id)}/approve`, { method: "POST", body }),
  rejectPayrollAdjustment: (id: string, body: Record<string, unknown>) => request<{ id: string; status: string }>(`/api/payroll/adjustments/${encodeURIComponent(id)}/reject`, { method: "POST", body }),
  payrollBankAccounts: (workerId?: string | null) => request<Record<string, unknown>[]>("/api/payroll/bank-accounts", { query: { workerId } }),
  payrollBankProposal: (workerId: string) => request<{form_id:string;approved_revision:number;reviewed_at:string;account_number:string|null;account_name:string|null;bank_name:string|null;bank_code:string|null}|null>("/api/payroll/bank-accounts/proposal",{query:{workerId}}),
  createPayrollBankAccount: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/payroll/bank-accounts", { method: "POST", body }),
  updatePayrollBankAccount: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/bank-accounts/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  verifyPayrollBankAccount: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/bank-accounts/${encodeURIComponent(id)}/verify`, { method: "POST", body }),
  discardPayrollBankAccount: (id: string, body: Record<string, unknown>) => request<Record<string, unknown>>(`/api/payroll/bank-accounts/${encodeURIComponent(id)}/discard`, { method: "POST", body }),
  payrollRuns: () => request<Record<string, unknown>[]>("/api/payroll/runs"),
  previewPayrollImport: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/payroll/import/preview", { method: "POST", body }),
  applyPayrollImport: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/payroll/import/apply", { method: "POST", body }),
  payrollPreflight: (query?: { period_start?: string; period_end?: string; standard_days?: number | null; worker_ids?: string }) => request<Record<string, unknown>>("/api/payroll/preflight", { query }),
  payrollRun: (id: string) => request<Record<string, unknown>>(`/api/payroll/runs/${id}`),
  payrollReconciliation: (id:string) => request<import("@/lib/payroll-reconciliation").PayrollReconciliation>(`/api/payroll/runs/${encodeURIComponent(id)}/reconciliation`),
  createPayrollRun: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/payroll/runs", { method: "POST", body }),
  lockPayrollRun: (id: string) => request<Record<string, unknown>>(`/api/payroll/runs/${id}/lock`, { method: "POST", body: {} }),

  // ── Tài khoản / liên kết công nhân / chấm công tự phục vụ ──
  me: () => request<import("./local-auth").LocalMe>("/api/local-auth/me"),
  myProfile: () => request<LocalSelfProfile>("/api/my-profile"),
  saveMyProfile: (profile: Record<string, string | null>) => request<LocalSelfProfile>("/api/my-profile", { method: "PATCH", body: { profile } }),
  submitMyProfile: (profile?: Record<string, string | null>) => request<LocalSelfProfile>("/api/my-profile/submit", { method: "POST", body: profile ? { profile } : {} }),
  profileRequests: (status = "SUBMITTED") => request<LocalProfileRequest[]>("/api/profile-requests", { query: { status } }),
  reviewProfileRequest: (userId: string, body: LocalProfileReviewRequest) => request<LocalSelfProfile>(`/api/profile-requests/${encodeURIComponent(userId)}/review`, { method: "POST", body }),
  workerLink: (userId: string) => request<LocalWorkerLinkResponse>(
    `/api/users/${encodeURIComponent(userId)}/worker-link`),
  saveWorkerLink: (userId: string, workerId: string | null, reason?: string) => request<LocalWorkerLinkResponse>(
    `/api/users/${encodeURIComponent(userId)}/worker-link`, { method: "PATCH", body: { worker_id: workerId, reason } }),
  myAttendance: (monthStart?: string) => request<{ rows: FactoryAttendanceRow[]; worker: { id: string; employee_code: string; display_name: string } }>(
    "/api/my-attendance", { query: { month: monthStart } }),
  myAttendanceContext: (workDate?: string) => request<MyAttendanceContext>(
    "/api/my-attendance/context", { query: { date: workDate } }),
  myDayStatuses: (monthStart?: string) => request<Record<string, unknown>[]>(
    "/api/my-attendance/day-status", { query: { month: monthStart } }),
  recordMyAttendance: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/my-attendance", { method: "POST", body }),
  recordMyDayStatus: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/my-attendance/day-status", { method: "POST", body }),
  myOvertime: (monthStart?: string) => request<Record<string, unknown>[]>("/api/my-attendance/overtime", { query: { month: monthStart } }),
  recordMyOvertime: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/my-attendance/overtime", { method: "POST", body }),
  myProductionEntries: (monthStart?: string) => request<Record<string, unknown>[]>("/api/my-attendance/production-entries", { query: { month: monthStart } }),
  myProductEarnings: (month?: string) => request<import('./production-dispatch-types').ProductEarnings>("/api/my-attendance/earnings", { query: { month } }),
  myPayrollMonth: (month:string) => request<SelfPayrollMonth>('/api/my-attendance/payroll-month',{query:{month}}),
  confirmMyAttendanceDay: (body: Record<string, unknown>) => request<Record<string, unknown>>("/api/my-attendance/day-confirm", { method: "POST", body }),
};

export type LocalAttendanceStatus = AttendanceWorkflowStatus;
export type LocalDayStatus = FactoryAttendanceDayStatus;

export type PayrollBundleSelection = { assignment_id:string;profile_id:string;rate_id?:string|null;insurance_id?:string|null };
export type PayrollBundleReview = {worker_id:string;selection:PayrollBundleSelection;fingerprint:string;components:Record<string,Record<string,unknown>>;previous:Record<string,Record<string,unknown>[]>};
