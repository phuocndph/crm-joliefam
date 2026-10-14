import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  actor, api, checkCount, checkpoint, close, dates, denied, isolated, key,
  manufacturing, must, ownedRollback, profiles, qaMetadata, refreshOwnedProjections, sql, token, unwrap, verifyRestart,
} from "./local-sales-production-test-helpers.mjs";

const dispatch = "/api/production-dispatch";
const sales = "/api/production-sales/requests";
const reportPath = (id, action) => `${dispatch}/reports/${id}/${action}`;
const assignmentPath = (id, action) => `${dispatch}/assignments/${id}/${action}`;
const list = (payload) => Array.isArray(payload) ? payload : payload.rows ?? payload.items ?? [];

async function report(session, assignmentId, good, label, extra = {}) {
  return unwrap(await must("POST", assignmentPath(assignmentId, "reports"), {
    work_date: dates.first, quantity_good: good, notes: "Isolated sales production report",
    idempotency_key: key(label), ...extra,
  }, session), "report");
}
async function review(session, reportId, target, label) {
  return must("POST", reportPath(reportId, "review"), {
    target_status: target, reason: "Isolated sales workflow review", idempotency_key: key(label),
  }, session);
}

async function setup() {
  const bootstrap = await must("GET", "/api/local-auth/session");
  const admin = bootstrap.token;
  assert(admin);
  const manager = await actor(admin, "MANAGER", "manager", "SUPERVISOR");
  const sale = await actor(admin, "SALE", "employee", "GENERIC", ["orders", "production_sales_submit"]);
  const cutter = await actor(admin, "CUTTER", "employee", "CUTTER", ["production_view", "production_operations"]);
  const sewer = await actor(admin, "SEWER-A", "employee", "SEWING", ["production_view", "production_operations"]);
  const sewerB = await actor(admin, "SEWER-B", "employee", "SEWING", ["production_view", "production_operations"]);
  const outsider = await actor(admin, "OUTSIDER", "employee", "SEWING", ["production_view", "production_operations"]);
  const planner = await actor(admin, "PLANNER", "employee", "CUTTER", ["production_cutting_plan"]);
  const inventoryMaker = await actor(admin, "INVENTORY-MAKER", "employee", "GENERIC", ["inventory_documents"]);
  await profiles([manager.worker, sale.worker, cutter.worker, sewer.worker, sewerB.worker, outsider.worker]);
  for (const worker of [cutter.worker, sewer.worker, sewerB.worker]) await sql("insert into local_payroll_team_assignments(supervisor_worker_id,worker_id,effective_from,reason,created_by) values($1,$2,$3,'Isolated open-job team','local-admin')", [manager.worker.id, worker.id, dates.start]);
  const product = await must("POST", "/api/catalog/products", { sku: `FLOW-SKU-${token}`, name: `Sales workflow ${token}`, rate: 99999, rate_unit: "PIECE", effective_from: dates.start, rate_reason: "Unrelated CRM SKU must not determine wages" }, admin);
  const pieceCode = `FLOW-EXCEL-${token}`;
  await sql("insert into local_product_rates(piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,status,reason) values($1,'Independent sewing work code',12500.25,'PIECE',$2,'APPROVED','Isolated full flow')", [pieceCode, dates.start]);
  // Warehouse identity is a synthetic fixture; stock comes through real documents.
  const warehouseId = randomUUID(), fabricId = randomUUID();
  await sql("insert into local_inventory_warehouses(id,code,name) values($1,$2,'Workflow fixture warehouse')", [warehouseId, `FLOW-WH-${token}`]);
  await sql("insert into local_fabric_variants(id,variant_name,color,unit,is_snapshot_record) values($1,'Workflow fixture fabric','Blue','m',false)", [fabricId]);
  const inventoryItem = await must("POST", "/api/inventory/items", { code: `FLOW-FABRIC-${token}`, name: "Workflow fabric", item_type: "RAW_MATERIAL", base_unit: "METER" }, admin);
  const standards = await manufacturing(product.id, manager.session, { lines: [{ inventory_item_id: inventoryItem.id, line_type: "MATERIAL", quantity_method: "PER_UNIT", standard_quantity: 3, unit: "METER", waste_rate: 0, scrap_rate: 0 }] });
  await denied("PUT", `/api/manufacturing/bom/versions/${standards.bom.version.id}`, { effective_from: dates.start, lines: [] }, manager.session, [403, 409]);
  await denied("PUT", `/api/manufacturing/routing/versions/${standards.routing.version.id}`, { effective_from: dates.start, operations: [] }, manager.session, [403, 409]);
  const opening = await must("POST", "/api/inventory/documents", { document_type: "OPENING_BALANCE", warehouse_id: warehouseId, transaction_at: dates.start, description: "Isolated workflow opening stock", idempotency_key: key("opening-stock"), lines: [{ inventory_item_id: inventoryItem.id, quantity: 500, unit: "METER", input_unit_cost: 42000 }] }, admin);
  await must("POST", `/api/inventory/documents/${opening.id}/confirm`, { reason: "Isolated fixture opening" }, admin);
  await denied("POST", "/api/inventory/documents", { document_type: "OPENING_BALANCE", warehouse_id: warehouseId, transaction_at: dates.start, idempotency_key: key("employee-arbitrary-stock"), lines: [{ inventory_item_id: inventoryItem.id, quantity: 1, unit: "METER", input_unit_cost: 42000 }] }, sewer.session, [403]);
  await denied("POST", `/api/inventory/documents/${opening.id}/confirm`, { reason: "Unauthorized replay still needs inventory permission" }, sewer.session, [403]);
  await must("POST", "/api/fabric-inventory-mappings", { fabric_variant_id: fabricId, inventory_item_id: inventoryItem.id, reason: "Isolated explicit fabric mapping" }, manager.session);
  await denied("POST", "/api/fabric-inventory-mappings", { fabric_variant_id: randomUUID(), inventory_item_id: inventoryItem.id, reason: "Nonexistent variant must not be mapped" }, manager.session);
  const legacyWarehouseId = randomUUID();
  await sql("insert into local_warehouses(id,name,is_snapshot_record) values($1,'Isolated legacy stock quarantine',false)", [legacyWarehouseId]);
  await sql("insert into local_fabric_inventory(id,fabric_variant_id,warehouse_id,current_stock,is_snapshot_record) values($1,$2,$3,9999,false)", [randomUUID(), fabricId, legacyWarehouseId]);
  return { admin, manager, sale, cutter, sewer, sewerB, outsider, planner, inventoryMaker, product, standards, pieceCode, warehouseId, fabricId, inventoryItem, legacyWarehouseId };
}

if (process.argv.includes("--verify-restart")) {
  try { await verifyRestart(); } finally { await close(); }
} else {
  try {
    await isolated();
    const fixture = await setup();
    await runWorkflow(fixture);
    console.log(`PASS local sales production: ${checkCount()} HTTP/concurrency checks; Sale → fabric estimate → open jobs → cut → sew → own earnings → payroll lock.`);
  } finally { await close(); }
}

async function salesHandoff(f) {
  const { manager, sale, sewer, outsider, product } = f;
  const order = await must("POST", "/api/orders", { order_number: `FLOW-SALE-${token}`, manager_id: sale.user.user_id, status: "processing", delivery_date: dates.end, items: [
    { product: { id: product.id, sku: product.sku, name: product.name }, quantity: 100, color: "Blue", size: "M", dimensions: "40 × 60" },
    { originalProductId: product.id, id: `repeat-row-${token}`, quantity: 20, color: "Red", size: "L", dimensions: "50 × 70" },
  ] }, manager.session);
  const sources = list(await must("GET", "/api/production/source-orders", undefined, sale.session));
  const source = sources.find((row) => row.id === order.id);
  assert(source, "New canonical local sale is missing from source picker.");
  assert.equal(source.items.length, 2);
  assert.equal(source.items[0].product_id, source.items[1].product_id);
  assert.notEqual(source.items[0].source_line_key, source.items[1].source_line_key, "Repeated product lines were merged.");
  await verifyProductionSourceGuards(f, order.id, source.items[0].source_line_key);
  const outsiderSources = list(await must("GET", "/api/production/source-orders", undefined, outsider.session));
  assert(!outsiderSources.some((row) => row.id === order.id), "Unrelated employee read another Sale's order.");
  await denied("POST", "/api/production-orders/groups", { order_id: order.id, source_type: "FROM_ORDER", idempotency_key: key("source-group-bypass"), lines: [{ product_id: product.id, quantity: 1, source_order_item_key: source.items[0].source_line_key }] }, manager.session);
  const body = { order_id: order.id, due_date: dates.end, priority: "HIGH", notes: "Two same SKU lines retain independent identity", idempotency_key: key("sale-submit"), lines: source.items.map((line) => ({ source_line_key: line.source_line_key, quantity: line.ordered_quantity })) };
  await denied("POST", sales, body, sewer.session, [403]);
  await denied("POST", sales, { ...body, lines: [{ source_line_key: "invented-line", quantity: 1 }], idempotency_key: key("sale-invalid-line") }, sale.session);
  const request = await must("POST", sales, body, sale.session);
  const replay = await must("POST", sales, body, sale.session);
  assert.equal(replay.id, request.id);
  assert.equal(request.lines.length, 2);
  assert.equal(Number(request.lines[0].requested_quantity), 100);
  await denied("POST", sales, { ...body, idempotency_key: key("sale-fresh-overquota") }, sale.session);
  await denied("POST", sales, { ...body, notes: "changed content" }, sale.session, [409]);
  await denied("POST", `${sales}/${request.id}/review`, { target_status: "ACCEPTED", idempotency_key: key("sale-self-accept") }, sale.session, [403]);
  await denied("POST", `${sales}/${request.id}/allocate`, { idempotency_key: key("sale-unaccepted-allocate"), lines: [{ request_line_id: request.lines[0].id, quantity: 100 }] }, manager.session);
  const acceptBody = { target_status: "ACCEPTED", reason: "Production manager receives request", idempotency_key: key("sale-accepted") };
  await must("POST", `${sales}/${request.id}/review`, acceptBody, manager.session);
  await must("POST", `${sales}/${request.id}/review`, acceptBody, manager.session);
  const allocation = { idempotency_key: key("sales-wave-main"), lines: [{ request_line_id: request.lines[0].id, quantity: 100, fabric_variant_id: f.fabricId }] };
  await denied("POST", `${sales}/${request.id}/allocate`, allocation, sale.session, [403]);
  const mainWave = await must("POST", `${sales}/${request.id}/allocate`, allocation, manager.session);
  const mainRetry = await must("POST", `${sales}/${request.id}/allocate`, allocation, manager.session);
  assert.equal(mainRetry.orders[0].id, mainWave.orders[0].id);
  const redBody = (label) => ({ idempotency_key: key(label), lines: [{ request_line_id: request.lines[1].id, quantity: 15, fabric_variant_id: f.fabricId }] });
  const waves = await Promise.all([api("POST", `${sales}/${request.id}/allocate`, redBody("red-wave-race-a"), manager.session), api("POST", `${sales}/${request.id}/allocate`, redBody("red-wave-race-b"), manager.session)]);
  assert.equal(waves.filter((result) => result.ok).length, 1, "Concurrent waves exceeded accepted quantity.");
  assert(waves.every((result) => result.ok || [400, 409, 422].includes(result.status)));
  const partial = waves.find((result) => result.ok).payload.orders[0];
  const remainder = await must("POST", `${sales}/${request.id}/allocate`, { idempotency_key: key("red-wave-rest"), lines: [{ request_line_id: request.lines[1].id, quantity: 5, fabric_variant_id: f.fabricId }] }, manager.session);
  await denied("POST", `${sales}/${request.id}/allocate`, { idempotency_key: key("red-wave-over"), lines: [{ request_line_id: request.lines[1].id, quantity: 1 }] }, manager.session);
  const totals = (await sql("select l.id,l.source_line_key,l.requested_quantity::text qty,coalesce(sum(a.quantity),0)::text allocated from local_production_sales_request_lines l left join local_production_sales_allocations a on a.request_line_id=l.id where l.request_id=$1 group by l.id order by l.source_line_index", [request.id])).rows;
  assert.deepEqual(totals.map((row) => Number(row.allocated)), [100, 20]);
  const items = list(await must("GET", `/api/production-orders/${mainWave.orders[0].id}/items`, undefined, manager.session));
  assert.equal(items[0].color, "Blue");
  assert.equal(items[0].source_order_item_key, source.items[0].source_line_key);
  const mine = list(await must("GET", `${sales}?mine=1`, undefined, sale.session));
  assert(mine.some((row) => row.id === request.id));
  assert(!list(await must("GET", `${sales}?mine=1`, undefined, outsider.session)).some((row) => row.id === request.id));
  // Request reservation is serialized separately from later production waves.
  const raceOrder = await must("POST", "/api/orders", { order_number: `FLOW-REQUEST-RACE-${token}`, manager_id: sale.user.user_id, status: "processing", items: [{ product: { id: product.id }, quantity: 30 }] }, manager.session);
  const raceSource = list(await must("GET", "/api/production/source-orders", undefined, sale.session)).find((row) => row.id === raceOrder.id);
  const requestBody = (label) => ({ order_id: raceOrder.id, idempotency_key: key(label), lines: [{ source_line_key: raceSource.items[0].source_line_key, quantity: 20 }] });
  const requestRace = await Promise.all([api("POST", sales, requestBody("request-race-a"), sale.session), api("POST", sales, requestBody("request-race-b"), sale.session)]);
  assert.equal(requestRace.filter((result) => result.ok).length, 1, "Concurrent Sale requests reserved more than the order line quantity.");
  const reservedRequest = requestRace.find((result) => result.ok).payload;
  await denied("POST", `${sales}/${reservedRequest.id}/review`, acceptBody, manager.session, [409]);
  await denied("POST", `${sales}/${reservedRequest.id}/review`, { target_status: "RETURNED", idempotency_key: key("returned-no-reason") }, manager.session);
  const returnedBody = { target_status: "RETURNED", reason: "Revise requested wave", idempotency_key: key("sale-returned") };
  await must("POST", `${sales}/${reservedRequest.id}/review`, returnedBody, manager.session);
  await must("POST", `${sales}/${reservedRequest.id}/review`, returnedBody, manager.session);
  const resubmitted = await must("POST", sales, { ...requestBody("resubmit-returned"), lines: [{ source_line_key: raceSource.items[0].source_line_key, quantity: 30 }] }, sale.session);
  await must("POST", `${sales}/${resubmitted.id}/review`, { target_status: "ACCEPTED", idempotency_key: key("resubmit-accept") }, manager.session);
  await must("PATCH", `/api/orders/${raceOrder.id}`, { notes: "Sales order changed after acceptance" }, manager.session);
  const notesOnly = list(await must("GET", `${sales}?mine=1`, undefined, sale.session)).find((row) => row.id === resubmitted.id);
  assert.equal(notesOnly.source_changed, false, "Non-production order notes unnecessarily invalidated an accepted handoff.");
  // Simulate an upstream source-line revision in this owned fixture database;
  // the local PATCH endpoint deliberately exposes only order header fields.
  await sql("update local_orders set items=$2::jsonb,updated_at=now() where id=$1", [raceOrder.id, JSON.stringify([{ product: { id: product.id }, quantity: 31 }])]);
  await denied("POST", `${sales}/${resubmitted.id}/allocate`, { idempotency_key: key("changed-source-allocation"), lines: [{ request_line_id: resubmitted.lines[0].id, quantity: 1 }] }, manager.session);
  const changed = list(await must("GET", `${sales}?mine=1`, undefined, sale.session)).find((row) => row.id === resubmitted.id);
  assert.equal(changed.source_changed, true, "Changed source order was not flagged for adjustment.");
  await verifySourceIdentity(f);
  await verifyAmbiguousLegacySource(f);
  return { order, request, main: mainWave.orders[0], others: [partial, remainder.orders[0]] };
}

async function verifyAmbiguousLegacySource(f) {
  // A repeated product with different specifications is valid (the main handoff
  // fixture above covers that case).  The legacy fallback must only reject a
  // genuinely ambiguous pair: identical product/specification rows without a
  // unique quote-line identity.
  const order = await must("POST", "/api/orders", { order_number: `FLOW-DUPLICATE-LEGACY-${token}`, manager_id: f.sale.user.user_id, status: "processing", items: [{ id: f.product.id, quantity: 10, color: "Blue", size: "M", dimensions: "40 × 60" }, { id: f.product.id, quantity: 20, color: "Blue", size: "M", dimensions: "40 × 60" }] }, f.manager.session);
  try {
    const refused = await denied("POST", sales, { order_id: order.id, idempotency_key: key("legacy-duplicate-source-key"), lines: [{ source_line_key: `sale:${order.id}:${f.product.id}`, quantity: 1 }] }, f.sale.session, [409]);
    assert(/trùng|không.*duy nhất|nhận diện|duplicate|ambig/i.test(refused.payload.message || ""), "Legacy duplicate line identity has no clear reconciliation error.");
    assert.equal((await sql("select count(*)::int count from local_production_sales_requests where order_id=$1", [order.id])).rows[0].count, 0, "Ambiguous legacy source partially reserved a request.");
  } finally {
    // Remove this owned malformed source so it cannot poison later picker tests.
    await sql("delete from local_orders where id=$1 and order_number=$2", [order.id, `FLOW-DUPLICATE-LEGACY-${token}`]);
  }

  // A stale source key on an otherwise valid legacy line is a different,
  // actionable reconciliation failure.  The API intentionally returns 400
  // before creating a request; keep that contract explicit in the test.
  const staleOrder = await must("POST", "/api/orders", { order_number: `FLOW-STALE-LEGACY-${token}`, manager_id: f.sale.user.user_id, status: "processing", items: [{ id: f.product.id, quantity: 5, color: "Green", size: "S", dimensions: "30 × 40" }] }, f.manager.session);
  try {
    const refused = await denied("POST", sales, { order_id: staleOrder.id, idempotency_key: key("legacy-stale-source-key"), lines: [{ source_line_key: `sale:${staleOrder.id}:${f.product.id}:stale`, quantity: 1 }] }, f.sale.session, [400]);
    assert(/không còn khớp|reconciliation|source|dòng/i.test(refused.payload.message || ""), "Stale legacy source key has no clear reconciliation error.");
    assert.equal((await sql("select count(*)::int count from local_production_sales_requests where order_id=$1", [staleOrder.id])).rows[0].count, 0, "Stale legacy source partially reserved a request.");
  } finally {
    await sql("delete from local_orders where id=$1 and order_number=$2", [staleOrder.id, `FLOW-STALE-LEGACY-${token}`]);
  }
}

async function verifyInitialAdjustmentGuard(f, handoff) {
  await must("POST", `${sales}/${handoff.request.id}/change-request`, { reason: "Sale adjustment before first release", idempotency_key: key("sale-adjustment-before-release") }, f.sale.session);
  for (const [index, status] of ["DRAFT", "PLANNED"].entries()) {
    const order = index === 0 ? handoff.main : handoff.others[0];
    // Exercise both valid unreleased states even if change-request proactively
    // holds them; this models an older row created before the hold propagation.
    await sql("update local_production_orders set status=$2 where id=$1 and released_at is null", [order.id, status]);
    const before = (await sql("select status,bom_version_id,routing_version_id,released_at from local_production_orders where id=$1", [order.id])).rows[0];
    await denied("POST", `/api/production-orders/${order.id}/release`, { idempotency_key: key(`adjustment-unreleased-${status}`) }, f.manager.session, [409]);
    assert.deepEqual((await sql("select status,bom_version_id,routing_version_id,released_at from local_production_orders where id=$1", [order.id])).rows[0], before, "Rejected initial release partially changed an order.");
    assert.equal((await sql("select count(*)::int count from local_production_order_material_requirements where production_order_id=$1", [order.id])).rows[0].count, 0);
    assert.equal((await sql("select count(*)::int count from local_production_order_operations where production_order_id=$1", [order.id])).rows[0].count, 0);
  }
  await must("POST", `${sales}/${handoff.request.id}/review`, { target_status: "ACCEPTED", reason: "Manager resolves initial adjustment", idempotency_key: key("sale-initial-adjustment-resolved") }, f.manager.session);
}

async function verifySyncSourceGuard(f, handoff) {
  const order = (await sql("select to_jsonb(o) row from local_orders o where id=$1", [handoff.order.id])).rows[0].row;
  const protectedSource = async () => (await sql("select items,status,manager_id,assignee_id from local_orders where id=$1", [order.id])).rows[0];
  const initial = await protectedSource();
  const changed = { ...order, status: "cancelled", manager_id: f.outsider.user.user_id, assignee_id: f.outsider.user.user_id, items: order.items.map((line, index) => index === 0 ? { ...line, quantity: Number(line.quantity) + 1, color: "Changed by owned sync fixture" } : line), updated_at: new Date().toISOString() };
  const sourceHash = createHash("sha256").update(JSON.stringify(changed)).digest("hex");
  await sql("update local_orders set local_modified_at=null,is_snapshot_record=true where id=$1", [order.id]);
  await sql("insert into local_source_snapshots(source_table,source_key,source_hash,payload,is_deleted) values('orders',$1,$2,$3::jsonb,false)", [order.id, sourceHash, JSON.stringify(changed)]);
  const events = async () => (await sql("select count(*)::int count from local_production_sales_events where request_id=$1", [handoff.request.id])).rows[0].count;
  const beforeEvents = await events();
  await refreshOwnedProjections();
  assert.deepEqual(await protectedSource(), initial, "Sync silently replaced active handed-off items/status/manager/assignee.");
  assert.equal((await sql("select status from local_production_sales_requests where id=$1", [handoff.request.id])).rows[0].status, "ADJUSTMENT_REQUIRED", "Changed upstream source did not create a managed adjustment.");
  const changedEvents = await events();
  assert(changedEvents > beforeEvents, "Sync source change has no audit event.");
  await refreshOwnedProjections();
  assert.equal(await events(), changedEvents, "Unchanged sync source hash created repeated adjustment events.");
  await must("POST", `${sales}/${handoff.request.id}/review`, { target_status: "ACCEPTED", reason: "Manager acknowledges the owned upstream source change", idempotency_key: key("sync-source-change-acknowledged") }, f.manager.session);
  const acknowledgedEvents = await events();
  await refreshOwnedProjections();
  assert.equal((await sql("select status from local_production_sales_requests where id=$1", [handoff.request.id])).rows[0].status, "ACCEPTED", "Acknowledged unchanged source hash reopened the same adjustment.");
  assert.equal(await events(), acknowledgedEvents);
  assert.deepEqual(await protectedSource(), initial, "Source acknowledgement rewrote the handed-off local source.");
}

async function verifyProductionSourceGuards(f, orderId, sourceKey) {
  const counts = async () => (await sql("select (select count(*) from local_production_orders)::int orders,(select count(*) from local_production_order_items)::int items,(select count(*) from local_production_batches)::int batches,(select count(*) from local_production_sales_allocations)::int allocations,(select count(*) from local_production_sales_request_lines)::int requests")).rows[0];
  const before = await counts();
  const groupPaths = ["/api/production-orders/groups", "/API/Production-Orders/Groups/", "/api/legacy-production-orders/group", "/API/Legacy-Production-Orders/Group/"];
  for (const [index, path] of groupPaths.entries()) {
    for (const sourceType of ["MANUAL", "FROM_STOCK_PLAN"]) {
      await denied("POST", path, { source_type: sourceType, order_id: orderId, idempotency_key: key(`linked-group-${index}-${sourceType}`), lines: [{ product_id: f.product.id, quantity: 1 }] }, f.manager.session, [400, 409, 422]);
    }
    for (const [alias, value] of [["source_id", orderId], ["orderId", orderId], ["sourceId", orderId]]) {
      await denied("POST", path, { source_type: "MANUAL", [alias]: value, idempotency_key: key(`group-alias-${index}-${alias}`), lines: [{ product_id: f.product.id, quantity: 1 }] }, f.manager.session, [400, 409, 422]);
    }
    for (const alias of ["source_order_item_key", "sourceOrderItemKey"]) {
      await denied("POST", path, { source_type: "MANUAL", idempotency_key: key(`group-line-link-${index}-${alias}`), lines: [{ product_id: f.product.id, quantity: 1, [alias]: sourceKey }] }, f.manager.session, [400, 409, 422]);
    }
  }
  for (const [index, path] of ["/api/production-orders", "/api/legacy-production-orders"].entries()) {
    for (const alias of ["order_id", "orderId", "source_id", "sourceId", "source_order_item_key", "sourceOrderItemKey"]) {
      await denied("POST", path, { product_id: f.product.id, quantity: 1, source_type: "MANUAL", [alias]: alias.includes("Item") || alias.includes("item") ? sourceKey : orderId, idempotency_key: key(`single-source-link-${index}-${alias}`) }, f.manager.session, [400, 409, 422]);
    }
  }
  assert.deepEqual(await counts(), before, "A rejected source-quota bypass partially created an order, item, batch, allocation or reservation.");
}

async function verifySourceIdentity(f) {
  const first = { id: `stable-a-${token}`, originalProductId: f.product.id, quantity: 10, color: "Blue", size: "M", price: 100 };
  const second = { id: `stable-b-${token}`, originalProductId: f.product.id, quantity: 20, color: "Red", size: "L", price: 200 };
  const order = await must("POST", "/api/orders", { order_number: `FLOW-IDENTITY-${token}`, manager_id: f.sale.user.user_id, status: "processing", items: [first, second] }, f.manager.session);
  const source = async () => list(await must("GET", "/api/production/source-orders", undefined, f.sale.session)).find((row) => row.id === order.id);
  const initial = await source();
  const request = await must("POST", sales, { order_id: order.id, idempotency_key: key("identity-reserve"), lines: [{ source_line_key: initial.items[0].source_line_key, quantity: 10 }] }, f.sale.session);
  await sql("update local_orders set items=$2::jsonb,updated_at=now() where id=$1", [order.id, JSON.stringify([{ ...first, price: 101 }, second])]);
  const priceSource = await source();
  await denied("POST", sales, { order_id: order.id, idempotency_key: key("identity-price-overquota"), lines: [{ source_line_key: priceSource.items[0].source_line_key, quantity: 1 }] }, f.sale.session);
  const priceRequest = list(await must("GET", `${sales}?mine=1`, undefined, f.sale.session)).find((row) => row.id === request.id);
  assert.equal(priceRequest.source_changed, false, "Unrelated sales-price changes reset a production line identity.");
  await sql("update local_orders set items=$2::jsonb,updated_at=now() where id=$1", [order.id, JSON.stringify([second, { ...first, price: 101 }])]);
  const reordered = await source();
  const sameBlue = reordered.items.find((row) => row.color === "Blue");
  await denied("POST", sales, { order_id: order.id, idempotency_key: key("identity-reorder-overquota"), lines: [{ source_line_key: sameBlue.source_line_key, quantity: 1 }] }, f.sale.session);
  assert.equal(Number((await sql("select sum(l.requested_quantity)::text quantity from local_production_sales_request_lines l join local_production_sales_requests r on r.id=l.request_id where r.order_id=$1", [order.id])).rows[0].quantity), 10, "Reordering reset quota on the same source line.");
}

async function cuttingEstimate(f, main) {
  const estimateBase = `/api/production-orders/${main.id}/cutting-estimates`;
  await must("POST", `/api/production-orders/${main.id}/release`, { idempotency_key: key("main-release") }, f.manager.session);
  const fabricSnapshot = (await sql("select planned_quantity::text qty from local_production_order_material_requirements where production_order_id=$1 and inventory_item_id=$2", [main.id, f.inventoryItem.id])).rows[0];
  assert.equal(Number(fabricSnapshot?.qty), 300, "Released material snapshot did not preserve the fabric requirement.");
  // Purposeful historical malformed fixture: a future empty approved version
  // must never erase the material requirement already frozen at release.
  await sql("insert into local_manufacturing_records(id,record_type,parent_id,version_number,status,payload) values($1,'bom_version',$2,99,'APPROVED',$3::jsonb)", [randomUUID(), f.standards.bom.header.id, JSON.stringify({ version_number: 99, effective_from: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10), status: "APPROVED" })]);
  const line = { order_item_id: main.order_item_id, fabric_variant_id: f.fabricId, inventory_item_id: f.inventoryItem.id, warehouse_id: f.warehouseId, output_quantity: 100, calculation_method: "BOM_PER_UNIT", unit_per_output: 3, waste_rate: 10, waste_already_included: true };
  const body = { production_batch_id: main.production_batch_id, reason: "Standard already contains waste", idempotency_key: key("estimate-create"), lines: [line] };
  const falseEmpty = await must("POST", estimateBase, { production_batch_id: main.production_batch_id, no_material_required: true, reason: "Attempting to bypass real fabric requirement", lines: [], idempotency_key: key("false-no-material") }, f.cutter.session);
  await must("POST", `/api/cutting-estimates/${falseEmpty.id}/submit`, { idempotency_key: key("false-no-material-submit") }, f.cutter.session);
  await denied("POST", `/api/cutting-estimates/${falseEmpty.id}/review`, { target_status: "APPROVED", reason: "Must reject real material bypass", idempotency_key: key("false-no-material-approve") }, f.manager.session);
  await must("POST", `/api/cutting-estimates/${falseEmpty.id}/review`, { target_status: "REJECTED", reason: "Approved BOM requires fabric", idempotency_key: key("false-no-material-reject") }, f.manager.session);
  await denied("POST", estimateBase, { ...body, lines: [{ ...line, calculation_method: "MANUAL_MEASURED", estimated_quantity: 300 }], idempotency_key: key("manual-no-reason") }, f.cutter.session);
  const estimate = await must("POST", estimateBase, body, f.cutter.session);
  assert(list(await must("GET", estimateBase, undefined, f.planner.session)).some((row) => row.id === estimate.id), "Planner-only account cannot read its estimate workspace.");
  assert.equal(Number(estimate.lines[0].estimated_quantity), 300, "Already-included waste was counted twice.");
  assert.equal((await must("POST", estimateBase, body, f.cutter.session)).id, estimate.id);
  const cutBody = { production_order_id: main.id, production_batch_id: main.production_batch_id, order_item_id: main.order_item_id, worker_id: f.cutter.worker.id, stage: "CUTTING", quantity: 100, assigned_from: dates.start, idempotency_key: key("cut-before-estimate") };
  await denied("POST", `${dispatch}/assignments`, cutBody, f.manager.session);
  const issueBody = { warehouse_id: f.warehouseId, transaction_at: dates.first, idempotency_key: key("issue-unapproved"), lines: [{ estimate_line_id: estimate.lines[0].id, quantity: 300 }] };
  await denied("POST", `/api/cutting-estimates/${estimate.id}/material-issue`, issueBody, f.manager.session);
  await must("POST", `/api/cutting-estimates/${estimate.id}/submit`, { idempotency_key: key("estimate-submit") }, f.cutter.session);
  await denied("POST", `/api/cutting-estimates/${estimate.id}/review`, { target_status: "APPROVED", idempotency_key: key("estimate-self-review") }, f.cutter.session, [403]);
  const reviewBody = { target_status: "APPROVED", reason: "Validated cutting plan", idempotency_key: key("estimate-approved") };
  await must("POST", `/api/cutting-estimates/${estimate.id}/review`, reviewBody, f.manager.session);
  await must("POST", `/api/cutting-estimates/${estimate.id}/review`, reviewBody, f.manager.session);
  await denied("POST", `${dispatch}/assignments`, { ...cutBody, idempotency_key: key("cut-before-issue") }, f.manager.session);
  const issue = await must("POST", `/api/cutting-estimates/${estimate.id}/material-issue`, { ...issueBody, idempotency_key: key("issue-first") }, f.manager.session);
  const makerDraft = await must("POST", "/api/inventory/documents", { document_type: "OPENING_BALANCE", warehouse_id: f.warehouseId, transaction_at: dates.first, idempotency_key: key("inventory-maker-draft"), lines: [{ inventory_item_id: f.inventoryItem.id, quantity: 1, unit: "METER", input_unit_cost: 42000 }] }, f.inventoryMaker.session);
  await denied("POST", `/api/inventory/documents/${makerDraft.id}/confirm`, { reason: "Creation permission must not grant confirmation" }, f.inventoryMaker.session, [403]);
  await denied("POST", `/api/inventory/documents/${issue.id}/confirm`, { reason: "Estimate-linked issue still requires inventory_confirm" }, f.inventoryMaker.session, [403]);
  assert.equal((await sql("select count(*)::int count from local_inventory_movements where document_id=any($1::uuid[])", [[makerDraft.id, issue.id]])).rows[0].count, 0, "Unauthorized inventory confirmation partially posted ledger.");
  await must("POST", `/api/inventory/documents/${makerDraft.id}/void`, { reason: "Discard owned ACL fixture" }, f.manager.session);
  assert.equal((await must("POST", `/api/cutting-estimates/${estimate.id}/material-issue`, { ...issueBody, idempotency_key: key("issue-first") }, f.manager.session)).id, issue.id);
  await denied("POST", `${dispatch}/assignments`, { ...cutBody, idempotency_key: key("cut-before-confirm") }, f.manager.session);
  await must("POST", `/api/inventory/documents/${issue.id}/confirm`, { reason: "Issue approved cutting material" }, f.manager.session);
  await must("POST", `/api/inventory/documents/${issue.id}/confirm`, { reason: "Retry same posted issue" }, f.manager.session);
  await denied("POST", `/api/inventory/documents/${issue.id}/confirm`, { reason: "Confirmation replay also requires inventory_confirm" }, f.inventoryMaker.session, [403]);
  const replacementBody = { ...body, reason: "Replacement must not detach material already issued", idempotency_key: key("issued-estimate-replacement") };
  const replacement = await api("POST", estimateBase, replacementBody, f.cutter.session);
  if (replacement.ok) {
    await must("POST", `/api/cutting-estimates/${replacement.payload.id}/submit`, { idempotency_key: key("issued-replacement-submit") }, f.cutter.session);
    await denied("POST", `/api/cutting-estimates/${replacement.payload.id}/review`, { target_status: "APPROVED", reason: "Confirmed old issue must stay attached", idempotency_key: key("issued-replacement-approve") }, f.manager.session);
    await must("POST", `/api/cutting-estimates/${replacement.payload.id}/review`, { target_status: "REJECTED", reason: "Keep the material-backed original estimate", idempotency_key: key("issued-replacement-reject") }, f.manager.session);
  } else assert([400, 409, 422].includes(replacement.status));
  assert.equal((await sql("select status from local_cutting_estimates where id=$1", [estimate.id])).rows[0].status, "APPROVED", "Issued estimate was silently superseded.");
  const alternateMaterial = await must("POST", "/api/inventory/items", { code: `FLOW-REMAP-${token}`, name: "Synthetic alternate mapped fabric", item_type: "RAW_MATERIAL", base_unit: "METER" }, f.admin);
  await denied("POST", "/api/fabric-inventory-mappings", { fabric_variant_id: f.fabricId, inventory_item_id: alternateMaterial.id, reason: "Used mapping cannot silently change inventory truth" }, f.manager.session, [409]);
  assert.equal((await sql("select inventory_item_id from local_fabric_inventory_item_mappings where fabric_variant_id=$1", [f.fabricId])).rows[0].inventory_item_id, f.inventoryItem.id);
  const stock = async () => Number((await sql("select coalesce(sum(quantity_delta),0)::text qty from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2", [f.inventoryItem.id, f.warehouseId])).rows[0].qty);
  assert.equal(await stock(), 200);
  await denied("POST", `/api/cutting-estimates/${estimate.id}/material-issue`, { ...issueBody, lines: [{ estimate_line_id: estimate.lines[0].id, quantity: 1 }], idempotency_key: key("issue-over-plan") }, f.manager.session);
  const sourceMovement = (await sql("select id from local_inventory_movements where document_id=$1 and quantity_delta<0", [issue.id])).rows[0];
  const returnBody = { document_type: "RETURN_IN", warehouse_id: f.warehouseId, production_order_id: main.id, transaction_at: dates.first, description: "Return10 and confirm cutting gate accounts for net stock", idempotency_key: key("return-fabric"), lines: [{ inventory_item_id: f.inventoryItem.id, quantity: 10, unit: "METER", source_movement_id: sourceMovement.id }] };
  const returned = await must("POST", "/api/inventory/documents", returnBody, f.manager.session);
  await must("POST", `/api/inventory/documents/${returned.id}/confirm`, { reason: "Return unused fabric" }, f.manager.session);
  await must("POST", `/api/inventory/documents/${returned.id}/confirm`, { reason: "Retry return" }, f.manager.session);
  assert.equal(await stock(), 210);
  await denied("POST", `${dispatch}/assignments`, { ...cutBody, idempotency_key: key("cut-net-return-shortage") }, f.manager.session);
  const replenishment = await must("POST", `/api/cutting-estimates/${estimate.id}/material-issue`, { ...issueBody, lines: [{ estimate_line_id: estimate.lines[0].id, quantity: 10 }], idempotency_key: key("issue-replenish-return") }, f.manager.session);
  await must("POST", `/api/inventory/documents/${replenishment.id}/confirm`, { reason: "Replenish10 within approved net300" }, f.manager.session);
  assert.equal(await stock(), 200);
  return { estimate, issue, cutBody, sourceMovement };
}

async function shortageAndOwnership(f, otherOrder) {
  const route = `/api/production-orders/${otherOrder.id}/cutting-estimates`;
  const body = { production_batch_id: otherOrder.production_batch_id, idempotency_key: key("shortage-estimate"), lines: [{ order_item_id: otherOrder.order_item_id, fabric_variant_id: f.fabricId, inventory_item_id: f.inventoryItem.id, warehouse_id: f.warehouseId, output_quantity: Number(otherOrder.quantity_planned), calculation_method: "MANUAL_MEASURED", estimated_quantity: 1000, override_reason: "Synthetic measured shortage case" }] };
  const before = Number((await sql("select coalesce(sum(quantity_delta),0)::text qty from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2", [f.inventoryItem.id, f.warehouseId])).rows[0].qty);
  const estimate = await must("POST", route, body, f.cutter.session);
  await must("POST", `/api/cutting-estimates/${estimate.id}/submit`, { idempotency_key: key("shortage-submit") }, f.cutter.session);
  await must("POST", `/api/cutting-estimates/${estimate.id}/review`, { target_status: "APPROVED", reason: "Approved estimate is still limited by available stock", idempotency_key: key("shortage-approved") }, f.manager.session);
  const issueBody = { warehouse_id: f.warehouseId, idempotency_key: key("shortage-issue"), lines: [{ estimate_line_id: estimate.lines[0].id, quantity: 1000 }] };
  await denied("POST", `/api/cutting-estimates/${estimate.id}/material-issue`, issueBody, f.sewer.session, [403]);
  const doc = await must("POST", `/api/cutting-estimates/${estimate.id}/material-issue`, issueBody, f.manager.session);
  await denied("POST", `/api/inventory/documents/${doc.id}/confirm`, { reason: "Must reject insufficient stock" }, f.manager.session);
  assert.equal(Number((await sql("select coalesce(sum(quantity_delta),0)::text qty from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2", [f.inventoryItem.id, f.warehouseId])).rows[0].qty), before, "Insufficient issue partially posted stock.");
  assert.equal((await sql("select status from local_inventory_documents where id=$1", [doc.id])).rows[0].status, "DRAFT");
  await must("POST", `/api/inventory/documents/${doc.id}/void`, { reason: "Discard synthetic shortage issue" }, f.manager.session);
}

async function runWorkflow(f) {
  await verifyManufacturingMigrationGuard(f);
  const handoff = await salesHandoff(f);
  await verifyInitialAdjustmentGuard(f, handoff);
  await verifySyncSourceGuard(f, handoff);
  const materials = await cuttingEstimate(f, handoff.main);
  await verifyMappedLegacyBoundary(f, handoff);
  await shortageAndOwnership(f, handoff.others[0]);
  await productionAndEarnings(f, handoff, materials);
  const standardsOrders = await verifyMaterialStandards(f);
  const qaOrders = await createQaWorkflow(f);
  await checkpoint([handoff.main.id, ...handoff.others.map((row) => row.id), ...standardsOrders, ...qaOrders]);
}

async function verifyManufacturingMigrationGuard(f) {
  const names = ["043_000_protect_existing_manufacturing.sql", "043_local_cutting_remake_supplements.sql", "044_local_cutting_promotion_guard_cleanup.sql"];
  assert.deepEqual([...names].sort(), names, "Manufacturing promotion guard must sort before unchanged043 and cleanup044.");
  const scripts = await Promise.all(names.map((name) => readFile(new URL(`../server/db/migrations/${name}`, import.meta.url), "utf8")));
  const createdIds = [];
  await ownedRollback(async (client) => {
    const seedTypedTree = async (label) => {
      const tree = Object.fromEntries(["product", "profile", "bom", "bomVersion", "bomLine", "cutting", "cuttingVersion", "routing", "routingVersion", "routingOperation"].map((name) => [name, randomUUID()]));
      createdIds.push(...Object.values(tree));
      await client.query("insert into local_manufacturing_profiles(id,product_id,finished_width,finished_length) values($1,$2,100,200)", [tree.profile, tree.product]);
      await client.query("insert into local_bom_headers(id,product_id,code,name) values($1,$2,$3,'Owned historical BOM')", [tree.bom, tree.product, `MIGRATION-BOM-${label}-${token}`]);
      await client.query("insert into local_bom_versions(id,bom_id,version_number,status,effective_from) values($1,$2,1,'APPROVED',$3)", [tree.bomVersion, tree.bom, dates.start]);
      await client.query("insert into local_bom_lines(id,bom_version_id,inventory_item_id,quantity_method,standard_quantity,unit) values($1,$2,$3,'PER_UNIT',31,'METER')", [tree.bomLine, tree.bomVersion, f.inventoryItem.id]);
      await client.query("insert into local_cutting_profiles(id,product_id,code,name) values($1,$2,$3,'Owned historical cutting')", [tree.cutting, tree.product, `MIGRATION-CUT-${label}-${token}`]);
      await client.query("insert into local_cutting_versions(id,cutting_profile_id,version_number,status,effective_from,piece_width_parameter_cm,piece_length_parameter_cm,default_fabric_width_cm) values($1,$2,1,'APPROVED',$3,100,200,140)", [tree.cuttingVersion, tree.cutting, dates.start]);
      await client.query("insert into local_routing_headers(id,product_id,code,name) values($1,$2,$3,'Owned historical routing')", [tree.routing, tree.product, `MIGRATION-ROUTE-${label}-${token}`]);
      await client.query("insert into local_routing_versions(id,routing_id,version_number,status,effective_from) values($1,$2,1,'APPROVED',$3)", [tree.routingVersion, tree.routing, dates.start]);
      await client.query("insert into local_routing_operations(id,routing_version_id,operation_code,operation_name,sequence,standard_minutes_per_unit) values($1,$2,'SEWING','Owned typed historical operation',1,31)", [tree.routingOperation, tree.routingVersion]);
      tree.recordIds = Object.entries(tree).filter(([name]) => name !== "product").map(([, id]) => id);
      return tree;
    };
    const contested = await seedTypedTree("contested"), uncontested = await seedTypedTree("uncontested");
    const genericLine = randomUUID(), genericOperation = randomUUID(); createdIds.push(genericLine, genericOperation);
    const genericRows = [
      [contested.profile, "manufacturing_profile", contested.product, null, null, "ACTIVE", { finished_width: 40, finished_length: 60, dimension_unit: "CM" }],
      [contested.bom, "bom_header", contested.product, null, null, "ACTIVE", { code: `MIGRATION-BOM-contested-${token}`, name: "Existing UI BOM" }],
      [contested.bomVersion, "bom_version", null, contested.bom, 1, "APPROVED", { bom_id: contested.bom, effective_from: dates.start, version_number: 1 }],
      [genericLine, "bom_line", null, contested.bomVersion, null, "DRAFT", { bom_version_id: contested.bomVersion, inventory_item_id: f.inventoryItem.id, quantity_method: "PER_UNIT", standard_quantity: 7, unit: "METER" }],
      [contested.cutting, "cutting_profile", contested.product, null, null, "ACTIVE", { code: `MIGRATION-CUT-contested-${token}`, name: "Existing UI cutting" }],
      [contested.cuttingVersion, "cutting_version", null, contested.cutting, 1, "APPROVED", { cutting_profile_id: contested.cutting, version_number: 1, piece_width_parameter_cm: 40, piece_length_parameter_cm: 60 }],
      [contested.routing, "routing_header", contested.product, null, null, "ACTIVE", { code: `MIGRATION-ROUTE-contested-${token}`, name: "Existing UI routing" }],
      [contested.routingVersion, "routing_version", null, contested.routing, 1, "APPROVED", { routing_id: contested.routing, version_number: 1, effective_from: dates.start }],
      [genericOperation, "routing_operation", null, contested.routingVersion, null, "DRAFT", { routing_version_id: contested.routingVersion, sequence: 1, operation_code: "SEWING", operation_name: "Existing UI operation", standard_minutes_per_unit: 7 }],
    ];
    for (const [id, type, product, parent, version, status, payload] of genericRows) await client.query("insert into local_manufacturing_records(id,record_type,product_id,parent_id,version_number,status,payload,local_modified_at) values($1,$2,$3,$4,$5,$6,$7::jsonb,now())", [id, type, product, parent, version, status, JSON.stringify({ ...payload, id })]);
    const extraBom = randomUUID(), extraCutting = randomUUID(), extraRouting = randomUUID(); createdIds.push(extraBom, extraCutting, extraRouting);
    await client.query("insert into local_bom_versions(id,bom_id,version_number,status) values($1,$2,2,'DRAFT')", [extraBom, contested.bom]);
    await client.query("insert into local_cutting_versions(id,cutting_profile_id,version_number,status) values($1,$2,2,'DRAFT')", [extraCutting, contested.cutting]);
    await client.query("insert into local_routing_versions(id,routing_id,version_number,status) values($1,$2,2,'DRAFT')", [extraRouting, contested.routing]);
    const preservedIds = genericRows.map((row) => row[0]);
    const records = async (ids) => (await client.query("select to_jsonb(r) row from local_manufacturing_records r where id=any($1::text[]) order by id", [ids])).rows.map((row) => row.row);
    const original = await records(preservedIds), forbiddenIds = [contested.bomLine, contested.routingOperation, extraBom, extraCutting, extraRouting];
    await client.query("savepoint before_guard_matrix");
    await client.query(scripts[0]);
    await client.query(scripts[1]);
    assert.deepEqual(await records(preservedIds), original, "043 overwrote an existing generic tree.");
    assert.equal((await records(forbiddenIds)).length, 0, "043 mixed typed versions/lines/operations into an existing generic tree.");
    const promoted = await records(uncontested.recordIds);
    assert.equal(promoted.length, 9, "Uncontested typed tree was only partially promoted.");
    assert.deepEqual(promoted.map((row) => row.record_type).sort(), ["manufacturing_profile", "bom_header", "bom_version", "bom_line", "cutting_profile", "cutting_version", "routing_header", "routing_version", "routing_operation"].sort());
    assert.equal(Number(promoted.find((row) => row.record_type === "bom_line").payload.standard_quantity), 31);
    assert.equal(promoted.find((row) => row.record_type === "bom_line").parent_id, uncontested.bomVersion);
    assert.equal(promoted.find((row) => row.record_type === "routing_operation").parent_id, uncontested.routingVersion);
    assert.equal(promoted.find((row) => row.record_type === "cutting_version").parent_id, uncontested.cutting);
    await client.query("savepoint cleanup_prerequisite");
    await client.query("delete from local_schema_migrations where name=$1", [names[1]]);
    await assert.rejects(client.query(scripts[2]), /043|migration|phiên bản|áp dụng/i, "044 must refuse cleanup before043 is recorded.");
    await client.query("rollback to savepoint cleanup_prerequisite");
    await client.query(scripts[2]);
    const businessAfterCleanup = await records([...preservedIds, ...uncontested.recordIds]);
    assert.deepEqual(await records(preservedIds), original, "044 cleanup modified protected business rows.");
    assert.equal((await client.query("select to_regclass('public.local_043_existing_manufacturing_ids') marker,to_regprocedure('public.local_043_guard_typed_promotion()') guard")).rows[0].marker, null);
    assert.equal((await client.query("select count(*)::int count from pg_trigger where tgname='local_043_guard_typed_promotion' and not tgisinternal")).rows[0].count, 0);
    // An already-applied043 database needs guard-object cleanup only. It must
    // preserve every previously promoted or locally edited business record.
    await client.query(scripts[0]);
    await client.query(scripts[2]);
    assert.deepEqual(await records([...preservedIds, ...uncontested.recordIds]), businessAfterCleanup, "Already-applied043 cleanup changed business rows.");
    await client.query("rollback to savepoint before_guard_matrix");
    assert.deepEqual(await records(preservedIds), original, "Guard/migration rollback failed to restore existing generic data.");
    assert.equal((await records(uncontested.recordIds)).length, 0, "Migration rollback left partial promoted rows.");
  });
  assert.equal((await sql("select count(*)::int count from local_manufacturing_records where id=any($1::text[])", [createdIds])).rows[0].count, 0, "Owned rollback left migration fixtures behind.");
  console.log("PASS local manufacturing migration matrix: protected existing trees, complete uncontested promotion, rollback, cleanup prerequisite and already-applied cleanup.");
}

async function createQaWorkflow(f) {
  if (!process.env.LOCAL_DISPATCH_QA_MANIFEST) return [];
  const workDate = new Date().toISOString().slice(0, 10);
  const order = await must("POST", "/api/orders", { order_number: `QA-SALES-${token}`, manager_id: f.sale.user.user_id, status: "processing", items: [{ id: `qa-line-${token}`, originalProductId: f.product.id, quantity: 30, color: "Blue", size: "M", dimensions: "40 × 60" }, { id: `qa-second-line-${token}`, originalProductId: f.product.id, quantity: 10, color: "Red", size: "L", dimensions: "50 × 70" }] }, f.manager.session);
  const source = list(await must("GET", "/api/production/source-orders", undefined, f.sale.session)).find((row) => row.id === order.id);
  const request = await must("POST", sales, { order_id: order.id, idempotency_key: key("qa-sale-submit"), lines: [{ source_line_key: source.items[0].source_line_key, quantity: 20 }, { source_line_key: source.items[1].source_line_key, quantity: 10 }] }, f.sale.session);
  await must("POST", `${sales}/${request.id}/review`, { target_status: "ACCEPTED", reason: "Fresh disposable role UI fixture", idempotency_key: key("qa-sale-accepted") }, f.manager.session);
  const productions = (await must("POST", `${sales}/${request.id}/allocate`, { planned_start_date: workDate, idempotency_key: key("qa-sale-wave"), lines: [{ request_line_id: request.lines[0].id, quantity: 15, fabric_variant_id: f.fabricId }, { request_line_id: request.lines[1].id, quantity: 5, fabric_variant_id: f.fabricId }] }, f.manager.session)).orders;
  const production = productions[0], shortageProduction = productions[1];
  await must("POST", `/api/production-orders/${production.id}/release`, { idempotency_key: key("qa-production-release") }, f.manager.session);
  const estimate = await must("POST", `/api/production-orders/${production.id}/cutting-estimates`, { production_batch_id: production.production_batch_id, idempotency_key: key("qa-estimate"), lines: [{ order_item_id: production.order_item_id, fabric_variant_id: f.fabricId, inventory_item_id: f.inventoryItem.id, warehouse_id: f.warehouseId, output_quantity: 15, calculation_method: "BOM_PER_UNIT" }] }, f.cutter.session);
  await must("POST", `/api/cutting-estimates/${estimate.id}/submit`, { idempotency_key: key("qa-estimate-submit") }, f.cutter.session);
  await must("POST", `/api/cutting-estimates/${estimate.id}/review`, { target_status: "APPROVED", reason: "Role UI fixture material standard", idempotency_key: key("qa-estimate-approved") }, f.manager.session);
  const issued = await must("POST", `/api/cutting-estimates/${estimate.id}/material-issue`, { warehouse_id: f.warehouseId, transaction_at: workDate, idempotency_key: key("qa-material"), lines: [{ estimate_line_id: estimate.lines[0].id, quantity: 45 }] }, f.manager.session);
  await must("POST", `/api/inventory/documents/${issued.id}/confirm`, { reason: "Real isolated ledger material for role UI QA" }, f.manager.session);
  const publication = (stage, quantity, label) => must("POST", `${dispatch}/publications`, { production_order_id: production.id, production_batch_id: production.production_batch_id, order_item_id: production.order_item_id, stage, quantity, eligible_worker_type: stage === "CUTTING" ? "CUTTER" : "SEWING", eligible_supervisor_worker_id: f.manager.worker.id, piece_rate_code: stage === "SEWING" ? f.pieceCode : undefined, assigned_from: workDate, notes: "Fresh synthetic open job for role UI verification", idempotency_key: key(label) }, f.manager.session);
  const cut = await publication("CUTTING", 15, "qa-open-cut");
  const cutAssignment = await must("POST", `${dispatch}/publications/${cut.id}/claim`, { quantity: 10, idempotency_key: key("qa-cut-claim10") }, f.cutter.session);
  const cutReport = await report(f.cutter.session, cutAssignment.id, 5, "qa-cut5", { work_date: workDate });
  await review(f.manager.session, cutReport.id, "APPROVED", "qa-cut5-approved");
  const remakeSource = await report(f.cutter.session, cutAssignment.id, 0, "qa-remake-source", { work_date: workDate, quantity_remake: 1 });
  await review(f.manager.session, remakeSource.id, "APPROVED", "qa-remake-source-approved");
  const sew = await publication("SEWING", 5, "qa-open-sew");
  const sewingAssignments = [];
  for (const label of ["qa-sew-first", "qa-sew-second"]) sewingAssignments.push(await must("POST", `${dispatch}/publications/${sew.id}/claim`, { quantity: 2, idempotency_key: key(label) }, f.sewer.session));
  const pending = await report(f.sewer.session, sewingAssignments[0].id, 1, "qa-sewing-pending", { work_date: workDate });
  await must("POST", `/api/production-orders/${shortageProduction.id}/release`, { idempotency_key: key("qa-shortage-release") }, f.manager.session);
  const shortageEstimate = await must("POST", `/api/production-orders/${shortageProduction.id}/cutting-estimates`, { production_batch_id: shortageProduction.production_batch_id, idempotency_key: key("qa-shortage-estimate"), lines: [{ order_item_id: shortageProduction.order_item_id, fabric_variant_id: f.fabricId, inventory_item_id: f.inventoryItem.id, warehouse_id: f.warehouseId, output_quantity: 5, calculation_method: "BOM_PER_UNIT" }] }, f.cutter.session);
  await must("POST", `/api/cutting-estimates/${shortageEstimate.id}/submit`, { idempotency_key: key("qa-shortage-submit") }, f.cutter.session);
  await must("POST", `/api/cutting-estimates/${shortageEstimate.id}/review`, { target_status: "APPROVED", reason: "QA partial material coverage", idempotency_key: key("qa-shortage-approved") }, f.manager.session);
  const partialIssue = await must("POST", `/api/cutting-estimates/${shortageEstimate.id}/material-issue`, { warehouse_id: f.warehouseId, transaction_at: workDate, idempotency_key: key("qa-shortage-partial"), lines: [{ estimate_line_id: shortageEstimate.lines[0].id, quantity: 3 }] }, f.manager.session);
  await must("POST", `/api/inventory/documents/${partialIssue.id}/confirm`, { reason: "QA only3 of15 meters issued" }, f.manager.session);
  const secondWarehouseId = randomUUID();
  await sql("insert into local_inventory_warehouses(id,code,name) values($1,$2,'QA secondary warehouse')", [secondWarehouseId, `QA-WH2-${token}`]);
  const secondaryOpening = await must("POST", "/api/inventory/documents", { document_type: "OPENING_BALANCE", warehouse_id: secondWarehouseId, transaction_at: workDate, idempotency_key: key("qa-secondary-opening"), lines: [{ inventory_item_id: f.inventoryItem.id, quantity: 50, unit: "METER", input_unit_cost: 42000 }] }, f.manager.session);
  await must("POST", `/api/inventory/documents/${secondaryOpening.id}/confirm`, { reason: "QA second warehouse available stock" }, f.manager.session);
  await qaMetadata(f, { today: workDate, orderId: order.id, salesRequestId: request.id, salesRequestLineIds: request.lines.map((row) => row.id), productionOrderId: production.id, batchId: production.production_batch_id, estimateId: estimate.id, cuttingPublicationId: cut.id, cuttingAssignmentId: cutAssignment.id, sewingPublicationId: sew.id, sewingAssignmentIds: sewingAssignments.map((row) => row.id), pendingSewingReportId: pending.id, remakeSourceReportId: remakeSource.id, remakeAllowance: 1, pieceRateCode: f.pieceCode, unrequestedSaleQuantity: 10, acceptedUnallocatedQuantities: [5, 5], openCuttingQuantity: 5, openSewingQuantity: 1, remainingCuttingAssignmentQuantity: 4, remainingSewingAssignmentQuantities: [1, 2], shortageProductionOrderId: shortageProduction.id, shortageBatchId: shortageProduction.production_batch_id, shortageEstimateId: shortageEstimate.id, shortageQuantityMeters: 12, warehouseIds: [f.warehouseId, secondWarehouseId] });
  return productions.map((row) => row.id);
}

async function verifyMappedLegacyBoundary(f, handoff) {
  const before = (await sql("select current_stock::text quantity from local_fabric_inventory where fabric_variant_id=$1 and warehouse_id=$2", [f.fabricId, f.legacyWarehouseId])).rows[0].quantity;
  const unmappedId = randomUUID();
  await sql("insert into local_fabric_variants(id,variant_name,unit,is_snapshot_record) values($1,'Isolated unmapped legacy fabric','m',false)", [unmappedId]);
  await must("POST", "/api/fabrics/inventory", { fabric_variant_id: unmappedId, warehouse_id: f.legacyWarehouseId, current_stock: 5 }, f.manager.session);
  await denied("POST", "/api/fabrics/inventory", { fabric_variant_id: f.fabricId, warehouse_id: f.legacyWarehouseId, current_stock: 10000 }, f.manager.session, [409]);
  await denied("POST", "/api/fabrics/transactions", { fabric_variant_id: f.fabricId, warehouse_id: f.legacyWarehouseId, transaction_type: "inbound", quantity: 1 }, f.manager.session, [409]);
  const usage = { order_id: handoff.order.id, order_number: handoff.order.order_number, warehouse_id: f.legacyWarehouseId, items: [{ fabric_variant_id: unmappedId, quantity_used: 1 }, { fabric_variant_id: f.fabricId, quantity_used: 1 }] };
  await denied("POST", "/api/fabrics/usage/batch", usage, f.manager.session, [409]);
  assert.equal(Number((await sql("select current_stock::text quantity from local_fabric_inventory where fabric_variant_id=$1 and warehouse_id=$2", [unmappedId, f.legacyWarehouseId])).rows[0].quantity), 5, "Mapped second usage line partially deducted the unmapped first line.");
  await must("POST", "/api/fabrics/usage/batch", { ...usage, items: [usage.items[0]] }, f.manager.session);
  assert.equal(Number((await sql("select current_stock::text quantity from local_fabric_inventory where fabric_variant_id=$1 and warehouse_id=$2", [unmappedId, f.legacyWarehouseId])).rows[0].quantity), 4, "Unmapped legacy usage lost its existing behavior.");
  const historicalUsage = randomUUID(), historicalTransaction = randomUUID(), historicalTransfer = randomUUID(), legacyTargetId = randomUUID();
  await sql("insert into local_warehouses(id,name,is_snapshot_record) values($1,'Isolated legacy transfer target',false)", [legacyTargetId]);
  await sql("insert into local_fabric_usage(id,order_id,order_number,fabric_variant_id,warehouse_id,quantity_used,unit,is_snapshot_record) values($1,$2,$3,$4,$5,1,'m',false)", [historicalUsage, handoff.order.id, handoff.order.order_number, f.fabricId, f.legacyWarehouseId]);
  await sql("insert into local_fabric_transactions(id,fabric_variant_id,warehouse_id,transaction_type,quantity,fabric_usage_id,is_snapshot_record) values($1,$2,$3,'outbound',-1,$4,false)", [historicalTransaction, f.fabricId, f.legacyWarehouseId, historicalUsage]);
  await sql("insert into local_fabric_transfers(id,fabric_variant_id,from_warehouse_id,to_warehouse_id,quantity,status,is_snapshot_record) values($1,$2,$3,$4,1,'pending',false)", [historicalTransfer, f.fabricId, f.legacyWarehouseId, legacyTargetId]);
  await denied("PATCH", `/api/fabrics/usage/${historicalUsage}`, { fabric_variant_id: unmappedId, warehouse_id: f.legacyWarehouseId, quantity_used: 1 }, f.manager.session, [409]);
  await denied("DELETE", `/api/fabrics/usage/${historicalUsage}`, undefined, f.manager.session, [409]);
  await denied("PATCH", `/api/fabrics/transactions/${historicalTransaction}`, { notes: "Mapped historical transaction stays read-only" }, f.manager.session, [409]);
  await denied("POST", "/api/fabrics/transfers", { fabric_variant_id: f.fabricId, from_warehouse_id: f.legacyWarehouseId, to_warehouse_id: legacyTargetId, quantity: 1 }, f.manager.session, [409]);
  await denied("PATCH", `/api/fabrics/transfers/${historicalTransfer}/status`, { status: "completed" }, f.manager.session, [409]);
  await denied("POST", "/api/production/fabric-allocations", { production_order_id: handoff.main.id, production_batch_id: handoff.main.production_batch_id, fabric_variant_id: f.fabricId, warehouse_id: f.legacyWarehouseId, quantity: 1, idempotency_key: key("mapped-legacy-allocation") }, f.manager.session, [409]);
  assert.equal((await sql("select current_stock::text quantity from local_fabric_inventory where fabric_variant_id=$1 and warehouse_id=$2", [f.fabricId, f.legacyWarehouseId])).rows[0].quantity, before, "Mapped legacy route mutated quarantined stock.");
  assert.equal((await sql("select count(*)::int count from local_production_fabric_allocations where production_order_id=$1", [handoff.main.id])).rows[0].count, 0, "Mapped legacy allocation created a competing material truth.");
}

async function verifyMaterialStandards(f) {
  const orderIds = await verifyRoutingEffectivity(f);
  for (const [method, expected] of [["FIXED", 3], ["FORMULA", 6]]) {
    const product = await must("POST", "/api/catalog/products", { sku: `FLOW-${method}-${token}`, name: `Isolated ${method} fabric standard` }, f.admin);
    const line = { inventory_item_id: f.inventoryItem.id, line_type: "MATERIAL", quantity_method: method, standard_quantity: 3, unit: "METER", formula_type: method === "FORMULA" ? "PER_BATCH" : null, formula_parameters: method === "FORMULA" ? { batch_size: 6 } : {} };
    const standards = await manufacturing(product.id, f.manager.session, { lines: [line] });
    const group = await must("POST", "/api/production-orders/groups", { source_type: "MANUAL", idempotency_key: key(`standard-${method}`), lines: [{ product_id: product.id, quantity: 10, fabric_variant_id: f.fabricId }] }, f.manager.session);
    const order = group.orders[0]; orderIds.push(order.id);
    const release = await api("POST", `/api/production-orders/${order.id}/release`, { idempotency_key: key(`standard-release-${method}`) }, f.manager.session);
    if (method === "FORMULA" && !release.ok) {
      assert([400, 409, 422].includes(release.status) && /FORMULA|PER_BATCH|công thức|hỗ trợ/i.test(release.payload.message || ""), "Unsupported formula did not produce a clear refusal.");
      assert.equal((await sql("select status from local_production_orders where id=$1", [order.id])).rows[0].status, "DRAFT");
      assert.equal((await sql("select count(*)::int count from local_production_order_material_requirements where production_order_id=$1", [order.id])).rows[0].count, 0, "Unsupported formula partially released a material snapshot.");
    } else {
      assert(release.ok, `${method} release refused: ${release.payload.message}`);
      assert.equal(Number((await sql("select planned_quantity::text quantity from local_production_order_material_requirements where production_order_id=$1 and inventory_item_id=$2", [order.id, f.inventoryItem.id])).rows[0]?.quantity), expected, `${method} batch standard was incorrectly multiplied by output quantity.`);
      const preview = await must("POST", "/api/manufacturing/material-requirements/calculate", { product_id: product.id, bom_version_id: standards.bom.version.id, quantity: 10, effective_date: dates.first, warehouse_id: f.warehouseId }, f.manager.session);
      assert.equal(Number(preview.materials[0].standard_quantity), expected, `${method} real UI preview differs from released standard.`);
      const quote = await must("POST", `/api/production-orders/${order.id}/cutting-estimates`, { production_batch_id: order.production_batch_id, idempotency_key: key(`standard-estimate-${method}`), lines: [{ order_item_id: order.order_item_id, fabric_variant_id: f.fabricId, inventory_item_id: f.inventoryItem.id, warehouse_id: f.warehouseId, output_quantity: 10, calculation_method: "BOM_STANDARD" }] }, f.cutter.session);
      assert.equal(Number(quote.lines[0].estimated_quantity), expected);
    }
    await denied("POST", `/api/production-orders/${order.id}/cutting-estimates`, { production_batch_id: order.production_batch_id, idempotency_key: key(`invalid-perunit-${method}`), lines: [{ order_item_id: order.order_item_id, fabric_variant_id: f.fabricId, inventory_item_id: f.inventoryItem.id, warehouse_id: f.warehouseId, output_quantity: 10, calculation_method: "BOM_PER_UNIT", unit_per_output: 3 }] }, f.cutter.session);
  }

  const base = { piece_width_rule: "FIXED", piece_length_rule: "FIXED", piece_width_parameter_cm: 40, piece_length_parameter_cm: 60, pieces_per_product: 1, default_fabric_width_cm: 140, calculation_strategy: "GRID", issue_rounding_increment: 0.1, standard_waste_rate: 10, allow_rotation: false, pattern_direction: "NONE" };
  const scenarios = [
    { label: "across", quantity: 15, config: base, expected: { pieces_across: 3, rows: 5, selected_orientation: "NORMAL", final_issue_recommendation_m: 3.3 } },
    { label: "rotation", quantity: 10, config: { ...base, piece_width_parameter_cm: 60, piece_length_parameter_cm: 100, default_fabric_width_cm: 200, standard_waste_rate: 0, allow_rotation: true }, expected: { pieces_across: 2, rows: 5, selected_orientation: "ROTATED", final_issue_recommendation_m: 3 } },
    { label: "direction", quantity: 10, config: { ...base, piece_width_parameter_cm: 60, piece_length_parameter_cm: 100, default_fabric_width_cm: 200, standard_waste_rate: 0, allow_rotation: true, pattern_direction: "ONE_DIRECTION" }, expected: { pieces_across: 3, rows: 4, selected_orientation: "NORMAL", final_issue_recommendation_m: 4 } },
    { label: "pattern", quantity: 5, config: { ...base, piece_length_parameter_cm: 61, seam_allowance_cm: 1, hem_allowance_cm: 1, requires_matching_pattern: true, pattern_repeat_cm: 20 }, expected: { pieces_across: 3, rows: 2, final_issue_recommendation_m: 1.8 } },
    { label: "joining", quantity: 3, config: { ...base, piece_width_parameter_cm: 200, joining_allowed: true, joining_rule: "MULTI_PANEL_LENGTHWISE", standard_waste_rate: 0 }, expected: { joining_panels: 2, rows: 3, selected_orientation: "JOINED_LENGTHWISE", final_issue_recommendation_m: 3.6 } },
  ];
  for (const [index, scenario] of scenarios.entries()) {
    const product = await must("POST", "/api/catalog/products", { sku: `FLOW-GRID-${scenario.label}-${token}`, name: `Isolated grid ${scenario.label} standard` }, f.admin);
    const standards = await manufacturing(product.id, f.manager.session, { cutting: scenario.config, lines: [{ inventory_item_id: f.inventoryItem.id, line_type: "MATERIAL", quantity_method: "CUTTING_ENGINE", unit: "METER" }] });
    const profile = standards.cutting.profile, versionId = standards.cutting.version.id;
    const order = (await must("POST", "/api/production-orders/groups", { source_type: "MANUAL", idempotency_key: key(`grid-order-${scenario.label}`), lines: [{ product_id: product.id, quantity: scenario.quantity, fabric_variant_id: f.fabricId }] }, f.manager.session)).orders[0];
    orderIds.push(order.id);
    let futureVersionId;
    if (index === 0) {
      // A deliberately historical future version must not beat the effective
      // approved version when resolving the profile HEADER stored by the UI.
      futureVersionId = randomUUID();
      await sql("insert into local_manufacturing_records(id,record_type,parent_id,version_number,status,payload) values($1,'cutting_version',$2,99,'APPROVED',$3::jsonb)", [futureVersionId, profile.id, JSON.stringify({ ...scenario.config, id: futureVersionId, cutting_profile_id: profile.id, version_number: 99, status: "APPROVED", effective_from: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10), piece_width_parameter_cm: 100, piece_length_parameter_cm: 200 })]);
    }
    const direct = await must("POST", `/api/manufacturing/cutting-versions/${versionId}/calculate`, { quantity: scenario.quantity }, f.manager.session);
    for (const [field, expected] of Object.entries(scenario.expected)) assert.equal(direct[field], expected, `Direct GRID ${scenario.label} ${field} deviated from the approved original strategy.`);
    const preview = await must("POST", "/api/manufacturing/material-requirements/calculate", { product_id: product.id, bom_version_id: standards.bom.version.id, quantity: scenario.quantity, effective_date: dates.first, warehouse_id: f.warehouseId }, f.manager.session);
    assert.equal(Number(preview.materials[0].standard_quantity), scenario.expected.final_issue_recommendation_m, `Real UI ${scenario.label} preview diverged from geometry.`);
    assert.equal(preview.materials[0].cutting_profile_version_id, versionId, "UI preview returned a profile header in a version field.");
    await must("POST", `/api/production-orders/${order.id}/release`, { idempotency_key: key(`grid-release-${scenario.label}`) }, f.manager.session);
    const released = (await sql("select planned_quantity::text quantity,cutting_profile_version_id,calculation_details from local_production_order_material_requirements where production_order_id=$1", [order.id])).rows[0];
    assert.equal(Number(released.quantity), scenario.expected.final_issue_recommendation_m);
    assert.equal(released.cutting_profile_version_id, versionId);
    const estimate = await must("POST", `/api/production-orders/${order.id}/cutting-estimates`, { production_batch_id: order.production_batch_id, idempotency_key: key(`grid-estimate-${scenario.label}`), lines: [{ order_item_id: order.order_item_id, fabric_variant_id: f.fabricId, inventory_item_id: f.inventoryItem.id, warehouse_id: f.warehouseId, output_quantity: scenario.quantity, calculation_method: "CUTTING_ENGINE", cutting_version_id: versionId }] }, f.cutter.session);
    assert.equal(Number(estimate.lines[0].estimated_quantity), scenario.expected.final_issue_recommendation_m);
    for (const [field, expected] of Object.entries(scenario.expected)) assert.equal(estimate.lines[0].calculation_snapshot[field], expected, `Estimate GRID ${scenario.label} diverged from the direct calculator.`);
    if (index === 0) {
      const nonMeter = await must("POST", "/api/inventory/items", { code: `FLOW-NONMETER-${token}`, name: "Synthetic non-meter material", item_type: "RAW_MATERIAL", base_unit: "PIECE" }, f.admin);
      const unitOrder = (await must("POST", "/api/production-orders/groups", { source_type: "MANUAL", idempotency_key: key("grid-unit-order"), lines: [{ product_id: product.id, quantity: 15 }] }, f.manager.session)).orders[0];
      orderIds.push(unitOrder.id);
      const wrongUnit = await denied("POST", `/api/production-orders/${unitOrder.id}/cutting-estimates`, { production_batch_id: unitOrder.production_batch_id, idempotency_key: key("grid-nonmeter"), lines: [{ order_item_id: unitOrder.order_item_id, inventory_item_id: nonMeter.id, warehouse_id: f.warehouseId, output_quantity: 15, calculation_method: "CUTTING_ENGINE", cutting_version_id: versionId }] }, f.cutter.session);
      assert(/METER|mét|đơn vị/i.test(wrongUnit.payload.message || ""), "Non-meter cutting estimate was refused for an unrelated reason.");
      await must("POST", `/api/cutting-estimates/${estimate.id}/submit`, { idempotency_key: key("grid-submit") }, f.cutter.session);
      await must("POST", `/api/cutting-estimates/${estimate.id}/review`, { target_status: "APPROVED", reason: "Verified multi-across cutting geometry", idempotency_key: key("grid-approve") }, f.manager.session);
      await denied("PUT", `/api/manufacturing/cutting-versions/${versionId}`, { configuration: { piece_width_parameter_cm: 100, piece_length_parameter_cm: 200 } }, f.manager.session, [403, 409]);
      const live = await must("POST", "/api/manufacturing/cutting-profiles/drafts", { product_id: product.id, clone_version_id: versionId, code: `GRID-LIVE-${token}`, name: "Changed live geometry", configuration: { ...scenario.config, effective_from: dates.start, piece_width_parameter_cm: 100, piece_length_parameter_cm: 200 } }, f.manager.session);
      await must("PUT", `/api/manufacturing/cutting-versions/${live.version.id}`, { configuration: { ...scenario.config, effective_from: dates.start, piece_width_parameter_cm: 100, piece_length_parameter_cm: 200 } }, f.manager.session);
      await must("POST", `/api/manufacturing/cutting-versions/${live.version.id}/approve`, { reason: "New live master after release" }, f.manager.session);
      const liveBom = await must("POST", "/api/manufacturing/bom/drafts", { product_id: product.id, clone_version_id: standards.bom.version.id, code: `GRID-LIVE-BOM-${token}`, name: "Changed live BOM" }, f.manager.session);
      await must("PUT", `/api/manufacturing/bom/versions/${liveBom.version.id}`, { effective_from: dates.start, lines: [{ inventory_item_id: f.inventoryItem.id, line_type: "MATERIAL", quantity_method: "CUTTING_ENGINE", unit: "METER", cutting_profile_id: live.profile.id }] }, f.manager.session);
      await must("POST", `/api/manufacturing/bom/versions/${liveBom.version.id}/approve`, { reason: "Live standards must not rewrite released requirements" }, f.manager.session);
      await must("PUT", `/api/manufacturing/products/${product.id}/profile`, { ...standards.profile, finished_width: 100, finished_length: 200 }, f.manager.session);
      const changedPreview = await must("POST", "/api/manufacturing/material-requirements/calculate", { product_id: product.id, bom_version_id: liveBom.version.id, quantity: 15, effective_date: dates.first, warehouse_id: f.warehouseId }, f.manager.session);
      assert.equal(Number(changedPreview.materials[0].standard_quantity), 33, "Live changed standard fixture did not actually change geometry.");
      const pinnedBody = { production_batch_id: order.production_batch_id, lines: [{ order_item_id: order.order_item_id, fabric_variant_id: f.fabricId, inventory_item_id: f.inventoryItem.id, warehouse_id: f.warehouseId, output_quantity: 15, calculation_method: "CUTTING_ENGINE", cutting_version_id: versionId }] };
      const pinned = await must("POST", `/api/production-orders/${order.id}/cutting-estimates`, { ...pinnedBody, idempotency_key: key("grid-pinned-new-estimate") }, f.cutter.session);
      assert.equal(Number(pinned.lines[0].estimated_quantity), 3.3, "New estimate re-read changed live dimensions instead of released snapshot.");
      assert.deepEqual((await sql("select planned_quantity::text quantity,cutting_profile_version_id,calculation_details from local_production_order_material_requirements where production_order_id=$1", [order.id])).rows[0], released, "Master edits changed the released material snapshot.");
      assert.equal(Number((await must("GET", `/api/production-orders/${order.id}/cutting-estimates`, undefined, f.manager.session)).find((row) => row.id === estimate.id).lines[0].estimated_quantity), 3.3, "Master edits changed the approved BASE estimate.");
      for (const [label, change] of [["future-version", { cutting_version_id: futureVersionId }], ["live-version", { cutting_version_id: live.version.id }], ["changed-width", { fabric_width_cm: 200 }]]) await denied("POST", `/api/production-orders/${order.id}/cutting-estimates`, { ...pinnedBody, idempotency_key: key(`grid-refuse-${label}`), lines: [{ ...pinnedBody.lines[0], ...change }] }, f.cutter.session);
      const gridIssueBody = (quantity, label) => ({ warehouse_id: f.warehouseId, transaction_at: dates.first, idempotency_key: key(label), lines: [{ estimate_line_id: estimate.lines[0].id, quantity }] });
      const shortIssue = await must("POST", `/api/cutting-estimates/${estimate.id}/material-issue`, gridIssueBody(0.3, "grid-linear-short-issue"), f.manager.session);
      await must("POST", `/api/inventory/documents/${shortIssue.id}/confirm`, { reason: "0.3m exceeds linear ratio but is below one whole cutting row" }, f.manager.session);
      const partialCut = { production_order_id: order.id, production_batch_id: order.production_batch_id, order_item_id: order.order_item_id, worker_id: f.cutter.worker.id, stage: "CUTTING", quantity: 1, assigned_from: dates.start, idempotency_key: key("grid-short-partial-cut") };
      await denied("POST", `${dispatch}/assignments`, partialCut, f.manager.session);
      const sufficient = await must("POST", `/api/cutting-estimates/${estimate.id}/material-issue`, gridIssueBody(0.4, "grid-whole-row-issue"), f.manager.session);
      await must("POST", `/api/inventory/documents/${sufficient.id}/confirm`, { reason: "One actual cutting row needs0.7m including waste and rounding" }, f.manager.session);
      const cutAssignment = unwrap(await must("POST", `${dispatch}/assignments`, { ...partialCut, idempotency_key: key("grid-covered-partial-cut") }, f.manager.session), "assignment");
      const movement = (await sql("select id from local_inventory_movements where document_id=$1 and quantity_delta<0", [sufficient.id])).rows[0];
      await assertReservedReturnRefused(f, order, movement, "grid-return-below-covered-row", 0.1);
      await verifyCuttingRemake(f, order, estimate, cutAssignment);
    }
  }
  return orderIds;
}

async function verifyRoutingEffectivity(f) {
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const product = await must("POST", "/api/catalog/products", { sku: `FLOW-ROUTING-${token}`, name: "Isolated routing effectivity" }, f.admin);
  const standards = await manufacturing(product.id, f.manager.session, { lines: [{ inventory_item_id: f.inventoryItem.id, line_type: "MATERIAL", quantity_method: "PER_UNIT", standard_quantity: 3, unit: "METER" }] });
  const reviseRouting = async (sourceId, effectiveFrom, minutes, label) => {
    const draft = await must("POST", "/api/manufacturing/routing/drafts", { product_id: product.id, clone_version_id: sourceId, code: `ROUTE-REV-${token}-${label}`, name: "Routing revision through actual UI API" }, f.manager.session);
    assert.equal(draft.header.id, standards.routing.header.id, "Routing clone created a competing header instead of a new version.");
    await must("PUT", `/api/manufacturing/routing/versions/${draft.version.id}`, { effective_from: effectiveFrom, operations: [{ sequence: 1, operation_code: "SEWING", operation_name: `Routing ${minutes} minutes`, standard_minutes_per_unit: minutes, is_optional: true }] }, f.manager.session);
    await must("POST", `/api/manufacturing/routing/versions/${draft.version.id}/approve`, { reason: "Isolated routing effectivity revision" }, f.manager.session);
    return draft;
  };
  const futureRouting = await reviseRouting(standards.routing.version.id, future, 7, "future");
  assert.equal(Number(futureRouting.version.version_number), 2);
  assert.equal((await must("GET", `/api/manufacturing/products/${product.id}/routing`, undefined, f.manager.session)).versions.find((row) => row.id === standards.routing.version.id).status, "SUPERSEDED");
  const createReleased = async (label) => {
    const order = (await must("POST", "/api/production-orders/groups", { source_type: "MANUAL", planned_start_date: today, idempotency_key: key(label), lines: [{ product_id: product.id, quantity: 10, fabric_variant_id: f.fabricId }] }, f.manager.session)).orders[0];
    await must("POST", `/api/production-orders/${order.id}/release`, { idempotency_key: key(`${label}-release`) }, f.manager.session);
    return order;
  };
  const released = await createReleased("routing-effective-current");
  const orderSnapshot = async (id) => (await sql("select routing_version_id,standard_minutes_total::text minutes from local_production_orders where id=$1", [id])).rows[0];
  const operations = async (id) => (await sql("select to_jsonb(o) row from local_production_order_operations o where production_order_id=$1 order by sequence,id", [id])).rows.map((row) => row.row);
  const originalOrder = await orderSnapshot(released.id), originalOperations = await operations(released.id);
  assert.equal(originalOrder.routing_version_id, standards.routing.version.id, "Future routing displaced currently effective superseded version.");
  assert.equal(Number(originalOrder.minutes), 10, "Future routing minutes entered today's released plan.");
  assert.equal(originalOperations.length, 1);
  assert.equal(Number(originalOperations[0].standard_run_minutes_per_unit), 1);
  assert.equal(Number(originalOperations[0].standard_total_minutes), 10);
  const currentRouting = await reviseRouting(futureRouting.version.id, today, 9, "new-current");
  assert.equal(Number(currentRouting.version.version_number), 3);
  assert.deepEqual(await orderSnapshot(released.id), originalOrder, "New approved routing rewrote released version or minutes.");
  assert.deepEqual(await operations(released.id), originalOperations, "New approved routing rewrote frozen operation rows.");
  const next = await createReleased("routing-new-current");
  assert.equal((await orderSnapshot(next.id)).routing_version_id, currentRouting.version.id);
  assert.equal(Number((await orderSnapshot(next.id)).minutes), 90);
  return [released.id, next.id];
}

async function verifyCuttingRemake(f, order, base, assignment) {
  const workDate = new Date().toISOString().slice(0, 10);
  await must("POST", assignmentPath(assignment.id, "accept"), { quantity: 1, idempotency_key: key("grid-cut-accept") }, f.cutter.session);
  const source = await report(f.cutter.session, assignment.id, 0, "grid-remake-source", { work_date: workDate, quantity_remake: 1 });
  await review(f.manager.session, source.id, "APPROVED", "grid-remake-source-approved");
  await verifyUnusedSupplementSourceReversal(f, order, base, assignment, workDate);
  const repairBody = (label, supplement) => ({ repair_kind: "REMAKE", quantity_good: 1, work_date: workDate, ...(supplement ? { cutting_estimate_id: supplement } : {}), idempotency_key: key(label) });
  await denied("POST", reportPath(source.id, "repair"), repairBody("grid-remake-no-supplement"), f.cutter.session, [409]);
  await denied("POST", reportPath(source.id, "repair"), repairBody("grid-remake-base-isnt-supplement", base.id), f.cutter.session, [409]);
  const supplementBody = (label) => ({ production_batch_id: order.production_batch_id, estimate_kind: "REMAKE", base_estimate_id: base.id, source_stage_event_id: source.id, remake_quantity: 1, idempotency_key: key(label) });
  await denied("POST", `/api/production-orders/${order.id}/cutting-estimates`, { ...supplementBody("grid-remake-wrong-source"), source_stage_event_id: randomUUID() }, f.cutter.session, [409]);
  await denied("POST", `/api/production-orders/${order.id}/cutting-estimates`, { ...supplementBody("grid-remake-excess-create"), remake_quantity: 2 }, f.cutter.session, [409]);
  const supplement = await must("POST", `/api/production-orders/${order.id}/cutting-estimates`, supplementBody("grid-remake-estimate"), f.cutter.session);
  assert.equal(Number(supplement.lines[0].estimated_quantity), 0.7, "Supplement re-read changed live master or used a linear share of full output.");
  assert.equal(supplement.lines[0].base_estimate_line_id, base.lines[0].id);
  assert.equal((await must("POST", `/api/production-orders/${order.id}/cutting-estimates`, supplementBody("grid-remake-estimate"), f.cutter.session)).id, supplement.id);
  await denied("POST", reportPath(source.id, "repair"), repairBody("grid-remake-draft-estimate", supplement.id), f.cutter.session, [409]);
  const excess = await must("POST", `/api/production-orders/${order.id}/cutting-estimates`, supplementBody("grid-remake-second-draft"), f.cutter.session);
  await must("POST", `/api/cutting-estimates/${supplement.id}/submit`, { idempotency_key: key("grid-remake-submit") }, f.cutter.session);
  await denied("POST", `/api/cutting-estimates/${excess.id}/submit`, { idempotency_key: key("grid-remake-excess-submit") }, f.cutter.session, [409]);
  assert.equal((await sql("select status from local_cutting_estimates where id=$1", [excess.id])).rows[0].status, "DRAFT", "Excess supplemental estimate partially submitted.");
  await denied("POST", `/api/cutting-estimates/${supplement.id}/review`, { target_status: "APPROVED", idempotency_key: key("grid-remake-self-review") }, f.cutter.session, [403]);
  await must("POST", `/api/cutting-estimates/${supplement.id}/review`, { target_status: "APPROVED", reason: "Supplement frozen whole-row material", idempotency_key: key("grid-remake-approve") }, f.manager.session);
  await denied("POST", reportPath(source.id, "repair"), repairBody("grid-remake-unissued-estimate", supplement.id), f.cutter.session, [409]);
  const issueBody = (quantity, label) => ({ warehouse_id: f.warehouseId, transaction_at: workDate, lines: [{ estimate_line_id: supplement.lines[0].id, quantity }], idempotency_key: key(label) });
  const partial = await must("POST", `/api/cutting-estimates/${supplement.id}/material-issue`, issueBody(0.3, "grid-remake-partial-issue"), f.manager.session);
  await denied("POST", reportPath(source.id, "repair"), repairBody("grid-remake-draft-issue", supplement.id), f.cutter.session, [409]);
  await must("POST", `/api/inventory/documents/${partial.id}/confirm`, { reason: "Partial supplemental fabric" }, f.manager.session);
  await denied("POST", reportPath(source.id, "repair"), repairBody("grid-remake-short-issued", supplement.id), f.cutter.session, [409]);
  const rest = await must("POST", `/api/cutting-estimates/${supplement.id}/material-issue`, issueBody(0.4, "grid-remake-rest-issue"), f.manager.session);
  await must("POST", `/api/inventory/documents/${rest.id}/confirm`, { reason: "Full0.7 supplemental row" }, f.manager.session);
  await denied("POST", reportPath(source.id, "reverse"), { reason: "Issued supplement retains original source", idempotency_key: key("grid-remake-issued-source-reverse") }, f.manager.session, [409]);
  const race = await Promise.all([api("POST", reportPath(source.id, "repair"), repairBody("grid-remake-race-a", supplement.id), f.cutter.session), api("POST", reportPath(source.id, "repair"), repairBody("grid-remake-race-b", supplement.id), f.cutter.session)]);
  assert.equal(race.filter((r) => r.ok).length, 1, "Concurrent remakes exceeded original or supplemental quantity.");
  assert(race.every((r) => r.ok || r.status === 409));
  const winner = race.find((r) => r.ok).payload, winnerIndex = race.findIndex((r) => r.ok);
  assert.equal((await must("POST", reportPath(source.id, "repair"), repairBody(winnerIndex === 0 ? "grid-remake-race-a" : "grid-remake-race-b", supplement.id), f.cutter.session)).id, winner.id);
  assert.equal(winner.is_payable, false);
  await review(f.manager.session, winner.id, "APPROVED", "grid-remake-report-approved");
  const movement = (await sql("select id from local_inventory_movements where document_id=$1 and quantity_delta<0", [rest.id])).rows[0];
  await assertReservedReturnRefused(f, order, movement, "grid-remake-reserved-return", 0.1);
  assert.equal((await sql("select production_entry_id from local_production_stage_events where id=$1", [winner.id])).rows[0].production_entry_id, null, "Cutting remake generated wages.");
}

async function verifyUnusedSupplementSourceReversal(f, order, base, originalAssignment, workDate) {
  const assignment = unwrap(await must("POST", `${dispatch}/assignments`, { production_order_id: order.id, production_batch_id: order.production_batch_id, order_item_id: order.order_item_id, worker_id: originalAssignment.worker_id, stage: "CUTTING", quantity: 1, assigned_from: dates.start, idempotency_key: key("unused-remake-cut-assignment") }, f.manager.session), "assignment");
  await must("POST", assignmentPath(assignment.id, "accept"), { quantity: 1, idempotency_key: key("unused-remake-cut-accept") }, f.cutter.session);
  const source = await report(f.cutter.session, assignment.id, 0, "unused-remake-source", { work_date: workDate, quantity_remake: 1 });
  await review(f.manager.session, source.id, "APPROVED", "unused-remake-source-approved");
  const estimate = await must("POST", `/api/production-orders/${order.id}/cutting-estimates`, { production_batch_id: order.production_batch_id, estimate_kind: "REMAKE", base_estimate_id: base.id, source_stage_event_id: source.id, remake_quantity: 1, idempotency_key: key("unused-remake-estimate") }, f.cutter.session);
  await must("POST", `/api/cutting-estimates/${estimate.id}/submit`, { idempotency_key: key("unused-remake-submit") }, f.cutter.session);
  await must("POST", `/api/cutting-estimates/${estimate.id}/review`, { target_status: "APPROVED", reason: "Unused supplement source lifecycle", idempotency_key: key("unused-remake-approved") }, f.manager.session);
  const issueBody = { warehouse_id: f.warehouseId, transaction_at: workDate, lines: [{ estimate_line_id: estimate.lines[0].id, quantity: 0.7 }], idempotency_key: key("unused-remake-draft-issue") };
  const draft = await must("POST", `/api/cutting-estimates/${estimate.id}/material-issue`, issueBody, f.manager.session);
  await must("POST", reportPath(source.id, "reverse"), { reason: "Unused supplemental source may be reversed before posting fabric", idempotency_key: key("unused-remake-source-reverse") }, f.manager.session);
  await denied("POST", `/api/cutting-estimates/${estimate.id}/material-issue`, { ...issueBody, idempotency_key: key("reversed-source-new-issue") }, f.manager.session, [409]);
  await denied("POST", `/api/inventory/documents/${draft.id}/confirm`, { reason: "Draft issue must re-check reversed supplemental source" }, f.manager.session, [409]);
  assert.equal((await sql("select status from local_inventory_documents where id=$1", [draft.id])).rows[0].status, "DRAFT");
  assert.equal((await sql("select count(*)::int count from local_inventory_movements where document_id=$1", [draft.id])).rows[0].count, 0, "Reversed-source confirmation partially posted inventory.");
  await must("POST", `/api/inventory/documents/${draft.id}/void`, { reason: "Discard refused owned issue draft" }, f.manager.session);
}

async function productionAndEarnings(f, handoff, materials) {
  const main = handoff.main;
  const publicationBody = (stage, quantity, label) => ({ production_order_id: main.id, production_batch_id: main.production_batch_id, order_item_id: main.order_item_id, stage, quantity, eligible_worker_type: stage === "CUTTING" ? "CUTTER" : "SEWING", eligible_supervisor_worker_id: f.manager.worker.id, assigned_from: dates.start, piece_rate_code: stage === "SEWING" ? f.pieceCode : undefined, notes: "Eligible team only", idempotency_key: key(label) });
  const publish = async (stage, quantity, label) => unwrap(await must("POST", `${dispatch}/publications`, publicationBody(stage, quantity, label), f.manager.session), "publication");
  const claim = async (publication, actor, quantity, label) => unwrap(await must("POST", `${dispatch}/publications/${publication.id}/claim`, { quantity, idempotency_key: key(label) }, actor.session), "assignment");
  const blockedComplete = async (label) => denied("POST", `/api/production-orders/${main.id}/complete`, { quantity_good: 100, idempotency_key: key(label) }, f.manager.session);
  const earnings = (actor, extra = "") => must("GET", `/api/my-attendance/earnings?month=${dates.first.slice(0, 7)}${extra}`, undefined, actor.session);
  await denied("POST", `${dispatch}/publications`, publicationBody("CUTTING", 100, "employee-publish"), f.cutter.session, [403]);
  const cancelledOffer = await publish("CUTTING", 100, "temporary-publication");
  await blockedComplete("close-open-unclaimed");
  await denied("POST", `${dispatch}/publications/${cancelledOffer.id}/close`, { status: "CANCELLED", reason: "Employee cannot close offers", idempotency_key: key("employee-close-publication") }, f.cutter.session, [403]);
  await denied("POST", `${dispatch}/publications/${cancelledOffer.id}/close`, { status: "CANCELLED", idempotency_key: key("cancel-publication-no-reason") }, f.manager.session);
  const cancellation = { status: "CANCELLED", reason: "Replace with tested offer", idempotency_key: key("cancel-publication") };
  await must("POST", `${dispatch}/publications/${cancelledOffer.id}/close`, cancellation, f.manager.session);
  await must("POST", `${dispatch}/publications/${cancelledOffer.id}/close`, cancellation, f.manager.session);
  await denied("POST", `${dispatch}/publications/${cancelledOffer.id}/claim`, { quantity: 1, idempotency_key: key("claim-cancelled") }, f.cutter.session);
  const cutting = await publish("CUTTING", 100, "open-cutting");
  await denied("POST", `${dispatch}/assignments`, { production_order_id: main.id, production_batch_id: main.production_batch_id, order_item_id: main.order_item_id, worker_id: f.cutter.worker.id, stage: "CUTTING", quantity: 1, assigned_from: dates.start, idempotency_key: key("direct-cut-takes-offer-capacity") }, f.manager.session);
  assert.equal((await must("POST", `${dispatch}/publications`, publicationBody("CUTTING", 100, "open-cutting"), f.manager.session)).id, cutting.id);
  await denied("POST", `${dispatch}/publications/${cutting.id}/claim`, { quantity: 1, idempotency_key: key("sewer-claims-cut") }, f.sewer.session);
  const cutAssignment = await claim(cutting, f.cutter, 100, "claim-cutting");
  assert.equal((await must("POST", `${dispatch}/publications/${cutting.id}/claim`, { quantity: 100, idempotency_key: key("claim-cutting") }, f.cutter.session)).id, cutAssignment.id);
  await assertReservedReturnRefused(f, main, materials.sourceMovement, "return-after-cut-claim");
  const adjustment = { reason: "Sale requests a production plan correction", idempotency_key: key("sale-adjustment-hold") };
  await must("POST", `${sales}/${handoff.request.id}/change-request`, adjustment, f.sale.session);
  await denied("POST", `/api/production-orders/${main.id}/release`, { reason: "Cannot bypass pending Sale adjustment", idempotency_key: key("adjustment-release-bypass") }, f.manager.session);
  await denied("POST", `/api/production-orders/${main.id}/transition`, { target_status: "IN_PROGRESS", reason: "Cannot bypass adjustment approval" }, f.manager.session);
  await denied("POST", `${dispatch}/publications/${cutting.id}/claim`, { quantity: 1, idempotency_key: key("adjustment-claim-bypass") }, f.cutter.session);
  assert.equal((await sql("select status from local_production_orders where id=$1", [main.id])).rows[0].status, "ON_HOLD", "Adjustment bypass partially resumed the order.");
  await must("POST", `${sales}/${handoff.request.id}/review`, { target_status: "ACCEPTED", reason: "Production manager approves unchanged plan", idempotency_key: key("sale-adjustment-approved") }, f.manager.session);
  await denied("POST", `${dispatch}/publications`, publicationBody("SEWING", 1, "sew-before-cut"), f.manager.session);
  const cutFirst = await report(f.cutter.session, cutAssignment.id, 60, "cut-first60");
  await denied("POST", `${dispatch}/publications`, publicationBody("SEWING", 1, "sew-before-cut-review"), f.manager.session);
  await blockedComplete("close-pending-cut");
  await review(f.manager.session, cutFirst.id, "APPROVED", "cut60-approved");
  const firstSewing = await publish("SEWING", 60, "open-sewing60");
  await denied("POST", reportPath(cutFirst.id, "reverse"), { reason: "Open unclaimed sewing offer still reserves these cut pieces", idempotency_key: key("reverse-cut-with-open-sewing") }, f.manager.session, [400, 409, 422]);
  assert.equal((await sql("select status from local_production_stage_events where id=$1", [cutFirst.id])).rows[0].status, "APPROVED", "Failed reversal invalidated cutting under an open sewing offer.");
  await denied("POST", `${dispatch}/assignments`, { production_order_id: main.id, production_batch_id: main.production_batch_id, order_item_id: main.order_item_id, worker_id: f.sewer.worker.id, stage: "SEWING", quantity: 1, assigned_from: dates.start, piece_rate_code: f.pieceCode, idempotency_key: key("direct-sew-takes-offer-capacity") }, f.manager.session);
  await denied("POST", `${dispatch}/publications`, publicationBody("SEWING", 1, "sew-over-reserved-open"), f.manager.session);
  const openA = list(await must("GET", `${dispatch}/publications?mine=1`, undefined, f.sewer.session));
  const openOutsider = list(await must("GET", `${dispatch}/publications?mine=1`, undefined, f.outsider.session));
  assert(openA.some((row) => row.id === firstSewing.id), "Eligible sewer cannot discover open work.");
  assert(!openOutsider.some((row) => row.id === firstSewing.id), "Open job leaked outside its eligible team.");
  await denied("POST", `${dispatch}/publications/${firstSewing.id}/claim`, { quantity: 1, idempotency_key: key("outsider-claim") }, f.outsider.session, [403]);
  await denied("POST", `${dispatch}/publications/${firstSewing.id}/claim`, { quantity: 1, idempotency_key: key("cutter-claims-sew") }, f.cutter.session);
  const claimRace = await Promise.all([api("POST", `${dispatch}/publications/${firstSewing.id}/claim`, { quantity: 60, idempotency_key: key("claim-sew-a") }, f.sewer.session), api("POST", `${dispatch}/publications/${firstSewing.id}/claim`, { quantity: 60, idempotency_key: key("claim-sew-b") }, f.sewerB.session)]);
  assert.equal(claimRace.filter((result) => result.ok).length, 1, "Concurrent self claims over-allocated one cutting quantity.");
  assert(claimRace.every((result) => result.ok || [400, 409, 422].includes(result.status)));
  const winnerIndex = claimRace.findIndex((result) => result.ok);
  const winner = winnerIndex === 0 ? f.sewer : f.sewerB;
  const other = winnerIndex === 0 ? f.sewerB : f.sewer;
  const sewing60 = unwrap(claimRace[winnerIndex].payload, "assignment");
  assert.equal(Number(sewing60.accepted_quantity), 60);
  const cutLast = await report(f.cutter.session, cutAssignment.id, 40, "cut-last40");
  await review(f.manager.session, cutLast.id, "APPROVED", "cut40-approved");
  const secondSewing = await publish("SEWING", 40, "open-sewing40");
  const sewing40 = await claim(secondSewing, other, 40, "claim-sewing40");
  await denied("POST", assignmentPath(sewing60.id, "reports"), { work_date: dates.first, quantity_good: 1, idempotency_key: key("other-reports-assignment") }, other.session, [403]);
  const partialA = await report(winner.session, sewing60.id, 20, "same-day20-a");
  const partialB = await report(winner.session, sewing60.id, 20, "same-day20-b");
  assert.notEqual(partialA.id, partialB.id, "Intentional equal reports were merged.");
  assert.equal((await report(winner.session, sewing60.id, 20, "same-day20-b")).id, partialB.id);
  const pending = await earnings(winner);
  assert.equal(pending.worker.id, winner.worker.id);
  assert.equal(Number(pending.pending_total), 500010);
  assert.equal(Number(pending.approved_total), 0);
  assert(pending.rows.some((row) => row.id === partialA.id) && pending.rows.some((row) => row.id === partialB.id));
  const spoofed = await earnings(winner, `&worker_id=${other.worker.id}&user_id=${other.user.user_id}`);
  assert.equal(spoofed.worker.id, winner.worker.id, "Self earnings trusted caller-provided worker identity.");
  assert(!(await earnings(other)).rows.some((row) => row.id === partialA.id), "Own earnings exposed another worker's report.");
  const ambiguous = (await sql("insert into local_product_rates(piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,status,reason) values($1,'Synthetic ambiguity',7,'PIECE',$2,'APPROVED','Defensive own earnings rate fixture') returning id", [f.pieceCode, dates.start])).rows[0];
  try {
    const unavailable = await earnings(winner);
    assert.equal(Number(unavailable.pending_total), 0, "Ambiguous approved rates produced a misleading pending wage.");
    assert(unavailable.rows.filter((row) => [partialA.id, partialB.id].includes(row.id)).every((row) => row.pending_amount == null && row.unavailable_reason), "Ambiguous pending rates have no explicit warning.");
  } finally { await sql("delete from local_product_rates where id=$1", [ambiguous.id]); }
  const crossUnit = (await sql("insert into local_product_rates(piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,status,reason) values($1,'Synthetic cross-unit conflict',7,'METER',$2,'APPROVED','Defensive matching-unit parity fixture') returning id", [f.pieceCode, dates.start])).rows[0];
  try {
    const warning = await earnings(winner);
    assert.equal(Number(warning.pending_total), 0, "Cross-unit conflicting rate produced a misleading pending wage.");
    assert(warning.rows.filter((row) => [partialA.id, partialB.id].includes(row.id)).every((row) => row.pending_amount == null && row.unavailable_reason), "Cross-unit pending quote has no explicit warning.");
    await denied("POST", reportPath(partialA.id, "review"), { target_status: "APPROVED", reason: "Approval must match own-earnings conflict warning", idempotency_key: key("cross-unit-rate-approval") }, f.manager.session, [400, 409, 422]);
    const unchanged = (await sql("select status,production_entry_id from local_production_stage_events where id=$1", [partialA.id])).rows[0];
    assert.equal(unchanged.status, "SUBMITTED"); assert.equal(unchanged.production_entry_id, null);
  } finally { await sql("delete from local_product_rates where id=$1", [crossUnit.id]); }
  assert.equal(Number((await earnings(winner)).pending_total), 500010);
  const pendingRun = await must("POST", "/api/payroll/runs", { period_start: dates.start, period_end: dates.end, standard_days: 26, idempotency_key: key("pending-payroll-preview") }, f.admin);
  assert(!pendingRun.items.some((item) => item.source_type === "PRODUCTION_ENTRY" && [winner.worker.id, other.worker.id].includes(item.worker_id)), "Unapproved dispatch reports entered payroll.");
  await blockedComplete("close-pending-sew");
  await denied("POST", reportPath(partialA.id, "review"), { target_status: "APPROVED", idempotency_key: key("employee-approve-self") }, winner.session, [403]);
  await review(f.manager.session, partialA.id, "APPROVED", "sew20-a-approved");
  await review(f.manager.session, partialB.id, "APPROVED", "sew20-b-approved");
  const approved = await earnings(winner);
  assert.equal(Number(approved.pending_total), 0);
  assert.equal(Number(approved.approved_total), 500010);
  const quality = await report(winner.session, sewing60.id, 10, "mixed-quality", { quantity_rework: 5, quantity_remake: 5 });
  await denied("POST", assignmentPath(sewing60.id, "reports"), { work_date: dates.first, quantity_good: 1, idempotency_key: key("over-processing-quota") }, winner.session);
  await review(f.manager.session, quality.id, "APPROVED", "mixed-quality-approved");
  const repairBody = (kind, label) => ({ repair_kind: kind, quantity_good: 5, work_date: dates.first, notes: "Repair original reserved products; no additional wage", idempotency_key: key(label) });
  await denied("POST", reportPath(quality.id, "repair"), repairBody("REWORK", "other-repairs"), other.session, [403]);
  await denied("POST", reportPath(quality.id, "repair"), { ...repairBody("REWORK", "repair-transfer-spoof"), assignment_id: sewing40.id }, other.session, [403]);
  await denied("POST", reportPath(quality.id, "repair"), { ...repairBody("REWORK", "repair-before-assigned"), work_date: new Date(Date.parse(`${dates.start}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) }, winner.session);
  const repair = unwrap(await must("POST", reportPath(quality.id, "repair"), repairBody("REWORK", "repair5"), winner.session), "report");
  assert.equal(repair.is_payable, false);
  await denied("POST", reportPath(quality.id, "reverse"), { reason: "Original has an active repair child", idempotency_key: key("reverse-original-pending-repair") }, f.manager.session);
  assert.equal((await must("POST", reportPath(quality.id, "repair"), repairBody("REWORK", "repair5"), winner.session)).id, repair.id);
  await denied("POST", reportPath(quality.id, "repair"), repairBody("REWORK", "repair-over-original"), winner.session);
  assert.equal(Number((await earnings(winner)).pending_total), 0, "Repair created pending earnings twice.");
  await blockedComplete("close-pending-repair");
  // Exercise approval's defensive source validation with an isolated historical
  // inconsistency. The normal reversal API above must never create this state.
  await sql("update local_production_stage_events set status='REVERSED' where id=$1", [quality.id]);
  try {
    await denied("POST", reportPath(repair.id, "review"), { target_status: "APPROVED", reason: "Repair source is no longer approved", idempotency_key: key("approve-repair-invalid-source") }, f.manager.session);
    const unchangedRepair = (await sql("select status,production_entry_id from local_production_stage_events where id=$1", [repair.id])).rows[0];
    assert.equal(unchangedRepair.status, "SUBMITTED");
    assert.equal(unchangedRepair.production_entry_id, null);
  } finally {
    await sql("update local_production_stage_events set status='APPROVED' where id=$1", [quality.id]);
  }
  await review(f.manager.session, repair.id, "APPROVED", "repair5-approved");
  await denied("POST", reportPath(quality.id, "reverse"), { reason: "Original has an approved repair child", idempotency_key: key("reverse-original-approved-repair") }, f.manager.session);
  const remake = unwrap(await must("POST", reportPath(quality.id, "repair"), repairBody("REMAKE", "remake5"), winner.session), "report");
  await review(f.manager.session, remake.id, "APPROVED", "remake5-approved");
  assert.equal((await sql("select production_entry_id from local_production_stage_events where id=any($1::uuid[])", [[repair.id, remake.id]])).rows.filter((row) => row.production_entry_id).length, 0, "Repair/remake generated duplicate wage entries.");
  const final = await report(other.session, sewing40.id, 40, "other-sew40");
  await review(f.manager.session, final.id, "APPROVED", "other40-approved");
  assert.equal(Number((await earnings(winner)).approved_total), 625012.5);
  assert.equal(Number((await earnings(other)).approved_total), 500010);
  const workspace = await must("GET", `${dispatch}?orderId=${main.id}`, undefined, f.manager.session);
  const batch = workspace.batches.find((row) => row.id === main.production_batch_id);
  assert.equal(Number(batch.cutting_good), 100);
  assert.equal(Number(batch.sewing_good), 100, "Repaired original products cannot reach completion or were counted twice.");
  const hold = { target_status: "ON_HOLD", reason: "Pause with all source snapshots preserved" };
  await must("POST", `/api/production-orders/${main.id}/transition`, hold, f.manager.session);
  await denied("POST", `${dispatch}/publications/${secondSewing.id}/claim`, { quantity: 1, idempotency_key: key("claim-while-held") }, other.session);
  await must("POST", `/api/production-orders/${main.id}/transition`, { target_status: "IN_PROGRESS", reason: "Resume completed production" }, f.manager.session);
  for (const publication of [cutting, firstSewing, secondSewing]) await must("POST", `${dispatch}/publications/${publication.id}/close`, { status: "CLOSED", reason: "All accepted shares completed", idempotency_key: key(`close-${publication.id}`) }, f.manager.session);
  await verifyOwnDayAndPayroll(f, winner, other, main, partialA, repair);
}

async function assertReservedReturnRefused(f, order, movement, label, quantity = 1) {
  assert(movement?.id);
  const stock = async () => (await sql("select coalesce(sum(quantity_delta),0)::text quantity from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2", [f.inventoryItem.id, f.warehouseId])).rows[0].quantity;
  const before = await stock();
  const body = { document_type: "RETURN_IN", warehouse_id: f.warehouseId, production_order_id: order.id, transaction_at: dates.first, idempotency_key: key(label), lines: [{ inventory_item_id: f.inventoryItem.id, quantity, unit: "METER", source_movement_id: movement.id }] };
  const created = await api("POST", "/api/inventory/documents", body, f.manager.session);
  if (created.ok) {
    await denied("POST", `/api/inventory/documents/${created.payload.id}/confirm`, { reason: "Return cannot steal fabric already reserved for claimed cutting" }, f.manager.session);
    await must("POST", `/api/inventory/documents/${created.payload.id}/void`, { reason: "Discard refused synthetic return" }, f.manager.session);
  } else assert([400, 409, 422].includes(created.status), `Reserved return was not rejected cleanly: ${created.status}`);
  assert.equal(await stock(), before, "Refused reserved-fabric return partially mutated inventory.");
}

async function verifyOwnDayAndPayroll(f, winner, other, main, paidReport, repair) {
  const earnings = (worker) => must("GET", `/api/my-attendance/earnings?month=${dates.first.slice(0, 7)}`, undefined, worker.session);
  const approvedEntry = (await sql("select production_entry_id from local_production_stage_events where id=$1", [paidReport.id])).rows[0].production_entry_id;
  assert(approvedEntry);
  // A later source-profile change must not erase an approved wage snapshot or
  // pretend that a disabled source is still eligible for the current payroll.
  await sql("update local_worker_payroll_profiles set piece_output_enabled=false where worker_id=$1 and status='APPROVED'", [winner.worker.id]);
  const disabled = await earnings(winner);
  assert.equal(Number(disabled.approved_total), 625012.5, "Profile change erased approved earnings history.");
  const disabledRow = disabled.rows.find((row) => row.id === paidReport.id);
  assert.equal(Number(disabledRow.approved_amount), 250005);
  assert(disabledRow.unavailable_reason || disabledRow.eligibility_warning || disabledRow.source_warning, "Approved source disabled for payroll has no explicit eligibility warning.");
  const disabledRun = await must("POST", "/api/payroll/runs", { period_start: dates.start, period_end: dates.end, standard_days: 26, idempotency_key: key("disabled-source-preview") }, f.admin);
  assert(!disabledRun.items.some((item) => item.worker_id === winner.worker.id && item.source_type === "PRODUCTION_ENTRY"), "Disabled piece-output profile entered payroll despite the eligibility warning.");
  await sql("update local_worker_payroll_profiles set piece_output_enabled=true where worker_id=$1 and status='APPROVED'", [winner.worker.id]);
  assert.equal(Number((await earnings(winner)).approved_total), 625012.5);

  const confirmBody = { work_date: dates.first, reason: "Employee confirms own completed daily output", idempotency_key: key("own-day-confirm"), worker_id: other.worker.id, user_id: other.user.user_id };
  const ownDay = await must("POST", "/api/my-attendance/day-confirm", confirmBody, winner.session);
  assert.equal(ownDay.worker_id, winner.worker.id, "Self confirmation trusted caller-supplied worker identity.");
  assert.equal(ownDay.status, "EMPLOYEE_CONFIRMED");
  assert.equal((await must("POST", "/api/my-attendance/day-confirm", confirmBody, winner.session)).id, ownDay.id);
  await denied("POST", "/api/my-attendance/day-confirm", { ...confirmBody, reason: "Conflicting retry" }, winner.session, [409]);
  await denied("POST", "/api/my-attendance/day-confirm", confirmBody, other.session, [409]);
  const actualDays = (await sql("select worker_id,status from local_day_closures where work_date=$1 order by worker_id", [dates.first])).rows;
  assert(actualDays.some((row) => row.worker_id === winner.worker.id && row.status === "EMPLOYEE_CONFIRMED"));
  assert(!actualDays.some((row) => row.worker_id === other.worker.id), "Spoofed self confirmation mutated another employee's day.");
  await must("POST", "/api/my-attendance/day-confirm", { work_date: dates.first, idempotency_key: key("other-day-confirm") }, other.session);
  const closureBody = (worker, label) => ({ worker_id: worker.worker.id, work_date: dates.first, target_status: "LEADER_CONFIRMED", reason: "Manager verifies approved outputs", idempotency_key: key(label) });
  await denied("POST", "/api/attendance/closures", closureBody(winner, "outsider-closes-day"), f.outsider.session, [403]);
  for (const worker of [winner, other]) {
    const body = closureBody(worker, `leader-${worker.worker.id}`);
    const closedDay = await must("POST", "/api/attendance/closures", body, f.manager.session);
    assert.equal(closedDay.status, "LEADER_CONFIRMED");
    assert.equal((await must("POST", "/api/attendance/closures", body, f.manager.session)).id, closedDay.id);
    await denied("POST", "/api/my-attendance/day-confirm", { work_date: dates.first, idempotency_key: key(`confirmed-day-repeat-${worker.worker.id}`) }, worker.session);
  }

  const entryRows = (await sql("select p.id,p.quantity::text quantity,p.calculated_amount::text amount,p.piece_rate_code,p.workflow_status,p.is_reversed from local_production_entries p join local_production_stage_events e on e.production_entry_id=p.id where e.production_order_id=$1 order by p.id", [main.id])).rows;
  assert.equal(entryRows.length, 4, "Paid reports did not create exactly one canonical wage entry each.");
  assert.equal(entryRows.reduce((sum, row) => sum + Number(row.quantity), 0), 90, "Repaired pieces were paid a second time.");
  assert.equal(entryRows.reduce((sum, row) => sum + Number(row.amount), 0), 1125022.5);
  assert(entryRows.every((row) => row.piece_rate_code === f.pieceCode && row.workflow_status === "APPROVED" && !row.is_reversed), "CRM SKU rate replaced the independent Excel work code or an approval snapshot.");
  const runBody = { period_start: dates.start, period_end: dates.end, standard_days: 26, idempotency_key: key("final-payroll") };
  const run = await must("POST", "/api/payroll/runs", runBody, f.admin);
  assert.equal((await must("POST", "/api/payroll/runs", runBody, f.admin)).id, run.id);
  assert.equal(Number(run.blocking_exception_count), 0, "Full approved workflow still has a payroll blocking exception.");
  const ids = entryRows.map((row) => row.id);
  const items = run.items.filter((item) => ids.includes(item.source_id));
  assert.equal(items.length, 4);
  assert(items.every((item) => item.item_type === "PIECE_RATE" && item.source_type === "PRODUCTION_ENTRY"));
  assert.equal(items.reduce((sum, item) => sum + Number(item.quantity), 0), 90);
  assert.equal(items.reduce((sum, item) => sum + Number(item.amount_precise), 0), 1125022.5);
  const locked = await must("POST", `/api/payroll/runs/${run.id}/lock`, {}, f.admin);
  assert.equal(locked.status, "LOCKED");
  assert.equal((await must("POST", `/api/payroll/runs/${run.id}/lock`, {}, f.admin)).id, run.id);
  await denied("POST", reportPath(paidReport.id, "reverse"), { reason: "Locked sources must remain immutable", idempotency_key: key("locked-report-reverse") }, f.manager.session);
  await denied("POST", reportPath(repair.id, "review"), { target_status: "REJECTED", reason: "Cannot change repair in a locked day", idempotency_key: key("locked-repair-reject") }, f.manager.session);
  await denied("POST", "/api/attendance/closures", { ...closureBody(winner, "locked-day-reopen"), target_status: "REOPENED" }, f.manager.session);
  await denied("POST", "/api/my-attendance/day-confirm", { work_date: dates.second, idempotency_key: key("locked-new-day") }, winner.session);
  assert.deepEqual((await must("GET", `/api/payroll/runs/${run.id}`, undefined, f.admin)).items, locked.items, "Refused source changes mutated the locked payroll items.");
  const after = (await sql("select p.id,p.quantity::text quantity,p.calculated_amount::text amount,p.piece_rate_code,p.workflow_status,p.is_reversed from local_production_entries p join local_production_stage_events e on e.production_entry_id=p.id where e.production_order_id=$1 order by p.id", [main.id])).rows;
  assert.deepEqual(after, entryRows, "Failed locked operations partially modified canonical wage entries.");

  const completeBody = { quantity_good: 100, quantity_scrap: 0, idempotency_key: key("completed-production") };
  const completed = await must("POST", `/api/production-orders/${main.id}/complete`, completeBody, f.manager.session);
  assert.equal(completed.status, "COMPLETED");
  const repeated = await must("POST", `/api/production-orders/${main.id}/complete`, completeBody, f.manager.session);
  assert.equal(repeated.output.id, completed.output.id);
  await denied("POST", `/api/production-orders/${main.id}/complete`, { ...completeBody, quantity_good: 99 }, f.manager.session, [409]);
  await denied("POST", `/api/production-orders/${main.id}/transition`, { target_status: "IN_PROGRESS", reason: "Completed production cannot reopen" }, f.manager.session);
  assert.equal((await sql("select count(*)::int count,sum(quantity_good)::text quantity from local_production_outputs where production_order_id=$1", [main.id])).rows[0].count, 1, "Completion retry created duplicate finished output.");
}
