import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Calendar as CalendarIcon, Download, ChevronDown, ChevronUp, Package, TrendingUp, TrendingDown, AlertTriangle, Search, BarChart3, Wallet, ArrowUp, ArrowDown, CheckCircle2, ArrowUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Progress } from '@/components/ui/progress';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Line, LineChart, Area, ComposedChart, PieChart, Pie, Cell, LabelList } from 'recharts';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachQuarterOfInterval, isWithinInterval, differenceInMilliseconds, subMilliseconds, differenceInCalendarDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useFabricUsage, useFabricInventory, useWarehouses, useFabricTypes } from '@/hooks/useFabrics';

const exportToCSV = (rows: Record<string, any>[], filename: string) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

type RangeKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

const rangeOptions: { value: RangeKey; label: string }[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'week', label: 'Tuần này' },
  { value: 'month', label: 'Tháng này' },
  { value: 'quarter', label: 'Quý này' },
  { value: 'year', label: 'Năm nay' },
  { value: 'custom', label: 'Tùy chọn' },
];

const formatNum = (n: number, digits = 2) =>
  n.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: digits });

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

const formatCompact = (n: number) => {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + ' tỷ';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + ' tr';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return formatNum(n);
};

// Chart palette (HSL strings - cohesive with light theme)
const CHART_COLORS = [
  'hsl(217 91% 60%)',  // blue (primary-ish)
  'hsl(142 71% 45%)',  // green
  'hsl(38 92% 50%)',   // amber
  'hsl(280 65% 60%)',  // purple
  'hsl(0 84% 60%)',    // red
  'hsl(190 80% 45%)',  // teal
];
const COLOR_HANOI = CHART_COLORS[0];
const COLOR_BACNINH = CHART_COLORS[1];
const COLOR_TOTAL = 'hsl(240 5% 35%)';

const DeltaBadge: React.FC<{ curr: number; prev: number; invert?: boolean }> = ({ curr, prev, invert }) => {
  if (prev === 0 && curr === 0) {
    return <span className="text-[11px] text-muted-foreground">— Không có kỳ trước</span>;
  }
  if (prev === 0) {
    return <span className="text-[11px] text-muted-foreground">Mới phát sinh</span>;
  }
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  const up = pct >= 0;
  const good = invert ? !up : up;
  return (
    <span className={cn("text-[11px] inline-flex items-center gap-0.5 font-medium", good ? "text-sidebar-primary" : "text-destructive")}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1).replace('.', ',')}% so kỳ trước
    </span>
  );
};

type SortKey = 'used' | 'stock' | 'value' | 'name';

export const FabricReports: React.FC = () => {
  const { data: usage } = useFabricUsage();
  const { data: inventory } = useFabricInventory();
  const { data: warehouses } = useWarehouses();
  const { data: fabricTypes } = useFabricTypes();

  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [warehouseKey, setWarehouseKey] = useState<'all' | 'hanoi' | 'bacninh'>('all');
  const [fabricTypeId, setFabricTypeId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('used');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Compute date interval
  const { interval, prevInterval } = useMemo(() => {
    const now = new Date();
    let cur: { start: Date; end: Date };
    switch (rangeKey) {
      case 'today': cur = { start: startOfDay(now), end: endOfDay(now) }; break;
      case 'week': cur = { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }; break;
      case 'month': cur = { start: startOfMonth(now), end: endOfMonth(now) }; break;
      case 'quarter': cur = { start: startOfQuarter(now), end: endOfQuarter(now) }; break;
      case 'year': cur = { start: startOfYear(now), end: endOfYear(now) }; break;
      case 'custom': cur = {
        start: customRange.from ? startOfDay(customRange.from) : startOfYear(now),
        end: customRange.to ? endOfDay(customRange.to) : endOfDay(now),
      }; break;
    }
    const len = differenceInMilliseconds(cur.end, cur.start);
    const prev = { start: subMilliseconds(cur.start, len + 1), end: subMilliseconds(cur.start, 1) };
    return { interval: cur, prevInterval: prev };
  }, [rangeKey, customRange]);

  const warehouseIdFor = (key: 'hanoi' | 'bacninh') =>
    warehouses?.find(w => key === 'hanoi' ? w.name.includes('Hà Nội') : w.name.includes('Bắc Ninh'))?.id;

  const hanoiId = warehouseIdFor('hanoi');
  const bacninhId = warehouseIdFor('bacninh');

  const passesScope = (u: any) => {
    if (warehouseKey === 'hanoi' && u.warehouse_id !== hanoiId) return false;
    if (warehouseKey === 'bacninh' && u.warehouse_id !== bacninhId) return false;
    if (fabricTypeId !== 'all' && u.fabric_variants?.fabric_type_id !== fabricTypeId) return false;
    return true;
  };

  // Filter usage in current and previous range
  const filteredUsage = useMemo(() => {
    if (!usage) return [];
    return usage.filter((u: any) => isWithinInterval(new Date(u.usage_date), interval) && passesScope(u));
  }, [usage, interval, warehouseKey, fabricTypeId, hanoiId, bacninhId]);

  const prevUsage = useMemo(() => {
    if (!usage) return [];
    return usage.filter((u: any) => isWithinInterval(new Date(u.usage_date), prevInterval) && passesScope(u));
  }, [usage, prevInterval, warehouseKey, fabricTypeId, hanoiId, bacninhId]);

  // KPIs - sum quantity by unit
  const kpis = useMemo(() => {
    const byUnit: Record<string, number> = {};
    let totalValue = 0;
    filteredUsage.forEach((u: any) => {
      const unit = u.unit || 'm';
      byUnit[unit] = (byUnit[unit] || 0) + Number(u.quantity_used || 0);
      const cost = Number(u.fabric_variants?.cost_price || 0);
      totalValue += cost * Number(u.quantity_used || 0);
    });

    // Inventory totals (filtered by warehouse)
    let totalStock = 0;
    let lowStock = 0;
    const stockByUnit: Record<string, number> = {};
    (inventory || []).forEach((inv: any) => {
      if (warehouseKey === 'hanoi' && inv.warehouse_id !== hanoiId) return;
      if (warehouseKey === 'bacninh' && inv.warehouse_id !== bacninhId) return;
      if (fabricTypeId !== 'all' && inv.fabric_variants?.fabric_type_id !== fabricTypeId) return;
      const unit = inv.fabric_variants?.unit || 'm';
      const cur = Number(inv.current_stock || 0);
      stockByUnit[unit] = (stockByUnit[unit] || 0) + cur;
      totalStock += cur;
      if ((inv.minimum_stock || 0) > 0 && cur <= (inv.minimum_stock || 0)) lowStock++;
    });

    return { byUnit, totalValue, stockByUnit, totalStock, lowStock };
  }, [filteredUsage, inventory, warehouseKey, fabricTypeId, hanoiId, bacninhId]);

  // Trend chart data
  const trendData = useMemo(() => {
    const days = (interval.end.getTime() - interval.start.getTime()) / (1000 * 60 * 60 * 24);
    let buckets: { start: Date; end: Date; label: string }[] = [];
    if (days <= 31) {
      buckets = eachDayOfInterval(interval).map(d => ({
        start: startOfDay(d), end: endOfDay(d), label: format(d, 'dd/MM'),
      }));
    } else if (days <= 100) {
      buckets = eachWeekOfInterval(interval, { weekStartsOn: 1 }).map(d => ({
        start: startOfWeek(d, { weekStartsOn: 1 }),
        end: endOfWeek(d, { weekStartsOn: 1 }),
        label: 'T' + format(d, 'w'),
      }));
    } else if (days <= 366) {
      buckets = eachMonthOfInterval(interval).map(d => ({
        start: startOfMonth(d), end: endOfMonth(d), label: format(d, 'MM/yyyy'),
      }));
    } else {
      buckets = eachQuarterOfInterval(interval).map(d => ({
        start: startOfQuarter(d), end: endOfQuarter(d), label: 'Q' + format(d, 'Q/yyyy'),
      }));
    }

    return buckets.map(b => {
      let hanoi = 0, bacninh = 0, total = 0;
      filteredUsage.forEach((u: any) => {
        const d = new Date(u.usage_date);
        if (d < b.start || d > b.end) return;
        const q = Number(u.quantity_used || 0);
        total += q;
        if (u.warehouse_id === hanoiId) hanoi += q;
        else if (u.warehouse_id === bacninhId) bacninh += q;
      });
      return { label: b.label, hanoi, bacninh, total };
    });
  }, [filteredUsage, interval, hanoiId, bacninhId]);

  // Aggregate per variant in period
  const variantAgg = useMemo(() => {
    const map = new Map<string, {
      variantId: string;
      name: string;
      typeName: string;
      color: string;
      width: string;
      unit: string;
      quantity: number;
      value: number;
    }>();
    filteredUsage.forEach((u: any) => {
      const id = u.fabric_variant_id;
      const v = u.fabric_variants;
      if (!v) return;
      const existing = map.get(id) || {
        variantId: id,
        name: v.variant_name || '',
        typeName: v.fabric_types?.name || '',
        color: v.color || '',
        width: v.width_code || '',
        unit: u.unit || v.unit || 'm',
        quantity: 0,
        value: 0,
      };
      const q = Number(u.quantity_used || 0);
      existing.quantity += q;
      existing.value += q * Number(v.cost_price || 0);
      map.set(id, existing);
    });
    return Array.from(map.values());
  }, [filteredUsage]);

  // Stock lookup per variant (sum across selected warehouse scope)
  const stockByVariant = useMemo(() => {
    const map = new Map<string, number>();
    (inventory || []).forEach((inv: any) => {
      if (warehouseKey === 'hanoi' && inv.warehouse_id !== hanoiId) return;
      if (warehouseKey === 'bacninh' && inv.warehouse_id !== bacninhId) return;
      const prev = map.get(inv.fabric_variant_id) || 0;
      map.set(inv.fabric_variant_id, prev + Number(inv.current_stock || 0));
    });
    return map;
  }, [inventory, warehouseKey, hanoiId, bacninhId]);

  const topMost = useMemo(
    () => [...variantAgg].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    [variantAgg]
  );
  const topLeast = useMemo(
    () => [...variantAgg].filter(v => v.quantity > 0).sort((a, b) => a.quantity - b.quantity).slice(0, 10),
    [variantAgg]
  );

  // Detail table (all variants with optional filters)
  const detailRows = useMemo(() => {
    if (!inventory) return [];
    const usageMap = new Map<string, number>();
    variantAgg.forEach(v => usageMap.set(v.variantId, v.quantity));

    // Aggregate per variant (sum of warehouses in scope)
    const map = new Map<string, any>();
    inventory.forEach((inv: any) => {
      if (warehouseKey === 'hanoi' && inv.warehouse_id !== hanoiId) return;
      if (warehouseKey === 'bacninh' && inv.warehouse_id !== bacninhId) return;
      const v = inv.fabric_variants;
      if (!v) return;
      if (fabricTypeId !== 'all' && v.fabric_type_id !== fabricTypeId) return;
      const id = v.id;
      const cur = Number(inv.current_stock || 0);
      const min = Number(inv.minimum_stock || 0);
      const existing = map.get(id) || {
        id,
        name: v.variant_name,
        typeName: v.fabric_types?.name || '',
        color: v.color || '',
        width: v.width_code || '',
        origin: v.origin || '',
        unit: v.unit || 'm',
        stock: 0,
        minStock: 0,
        used: usageMap.get(id) || 0,
      };
      existing.stock += cur;
      existing.minStock = Math.max(existing.minStock, min);
      map.set(id, existing);
    });

    let rows = Array.from(map.values());
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(r =>
        r.name?.toLowerCase().includes(s) ||
        r.typeName?.toLowerCase().includes(s) ||
        r.color?.toLowerCase().includes(s) ||
        r.width?.toLowerCase().includes(s)
      );
    }
    return rows.sort((a, b) => b.used - a.used);
  }, [inventory, variantAgg, warehouseKey, hanoiId, bacninhId, fabricTypeId, search]);

  const handleExportTop = () => {
    const rows = topMost.map(r => ({
      'Tên vải': r.name,
      'Loại': r.typeName,
      'Khổ': r.width,
      'Màu': r.color,
      'SL đã dùng': r.quantity,
      'Đơn vị': r.unit,
      'Giá trị': r.value,
      'Tồn kho': stockByVariant.get(r.variantId) || 0,
    }));
    exportToCSV(rows, `vai-dung-nhieu-${format(new Date(), 'yyyyMMdd')}.csv`);
  };

  const handleExportDetails = () => {
    const rows = detailRows.map(r => ({
      'Tên vải': r.name,
      'Loại': r.typeName,
      'Khổ': r.width,
      'Màu': r.color,
      'Xuất xứ': r.origin,
      'Đã dùng (kỳ)': r.used,
      'Tồn kho': r.stock,
      'Tồn tối thiểu': r.minStock,
      'Đơn vị': r.unit,
    }));
    exportToCSV(rows, `chi-tiet-vai-${format(new Date(), 'yyyyMMdd')}.csv`);
  };

  const periodLabel = `${format(interval.start, 'dd/MM/yyyy', { locale: vi })} - ${format(interval.end, 'dd/MM/yyyy', { locale: vi })}`;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Khoảng thời gian</label>
              <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {rangeOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {rangeKey === 'custom' && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Chọn ngày</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("h-9 w-full justify-start font-normal", !customRange.from && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customRange.from
                        ? (customRange.to
                            ? `${format(customRange.from, 'dd/MM/yy')} - ${format(customRange.to, 'dd/MM/yy')}`
                            : format(customRange.from, 'dd/MM/yy'))
                        : 'Chọn khoảng'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent mode="range" selected={{ from: customRange.from, to: customRange.to }}
                      onSelect={(r) => setCustomRange({ from: r?.from, to: r?.to })} numberOfMonths={2} />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Xưởng</label>
              <Select value={warehouseKey} onValueChange={(v) => setWarehouseKey(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tổng 2 xưởng</SelectItem>
                  <SelectItem value="hanoi">Hà Nội</SelectItem>
                  <SelectItem value="bacninh">Bắc Ninh</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Loại vải</label>
              <Select value={fabricTypeId} onValueChange={setFabricTypeId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả loại vải</SelectItem>
                  {fabricTypes?.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">Kỳ báo cáo: {periodLabel}</div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SL đã sử dụng</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold space-y-0.5">
              {Object.keys(kpis.byUnit).length === 0 ? (
                <div>0</div>
              ) : (
                Object.entries(kpis.byUnit).map(([u, q]) => (
                  <div key={u}>{formatNum(q)} <span className="text-sm font-normal text-muted-foreground">{u}</span></div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Giá trị đã sử dụng</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(kpis.totalValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tồn kho hiện tại</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold space-y-0.5">
              {Object.keys(kpis.stockByUnit).length === 0 ? (
                <div>0</div>
              ) : (
                Object.entries(kpis.stockByUnit).map(([u, q]) => (
                  <div key={u}>{formatNum(q)} <span className="text-sm font-normal text-muted-foreground">{u}</span></div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sắp hết hàng</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-destructive">{kpis.lowStock}</div>
          </CardContent>
        </Card>
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Xu hướng sử dụng vải</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              total: { label: 'Tổng', color: 'hsl(var(--primary))' },
              hanoi: { label: 'Hà Nội', color: 'hsl(var(--chart-1))' },
              bacninh: { label: 'Bắc Ninh', color: 'hsl(var(--chart-2))' },
            }}
            className="h-[320px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              {warehouseKey === 'all' ? (
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="hanoi" stackId="a" fill="var(--color-hanoi)" />
                  <Bar dataKey="bacninh" stackId="a" fill="var(--color-bacninh)" />
                </BarChart>
              ) : (
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="total" stroke="var(--color-total)" strokeWidth={2} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Top tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Vải dùng nhiều nhất
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportTop}>
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead>Vải</TableHead>
                  <TableHead className="text-right">Đã dùng</TableHead>
                  <TableHead className="text-right">Tồn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topMost.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-6">Không có dữ liệu</TableCell></TableRow>
                ) : topMost.map((r, i) => (
                  <TableRow key={r.variantId} className="text-xs">
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-muted-foreground text-[11px]">
                        {[r.typeName, r.width, r.color].filter(Boolean).join(' · ')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatNum(r.quantity)} {r.unit}</TableCell>
                    <TableCell className="text-right">{formatNum(stockByVariant.get(r.variantId) || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4" /> Vải dùng ít nhất (có phát sinh)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead>Vải</TableHead>
                  <TableHead className="text-right">Đã dùng</TableHead>
                  <TableHead className="text-right">Tồn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topLeast.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-6">Không có dữ liệu</TableCell></TableRow>
                ) : topLeast.map((r, i) => (
                  <TableRow key={r.variantId} className="text-xs">
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-muted-foreground text-[11px]">
                        {[r.typeName, r.width, r.color].filter(Boolean).join(' · ')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatNum(r.quantity)} {r.unit}</TableCell>
                    <TableCell className="text-right">{formatNum(stockByVariant.get(r.variantId) || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Detail collapsible */}
      <Card>
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2 h-8">
                  <CardTitle className="text-base">Chi tiết toàn bộ vải</CardTitle>
                  <Badge variant="secondary" className="h-5">{detailRows.length}</Badge>
                  {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <Button variant="outline" size="sm" onClick={handleExportDetails}>
                <Download className="h-3.5 w-3.5 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm theo mã/tên vải, màu, khổ..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <div className="rounded-md border max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow className="bg-primary/90 hover:bg-primary/90">
                      <TableHead className="text-primary-foreground text-xs py-2">Vải</TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2">Loại</TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2">Khổ</TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2">Màu</TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2 text-right">Đã dùng (kỳ)</TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2 text-right">Tồn kho</TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2 text-right">Tồn tối thiểu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRows.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-6">Không có dữ liệu</TableCell></TableRow>
                    ) : detailRows.map(r => {
                      const low = r.minStock > 0 && r.stock <= r.minStock;
                      return (
                        <TableRow key={r.id} className="text-xs">
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>{r.typeName}</TableCell>
                          <TableCell>{r.width}</TableCell>
                          <TableCell>{r.color}</TableCell>
                          <TableCell className="text-right">{formatNum(r.used)} {r.unit}</TableCell>
                          <TableCell className={cn("text-right", low && "text-destructive font-medium")}>
                            {formatNum(r.stock)} {r.unit}
                            {low && <Badge variant="destructive" className="ml-1 h-4 text-[10px]">Thấp</Badge>}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatNum(r.minStock)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
};

export default FabricReports;