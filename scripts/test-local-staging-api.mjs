import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error("Local Supabase URL, anon key and service role key are required");
}

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const accounts = {
  admin: { email: "inventory.admin@local.test", password: "LocalStaging!2026", role: "admin" },
  manager: { email: "inventory.manager@local.test", password: "LocalStaging!2026", role: "manager" },
  employee: { email: "inventory.employee@local.test", password: "LocalStaging!2026", role: "employee" },
  quantity: { email: "inventory.quantity@local.test", password: "LocalStaging!2026", role: "employee" },
  cost: { email: "inventory.cost@local.test", password: "LocalStaging!2026", role: "employee" },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function removeExistingUsers() {
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  for (const user of data.users) {
    if (Object.values(accounts).some((account) => account.email === user.email)) {
      const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
      if (deleteError) throw deleteError;
    }
  }
}

async function createUsers() {
  const users = {};
  for (const [name, account] of Object.entries(accounts)) {
    const { data, error } = await service.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
    });
    if (error) throw error;
    users[name] = data.user;
  }
  return users;
}

async function createSignedInClient(account) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw error;
  return client;
}

async function rpc(client, name, parameters) {
  const { data, error } = await client.rpc(name, parameters);
  if (error) throw error;
  return data;
}

await removeExistingUsers();
const users = await createUsers();

const roleRows = Object.entries(accounts).map(([name, account]) => ({
  user_id: users[name].id,
  role: account.role,
  assigned_by: account.role === "employee" ? users.manager.id : null,
}));
const { error: roleError } = await service.from("user_roles").insert(roleRows);
if (roleError) throw roleError;

const permissionRows = [
  ["employee", "inventory_view"],
  ["employee", "inventory_items"],
  ["employee", "inventory_documents"],
  ["employee", "inventory_confirm"],
  ["quantity", "inventory_view"],
  ["quantity", "bom_view"],
  ["cost", "inventory_view"],
  ["cost", "inventory_cost_view"],
].map(([name, permission_type]) => ({
  user_id: users[name].id,
  permission_type,
  enabled: true,
}));
const { error: permissionError } = await service.from("employee_permissions").insert(permissionRows);
if (permissionError) throw permissionError;

const warehouseId = crypto.randomUUID();
const { error: warehouseError } = await service.from("warehouses").insert({
  id: warehouseId,
  name: "Kho staging Sprint 2",
  warehouse_type: "main",
  manager_id: users.manager.id,
  tenant_id: "default",
});
if (warehouseError) throw warehouseError;

const clients = {};
for (const [name, account] of Object.entries(accounts)) {
  clients[name] = await createSignedInClient(account);
}

const { data: item, error: itemError } = await clients.manager
  .from("inventory_items")
  .insert({
    tenant_id: "default",
    code: "STG-FABRIC-001",
    name: "Vai staging MWA",
    item_type: "RAW_MATERIAL",
    base_unit: "METER",
    category: "STAGING",
  })
  .select()
  .single();
if (itemError) throw itemError;
assert(item.manager_id === users.manager.id, "Manager scope was not assigned to the item");

const openingPayload = {
  p_document_type: "OPENING_BALANCE",
  p_transaction_at: "2026-08-25T01:00:00.000Z",
  p_warehouse_id: warehouseId,
  p_to_warehouse_id: null,
  p_description: "Opening balance for local staging",
  p_idempotency_key: "local-api-opening-001",
  p_lines: [{
    inventory_item_id: item.id,
    quantity: 100,
    unit: "METER",
    input_unit_cost: 40000,
  }],
  p_business_transaction_id: null,
  p_counterparty_name: null,
  p_external_reference: "LOCAL-STAGING",
  p_reason: "Local staging acceptance",
};

const opening = await rpc(clients.manager, "create_inventory_document", openingPayload);
const openingRetry = await rpc(clients.manager, "create_inventory_document", openingPayload);
assert(opening.id === openingRetry.id && openingRetry.reused === true, "API idempotency reuse failed");
await rpc(clients.manager, "confirm_inventory_document", { p_document_id: opening.id });

const receipt = await rpc(clients.employee, "create_inventory_document", {
  p_document_type: "RECEIPT",
  p_transaction_at: "2026-08-25T02:00:00.000Z",
  p_warehouse_id: warehouseId,
  p_to_warehouse_id: null,
  p_description: "Employee receipt through PostgREST",
  p_idempotency_key: "local-api-receipt-001",
  p_lines: [{
    inventory_item_id: item.id,
    quantity: 20,
    unit: "METER",
    input_unit_cost: 50000,
  }],
  p_business_transaction_id: null,
  p_counterparty_name: "Local supplier",
  p_external_reference: "LOCAL-RECEIPT",
  p_reason: null,
});
await rpc(clients.employee, "confirm_inventory_document", { p_document_id: receipt.id });

const restrictedDraft = await rpc(clients.manager, "create_inventory_document", {
  p_document_type: "ISSUE",
  p_transaction_at: "2026-08-25T03:00:00.000Z",
  p_warehouse_id: warehouseId,
  p_to_warehouse_id: null,
  p_description: "Permission denial check",
  p_idempotency_key: "local-api-denial-001",
  p_lines: [{ inventory_item_id: item.id, quantity: 1, unit: "METER" }],
  p_business_transaction_id: null,
  p_counterparty_name: null,
  p_external_reference: null,
  p_reason: null,
});

const { error: deniedConfirm } = await clients.quantity.rpc("confirm_inventory_document", {
  p_document_id: restrictedDraft.id,
});
assert(deniedConfirm, "Quantity-only user unexpectedly confirmed a document");

const { error: deniedItemWrite } = await clients.quantity.from("inventory_items").insert({
  tenant_id: "default",
  code: "STG-DENIED",
  name: "Must not be created",
  item_type: "OTHER",
  base_unit: "PIECE",
});
assert(deniedItemWrite, "Quantity-only user unexpectedly created an inventory item");

const adminBalances = await rpc(clients.admin, "list_inventory_balances", {});
const managerBalances = await rpc(clients.manager, "list_inventory_balances", {});
const quantityBalances = await rpc(clients.quantity, "list_inventory_balances", {});
const costBalances = await rpc(clients.cost, "list_inventory_balances", {});

const adminBalance = adminBalances.find((row) => row.inventory_item_id === item.id);
const managerBalance = managerBalances.find((row) => row.inventory_item_id === item.id);
const quantityBalance = quantityBalances.find((row) => row.inventory_item_id === item.id);
const costBalance = costBalances.find((row) => row.inventory_item_id === item.id);

assert(adminBalance && managerBalance && quantityBalance && costBalance, "A role could not see the scoped balance");
assert(Number(managerBalance.quantity_on_hand) === 120, "Unexpected quantity after opening and receipt");
assert(Number(managerBalance.inventory_value) === 5000000, "Unexpected inventory value after MWA receipt");
assert(Number(managerBalance.average_unit_cost.toFixed(6)) === Number((5000000 / 120).toFixed(6)), "Unexpected moving average cost");
assert(quantityBalance.average_unit_cost === null && quantityBalance.inventory_value === null, "Cost masking failed");
assert(costBalance.average_unit_cost !== null && costBalance.inventory_value !== null, "Cost-view permission failed");

const reconciliation = await rpc(clients.manager, "reconcile_inventory_balances", {});
const mismatch = reconciliation.find((row) =>
  row.inventory_item_id === item.id &&
  (Number(row.quantity_difference) !== 0 || Number(row.value_difference) !== 0)
);
assert(!mismatch, "Ledger and balance projection do not reconcile");

const manufacturingProductId = crypto.randomUUID();
const { error: manufacturingProductError } = await service.from("products").insert({
  id: manufacturingProductId,
  tenant_id: "default",
  manager_id: users.manager.id,
  name: "Sản phẩm staging BOM",
  sku: "STG-BOM-001",
  category: "STAGING",
  in_stock: true,
});
if (manufacturingProductError) throw manufacturingProductError;

await rpc(clients.manager, "save_product_manufacturing_profile", {
  p_product_id: manufacturingProductId,
  p_manufacturing_type: "GENERIC_SEWN_PRODUCT",
  p_finished_width: 70,
  p_finished_length: 100,
  p_finished_height: null,
  p_dimension_unit: "CM",
  p_extra_dimensions: {},
  p_is_active: true,
});

const cuttingDraft = await rpc(clients.manager, "create_cutting_profile_draft", {
  p_product_id: manufacturingProductId,
  p_code: "STG-CUT-001",
  p_name: "Grid staging 280",
  p_manufacturing_type: "GENERIC_SEWN_PRODUCT",
  p_clone_version_id: null,
});
const cuttingVersionId = cuttingDraft.version.id;
await rpc(clients.manager, "save_cutting_profile_draft", {
  p_version_id: cuttingVersionId,
  p_effective_from: "2026-01-01",
  p_effective_to: null,
  p_configuration: {
    piece_width_rule: "FINISHED_WIDTH",
    piece_length_rule: "FINISHED_LENGTH",
    pieces_per_product: 1,
    default_fabric_width_cm: 280,
    pattern_direction: "NONE",
    allow_rotation: false,
    requires_matching_pattern: false,
    joining_allowed: false,
    joining_rule: "NONE",
    standard_waste_rate: 0,
    issue_rounding_increment: 0.0001,
  },
});
await rpc(clients.manager, "approve_cutting_profile_version", {
  p_version_id: cuttingVersionId,
  p_reason: "Local staging acceptance",
  p_supersede_previous: true,
});
const cuttingResult = await rpc(clients.manager, "calculate_cutting_consumption", {
  p_cutting_profile_version_id: cuttingVersionId,
  p_quantity: 8,
  p_fabric_width_cm: 280,
  p_allow_draft: false,
});
assert(cuttingResult.status === "FEASIBLE" && Number(cuttingResult.pieces_across) === 4 && Number(cuttingResult.rows) === 2, "Cutting RPC golden failed through PostgREST");

const bomDraft = await rpc(clients.manager, "create_bom_draft", {
  p_product_id: manufacturingProductId,
  p_code: "STG-BOM-001",
  p_name: "BOM staging",
  p_clone_version_id: null,
});
const bomVersionId = bomDraft.version.id;
await rpc(clients.manager, "save_bom_draft", {
  p_version_id: bomVersionId,
  p_effective_from: "2026-01-01",
  p_effective_to: null,
  p_notes: "Local API acceptance",
  p_lines: [{
    inventory_item_id: item.id,
    line_type: "MATERIAL",
    quantity_method: "PER_UNIT",
    standard_quantity: 3.2,
    unit: "METER",
    waste_rate: 0,
    scrap_rate: 0,
    sequence: 1,
  }],
});
await rpc(clients.manager, "approve_bom_version", {
  p_version_id: bomVersionId,
  p_reason: "Local staging acceptance",
  p_supersede_previous: true,
});

const movementsBeforeBomPreview = await rpc(clients.manager, "list_inventory_movements", {
  p_inventory_item_id: item.id,
  p_limit: 100,
});
const managerRequirement = await rpc(clients.manager, "calculate_standard_material_requirements", {
  p_product_id: manufacturingProductId,
  p_quantity: 1,
  p_effective_date: "2026-08-25",
  p_bom_version_id: null,
  p_allow_draft: false,
  p_warehouse_id: warehouseId,
  p_save_snapshot: false,
});
const quantityRequirement = await rpc(clients.quantity, "calculate_standard_material_requirements", {
  p_product_id: manufacturingProductId,
  p_quantity: 1,
  p_effective_date: "2026-08-25",
  p_bom_version_id: null,
  p_allow_draft: false,
  p_warehouse_id: warehouseId,
  p_save_snapshot: false,
});
const movementsAfterBomPreview = await rpc(clients.manager, "list_inventory_movements", {
  p_inventory_item_id: item.id,
  p_limit: 100,
});
assert(Number(managerRequirement.materials[0].standard_quantity) === 3.2, "BOM requirement quantity failed through PostgREST");
assert(managerRequirement.materials[0].average_unit_cost !== null && managerRequirement.materials[0].estimated_material_cost !== null, "Manager cost preview was unexpectedly masked");
assert(quantityRequirement.materials[0].average_unit_cost === null && quantityRequirement.materials[0].estimated_material_cost === null, "BOM cost masking failed through PostgREST");
assert(movementsAfterBomPreview.length === movementsBeforeBomPreview.length, "BOM preview created an inventory movement through PostgREST");

const { error: directApprovalBypass } = await clients.manager
  .from("bom_versions")
  .update({ status: "DRAFT" })
  .eq("id", bomVersionId);
assert(directApprovalBypass, "Direct BOM status update unexpectedly bypassed the approval RPC");

// Regression HIGH-1: snapshot cost must not leak through PostgREST RLS.
const snapshotResult = await rpc(clients.manager, "calculate_standard_material_requirements", {
  p_product_id: manufacturingProductId,
  p_quantity: 1,
  p_effective_date: "2026-08-25",
  p_bom_version_id: null,
  p_allow_draft: false,
  p_warehouse_id: warehouseId,
  p_save_snapshot: true,
});
assert(snapshotResult.snapshot_id, "Snapshot was not saved for cost-leakage regression");
const { data: leakedSnapshots, error: snapshotReadError } = await clients.quantity
  .from("material_requirement_calculations")
  .select("id")
  .eq("id", snapshotResult.snapshot_id);
if (!snapshotReadError) {
  assert(!leakedSnapshots || leakedSnapshots.length === 0, "Cost snapshot leaked to a user without inventory_cost_view via PostgREST");
}

// Regression HIGH-2: explicit BOM version outside effective date must be rejected via PostgREST.
const { error: outOfDateError } = await clients.manager.rpc("calculate_standard_material_requirements", {
  p_product_id: manufacturingProductId,
  p_quantity: 1,
  p_effective_date: "2025-01-01",
  p_bom_version_id: bomVersionId,
  p_allow_draft: false,
  p_warehouse_id: null,
  p_save_snapshot: false,
});
assert(outOfDateError, "Out-of-effective-date BOM was unexpectedly accepted via PostgREST");

console.log(JSON.stringify({
  result: "local_staging_api_acceptance: PASS",
  roles_verified: Object.keys(accounts),
  quantity_on_hand: Number(managerBalance.quantity_on_hand),
  inventory_value: Number(managerBalance.inventory_value),
  cost_masked_for_quantity_user: true,
  idempotency_reused: true,
  unauthorized_confirm_blocked: true,
  unauthorized_item_write_blocked: true,
  reconciliation_difference: 0,
  bom_cutting_postgrest_acceptance: true,
  direct_bom_approval_bypass_blocked: true,
  bom_preview_inventory_side_effect: false,
  snapshot_cost_leakage_blocked: true,
  out_of_effective_date_bom_blocked: true,
}));
