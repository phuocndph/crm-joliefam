import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  CloudUpload,
  Download,
  Pencil,
  Trash2,
  Plus,
  List,
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

type Draft = {
  id: string;
  template_code?: string | null;
  invoice_series?: string | null;
  created_at: string;
  buyer_name?: string | null;
  seller_name?: string | null;
  buyer_tax_code?: string | null;
  total_amount?: number | null;
  vat_amount?: number | null;
  total_with_vat?: number | null;
  currency?: string | null;
};

interface Props {
  drafts: Draft[];
  isLoading: boolean;
  onCreate?: () => void;
  onSync?: () => void;
  onIssue?: (inv: Draft) => void;
  onPreview?: (inv: Draft) => void;
  onEdit?: (inv: Draft) => void;
  onDelete?: (inv: Draft) => void;
}

type SortKey =
  | "template"
  | "created_at"
  | "buyer_name"
  | "seller_name"
  | "buyer_tax_code"
  | "total_amount"
  | "vat_amount"
  | "total_with_vat"
  | "currency"
  | "status";

const fmtNum = (n: number | null | undefined) =>
  n == null ? "" : Math.round(n).toLocaleString("vi-VN").replace(/,/g, ".");

const fmtDateTime = (s: string) => {
  const d = new Date(s);
  if (isNaN(d.getTime())) return ["", ""] as const;
  const pad = (x: number) => String(x).padStart(2, "0");
  return [
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  ] as const;
};

export function DraftInvoicesTable({
  drafts,
  isLoading,
  onCreate,
  onSync,
  onIssue,
  onPreview,
  onEdit,
  onDelete,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const total = drafts.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const sorted = useMemo(() => {
    if (!sortKey) return drafts;
    const arr = [...drafts];
    const getVal = (d: Draft) => {
      switch (sortKey) {
        case "template": return `${d.template_code || ""}/${d.invoice_series || ""}`;
        case "created_at": return new Date(d.created_at).getTime();
        case "buyer_name": return d.buyer_name || "";
        case "seller_name": return d.seller_name || d.buyer_name || "";
        case "buyer_tax_code": return d.buyer_tax_code || "";
        case "total_amount": return d.total_amount || 0;
        case "vat_amount": return d.vat_amount || 0;
        case "total_with_vat": return d.total_with_vat || 0;
        case "currency": return d.currency || "VND";
        case "status": return "draft";
      }
    };
    arr.sort((a, b) => {
      const va = getVal(a); const vb = getVal(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [drafts, sortKey, sortDir]);

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
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const sort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    <ChevronsUpDown
      className={`inline-block h-3 w-3 ml-1 ${sortKey === k ? "text-foreground" : "text-muted-foreground/60"}`}
    />
  );

  const th = "px-3 py-2 text-xs font-semibold text-foreground bg-muted/60 border-b border-border whitespace-nowrap";
  const td = "px-3 py-2 text-sm border-b border-border align-middle";

  // Build compact pager: always show 1..5 like screenshot, plus first/prev/next/last
  const pageButtons: number[] = [];
  const maxShow = 5;
  const startPg = Math.max(1, Math.min(page - 2, pageCount - maxShow + 1));
  for (let i = 0; i < maxShow && startPg + i <= pageCount; i++) pageButtons.push(startPg + i);

  return (
    <div className="bg-card rounded-md border border-border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Danh sách hoá đơn chưa phát hành
        </h2>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="p-1 rounded hover:bg-muted text-muted-foreground"
          aria-label="toggle"
        >
          {collapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
            <Button
              variant="outline"
              size="sm"
              disabled={selected.size === 0}
              onClick={() => {
                const first = sorted.find(r => selected.has(r.id));
                if (first) onIssue?.(first);
              }}
            >
              Phát hành
            </Button>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                onClick={onCreate}
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                <Plus className="h-4 w-4 mr-1" /> Lập hoá đơn
              </Button>
              <Button
                onClick={onSync}
                size="sm"
                className="bg-slate-800 hover:bg-slate-900 text-white"
              >
                <CloudUpload className="h-4 w-4 mr-1" /> Phát hành nhiều hoá đơn
              </Button>
              <Button
                size="sm"
                className="bg-slate-800 hover:bg-slate-900 text-white"
              >
                <Download className="h-4 w-4 mr-1" /> Import hoá đơn
              </Button>
              <Button
                size="sm"
                className="bg-slate-800 hover:bg-slate-900 text-white"
              >
                <List className="h-4 w-4 mr-1" /> Tiện ích
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={selected.size === 0}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Xoá
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 bg-slate-800 text-white hover:bg-slate-900 border-slate-800">
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th + " w-10"}>
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </th>
                  <th className={th + " w-12 text-center"}>STT</th>
                  <th className={th}>Hành động</th>
                  <th className={th + " cursor-pointer"} onClick={() => sort("template")}>Mẫu hoá đơn<SortIcon k="template" /></th>
                  <th className={th + " cursor-pointer"} onClick={() => sort("created_at")}>Ngày tạo<SortIcon k="created_at" /></th>
                  <th className={th + " cursor-pointer"} onClick={() => sort("buyer_name")}>Tên người mua<SortIcon k="buyer_name" /></th>
                  <th className={th + " cursor-pointer"} onClick={() => sort("seller_name")}>Tên đơn vị<SortIcon k="seller_name" /></th>
                  <th className={th + " cursor-pointer"} onClick={() => sort("buyer_tax_code")}>Mã số thuế<SortIcon k="buyer_tax_code" /></th>
                  <th className={th}>Bảng kê điều chỉnh/thay thế</th>
                  <th className={th}>Văn bản thoả thuận</th>
                  <th className={th + " text-right cursor-pointer"} onClick={() => sort("total_amount")}>Tổng trước thuế<SortIcon k="total_amount" /></th>
                  <th className={th + " text-right cursor-pointer"} onClick={() => sort("vat_amount")}>Tiền thuế<SortIcon k="vat_amount" /></th>
                  <th className={th + " text-right cursor-pointer"} onClick={() => sort("total_with_vat")}>Tổng tiền<SortIcon k="total_with_vat" /></th>
                  <th className={th + " cursor-pointer"} onClick={() => sort("currency")}>Loại tiền<SortIcon k="currency" /></th>
                  <th className={th + " cursor-pointer"} onClick={() => sort("status")}>Trạng thái<SortIcon k="status" /></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={15} className="text-center py-8 text-muted-foreground">Đang tải...</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={15} className="text-center py-8 text-muted-foreground">Không có dữ liệu</td></tr>
                ) : pageRows.map((inv, idx) => {
                  const [d, t] = fmtDateTime(inv.created_at);
                  return (
                    <tr key={inv.id} className="hover:bg-muted/40">
                      <td className={td}><Checkbox checked={selected.has(inv.id)} onCheckedChange={() => toggleOne(inv.id)} /></td>
                      <td className={td + " text-center"}>{start + idx + 1}</td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <button onClick={() => onIssue?.(inv)} className="text-blue-600 hover:text-blue-800" title="Phát hành"><CloudUpload className="h-4 w-4" /></button>
                          <button onClick={() => onPreview?.(inv)} className="text-blue-600 hover:text-blue-800" title="Tải về"><Download className="h-4 w-4" /></button>
                          <button onClick={() => onEdit?.(inv)} className="text-blue-600 hover:text-blue-800" title="Sửa"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => onDelete?.(inv)} className="text-red-600 hover:text-red-800" title="Xoá"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                      <td className={td}>{(inv.template_code || "1") + "/" + (inv.invoice_series || "001")}</td>
                      <td className={td + " whitespace-nowrap"}>
                        <div>{d}</div>
                        <div>{t}</div>
                      </td>
                      <td className={td}>{inv.buyer_name && inv.buyer_name !== inv.seller_name ? inv.buyer_name : ""}</td>
                      <td className={td}>{(inv.seller_name || inv.buyer_name || "").toUpperCase()}</td>
                      <td className={td}>{inv.buyer_tax_code || ""}</td>
                      <td className={td}></td>
                      <td className={td}></td>
                      <td className={td + " text-right tabular-nums"}>{fmtNum(inv.total_amount)}</td>
                      <td className={td + " text-right tabular-nums"}>{fmtNum(inv.vat_amount)}</td>
                      <td className={td + " text-right tabular-nums"}>{fmtNum(inv.total_with_vat)}</td>
                      <td className={td}>{inv.currency || "VND"}</td>
                      <td className={td}>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-muted text-muted-foreground border border-border">
                          Nháp
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
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
                {pageButtons.map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
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