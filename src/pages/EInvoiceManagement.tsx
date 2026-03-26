import { useState } from "react";
import { useEInvoices } from "@/hooks/useEInvoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateEInvoiceDialog } from "@/components/CreateEInvoiceDialog";
import { FileText, Plus, Search, ExternalLink } from "lucide-react";

const VINVOICE_URL = "https://vinvoice.viettel.vn/";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  issued: { label: "Đã phát hành", variant: "default" },
  draft: { label: "Nháp", variant: "secondary" },
  error: { label: "Lỗi", variant: "destructive" },
  cancelled: { label: "Đã huỷ", variant: "destructive" },
};

const EInvoiceManagement = () => {
  const { data: einvoices, isLoading } = useEInvoices();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Hoá đơn điện tử
          </h1>
          <p className="text-muted-foreground">Quản lý và phát hành hoá đơn điện tử qua Viettel S-Invoice</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Tạo hoá đơn
        </Button>
      </div>

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

      {/* Create Dialog - standalone mode (no contract) */}
      {showCreate && (
        <CreateEInvoiceDialog open={showCreate} onOpenChange={setShowCreate} contract={null} />
      )}
    </div>
  );
};

export default EInvoiceManagement;
