import { useState } from "react";
import { useEInvoices } from "@/hooks/useEInvoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreateEInvoiceDialog } from "@/components/CreateEInvoiceDialog";
import { FileText, Plus, Search, ExternalLink, CheckCircle2, XCircle, Loader2, Settings, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  issued: { label: "Đã phát hành", variant: "default" },
  draft: { label: "Nháp", variant: "secondary" },
  error: { label: "Lỗi", variant: "destructive" },
  cancelled: { label: "Đã huỷ", variant: "destructive" },
};

const SECRET_NAMES = ["VINVOICE_API_URL", "VINVOICE_USERNAME", "VINVOICE_PASSWORD", "VINVOICE_TAX_CODE"] as const;

const EInvoiceManagement = () => {
  const { data: einvoices, isLoading } = useEInvoices();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { user } = useAuthReady();
  const { role } = useUserRole(user);
  const canManage = role === "admin" || role === "manager";

  const [configStatus, setConfigStatus] = useState<Record<string, boolean> | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loginResult, setLoginResult] = useState<any>(null);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [templatesResult, setTemplatesResult] = useState<any>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const callApi = async (action: string, extra: any = {}) => {
    const { data, error } = await supabase.functions.invoke("vinvoice-api", { body: { action, ...extra } });
    if (error) throw new Error(error.message);
    return data;
  };

  const handleCheckConfig = async () => {
    setLoadingConfig(true);
    try {
      const res = await callApi("config_status");
      setConfigStatus(res?.status || {});
    } catch (e: any) {
      toast.error(e.message);
    } finally { setLoadingConfig(false); }
  };

  const handleTestLogin = async () => {
    setLoadingLogin(true);
    setLoginResult(null);
    try {
      const res = await callApi("login");
      setLoginResult(res);
      if (res?.success) toast.success("Đăng nhập Viettel thành công");
      else toast.error(res?.error || "Đăng nhập thất bại");
    } catch (e: any) {
      setLoginResult({ success: false, error: e.message });
      toast.error(e.message);
    } finally { setLoadingLogin(false); }
  };

  const handleGetTemplates = async () => {
    setLoadingTemplates(true);
    setTemplatesResult(null);
    try {
      const res = await callApi("get_templates");
      setTemplatesResult(res);
      if (res?.success) toast.success("Đã lấy danh sách mẫu hoá đơn");
      else toast.error(res?.error || "Lấy mẫu thất bại");
    } catch (e: any) {
      setTemplatesResult({ success: false, error: e.message });
      toast.error(e.message);
    } finally { setLoadingTemplates(false); }
  };

  const filtered = (einvoices || []).filter((inv: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      inv.invoice_number?.toLowerCase().includes(s) ||
      inv.buyer_name?.toLowerCase().includes(s) ||
      inv.buyer_tax_code?.toLowerCase().includes(s) ||
      inv.template_code?.toLowerCase().includes(s)
    );
  });

  const stats = {
    total: (einvoices || []).length,
    issued: (einvoices || []).filter((i: any) => i.status === "issued").length,
    draft: (einvoices || []).filter((i: any) => i.status === "draft").length,
    error: (einvoices || []).filter((i: any) => i.status === "error").length,
  };

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";

  const templates = Array.isArray(templatesResult?.data?.lstInvoiceTemplate)
    ? templatesResult.data.lstInvoiceTemplate
    : Array.isArray(templatesResult?.data) ? templatesResult.data : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Hoá đơn điện tử
          </h1>
          <p className="text-muted-foreground">Quản lý và phát hành hoá đơn điện tử qua Viettel S-Invoice</p>
        </div>
        <Button variant="outline" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Tạo hoá đơn (nội bộ)
        </Button>
      </div>

      <Tabs defaultValue="history" className="w-full">
        <TabsList>
          <TabsTrigger value="history">Lịch sử nội bộ</TabsTrigger>
          {canManage && <TabsTrigger value="config">Cấu hình & Kết nối</TabsTrigger>}
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Tổng hoá đơn", value: stats.total, color: "text-foreground" },
              { label: "Đã phát hành", value: stats.issued, color: "text-blue-600" },
              { label: "Nháp", value: stats.draft, color: "text-muted-foreground" },
              { label: "Lỗi", value: stats.error, color: "text-destructive" },
            ].map((s, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Tìm theo số HĐ, khách hàng, MST..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Số hoá đơn</TableHead>
                    <TableHead>Mẫu / Ký hiệu</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>MST khách</TableHead>
                    <TableHead className="text-right">Tổng tiền</TableHead>
                    <TableHead>Ngày phát hành</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Đang tải...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Chưa có hoá đơn nào</TableCell></TableRow>
                  ) : (
                    filtered.map((inv: any) => {
                      const st = statusMap[inv.status] || statusMap.draft;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium text-primary">{inv.invoice_number || "—"}</TableCell>
                          <TableCell className="text-xs">{inv.template_code || "—"} / {inv.invoice_series || "—"}</TableCell>
                          <TableCell>{inv.buyer_name || "—"}</TableCell>
                          <TableCell className="text-xs">{inv.buyer_tax_code || "—"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(inv.total_with_vat)}</TableCell>
                          <TableCell>{inv.issued_date ? new Date(inv.issued_date).toLocaleDateString("vi-VN") : "—"}</TableCell>
                          <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {canManage && (
          <TabsContent value="config" className="space-y-4">
            {/* Card 1: Secret status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" /> Trạng thái cấu hình secret
                </CardTitle>
                <CardDescription>Kiểm tra các secret kết nối Viettel S-Invoice (giá trị không hiển thị).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" size="sm" onClick={handleCheckConfig} disabled={loadingConfig}>
                  {loadingConfig ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Settings className="h-4 w-4 mr-1" />}
                  Kiểm tra trạng thái
                </Button>
                {configStatus && (
                  <div className="space-y-2">
                    {SECRET_NAMES.map(name => {
                      const ok = configStatus[name];
                      return (
                        <div key={name} className="flex items-center justify-between border rounded-md px-3 py-2">
                          <code className="text-sm">{name}</code>
                          {ok ? (
                            <Badge className="bg-sidebar-primary text-sidebar-primary-foreground">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Đã cấu hình
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" /> Thiếu
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted-foreground">
                      Để cập nhật giá trị secret, vào Lovable → Project Settings → Secrets, hoặc yêu cầu admin cập nhật.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Card 2: Test login */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Test đăng nhập Viettel</CardTitle>
                <CardDescription>Gọi <code>/auth/login</code> với username/password đã cấu hình.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleTestLogin} disabled={loadingLogin}>
                  {loadingLogin && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Kiểm tra đăng nhập
                </Button>
                {loginResult && (
                  <div className={`rounded-md border p-3 ${loginResult.success ? "border-sidebar-primary/40 bg-sidebar-primary/5" : "border-destructive/40 bg-destructive/5"}`}>
                    {loginResult.success ? (
                      <div className="space-y-1 text-sm">
                        <p className="flex items-center gap-2 font-medium text-sidebar-primary">
                          <CheckCircle2 className="h-4 w-4" /> Đăng nhập thành công
                        </p>
                        <p>Token preview: <code>{loginResult.token_preview}</code></p>
                        <p>Độ dài: {loginResult.token_length} ký tự</p>
                        {loginResult.expires_in != null && <p>Hết hạn sau: {loginResult.expires_in}s</p>}
                      </div>
                    ) : (
                      <div className="space-y-1 text-sm text-destructive">
                        <p className="flex items-center gap-2 font-medium">
                          <XCircle className="h-4 w-4" /> Đăng nhập thất bại
                        </p>
                        <p>{loginResult.error}</p>
                      </div>
                    )}
                    <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto max-h-48">{JSON.stringify(loginResult, null, 2)}</pre>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Card 3: Templates */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Test lấy danh sách mẫu hoá đơn</CardTitle>
                <CardDescription>Yêu cầu Viettel trả về các mẫu/ký hiệu HĐ đã đăng ký cho MST của bạn.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleGetTemplates} disabled={loadingTemplates}>
                  {loadingTemplates && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Lấy danh sách mẫu HĐ
                </Button>
                {templatesResult && (
                  <>
                    {templates.length > 0 ? (
                      <div className="border rounded-md overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Template Code</TableHead>
                              <TableHead>Invoice Series</TableHead>
                              <TableHead>Invoice Type</TableHead>
                              <TableHead>Trạng thái</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {templates.map((t: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-xs">{t.templateCode || t.invoiceTemplateCode || "—"}</TableCell>
                                <TableCell className="font-mono text-xs">{t.invoiceSeries || "—"}</TableCell>
                                <TableCell>{t.invoiceType || "—"}</TableCell>
                                <TableCell>{t.status ?? t.statusName ?? "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : templatesResult.success ? (
                      <p className="text-sm text-yellow-600">
                        Không có mẫu HĐ nào — cần đăng ký mẫu trong portal SME Viettel trước.
                      </p>
                    ) : (
                      <p className="text-sm text-destructive">{templatesResult.error}</p>
                    )}
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48">{JSON.stringify(templatesResult, null, 2)}</pre>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Card 4: Quick links */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Liên kết nhanh</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <a href="https://sme.viettel.vn" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" /> Portal SME Viettel
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="https://vinvoice.viettel.vn" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" /> VinVoice (giao diện cũ)
                  </a>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {showCreate && (
        <CreateEInvoiceDialog open={showCreate} onOpenChange={setShowCreate} contract={null} />
      )}
    </div>
  );
};

export default EInvoiceManagement;
