import { useCallback, useEffect, useMemo, useState } from "react";
import type { User as AuthUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Factory, Plus, Play, Check, AlertTriangle, ShieldCheck, RefreshCw, ArrowUpFromLine, Undo2 } from "lucide-react";
import { confirmInventoryDocument, createInventoryDocument, listInventoryItems, listInventoryReturnSources, listInventoryWarehouses, type InventoryItem, type InventoryReturnSource, type InventoryWarehouse } from "@/lib/inventory-management";
import { listManufacturingProducts, type ManufacturingProduct } from "@/lib/bom-management";
import {
  listProductionOrders, createProductionOrder, releaseProductionOrder, completeProductionOrder,
  listProductionMaterialRequirements, listProductionOperations, startProductionOperation,
  completeProductionOperation, getMaterialVariance, getLaborVariance, getProductionOutputs,
  listProductionWorkers,
} from "@/lib/production-execution";
import type {
  ProductionOrder, ProductionOrderMaterialRequirement,
  ProductionOrderOperation, MaterialVarianceResult, LaborVarianceResult, ProductionOutput, ProductionWorker,
} from "@/integrations/supabase/production-execution-types";
import {
  listRoutingWorkspace, listRoutingOperations, createRoutingDraft, saveRoutingDraft, approveRoutingVersion,
} from "@/lib/production-execution";
import type {
  RoutingVersion, RoutingHeader, RoutingOperation, RoutingOperationInput,
} from "@/integrations/supabase/production-execution-types";

const statusLabels: Record<string, string> = {
  DRAFT: "Nháp", PLANNED: "Kế hoạch", RELEASED: "Đã phát hành",
  IN_PROGRESS: "Đang thực hiện", COMPLETED: "Hoàn thành", CANCELLED: "Đã hủy", ON_HOLD: "Tạm dừng",
};
const statusVariant = (s: string) => s === "COMPLETED" ? "default" as const : s === "CANCELLED" ? "destructive" as const : s === "IN_PROGRESS" || s === "RELEASED" ? "default" as const : "outline" as const;

function fmt(n: number | null | undefined, d = 2) {
  if (n === null || n === undefined) return "-";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: d }).format(n);
}
function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}
function errMsg(e: unknown) { if (e instanceof Error) return e.message; if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message); return "Thao tác thất bại."; }

export default function ProductionOrdersPage() {
  const { toast } = useToast();
  const [user, setUser] = useState<AuthUser | null>(null);
  const { role, loading: roleLoading } = useUserRole(user);
  const { hasPermission, loading: permLoading } = useEmployeePermissions(user, role);
  const canView = hasPermission("production_view");
  const canManage = hasPermission("production_manage");
  const canRelease = hasPermission("production_release");
  const canComplete = hasPermission("production_complete");
  const canOperate = hasPermission("production_operations");
  const canIssueMaterial = hasPermission("inventory_documents") && hasPermission("inventory_confirm");

  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [products, setProducts] = useState<ManufacturingProduct[]>([]);
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedId, setSelectedId] = useState("");

  // create form
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ product_id: "", quantity: "100", source_type: "MANUAL", order_id: "", planned_start: "", planned_end: "" });

  // detail
  const selectedOrder = useMemo(() => orders.find(o => o.id === selectedId) ?? null, [orders, selectedId]);
  const [requirements, setRequirements] = useState<ProductionOrderMaterialRequirement[]>([]);
  const [operations, setOperations] = useState<ProductionOrderOperation[]>([]);
  const [materialVar, setMaterialVar] = useState<MaterialVarianceResult | null>(null);
  const [laborVar, setLaborVar] = useState<LaborVarianceResult | null>(null);
  const [outputs, setOutputs] = useState<ProductionOutput[]>([]);
  const [completeQty, setCompleteQty] = useState("");

  // material issue / return (writes go through the inventory ledger RPCs)
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [invItems, setInvItems] = useState<InventoryItem[]>([]);
  const [returnSources, setReturnSources] = useState<InventoryReturnSource[]>([]);
  const [materialDocOpen, setMaterialDocOpen] = useState(false);
  const [materialDocMode, setMaterialDocMode] = useState<"ISSUE" | "RETURN_IN">("ISSUE");
  const [materialDocForm, setMaterialDocForm] = useState({ inventory_item_id: "", warehouse_id: "", quantity: "", source_movement_id: "", description: "" });

  // routing panel (per selected product when no PO selected)
  const [routingHeader, setRoutingHeader] = useState<RoutingHeader | null>(null);
  const [routingVersions, setRoutingVersions] = useState<RoutingVersion[]>([]);
  const [selectedRoutingId, setSelectedRoutingId] = useState("");
  const [routingOps, setRoutingOps] = useState<RoutingOperation[]>([]);
  const selectedRouting = routingVersions.find(v => v.id === selectedRoutingId) ?? null;

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUser(data.user)); }, []);

  useEffect(() => {
    if (!canIssueMaterial) return;
    listInventoryWarehouses().then(setWarehouses).catch(() => setWarehouses([]));
    listInventoryItems().then(setInvItems).catch(() => setInvItems([]));
  }, [canIssueMaterial]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p, w] = await Promise.all([listProductionOrders(), listManufacturingProducts(), listProductionWorkers().catch(() => [] as ProductionWorker[])]);
      setOrders(o);
      setProducts(p);
      setWorkers(w);
      if (!selectedId && o.length) setSelectedId(o[0].id);
      if (p.length && !createForm.product_id) setCreateForm(f => ({ ...f, product_id: p[0].id }));
    } catch (e) { toast({ title: "Không thể tải dữ liệu", description: errMsg(e), variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast, selectedId, createForm.product_id]);

  useEffect(() => { if (!roleLoading && !permLoading && canView) void loadAll(); if (!roleLoading && !permLoading && !canView) setLoading(false); }, [canView, roleLoading, permLoading, loadAll]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const [rq, ops, mv, lv, out] = await Promise.all([
        listProductionMaterialRequirements(id).catch(() => [] as ProductionOrderMaterialRequirement[]),
        listProductionOperations(id).catch(() => [] as ProductionOrderOperation[]),
        getMaterialVariance(id).catch(() => null),
        getLaborVariance(id).catch(() => null),
        getProductionOutputs(id).catch(() => [] as ProductionOutput[]),
      ]);
      setRequirements(rq); setOperations(ops); setMaterialVar(mv); setLaborVar(lv); setOutputs(out);
    } catch { /* ignore transient */ }
  }, []);

  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);

  const loadRouting = useCallback(async (productId: string) => {
    if (!productId) return;
    try {
      const { header, versions } = await listRoutingWorkspace(productId);
      setRoutingHeader(header); setRoutingVersions(versions);
      const pick = versions.find(v => v.status === "DRAFT")?.id ?? versions.find(v => v.status === "APPROVED")?.id ?? versions[0]?.id ?? "";
      setSelectedRoutingId(pick);
    } catch { setRoutingHeader(null); setRoutingVersions([]); }
  }, []);

  useEffect(() => {
    if (!selectedRoutingId) { setRoutingOps([]); return; }
    listRoutingOperations(selectedRoutingId).then(setRoutingOps).catch(() => setRoutingOps([]));
  }, [selectedRoutingId]);

  const filteredOrders = useMemo(() => filterStatus === "all" ? orders : orders.filter(o => o.status === filterStatus), [orders, filterStatus]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  const itemLabel = (id: string) => {
    const item = invItems.find(x => x.id === id);
    return item ? `${item.code} · ${item.name}` : id.slice(0, 8);
  };

  const openMaterialDoc = (mode: "ISSUE" | "RETURN_IN") => {
    setMaterialDocMode(mode);
    setMaterialDocForm({ inventory_item_id: "", warehouse_id: warehouses[0]?.id ?? "", quantity: "", source_movement_id: "", description: "" });
    setMaterialDocOpen(true);
    if (mode === "RETURN_IN") listInventoryReturnSources().then(setReturnSources).catch(() => setReturnSources([]));
  };

  const handleMaterialDoc = () => run(async () => {
    if (!selectedOrder) return;
    const item = invItems.find(x => x.id === materialDocForm.inventory_item_id);
    const qty = Number(materialDocForm.quantity);
    if (!item || !materialDocForm.warehouse_id || !qty || qty <= 0) { toast({ title: "Thiếu kho, vật tư hoặc số lượng", variant: "destructive" }); return; }
    if (materialDocMode === "RETURN_IN" && !materialDocForm.source_movement_id) { toast({ title: "Phiếu trả phải chọn movement gốc đã cấp", variant: "destructive" }); return; }
    try {
      const doc = await createInventoryDocument({
        document_type: materialDocMode,
        transaction_at: new Date().toISOString(),
        warehouse_id: materialDocForm.warehouse_id,
        description: materialDocForm.description.trim() || `${materialDocMode === "ISSUE" ? "Cấp vật tư" : "Trả vật tư"} ${selectedOrder.production_order_number}`,
        idempotency_key: crypto.randomUUID(),
        lines: [{
          inventory_item_id: item.id,
          quantity: qty,
          unit: item.base_unit,
          source_movement_id: materialDocMode === "RETURN_IN" ? materialDocForm.source_movement_id : null,
        }],
        production_order_id: selectedOrder.id,
      });
      await confirmInventoryDocument(doc.id);
      toast({ title: `Đã ghi sổ phiếu ${doc.document_number}` });
      setMaterialDocOpen(false);
      await loadDetail(selectedOrder.id);
    } catch (e) { toast({ title: "Không thể ghi phiếu kho", description: errMsg(e), variant: "destructive" }); }
  });

  const handleCreate = () => run(async () => {
    const qty = Number(createForm.quantity);
    if (!createForm.product_id || !qty || qty <= 0) { toast({ title: "Số lượng không hợp lệ", variant: "destructive" }); return; }
    await createProductionOrder({ product_id: createForm.product_id, quantity: qty, source_type: createForm.source_type, order_id: createForm.order_id || null, planned_start_date: createForm.planned_start || null, planned_end_date: createForm.planned_end || null });
    toast({ title: "Đã tạo lệnh sản xuất" });
    setCreateOpen(false);
    await loadAll();
  });

  const handleRelease = (id: string) => run(async () => {
    try { await releaseProductionOrder(id); toast({ title: "Đã phát hành lệnh sản xuất" }); await loadAll(); await loadDetail(id); }
    catch (e) { toast({ title: "Không thể phát hành", description: errMsg(e), variant: "destructive" }); }
  });

  const handleComplete = (id: string) => run(async () => {
    const q = Number(completeQty);
    if (!q || q < 0) { toast({ title: "Số lượng đạt không hợp lệ", variant: "destructive" }); return; }
    try { await completeProductionOrder(id, q); toast({ title: "Đã hoàn thành lệnh sản xuất" }); setCompleteQty(""); await loadAll(); await loadDetail(id); }
    catch (e) { toast({ title: "Không thể hoàn thành", description: errMsg(e), variant: "destructive" }); }
  });

  if (roleLoading || permLoading || loading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!canView) return <Alert variant="destructive"><ShieldCheck className="h-4 w-4" /><AlertTitle>Không có quyền truy cập</AlertTitle><AlertDescription>Cần quyền Lệnh sản xuất - Xem.</AlertDescription></Alert>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Factory className="h-6 w-6" /><h1 className="text-2xl font-bold">Lệnh sản xuất</h1><Badge variant="outline">{orders.length} lệnh</Badge></div>
        <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả trạng thái</SelectItem>{["DRAFT","PLANNED","RELEASED","IN_PROGRESS","COMPLETED","CANCELLED","ON_HOLD"].map(s => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" size="icon" onClick={() => void loadAll()} disabled={busy}><RefreshCw className="h-4 w-4" /></Button>
          {canManage && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Tạo lệnh</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Tạo lệnh sản xuất</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2"><Label>Sản phẩm</Label><Select value={createForm.product_id} onValueChange={v => setCreateForm(f => ({ ...f, product_id: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {p.sku ?? "—"}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Số lượng kế hoạch</Label><Input type="number" min="0" value={createForm.quantity} onChange={e => setCreateForm(f => ({ ...f, quantity: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>Nguồn</Label><Select value={createForm.source_type} onValueChange={v => setCreateForm(f => ({ ...f, source_type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MANUAL">Thủ công</SelectItem><SelectItem value="FROM_ORDER">Từ đơn hàng</SelectItem><SelectItem value="FROM_STOCK_PLAN">Kế hoạch tồn</SelectItem></SelectContent></Select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Ngày bắt đầu KH</Label><Input type="date" value={createForm.planned_start} onChange={e => setCreateForm(f => ({ ...f, planned_start: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>Ngày kết thúc KH</Label><Input type="date" value={createForm.planned_end} onChange={e => setCreateForm(f => ({ ...f, planned_end: e.target.value }))} /></div>
                  </div>
                  <Button className="w-full" onClick={handleCreate} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Tạo</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="rounded-md border bg-background overflow-hidden">
          <div className="max-h-[70vh] overflow-auto divide-y">
            {filteredOrders.map(o => {
              const prod = products.find(p => p.id === o.product_id);
              return (
                <button key={o.id} onClick={() => setSelectedId(o.id)} className={`w-full text-left p-3 hover:bg-muted/50 ${selectedId === o.id ? "bg-muted" : ""}`}>
                  <div className="flex items-center justify-between"><span className="font-mono text-sm font-semibold">{o.production_order_number}</span><Badge variant={statusVariant(o.status)}>{statusLabels[o.status] ?? o.status}</Badge></div>
                  <div className="text-sm truncate">{prod?.name ?? o.product_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">SL KH: {fmt(o.quantity_planned, 0)} · Đạt: {fmt(o.quantity_good, 0)} · Chuẩn: {fmt(o.standard_minutes_total, 0)} phút</div>
                  {o.qr_token && <div className="text-xs text-muted-foreground truncate">QR: {o.qr_token.slice(0, 8)}</div>}
                </button>
              );
            })}
            {!filteredOrders.length && <div className="p-8 text-center text-sm text-muted-foreground">Chưa có lệnh sản xuất</div>}
          </div>
        </div>

        <div className="min-w-0">
          {!selectedOrder ? (
            <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Chưa chọn lệnh sản xuất</AlertTitle></Alert>
          ) : (
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="overview">Tổng quan</TabsTrigger><TabsTrigger value="materials">Vật tư</TabsTrigger><TabsTrigger value="operations">Công đoạn</TabsTrigger><TabsTrigger value="labor">Nhân công</TabsTrigger><TabsTrigger value="output">Sản lượng</TabsTrigger><TabsTrigger value="routing">Quy trình</TabsTrigger></TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant={statusVariant(selectedOrder.status)}>{statusLabels[selectedOrder.status]}</Badge><span className="font-mono">{selectedOrder.production_order_number}</span><span className="text-sm text-muted-foreground">Lô: {selectedOrder.production_batch_number}</span></div>
                  <div className="grid gap-3 sm:grid-cols-3 text-sm">
                    <div><div className="text-muted-foreground">Sản phẩm</div><div className="font-medium">{products.find(p => p.id === selectedOrder.product_id)?.name ?? selectedOrder.product_id}</div></div>
                    <div><div className="text-muted-foreground">SL kế hoạch</div><div className="font-medium">{fmt(selectedOrder.quantity_planned, 0)}</div></div>
                    <div><div className="text-muted-foreground">Chuẩn tổng</div><div className="font-medium">{fmt(selectedOrder.standard_minutes_total, 0)} phút</div></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(selectedOrder.status === "DRAFT" || selectedOrder.status === "PLANNED") && canRelease && (
                      <Button onClick={() => handleRelease(selectedOrder.id)} disabled={busy}><Play className="mr-2 h-4 w-4" />Phát hành (snapshot)</Button>
                    )}
                    {(selectedOrder.status === "RELEASED" || selectedOrder.status === "IN_PROGRESS" || selectedOrder.status === "ON_HOLD") && canComplete && (
                      <div className="flex gap-2 items-end">
                        <div className="space-y-1"><Label>Số lượng đạt</Label><Input type="number" value={completeQty} onChange={e => setCompleteQty(e.target.value)} placeholder={String(selectedOrder.quantity_planned)} className="w-32" /></div>
                        <Button onClick={() => handleComplete(selectedOrder.id)} disabled={busy}><Check className="mr-2 h-4 w-4" />Hoàn thành</Button>
                      </div>
                    )}
                  </div>
                  {!!outputs.length && <div className="text-sm">Output: {outputs.map(o => `${fmt(o.quantity_good, 0)} đạt / ${fmt(o.quantity_scrap, 0)} lỗi · ${o.valuation_status}`).join(" | ")}</div>}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border p-4">
                    <h3 className="font-semibold mb-2">Variance vật tư</h3>
                    {!materialVar?.materials.length ? <div className="text-sm text-muted-foreground">Chưa có snapshot vật tư (cần phát hành lệnh).</div> : (
                      <div className="space-y-1 text-sm">{materialVar.materials.map(m => <div key={m.inventory_item_id} className="flex justify-between"><span>{m.inventory_item_id.slice(0, 8)} · {m.unit}</span><span className={m.quantity_variance > 0 ? "text-amber-600" : m.quantity_variance < 0 ? "text-emerald-600" : ""}>{m.quantity_variance > 0 ? "+" : ""}{fmt(m.quantity_variance)} ({m.actual_consumption_quantity ? `${fmt(m.quantity_variance / (m.standard_quantity || 1) * 100, 1)}%` : "-"})</span></div>)}</div>
                    )}
                    {materialVar?.cost_visible && <div className="mt-2 text-sm">Actual material cost được tính từ ledger (issue - return).</div>}
                  </div>
                  <div className="rounded-md border p-4">
                    <h3 className="font-semibold mb-2">Variance nhân công</h3>
                    {!laborVar ? <div className="text-sm text-muted-foreground">Chưa có dữ liệu.</div> : (
                      <div className="text-sm space-y-1">
                        <div>Chuẩn: {fmt(laborVar.standard_minutes)} phút</div>
                        <div>Thực tế: {fmt(laborVar.actual_minutes)} phút</div>
                        <div>Vượt: <span className={(laborVar.variance_minutes ?? 0) > 0 ? "text-amber-600" : ""}>{fmt(laborVar.variance_minutes)}</span></div>
                        <div>Efficiency: {laborVar.efficiency_percent !== null ? `${fmt(laborVar.efficiency_percent, 2)}%` : "-"}</div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="materials" className="space-y-3">
                {canIssueMaterial && (selectedOrder.status === "RELEASED" || selectedOrder.status === "IN_PROGRESS" || selectedOrder.status === "ON_HOLD") && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => openMaterialDoc("ISSUE")} disabled={busy || !requirements.length}><ArrowUpFromLine className="mr-2 h-4 w-4" />Cấp vật tư</Button>
                    <Button size="sm" variant="outline" onClick={() => openMaterialDoc("RETURN_IN")} disabled={busy || !requirements.length}><Undo2 className="mr-2 h-4 w-4" />Trả vật tư</Button>
                  </div>
                )}

                <Dialog open={materialDocOpen} onOpenChange={setMaterialDocOpen}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>{materialDocMode === "ISSUE" ? "Cấp vật tư cho lệnh sản xuất" : "Trả vật tư về kho"}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Kho</Label>
                        <Select value={materialDocForm.warehouse_id} onValueChange={v => setMaterialDocForm(f => ({ ...f, warehouse_id: v, source_movement_id: "" }))}>
                          <SelectTrigger><SelectValue placeholder="Chọn kho" /></SelectTrigger>
                          <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Vật tư trong định mức</Label>
                        <Select value={materialDocForm.inventory_item_id} onValueChange={v => setMaterialDocForm(f => ({ ...f, inventory_item_id: v, source_movement_id: "" }))}>
                          <SelectTrigger><SelectValue placeholder="Chọn vật tư" /></SelectTrigger>
                          <SelectContent>{invItems.filter(i => requirements.some(r => r.inventory_item_id === i.id)).map(i => <SelectItem key={i.id} value={i.id}>{i.code} · {i.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {materialDocMode === "RETURN_IN" && (
                        <div className="space-y-2">
                          <Label>Movement đã cấp (bắt buộc)</Label>
                          <Select value={materialDocForm.source_movement_id} onValueChange={v => setMaterialDocForm(f => ({ ...f, source_movement_id: v }))}>
                            <SelectTrigger><SelectValue placeholder="Chọn phiếu cấp gốc" /></SelectTrigger>
                            <SelectContent>
                              {returnSources
                                .filter(s => s.inventory_item_id === materialDocForm.inventory_item_id && s.warehouse_id === materialDocForm.warehouse_id && Number(s.remaining_quantity) > 0)
                                .map(s => <SelectItem key={s.id} value={s.id}>{s.document_number} · còn {fmt(s.remaining_quantity)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-2"><Label>Số lượng</Label><Input type="number" min="0" step="0.0001" value={materialDocForm.quantity} onChange={e => setMaterialDocForm(f => ({ ...f, quantity: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>Nội dung (tùy chọn)</Label><Input value={materialDocForm.description} onChange={e => setMaterialDocForm(f => ({ ...f, description: e.target.value }))} placeholder={`${materialDocMode === "ISSUE" ? "Cấp vật tư" : "Trả vật tư"} ${selectedOrder.production_order_number}`} /></div>
                      {(() => {
                        const mv = materialVar?.materials.find(x => x.inventory_item_id === materialDocForm.inventory_item_id);
                        const rq = requirements.find(x => x.inventory_item_id === materialDocForm.inventory_item_id);
                        if (!mv || !rq) return null;
                        const remaining = Number(rq.planned_quantity) - Number(mv.issued_quantity ?? 0);
                        return <div className="rounded-md border p-2 text-xs text-muted-foreground">Kế hoạch {fmt(rq.planned_quantity)} · đã cấp {fmt(mv.issued_quantity)} · còn lại {fmt(remaining)} {rq.unit}{remaining < 0 ? " (đã vượt kế hoạch)" : ""}</div>;
                      })()}
                      <Button className="w-full" onClick={handleMaterialDoc} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Tạo và ghi sổ kho</Button>
                      <div className="text-xs text-muted-foreground">Phiếu được tạo rồi xác nhận qua RPC kho, gắn production_order_id. Tồn kho và giá bình quân do ledger quyết định.</div>
                    </div>
                  </DialogContent>
                </Dialog>

                <div className="overflow-x-auto rounded-md border">
                  <Table><TableHeader><TableRow><TableHead>Vật tư</TableHead><TableHead className="text-right">Định mức chuẩn</TableHead><TableHead className="text-right">Kế hoạch</TableHead><TableHead className="text-right">Đã cấp</TableHead><TableHead className="text-right">Đã trả</TableHead><TableHead className="text-right">Thực tế</TableHead><TableHead className="text-right">Chênh lệch</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {requirements.length ? requirements.map(r => {
                        const mv = materialVar?.materials.find(x => x.inventory_item_id === r.inventory_item_id);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs">{itemLabel(r.inventory_item_id)} · {r.unit}</TableCell>
                            <TableCell className="text-right">{fmt(r.standard_quantity)}</TableCell>
                            <TableCell className="text-right">{fmt(r.planned_quantity)}</TableCell>
                            <TableCell className="text-right">{fmt(mv?.issued_quantity)}</TableCell>
                            <TableCell className="text-right">{fmt(mv?.returned_quantity)}</TableCell>
                            <TableCell className="text-right font-medium">{fmt(mv?.actual_consumption_quantity)}</TableCell>
                            <TableCell className={`text-right ${mv && mv.quantity_variance > 0 ? "text-amber-600" : ""}`}>{mv ? `${mv.quantity_variance > 0 ? "+" : ""}${fmt(mv.quantity_variance)}` : "-"}</TableCell>
                          </TableRow>
                        );
                      }) : <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Chưa có snapshot vật tư — hãy phát hành lệnh.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
                {materialVar?.cost_visible && materialVar.materials.some(m => m.actual_material_cost !== null) && (
                  <div className="rounded-md border p-3 text-sm"><span className="font-medium">Chi phí nguyên vật liệu thực tế:</span> {fmtCurrency(materialVar.materials.reduce((s, m) => s + (m.actual_material_cost ?? 0), 0))} <span className="text-muted-foreground">(issue value - return value từ ledger; KHÔNG phải giá thành)</span></div>
                )}
                <div className="text-xs text-muted-foreground">Thực tế = Đã cấp - Đã trả (từ Inventory Ledger). Cấp/trả vật tư thực hiện qua Kho & vật tư với production_order_id.</div>
              </TabsContent>

              <TabsContent value="operations" className="space-y-3">
                <div className="overflow-x-auto rounded-md border">
                  <Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Công đoạn</TableHead><TableHead className="text-right">Setup</TableHead><TableHead className="text-right">Chuẩn / sp</TableHead><TableHead className="text-right">Tổng chuẩn</TableHead><TableHead>Trạng thái</TableHead><TableHead>QR</TableHead><TableHead /></TableRow></TableHeader>
                    <TableBody>
                      {operations.map(op => (
                        <TableRow key={op.id}>
                          <TableCell>{op.sequence}</TableCell>
                          <TableCell><div className="font-medium">{op.operation_name}</div><div className="text-xs text-muted-foreground">{op.operation_code}</div></TableCell>
                          <TableCell className="text-right">{fmt(op.standard_setup_minutes)}</TableCell>
                          <TableCell className="text-right">{fmt(op.standard_run_minutes_per_unit)}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(op.standard_total_minutes)}</TableCell>
                          <TableCell><Badge variant={statusVariant(op.status)}>{op.status}</Badge></TableCell>
                          <TableCell className="font-mono text-xs max-w-28 truncate">{op.operation_qr_code ?? "-"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {(op.status === "PENDING" || op.status === "READY") && canOperate && <Button size="sm" variant="outline" onClick={() => run(async () => { await startProductionOperation(op.id); await loadDetail(selectedOrder.id); })}>Bắt đầu</Button>}
                              {op.status === "IN_PROGRESS" && canOperate && <Button size="sm" onClick={() => run(async () => { await completeProductionOperation(op.id); await loadDetail(selectedOrder.id); })}>Hoàn thành</Button>}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!operations.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Chưa có công đoạn — cần Routing đã duyệt trước khi phát hành.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="labor" className="space-y-3">
                {!laborVar ? <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Chưa có dữ liệu nhân công</AlertTitle></Alert> : (
                  <div className="rounded-md border p-4 space-y-2 text-sm">
                    <div>Chuẩn: {fmt(laborVar.standard_minutes)} phút</div>
                    <div>Thực tế: {fmt(laborVar.actual_minutes)} phút</div>
                    <div>Chênh lệch: {fmt(laborVar.variance_minutes)} phút</div>
                    <div>Efficiency: {laborVar.efficiency_percent !== null ? `${fmt(laborVar.efficiency_percent, 2)}%` : "-"}</div>
                    <div className="text-xs text-muted-foreground">Thực tế tính từ operation logs (START → COMPLETE). Chưa tính chi phí nhân công nếu chưa có labor rate đáng tin.</div>
                  </div>
                )}
                <div className="rounded-md border p-3">
                  <h4 className="font-medium mb-2">Công nhân sản xuất ({workers.length})</h4>
                  <div className="text-xs text-muted-foreground">Quản lý công nhân tại phân quyền hoặc tạo qua RPC create_production_worker.</div>
                </div>
              </TabsContent>

              <TabsContent value="output" className="space-y-3">
                <div className="overflow-x-auto rounded-md border">
                  <Table><TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead className="text-right">Đạt</TableHead><TableHead className="text-right">Lỗi</TableHead><TableHead>Trạng thái giá</TableHead><TableHead>Kho</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {outputs.map(o => <TableRow key={o.id}><TableCell>{o.output_date}</TableCell><TableCell className="text-right">{fmt(o.quantity_good, 0)}</TableCell><TableCell className="text-right">{fmt(o.quantity_scrap, 0)}</TableCell><TableCell><Badge variant="outline">{o.valuation_status}</Badge></TableCell><TableCell className="font-mono text-xs">{o.warehouse_id?.slice(0, 8) ?? "-"}</TableCell></TableRow>)}
                      {!outputs.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Chưa có output — hoàn thành lệnh để tạo.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
                <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>PENDING_COST</AlertTitle><AlertDescription>Thành phẩm Sprint 4 ở trạng thái chờ tính giá. Không dùng Chi phí NVL làm Giá thành.</AlertDescription></Alert>
              </TabsContent>

              <TabsContent value="routing" className="space-y-4">
                <div className="flex gap-2">
                  <Select value={products.find(p => p.id === selectedOrder.product_id)?.id ?? ""} onValueChange={v => void loadRouting(v)}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="Chọn sản phẩm để xem routing" /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => selectedOrder && void loadRouting(selectedOrder.product_id)}>Tải routing</Button>
                </div>
                {routingHeader ? (
                  <>
                    <div className="flex items-center gap-2"><Badge variant="outline">{routingHeader.code}</Badge><span>{routingHeader.name}</span></div>
                    <div className="flex gap-2 items-center">
                      <Select value={selectedRoutingId} onValueChange={setSelectedRoutingId}><SelectTrigger className="w-64"><SelectValue placeholder="Phiên bản" /></SelectTrigger><SelectContent>{routingVersions.map(v => <SelectItem key={v.id} value={v.id}>V{v.version_number} · {statusLabels[v.status] ?? v.status}</SelectItem>)}</SelectContent></Select>
                      {canManage && <Button variant="outline" size="sm" onClick={() => run(async () => { const p = products.find(x => x.id === selectedOrder.product_id); if (!p) return; await createRoutingDraft(p.id, `RT-${p.sku ?? p.id.slice(0, 6)}`, `Quy trình ${p.name}`); await loadRouting(p.id); })}>Tạo nháp</Button>}
                    </div>
                    {selectedRouting && (
                      <div className="space-y-3">
                        <div className="rounded-md border p-3 text-sm text-muted-foreground">Routing đã được snapshot vào lệnh sản xuất. Quản lý phiên bản routing tại module cấu hình sản xuất.</div>
                      </div>
                    )}
                  </>
                ) : <div className="text-sm text-muted-foreground">Chọn sản phẩm để xem quy trình.</div>}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}


