/* eslint-disable @typescript-eslint/no-explicit-any */
import type express from "express";
import {appendPlannedExtras} from './production-planned-extras.js';
import type { PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { pool } from "./db/bootstrap.js";
import { businessDateKey } from './business-date.js';
import {snapshotProductionImages} from './production-reference-images.js';
import {assertZcrmOrderExecutable} from './zcrm-commerce.js';
import {executableEstimateOutput} from './production-uncut-cancellations.js';
import {productionSewingEligibility} from './production-sewing-decision.js';
import {isLaborProduct,productSupplyClassificationState,productSupplySelection} from './product-fulfillment-classification.js';
import {snapshotProductionSewingSelection} from './production-sewing-selection.js';

type Body = Record<string, unknown>;
type Row = Record<string, any>;
type Dependencies = {
  actor: () => string;
  role: () => string;
  transaction: <T>(handler: (client: PoolClient) => Promise<T>) => Promise<T>;
  sendError: (res: express.Response, error: unknown) => void;
};

const fail = (message: string, status = 400): never => {
  throw Object.assign(new Error(message), { status });
};
const positive = (value: unknown, label = "Số lượng") => {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,4})?$/.test(text) || Number(text) <= 0) fail(`${label} phải là số dương, tối đa 4 chữ số thập phân.`);
  return text;
};
const isoDate = (value: unknown, optional = false) => {
  const text = String(value || "").trim();
  if (optional && !text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) fail("Ngày không hợp lệ.");
  return text;
};
const fingerprint = (action: string, body: Body) => createHash("sha256").update(JSON.stringify({ action, body })).digest("hex");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const canonicalItem = (value: unknown): Body => value && typeof value === "object" && !Array.isArray(value) ? value as Body : {};
/** Initial preparation only. Caller owns the order/allocation transaction and permissions. */
export async function createInitialDraftCuttingPlan(client: PoolClient, orderId: string, item: Row, batch: Row, value: unknown, actor: string) {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Dự toán vải ban đầu không hợp lệ.');
  const plan = value as Body, lines = Array.isArray(plan.lines) ? plan.lines as Body[] : [];
  if (!lines.length) fail('Dự toán vải cần ít nhất một vật tư.');
  if (lines.length > 50 || lines.some(line => !line || typeof line !== 'object' || Array.isArray(line))) fail('Dự toán chỉ nhận tối đa 50 dòng vật tư hợp lệ.');
  const reason = String(plan.reason || '').trim();
  if (lines.length > 1 && !reason) fail('Dùng nhiều loại vải cần ghi lý do dự toán.');
  const variants = lines.map(line => String(line.fabric_variant_id || item.fabric_variant_id || ''));
  await lockFabricVariantCutover(client, variants.filter(Boolean));
  const checked: Array<{inventory:string;warehouse:string;variant:string;metres:string;reason:string}> = [];
  const seen = new Set<string>();
  for (const [index,line] of lines.entries()) {
    const inventory = String(line.inventory_item_id || ''), warehouse = String(line.warehouse_id || ''), variant = variants[index];
    if (!uuidPattern.test(inventory) || !uuidPattern.test(warehouse)) fail(`Vải dòng ${index + 1} thiếu vật tư hoặc kho.`);
    const duplicate = [inventory,warehouse,variant].join('|');
    if (seen.has(duplicate)) fail('Một vật tư/kho/biến thể chỉ được nhập một lần trong dự toán.');
    seen.add(duplicate);
    const material = (await client.query('select base_unit from local_inventory_items where id=$1 and is_active for share',[inventory])).rows[0];
    if (!material || material.base_unit !== 'METER') fail('Dự toán mét vải phải chọn vật tư đang hoạt động có đơn vị METER.',409);
    if (!(await client.query('select 1 from local_inventory_warehouses where id=$1 and is_active for share',[warehouse])).rows[0]) fail('Kho dự toán không tồn tại hoặc đã ngừng dùng.',409);
    if (variant) {
      if (!(await client.query('select 1 from local_fabric_variants where id=$1 for share',[variant])).rows[0]) fail('Biến thể vải không còn tồn tại trong danh mục local.',409);
      if (!(await client.query('select 1 from local_fabric_inventory_item_mappings where fabric_variant_id=$1 and inventory_item_id=$2 and is_active for share',[variant,inventory])).rows[0]) fail('Biến thể vải chưa được ánh xạ rõ ràng sang vật tư kho.',409);
      if (item.fabric_variant_id && variant !== String(item.fabric_variant_id) && !reason) fail('Dùng vải khác dòng sản phẩm cần ghi lý do dự toán.',409);
    }
    const override = String(line.override_reason || '').trim();
    if (!override) fail('Dự toán thủ công phải có lý do.');
    if (typeof line.estimated_quantity !== 'string' || line.estimated_quantity !== line.estimated_quantity.trim()) fail('Mét vải dự toán phải là chuỗi số dương, tối đa 4 chữ số thập phân.');
    checked.push({inventory,warehouse,variant,metres:positive(line.estimated_quantity,'Mét vải dự toán'),reason:override});
  }
  const estimate = (await client.query(`insert into local_cutting_estimates(production_order_id,production_batch_id,version_number,no_material_required,reason,created_by,estimate_kind)
    values($1,$2,1,false,$3,$4,'BASE') returning *`,[orderId,batch.id,reason || null,actor])).rows[0];
  const created=[];
  for (const line of checked) created.push((await client.query(`insert into local_cutting_estimate_lines(estimate_id,order_item_id,fabric_variant_id,inventory_item_id,warehouse_id,output_quantity,calculation_method,unit_per_output,waste_rate,waste_already_included,estimated_quantity,calculation_snapshot,override_reason)
    values($1,$2,$3,$4,$5,$6,'MANUAL_MEASURED',null,0,false,$7,$8::jsonb,$9) returning *`,[estimate.id,item.id,line.variant || null,line.inventory,line.warehouse,batch.planned_quantity,line.metres,JSON.stringify({entered_quantity:line.metres,source:'INITIAL_DRAFT_PREPARATION',multi_material_reason:reason || null}),line.reason])).rows[0]);
  return {...estimate,lines:created};
}
const explicitSourceLineIdentity = (item: Body) => String(item.id || item.quote_item_id || item.quoteItemId || item.line_id || item.lineId || "").trim();
const specificationSourceLineIdentity = (item: Body) => {
  const nested = canonicalItem(item.product);
  return createHash("sha256").update(JSON.stringify({
    product_id: item.product_id || nested.id || null,
    original_product_id: item.originalProductId || null,
    sku: item.sku || nested.sku || null,
    color: item.color || null,
    size: item.size || null,
    dimensions: item.dimensions || item.specifications || nested.specifications || null,
    fabric_variant_id: item.fabric_variant_id || null,
  })).digest("hex").slice(0, 24);
};
const sourceLineKey = (orderId: string, identity: string) => `sale:${orderId}:${identity}`;
const sourceProductCandidate = (item: Body) => {
  const nested = canonicalItem(item.product);
  return String(item.product_id || item.originalProductId || nested.id || item.id || "");
};
const normalizedDecimal = (value: unknown) => {
  const match = String(value ?? "").trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const integer = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] || "").replace(/0+$/, "");
  return `${match[1] === "-" ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
};
export const sameProductionLine = (current: Row | undefined, saved: Row) => {
  if (!current || String(current.product_id || "") !== String(saved.product_id || "") || normalizedDecimal(current.ordered_quantity) !== normalizedDecimal(saved.ordered_quantity)) return false;
  const snapshot = canonicalItem(saved.source_line_snapshot);
  const dimensions = snapshot.dimensions || snapshot.specifications || canonicalItem(snapshot.product).specifications || null;
  return JSON.stringify(current.color ?? null) === JSON.stringify(snapshot.color ?? null)
    && JSON.stringify(current.size ?? null) === JSON.stringify(snapshot.size ?? null)
    && JSON.stringify(current.dimensions ?? null) === JSON.stringify(dimensions);
};
export const currentProductionLine = (lines: Row[], saved: Row) =>
  lines.find((line) => line.source_line_key === saved.source_line_key)
  || lines.find((line) => line.source_line_index === saved.source_line_index && String(saved.source_line_key || "").split(":").length > 3);

export async function normalizeOrderLines(client: Pick<PoolClient, "query">, order: Row) {
  const items = Array.isArray(order.items) ? order.items.map(canonicalItem) : [];
  const candidates = items.map(sourceProductCandidate).filter((id) => uuidPattern.test(id));
  const products = candidates.length ? (await client.query("select id,sku,name from local_products where id=any($1::uuid[]) and is_active", [candidates])).rows : [];
  const productMap = new Map(products.map((row: Row) => [String(row.id), row]));
  const explicitIdentities = items.map(explicitSourceLineIdentity);
  const productIdentities = items.map(sourceProductCandidate);
  const count = (values: string[]) => values.reduce((map, value) => value ? map.set(value, (map.get(value) || 0) + 1) : map, new Map<string, number>());
  const explicitCounts = count(explicitIdentities), productCounts = count(productIdentities);
  const identities = items.map((item, index) => {
    const explicit = explicitIdentities[index];
    if (explicit && explicitCounts.get(explicit) === 1) return explicit;
    const product = productIdentities[index];
    if (!explicit && product && productCounts.get(product) === 1) return product;
    return specificationSourceLineIdentity(item);
  });
  const ambiguous = [...count(identities).entries()].find(([, occurrences]) => occurrences > 1);
  if (ambiguous) fail("Đơn có nhiều dòng trùng sản phẩm và quy cách nhưng thiếu mã dòng báo giá duy nhất. Hãy mở đơn/báo giá, lưu lại để mỗi dòng có ID riêng rồi gửi sản xuất lại.", 409);
  return items.map((item, index) => {
    const product = productMap.get(sourceProductCandidate(item));
    const quantity = Number(item.quantity || 0);
    return {
      source_line_key: sourceLineKey(String(order.id), identities[index]),
      source_line_index: index,
      source_line_snapshot: item,
      product_id: product?.id || null,
      product_sku: product?.sku || String(item.sku || canonicalItem(item.product).sku || ""),
      product_name: product?.name || String(item.name || item.product_name || canonicalItem(item.product).name || `Dòng ${index + 1}`),
      ordered_quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
      color: item.color || null,
      size: item.size || null,
      dimensions: item.dimensions || item.specifications || canonicalItem(item.product).specifications || null,
    };
  });
}

function resolveDimension(value: unknown, unit: string): number {
  const n = Number(value);
  if (!(n > 0)) fail("Hồ sơ sản phẩm chưa có kích thước hợp lệ.");
  if (unit === "MM") return n / 10;
  if (unit === "CM") return n;
  if (unit === "METER") return n * 100;
  return fail("Đơn vị kích thước sản phẩm chưa được hỗ trợ.");
}
function ruleDimension(rule: string, width: number, length: number, height: number, tuck: number, flap: number, parameter: unknown): number {
  if (rule === "FINISHED_WIDTH") return width;
  if (rule === "FINISHED_LENGTH") return length;
  if (rule === "FINISHED_WIDTH_PLUS_2_HEIGHT_TUCK") return width + 2 * (height + tuck);
  if (rule === "FINISHED_LENGTH_PLUS_2_HEIGHT_TUCK") return length + 2 * (height + tuck);
  if (rule === "DOUBLE_FINISHED_LENGTH_PLUS_FLAP") return 2 * length + flap;
  if (rule === "PARAMETER" || rule === "FIXED") return Number(parameter);
  return fail(`Quy tắc kích thước cắt ${rule} chưa được hỗ trợ.`);
}
export async function cuttingGrid(client: Pick<PoolClient, "query">, versionId: string, quantity: number, fabricWidthOverride?: unknown, allowDraft = false) {
  if (!Number.isInteger(quantity) || quantity <= 0) fail("Số lượng dùng sơ đồ cắt phải là số nguyên dương.");
  const result = await client.query(`select v.id,v.status,v.version_number,v.payload,p.product_id,p.payload profile_payload,
    (select m.payload from local_manufacturing_records m where m.record_type='manufacturing_profile' and m.product_id=p.product_id and coalesce((m.payload->>'is_active')::boolean,true) order by m.updated_at desc limit 1) manufacturing_payload
    from local_manufacturing_records v join local_manufacturing_records p on p.id=v.parent_id and p.record_type='cutting_profile'
    where v.id=$1 and v.record_type='cutting_version'
      and (v.status in ('APPROVED','SUPERSEDED') or ($2::boolean and v.status='DRAFT'))`, [versionId, allowDraft]);
  const row = result.rows[0];
  if (!row) fail("Không tìm thấy cấu hình cắt đã duyệt.");
  const v = { ...canonicalItem(row.payload), id: row.id, status: row.status, version_number: row.version_number, product_id: row.product_id } as Row;
  const m = canonicalItem(row.manufacturing_payload);
  if (!Object.keys(m).length) fail("Sản phẩm chưa có hồ sơ kích thước sản xuất.", 409);
  if (!["STANDARD", "GRID"].includes(String(v.calculation_strategy || "").toUpperCase())) fail("Chiến lược cấu hình cắt này chưa được hỗ trợ.");
  const width = resolveDimension(m.finished_width, String(m.dimension_unit)), length = resolveDimension(m.finished_length, String(m.dimension_unit));
  const height = m.finished_height == null ? 0 : resolveDimension(m.finished_height, String(m.dimension_unit));
  const seam = Number(v.seam_allowance_cm || 0), hem = Number(v.hem_allowance_cm || 0), tuck = Number(v.tuck_depth_cm || 0), flap = Number(v.flap_allowance_cm || 0);
  const baseWidth = ruleDimension(v.piece_width_rule, width, length, height, tuck, flap, v.piece_width_parameter_cm);
  const baseLength = ruleDimension(v.piece_length_rule, width, length, height, tuck, flap, v.piece_length_parameter_cm);
  const fabricWidth = Number(fabricWidthOverride || v.default_fabric_width_cm), pieces = Number(v.pieces_per_product), repeat = Number(v.pattern_repeat_cm || 0), rounding = Number(v.issue_rounding_increment || 0);
  if (!(baseWidth > 0 && baseLength > 0 && fabricWidth > 0 && Number.isInteger(pieces) && pieces > 0 && seam >= 0 && hem >= 0 && rounding > 0)) fail("Cấu hình cắt thiếu kích thước, số chi tiết hoặc bước làm tròn hợp lệ.");
  if (v.requires_matching_pattern && !(repeat > 0)) fail("Vải canh hoa cần bước lặp hoa văn lớn hơn 0.");
  const totalPieces = quantity * pieces;
  const candidate = (across: number, netRow: number, grossRow: number, orientation: string) => {
    if (across <= 0) return null;
    const rows = Math.ceil(totalPieces / across);
    const roundedRow = v.requires_matching_pattern ? Math.ceil(grossRow / repeat) * repeat : grossRow;
    const net = rows * netRow / 100, gross = rows * roundedRow / 100;
    return { orientation, pieces_across: across, rows, joining_panels: 1, net, gross, projected: gross * (1 + Number(v.standard_waste_rate || 0) / 100) };
  };
  const normal = candidate(Math.floor(fabricWidth / (baseWidth + 2 * seam)), baseLength, baseLength + 2 * hem, "NORMAL");
  const rotated = v.allow_rotation && v.pattern_direction !== "ONE_DIRECTION" ? candidate(Math.floor(fabricWidth / (baseLength + 2 * hem)), baseWidth, baseWidth + 2 * seam, "ROTATED") : null;
  let selected = rotated && (!normal || rotated.projected < normal.projected) ? rotated : normal;
  let warning: string | null = null;
  if (!selected && v.joining_allowed && v.joining_rule === "MULTI_PANEL_LENGTHWISE") {
    const allowance = Number(v.joining_allowance_cm || 0);
    if (!(fabricWidth > allowance)) fail("Phụ cấp ghép phải nhỏ hơn khổ vải.");
    const panels = Math.ceil((baseWidth + 2 * seam - allowance) / (fabricWidth - allowance));
    const rowLength = v.requires_matching_pattern ? Math.ceil((baseLength + 2 * hem) / repeat) * repeat : baseLength + 2 * hem;
    selected = { orientation: "JOINED_LENGTHWISE", pieces_across: 1, rows: totalPieces, joining_panels: panels, net: totalPieces * baseLength * panels / 100, gross: totalPieces * rowLength * panels / 100, projected: 0 };
    warning = "Kết quả dùng ghép nhiều tấm dọc; quản lý cần xác nhận trước khi cấp vải.";
  }
  if (!selected) return fail("NOT_FEASIBLE: Khổ vải không đủ và chưa có quy tắc ghép phù hợp.");
  const waste = selected.gross * Number(v.standard_waste_rate || 0) / 100;
  const final = Math.ceil((selected.gross + waste) / rounding) * rounding;
  return {
    status: "FEASIBLE", product_id: row.product_id, cutting_profile_version_id: v.id, engine_version: v.engine_version,
    selected_orientation: selected.orientation, quantity, pieces_per_product: pieces, total_pieces: totalPieces,
    fabric_width_cm: fabricWidth, base_piece_width_cm: baseWidth, base_piece_length_cm: baseLength,
    pieces_across: selected.pieces_across, rows: selected.rows, joining_panels: selected.joining_panels,
    net_theoretical_length_m: Number(selected.net.toFixed(4)), technical_allowance_m: Number((selected.gross - selected.net).toFixed(4)),
    gross_technical_length_m: Number(selected.gross.toFixed(4)), standard_waste_rate: Number(v.standard_waste_rate || 0),
    standard_waste_m: Number(waste.toFixed(4)), issue_rounding_increment_m: rounding,
    final_issue_recommendation_m: Number(final.toFixed(4)), per_product_m: Number((final / quantity).toFixed(4)), warning,
  };
}

export function cuttingRequirementForOutput(line: Row, outputQuantity: string | number) {
  const output = Number(outputQuantity);
  if (!(output > 0)) return 0;
  const calculationMethod = String(line.calculation_method || "").toUpperCase();
  if (calculationMethod === "MANUAL_MEASURED") return Number(line.estimated_quantity);
  if (calculationMethod === "BOM_STANDARD") {
    const snapshot = canonicalItem(line.calculation_snapshot);
    const method = String(snapshot.quantity_method || "").toUpperCase();
    const standard = Number(snapshot.standard_quantity || 0);
    const wasteRate = Number(snapshot.waste_rate || 0) + Number(snapshot.scrap_rate || 0);
    let multiplier = output;
    if (method === "FIXED") multiplier = 1;
    else if (method === "FORMULA") {
      const batchSize = Number(canonicalItem(snapshot.formula_parameters).batch_size || 0);
      if (String(snapshot.formula_type || "").toUpperCase() !== "PER_BATCH" || !(batchSize > 0)) fail("Ảnh chụp công thức PER_BATCH không hợp lệ.", 409);
      multiplier = Math.ceil(output / batchSize);
    } else if (method !== "PER_UNIT") fail("Ảnh chụp phương pháp BOM không được hỗ trợ.", 409);
    return Number((standard * multiplier * (1 + wasteRate / 100)).toFixed(4));
  }
  if (calculationMethod !== "CUTTING_ENGINE") {
    const originalOutput = Number(line.output_quantity || 0);
    if (!(originalOutput > 0)) fail("Dự toán thiếu số lượng đầu ra hợp lệ.", 409);
    return Number(line.estimated_quantity) * output / originalOutput;
  }
  const snapshot = canonicalItem(line.calculation_snapshot);
  const pieces = Number(snapshot.pieces_per_product || 0);
  const across = Number(snapshot.pieces_across || 0);
  const originalRows = Number(snapshot.rows || 0);
  const originalGross = Number(snapshot.gross_technical_length_m || 0);
  const wasteRate = Number(snapshot.standard_waste_rate || 0);
  const rounding = Number(snapshot.issue_rounding_increment_m || 0);
  if (!(pieces > 0 && across > 0 && originalRows > 0 && originalGross > 0 && rounding > 0)) fail("Ảnh chụp sơ đồ cắt không đủ dữ liệu để bảo vệ lượng vải đã cấp.", 409);
  const rows = Math.ceil(output * pieces / across);
  const gross = rows * (originalGross / originalRows);
  return Number((Math.ceil(((gross * (1 + wasteRate / 100)) / rounding) - 1e-10) * rounding).toFixed(4));
}

type BomMaterialCalculation = {
  method: string;
  standardQuantity: number;
  plannedQuantity: number;
  wasteQuantity: number;
  cuttingProfileVersionId: string | null;
  snapshot: Body;
};

export async function calculateBomMaterialLine(client: Pick<PoolClient, "query">, line: Row, outputQuantity: number, effectiveDate?: unknown): Promise<BomMaterialCalculation> {
  const method = String(line.quantity_method || "PER_UNIT").trim().toUpperCase();
  const standard = Number(line.standard_quantity || 0);
  const wasteRate = Number(line.waste_rate || 0);
  const scrapRate = Number(line.scrap_rate || 0);
  if (method === "CUTTING_ENGINE") {
    if (String(line.unit || "").toUpperCase() !== "METER") fail("Định mức dùng sơ đồ cắt phải có đơn vị METER.", 409);
    const version = (await client.query(`select v.id from local_manufacturing_records v where v.record_type='cutting_version' and v.parent_id=$1
      and v.status in ('APPROVED','SUPERSEDED') and coalesce(nullif(v.payload->>'effective_from','')::date,'-infinity'::date)<=coalesce($2::date,current_date)
      and coalesce(nullif(v.payload->>'effective_to','')::date,'infinity'::date)>=coalesce($2::date,current_date)
      order by coalesce(nullif(v.payload->>'effective_from','')::date,'-infinity'::date) desc,v.version_number desc limit 1`, [line.cutting_profile_id, effectiveDate || null])).rows[0];
    if (!version) fail("BOM chưa trỏ tới hồ sơ cắt có phiên bản hiệu lực đã duyệt.", 409);
    const snapshot = await cuttingGrid(client, String(version.id), outputQuantity);
    return {
      method,
      standardQuantity: 0,
      plannedQuantity: Number(snapshot.final_issue_recommendation_m),
      wasteQuantity: Number(snapshot.standard_waste_m || 0),
      cuttingProfileVersionId: String(version.id),
      snapshot: { source: "APPROVED_BOM", ...snapshot },
    };
  }
  if (!(standard > 0)) fail(`Định mức ${method} phải có số lượng chuẩn lớn hơn 0.`, 409);
  let multiplier = outputQuantity;
  if (method === "FIXED") multiplier = 1;
  else if (method === "FORMULA") {
    if (String(line.formula_type || "").toUpperCase() !== "PER_BATCH") fail("Chỉ hỗ trợ công thức BOM FORMULA/PER_BATCH.", 409);
    const parameters = canonicalItem(line.formula_parameters);
    const batchSize = Number(parameters.batch_size || 0);
    if (!(batchSize > 0)) fail("Công thức PER_BATCH thiếu batch_size hợp lệ.", 409);
    multiplier = Math.ceil(outputQuantity / batchSize);
  } else if (method !== "PER_UNIT") fail(`Phương pháp định mức ${method} chưa được hỗ trợ.`, 409);
  const base = standard * multiplier;
  const waste = base * (wasteRate + scrapRate) / 100;
  return {
    method,
    standardQuantity: standard,
    plannedQuantity: Number((base + waste).toFixed(6)),
    wasteQuantity: Number(waste.toFixed(6)),
    cuttingProfileVersionId: null,
    snapshot: {
      source: "APPROVED_BOM",
      output_quantity: outputQuantity,
      quantity_method: method,
      multiplier,
      standard_quantity: standard,
      waste_rate: wasteRate,
      scrap_rate: scrapRate,
      formula_type: line.formula_type || null,
      formula_parameters: canonicalItem(line.formula_parameters),
    },
  };
}

export async function lockFabricVariantCutover(client: Pick<PoolClient, "query">, variantIds: unknown[]) {
  const ids = [...new Set(variantIds.map((value) => String(value || "").trim()).filter(Boolean))].sort();
  for (const id of ids) await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`fabric-ledger-cutover:${id}`]);
  return ids;
}

export async function assertLegacyFabricVariantsWritable(client: Pick<PoolClient, "query">, variantIds: unknown[]) {
  const ids = await lockFabricVariantCutover(client, variantIds);
  if (!ids.length) return;
  const mapped = await client.query("select fabric_variant_id from local_fabric_inventory_item_mappings where is_active and fabric_variant_id=any($1::text[]) limit 1", [ids]);
  if (mapped.rows[0]) fail("Biến thể vải đã chuyển sang sổ kho local. Chỉ được thao tác tại Kho vật tư; dữ liệu kho vải cũ chỉ còn để tra cứu lịch sử.", 409);
}

export function registerProductionSalesWorkflow(app: express.Express, d: Dependencies) {
  const privileged = () => ["admin", "manager"].includes(d.role());
  async function capability(client: Pick<PoolClient, "query">, names: string[]) {
    if (privileged()) return;
    const allowed = await client.query("select 1 from local_employee_permissions where user_id=$1 and permission_type=any($2::text[]) and enabled limit 1", [d.actor(), names]);
    if (!allowed.rows[0]) fail("Tài khoản chưa được cấp quyền cho quy trình sản xuất.", 403);
  }
  async function manage(client: Pick<PoolClient, "query">) { await capability(client, ["production_manage", "production_sales_workflow"]); }
  type FulfillmentProjection = { fulfillment_route:'SEW'|'PURCHASE'|'UNCLASSIFIED';fulfillment_status:'CONFIRMED'|'UNCLASSIFIED'|'REVIEW';fulfillment_reason:string;fulfillment_requires_split:boolean;fulfillment_revision:number;product_active:boolean;product_labor:boolean;sewing_selection_allowed:boolean;sewing_selection_reason:string|null };
  const unresolvedFulfillment=(reason:string):FulfillmentProjection=>({fulfillment_route:'UNCLASSIFIED',fulfillment_status:'UNCLASSIFIED',fulfillment_reason:reason,fulfillment_requires_split:false,fulfillment_revision:0,product_active:false,product_labor:false,sewing_selection_allowed:false,sewing_selection_reason:reason});
  /** Uses the canonical classification state; suggestions are never an automatic route. */
  async function fulfillmentForLines(client: Pick<PoolClient,'query'>, lines: Row[], lockProducts=false) {
    const ids=[...new Set(lines.map(line=>String(line.product_id||'')).filter(id=>uuidPattern.test(id)))].sort();
    if(lockProducts){
      const priceListIds:string[]=[];
      for(const id of ids){const pointer=(await client.query('select id,price_list_id from local_products where id=$1 for update',[id])).rows[0];if(pointer?.price_list_id)priceListIds.push(String(pointer.price_list_id));}
      for(const id of [...new Set(priceListIds)].sort())await client.query('select id from local_price_lists where id=$1 for share',[id]);
    }
    const products=ids.length?(await client.query(productSupplySelection+' where p.id=any($1::uuid[])',[ids])).rows:[];
    const productMap=new Map(products.map((row:Row)=>[String(row.id),row]));
    const classifications=new Map<string,Row>();
    if(lockProducts){
      for(const id of ids){const current=(await client.query('select * from local_product_supply_classifications where product_id=$1 order by version desc limit 1 for update',[id])).rows[0];if(current)classifications.set(id,current);}
    }else if(ids.length){
      for(const current of (await client.query('select distinct on(product_id) * from local_product_supply_classifications where product_id=any($1::uuid[]) order by product_id,version desc',[ids])).rows)classifications.set(String(current.product_id),current);
    }
    const result=new Map<string,FulfillmentProjection>();
    for(const id of ids){
      const product=productMap.get(id);
      if(!product){result.set(id,unresolvedFulfillment('Sản phẩm không còn trong danh mục local.'));continue;}
      if(isLaborProduct(product)){result.set(id,{...unresolvedFulfillment('Mã công may không phải là hàng bán để lập lệnh.'),product_active:Boolean(product.is_active),product_labor:true});continue;}
      if(product.is_active===false){result.set(id,{...unresolvedFulfillment('Sản phẩm đã ngừng dùng; cần cập nhật đơn bán trước khi lập lệnh.'),product_active:false,product_labor:false});continue;}
      const state=productSupplyClassificationState(product, classifications.get(id));
      result.set(id,{fulfillment_route:state.route,fulfillment_status:state.status,fulfillment_reason:state.reason,fulfillment_requires_split:state.requires_split,fulfillment_revision:state.revision,product_active:true,product_labor:false,...productionSewingEligibility(product,state)});
    }
    return result;
  }
  const withFulfillment=(line:Row, state:FulfillmentProjection|undefined)=>{
    const current=state||unresolvedFulfillment('Dòng đơn chưa khớp sản phẩm local; cần Sale cập nhật danh mục.');
    const {product_active: _active,product_labor: _labor,...publicState}=current;
    return {...line,...publicState};
  };
  async function submittedQuantities(client: Pick<PoolClient,'query'>, orderIds: string[]) {
    if(!orderIds.length)return new Map<string,string>();
    const rows=(await client.query(`select r.order_id,l.source_line_key,coalesce(sum(l.requested_quantity),0) quantity
      from local_production_sales_request_lines l join local_production_sales_requests r on r.id=l.request_id
      where r.order_id=any($1::text[]) and r.status not in ('RETURNED','CANCELLED') group by r.order_id,l.source_line_key`,[orderIds])).rows;
    return new Map(rows.map((row:Row)=>[`${row.order_id}:${row.source_line_key}`,String(row.quantity)]));
  }
  function sourceLineProjection(line: Row, supply: Map<string,FulfillmentProjection>, submitted: Map<string,string>, orderId:string) {
    const submittedQuantity=submitted.get(`${orderId}:${line.source_line_key}`)||'0';
    const remaining=Math.max(0,Number(line.ordered_quantity||0)-Number(submittedQuantity));
    return withFulfillment({...line,submitted_quantity:submittedQuantity,remaining_quantity:Number.isFinite(remaining)?String(remaining):'0'},line.product_id?supply.get(String(line.product_id)):undefined);
  }
  async function assertRemakeEstimateAllowance(client: PoolClient, estimate: Row) {
    if (estimate.estimate_kind !== "REMAKE") return null;
    const source = (await client.query("select * from local_production_stage_events where id=$1 for update", [estimate.source_stage_event_id])).rows[0];
    if (!source || source.stage !== "CUTTING" || !["APPROVED", "LOCKED"].includes(source.status)) fail("Báo cáo cắt nguồn không còn đủ điều kiện cấp vật tư làm lại.", 409);
    if (String(source.production_order_id) !== String(estimate.production_order_id) || String(source.production_batch_id) !== String(estimate.production_batch_id)) fail("Dự toán làm lại không cùng lệnh/lô với báo cáo cắt nguồn.", 409);
    const held = (await client.query("select coalesce(sum(remake_quantity),0) quantity from local_cutting_estimates where source_stage_event_id=$1 and estimate_kind='REMAKE' and status in ('SUBMITTED','APPROVED')", [source.id])).rows[0].quantity;
    if ((await client.query("select $1::numeric>$2::numeric exceeds", [held, source.quantity_remake])).rows[0].exceeds) fail("Tổng dự toán làm lại vượt số lượng làm lại của báo cáo cắt nguồn.", 409);
    return source as Row;
  }
  async function mutate(action: string, body: Body, handler: (client: PoolClient) => Promise<Row>) {
    const key = String(body.idempotency_key || "").trim();
    if (!key || key.length > 200) fail("Cần khóa chống gửi trùng hợp lệ.");
    const hash = fingerprint(action, body);
    return d.transaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtextextended('production-source-sync',0))");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`production-workflow:${key}`]);
      const replay = (await client.query("select * from local_production_workflow_requests where idempotency_key=$1", [key])).rows[0];
      if (replay) {
        if (replay.actor_id !== d.actor() || replay.action !== action || replay.fingerprint !== hash) fail("Khóa chống gửi trùng đã dùng cho thao tác khác.", 409);
        return { ...replay.result, reused: true };
      }
      const result = await handler(client);
      await client.query("insert into local_production_workflow_requests(idempotency_key,actor_id,action,fingerprint,result) values($1,$2,$3,$4,$5::jsonb)", [key, d.actor(), action, hash, JSON.stringify(result)]);
      return result;
    });
  }

  // Registered before the legacy snapshot route: all new pickers use canonical local orders.
  app.get("/api/production/source-orders", async (req, res) => {
    try {
      const params: unknown[] = [];
      let scope = "lower(coalesce(o.status,'')) not in ('cancelled','returned')";
      if (!privileged()) {
        await capability(pool, ["production_sales_submit", "production_sales_workflow", "production_view", "production_manage"]);
        params.push(d.actor());
        scope += ` and (o.manager_id=$${params.length} or o.assignee_id=$${params.length})`;
      }
      const exactOrderId=String(req.query.order_id||'').trim();
      if(exactOrderId&&(exactOrderId.length>200||/[\x00-\x1f\x7f]/.test(exactOrderId)))fail('Mã đơn nguồn không hợp lệ.');
      if(exactOrderId){params.push(exactOrderId);scope+=` and o.id=$${params.length}`;}
      const rows = (await pool.query(`select o.* from local_orders o where ${scope} order by coalesce(o.updated_at,o.created_at) desc nulls last limit ${exactOrderId?'1':'500'}`, params)).rows;
      const submitted=await submittedQuantities(pool,rows.map((row:Row)=>String(row.id)));
      const committedRows=rows.length?(await pool.query(`select r.order_id,l.source_line_key,coalesce(sum(a.quantity),0) quantity from local_production_sales_request_lines l join local_production_sales_requests r on r.id=l.request_id join local_production_sales_allocations a on a.request_line_id=l.id where r.order_id=any($1::text[]) group by r.order_id,l.source_line_key`,[rows.map((row:Row)=>String(row.id))])).rows:[];
      const committed=new Map<string,string>(committedRows.map((row:Row)=>[`${row.order_id}:${row.source_line_key}`,String(row.quantity)]));
      const output = [];
      for (const order of rows) {
        try {
          const items = await normalizeOrderLines(pool, order);
          output.push({ id: order.id, order_number: order.order_number, display_order_number: order.display_order_number, status: order.status, delivery_date: order.delivery_date, total_amount: Number(order.total_amount || 0), updated_at: order.updated_at, items });
        } catch (error) {
          if ((error as { status?: number }).status !== 409) throw error;
          output.push({ id: order.id, order_number: order.order_number, display_order_number: order.display_order_number, status: order.status, delivery_date: order.delivery_date, total_amount: Number(order.total_amount || 0), updated_at: order.updated_at, items: [], source_validation_error: error instanceof Error ? error.message : String(error) });
        }
      }
      const supply=await fulfillmentForLines(pool,output.flatMap((row:Row)=>row.items as Row[]));
      res.json(output.map((row:Row)=>({...row,items:(row.items as Row[]).map(line=>({...sourceLineProjection(line,supply,submitted,String(row.id)),direct_remaining_quantity:String(Math.max(0,Number(line.ordered_quantity)-Number(committed.get(`${row.id}:${line.source_line_key}`)||0)))}))})));
    } catch (error) { d.sendError(res, error); }
  });

  app.get("/api/production-sales/requests", async (req, res) => {
    try {
      const mine = ['1','true'].includes(String(req.query.mine || ""));
      const purchaseScope = String(req.query.scope || '') === 'purchase';
      if (!mine) await manage(pool);
      if(purchaseScope){await capability(pool,['inventory_view']);await capability(pool,['inventory_documents']);}
      const params: unknown[] = mine || purchaseScope ? [d.actor()] : [];
      const clause = purchaseScope ? 'where (r.submitted_by=$1 or o.manager_id=$1 or o.assignee_id=$1)' : mine ? 'where r.submitted_by=$1' : '';
      const requests = (await pool.query(`select r.*,o.order_number,o.display_order_number,o.status order_status,o.updated_at order_updated_at,o.items order_items,
        coalesce((select sum(l.requested_quantity) from local_production_sales_request_lines l where l.request_id=r.id),0) requested_quantity,
        coalesce((select sum(a.quantity) from local_production_sales_allocations a join local_production_sales_request_lines l on l.id=a.request_line_id where l.request_id=r.id),0) allocated_quantity
        from local_production_sales_requests r join local_orders o on o.id=r.order_id ${clause} order by r.submitted_at desc`, params)).rows;
      const ids = requests.map((row: Row) => row.id);
      const hasPurchasePlans=Boolean((await pool.query("select to_regclass('public.local_purchase_fulfillment_plans') relation")).rows[0]?.relation);
      const planProjection=hasPurchasePlans?"(select p.id from local_purchase_fulfillment_plans p where p.sales_request_line_id=l.id order by p.created_at desc,p.id desc limit 1)":'null::uuid';
      const lines = ids.length ? (await pool.query(`select l.*,${planProjection} purchase_fulfillment_plan_id,coalesce((select sum(a.quantity) from local_production_sales_allocations a where a.request_line_id=l.id),0) allocated_quantity from local_production_sales_request_lines l where l.request_id=any($1::uuid[]) order by l.source_line_index`, [ids])).rows : [];
      const supply=await fulfillmentForLines(pool,lines);
      const output = [];
      for (const row of requests) {
        const requestLines = lines.filter((line: Row) => line.request_id === row.id);
        const projectedLines=requestLines.map((line:Row)=>withFulfillment(line,line.product_id?supply.get(String(line.product_id)):undefined));
        try {
          const currentLines = await normalizeOrderLines(pool, { id: row.order_id, items: row.order_items });
          const sourceChanged = ["cancelled", "returned"].includes(String(row.order_status || "").toLowerCase()) || requestLines.some((line: Row) => {
            const current = currentProductionLine(currentLines, line);
            return !sameProductionLine(current, line);
          });
          output.push({ ...row, order_items: undefined, source_changed: sourceChanged, lines: projectedLines });
        } catch (error) {
          if ((error as { status?: number }).status !== 409) throw error;
          output.push({ ...row, order_items: undefined, source_changed: true, source_validation_error: error instanceof Error ? error.message : String(error), lines: projectedLines });
        }
      }
      res.json(output);
    } catch (error) { d.sendError(res, error); }
  });

  app.post("/api/production-sales/requests", async (req, res) => {
    try {
      const result = await mutate("SALE_SUBMIT", req.body || {}, async (client) => {
        await capability(client, ["production_sales_submit", "production_sales_workflow"]);
        const orderId = String(req.body.order_id || ""), input = Array.isArray(req.body.lines) ? req.body.lines as Body[] : [];
        if (!orderId || !input.length) fail("Chọn đơn và ít nhất một dòng cần sản xuất.");
        const order = (await client.query("select * from local_orders where id=$1 for update", [orderId])).rows[0];
        if (!order || ["cancelled", "returned"].includes(String(order.status || "").toLowerCase())) fail("Đơn không còn đủ điều kiện gửi sản xuất.");
        if (!privileged() && order.manager_id !== d.actor() && order.assignee_id !== d.actor()) fail("Chỉ Sale phụ trách đơn được gửi sản xuất.", 403);
        const sourceLines = await normalizeOrderLines(client, order), sourceMap = new Map(sourceLines.map((line) => [line.source_line_key, line]));
        const priority = String(req.body.priority || "NORMAL").toUpperCase();
        if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority)) fail("Độ ưu tiên không hợp lệ.");
        const due = isoDate(req.body.due_date, true);
        const created = await client.query(`insert into local_production_sales_requests(order_id,order_updated_at_snapshot,due_date,priority,notes,submitted_by,idempotency_key)
          values($1,$2,$3,$4,$5,$6,$7) returning *`, [orderId, order.updated_at, due, priority, req.body.notes || null, d.actor(), req.body.idempotency_key]);
        const resultLines = [];
        const submittedKeys = new Set<string>();
        for (const [index, submitted] of input.entries()) {
          const submittedKey = String(submitted.source_line_key || "");
          if (submittedKeys.has(submittedKey)) fail(`Dòng ${index + 1} bị chọn lặp trong cùng yêu cầu.`, 409);
          submittedKeys.add(submittedKey);
          const source = sourceMap.get(submittedKey) as Row | undefined;
          if (!source || !source.product_id || !(source.ordered_quantity > 0)) fail(`Dòng ${index + 1} không còn khớp sản phẩm local hoặc thiếu số lượng.`);
          const sourceRow = source as Row;
          const qty = positive(submitted.quantity, `Số lượng dòng ${index + 1}`);
          const held = await client.query(`select coalesce(sum(l.requested_quantity),0) quantity from local_production_sales_request_lines l
            join local_production_sales_requests r on r.id=l.request_id where r.order_id=$1 and l.source_line_key=$2 and r.status not in ('RETURNED','CANCELLED')`, [orderId, sourceRow.source_line_key]);
          if ((await client.query("select $1::numeric+$2::numeric>$3::numeric exceeds", [held.rows[0].quantity, qty, sourceRow.ordered_quantity])).rows[0].exceeds) fail(`Dòng ${index + 1} vượt số lượng đặt còn lại.`);
          const line = await client.query(`insert into local_production_sales_request_lines(request_id,source_line_key,source_line_index,source_line_snapshot,product_id,product_sku,product_name,ordered_quantity,requested_quantity)
            values($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) returning *`, [created.rows[0].id, sourceRow.source_line_key, sourceRow.source_line_index, JSON.stringify(sourceRow.source_line_snapshot), sourceRow.product_id, sourceRow.product_sku, sourceRow.product_name, sourceRow.ordered_quantity, qty]);
          resultLines.push(line.rows[0]);
        }
        await client.query("insert into local_production_sales_events(request_id,action,to_status,actor_id,data) values($1,'SUBMIT','SUBMITTED',$2,$3::jsonb)", [created.rows[0].id, d.actor(), JSON.stringify({ line_count: resultLines.length })]);
        return { ...created.rows[0], lines: resultLines, reused: false };
      });
      res.status(result.reused ? 200 : 201).json(result);
    } catch (error) { d.sendError(res, error); }
  });

  app.post("/api/production-sales/requests/:id/review", async (req, res) => {
    try {
      const result = await mutate(`SALE_REVIEW:${req.params.id}`, req.body || {}, async (client) => {
        await manage(client);
        const target = String(req.body.target_status || "").toUpperCase(), reason = String(req.body.reason || "").trim();
        if (!["ACCEPTED", "RETURNED", "CANCELLED"].includes(target) || (["RETURNED", "CANCELLED"].includes(target) && !reason)) fail("Trạng thái hoặc lý do xử lý không hợp lệ.");
        const current = (await client.query("select * from local_production_sales_requests where id=$1 for update", [req.params.id])).rows[0];
        if (!current || !["SUBMITTED", "ADJUSTMENT_REQUIRED"].includes(current.status)) fail("Yêu cầu không còn ở trạng thái chờ xử lý.", 409);
        if (current.status === "SUBMITTED" && current.submitted_by === d.actor()) fail("Người gửi không được tự tiếp nhận yêu cầu.", 403);
        const allocated = (await client.query("select 1 from local_production_sales_allocations a join local_production_sales_request_lines l on l.id=a.request_line_id where l.request_id=$1 limit 1", [current.id])).rows[0];
        if (allocated && ["RETURNED", "CANCELLED"].includes(target)) fail("Yêu cầu đã lập lệnh; không được hủy dữ liệu nguồn, hãy giữ trạng thái cần điều chỉnh để xử lý các lệnh đang tạm dừng.", 409);
        // Resolve the source version from the current local snapshot at review
        // time. Relying on the latest detection event can acknowledge a stale
        // hash when the public order changes A -> B -> A between sync runs.
        const currentSource = current.status === "ADJUSTMENT_REQUIRED" && target === "ACCEPTED"
          ? (await client.query(`
              select md5(jsonb_build_object(
                'items',coalesce(s.payload->'items','[]'::jsonb),
                'status',coalesce(nullif(s.payload->>'status',''),'pending'),
                'manager_id',nullif(s.payload->>'manager_id',''),
                'assignee_id',nullif(s.payload->>'assignee_id','')
              )::text) source_hash
              from local_source_snapshots s
              join local_orders o on o.id=$1
              where s.source='SUPABASE' and s.source_schema='public'
                and s.source_table='orders' and s.source_key=o.id and not s.is_deleted
              limit 1`, [current.order_id])).rows[0]
          : null;
        if (currentSource?.source_hash && req.body.expected_source_hash
          && String(req.body.expected_source_hash) !== String(currentSource.source_hash)) {
          fail("Dữ liệu đơn nguồn đã thay đổi sau khi bạn mở màn hình. Hãy tải lại để xem phiên bản mới nhất.", 409);
        }
        const sourceChange = currentSource?.source_hash
          ? { data: { source_hash: currentSource.source_hash } }
          : null;
        const updated = await client.query("update local_production_sales_requests set status=$2,reviewed_by=$3,review_reason=$4,reviewed_at=now(),updated_at=now() where id=$1 returning *", [req.params.id, target, d.actor(), reason || null]);
        if (current.status === "ADJUSTMENT_REQUIRED" && target === "ACCEPTED") await client.query("update local_production_orders set status=case when released_at is null then 'DRAFT' else 'IN_PROGRESS' end,updated_at=now(),local_modified_at=now() where sales_request_id=$1 and status='ON_HOLD'", [current.id]);
        await client.query("insert into local_production_sales_events(request_id,action,from_status,to_status,reason,actor_id,data) values($1,'REVIEW',$2,$3,$4,$5,$6::jsonb)", [req.params.id, current.status, target, reason || null, d.actor(), JSON.stringify(sourceChange?.data || {})]);
        if (sourceChange?.data?.source_hash) await client.query("insert into local_production_sales_events(request_id,action,from_status,to_status,reason,actor_id,data) values($1,'SOURCE_CHANGE_ACKNOWLEDGED',$2,$3,$4,$5,$6::jsonb)", [req.params.id, current.status, target, reason || "Tiếp tục sản xuất theo dữ liệu nguồn đã chốt trước đó.", d.actor(), JSON.stringify({ source_hash: sourceChange.data.source_hash, expected_source_hash: sourceChange.data.source_hash })]);
        return { ...updated.rows[0], reused: false };
      });
      res.json(result);
    } catch (error) { d.sendError(res, error); }
  });

  app.post("/api/production-sales/requests/:id/change-request", async (req, res) => {
    try {
      const result = await mutate(`SALE_CHANGE_REQUEST:${req.params.id}`, req.body || {}, async (client) => {
        const reason = String(req.body.reason || "").trim();
        if (!reason) fail("Yêu cầu điều chỉnh phải có lý do.");
        const current = (await client.query("select * from local_production_sales_requests where id=$1 for update", [req.params.id])).rows[0];
        if (!current || !["SUBMITTED","ACCEPTED"].includes(current.status)) fail("Yêu cầu không còn ở trạng thái có thể đề nghị điều chỉnh.",409);
        if (current.submitted_by !== d.actor()) await manage(client);
        await client.query("update local_production_sales_requests set status='ADJUSTMENT_REQUIRED',review_reason=$2,updated_at=now() where id=$1", [current.id,reason]);
        await client.query("update local_production_orders set status='ON_HOLD',updated_at=now(),local_modified_at=now() where sales_request_id=$1 and status in ('RELEASED','IN_PROGRESS')", [current.id]);
        await client.query("insert into local_production_sales_events(request_id,action,from_status,to_status,reason,actor_id) values($1,'CHANGE_REQUEST',$2,'ADJUSTMENT_REQUIRED',$3,$4)", [current.id,current.status,reason,d.actor()]);
        return { ...current,status:'ADJUSTMENT_REQUIRED',review_reason:reason,reused:false };
      });
      res.json(result);
    } catch(error) { d.sendError(res,error); }
  });

  // Shared allocation primitive: caller owns idempotency and one transaction.
  async function allocateAccepted(client: PoolClient, requestId: string, body: Body) {
        await manage(client);
        const request = (await client.query("select * from local_production_sales_requests where id=$1 for update", [requestId])).rows[0];
        if (!request || request.status !== "ACCEPTED") fail("Yêu cầu phải được tiếp nhận trước khi lập lệnh.", 409);
        const sourceOrder = (await client.query("select * from local_orders where id=$1 for update", [request.order_id])).rows[0];
        if (!sourceOrder || ["cancelled", "returned"].includes(String(sourceOrder.status || "").toLowerCase())) fail("Đơn nguồn đã hủy/hoàn; cần xử lý điều chỉnh.", 409);
        await assertZcrmOrderExecutable(client,String(request.order_id));
        const currentSourceLines = await normalizeOrderLines(client, sourceOrder);
        const inputs = Array.isArray(body.lines) ? body.lines as Body[] : [];
        if (!inputs.length) fail("Cần ít nhất một dòng phân bổ.");
        const priority = String(body.priority || request.priority || "NORMAL").toUpperCase();
        const inputByLine=new Map<string,{input:Body;index:number;quantity:string}>();
        for(const [index,input] of inputs.entries()){
          const lineId=String(input.request_line_id||'');
          if(!uuidPattern.test(lineId))fail(`Dòng phân bổ ${index+1} không hợp lệ.`);
          if(inputByLine.has(lineId))fail(`Dòng phân bổ ${index+1} bị chọn lặp.`);
          inputByLine.set(lineId,{input,index,quantity:positive(input.quantity,`Số lượng phân bổ ${index+1}`)});
        }
        // Lock input rows in one deterministic order before checking quotas. All
        // later allocation writers take this same row lock, so two requests
        // cannot both consume the last remaining decimal quantity.
        const linesById=new Map<string,Row>();
        for(const id of [...inputByLine.keys()].sort()){
          const line=(await client.query("select * from local_production_sales_request_lines where id=$1 and request_id=$2 for update",[id,request.id])).rows[0];
          if(!line)fail('Dòng phân bổ không thuộc yêu cầu.');
          linesById.set(id,line);
        }
        const selectedLines=[] as Array<{line:Row;input:Body;quantity:string;supply:FulfillmentProjection;source:Row;itemContext?:Row;sewing?:unknown}>;
        for(const [id,{input,index,quantity}] of inputByLine){
          const line=linesById.get(id)!;
          const currentSource = currentProductionLine(currentSourceLines, line);
          if (!sameProductionLine(currentSource, line)) fail("Nội dung sản phẩm hoặc số lượng đơn nguồn đã thay đổi; cần tạo yêu cầu điều chỉnh.", 409);
          const allocated = (await client.query("select coalesce(sum(quantity),0) quantity from local_production_sales_allocations where request_line_id=$1", [line.id])).rows[0].quantity;
          if ((await client.query("select $1::numeric+$2::numeric>$3::numeric exceeds", [allocated, quantity, line.requested_quantity])).rows[0].exceeds) fail(`Dòng ${line.product_name} vượt số đã tiếp nhận.`);
          selectedLines.push({line,input,quantity,source:currentSource!,supply:unresolvedFulfillment(`Dòng ${index+1} chưa được kiểm tra cách đáp ứng.`)});
        }
        // Lock product then price-list parents in UUID order, and lock the
        // latest classification before any production order is written.
        const supply=await fulfillmentForLines(client,selectedLines.map(item=>item.line),true);
        for(const selected of selectedLines){
          selected.supply=selected.line.product_id?supply.get(String(selected.line.product_id))||unresolvedFulfillment('Dòng đơn chưa khớp sản phẩm local; cần Sale cập nhật danh mục.'):unresolvedFulfillment('Dòng đơn chưa khớp sản phẩm local; cần Sale cập nhật danh mục.');
          if(selected.input.sewing_code_selection===undefined&&(selected.supply.fulfillment_status!=='CONFIRMED'||selected.supply.fulfillment_route!=='SEW')){
            const next=selected.supply.fulfillment_route==='PURCHASE'
              ? 'Hàng nhập sẵn đang chờ mua hàng; không tạo lệnh may.'
              : 'Chỉ sản phẩm đã được quản lý xác nhận “May tại xưởng” mới lập lệnh.';
            fail(`Không thể lập lệnh cho ${selected.line.product_name}: ${selected.supply.fulfillment_reason} ${next}`,409);
          }
          const {line,input}=selected,snapshot=line.source_line_snapshot||{};
          selected.itemContext={product_id:line.product_id,fabric_variant_id:input.fabric_variant_id||snapshot.fabric_variant_id||null,color:input.color||snapshot.color||null,size:input.size||snapshot.size||null,dimensions:input.dimensions||snapshot.dimensions||snapshot.specifications||null};
          selected.sewing=await snapshotProductionSewingSelection(client,selected.itemContext,input.sewing_code_selection,body.planned_start_date||businessDateKey(),d.actor(),{order_id:String(request.order_id),line:selected.source});
        }
        const groupId = randomUUID(), orders = [];
        for (const {line,input,quantity:qty,itemContext:itemFacts,sewing} of selectedLines) {
          const number = `SX-${businessDateKey().slice(0,7).replace("-","")}-${randomUUID().slice(0,8).toUpperCase()}`;
          const orderUuid = uuidPattern.test(String(request.order_id)) ? request.order_id : null;
          const po = (await client.query(`insert into local_production_orders(production_order_number,production_batch_number,product_id,quantity_planned,source_type,source_id,order_id,planned_start_date,planned_end_date,production_order_group_id,created_by,dispatch_priority,dispatch_reference,dispatch_notes,sales_request_id,workflow_generation)
            values($1,$1,$2,$3,'FROM_ORDER',$4::uuid,$13::text,$5,$6,$7,$8,$9,$10,$11,$12,'WORKFLOW_V3') returning *`, [number, line.product_id, qty, orderUuid, body.planned_start_date || null, body.planned_end_date || request.due_date || null, groupId, d.actor(), priority, body.reference || null, body.notes || request.notes || null, request.id, String(request.order_id)])).rows[0];
          const images=await snapshotProductionImages(client,line.product_id,input.reference_images);
          const itemContext=itemFacts!;
          const item = (await client.query(`insert into local_production_order_items(production_order_id,product_id,product_sku,product_name,fabric_variant_id,source_order_item_key,color,size,dimensions,planned_quantity,notes,sales_request_line_id,reference_images,sewing_code_selection)
            values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb) returning *`, [po.id, line.product_id, line.product_sku, line.product_name, itemContext.fabric_variant_id, line.source_line_key, itemContext.color,itemContext.size,itemContext.dimensions,qty, input.notes || body.notes || null, line.id,JSON.stringify(images),sewing===null?null:JSON.stringify(sewing)])).rows[0];
          if(sewing)await client.query("insert into local_dispatch_audit_events(production_order_id,action,actor_id,data) values($1,'CREATE_ORDER',$2,$3::jsonb)",[po.id,d.actor(),JSON.stringify({order_item_id:item.id,sewing_code_selection:sewing})]);
          await appendPlannedExtras(client,po.id,item.id,input.planned_extras,d.actor(),d.role());
          const batch = (await client.query("insert into local_production_batches(production_order_id,batch_number,planned_quantity,status,created_by) values($1,$2,$3,'PLANNED',$4) returning *", [po.id, number, qty, d.actor()])).rows[0];
          await client.query("insert into local_production_sales_allocations(request_line_id,production_order_id,order_item_id,production_batch_id,quantity,created_by) values($1,$2,$3,$4,$5,$6)", [line.id, po.id, item.id, batch.id, qty, d.actor()]);
          const cuttingEstimate = await createInitialDraftCuttingPlan(client,po.id,item,batch,input.cutting_plan,d.actor());
          orders.push({ ...po, order_item_id: item.id, production_batch_id: batch.id, request_line_id: line.id, cutting_estimate_id:cuttingEstimate?.id || null });
        }
        await client.query("insert into local_production_sales_events(request_id,action,from_status,to_status,actor_id,data) values($1,'ALLOCATE','ACCEPTED','ACCEPTED',$2,$3::jsonb)", [request.id, d.actor(), JSON.stringify({ group_id: groupId, order_ids: orders.map((row: Row) => row.id) })]);
        return { request_id: request.id, group_id: groupId, order_count: orders.length, orders, reused: false };
  }

  // Management creates from canonical CRM lines directly: the ACCEPTED record is
  // an internal source/quota linkage, never a fabricated independent approval.
  app.post("/api/production/source-orders/:id/create", async (req,res) => {
    try {
      const result=await mutate(`DIRECT_ORDER_CREATE:${req.params.id}`,req.body || {},async client=>{
        await manage(client);
        const orderId=String(req.params.id),order=(await client.query('select * from local_orders where id=$1 for update',[orderId])).rows[0];
        if(!order || ['cancelled','returned'].includes(String(order.status || '').toLowerCase()))fail('Đơn không còn đủ điều kiện lập lệnh.',409);
        if(!privileged() && order.manager_id!==d.actor() && order.assignee_id!==d.actor())fail('Bạn không phụ trách đơn hàng này.',403);
        await assertZcrmOrderExecutable(client,orderId);
        const start=isoDate(req.body.planned_start_date,true),due=isoDate(req.body.planned_end_date,true);
        if(start && due && due<start)fail('Hạn hoàn thành phải từ ngày bắt đầu.');
        const inputs=Array.isArray(req.body.lines)?req.body.lines as Body[]:[];
        if(!inputs.length || inputs.length>100)fail('Chọn từ 1 đến 100 dòng cần sản xuất.');
        const sourceLines=await normalizeOrderLines(client,order),sources=new Map(sourceLines.map(line=>[line.source_line_key,line]));
        const selected:Array<{source:Row;input:Body;qty:string}>=[],seen=new Set<string>();let reuseHeld=false;
        for(const input of inputs){
          const key=String(input.source_line_key || ''),source=sources.get(key) as Row;
          if(seen.has(key))fail('Một dòng đơn chỉ được chọn một lần.',409);seen.add(key);
          if(!source || !source.product_id || !(source.ordered_quantity>0))fail('Sản phẩm nguồn không còn hợp lệ. Tải lại đơn.',409);
          // Canonical line identity and source snapshot own product/specification.
          const qty=positive(input.quantity);
          const held=(await client.query(`select coalesce(sum(l.requested_quantity),0) quantity from local_production_sales_request_lines l
            join local_production_sales_requests r on r.id=l.request_id where r.order_id=$1 and l.source_line_key=$2 and r.status not in ('RETURNED','CANCELLED')`,[orderId,key])).rows[0].quantity;
          if((await client.query('select $1::numeric>$2::numeric exceeds',[qty,source.ordered_quantity])).rows[0].exceeds)fail('Số lượng vượt số lượng đơn bán.',409);
          if((await client.query('select $1::numeric+$2::numeric>$3::numeric exceeds',[held,qty,source.ordered_quantity])).rows[0].exceeds)reuseHeld=true;
          selected.push({source,input,qty});
        }
        if(reuseHeld){
          const requests=(await client.query("select * from local_production_sales_requests where order_id=$1 and status in ('SUBMITTED','ACCEPTED') order by id for update",[orderId])).rows;
          const candidates=[] as Array<{request:Row;lines:Body[]}>;
          for(const request of requests){
            const saved=(await client.query(`select l.*,coalesce((select sum(a.quantity) from local_production_sales_allocations a where a.request_line_id=l.id),0) allocated from local_production_sales_request_lines l where l.request_id=$1 order by l.id for update`,[request.id])).rows;
            const lines:Body[]=[];
            for(const {source,input,qty} of selected){
              const line=saved.find((line:Row)=>line.source_line_key===source.source_line_key);
              if(!line || !sameProductionLine(source,line) || (await client.query('select $1::numeric+$2::numeric>$3::numeric exceeds',[line.allocated,qty,line.requested_quantity])).rows[0].exceeds)break;
              lines.push({request_line_id:line.id,quantity:qty,fabric_variant_id:input.fabric_variant_id,reference_images:input.reference_images,cutting_plan:input.cutting_plan,sewing_code_selection:input.sewing_code_selection,planned_extras:input.planned_extras});
            }
            if(lines.length===selected.length)candidates.push({request,lines});
          }
          if(candidates.length!==1)fail('Số lượng đang thuộc nhiều yêu cầu hoặc đơn nguồn đã thay đổi. Kiểm tra phần đã lập lệnh / yêu cầu cũ rồi chọn lại số lượng.',409);
          const candidate=candidates[0];
          if(candidate.request.status==='SUBMITTED')await client.query("update local_production_sales_requests set status='ACCEPTED',updated_at=now() where id=$1",[candidate.request.id]);
          await client.query("insert into local_production_sales_events(request_id,action,from_status,to_status,actor_id,data) values($1,'DIRECT_CREATE',$2,'ACCEPTED',$3,$4::jsonb)",[candidate.request.id,candidate.request.status,d.actor(),JSON.stringify({source:'CRM_ORDER',order_id:orderId,approval_required:false,reused_source_reservation:true})]);
          return allocateAccepted(client,candidate.request.id,{...req.body,planned_start_date:start,planned_end_date:due,lines:candidate.lines});
        }
        const linkage=(await client.query(`insert into local_production_sales_requests(order_id,order_updated_at_snapshot,status,due_date,priority,notes,submitted_by,idempotency_key)
          values($1,$2,'ACCEPTED',$3,'NORMAL',$4,$5,$6) returning *`,[orderId,order.updated_at,due,req.body.notes || null,d.actor(),req.body.idempotency_key])).rows[0];
        const allocationLines=[];
        for(const {source,input,qty} of selected){
          const line=(await client.query(`insert into local_production_sales_request_lines(request_id,source_line_key,source_line_index,source_line_snapshot,product_id,product_sku,product_name,ordered_quantity,requested_quantity)
            values($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) returning *`,[linkage.id,source.source_line_key,source.source_line_index,JSON.stringify(source.source_line_snapshot),source.product_id,source.product_sku,source.product_name,source.ordered_quantity,qty])).rows[0];
          allocationLines.push({request_line_id:line.id,quantity:qty,fabric_variant_id:input.fabric_variant_id,reference_images:input.reference_images,cutting_plan:input.cutting_plan,sewing_code_selection:input.sewing_code_selection,planned_extras:input.planned_extras});
        }
        await client.query("insert into local_production_sales_events(request_id,action,to_status,actor_id,data) values($1,'DIRECT_CREATE','ACCEPTED',$2,$3::jsonb)",[linkage.id,d.actor(),JSON.stringify({source:'CRM_ORDER',order_id:orderId,approval_required:false,line_count:selected.length})]);
        return allocateAccepted(client,linkage.id,{...req.body,planned_start_date:start,planned_end_date:due,lines:allocationLines});
      });
      res.status(result.reused?200:201).json(result);
    }catch(error){d.sendError(res,error);}
  });

  app.post("/api/production-sales/requests/:id/allocate", async (req, res) => {
    try {
      const result = await mutate(`SALE_ALLOCATE:${req.params.id}`, req.body || {}, async (client) => {
        return allocateAccepted(client,String(req.params.id),req.body || {});
      });
      res.status(result.reused ? 200 : 201).json(result);
    } catch (error) { d.sendError(res, error); }
  });

  app.post("/api/fabric-inventory-mappings", async (req, res) => {
    try {
      const variant = String(req.body.fabric_variant_id || "").trim(), item = String(req.body.inventory_item_id || "").trim(), reason = String(req.body.reason || "").trim();
      if (!variant || !uuidPattern.test(item) || !reason) fail("Biến thể vải, vật tư kho và lý do là bắt buộc.");
      const mapped = await d.transaction(async (client) => {
        await manage(client);
        await lockFabricVariantCutover(client, [variant]);
        if (!(await client.query("select 1 from local_fabric_variants where id=$1", [variant])).rows[0]) fail("Biến thể vải không tồn tại.", 409);
        const inventory = (await client.query("select base_unit from local_inventory_items where id=$1 and is_active", [item])).rows[0];
        if (!inventory) fail("Vật tư kho không tồn tại hoặc đã ngừng dùng.", 409);
        if (String(inventory.base_unit || "").toUpperCase() !== "METER") fail("Vật tư ánh xạ vải phải có đơn vị cơ sở METER.", 409);
        const current = (await client.query("select * from local_fabric_inventory_item_mappings where fabric_variant_id=$1 for update", [variant])).rows[0];
        if (current && current.is_active && String(current.inventory_item_id) !== item) {
          const used = (await client.query("select 1 from local_cutting_estimate_lines where fabric_variant_id=$1 limit 1", [variant])).rows[0];
          if (used) fail("Ánh xạ đã được dùng trong dự toán/cấp vải nên không thể đổi vật tư. Hãy tạo biến thể mới hoặc xử lý điều chỉnh có kiểm soát.", 409);
        }
        return (await client.query(`insert into local_fabric_inventory_item_mappings(fabric_variant_id,inventory_item_id,reason,created_by)
          values($1,$2,$3,$4) on conflict(fabric_variant_id) do update set inventory_item_id=excluded.inventory_item_id,reason=excluded.reason,is_active=true,updated_at=now() returning *`, [variant, item, reason, d.actor()])).rows[0];
      });
      res.status(201).json(mapped);
    } catch (error) { d.sendError(res, error); }
  });

  app.get("/api/production-orders/:id/cutting-estimates", async (req, res) => {
    try {
      await capability(pool, ["production_cutting_plan", "production_view", "production_manage", "production_operations", "inventory_view"]);
      const estimates = (await pool.query(`select e.* from local_cutting_estimates e where e.production_order_id=$1 order by e.version_number desc`, [req.params.id])).rows;
      const ids = estimates.map((row: Row) => row.id);
      const lines = ids.length ? (await pool.query(`select l.*,i.code inventory_item_code,i.name inventory_item_name,w.name warehouse_name,
        coalesce((select -sum(m.quantity_delta) from local_inventory_movements m where m.cutting_estimate_line_id=l.id and m.quantity_delta<0),0) issued_quantity,
        coalesce((select sum(m.quantity_delta) from local_inventory_movements m where m.cutting_estimate_line_id=l.id and m.quantity_delta>0 and m.source_movement_id is not null),0) returned_quantity
        from local_cutting_estimate_lines l join local_inventory_items i on i.id=l.inventory_item_id join local_inventory_warehouses w on w.id=l.warehouse_id where l.estimate_id=any($1::uuid[]) order by l.created_at`, [ids])).rows : [];
      for(const line of lines){const estimate=estimates.find(e=>e.id===line.estimate_id);const output=estimate?.estimate_kind==='BASE'?await executableEstimateOutput(pool,estimate.production_batch_id,line.order_item_id,line.output_quantity):line.output_quantity;line.executable_output_quantity=output;line.required_quantity=cuttingRequirementForOutput(line,output);line.reconciliation_required=line.calculation_method==='MANUAL_MEASURED'&&Number(output)<Number(line.output_quantity);}
      // Quantity only, restricted to the exact item/warehouse pairs of this estimate.
      // Explicit planner/full warehouse permissions are operational rights, even for an employee.
      const rights=(await pool.query('select permission_type from local_employee_permissions where user_id=$1 and enabled',[d.actor()])).rows.map(r=>r.permission_type);
      const stockAllowed=d.role()!=='team_leader'&&(privileged()||rights.includes('production_cutting_plan')||['inventory_view','inventory_documents','inventory_confirm'].every(r=>rights.includes(r)));
      const result=[];
      for(const estimate of estimates){
        const scoped=lines.filter((line:Row)=>line.estimate_id===estimate.id);
        const stock=stockAllowed&&scoped.length?(await pool.query(`with demand as (
          select inventory_item_id,warehouse_id,sum(greatest(required_quantity-issued_quantity+returned_quantity,0)) required_remaining
          from jsonb_to_recordset($1::jsonb) as x(inventory_item_id uuid,warehouse_id uuid,required_quantity numeric,issued_quantity numeric,returned_quantity numeric)
          group by inventory_item_id,warehouse_id), quantities as (
          select d.*,i.base_unit unit,coalesce((select sum(m.quantity_delta) from local_inventory_movements m where m.inventory_item_id=d.inventory_item_id and m.warehouse_id=d.warehouse_id),0) stock_quantity
          from demand d join local_inventory_items i on i.id=d.inventory_item_id)
          select *,greatest(required_remaining-stock_quantity,0) shortage_quantity from quantities order by inventory_item_id,warehouse_id`,[JSON.stringify(scoped.map(l=>({inventory_item_id:l.inventory_item_id,warehouse_id:l.warehouse_id,required_quantity:l.required_quantity,issued_quantity:l.issued_quantity,returned_quantity:l.returned_quantity})))])).rows:undefined;
        result.push({...estimate,lines:scoped,...(stockAllowed?{stock}: {})});
      }
      res.json(result);
    } catch (error) { d.sendError(res, error); }
  });

  app.post("/api/production-orders/:id/cutting-estimates", async (req, res) => {
    try {
      const result = await mutate(`CUTTING_ESTIMATE_CREATE:${req.params.id}`, req.body || {}, async (client) => {
        await capability(client, ["production_cutting_plan", "production_manage", "production_operations"]);
        const batchId = String(req.body.production_batch_id || ""), noMaterial = req.body.no_material_required === true;
        const estimateKind = String(req.body.estimate_kind || "BASE").trim().toUpperCase();
        if (!["BASE", "REMAKE"].includes(estimateKind)) fail("Loại dự toán cắt không hợp lệ.");
        const order = (await client.query("select * from local_production_orders where id=$1 for update", [req.params.id])).rows[0];
        if (!order || !['WORKFLOW_V2','WORKFLOW_V3'].includes(order.workflow_generation)) fail("Lệnh legacy chỉ được xem; hãy tạo đợt sản xuất mới theo quy trình chuẩn.", 409);
        const batch = (await client.query("select * from local_production_batches where id=$1 and production_order_id=$2 for update", [batchId, order.id])).rows[0];
        if (!batch) fail("Lô không thuộc lệnh sản xuất.");
        let baseEstimate: Row | null = null, sourceEvent: Row | null = null, remakeQuantity: string | null = null;
        if (estimateKind === "REMAKE") {
          if (noMaterial) fail("Dự toán làm lại phải xác định rõ vật tư bổ sung.", 409);
          remakeQuantity = positive(req.body.remake_quantity, "Số lượng cần làm lại");
          const lockedSource = (await client.query("select * from local_production_stage_events where id=$1 for update", [req.body.source_stage_event_id])).rows[0] as Row | undefined;
          if (!lockedSource || lockedSource.stage !== "CUTTING" || !["APPROVED", "LOCKED"].includes(lockedSource.status)) fail("Chỉ lập vật tư làm lại từ báo cáo cắt đã duyệt/khóa.", 409);
          const validSource = lockedSource as Row;
          if (String(validSource.production_order_id) !== String(order.id) || String(validSource.production_batch_id) !== String(batch.id)) fail("Báo cáo cắt nguồn không thuộc lệnh/lô này.", 409);
          if ((await client.query("select $1::numeric>$2::numeric exceeds", [remakeQuantity, validSource.quantity_remake])).rows[0].exceeds) fail("Số lượng dự toán vượt số cần làm lại của báo cáo nguồn.", 409);
          sourceEvent = validSource;
          baseEstimate = (await client.query("select * from local_cutting_estimates where id=$1 and production_order_id=$2 and production_batch_id=$3 and estimate_kind='BASE' and status='APPROVED' for share", [req.body.base_estimate_id, order.id, batch.id])).rows[0];
          if (!baseEstimate) fail("Cần chọn đúng dự toán gốc đã duyệt của lệnh/lô.", 409);
        }
        const version = Number((await client.query("select coalesce(max(version_number),0)+1 version from local_cutting_estimates where production_order_id=$1 and production_batch_id=$2", [order.id, batch.id])).rows[0].version);
        const estimate = (await client.query(`insert into local_cutting_estimates(production_order_id,production_batch_id,version_number,no_material_required,reason,created_by,estimate_kind,base_estimate_id,source_stage_event_id,remake_quantity)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`, [order.id, batch.id, version, noMaterial, req.body.reason || null, d.actor(), estimateKind, baseEstimate?.id || null, sourceEvent?.id || null, remakeQuantity])).rows[0];
        const inputs = Array.isArray(req.body.lines) ? req.body.lines as Body[] : [];
        if (estimateKind === "REMAKE") {
          const baseLines = (await client.query("select * from local_cutting_estimate_lines where estimate_id=$1 order by created_at,id", [baseEstimate?.id])).rows;
          if (!baseLines.length) fail("Dự toán gốc không có dòng vật tư để tạo bổ sung.", 409);
          const createdLines = [];
          for (const baseLine of baseLines) {
            if (String(baseLine.order_item_id) !== String(sourceEvent?.order_item_id)) continue;
            const manual = inputs.find((input) => String(input.base_estimate_line_id || "") === String(baseLine.id));
            let estimated: number;
            let overrideReason: string | null = null;
            if (baseLine.calculation_method === "MANUAL_MEASURED") {
              if (!manual) fail("Dòng dự toán gốc thủ công cần nhập lại lượng bổ sung và lý do.", 409);
              const manualLine = manual as Body;
              estimated = Number(positive(manualLine.estimated_quantity, "Lượng vật tư làm lại"));
              overrideReason = String(manualLine.override_reason || "").trim();
              if (!overrideReason) fail("Dự toán làm lại thủ công phải có lý do.");
            } else estimated = cuttingRequirementForOutput(baseLine, remakeQuantity || 0);
            const snapshot = { ...canonicalItem(baseLine.calculation_snapshot), source: "FROZEN_BASE_ESTIMATE", base_estimate_id: baseEstimate?.id, base_estimate_line_id: baseLine.id, remake_quantity: Number(remakeQuantity) };
            const created = await client.query(`insert into local_cutting_estimate_lines(estimate_id,order_item_id,fabric_variant_id,inventory_item_id,warehouse_id,output_quantity,calculation_method,unit_per_output,waste_rate,waste_already_included,estimated_quantity,calculation_snapshot,override_reason,base_estimate_line_id)
              values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14) returning *`, [estimate.id, baseLine.order_item_id, baseLine.fabric_variant_id, baseLine.inventory_item_id, baseLine.warehouse_id, remakeQuantity, baseLine.calculation_method, baseLine.unit_per_output, baseLine.waste_rate, baseLine.waste_already_included, estimated, JSON.stringify(snapshot), overrideReason, baseLine.id]);
            createdLines.push(created.rows[0]);
          }
          if (!createdLines.length) fail("Dự toán gốc không có dòng vật tư cho sản phẩm cần làm lại.", 409);
          return { ...estimate, lines: createdLines, reused: false };
        }
        if (noMaterial && inputs.length) fail("Dự toán không cần vật tư không được có dòng cấp vải.");
        if (!noMaterial && !inputs.length) fail("Dự toán cắt phải có ít nhất một dòng vật tư.");
        const createdLines = [];
        for (const [index, input] of inputs.entries()) {
          const orderItem = (await client.query("select * from local_production_order_items where id=$1 and production_order_id=$2", [input.order_item_id, order.id])).rows[0];
          if (!orderItem) fail(`Dòng dự toán ${index + 1} không thuộc lệnh.`);
          const inventoryId = String(input.inventory_item_id || ""), warehouseId = String(input.warehouse_id || ""), variant = String(input.fabric_variant_id || orderItem.fabric_variant_id || "");
          if (!uuidPattern.test(inventoryId) || !uuidPattern.test(warehouseId)) fail(`Dòng dự toán ${index + 1} thiếu vật tư hoặc kho.`);
          if (orderItem.fabric_variant_id && String(orderItem.fabric_variant_id) !== variant) fail("Biến thể vải dự toán không khớp dòng sản phẩm của lệnh.", 409);
          const inventory = (await client.query("select base_unit from local_inventory_items where id=$1 and is_active", [inventoryId])).rows[0];
          if (!inventory) fail("Vật tư kho không tồn tại hoặc đã ngừng dùng.", 409);
          if (variant) {
            const mapping = (await client.query("select 1 from local_fabric_inventory_item_mappings where fabric_variant_id=$1 and inventory_item_id=$2 and is_active", [variant, inventoryId])).rows[0];
            if (!mapping) fail("Biến thể vải chưa được ánh xạ rõ ràng sang vật tư kho.", 409);
          }
          const output = Number(positive(input.output_quantity || batch.planned_quantity, "Số lượng cần cắt"));
          const method = String(input.calculation_method || "").toUpperCase();
          let estimated = 0, snapshot: Body = {}, unitPerOutput: number | null = null, canonicalWaste = 0;
          if (["BOM_PER_UNIT", "BOM_STANDARD"].includes(method)) {
            const requirements = (await client.query("select * from local_production_order_material_requirements where production_order_id=$1 and inventory_item_id=$2", [order.id, inventoryId])).rows;
            if (requirements.length !== 1) fail("Lệnh phát hành phải có đúng một ảnh chụp định mức cho vật tư này.", 409);
            const requirement = requirements[0], details = canonicalItem(requirement.calculation_details);
            const bomMethod = String(requirement.requirement_method || "").toUpperCase();
            if (method === "BOM_PER_UNIT" && bomMethod !== "PER_UNIT") fail("BOM_PER_UNIT chỉ dùng được với dòng định mức PER_UNIT; FIXED, FORMULA và CUTTING_ENGINE phải theo đúng phương pháp gốc.", 409);
            if (method === "BOM_STANDARD" && bomMethod === "CUTTING_ENGINE") fail("Dòng CUTTING_ENGINE phải dùng đúng bộ tính sơ đồ cắt.", 409);
            const frozen = { calculation_method: "BOM_STANDARD", calculation_snapshot: details, estimated_quantity: requirement.planned_quantity, output_quantity: details.output_quantity || order.quantity_planned };
            estimated = cuttingRequirementForOutput(frozen, output);
            unitPerOutput = bomMethod === "PER_UNIT" ? Number(requirement.standard_quantity) : null;
            canonicalWaste = Number(details.waste_rate || 0) + Number(details.scrap_rate || 0);
            snapshot = { ...details, source: "RELEASED_REQUIREMENT", bom_version_id: requirement.bom_version_id, bom_line_id: requirement.bom_line_id, unit: requirement.unit };
          } else if (method === "CUTTING_ENGINE") {
            if (String(inventory.base_unit || "").toUpperCase() !== "METER") fail("Vật tư dùng sơ đồ cắt phải có đơn vị cơ sở METER.", 409);
            const requirements = (await client.query("select * from local_production_order_material_requirements where production_order_id=$1 and inventory_item_id=$2 and requirement_method='CUTTING_ENGINE'", [order.id, inventoryId])).rows;
            if (requirements.length !== 1) fail("Lệnh phát hành phải có đúng một ảnh chụp sơ đồ cắt cho vật tư này.", 409);
            const requirement = requirements[0], details = canonicalItem(requirement.calculation_details);
            if (input.cutting_version_id && String(input.cutting_version_id) !== String(requirement.cutting_profile_version_id)) fail("Phiên bản sơ đồ cắt không khớp ảnh chụp khi phát hành lệnh.", 409);
            if (input.fabric_width_cm != null && Number(input.fabric_width_cm) !== Number(details.fabric_width_cm)) fail("Khổ vải khác ảnh chụp đã phát hành; hãy lập dự toán đo thủ công có lý do.", 409);
            if (String(details.product_id || "") !== String(orderItem.product_id)) fail("Ảnh chụp sơ đồ cắt không thuộc sản phẩm của dòng lệnh.", 409);
            estimated = cuttingRequirementForOutput({ calculation_method: "CUTTING_ENGINE", calculation_snapshot: details }, output);
            snapshot = { ...details, source: "RELEASED_REQUIREMENT", bom_version_id: requirement.bom_version_id, bom_line_id: requirement.bom_line_id };
          } else if (method === "MANUAL_MEASURED") {
            estimated = Number(positive(input.estimated_quantity, "Mét vải dự toán"));
            if (!String(input.override_reason || "").trim()) fail("Dự toán thủ công phải có lý do.");
            snapshot = { entered_quantity: estimated };
          } else fail("Phương pháp dự toán chưa được hỗ trợ.");
          const line = await client.query(`insert into local_cutting_estimate_lines(estimate_id,order_item_id,fabric_variant_id,inventory_item_id,warehouse_id,output_quantity,calculation_method,unit_per_output,waste_rate,waste_already_included,estimated_quantity,calculation_snapshot,override_reason)
            values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13) returning *`, [estimate.id, orderItem.id, variant || null, inventoryId, warehouseId, output, method, unitPerOutput, canonicalWaste, method !== "MANUAL_MEASURED", estimated, JSON.stringify(snapshot), input.override_reason || null]);
          createdLines.push(line.rows[0]);
        }
        return { ...estimate, lines: createdLines, reused: false };
      });
      res.status(result.reused ? 200 : 201).json(result);
    } catch (error) { d.sendError(res, error); }
  });

  app.post("/api/cutting-estimates/:id/submit", async (req, res) => {
    try {
      const result = await mutate(`CUTTING_ESTIMATE_SUBMIT:${req.params.id}`, req.body || {}, async (client) => {
        await capability(client, ["production_cutting_plan", "production_manage", "production_operations"]);
        const pointer = (await client.query("select production_order_id,production_batch_id from local_cutting_estimates where id=$1", [req.params.id])).rows[0];
        if (!pointer) fail("Không tìm thấy dự toán cắt.", 404);
        await client.query("select id from local_production_orders where id=$1 for update", [pointer.production_order_id]);
        await client.query("select id from local_production_batches where id=$1 for update", [pointer.production_batch_id]);
        const current = (await client.query("select * from local_cutting_estimates where id=$1 for update", [req.params.id])).rows[0];
        if (!current || current.status !== "DRAFT") fail("Chỉ được gửi dự toán nháp.", 409);
        const updated = await client.query("update local_cutting_estimates set status='SUBMITTED',submitted_by=$2,submitted_at=now(),updated_at=now() where id=$1 returning *", [req.params.id, d.actor()]);
        await assertRemakeEstimateAllowance(client, updated.rows[0]);
        return { ...updated.rows[0], reused: false };
      });
      res.json(result);
    } catch (error) { d.sendError(res, error); }
  });

  app.post("/api/cutting-estimates/:id/review", async (req, res) => {
    try {
      const result = await mutate(`CUTTING_ESTIMATE_REVIEW:${req.params.id}`, req.body || {}, async (client) => {
        await manage(client);
        const target = String(req.body.target_status || "").toUpperCase(), reason = String(req.body.reason || "").trim();
        if (!["APPROVED", "REJECTED"].includes(target) || (target === "REJECTED" && !reason)) fail("Trạng thái hoặc lý do từ chối không hợp lệ.");
        const pointer = (await client.query("select production_order_id,production_batch_id from local_cutting_estimates where id=$1", [req.params.id])).rows[0];
        if (!pointer) fail("Không tìm thấy dự toán cắt.", 404);
        await client.query("select id from local_production_orders where id=$1 for update", [pointer.production_order_id]);
        await client.query("select id from local_production_batches where id=$1 for update", [pointer.production_batch_id]);
        const current = (await client.query("select * from local_cutting_estimates where id=$1 for update", [req.params.id])).rows[0];
        if (!current || current.status !== "SUBMITTED") fail("Dự toán không còn chờ duyệt.", 409);
        if (current.created_by === d.actor() || current.submitted_by === d.actor()) fail("Người lập/gửi không được tự duyệt dự toán.", 403);
        if (target === "APPROVED") await assertRemakeEstimateAllowance(client, current);
        if (target === "APPROVED" && current.no_material_required) {
          const approvedEmptyBom = await client.query(`select 1 from local_production_orders o
             join local_manufacturing_records v on v.id=o.bom_version_id::text and v.record_type='bom_version' and v.status in ('APPROVED','SUPERSEDED')
             join local_manufacturing_records h on h.id=v.parent_id and h.record_type='bom_header' and h.product_id=o.product_id::text
            where o.id=$1 and o.status in ('RELEASED','IN_PROGRESS')
            and not exists(select 1 from local_manufacturing_records l where l.record_type='bom_line' and l.parent_id=v.id and coalesce(l.payload->>'line_type','MATERIAL')='MATERIAL') limit 1`, [current.production_order_id]);
          if (!approvedEmptyBom.rows[0]) fail("Chỉ được xác nhận không cần vật tư khi lệnh đã phát hành với đúng phiên bản BOM hiệu lực và không có dòng vật tư.", 409);
        }
        if (target === "APPROVED" && current.estimate_kind === "BASE") {
          const existing = (await client.query("select * from local_cutting_estimates where production_order_id=$1 and production_batch_id=$2 and estimate_kind='BASE' and status='APPROVED' and id<>$3 for update", [current.production_order_id, current.production_batch_id, current.id])).rows[0];
          if (existing) {
            const issued = (await client.query(`select 1 from local_inventory_movements m join local_cutting_estimate_lines l on l.id=m.cutting_estimate_line_id
              join local_inventory_documents d on d.id=m.document_id and d.status='CONFIRMED' where l.estimate_id=$1 limit 1`, [existing.id])).rows[0];
            if (issued) fail("Dự toán gốc đã cấp vật tư nên không thể bị thay thế. Hãy giữ lịch sử hoặc lập dự toán bổ sung làm lại.", 409);
            await client.query("update local_cutting_estimates set status='SUPERSEDED',updated_at=now() where id=$1", [existing.id]);
          }
        }
        const updated = await client.query("update local_cutting_estimates set status=$2,reviewed_by=$3,review_reason=$4,reviewed_at=now(),updated_at=now() where id=$1 returning *", [current.id, target, d.actor(), reason || null]);
        return { ...updated.rows[0], reused: false };
      });
      res.json(result);
    } catch (error) { d.sendError(res, error); }
  });

  app.post("/api/cutting-estimates/:id/material-issue", async (req, res) => {
    try {
      const result = await mutate(`CUTTING_MATERIAL_ISSUE:${req.params.id}`, req.body || {}, async (client) => {
        await capability(client, ["inventory_documents", "production_manage"]);
        const pointer = (await client.query("select production_order_id,production_batch_id from local_cutting_estimates where id=$1", [req.params.id])).rows[0];
        if (!pointer) fail("Không tìm thấy dự toán cắt.", 404);
        await client.query("select id from local_production_orders where id=$1 for update", [pointer.production_order_id]);
        await client.query("select id from local_production_batches where id=$1 for update", [pointer.production_batch_id]);
        const estimate = (await client.query("select * from local_cutting_estimates where id=$1 for update", [req.params.id])).rows[0];
        if (!estimate || estimate.status !== "APPROVED" || estimate.no_material_required) fail("Chỉ dự toán có vật tư đã duyệt mới được lập phiếu xuất.", 409);
        await assertRemakeEstimateAllowance(client, estimate);
        const inputs = Array.isArray(req.body.lines) ? req.body.lines as Body[] : [];
        if (!inputs.length) fail("Chọn ít nhất một dòng cấp vải.");
        const documentNumber = `PX-CAT-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;
        const doc = (await client.query(`insert into local_inventory_documents(document_number,document_type,status,transaction_at,warehouse_id,description,external_reference,created_by,idempotency_key,production_order_id,cutting_estimate_id)
          values($1,'ISSUE','DRAFT',coalesce($2::timestamptz,now()),$3,$4,$5,$6,$7,$8,$9) returning *`, [documentNumber, req.body.transaction_at || null, req.body.warehouse_id, req.body.description || "Cấp vải theo dự toán cắt", req.body.external_reference || null, d.actor(), `cutting:${req.body.idempotency_key}`, estimate.production_order_id, estimate.id])).rows[0];
        const documentLines = [];
        for (const input of inputs) {
          const line = (await client.query("select * from local_cutting_estimate_lines where id=$1 and estimate_id=$2", [input.estimate_line_id, estimate.id])).rows[0];
          if (!line) fail("Dòng cấp vải không thuộc dự toán.");
          if (String(req.body.warehouse_id) !== String(line.warehouse_id)) fail("Kho cấp phải đúng kho đã duyệt trong dự toán.");
          const qty = positive(input.quantity, "Số lượng cấp");
          const net = (await client.query("select coalesce(-sum(quantity_delta),0) quantity from local_inventory_movements where cutting_estimate_line_id=$1", [line.id])).rows[0].quantity;
          const drafts = (await client.query(`select coalesce(sum(dl.quantity),0) quantity from local_inventory_document_lines dl
            join local_inventory_documents d on d.id=dl.document_id where dl.cutting_estimate_line_id=$1 and d.document_type='ISSUE' and d.status='DRAFT' and d.id<>$2`, [line.id, doc.id])).rows[0].quantity;
          const output=estimate.estimate_kind==='BASE'?await executableEstimateOutput(client,estimate.production_batch_id,line.order_item_id,line.output_quantity):line.output_quantity;
          const required=cuttingRequirementForOutput(line,output);
          if ((await client.query("select $1::numeric+$2::numeric+$3::numeric>$4::numeric exceeds", [net, drafts, qty, required])).rows[0].exceeds) fail("Tổng cấp ròng và phiếu nháp vượt nhu cầu còn thực hiện theo dự toán đã duyệt.", 409);
          const created = await client.query(`insert into local_inventory_document_lines(document_id,inventory_item_id,quantity,unit,description,cutting_estimate_line_id)
            values($1,$2,$3,(select base_unit from local_inventory_items where id=$2),$4,$5) returning *`, [doc.id, line.inventory_item_id, qty, input.description || null, line.id]);
          documentLines.push(created.rows[0]);
        }
        return { ...doc, lines: documentLines, reused: false };
      });
      res.status(result.reused ? 200 : 201).json(result);
    } catch (error) { d.sendError(res, error); }
  });

  app.get("/api/my-attendance/earnings", async (req, res) => {
    try {
      const month = String(req.query.month || businessDateKey().slice(0, 7));
      if (!/^\d{4}-\d{2}$/.test(month)) fail("Tháng không hợp lệ.");
      const linkedWorkers=(await pool.query("select * from local_workers where user_id=$1 and is_active",[d.actor()])).rows;
      if(linkedWorkers.length>1)fail('Tài khoản liên kết nhiều hồ sơ nhân sự đang hoạt động; cần quản lý kiểm tra.',409);
      const worker = linkedWorkers[0];
      if (!worker) fail("Tài khoản chưa liên kết nhân sự.", 403);
      const reports = (await pool.query(`select e.id,e.work_date,e.quantity_good,e.status,e.production_entry_id,e.created_at,e.is_payable,a.piece_rate_code,a.rate_unit,o.production_order_number,b.batch_number,
        pe.rate_amount approved_rate,pe.calculated_amount approved_amount,pe.workflow_status approved_status,
        (select piece_output_enabled from local_worker_payroll_profiles p where p.worker_id=e.worker_id and p.status='APPROVED' and p.effective_from<=e.work_date and (p.effective_to is null or p.effective_to>=e.work_date) order by p.effective_from desc,p.created_at desc limit 1) piece_enabled,
        (select count(*) from local_worker_payroll_profiles p where p.worker_id=e.worker_id and p.status='APPROVED' and p.effective_from<=e.work_date and (p.effective_to is null or p.effective_to>=e.work_date)) profile_count,
        (select count(*) from local_product_rates r where lower(r.piece_rate_code)=lower(a.piece_rate_code) and r.status='APPROVED' and r.effective_from<=e.work_date and (r.effective_to is null or r.effective_to>=e.work_date)) rate_count,
        (select r.rate from local_product_rates r where lower(r.piece_rate_code)=lower(a.piece_rate_code) and r.status='APPROVED' and r.effective_from<=e.work_date and (r.effective_to is null or r.effective_to>=e.work_date) order by r.effective_from desc,r.created_at desc limit 1) pending_rate,
        (select coalesce(r.rate_unit,'PIECE') from local_product_rates r where lower(r.piece_rate_code)=lower(a.piece_rate_code) and r.status='APPROVED' and r.effective_from<=e.work_date and (r.effective_to is null or r.effective_to>=e.work_date) order by r.effective_from desc,r.created_at desc limit 1) pending_rate_unit
        from local_production_stage_events e join local_assignments a on a.id=e.assignment_id join local_production_orders o on o.id=e.production_order_id left join local_production_batches b on b.id=e.production_batch_id
        left join local_production_entries pe on pe.id=e.production_entry_id where e.worker_id=$1 and e.stage='SEWING' and e.work_date >= $2::date and e.work_date < ($2::date + interval '1 month') and e.status<>'REVERSED' order by e.work_date desc,e.created_at desc`, [worker.id, `${month}-01`])).rows;
      const rows: Row[] = reports.map((row: Row) => {
        const approved = ["APPROVED", "LOCKED"].includes(row.status) && row.approved_amount != null;
        const rateMatches = Number(row.rate_count) === 1 && row.pending_rate != null && String(row.pending_rate_unit || "PIECE") === String(row.rate_unit || "PIECE");
        const pendingAvailable = row.status === "SUBMITTED" && Number(row.profile_count) === 1 && row.piece_enabled === true && rateMatches && row.is_payable !== false;
        const unavailable_reason = approved ? null : row.is_payable === false ? "Báo cáo sửa/làm lại không tính lương" : Number(row.profile_count) !== 1 || row.piece_enabled !== true ? "Hồ sơ lương sản lượng thiếu, trùng hoặc chưa bật" : !rateMatches ? "Thiếu, trùng hoặc sai đơn vị đơn giá hiệu lực" : null;
        const eligibility_warning = approved && (Number(row.profile_count) !== 1 || row.piece_enabled !== true) ? "Hồ sơ hiện tại không còn đủ điều kiện sản lượng; khoản đã duyệt vẫn giữ nguyên theo ảnh chụp tại thời điểm duyệt." : null;
        return { ...row, source_kind:'ASSIGNED_WORK', pending_eligible:pendingAvailable,pending_amount:null, approved_amount: approved ? row.approved_amount : null, unavailable_reason, eligibility_warning };
      });
      const standalone = (await pool.query(`select pe.id,pe.work_date,pe.quantity quantity_good,pe.workflow_status status,pe.id production_entry_id,pe.created_at,true is_payable,
        pe.piece_rate_code,pe.rate_unit_snapshot rate_unit,null::text production_order_number,null::text batch_number,pe.rate_amount approved_rate,
        pe.calculated_amount approved_amount,pe.workflow_status approved_status,p.sku product_sku,p.name product_name,
        (select piece_output_enabled from local_worker_payroll_profiles wp where wp.worker_id=pe.worker_id and wp.status='APPROVED' and wp.effective_from<=pe.work_date and (wp.effective_to is null or wp.effective_to>=pe.work_date) order by wp.effective_from desc,wp.created_at desc limit 1) piece_enabled,
        (select count(*) from local_worker_payroll_profiles wp where wp.worker_id=pe.worker_id and wp.status='APPROVED' and wp.effective_from<=pe.work_date and (wp.effective_to is null or wp.effective_to>=pe.work_date)) profile_count,
        (select count(*) from local_product_rates r where lower(r.piece_rate_code)=lower(pe.piece_rate_code) and r.status='APPROVED' and r.effective_from<=pe.work_date and (r.effective_to is null or r.effective_to>=pe.work_date)) rate_count,
        (select r.rate from local_product_rates r where lower(r.piece_rate_code)=lower(pe.piece_rate_code) and r.status='APPROVED' and r.effective_from<=pe.work_date and (r.effective_to is null or r.effective_to>=pe.work_date) order by r.effective_from desc,r.created_at desc limit 1) pending_rate,
        (select coalesce(r.rate_unit,'PIECE') from local_product_rates r where lower(r.piece_rate_code)=lower(pe.piece_rate_code) and r.status='APPROVED' and r.effective_from<=pe.work_date and (r.effective_to is null or r.effective_to>=pe.work_date) order by r.effective_from desc,r.created_at desc limit 1) pending_rate_unit
        from local_production_entries pe left join local_products p on p.id=pe.product_id
        where pe.worker_id=$1 and pe.source_stage_event_id is null and not pe.is_reversed and pe.work_date >= $2::date and pe.work_date < ($2::date+interval '1 month')
        and pe.workflow_status not in ('REJECTED','REVERSED') order by pe.work_date desc,pe.created_at desc`, [worker.id,`${month}-01`])).rows.map((row:Row) => {
          const approved = ['APPROVED','LOCKED'].includes(row.status) && row.approved_amount != null;
          const rateMatches = Number(row.rate_count) === 1 && row.pending_rate != null && String(row.pending_rate_unit || 'PIECE') === String(row.rate_unit || 'PIECE');
          const pendingAvailable = row.status === 'SUBMITTED' && Number(row.profile_count) === 1 && row.piece_enabled === true && rateMatches;
          return { ...row, source_kind:'SELF_REPORTED_OUTPUT',pending_eligible:pendingAvailable,pending_amount:null,
            approved_amount: approved ? row.approved_amount : null,
            unavailable_reason: row.status === 'SUBMITTED' && !pendingAvailable ? Number(row.profile_count) !== 1 || row.piece_enabled !== true ? 'Hồ sơ lương sản lượng thiếu, trùng hoặc chưa bật' : 'Thiếu, trùng hoặc sai đơn vị đơn giá hiệu lực' : null,
            eligibility_warning: approved && (Number(row.profile_count) !== 1 || row.piece_enabled !== true) ? 'Hồ sơ hiện tại không còn đủ điều kiện sản lượng; khoản đã duyệt vẫn giữ nguyên theo ảnh chụp tại thời điểm duyệt.' : null };
        });
      rows.push(...standalone);
      const pending=(await pool.query('select id,case when pending_eligible then round(quantity_good*pending_rate,2) else null end pending_amount from jsonb_to_recordset($1::jsonb) as x(id text,quantity_good numeric,pending_rate numeric,pending_eligible boolean)',[JSON.stringify(rows)])).rows;
      for(const row of rows)row.pending_amount=pending.find(x=>x.id===row.id)?.pending_amount??null;
      const totals=(await pool.query("select coalesce(sum(pending_amount),0) pending_total,coalesce(sum(approved_amount),0) approved_total,coalesce(sum(approved_amount) filter(where approved_status='LOCKED'),0) locked_total,coalesce(sum(pending_amount) filter(where work_date=current_date),0) today_pending_total,coalesce(sum(approved_amount) filter(where work_date=current_date),0) today_approved_total from jsonb_to_recordset($1::jsonb) as x(pending_amount numeric,approved_amount numeric,approved_status text,work_date date)",[JSON.stringify(rows)])).rows[0];
      rows.sort((a,b) => String(b.work_date).localeCompare(String(a.work_date)) || String(b.created_at).localeCompare(String(a.created_at)));
      res.json({ worker: { id: worker.id, employee_code: worker.employee_code, display_name: worker.display_name }, month, income_scope: "PRODUCT_OUTPUT_ONLY", ...totals, rows });
    } catch (error) { d.sendError(res, error); }
  });
}
