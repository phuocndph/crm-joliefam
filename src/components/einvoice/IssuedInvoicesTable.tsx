import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Info,
  List,
  Menu,
  Plus,
  Circle,
  CheckCircle2,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

type Issued = {
  id: string;
  transaction_uuid?: string | null;
  invoice_number?: string | null;
  template_code?: string | null;
  invoice_series?: string | null;
  issued_date?: string | null;
  created_at: string;
  buyer_name?: string | null;
  buyer_legal_name?: string | null;
  buyer_contact_name?: string | null;
  total_amount?: number | null;
  vat_amount?: number | null;
  total_with_vat?: number | null;
  currency?: string | null;
  status?: string | null;
  invoice_action?: string | null;
};

interface Props {
  invoices: Issued[];
  isLoading: boolean;
  onCreate?: () => void;
  onSendCqt?: () => void;
  onInfo?: (inv: Issued) => void;
  onMenu?: (inv: Issued) => void;
}

type SortKey =
  | "template" | "invoice_number" | "buyer" | "total_amount"
  | "vat_amount" | "total_with_vat" | "currency" | "convert" | "status";

const fmtNum = (n: number | null | undefined) =>
  n == null ? "" : Math.round(n).toLocaleString("vi-VN").replace(/,/g, ".");

const fmtDateTime = (s?: string | null) => {
  if (!s) return ["", ""] as const;
  const d = new Date(s);
  if (isNaN(d.getTime())) return ["", ""] as const;
  const pad = (x: number) => String(x).padStart(2, "0");
  return [
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  ] as const;
};

const StatusPill = ({ inv }: { inv: Issued }) => {
  let label = "Đã phát hành";
  let cls = "bg-sky-100 text-sky-700 border border-sky-200";
  if (inv.invoice_action === "replaces_old" || inv.invoice_action === "replacement") {
    label = "Hoá đơn thay thế";
    cls = "bg-orange-100 text-orange-700 border border-orange-200";
  } else if (inv.invoice_action === "replaced_by_new") {
    label = "Bị thay thế";
    cls = "bg-muted text-muted-foreground border border-border";
  } else if (inv.status === "cancelled") {
    label = "Đã huỷ";
    cls = "bg-red-100 text-red-700 border border-red-200";
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
};

export function IssuedInvoicesTable({
  invoices, isLoading, onCreate, onSendCqt, onInfo, onMenu,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const total = invoices.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => { setPage(p => Math.min(p, pageCount)); setSelected(new Set()); }, [invoices, pageCount]);

  const sorted = useMemo(() => {
    if (!sortKey) return invoices;
    const arr = [...invoices];
    const getVal = (d: Issued): string | number => {
      switch (sortKey) {
        case "template": return `${d.template_code || ""}/${d.invoice_series || ""}`;
        case "invoice_number": return new Date(d.issued_date || d.created_at).getTime();
        case "buyer": return d.buyer_legal_name || d.buyer_name || "";
        case "total_amount": return d.total_amount || 0;
        case "vat_amount": return d.vat_amount || 0;
        case "total_with_vat": return d.total_with_vat || 0;
        case "currency": return d.currency || "VND";
        case "convert": return 0;
        case "status": return d.status || "";
        default: return 0;
      }
    };
    arr.sort((a, b) => {
      const va = getVal(a); const vb = getVal(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [invoices, sortKey, sortDir]);

  const start = (page - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);
  const pageIds = pageRows.map(r => r.id);
  const allSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) pageIds.forEach(id => next.delete(id));
    else pageIds.forEach(id => next.add(id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const sort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    <ChevronsUpDown className={`inline-block h-3 w-3 ml-1 ${sortKey === k ? "text-foreground" : "text-muted-foreground/60"}`} />
  );

  const th = "px-3 py-2 text-xs font-semibold text-foreground bg-muted/60 border-b border-border whitespace-nowrap";
  const td = "px-3 py-2 text-sm border-b border-border align-middle";

  // Pager with ellipsis when many pages
  const buildPages = () => {
    const pages: (number | "...")[] = [];
    if (pageCount <= 7) {
      for (let i = 1; i <= pageCount; i++) pages.push(i);
      return pages;
    }
    pages.push(1, 2, 3, 4, 5);
    if (page > 5 && page < pageCount - 1) {
      pages.length = 0;
      pages.push(1, "...", page - 1, page, page + 1, "...", pageCount);
    } else {
      pages.push("...", pageCount);
    }
    return pages;
  };

  return (
    <div className="bg-card rounded-md border border-border shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Danh sách hoá đơn đã phát hành
        </h2>
        <button onClick={() => setCollapsed(c => !c)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="toggle">
          {collapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="flex flex-wrap justify-end gap-2 px-4 py-3 border-b">
            {onCreate && <Button onClick={onCreate} size="sm"><Plus className="h-4 w-4 mr-1" />Lập hóa đơn</Button>}
            {onSendCqt && <Button variant="outline" onClick={onSendCqt}>Gửi CQ Thuế</Button>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th + " w-10"}><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                  <th className={th + " w-12 text-center"}>STT</th>
                  <th className={th}>Hành động</th>
                  <th className={th + " cursor-pointer"} onClick={() => sort("template")}>Mẫu hoá đơn<SortIcon k="template" /></th>
                  <th className={th + " cursor-pointer"} onClick={() => sort("invoice_number")}>Số hoá đơn<SortIcon k="invoice_number" /></th>
                  <th className={th + " cursor-pointer"} onClick={() => sort("buyer")}>Tên người mua<SortIcon k="buyer" /></th>
                  <th className={th + " text-right cursor-pointer"} onClick={() => sort("total_amount")}>Tổng trước thuế<SortIcon k="total_amount" /></th>
                  <th className={th + " text-right cursor-pointer"} onClick={() => sort("vat_amount")}>Tiền thuế<SortIcon k="vat_amount" /></th>
                  <th className={th + " text-right cursor-pointer"} onClick={() => sort("total_with_vat")}>Tổng tiền<SortIcon k="total_with_vat" /></th>
                  <th className={th + " cursor-pointer"} onClick={() => sort("currency")}>Loại tiền<SortIcon k="currency" /></th>
                  <th className={th + " text-center cursor-pointer"} onClick={() => sort("convert")}>Chuyển đổi<SortIcon k="convert" /></th>
                  <th className={th + " text-center"}>Kê khai thuế</th>
                  <th className={th + " text-center"}>Gửi CQT</th>
                  <th className={th + " text-center"}>Mã CQT</th>
                  <th className={th + " text-center"}>Báo cáo 04SS</th>
                  <th className={th + " text-center"}>Văn bản thoả thuận</th>
                  <th className={th + " cursor-pointer"} onClick={() => sort("status")}>Trạng thái<SortIcon k="status" /></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={17} className="text-center py-8 text-muted-foreground">Đang tải...</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={17} className="text-center py-8 text-muted-foreground">Không có dữ liệu</td></tr>
                ) : pageRows.map((inv, idx) => {
                  const [d, t] = fmtDateTime(inv.issued_date || inv.created_at);
                  const replacedByNew = inv.invoice_action === "replaced_by_new";
                  return (
                    <tr key={inv.id} className="hover:bg-muted/40">
                      <td className={td}><Checkbox checked={selected.has(inv.id)} onCheckedChange={() => toggleOne(inv.id)} /></td>
                      <td className={td + " text-center"}>{start + idx + 1}</td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          {onInfo && <button onClick={() => onInfo?.(inv)} className="text-blue-600 hover:text-blue-800" title="Thông tin">
                            <Info className="h-4 w-4" />
                          </button>}
                          {onMenu && <button onClick={() => onMenu?.(inv)} className="text-blue-600 hover:text-blue-800" title="Thao tác">
                            <List className="h-4 w-4" />
                          </button>}
                        </div>
                      </td>
                      <td className={td}>{(inv.template_code || "1") + "/" + (inv.invoice_series || "001")}</td>
                      <td className={td + " whitespace-nowrap"}>
                        <div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                            #{inv.invoice_number || "—"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{d} {t}</div>
                      </td>
                      <td className={td}>
                        <div className="text-xs font-medium">
                          {(inv.buyer_legal_name || inv.buyer_name || "").toUpperCase()}
                        </div>
                        {inv.buyer_contact_name ? (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Họ tên: {inv.buyer_contact_name}
                          </div>
                        ) : null}
                      </td>
                      <td className={td + " text-right tabular-nums"}>{fmtNum(inv.total_amount)}</td>
                      <td className={td + " text-right tabular-nums"}>{fmtNum(inv.vat_amount)}</td>
                      <td className={td + " text-right tabular-nums"}>{fmtNum(inv.total_with_vat)}</td>
                      <td className={td}>{inv.currency || "VND"}</td>
                      <td className={td + " text-center"}>
                        <Circle className="h-4 w-4 text-muted-foreground/50 inline" />
                      </td>
                      <td className={td + " text-center"}>
                        <Circle className="h-4 w-4 text-muted-foreground/50 inline" />
                      </td>
                      <td className={td + " text-center"}>
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 inline" />
                      </td>
                      <td className={td + " text-center"}>
                        <FileText className="h-5 w-5 text-emerald-600 inline" />
                      </td>
                      <td className={td + " text-center"}>
                        {replacedByNew ? <FileText className="h-5 w-5 text-muted-foreground/50 inline" /> : null}
                      </td>
                      <td className={td + " text-center"}>
                        {inv.invoice_action === "replaces_old" || inv.invoice_action === "replacement" ? (
                          <List className="h-4 w-4 text-blue-600 inline" />
                        ) : null}
                      </td>
                      <td className={td}><StatusPill inv={inv} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border text-sm">
            <div className="flex items-center gap-2">
              <span>Số lượng bản ghi hiển thị</span>
              <input
                type="number"
                min={1}
                value={pageSize}
                onChange={e => { setPageSize(Math.max(1, Number(e.target.value) || 10)); setPage(1); }}
                className="w-16 h-8 px-2 border border-border rounded text-sm"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">
                Bản ghi {total === 0 ? 0 : start + 1} - {Math.min(start + pageSize, total)} trong số {total}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronsLeft className="h-3.5 w-3.5" /></button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
                {buildPages().map((p, i) => p === "..." ? (
                  <span key={`e${i}`} className="px-2 text-muted-foreground">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`min-w-[32px] h-8 px-2 rounded border text-sm ${p === page ? "bg-red-600 text-white border-red-600" : "border-border hover:bg-muted"}`}
                  >
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page === pageCount} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
                <button onClick={() => setPage(pageCount)} disabled={page === pageCount} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronsRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}