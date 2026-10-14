import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CreditCard, Eye, Mail, MapPin, Pencil, Phone, Plus, Search, UserRound, Users, X } from "lucide-react";
import { CreatePaymentForm } from "@/components/CreatePaymentForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { localApi, type LocalCustomer, type LocalCustomerDetails } from "@/lib/local-api";

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("vi-VN") : "Chưa có";
const customerStatusLabels: Record<string, string> = {
  PENDING: "Chờ xử lý", PROCESSING: "Đang xử lý", CONFIRMED: "Đã xác nhận", APPROVED: "Đã duyệt",
  DELIVERED: "Đã giao", SELF_DELIVERED: "Đã giao", CANCELLED: "Đã hủy", COMPLETED: "Hoàn thành",
  DRAFT: "Nháp", SENT: "Đã gửi", ACCEPTED: "Đã chấp nhận", REJECTED: "Từ chối", EXPIRED: "Hết hạn",
};
const customerStatusLabel = (value: unknown) => {
  const status = String(value || "");
  return customerStatusLabels[status] ?? customerStatusLabels[status.toUpperCase()] ?? (status || "Chưa cập nhật");
};

type CustomerForm = {
  customer_code: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const emptyForm: CustomerForm = { customer_code: "", name: "", company: "", phone: "", email: "", address: "", notes: "" };

function CustomerFormDialog({
  open,
  customer,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  customer: LocalCustomer | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(customer ? {
      customer_code: customer.customer_code || "",
      name: customer.name,
      company: customer.company || "",
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      notes: customer.notes || "",
    } : emptyForm);
  }, [customer, open]);

  const update = (key: keyof CustomerForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Thiếu thông tin", description: "Vui lòng nhập tên khách hàng.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (customer) await localApi.updateCustomer(customer.id, form);
      else await localApi.createCustomer(form);
      await onSaved();
      onOpenChange(false);
      toast({ title: "Đã lưu", description: customer ? "Thông tin khách hàng đã được cập nhật." : "Khách hàng mới đã được thêm vào SQL cục bộ." });
    } catch (error) {
      toast({ title: "Không thể lưu", description: error instanceof Error ? error.message : "Dịch vụ API cục bộ không phản hồi.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer ? "Sửa thông tin khách hàng" : "Thêm khách hàng"}</DialogTitle>
          <DialogDescription>Dữ liệu được lưu ở PostgreSQL cục bộ, không ghi ngược lên Supabase công khai.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="customer-name">Tên khách hàng *</Label><Input id="customer-name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Nguyễn Văn A" /></div>
            <div className="space-y-2"><Label htmlFor="customer-code">Mã khách hàng</Label><Input id="customer-code" value={form.customer_code} onChange={(event) => update("customer_code", event.target.value)} placeholder="KH-0001" /></div>
            <div className="space-y-2"><Label htmlFor="customer-company">Công ty</Label><Input id="customer-company" value={form.company} onChange={(event) => update("company", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="customer-phone">Điện thoại</Label><Input id="customer-phone" value={form.phone} onChange={(event) => update("phone", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="customer-email">Email</Label><Input id="customer-email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="customer-address">Địa chỉ</Label><Input id="customer-address" value={form.address} onChange={(event) => update("address", event.target.value)} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="customer-notes">Ghi chú</Label><Textarea id="customer-notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} rows={3} /></div>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? "Đang lưu..." : "Lưu khách hàng"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetailsDialog({ customerId, onOpenChange }: { customerId: string | null; onOpenChange: (open: boolean) => void }) {
  const [details, setDetails] = useState<LocalCustomerDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<Record<string, unknown> | null>(null);
  const [paymentInfo, setPaymentInfo] = useState({ totalPaid: 0, orderExpenses: 0 });
  const loadDetails = async (id: string) => {
    setLoading(true);
    try { setDetails(await localApi.customer(id)); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (!customerId) return;
    void loadDetails(customerId);
  }, [customerId]);
  const openPayment = async (order: Record<string, unknown>) => {
    const orderId = String(order.id || "");
    const payments = (details?.payments || []).filter((payment) => String(payment.order_id) === orderId);
    const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.payment_amount || 0), 0);
    let orderExpenses = 0;
    try {
      const transactions = await localApi.transactions({ orderId });
      orderExpenses = transactions.filter((transaction) => transaction.type === "expense").reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    } catch { /* Payment form can still record a new local payment. */ }
    setPaymentInfo({ totalPaid, orderExpenses });
    setPaymentOrder(order);
  };
  const customer = details?.customer;
  return (
    <>
    <Dialog open={!!customerId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-primary" />{customer?.name || "Chi tiết khách hàng"}</DialogTitle>
          <DialogDescription>{customer?.customer_code || "Chưa có mã"} · dữ liệu SQL cục bộ</DialogDescription>
        </DialogHeader>
        {loading || !customer ? <div className="py-12 text-center text-muted-foreground">Đang tải hồ sơ...</div> : <div className="space-y-5">
          <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{customer.phone || "Chưa có điện thoại"}</div>
            <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" />{customer.email || "Chưa có email"}</div>
            <div className="flex items-center gap-2 text-sm sm:col-span-2"><MapPin className="h-4 w-4 text-muted-foreground" />{customer.address || "Chưa có địa chỉ"}</div>
            {customer.company && <div className="flex items-center gap-2 text-sm sm:col-span-2"><Building2 className="h-4 w-4 text-muted-foreground" />{customer.company}</div>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Đơn hàng</p><p className="mt-1 text-2xl font-semibold">{details.orders.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Báo giá</p><p className="mt-1 text-2xl font-semibold">{details.quotes.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Tổng giá trị đơn</p><p className="mt-1 text-lg font-semibold">{money.format(customer.total_spent || 0)}</p></CardContent></Card></div>
          <section><h3 className="mb-2 font-semibold">Lịch sử đơn hàng</h3><div className="overflow-hidden rounded-lg border"><div className="divide-y">{details.orders.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Chưa có đơn hàng trong hệ thống cục bộ.</p> : details.orders.map((order) => <div key={String(order.id)} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">#{String(order.display_order_number || order.order_number || order.id).slice(0, 32)}</p><p className="text-xs text-muted-foreground">{date(order.created_at as string)} · {customerStatusLabel(order.status)}</p></div><div className="flex items-center gap-3"><p className="font-semibold">{money.format(Number(order.total_amount || 0))}</p><Button size="sm" variant="outline" onClick={() => void openPayment(order)}><CreditCard className="mr-1 h-4 w-4" />Thanh toán</Button></div></div>)}</div></div></section>
          <section><h3 className="mb-2 font-semibold">Lịch sử báo giá</h3><div className="overflow-hidden rounded-lg border"><div className="divide-y">{details.quotes.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Chưa có báo giá trong hệ thống cục bộ.</p> : details.quotes.map((quote) => <div key={String(quote.id)} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">#{String(quote.quote_number || quote.id).slice(0, 32)}</p><p className="text-xs text-muted-foreground">{date(quote.created_at as string)} · {customerStatusLabel(quote.status || "DRAFT")}</p></div><p className="font-semibold">{money.format(Number(quote.total_amount || 0))}</p></div>)}</div></div></section>
          {customer.notes && <><Separator /><p className="whitespace-pre-wrap text-sm text-muted-foreground">{customer.notes}</p></>}
        </div>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!paymentOrder} onOpenChange={(open) => !open && setPaymentOrder(null)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Thêm thanh toán đơn hàng</DialogTitle><DialogDescription>Dữ liệu thanh toán được ghi trực tiếp vào PostgreSQL cục bộ.</DialogDescription></DialogHeader>
        {paymentOrder && <CreatePaymentForm
          orderId={String(paymentOrder.id)}
          orderNumber={String(paymentOrder.display_order_number || paymentOrder.order_number || paymentOrder.id)}
          totalAmount={Number(paymentOrder.total_amount || 0)}
          totalPaid={paymentInfo.totalPaid}
          orderExpenses={paymentInfo.orderExpenses}
          remainingAmount={Number(paymentOrder.total_amount || 0) - paymentInfo.totalPaid - paymentInfo.orderExpenses}
          onClose={() => setPaymentOrder(null)}
          onSubmit={() => { setPaymentOrder(null); if (customerId) void loadDetails(customerId); }}
        />}
      </DialogContent>
    </Dialog>
    </>
  );
}

export default function LocalCustomerManagementPage() {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LocalCustomer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCustomers(await localApi.customers({ search })); }
    catch (error) { toast({ title: "Không thể tải khách hàng", description: error instanceof Error ? error.message : "Dịch vụ API cục bộ không phản hồi.", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [search, toast]);
  useEffect(() => { const timer = window.setTimeout(load, 250); return () => window.clearTimeout(timer); }, [load]);

  const stats = useMemo(() => ({
    total: customers.length,
    buying: customers.filter((customer) => customer.order_count > 0).length,
    revenue: customers.reduce((total, customer) => total + Number(customer.total_spent || 0), 0),
    imported: customers.filter((customer) => customer.is_snapshot_record).length,
  }), [customers]);

  const archive = async (customer: LocalCustomer) => {
    if (!window.confirm(`Lưu trữ khách hàng “${customer.name}” khỏi danh sách cục bộ?`)) return;
    try { await localApi.archiveCustomer(customer.id); await load(); toast({ title: "Đã lưu trữ", description: "Dữ liệu Supabase gốc vẫn được giữ nguyên." }); }
    catch (error) { toast({ title: "Không thể lưu trữ", description: error instanceof Error ? error.message : "Dịch vụ API cục bộ không phản hồi.", variant: "destructive" }); }
  };

  return <div className="space-y-6 p-4 md:p-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2"><Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">SQL CỤC BỘ</Badge><Badge variant="secondary">Bản chụp dữ liệu Supabase đã đồng bộ</Badge></div><h1 className="text-2xl font-bold tracking-tight">Quản lý khách hàng</h1><p className="mt-1 text-sm text-muted-foreground">Danh sách và lịch sử khách hàng đang chạy trên PostgreSQL cục bộ.</p></div><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" />Thêm khách hàng</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Tổng khách hàng</p><Users className="h-4 w-4 text-primary" /></div><p className="mt-2 text-2xl font-semibold">{stats.total.toLocaleString("vi-VN")}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Có phát sinh đơn</p><p className="mt-2 text-2xl font-semibold">{stats.buying.toLocaleString("vi-VN")}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Tổng giá trị đơn</p><p className="mt-2 text-xl font-semibold">{money.format(stats.revenue)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Từ bản chụp dữ liệu</p><p className="mt-2 text-2xl font-semibold">{stats.imported.toLocaleString("vi-VN")}</p></CardContent></Card></div>
    <Card><CardHeader className="pb-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="text-base">Danh sách khách hàng</CardTitle><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên, mã, công ty, số điện thoại..." /></div></div></CardHeader><CardContent className="p-0"><div className="hidden overflow-x-auto md:block"><table className="w-full text-sm"><thead className="border-y bg-muted/30"><tr><th className="px-4 py-3 text-left font-medium">Khách hàng</th><th className="px-4 py-3 text-left font-medium">Liên hệ</th><th className="px-4 py-3 text-center font-medium">Đơn hàng</th><th className="px-4 py-3 text-right font-medium">Giá trị</th><th className="px-4 py-3 text-left font-medium">Cập nhật</th><th className="px-4 py-3 text-right font-medium">Thao tác</th></tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">Đang tải dữ liệu cục bộ...</td></tr> : customers.length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">Không tìm thấy khách hàng.</td></tr> : customers.map((customer) => <tr key={customer.id} className="transition-colors hover:bg-muted/20"><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></div><div><p className="font-medium">{customer.name}</p><p className="text-xs text-muted-foreground">{customer.customer_code || "Chưa có mã"}{customer.company ? ` · ${customer.company}` : ""}</p></div></div></td><td className="px-4 py-3"><p>{customer.phone || "—"}</p><p className="max-w-[220px] truncate text-xs text-muted-foreground">{customer.email || customer.address || "Chưa có thông tin"}</p></td><td className="px-4 py-3 text-center">{customer.order_count}</td><td className="px-4 py-3 text-right font-medium">{money.format(customer.total_spent || 0)}</td><td className="px-4 py-3 text-muted-foreground">{date(customer.last_purchase_date)}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" title="Xem chi tiết" onClick={() => setSelectedId(customer.id)}><Eye className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Sửa" onClick={() => { setEditing(customer); setFormOpen(true); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Lưu trữ" onClick={() => archive(customer)}><X className="h-4 w-4 text-destructive" /></Button></div></td></tr>)}</tbody></table></div><div className="grid gap-3 p-3 md:hidden">{loading ? <p className="p-8 text-center text-muted-foreground">Đang tải dữ liệu cục bộ...</p> : customers.length === 0 ? <p className="p-8 text-center text-muted-foreground">Không tìm thấy khách hàng.</p> : customers.map((customer) => <div key={customer.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{customer.name}</p><p className="text-xs text-muted-foreground">{customer.customer_code || "Chưa có mã"}</p></div><Badge variant="outline">{customer.order_count} đơn</Badge></div><div className="mt-3 space-y-1 text-sm text-muted-foreground"><p>{customer.phone || "Chưa có điện thoại"}</p><p className="truncate">{customer.company || customer.address || "Chưa có địa chỉ"}</p></div><div className="mt-3 flex items-center justify-between border-t pt-3"><span className="font-semibold">{money.format(customer.total_spent || 0)}</span><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => setSelectedId(customer.id)}>Xem</Button><Button size="sm" variant="outline" onClick={() => { setEditing(customer); setFormOpen(true); }}>Sửa</Button></div></div></div>)}</div></CardContent></Card>
    <CustomerFormDialog open={formOpen} customer={editing} onOpenChange={setFormOpen} onSaved={load} />
    <CustomerDetailsDialog customerId={selectedId} onOpenChange={(open) => !open && setSelectedId(null)} />
  </div>;
}
