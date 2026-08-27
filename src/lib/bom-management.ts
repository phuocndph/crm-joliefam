import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { InventoryItem, InventoryUnit } from "@/lib/inventory-management";

export type VersionStatus = "DRAFT" | "APPROVED" | "SUPERSEDED";
export type QuantityMethod = "FIXED" | "PER_UNIT" | "FORMULA" | "CUTTING_ENGINE";

export interface ManufacturingProduct {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  in_stock: boolean;
}

export interface ManufacturingProfile {
  id: string;
  product_id: string;
  manufacturing_type: string;
  finished_width: number | null;
  finished_length: number | null;
  finished_height: number | null;
  dimension_unit: "MM" | "CM" | "METER";
  extra_dimensions: Json;
  default_bom_id: string | null;
  default_cutting_profile_id: string | null;
  is_active: boolean;
}

export interface BomHeader { id: string; product_id: string; code: string; name: string; is_active: boolean }
export interface BomVersion {
  id: string; bom_id: string; version_number: number; status: VersionStatus;
  effective_from: string | null; effective_to: string | null; notes: string | null;
  approved_at: string | null; approval_reason: string | null; created_at: string;
}
export interface BomLine {
  id: string; bom_version_id: string; inventory_item_id: string; line_type: string;
  quantity_method: QuantityMethod; standard_quantity: number | null; unit: InventoryUnit;
  waste_rate: number; scrap_rate: number; formula_type: "PER_BATCH" | null;
  formula_parameters: Json; cutting_profile_id: string | null; sequence: number; notes: string | null;
}
export type BomLineInput = Omit<BomLine, "id" | "bom_version_id">;

export interface CuttingProfile { id: string; product_id: string; code: string; name: string; manufacturing_type: string; is_active: boolean }
export interface CuttingVersion {
  id: string; cutting_profile_id: string; version_number: number; status: VersionStatus;
  effective_from: string | null; effective_to: string | null; piece_width_rule: string; piece_length_rule: string;
  piece_width_parameter_cm: number | null; piece_length_parameter_cm: number | null; pieces_per_product: number;
  default_fabric_width_cm: number | null; pattern_direction: string; allow_rotation: boolean;
  requires_matching_pattern: boolean; pattern_repeat_cm: number | null; seam_allowance_cm: number;
  hem_allowance_cm: number; tuck_depth_cm: number; flap_allowance_cm: number; joining_allowed: boolean;
  joining_rule: string; joining_allowance_cm: number; standard_waste_rate: number;
  issue_rounding_increment: number; calculation_strategy: string; engine_version: string;
  notes: string | null; approved_at: string | null; approval_reason: string | null; created_at: string;
}

export interface MaterialRequirement {
  inventory_item_id: string; item_code: string; item_name: string; line_type: string; method: QuantityMethod | "MULTIPLE";
  net_quantity: number; waste_rate: number; scrap_rate: number; standard_quantity: number; unit: InventoryUnit;
  current_stock: number; average_unit_cost: number | null; estimated_material_cost: number | null;
  cost_visible: boolean; warnings: Record<string, string>; cutting_profile_version_id: string | null;
  calculation_details: Record<string, unknown>;
}

export interface RequirementResult {
  product_id: string; bom_id: string; bom_version_id: string; bom_version_number: number;
  bom_status: VersionStatus; quantity: number; effective_date: string; warehouse_id: string | null;
  calculation_engine_version: string; materials: MaterialRequirement[]; cost_visible: boolean;
  cost_as_of: string; estimated_material_cost_total: number | null; cost_label: string;
  inventory_side_effect: false; snapshot_id?: string;
}

export interface CuttingResult {
  status: "FEASIBLE" | "NOT_FEASIBLE"; warning?: string | null; selected_orientation?: string;
  cutting_profile_version_id: string; engine_version: string; quantity?: number; total_pieces?: number;
  fabric_width_cm: number; base_piece_width_cm?: number; base_piece_length_cm?: number;
  pieces_across?: number; rows?: number; joining_panels?: number; net_theoretical_length_m?: number;
  technical_allowance_m?: number; gross_technical_length_m?: number; standard_waste_rate?: number;
  standard_waste_m?: number; final_issue_recommendation_m?: number; per_product_m?: number;
  calculation_steps: string[];
}

function asObject<T>(value: Json, label: string): T {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error(`${label} không hợp lệ.`);
  return value as unknown as T;
}

export async function listManufacturingProducts(search = ""): Promise<ManufacturingProduct[]> {
  let query = supabase.from("products").select("id,name,sku,category,in_stock").order("name").limit(500);
  if (search.trim()) query = query.or(`name.ilike.%${search.trim()}%,sku.ilike.%${search.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ManufacturingProduct[];
}

export async function getManufacturingProfile(productId: string): Promise<ManufacturingProfile | null> {
  const { data, error } = await supabase.from("product_manufacturing_profiles").select("*").eq("product_id", productId).maybeSingle();
  if (error) throw error;
  return data as ManufacturingProfile | null;
}

export async function saveManufacturingProfile(input: {
  product_id: string; manufacturing_type: string; finished_width: number; finished_length: number;
  finished_height?: number | null; dimension_unit: string; extra_dimensions?: Json; is_active?: boolean;
}) {
  const { data, error } = await supabase.rpc("save_product_manufacturing_profile", {
    p_product_id: input.product_id, p_manufacturing_type: input.manufacturing_type,
    p_finished_width: input.finished_width, p_finished_length: input.finished_length,
    p_finished_height: input.finished_height ?? null, p_dimension_unit: input.dimension_unit,
    p_extra_dimensions: input.extra_dimensions ?? {}, p_is_active: input.is_active ?? true,
  });
  if (error) throw error;
  return asObject<ManufacturingProfile>(data, "Hồ sơ sản xuất");
}

export async function listBomWorkspace(productId: string) {
  const { data: header, error: headerError } = await supabase.from("bom_headers").select("*").eq("product_id", productId).eq("is_active", true).maybeSingle();
  if (headerError) throw headerError;
  if (!header) return { header: null as BomHeader | null, versions: [] as BomVersion[] };
  const { data: versions, error } = await supabase.from("bom_versions").select("*").eq("bom_id", header.id).order("version_number", { ascending: false });
  if (error) throw error;
  return { header: header as BomHeader, versions: (versions ?? []) as BomVersion[] };
}

export async function listBomLines(versionId: string): Promise<BomLine[]> {
  const { data, error } = await supabase.from("bom_lines").select("*").eq("bom_version_id", versionId).order("sequence");
  if (error) throw error;
  return (data ?? []) as BomLine[];
}

export async function createBomDraft(productId: string, code: string, name: string, cloneVersionId?: string | null) {
  const { data, error } = await supabase.rpc("create_bom_draft", { p_product_id: productId, p_code: code, p_name: name, p_clone_version_id: cloneVersionId ?? null });
  if (error) throw error;
  return asObject<{ header: BomHeader; version: BomVersion }>(data, "Phiên bản BOM");
}

export async function saveBomDraft(versionId: string, input: { effective_from: string | null; effective_to: string | null; notes: string | null; lines: BomLineInput[] }) {
  const { data, error } = await supabase.rpc("save_bom_draft", {
    p_version_id: versionId, p_effective_from: input.effective_from, p_effective_to: input.effective_to,
    p_notes: input.notes, p_lines: input.lines as unknown as Json,
  });
  if (error) throw error;
  return asObject<{ id: string; status: "DRAFT"; line_count: number }>(data, "BOM nháp");
}

export async function approveBomVersion(versionId: string, reason: string) {
  const { data, error } = await supabase.rpc("approve_bom_version", { p_version_id: versionId, p_reason: reason || null, p_supersede_previous: true });
  if (error) throw error;
  return asObject<BomVersion>(data, "BOM đã duyệt");
}

export async function listCuttingProfiles(productId: string): Promise<CuttingProfile[]> {
  const { data, error } = await supabase.from("cutting_profiles").select("*").eq("product_id", productId).eq("is_active", true).order("name");
  if (error) throw error;
  return (data ?? []) as CuttingProfile[];
}

export async function listCuttingVersions(profileId: string): Promise<CuttingVersion[]> {
  const { data, error } = await supabase.from("cutting_profile_versions").select("*").eq("cutting_profile_id", profileId).order("version_number", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CuttingVersion[];
}

export async function createCuttingDraft(input: { product_id: string; code: string; name: string; manufacturing_type: string; clone_version_id?: string | null }) {
  const { data, error } = await supabase.rpc("create_cutting_profile_draft", {
    p_product_id: input.product_id, p_code: input.code, p_name: input.name,
    p_manufacturing_type: input.manufacturing_type, p_clone_version_id: input.clone_version_id ?? null,
  });
  if (error) throw error;
  return asObject<{ profile: CuttingProfile; version: CuttingVersion }>(data, "Cấu hình cắt");
}

export async function saveCuttingDraft(versionId: string, effectiveFrom: string | null, effectiveTo: string | null, configuration: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("save_cutting_profile_draft", {
    p_version_id: versionId, p_effective_from: effectiveFrom, p_effective_to: effectiveTo,
    p_configuration: configuration as Json,
  });
  if (error) throw error;
  return asObject<CuttingVersion>(data, "Cấu hình cắt nháp");
}

export async function approveCuttingVersion(versionId: string, reason: string) {
  const { data, error } = await supabase.rpc("approve_cutting_profile_version", { p_version_id: versionId, p_reason: reason || null, p_supersede_previous: true });
  if (error) throw error;
  return asObject<CuttingVersion>(data, "Cấu hình cắt đã duyệt");
}

export async function calculateCutting(versionId: string, quantity: number, fabricWidthCm?: number | null, allowDraft = false) {
  const { data, error } = await supabase.rpc("calculate_cutting_consumption", {
    p_cutting_profile_version_id: versionId, p_quantity: quantity,
    p_fabric_width_cm: fabricWidthCm ?? null, p_allow_draft: allowDraft,
  });
  if (error) throw error;
  return asObject<CuttingResult>(data, "Kết quả cắt");
}

export async function calculateRequirements(input: { product_id: string; quantity: number; effective_date: string; bom_version_id?: string | null; allow_draft?: boolean; warehouse_id?: string | null; save_snapshot?: boolean }) {
  const { data, error } = await supabase.rpc("calculate_standard_material_requirements", {
    p_product_id: input.product_id, p_quantity: input.quantity, p_effective_date: input.effective_date,
    p_bom_version_id: input.bom_version_id ?? null, p_allow_draft: input.allow_draft ?? false,
    p_warehouse_id: input.warehouse_id ?? null, p_save_snapshot: input.save_snapshot ?? false,
  });
  if (error) throw error;
  return asObject<RequirementResult>(data, "Kết quả nhu cầu vật tư");
}

export async function listBomMaterials(): Promise<InventoryItem[]> {
  const { data, error } = await supabase.from("inventory_items").select("*").order("code");
  if (error) throw error;
  return (data ?? []) as InventoryItem[];
}
