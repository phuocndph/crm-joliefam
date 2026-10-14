import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, ArrowRight, Boxes, CalendarCheck, CircleDollarSign, FileSignature,
  FileText, Package, ReceiptText, RefreshCw, ShoppingCart, TrendingUp, UsersRound,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { localApi, type LocalDashboardStats, type LocalSyncRun } from "@/lib/local-api";

const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
const money = (value: number) => `${Math.round(value).toLocaleString("vi-VN")} đ`;

const emptyStats: LocalDashboardStats = {
  totalRevenue: 0, totalOrders: 0, totalCustomers: 0, totalQuotes: 0, totalProducts: 0,
  pendingOrders: 0, approvedQuotes: 0, monthlyRevenue: 0, previousMonthRevenue: 0,
  monthlyOrders: 0, monthlyCustomers: 0, totalContracts: 0, monthlyExpenses: 0,
  activeWorkers: 0, attendanceEntries: 0, productionQuantity: 0, inventoryValue: 0, payrollRuns: 0,
};

type RecentEntry = {
  id: string;
  worker_name: string;
  product_name: string;
  quantity: number;
  calculated_amount: number;
  workflow_status: string;
};

type RecentOrder = {
  id: string;
  order_number: string;
  customer_name: string;
  total_amount: number;
  status: string;
};

const statusLabel = (status: string) => ({
  pending: "Chờ xử lý", processing: "Đang xử lý", delivered: "Đã giao",
  self_delivered: "Đã giao", cancelled: "Đã hủy", approved: "Đã duyệt",
}[status] || status);

const workflowStatusLabels: Record<string, string> = {
  DRAFT: "Nháp", SUBMITTED: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Từ chối",
  LOCKED: "Đã khóa", REVERSED: "Đã đảo",
};
const workflowStatusLabel = (status: string) => workflowStatusLabels[status] ?? workflowStatusLabels[status.toUpperCase()] ?? status;

const LocalDashboardPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<LocalDashboardStats>(emptyStats);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [lastSync, setLastSync] = useState<LocalSyncRun | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboard, production, orders, syncRuns] = await Promise.all([
        localApi.dashboardStats(),
        localApi.productionEntries(monthStart, true),
        localApi.orders({ limit: 5 }),
        localApi.syncRuns(),
      ]);
      setStats(dashboard);
      setRecentEntries(production.slice(0, 5).map((row) => ({
        id: row.id,
        worker_name: row.worker_name,
        product_name: row.product_name,
        quantity: Number(row.quantity || 0),
        calculated_amount: Number(row.calculated_amount || 0),
        workflow_status: row.workflow_status,
      })));
      setRecentOrders(orders.slice(0, 5).map((row) => ({
        id: String(row.id),
        order_number: String(row.display_order_number || row.order_number || "Chưa có mã"),
        customer_name: String(row.customer_name || "Khách lẻ"),
        total_amount: Number(row.total_amount || 0),
        status: String(row.status || "pending"),
      })));
      setLastSync(syncRuns[0] || null);
    } catch (error) {
      toast({ title: "Không thể tải trang tổng quan cục bộ", description: error instanceof Error ? error.message : "Dịch vụ API cục bộ không phản hồi", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const runSync = async () => {
    setSyncing(true);
    try {
      await localApi.startSync();
      toast({ title: "Đã bắt đầu đồng bộ", description: "Dữ liệu Supabase đang được cập nhật vào PostgreSQL local." });
      await load();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const runs = await localApi.syncRuns();
        const latest = runs[0] || null;
        setLastSync(latest);
        if (!latest || latest.status === "RUNNING") continue;
        toast({
          title: latest.status === "COMPLETED" ? "Đồng bộ hoàn tất" : "Đồng bộ cần kiểm tra",
          description: latest.status === "COMPLETED" ? "Dữ liệu local đã được cập nhật." : `Có ${latest.error_count || 0} bảng lỗi; mở lịch sử đồng bộ để xem chi tiết.`,
          variant: latest.status === "COMPLETED" ? undefined : "destructive",
        });
        break;
      }
    } catch (error) {
      toast({ title: "Không thể bắt đầu đồng bộ", description: error instanceof Error ? error.message : "Dịch vụ API cục bộ không phản hồi", variant: "destructive" });
    } finally { setSyncing(false); }
  };

  const syncBusy = syncing || lastSync?.status === "RUNNING";

  const crmCards = [
    { title: "Doanh thu đã giao", value: money(stats.totalRevenue), detail: `${money(stats.monthlyRevenue)} trong tháng`, icon: TrendingUp, href: "/transactions", color: "text-emerald-700", bg: "bg-emerald-50" },
    { title: "Đơn hàng", value: stats.totalOrders.toLocaleString("vi-VN"), detail: `${stats.pendingOrders} đơn chờ xử lý`, icon: ShoppingCart, href: "/orders", color: "text-sky-700", bg: "bg-sky-50" },
    { title: "Khách hàng", value: stats.totalCustomers.toLocaleString("vi-VN"), detail: `+${stats.monthlyCustomers} trong tháng`, icon: UsersRound, href: "/customers", color: "text-amber-700", bg: "bg-amber-50" },
    { title: "Báo giá", value: stats.totalQuotes.toLocaleString("vi-VN"), detail: `${stats.approvedQuotes} đã duyệt`, icon: FileText, href: "/quotes", color: "text-rose-700", bg: "bg-rose-50" },
    { title: "Danh mục sản phẩm", value: stats.totalProducts.toLocaleString("vi-VN"), detail: "Sản phẩm đang hoạt động", icon: Package, href: "/products", color: "text-cyan-700", bg: "bg-cyan-50" },
    { title: "Hợp đồng", value: stats.totalContracts.toLocaleString("vi-VN"), detail: `Chi phí tháng ${money(stats.monthlyExpenses)}`, icon: FileSignature, href: "/contracts", color: "text-orange-700", bg: "bg-orange-50" },
  ];

  const operationCards = [
    { title: "Nhân sự hoạt động", value: stats.activeWorkers.toLocaleString("vi-VN"), icon: UsersRound, href: "/payroll-settings?tab=workers" },
    { title: "Chấm công tháng", value: stats.attendanceEntries.toLocaleString("vi-VN"), icon: CalendarCheck, href: "/production-attendance" },
    { title: "Sản lượng tháng", value: `${stats.productionQuantity.toLocaleString("vi-VN")} SP`, icon: Activity, href: "/production-attendance-legacy?tab=PRODUCT_OUTPUT" },
    { title: "Giá trị tồn kho", value: money(stats.inventoryValue), icon: Boxes, href: "/inventory-management" },
    { title: "Kỳ lương cục bộ", value: stats.payrollRuns.toLocaleString("vi-VN"), icon: CircleDollarSign, href: "/payroll-settings?tab=runs" },
  ];

  const go = (href: string) => navigate(href);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Tổng quan CRM</h1>
            <Badge className="border-emerald-400/30 bg-emerald-400/15 text-emerald-100" variant="outline">POSTGRESQL CỤC BỘ</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">Khách hàng, báo giá, đơn hàng, tài chính, kho, sản xuất, chấm công và lương đều đọc từ cơ sở dữ liệu cục bộ. Không phát sinh thao tác ghi lên Supabase công khai.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => void load()} disabled={loading || Boolean(syncBusy)}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Tải lại dữ liệu</Button>
            <Button variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100" onClick={() => void runSync()} disabled={Boolean(syncBusy)}><RefreshCw className={`mr-2 h-4 w-4 ${syncBusy ? "animate-spin" : ""}`} />{syncBusy ? "Đang đồng bộ..." : "Đồng bộ ngay"}</Button>
          </div>
          <span className="text-xs text-slate-300">Đồng bộ gần nhất: {lastSync?.completed_at ? new Date(lastSync.completed_at).toLocaleString("vi-VN") : "Chưa có lần đồng bộ"}{lastSync?.status && ` · ${lastSync.status === "COMPLETED" ? "Thành công" : lastSync.status === "COMPLETED_WITH_ERRORS" ? "Có lỗi cần xem" : lastSync.status === "RUNNING" ? "Đang chạy" : lastSync.status}`}</span>
        </div>
      </div>

      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold">Kinh doanh & khách hàng</h2><p className="text-sm text-muted-foreground">Số liệu tổng hợp từ toàn bộ mô-đun CRM cục bộ.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {crmCards.map((card) => (
            <Card key={card.title} role="button" tabIndex={0} className="cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md" onClick={() => go(card.href)} onKeyDown={(event) => { if (event.key === "Enter") go(card.href); }}>
              <CardContent className="p-5">
                <div className={`mb-4 inline-flex rounded-xl p-2.5 ${card.bg}`}><card.icon className={`h-5 w-5 ${card.color}`} /></div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="mt-1 text-2xl font-bold">{loading ? "..." : card.value}</p>
                <p className="mt-2 text-xs text-muted-foreground">{card.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold">Vận hành xưởng</h2><p className="text-sm text-muted-foreground">Theo dõi nhân sự, sản lượng, tồn kho và kỳ lương trên cùng hệ thống.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {operationCards.map((card) => (
            <Button key={card.title} variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => go(card.href)}>
              <div className="rounded-lg bg-muted p-2"><card.icon className="h-5 w-5" /></div>
              <div><div className="text-xs font-normal text-muted-foreground">{card.title}</div><div className="mt-1 text-base font-semibold">{loading ? "..." : card.value}</div></div>
            </Button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Đơn hàng gần đây</CardTitle><CardDescription>Dữ liệu bán hàng mới nhất đã đồng bộ hoặc tạo trực tiếp ở hệ thống cục bộ.</CardDescription></CardHeader>
          <CardContent className="p-0">{loading ? <div className="p-8 text-center text-muted-foreground">Đang tải...</div> : recentOrders.length === 0 ? <div className="p-8 text-center text-muted-foreground">Chưa có đơn hàng.</div> : <div className="divide-y">{recentOrders.map((order) => <button key={order.id} type="button" className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted/50" onClick={() => go("/orders")}><div><p className="font-medium">{order.order_number}</p><p className="text-sm text-muted-foreground">{order.customer_name} · {money(order.total_amount)}</p></div><Badge variant={['delivered', 'self_delivered'].includes(order.status) ? "default" : "secondary"}>{statusLabel(order.status)}</Badge></button>)}</div>}</CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sản lượng gần đây</CardTitle><CardDescription>Những bản ghi sản xuất mới nhất trong tháng hiện tại.</CardDescription></CardHeader>
          <CardContent className="p-0">{loading ? <div className="p-8 text-center text-muted-foreground">Đang tải...</div> : recentEntries.length === 0 ? <div className="p-8 text-center text-muted-foreground">Chưa có dữ liệu sản lượng.</div> : <div className="divide-y">{recentEntries.map((entry) => <button key={entry.id} type="button" className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted/50" onClick={() => go("/production-attendance-legacy?tab=PRODUCT_OUTPUT")}><div><p className="font-medium">{entry.worker_name} · {entry.product_name}</p><p className="text-sm text-muted-foreground">{entry.quantity.toLocaleString("vi-VN")} sản phẩm · {money(entry.calculated_amount)}</p></div><Badge variant={entry.workflow_status === "APPROVED" ? "default" : "secondary"}>{workflowStatusLabel(entry.workflow_status)}</Badge></button>)}</div>}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Đi nhanh đến mô-đun</CardTitle><CardDescription>Toàn bộ giao diện được giữ nguyên; mỗi nút mở đúng phân hệ đang dùng máy chủ cục bộ.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Button variant="outline" className="justify-between" onClick={() => go("/customers")}>Khách hàng <ArrowRight className="h-4 w-4" /></Button>
          <Button variant="outline" className="justify-between" onClick={() => go("/quotes")}>Báo giá <ArrowRight className="h-4 w-4" /></Button>
          <Button variant="outline" className="justify-between" onClick={() => go("/orders")}>Đơn hàng <ArrowRight className="h-4 w-4" /></Button>
          <Button variant="outline" className="justify-between" onClick={() => go("/fabrics")}>Quản lý vải <ArrowRight className="h-4 w-4" /></Button>
          <Button variant="outline" className="justify-between" onClick={() => go("/contracts")}>Hợp đồng <FileSignature className="h-4 w-4" /></Button>
          <Button variant="outline" className="justify-between" onClick={() => go("/cash-flow")}>Chi phí <ReceiptText className="h-4 w-4" /></Button>
          <Button variant="outline" className="justify-between" onClick={() => go("/inventory-management")}>Kho vật tư <Boxes className="h-4 w-4" /></Button>
          <Button variant="outline" className="justify-between" onClick={() => go("/payroll-settings")}>Lương & nhân sự <CircleDollarSign className="h-4 w-4" /></Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default LocalDashboardPage;
