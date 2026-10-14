import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Database, Eye, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { localApi } from "@/lib/local-api";

type SnapshotRow = { source_key: string; source_updated_at: string | null; last_seen_at: string; payload: Record<string, unknown> };
type TableState = { rows: SnapshotRow[]; total: number; offset: number; loading: boolean; error: string | null };

const PAGE_SIZE = 30;
const tableLabel = (table: string) => table.replace(/_/g, " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
const valueLabel = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return `${value.length} mục`;
  if (typeof value === "object") return "Dữ liệu JSON";
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
};

export default function LocalSnapshotModulePage({ title, description, tables }: { title: string; description: string; tables: string[] }) {
  const { toast } = useToast();
  const tableSignature = tables.join("|");
  const firstTable = tables[0] || "";
  const [activeTable, setActiveTable] = useState(firstTable);
  const [search, setSearch] = useState("");
  const [states, setStates] = useState<Record<string, TableState>>({});
  const [selectedRow, setSelectedRow] = useState<SnapshotRow | null>(null);

  const loadTable = useCallback(async (table: string, offset = 0) => {
    if (!table) return;
    setStates((current) => ({ ...current, [table]: { ...(current[table] || { rows: [], total: 0, offset: 0, error: null }), loading: true, error: null } }));
    try {
      const result = await localApi.snapshot(table, { search, limit: PAGE_SIZE, offset });
      setStates((current) => ({ ...current, [table]: { rows: result.rows, total: result.total, offset: result.offset, loading: false, error: null } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể đọc bản chụp dữ liệu cục bộ.";
      setStates((current) => ({ ...current, [table]: { ...(current[table] || { rows: [], total: 0, offset }), loading: false, error: message } }));
      toast({ title: `Không tải được ${tableLabel(table)}`, description: message, variant: "destructive" });
    }
  }, [search, toast]);

  // Routes reuse this component instance; reset the table state when switching modules.
  useEffect(() => {
    setActiveTable(firstTable);
    setSearch("");
    setStates({});
    setSelectedRow(null);
  }, [firstTable, tableSignature]);

  useEffect(() => { const timer = window.setTimeout(() => void loadTable(activeTable, 0), 200); return () => window.clearTimeout(timer); }, [activeTable, loadTable]);

  const state = states[activeTable] || { rows: [], total: 0, offset: 0, loading: false, error: null };
  const columns = useMemo(() => {
    const keys = new Set<string>();
    state.rows.forEach((row) => Object.keys(row.payload || {}).forEach((key) => keys.add(key)));
    return [...keys].filter((key) => !["id", "items", "quote_data", "addresses", "phones", "tags", "auto_tags"].includes(key)).slice(0, 7);
  }, [state.rows]);
  const recordLabel = state.total.toLocaleString("vi-VN");

  return <div className="space-y-6 p-4 md:p-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2"><Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">SQL CỤC BỘ</Badge><Badge variant="secondary">Bản chụp dữ liệu an toàn</Badge></div><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p></div><Button variant="outline" onClick={() => void loadTable(activeTable, state.offset)} disabled={state.loading}><RefreshCw className={`mr-2 h-4 w-4 ${state.loading ? "animate-spin" : ""}`} />Tải lại</Button></div>
    <Card><CardHeader className="pb-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><CardTitle className="text-base">Dữ liệu đã đồng bộ về hệ thống cục bộ</CardTitle><CardDescription>{recordLabel} bản ghi ở bảng <span className="font-medium">{tableLabel(activeTable)}</span>. Dữ liệu công khai chỉ được đọc.</CardDescription></div><div className="relative w-full lg:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm trong bản chụp dữ liệu..." /></div></div></CardHeader><CardContent className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">{tables.map((table) => <Button key={table} size="sm" variant={table === activeTable ? "default" : "outline"} onClick={() => setActiveTable(table)} className="shrink-0"><Database className="mr-2 h-3.5 w-3.5" />{tableLabel(table)}</Button>)}</div>
      {state.error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{state.error}</div> : state.loading ? <div className="p-10 text-center text-muted-foreground">Đang tải dữ liệu cục bộ...</div> : state.rows.length === 0 ? <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">Chưa có dữ liệu trong bảng này.</div> : <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Khóa bản ghi</TableHead>{columns.map((column) => <TableHead key={column}>{tableLabel(column)}</TableHead>)}<TableHead className="text-right">Chi tiết</TableHead></TableRow></TableHeader><TableBody>{state.rows.map((row) => <TableRow key={`${activeTable}-${row.source_key}`}><TableCell className="max-w-[200px] truncate font-mono text-xs">{row.source_key}</TableCell>{columns.map((column) => <TableCell key={column} className="max-w-[220px] truncate text-sm">{valueLabel(row.payload?.[column])}</TableCell>)}<TableCell className="text-right"><Button size="icon" variant="ghost" title="Xem JSON" onClick={() => setSelectedRow(row)}><Eye className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table></div>}
      <div className="flex items-center justify-between border-t pt-3 text-sm text-muted-foreground"><span>{state.total === 0 ? "0" : `${state.offset + 1}-${Math.min(state.offset + PAGE_SIZE, state.total)}`} / {state.total.toLocaleString("vi-VN")}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={state.loading || state.offset === 0} onClick={() => void loadTable(activeTable, Math.max(0, state.offset - PAGE_SIZE))}><ChevronLeft className="mr-1 h-4 w-4" />Trước</Button><Button size="sm" variant="outline" disabled={state.loading || state.offset + PAGE_SIZE >= state.total} onClick={() => void loadTable(activeTable, state.offset + PAGE_SIZE)}>Sau<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
    </CardContent></Card>
    <Dialog open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRow(null)}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Chi tiết bản ghi cục bộ</DialogTitle><DialogDescription>{activeTable} · {selectedRow?.source_key}</DialogDescription></DialogHeader><pre className="max-h-[65vh] overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{selectedRow ? JSON.stringify(selectedRow.payload, null, 2) : ""}</pre></DialogContent></Dialog>
  </div>;
}
