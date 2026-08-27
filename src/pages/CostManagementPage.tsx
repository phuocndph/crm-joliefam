import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { CircleDollarSign, FolderTree, History, Landmark, Pencil, Plus, Search, Settings2, ShieldCheck, Target, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import {
  confirmBusinessTransaction,
  createBusinessTransaction,
  createCostCategory,
  createCostCenter,
  createCostObject,
  listBusinessTransactions,
  listCostAuditEvents,
  listCostCategories,
  listCostCenters,
  listCostObjects,
  listCostUsers,
  listTransactionTypes,
  setMasterActive,
  updateCostCategory,
  updateCostCenter,
  voidBusinessTransaction,
  type BusinessTransactionLineInput,
  type CostBehavior,
  type CostCategory,
  type CostCenter,
  type Traceability,
} from "@/lib/cost-management";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type DraftLine = BusinessTransactionLineInput & { key: string };

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const newLine = (): DraftLine => ({
  key: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unit: "lần",
  unit_price: 0,
  vat_rate: 0,
  cost_category_id: null,
  cost_center_id: null,
  cost_object_id: null,
  cost_behavior: null,
  traceability: null,
});

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("duplicate key") || message.includes("chống trùng") || message.includes("idempotency")) return "Giao dịch này đã được gửi trước đó. Danh sách sẽ được đồng bộ lại.";
  if (message.includes("permission") || message.includes("quyền")) return "Bạn không có quyền thực hiện thao tác này.";
  if (message.includes("inactive") || message.includes("ngừng hoạt động") || message.includes("không hoạt động")) return "Dữ liệu phân loại đã ngừng hoạt động. Hãy chọn mục đang sử dụng.";
  if (message.includes("invalid input syntax")) return "Dữ liệu nhập chưa đúng định dạng.";
  return message.replace(/^.*?:\s*/, "") || "Không thể hoàn tất thao tác.";
}

function displayName(firstName: string | null, lastName: string | null, fallback: string) {
  return [firstName, lastName].filter(Boolean).join(" ") || fallback;
}

export default function CostManagementPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [centerOpen, setCenterOpen] = useState(false);
  const [objectOpen, setObjectOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [transactionTypeId, setTransactionTypeId] = useState("");
  const [transactionDate, setTransactionDate] = useState(today());
  const [description, setDescription] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(crypto.randomUUID());
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [categoryEditingId, setCategoryEditingId] = useState<string | null>(null);
  const [centerEditingId, setCenterEditingId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState({ code: "", name: "", description: "", parentId: "none", behavior: "VARIABLE" as CostBehavior, traceability: "INDIRECT" as Traceability });
  const [centerForm, setCenterForm] = useState({ code: "", name: "", centerType: "SERVICE", parentId: "none" });
  const [objectForm, setObjectForm] = useState({ type: "OTHER", code: "", name: "" });
  const [filters, setFilters] = useState({ search: "", from: "", to: "", type: "all", status: "all", center: "all", creator: "all" });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);
  const { role, loading: roleLoading } = useUserRole(user);
  const { hasPermission, loading: permissionLoading } = useEmployeePermissions(user, role);
  const canTransactions = hasPermission("cost_transactions");
  const canConfirm = hasPermission("cost_transaction_confirm");
  const canVoid = hasPermission("cost_transaction_void");
  const canCategories = hasPermission("cost_categories");
  const canCenters = hasPermission("cost_centers");
  const canObjects = hasPermission("cost_objects");
  const canTypes = hasPermission("transaction_types");
  const canAudit = hasPermission("cost_audit");
  const hasAnyAccess = canTransactions || canCategories || canCenters || canObjects || canTypes || canAudit;

  useEffect(() => {
    if (!user || roleLoading || permissionLoading || !role) return;
    if (!hasAnyAccess) navigate("/dashboard", { replace: true });
  }, [hasAnyAccess, navigate, permissionLoading, role, roleLoading, user]);

  const transactionsQuery = useQuery({ queryKey: ["business-transactions"], queryFn: listBusinessTransactions, enabled: canTransactions });
  const categoriesQuery = useQuery({ queryKey: ["cost-categories"], queryFn: listCostCategories, enabled: canTransactions || canCategories });
  const centersQuery = useQuery({ queryKey: ["cost-centers"], queryFn: listCostCenters, enabled: canTransactions || canCenters });
  const objectsQuery = useQuery({ queryKey: ["cost-objects"], queryFn: listCostObjects, enabled: canTransactions || canObjects });
  const typesQuery = useQuery({ queryKey: ["transaction-types"], queryFn: listTransactionTypes, enabled: canTransactions || canTypes });
  const usersQuery = useQuery({ queryKey: ["cost-users"], queryFn: listCostUsers, enabled: canTransactions || canAudit, retry: false });
  const auditQuery = useQuery({ queryKey: ["cost-audit"], queryFn: listCostAuditEvents, enabled: canAudit });

  const typeMap = useMemo(() => new Map((typesQuery.data ?? []).map((item) => [item.id, item])), [typesQuery.data]);
  const centerMap = useMemo(() => new Map((centersQuery.data ?? []).map((item) => [item.id, item])), [centersQuery.data]);
  const userMap = useMemo(() => new Map((usersQuery.data ?? []).map((item) => [item.user_id, displayName(item.first_name, item.last_name, item.email)])), [usersQuery.data]);
  const selectedType = typeMap.get(transactionTypeId);
  const totals = useMemo(() => lines.reduce((result, line) => {
    const subtotal = Math.round(Number(line.quantity || 0) * Number(line.unit_price || 0) * 100) / 100;
    const vat = Math.round(subtotal * Number(line.vat_rate || 0) / 100 * 100) / 100;
    return { subtotal: result.subtotal + subtotal, vat: result.vat + vat, total: result.total + subtotal + vat };
  }, { subtotal: 0, vat: 0, total: 0 }), [lines]);
  const filteredTransactions = useMemo(() => {
    const search = filters.search.trim().toLocaleLowerCase("vi");
    return (transactionsQuery.data ?? []).filter((item) => {
      if (search && !item.transaction_number.toLocaleLowerCase("vi").includes(search) && !item.description.toLocaleLowerCase("vi").includes(search)) return false;
      if (filters.from && item.transaction_date < filters.from) return false;
      if (filters.to && item.transaction_date > filters.to) return false;
      if (filters.type !== "all" && item.transaction_type_id !== filters.type) return false;
      if (filters.status !== "all" && item.status !== filters.status) return false;
      if (filters.center !== "all" && !item.cost_center_ids.includes(filters.center)) return false;
      if (filters.creator !== "all" && item.created_by !== filters.creator) return false;
      return true;
    });
  }, [filters, transactionsQuery.data]);

  const refreshTransactions = () => queryClient.invalidateQueries({ queryKey: ["business-transactions"] });
  const createMutation = useMutation({
    mutationFn: () => createBusinessTransaction({
      transaction_type_id: transactionTypeId,
      transaction_date: transactionDate,
      description: description.trim(),
      idempotency_key: idempotencyKey,
      counterparty_type: selectedType?.requires_counterparty ? "OTHER" : undefined,
      counterparty_name: counterpartyName.trim() || undefined,
      external_reference: externalReference.trim() || undefined,
      lines: lines.map(({ key: _key, ...line }) => line),
    }),
    onSuccess: (result) => {
      toast.success(result.reused ? "Giao dịch đã tồn tại, danh sách đã được đồng bộ." : `Đã tạo ${result.transaction_number}.`);
      setCreateOpen(false);
      resetTransactionForm();
      void refreshTransactions();
    },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const confirmMutation = useMutation({ mutationFn: confirmBusinessTransaction, onSuccess: () => { toast.success("Đã xác nhận giao dịch."); void refreshTransactions(); void queryClient.invalidateQueries({ queryKey: ["cost-audit"] }); }, onError: (error) => toast.error(friendlyError(error)) });
  const voidMutation = useMutation({
    mutationFn: () => voidBusinessTransaction(voidTarget!, voidReason),
    onSuccess: () => { toast.success("Đã hủy giao dịch và lưu lý do."); setVoidTarget(null); setVoidReason(""); void refreshTransactions(); void queryClient.invalidateQueries({ queryKey: ["cost-audit"] }); },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const categoryMutation = useMutation({
    mutationFn: () => categoryEditingId
      ? updateCostCategory(categoryEditingId, { name: categoryForm.name.trim(), description: categoryForm.description.trim() || null, parent_id: categoryForm.parentId === "none" ? null : categoryForm.parentId, default_behavior: categoryForm.behavior, default_traceability: categoryForm.traceability })
      : createCostCategory({ code: categoryForm.code.trim().toUpperCase(), name: categoryForm.name.trim(), description: categoryForm.description.trim() || null, parent_id: categoryForm.parentId === "none" ? null : categoryForm.parentId, default_behavior: categoryForm.behavior, default_traceability: categoryForm.traceability }),
    onSuccess: () => { toast.success(categoryEditingId ? "Đã cập nhật danh mục chi phí." : "Đã tạo danh mục chi phí."); closeCategoryDialog(); void queryClient.invalidateQueries({ queryKey: ["cost-categories"] }); },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const centerMutation = useMutation({
    mutationFn: () => centerEditingId
      ? updateCostCenter(centerEditingId, { name: centerForm.name.trim(), center_type: centerForm.centerType, parent_id: centerForm.parentId === "none" ? null : centerForm.parentId })
      : createCostCenter({ code: centerForm.code.trim().toUpperCase(), name: centerForm.name.trim(), center_type: centerForm.centerType, parent_id: centerForm.parentId === "none" ? null : centerForm.parentId }),
    onSuccess: () => { toast.success(centerEditingId ? "Đã cập nhật trung tâm chi phí." : "Đã tạo trung tâm chi phí."); closeCenterDialog(); void queryClient.invalidateQueries({ queryKey: ["cost-centers"] }); },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const objectMutation = useMutation({
    mutationFn: () => createCostObject({ object_type: objectForm.type, display_code: objectForm.code.trim().toUpperCase(), display_name: objectForm.name.trim() || null }),
    onSuccess: () => { toast.success("Đã tạo đối tượng chi phí."); setObjectOpen(false); setObjectForm({ type: "OTHER", code: "", name: "" }); void queryClient.invalidateQueries({ queryKey: ["cost-objects"] }); },
    onError: (error) => toast.error(friendlyError(error)),
  });

  function resetTransactionForm() {
    setTransactionTypeId(""); setTransactionDate(today()); setDescription(""); setCounterpartyName(""); setExternalReference(""); setLines([newLine()]); setIdempotencyKey(crypto.randomUUID());
  }
  function closeCategoryDialog() {
    setCategoryOpen(false); setCategoryEditingId(null); setCategoryForm({ code: "", name: "", description: "", parentId: "none", behavior: "VARIABLE", traceability: "INDIRECT" });
  }
  function closeCenterDialog() {
    setCenterOpen(false); setCenterEditingId(null); setCenterForm({ code: "", name: "", centerType: "SERVICE", parentId: "none" });
  }
  function editCategory(item: CostCategory) {
    setCategoryEditingId(item.id); setCategoryForm({ code: item.code, name: item.name, description: item.description ?? "", parentId: item.parent_id ?? "none", behavior: item.default_behavior, traceability: item.default_traceability }); setCategoryOpen(true);
  }
  function editCenter(item: CostCenter) {
    setCenterEditingId(item.id); setCenterForm({ code: item.code, name: item.name, centerType: item.center_type, parentId: item.parent_id ?? "none" }); setCenterOpen(true);
  }
  async function toggleActive(table: "cost_categories" | "cost_centers" | "cost_objects", id: string, active: boolean) {
    try {
      await setMasterActive(table, id, active);
      toast.success(active ? "Đã kích hoạt lại." : "Đã ngừng sử dụng.");
      const queryKey = table === "cost_categories" ? "cost-categories" : table === "cost_centers" ? "cost-centers" : "cost-objects";
      await queryClient.invalidateQueries({ queryKey: [queryKey] });
    } catch (error) { toast.error(friendlyError(error)); }
  }
  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }
  function applyTypeDefaults(id: string) {
    setTransactionTypeId(id);
    const type = typeMap.get(id);
    if (!type) return;
    setLines((current) => current.map((line) => ({ ...line, cost_category_id: line.cost_category_id || type.default_cost_category_id, cost_center_id: line.cost_center_id || type.default_cost_center_id, cost_behavior: line.cost_behavior || type.default_cost_behavior, traceability: line.traceability || type.default_traceability })));
  }
  function centerDepth(item: CostCenter) {
    let depth = 0;
    let parentId = item.parent_id;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) { visited.add(parentId); depth += 1; parentId = centerMap.get(parentId)?.parent_id ?? null; }
    return depth;
  }

  const validDraft = Boolean(transactionTypeId)
    && description.trim().length >= 3
    && (!selectedType?.requires_counterparty || counterpartyName.trim().length >= 2)
    && lines.length > 0
    && lines.every((line) => line.description.trim() && line.unit.trim() && Number(line.quantity) >= 0 && Number(line.unit_price) >= 0 && Number(line.vat_rate) >= 0 && Number(line.vat_rate) <= 100 && (!selectedType?.requires_cost_center || Boolean(line.cost_center_id)) && (!selectedType?.requires_cost_object || Boolean(line.cost_object_id)));

  if (roleLoading || permissionLoading) return <div className="py-16 text-center text-muted-foreground">Đang kiểm tra quyền truy cập...</div>;
  const defaultTab = canTransactions ? "transactions" : canCategories ? "categories" : canCenters ? "centers" : canObjects ? "objects" : canTypes ? "types" : "audit";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-semibold">Chi phí & Giá thành</h1><p className="text-sm text-muted-foreground">Giao dịch nghiệp vụ mới được tách biệt với dữ liệu tài chính cũ.</p></div>
        {canTransactions && <Button onClick={() => { resetTransactionForm(); setCreateOpen(true); }}><Plus className="mr-2 h-4 w-4" />Tạo giao dịch</Button>}
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          {canTransactions && <TabsTrigger value="transactions"><CircleDollarSign className="mr-2 h-4 w-4" />Giao dịch</TabsTrigger>}
          {canCategories && <TabsTrigger value="categories"><FolderTree className="mr-2 h-4 w-4" />Danh mục</TabsTrigger>}
          {canCenters && <TabsTrigger value="centers"><Landmark className="mr-2 h-4 w-4" />Trung tâm</TabsTrigger>}
          {canObjects && <TabsTrigger value="objects"><Target className="mr-2 h-4 w-4" />Đối tượng</TabsTrigger>}
          {canTypes && <TabsTrigger value="types"><Settings2 className="mr-2 h-4 w-4" />Loại nghiệp vụ</TabsTrigger>}
          {canAudit && <TabsTrigger value="audit"><History className="mr-2 h-4 w-4" />Lịch sử</TabsTrigger>}
        </TabsList>

        {canTransactions && <TabsContent value="transactions" className="space-y-3">
          <div className="grid gap-3 border bg-card p-3 sm:grid-cols-2 xl:grid-cols-7">
            <div className="relative sm:col-span-2 xl:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Tìm mã hoặc nội dung" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} /></div>
            <Input type="date" aria-label="Từ ngày" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
            <Input type="date" aria-label="Đến ngày" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
            <FilterSelect value={filters.type} onChange={(value) => setFilters((current) => ({ ...current, type: value }))} placeholder="Loại nghiệp vụ" items={(typesQuery.data ?? []).map((item) => ({ value: item.id, label: item.name }))} />
            <FilterSelect value={filters.status} onChange={(value) => setFilters((current) => ({ ...current, status: value }))} placeholder="Trạng thái" items={[{ value: "DRAFT", label: "Nháp" }, { value: "CONFIRMED", label: "Đã xác nhận" }, { value: "VOIDED", label: "Đã hủy" }]} />
            <FilterSelect value={filters.center} onChange={(value) => setFilters((current) => ({ ...current, center: value }))} placeholder="Trung tâm" items={(centersQuery.data ?? []).map((item) => ({ value: item.id, label: item.name }))} />
            <FilterSelect value={filters.creator} onChange={(value) => setFilters((current) => ({ ...current, creator: value }))} placeholder="Người tạo" items={(usersQuery.data ?? []).map((item) => ({ value: item.user_id, label: displayName(item.first_name, item.last_name, item.email) }))} />
          </div>
          <div className="overflow-x-auto border bg-card"><Table>
            <TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Ngày</TableHead><TableHead>Loại nghiệp vụ</TableHead><TableHead>Nội dung</TableHead><TableHead>Trung tâm</TableHead><TableHead>Người tạo</TableHead><TableHead className="text-right">Tổng tiền</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
            <TableBody>
              {transactionsQuery.isLoading && <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Đang tải giao dịch...</TableCell></TableRow>}
              {transactionsQuery.isError && <TableRow><TableCell colSpan={9} className="py-10 text-center text-destructive">Chưa thể tải giao dịch. Migration mới chưa được áp dụng cho môi trường này.</TableCell></TableRow>}
              {filteredTransactions.map((item) => <TableRow key={item.id}>
                <TableCell className="font-mono text-xs font-medium">{item.transaction_number}</TableCell>
                <TableCell>{new Date(`${item.transaction_date}T00:00:00`).toLocaleDateString("vi-VN")}</TableCell>
                <TableCell>{typeMap.get(item.transaction_type_id)?.name ?? "-"}</TableCell>
                <TableCell className="max-w-[280px] truncate">{item.description}</TableCell>
                <TableCell className="max-w-[180px] text-xs">{item.cost_center_ids.map((id) => centerMap.get(id)?.name).filter(Boolean).join(", ") || "-"}</TableCell>
                <TableCell className="text-xs">{item.created_by ? userMap.get(item.created_by) ?? item.created_by.slice(0, 8) : "Hệ thống"}</TableCell>
                <TableCell className="text-right font-medium">{money.format(item.total_amount)}</TableCell>
                <TableCell><StatusBadge status={item.status} /></TableCell>
                <TableCell><div className="flex justify-end gap-2">{item.status === "DRAFT" && canConfirm && <Button size="sm" variant="outline" onClick={() => confirmMutation.mutate(item.id)} disabled={confirmMutation.isPending}><ShieldCheck className="mr-1 h-4 w-4" />Xác nhận</Button>}{item.status === "CONFIRMED" && canVoid && <Button size="sm" variant="outline" onClick={() => setVoidTarget(item.id)}>Hủy</Button>}</div></TableCell>
              </TableRow>)}
              {!transactionsQuery.isLoading && filteredTransactions.length === 0 && <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Không có giao dịch phù hợp bộ lọc.</TableCell></TableRow>}
            </TableBody>
          </Table></div>
        </TabsContent>}

        {canCategories && <TabsContent value="categories" className="space-y-3">
          <div className="flex justify-end"><Button variant="outline" onClick={() => setCategoryOpen(true)}><Plus className="mr-2 h-4 w-4" />Thêm danh mục</Button></div>
          <div className="overflow-x-auto border bg-card"><Table><TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Tên</TableHead><TableHead>Hành vi</TableHead><TableHead>Truy xuất</TableHead><TableHead className="text-right">Quản lý</TableHead></TableRow></TableHeader><TableBody>
            {(categoriesQuery.data ?? []).slice().sort((a, b) => a.level - b.level || a.code.localeCompare(b.code)).map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{item.code}</TableCell><TableCell><div className="font-medium" style={{ paddingLeft: `${item.level * 18}px` }}>{item.name}</div><div className="text-xs text-muted-foreground" style={{ paddingLeft: `${item.level * 18}px` }}>{item.description}</div></TableCell><TableCell>{item.default_behavior}</TableCell><TableCell>{item.default_traceability}</TableCell><TableCell><div className="flex items-center justify-end gap-3"><Button size="icon" variant="ghost" onClick={() => editCategory(item)} aria-label={`Sửa ${item.name}`}><Pencil className="h-4 w-4" /></Button><Switch checked={item.is_active} onCheckedChange={(checked) => void toggleActive("cost_categories", item.id, checked)} /></div></TableCell></TableRow>)}
          </TableBody></Table></div>
        </TabsContent>}

        {canCenters && <TabsContent value="centers" className="space-y-3">
          <div className="flex justify-end"><Button variant="outline" onClick={() => setCenterOpen(true)}><Plus className="mr-2 h-4 w-4" />Thêm trung tâm</Button></div>
          <div className="overflow-x-auto border bg-card"><Table><TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Cây trung tâm</TableHead><TableHead>Nhóm</TableHead><TableHead className="text-right">Quản lý</TableHead></TableRow></TableHeader><TableBody>
            {(centersQuery.data ?? []).slice().sort((a, b) => centerDepth(a) - centerDepth(b) || a.code.localeCompare(b.code)).map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{item.code}</TableCell><TableCell className="font-medium" style={{ paddingLeft: `${12 + centerDepth(item) * 20}px` }}>{item.name}</TableCell><TableCell>{item.center_type}</TableCell><TableCell><div className="flex items-center justify-end gap-3"><Button size="icon" variant="ghost" onClick={() => editCenter(item)} aria-label={`Sửa ${item.name}`}><Pencil className="h-4 w-4" /></Button><Switch checked={item.is_active} onCheckedChange={(checked) => void toggleActive("cost_centers", item.id, checked)} /></div></TableCell></TableRow>)}
          </TableBody></Table></div>
        </TabsContent>}

        {canObjects && <TabsContent value="objects" className="space-y-3">
          <div className="flex justify-end"><Button variant="outline" onClick={() => setObjectOpen(true)}><Plus className="mr-2 h-4 w-4" />Thêm đối tượng</Button></div>
          <div className="overflow-x-auto border bg-card"><Table><TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Tên</TableHead><TableHead>Loại</TableHead><TableHead>Nguồn</TableHead><TableHead className="text-right">Hoạt động</TableHead></TableRow></TableHeader><TableBody>
            {(objectsQuery.data ?? []).map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{item.display_code}</TableCell><TableCell className="font-medium">{item.display_name ?? "-"}</TableCell><TableCell>{item.object_type}</TableCell><TableCell className="text-xs text-muted-foreground">{item.source_id ? "Liên kết dữ liệu CRM" : "Tạo thủ công"}</TableCell><TableCell><div className="flex justify-end"><Switch checked={item.is_active} onCheckedChange={(checked) => void toggleActive("cost_objects", item.id, checked)} /></div></TableCell></TableRow>)}
            {objectsQuery.data?.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Chưa có đối tượng chi phí. Không cần tạo trùng toàn bộ sản phẩm hoặc đơn hàng.</TableCell></TableRow>}
          </TableBody></Table></div>
        </TabsContent>}

        {canTypes && <TabsContent value="types"><div className="overflow-x-auto border bg-card"><Table><TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Nghiệp vụ</TableHead><TableHead>Trung tâm</TableHead><TableHead>Đối tượng</TableHead><TableHead>Trạng thái</TableHead></TableRow></TableHeader><TableBody>
          {typesQuery.data?.map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{item.code}</TableCell><TableCell><div className="font-medium">{item.name}</div><div className="text-xs text-muted-foreground">{item.description}</div></TableCell><TableCell>{item.requires_cost_center ? "Bắt buộc" : "Không bắt buộc"}</TableCell><TableCell>{item.requires_cost_object ? "Bắt buộc" : "Không bắt buộc"}</TableCell><TableCell><Badge variant={item.is_active ? "outline" : "secondary"}>{item.is_active ? "Đang dùng" : "Ngừng dùng"}</Badge></TableCell></TableRow>)}
        </TableBody></Table></div></TabsContent>}

        {canAudit && <TabsContent value="audit"><div className="overflow-x-auto border bg-card"><Table><TableHeader><TableRow><TableHead>Thời điểm</TableHead><TableHead>Đối tượng</TableHead><TableHead>Hành động</TableHead><TableHead>Người thực hiện</TableHead><TableHead>Lý do</TableHead></TableRow></TableHeader><TableBody>
          {auditQuery.data?.map((item) => <TableRow key={item.id}><TableCell>{new Date(item.created_at).toLocaleString("vi-VN")}</TableCell><TableCell><div>{item.entity_type}</div><div className="font-mono text-xs text-muted-foreground">{item.entity_id.slice(0, 8)}</div></TableCell><TableCell><Badge variant="outline">{item.action}</Badge></TableCell><TableCell>{item.actor_id ? userMap.get(item.actor_id) ?? item.actor_id.slice(0, 8) : "Hệ thống"}</TableCell><TableCell>{item.reason ?? "-"}</TableCell></TableRow>)}
          {auditQuery.data?.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Chưa có lịch sử thay đổi.</TableCell></TableRow>}
        </TableBody></Table></div></TabsContent>}
      </Tabs>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetTransactionForm(); }}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Tạo giao dịch nghiệp vụ</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Bạn đang làm gì?</Label><Select value={transactionTypeId} onValueChange={applyTypeDefaults}><SelectTrigger><SelectValue placeholder="Chọn loại nghiệp vụ" /></SelectTrigger><SelectContent>{typesQuery.data?.filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Ngày</Label><Input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></div></div>
        <div className="space-y-2"><Label>Nội dung</Label><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mô tả ngắn gọn nghiệp vụ" /></div>
        <div className="grid gap-4 sm:grid-cols-2">{selectedType?.requires_counterparty && <div className="space-y-2"><Label>Đối tượng nhận / trả</Label><Input value={counterpartyName} onChange={(event) => setCounterpartyName(event.target.value)} placeholder="Tên nhà cung cấp, khách hàng hoặc người nhận" /></div>}<div className="space-y-2"><Label>Số chứng từ tham chiếu</Label><Input value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="Không bắt buộc" /></div></div>
        <div className="space-y-3"><div className="flex items-center justify-between"><Label>Chi tiết</Label><Button type="button" size="sm" variant="outline" onClick={() => setLines((current) => [...current, newLine()])}><Plus className="mr-1 h-4 w-4" />Thêm dòng</Button></div>
          {lines.map((line, index) => <div key={line.key} className="grid gap-3 border p-3 sm:grid-cols-12">
            <div className="space-y-1 sm:col-span-4"><Label>Nội dung dòng {index + 1}</Label><Input value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} /></div>
            <div className="space-y-1 sm:col-span-1"><Label>SL</Label><Input type="number" min="0" step="0.0001" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: Number(event.target.value) })} /></div>
            <div className="space-y-1 sm:col-span-1"><Label>ĐVT</Label><Input value={line.unit} onChange={(event) => updateLine(line.key, { unit: event.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Đơn giá</Label><Input type="number" min="0" value={line.unit_price} onChange={(event) => updateLine(line.key, { unit_price: Number(event.target.value) })} /></div>
            <div className="space-y-1 sm:col-span-1"><Label>VAT %</Label><Input type="number" min="0" max="100" value={line.vat_rate} onChange={(event) => updateLine(line.key, { vat_rate: Number(event.target.value) })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Dùng cho đâu?</Label><Select value={line.cost_center_id ?? "none"} onValueChange={(value) => updateLine(line.key, { cost_center_id: value === "none" ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Chưa chọn</SelectItem>{centersQuery.data?.filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex items-end justify-end sm:col-span-1"><Button type="button" size="icon" variant="ghost" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} aria-label={`Xóa dòng ${index + 1}`}><Trash2 className="h-4 w-4" /></Button></div>
            <div className="space-y-1 sm:col-span-4"><Label>Danh mục phía sau</Label><Select value={line.cost_category_id ?? "none"} onValueChange={(value) => updateLine(line.key, { cost_category_id: value === "none" ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Theo mặc định nghiệp vụ</SelectItem>{categoriesQuery.data?.filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1 sm:col-span-4"><Label>Liên quan đến đâu?</Label><Select value={line.cost_object_id ?? "none"} onValueChange={(value) => updateLine(line.key, { cost_object_id: value === "none" ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Chưa chọn</SelectItem>{objectsQuery.data?.filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{item.display_name || item.display_code}</SelectItem>)}</SelectContent></Select></div>
          </div>)}
        </div>
        <div className="flex flex-wrap justify-end gap-6 border-t pt-4 text-sm"><span>Trước VAT: <strong>{money.format(totals.subtotal)}</strong></span><span>VAT: <strong>{money.format(totals.vat)}</strong></span><span>Tổng: <strong>{money.format(totals.total)}</strong></span></div>
        <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Đóng</Button><Button disabled={!validDraft || createMutation.isPending} onClick={() => createMutation.mutate()}>{createMutation.isPending ? "Đang tạo..." : "Lưu nháp"}</Button></DialogFooter>
      </DialogContent></Dialog>

      <Dialog open={categoryOpen} onOpenChange={(open) => { if (!open) closeCategoryDialog(); else setCategoryOpen(true); }}><DialogContent><DialogHeader><DialogTitle>{categoryEditingId ? "Sửa danh mục chi phí" : "Thêm danh mục chi phí"}</DialogTitle></DialogHeader><div className="grid gap-4"><div className="space-y-2"><Label>Mã</Label><Input disabled={Boolean(categoryEditingId)} value={categoryForm.code} onChange={(event) => setCategoryForm((current) => ({ ...current, code: event.target.value }))} /></div><div className="space-y-2"><Label>Tên</Label><Input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} /></div><div className="space-y-2"><Label>Cấp cha</Label><Select value={categoryForm.parentId} onValueChange={(value) => setCategoryForm((current) => ({ ...current, parentId: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Không có</SelectItem>{categoriesQuery.data?.filter((item) => item.id !== categoryEditingId && item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Mô tả</Label><Textarea value={categoryForm.description} onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))} /></div><div className="grid grid-cols-2 gap-3"><Select value={categoryForm.behavior} onValueChange={(value: CostBehavior) => setCategoryForm((current) => ({ ...current, behavior: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIXED">Cố định</SelectItem><SelectItem value="VARIABLE">Biến đổi</SelectItem><SelectItem value="MIXED">Hỗn hợp</SelectItem></SelectContent></Select><Select value={categoryForm.traceability} onValueChange={(value: Traceability) => setCategoryForm((current) => ({ ...current, traceability: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DIRECT">Trực tiếp</SelectItem><SelectItem value="INDIRECT">Gián tiếp</SelectItem><SelectItem value="SHARED">Dùng chung</SelectItem></SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={closeCategoryDialog}>Đóng</Button><Button disabled={!categoryForm.code.trim() || !categoryForm.name.trim() || categoryMutation.isPending} onClick={() => categoryMutation.mutate()}>{categoryEditingId ? "Lưu" : "Tạo"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={centerOpen} onOpenChange={(open) => { if (!open) closeCenterDialog(); else setCenterOpen(true); }}><DialogContent><DialogHeader><DialogTitle>{centerEditingId ? "Sửa trung tâm chi phí" : "Thêm trung tâm chi phí"}</DialogTitle></DialogHeader><div className="grid gap-4"><div className="space-y-2"><Label>Mã</Label><Input disabled={Boolean(centerEditingId)} value={centerForm.code} onChange={(event) => setCenterForm((current) => ({ ...current, code: event.target.value }))} /></div><div className="space-y-2"><Label>Tên</Label><Input value={centerForm.name} onChange={(event) => setCenterForm((current) => ({ ...current, name: event.target.value }))} /></div><div className="space-y-2"><Label>Nhóm</Label><Select value={centerForm.centerType} onValueChange={(value) => setCenterForm((current) => ({ ...current, centerType: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PRODUCTION">Sản xuất</SelectItem><SelectItem value="SERVICE">Dịch vụ</SelectItem><SelectItem value="SALES">Kinh doanh</SelectItem><SelectItem value="ADMIN">Quản lý</SelectItem><SelectItem value="OTHER">Khác</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Cấp cha</Label><Select value={centerForm.parentId} onValueChange={(value) => setCenterForm((current) => ({ ...current, parentId: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Không có</SelectItem>{centersQuery.data?.filter((item) => item.id !== centerEditingId && item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={closeCenterDialog}>Đóng</Button><Button disabled={!centerForm.code.trim() || !centerForm.name.trim() || centerMutation.isPending} onClick={() => centerMutation.mutate()}>{centerEditingId ? "Lưu" : "Tạo"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={objectOpen} onOpenChange={setObjectOpen}><DialogContent><DialogHeader><DialogTitle>Thêm đối tượng chi phí</DialogTitle></DialogHeader><div className="grid gap-4"><div className="space-y-2"><Label>Loại</Label><Select value={objectForm.type} onValueChange={(value) => setObjectForm((current) => ({ ...current, type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["PRODUCT", "ORDER", "CUSTOMER", "COST_CENTER", "PRODUCTION_ORDER", "MARKETING_CAMPAIGN", "OTHER"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Mã</Label><Input value={objectForm.code} onChange={(event) => setObjectForm((current) => ({ ...current, code: event.target.value }))} /></div><div className="space-y-2"><Label>Tên hiển thị</Label><Input value={objectForm.name} onChange={(event) => setObjectForm((current) => ({ ...current, name: event.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setObjectOpen(false)}>Đóng</Button><Button disabled={!objectForm.code.trim() || objectMutation.isPending} onClick={() => objectMutation.mutate()}>Tạo</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(voidTarget)} onOpenChange={(open) => { if (!open) { setVoidTarget(null); setVoidReason(""); } }}><DialogContent><DialogHeader><DialogTitle>Hủy giao dịch đã xác nhận</DialogTitle></DialogHeader><div className="space-y-2"><Label>Lý do bắt buộc</Label><Textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Nêu rõ lý do hủy" /></div><DialogFooter><Button variant="outline" onClick={() => setVoidTarget(null)}>Đóng</Button><Button variant="destructive" disabled={voidReason.trim().length < 3 || voidMutation.isPending} onClick={() => voidMutation.mutate()}>Xác nhận hủy</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, items }: { value: string; onChange: (value: string) => void; placeholder: string; items: Array<{ value: string; label: string }> }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent><SelectItem value="all">{placeholder}</SelectItem>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>;
}

function StatusBadge({ status }: { status: "DRAFT" | "CONFIRMED" | "VOIDED" }) {
  return <Badge variant={status === "CONFIRMED" ? "default" : status === "VOIDED" ? "destructive" : "secondary"}>{status === "DRAFT" ? "Nháp" : status === "CONFIRMED" ? "Đã xác nhận" : "Đã hủy"}</Badge>;
}
