import React, { useCallback, useMemo, useState } from 'react';
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Line, LineChart, Area, ComposedChart, PieChart, Pie, Cell, LabelList, Tooltip as RechartsTooltip } from 'recharts';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachQuarterOfInterval, isWithinInterval, differenceInMilliseconds, subMilliseconds, differenceInCalendarDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useFabricUsage, useFabricInventory, useWarehouses, useFabricTypes, useFabricCostHistory } from '@/hooks/useFabrics';
import { DEFAULT_LOW_STOCK_THRESHOLD_METERS } from '@/lib/fabricStock';

const exportToCSV = (rows: Record<string, any>[], filename: string, metadata: Record<string, string> = {}) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const metadataRows = Object.entries(metadata).map(([key, value]) => `${escape(key)},${escape(value)}`);
  const csv = [...metadataRows, '', headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
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

interface TopBarCardProps {
  title: string;
  icon: React.ReactNode;
  rows: { variantId: string; name: string; typeName: string; color: string; width: string; unit: string; quantity: number; value: number }[];
  stockByVariant: Map<string, number>;
  color: string;
  action?: React.ReactNode;
}

const TopBarCard: React.FC<TopBarCardProps> = ({ title, icon, rows, stockByVariant, color, action }) => {
  const data = rows.map(r => ({
    name: r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name,
    fullName: r.name,
    quantity: r.quantity,
    unit: r.unit,
    typeName: r.typeName,
    width: r.width,
    color: r.color,
    value: r.value,
    stock: stockByVariant.get(r.variantId) || 0,
  }));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">{icon} {title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground">Không có dữ liệu</div>
        ) : (
          <div style={{ height: Math.max(220, data.length * 32 + 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 50, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(Number(v))} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                <RechartsTooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
                        <div className="font-semibold mb-1">{d.fullName}</div>
                        <div className="text-muted-foreground text-[11px]">{[d.typeName, d.width, d.color].filter(Boolean).join(' · ')}</div>
                        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                          <span className="text-muted-foreground">Đã dùng:</span><span className="font-medium text-right">{formatNum(d.quantity)} {d.unit}</span>
                          <span className="text-muted-foreground">Giá trị:</span><span className="font-medium text-right">{formatCompact(d.value)} đ</span>
                          <span className="text-muted-foreground">Tồn kho:</span><span className="font-medium text-right">{formatNum(d.stock)} {d.unit}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="quantity" fill={color} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="quantity" position="right" className="fill-foreground" fontSize={10} formatter={(v: any) => formatCompact(Number(v))} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const FabricReports: React.FC = () => {
  const { data: usage, isLoading: usageLoading, isError: usageError } = useFabricUsage();
  const { data: inventory, isLoading: inventoryLoading, isError: inventoryError } = useFabricInventory();
  const { data: warehouses, isLoading: warehousesLoading, isError: warehousesError } = useWarehouses();
  const { data: fabricTypes, isLoading: typesLoading, isError: typesError } = useFabricTypes();
  const { data: costHistory, isLoading: costHistoryLoading, isError: costHistoryError } = useFabricCostHistory();

  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [warehouseKey, setWarehouseKey] = useState<string>('all');
  const [fabricTypeId, setFabricTypeId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('used');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const reportsLoading = usageLoading || inventoryLoading || warehousesLoading || typesLoading || costHistoryLoading;
  const reportsError = usageError || inventoryError || warehousesError || typesError || costHistoryError;

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

  const normalizeWarehouseName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const warehouseIdFor = (key: 'hanoi' | 'bacninh') =>
    warehouses?.find(w => normalizeWarehouseName(w.name || '').includes(key === 'hanoi' ? 'ha noi' : 'bac ninh'))?.id;

  const hanoiId = warehouseIdFor('hanoi');
  const bacninhId = warehouseIdFor('bacninh');
  const selectedWarehouseId = warehouseKey === 'all'
    ? undefined
    : warehouseKey === 'hanoi' ? hanoiId
      : warehouseKey === 'bacninh' ? bacninhId
        : warehouseKey;
  const selectedWarehouseLabel = warehouseKey === 'all'
    ? 'Tất cả xưởng'
    : warehouseKey === 'hanoi' ? 'Hà Nội'
      : warehouseKey === 'bacninh' ? 'Bắc Ninh'
        : warehouses?.find(w => w.id === warehouseKey)?.name || warehouseKey;
  const matchesWarehouse = useCallback((warehouseId: string) => !selectedWarehouseId || warehouseId === selectedWarehouseId, [selectedWarehouseId]);

  const costHistoryByVariant = useMemo(() => {
    const map = new Map<string, Array<{ date: number; price: number }>>();
    (costHistory || []).forEach((row: any) => {
      const price = Number(row.unit_price || 0);
      if (!row.fabric_variant_id || price <= 0) return;
      const list = map.get(row.fabric_variant_id) || [];
      list.push({ date: new Date(row.transaction_date || row.created_at).getTime(), price });
      map.set(row.fabric_variant_id, list);
    });
    map.forEach(list => list.sort((a, b) => a.date - b.date));
    return map;
  }, [costHistory]);

  const resolveCost = useCallback((variantId: string, date: string | Date, fallback: unknown) => {
    const list = costHistoryByVariant.get(variantId) || [];
    const at = new Date(date).getTime();
    let price: number | undefined;
    for (const item of list) {
      if (item.date <= at) price = item.price;
      else break;
    }
    if (price && price > 0) return { price, source: 'Lịch sử giao dịch', estimated: false };
    const current = Number(fallback || 0);
    if (current > 0) return { price: current, source: 'Giá hiện tại (ước tính)', estimated: true };
    return { price: 0, source: 'Chưa có giá vốn', estimated: true };
  }, [costHistoryByVariant]);

  const passesScope = useCallback((u: any) => {
    if (!matchesWarehouse(u.warehouse_id)) return false;
    if (fabricTypeId !== 'all' && u.fabric_variants?.fabric_type_id !== fabricTypeId) return false;
    return true;
  }, [fabricTypeId, matchesWarehouse]);

  // Filter usage in current and previous range
  const filteredUsage = useMemo(() => {
    if (!usage) return [];
    return usage.filter((u: any) => isWithinInterval(new Date(u.usage_date), interval) && passesScope(u));
  }, [usage, interval, passesScope]);

  const prevUsage = useMemo(() => {
    if (!usage) return [];
    return usage.filter((u: any) => isWithinInterval(new Date(u.usage_date), prevInterval) && passesScope(u));
  }, [usage, prevInterval, passesScope]);

  // KPIs - sum quantity by unit
  const kpis = useMemo(() => {
    const byUnit: Record<string, number> = {};
    let totalValue = 0;
    let valuedUsage = 0;
    let estimatedUsage = 0;
    let unvaluedUsage = 0;
    filteredUsage.forEach((u: any) => {
      const unit = u.unit || 'm';
      byUnit[unit] = (byUnit[unit] || 0) + Number(u.quantity_used || 0);
      const resolved = resolveCost(u.fabric_variant_id, u.usage_date, u.fabric_variants?.cost_price);
      if (resolved.price > 0) valuedUsage += Number(u.quantity_used || 0);
      else unvaluedUsage += Number(u.quantity_used || 0);
      if (resolved.estimated && resolved.price > 0) estimatedUsage += Number(u.quantity_used || 0);
      totalValue += resolved.price * Number(u.quantity_used || 0);
    });

    // Inventory totals (filtered by warehouse)
    let totalStock = 0;
    const stockByVariant = new Map<string, { stock: number; minimum: number; hasMinimum: boolean }>();
    let missingMinimum = 0;
    let stockValue = 0;
    let reservedStock = 0;
    const stockByUnit: Record<string, number> = {};
    (inventory || []).forEach((inv: any) => {
      if (!matchesWarehouse(inv.warehouse_id)) return;
      if (fabricTypeId !== 'all' && inv.fabric_variants?.fabric_type_id !== fabricTypeId) return;
      const unit = inv.fabric_variants?.unit || 'm';
      const cur = Number(inv.current_stock || 0);
      reservedStock += Number(inv.reserved_stock || 0);
      stockByUnit[unit] = (stockByUnit[unit] || 0) + cur;
      totalStock += cur;
      stockValue += cur * resolveCost(inv.fabric_variant_id, new Date(), inv.fabric_variants?.cost_price).price;
      const aggregate = stockByVariant.get(inv.fabric_variant_id) || { stock: 0, minimum: 0, hasMinimum: false };
      aggregate.stock += cur;
      const minimum = Number(inv.minimum_stock || 0);
      if (minimum > 0) {
        aggregate.minimum += minimum;
        aggregate.hasMinimum = true;
      }
      stockByVariant.set(inv.fabric_variant_id, aggregate);
      if (!(Number(inv.minimum_stock || 0) > 0)) missingMinimum++;
    });

    const unvaluedStock = (inventory || []).filter((inv: any) => {
      if (!matchesWarehouse(inv.warehouse_id)) return false;
      if (fabricTypeId !== 'all' && inv.fabric_variants?.fabric_type_id !== fabricTypeId) return false;
      return Number(inv.current_stock || 0) > 0 && resolveCost(inv.fabric_variant_id, new Date(), inv.fabric_variants?.cost_price).price <= 0;
    }).length;
    const lowStock = Array.from(stockByVariant.values()).filter(item =>
      item.hasMinimum ? item.stock <= item.minimum : item.stock <= DEFAULT_LOW_STOCK_THRESHOLD_METERS
    ).length;
    return { byUnit, totalValue, stockByUnit, totalStock, reservedStock, stockValue, lowStock, missingMinimum, unvaluedStock, valuedUsage, estimatedUsage, unvaluedUsage };
  }, [filteredUsage, inventory, fabricTypeId, matchesWarehouse, resolveCost]);

  // Previous-period KPIs for delta
  const prevKpis = useMemo(() => {
    const byUnit: Record<string, number> = {};
    let totalQty = 0, totalValue = 0;
    prevUsage.forEach((u: any) => {
      const q = Number(u.quantity_used || 0);
      const unit = u.unit || 'm';
      byUnit[unit] = (byUnit[unit] || 0) + q;
      totalQty += q;
      totalValue += q * resolveCost(u.fabric_variant_id, u.usage_date, u.fabric_variants?.cost_price).price;
    });
    return { byUnit, totalQty, totalValue };
  }, [prevUsage, resolveCost]);

  const quantityUnits = Object.keys(kpis.byUnit);
  const currTotalQty = quantityUnits.length === 1 ? kpis.byUnit[quantityUnits[0]] : 0;
  const quantityDelta = quantityUnits.length === 1
    ? <DeltaBadge curr={currTotalQty} prev={prevKpis.byUnit[quantityUnits[0]] || 0} />
    : <span className="text-[11px] text-muted-foreground">Không so sánh gộp nhiều đơn vị</span>;
  const trendUnit = Object.entries(kpis.byUnit).sort((a, b) => b[1] - a[1])[0]?.[0];

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
      let hanoi = 0, bacninh = 0, other = 0, total = 0;
      filteredUsage.forEach((u: any) => {
        const d = new Date(u.usage_date);
        if (d < b.start || d > b.end) return;
        const q = Number(u.quantity_used || 0);
        if (trendUnit && (u.unit || 'm') !== trendUnit) return;
        total += q;
        if (u.warehouse_id === hanoiId) hanoi += q;
        else if (u.warehouse_id === bacninhId) bacninh += q;
        else other += q;
      });
      return { label: b.label, start: b.start, end: b.end, hanoi, bacninh, other, total };
    });
  }, [filteredUsage, interval, hanoiId, bacninhId, trendUnit]);

  // Order-group allocation is deliberately separate from customer_code:
  // customer_code remains the customer identifier, while order_group is the
  // Phước/Hoan business grouping used by this report.
  const orderGroupSummary = useMemo(() => {
    const totals = { don_phuoc: 0, don_hoan: 0, unclassified: 0 };
    const orders = { don_phuoc: new Set<string>(), don_hoan: new Set<string>(), unclassified: new Set<string>() };
    filteredUsage.forEach((u: any) => {
      const raw = u.order_group || (u.customer_code === 'don_phuoc' || u.customer_code === 'don_hoan' ? u.customer_code : 'unclassified');
      const group = raw === 'don_phuoc' || raw === 'don_hoan' ? raw : 'unclassified';
      totals[group] += Number(u.quantity_used || 0);
      if (u.order_id || u.order_number) orders[group].add(u.order_id || u.order_number);
    });
    const total = totals.don_phuoc + totals.don_hoan + totals.unclassified;
    return [
      { key: 'don_phuoc', label: 'Phước', quantity: totals.don_phuoc, orders: orders.don_phuoc.size, color: 'hsl(217 91% 60%)' },
      { key: 'don_hoan', label: 'Hoan', quantity: totals.don_hoan, orders: orders.don_hoan.size, color: 'hsl(142 71% 45%)' },
      { key: 'unclassified', label: 'Chưa phân loại', quantity: totals.unclassified, orders: orders.unclassified.size, color: 'hsl(38 92% 50%)' },
    ].map(row => ({ ...row, share: total > 0 ? (row.quantity / total) * 100 : 0 }));
  }, [filteredUsage]);

  const orderGroupTrend = useMemo(() => {
    return trendData.map(bucket => {
      const result: Record<string, number | string> = { label: bucket.label, don_phuoc: 0, don_hoan: 0, unclassified: 0 };
      filteredUsage.forEach((u: any) => {
        const date = new Date(u.usage_date);
        if (date < bucket.start || date > bucket.end) return;
        const raw = u.order_group || (u.customer_code === 'don_phuoc' || u.customer_code === 'don_hoan' ? u.customer_code : 'unclassified');
        const group = raw === 'don_phuoc' || raw === 'don_hoan' ? raw : 'unclassified';
        result[group] = Number(result[group] || 0) + Number(u.quantity_used || 0);
      });
      return result;
    });
  }, [trendData, filteredUsage]);

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
      existing.value += q * resolveCost(id, u.usage_date, v.cost_price).price;
      map.set(id, existing);
    });
    return Array.from(map.values());
  }, [filteredUsage, resolveCost]);

  // Stock lookup per variant (sum across selected warehouse scope)
  const stockByVariant = useMemo(() => {
    const map = new Map<string, number>();
    (inventory || []).forEach((inv: any) => {
      if (!matchesWarehouse(inv.warehouse_id)) return;
      const prev = map.get(inv.fabric_variant_id) || 0;
      map.set(inv.fabric_variant_id, prev + Number(inv.current_stock || 0));
    });
    return map;
  }, [inventory, matchesWarehouse]);

  const topMost = useMemo(
    () => [...variantAgg].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    [variantAgg]
  );
  const topLeast = useMemo(
    () => [...variantAgg].filter(v => v.quantity > 0).sort((a, b) => a.quantity - b.quantity).slice(0, 10),
    [variantAgg]
  );

  // Trend stats
  const trendStats = useMemo(() => {
    const totals = trendData.map((b: any) => b.total);
    const sum = totals.reduce((a, b) => a + b, 0);
    const days = Math.max(1, differenceInCalendarDays(interval.end, interval.start) + 1);
    const peakIdx = totals.length ? totals.indexOf(Math.max(...totals)) : -1;
    return {
      sum,
      avgPerDay: sum / days,
      peakLabel: peakIdx >= 0 ? (trendData[peakIdx] as any).label : '—',
      peakValue: peakIdx >= 0 ? totals[peakIdx] : 0,
    };
  }, [trendData, interval]);

  // Composition by fabric type
  const typeComposition = useMemo(() => {
    const map = new Map<string, number>();
    filteredUsage.forEach((u: any) => {
      const name = u.fabric_variants?.fabric_types?.name || 'Khác';
      map.set(name, (map.get(name) || 0) + Number(u.quantity_used || 0));
    });
    const arr = Array.from(map.entries()).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    if (arr.length <= 6) return arr;
    const top = arr.slice(0, 5);
    const rest = arr.slice(5).reduce((s, x) => s + x.value, 0);
    return [...top, { name: 'Khác', value: rest }];
  }, [filteredUsage]);

  // Composition by warehouse
  const warehouseComposition = useMemo(() => {
    let h = 0, b = 0, other = 0;
    filteredUsage.forEach((u: any) => {
      const q = Number(u.quantity_used || 0);
      if (u.warehouse_id === hanoiId) h += q;
      else if (u.warehouse_id === bacninhId) b += q;
      else other += q;
    });
    const result = [
      { name: 'Hà Nội', value: h, color: COLOR_HANOI },
      { name: 'Bắc Ninh', value: b, color: COLOR_BACNINH },
    ];
    if (other > 0) result.push({ name: 'Kho khác/chưa xác định', value: other, color: CHART_COLORS[2] });
    return result;
  }, [filteredUsage, hanoiId, bacninhId]);

  // Low-stock list
  const lowStockList = useMemo(() => {
    if (!inventory) return [];
    const arr: any[] = [];
    inventory.forEach((inv: any) => {
      if (!matchesWarehouse(inv.warehouse_id)) return;
      if (fabricTypeId !== 'all' && inv.fabric_variants?.fabric_type_id !== fabricTypeId) return;
      const cur = Number(inv.current_stock || 0);
      const min = Number(inv.minimum_stock || 0);
      const threshold = min > 0 ? min : DEFAULT_LOW_STOCK_THRESHOLD_METERS;
      if (cur <= threshold) {
        arr.push({
          id: inv.id,
          name: inv.fabric_variants?.variant_name || '',
          width: inv.fabric_variants?.width_code || '',
          color: inv.fabric_variants?.color || '',
          warehouse: inv.warehouses?.name || '',
          unit: inv.fabric_variants?.unit || 'm',
          stock: cur,
          min: threshold,
          hasMinimum: min > 0,
          deficit: threshold - cur,
        });
      }
    });
    return arr.sort((a, b) => b.deficit - a.deficit).slice(0, 5);
  }, [inventory, matchesWarehouse, fabricTypeId]);

  // Detail table (all variants with optional filters)
  const detailRows = useMemo(() => {
    if (!inventory) return [];
    const usageMap = new Map<string, number>();
    variantAgg.forEach(v => usageMap.set(v.variantId, v.quantity));

    // Aggregate per variant (sum of warehouses in scope)
    const map = new Map<string, any>();
    inventory.forEach((inv: any) => {
      if (!matchesWarehouse(inv.warehouse_id)) return;
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
        cost: resolveCost(id, new Date(), v.cost_price).price,
        costSource: resolveCost(id, new Date(), v.cost_price).source,
        costEstimated: resolveCost(id, new Date(), v.cost_price).estimated,
        value: 0,
      };
      existing.stock += cur;
      // Minimum stock is configured per warehouse; aggregate it with stock.
      existing.minStock += min;
      existing.value = existing.stock * existing.cost;
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
    const cmp = (a: any, b: any) => {
      const ka = sortKey === 'name' ? String(a.name).localeCompare(String(b.name))
        : (a[sortKey] || 0) - (b[sortKey] || 0);
      return sortDir === 'asc' ? ka : -ka;
    };
    return rows.sort(cmp);
  }, [inventory, variantAgg, matchesWarehouse, fabricTypeId, search, sortKey, sortDir, resolveCost]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const handleExportTop = () => {
    const rows = topMost.map(r => ({
      'Tên vải': r.name,
      'Loại': r.typeName,
      'Khổ': r.width,
      'Màu': r.color,
      'SL đã dùng': r.quantity,
      'Đơn vị': r.unit,
       'Giá trị': r.value,
       'Nguồn giá vốn': r.value > 0 ? 'Giá lịch sử hoặc giá hiện tại' : 'Chưa có giá vốn',
       'Kỳ báo cáo': periodLabel,
       'Kho/xưởng': selectedWarehouseLabel,
       'Loại vải': fabricTypeId === 'all' ? 'Tất cả' : (fabricTypes?.find(t => t.id === fabricTypeId)?.name || fabricTypeId),
      'Tồn kho': stockByVariant.get(r.variantId) || 0,
    }));
     exportToCSV(rows, `vai-dung-nhieu-${format(new Date(), 'yyyyMMdd')}.csv`, {
       'Kỳ báo cáo': periodLabel,
        'Kho/xưởng': selectedWarehouseLabel,
       'Loại vải': fabricTypeId === 'all' ? 'Tất cả' : (fabricTypes?.find(t => t.id === fabricTypeId)?.name || fabricTypeId),
     });
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
       'Giá trị tồn (VND)': r.value,
       'Nguồn giá vốn': r.costSource,
      'Đơn vị': r.unit,
    }));
     exportToCSV(rows, `chi-tiet-vai-${format(new Date(), 'yyyyMMdd')}.csv`, {
       'Kỳ báo cáo': periodLabel,
       'Kho/xưởng': selectedWarehouseLabel,
       'Loại vải': fabricTypeId === 'all' ? 'Tất cả' : (fabricTypes?.find(t => t.id === fabricTypeId)?.name || fabricTypeId),
     });
  };

  const handleExportOrderGroups = () => {
    exportToCSV(orderGroupSummary.map(row => ({
      'Loại đơn': row.label,
      'Số mét': row.quantity,
      'Tỷ trọng (%)': Number(row.share.toFixed(2)),
      'Số đơn': row.orders,
      'Đơn vị': 'm',
    })), `phan-bo-don-phuoc-hoan-${format(new Date(), 'yyyyMMdd')}.csv`, {
      'Kỳ báo cáo': periodLabel,
      'Kho/xưởng': selectedWarehouseLabel,
    });
  };

  const periodLabel = `${format(interval.start, 'dd/MM/yyyy', { locale: vi })} - ${format(interval.end, 'dd/MM/yyyy', { locale: vi })}`;

  return (
    <div className="space-y-4">
      {reportsLoading && (
        <Card><CardContent className="py-3 text-center text-sm text-muted-foreground">Đang cập nhật dữ liệu báo cáo...</CardContent></Card>
      )}
      {reportsError && (
        <Card className="border-destructive"><CardContent className="py-3 text-center text-sm text-destructive">Một phần dữ liệu báo cáo chưa tải được. Các số liệu có thể chưa đầy đủ.</CardContent></Card>
      )}
      {(kpis.unvaluedStock > 0 || kpis.unvaluedUsage > 0 || kpis.estimatedUsage > 0 || costHistoryError) && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-3 text-sm text-amber-900 dark:text-amber-100">
            <div className="font-medium">Cần bổ sung giá vốn để báo cáo giá trị chính xác.</div>
            <div className="text-xs mt-1 opacity-80">
              {kpis.unvaluedStock > 0 && `${kpis.unvaluedStock} dòng tồn kho chưa có giá vốn. `}
              {kpis.unvaluedUsage > 0 && `${formatNum(kpis.unvaluedUsage)} đơn vị sử dụng chưa có giá vốn. `}
              {kpis.estimatedUsage > 0 && `Một phần lượng đã dùng đang dùng giá hiện tại để ước tính. `}
              {costHistoryError && 'Không tải được lịch sử giá nhập.'}
            </div>
          </CardContent>
        </Card>
      )}
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
              <Select value={warehouseKey} onValueChange={setWarehouseKey}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả xưởng</SelectItem>
                  {hanoiId && <SelectItem value="hanoi">Hà Nội</SelectItem>}
                  {bacninhId && <SelectItem value="bacninh">Bắc Ninh</SelectItem>}
                  {(warehouses || []).filter(w => w.id !== hanoiId && w.id !== bacninhId).map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SL đã sử dụng</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-bold space-y-0.5">
              {Object.keys(kpis.byUnit).length === 0 ? (
                <div>0</div>
              ) : (
                Object.entries(kpis.byUnit).map(([u, q]) => (
                  <div key={u}>{formatNum(q)} <span className="text-sm font-normal text-muted-foreground">{u}</span></div>
                ))
              )}
            </div>
            <div className="mt-1">{quantityDelta}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-sidebar-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Giá trị đã dùng</CardTitle>
            <TrendingUp className="h-4 w-4 text-sidebar-primary" />
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-bold">{kpis.totalValue > 0 ? <>{formatCompact(kpis.totalValue)}<span className="text-xs font-normal text-muted-foreground ml-1">đ</span></> : <span className="text-amber-600">Chưa có giá vốn</span>}</div>
            <div className="mt-1"><DeltaBadge curr={kpis.totalValue} prev={prevKpis.totalValue} /></div>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: CHART_COLORS[2] }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tồn kho hiện tại</CardTitle>
            <BarChart3 className="h-4 w-4" style={{ color: CHART_COLORS[2] }} />
          </CardHeader>
          <CardContent className="pb-3">
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
        <Card className="border-l-4" style={{ borderLeftColor: CHART_COLORS[3] }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Giá trị tồn kho</CardTitle>
            <Wallet className="h-4 w-4" style={{ color: CHART_COLORS[3] }} />
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-bold">{kpis.stockValue > 0 ? <>{formatCompact(kpis.stockValue)}<span className="text-xs font-normal text-muted-foreground ml-1">đ</span></> : <span className="text-amber-600">Chưa có giá vốn</span>}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{kpis.stockValue > 0 ? formatCurrency(kpis.stockValue) : 'Chưa có giá vốn'}</div>
          </CardContent>
        </Card>
        <Card className={cn("border-l-4", kpis.lowStock > 0 ? "border-l-destructive" : "border-l-sidebar-primary")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sắp hết hàng</CardTitle>
            {kpis.lowStock > 0
              ? <AlertTriangle className="h-4 w-4 text-destructive" />
              : <CheckCircle2 className="h-4 w-4 text-sidebar-primary" />}
          </CardHeader>
          <CardContent className="pb-3">
            <div className={cn("text-xl font-bold", kpis.lowStock > 0 ? "text-destructive" : "text-sidebar-primary")}>{kpis.lowStock}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {kpis.lowStock > 0 ? 'mã vải dưới tồn tối thiểu' : kpis.missingMinimum > 0 ? `${kpis.missingMinimum} dòng chưa cấu hình mức tối thiểu` : 'Đủ tồn'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Phước/Hoan allocation */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Phân bổ sử dụng theo loại đơn</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Đơn vị thống nhất: mét (m). Tổng gồm cả phần chưa phân loại.</p>
            </div>
            <div className="flex items-center gap-2"><Badge variant="outline">Tổng: {formatNum(orderGroupSummary.reduce((sum, row) => sum + row.quantity, 0))} m</Badge><Button variant="outline" size="sm" onClick={handleExportOrderGroups}><Download className="h-3.5 w-3.5 mr-1" />Xuất CSV</Button></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {orderGroupSummary.map(row => (
              <div key={row.key} className="rounded-md border p-3" style={{ borderLeftWidth: 4, borderLeftColor: row.color }}>
                <div className="text-xs text-muted-foreground">Đơn {row.label}</div>
                <div className="text-xl font-bold tabular-nums">{formatNum(row.quantity)} <span className="text-sm font-normal text-muted-foreground">m</span></div>
                <div className="text-xs text-muted-foreground mt-1">{row.share.toFixed(1)}% · {row.orders} đơn</div>
              </div>
            ))}
          </div>
          <div className="h-[260px]">
            {orderGroupTrend.length === 0 ? <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Không có dữ liệu</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderGroupTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompact(Number(v))} />
                  <RechartsTooltip formatter={(value: number, name: string) => [formatNum(Number(value)) + ' m', name === 'don_phuoc' ? 'Phước' : name === 'don_hoan' ? 'Hoan' : 'Chưa phân loại']} />
                  <Bar dataKey="don_phuoc" stackId="group" fill="hsl(217 91% 60%)" name="Phước" />
                  <Bar dataKey="don_hoan" stackId="group" fill="hsl(142 71% 45%)" name="Hoan" />
                  <Bar dataKey="unclassified" stackId="group" fill="hsl(38 92% 50%)" name="Chưa phân loại" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Loại đơn</TableHead><TableHead className="text-right">Số mét</TableHead><TableHead className="text-right">Tỷ trọng</TableHead><TableHead className="text-right">Số đơn</TableHead></TableRow></TableHeader>
            <TableBody>{orderGroupSummary.map(row => <TableRow key={row.key}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right tabular-nums">{formatNum(row.quantity)} m</TableCell><TableCell className="text-right tabular-nums">{row.share.toFixed(1)}%</TableCell><TableCell className="text-right tabular-nums">{row.orders}</TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Trend chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Xu hướng sử dụng vải</CardTitle>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>Tổng kỳ: <span className="font-semibold text-foreground">{formatNum(trendStats.sum)} {trendUnit || ''}</span></span>
              <span>TB/ngày: <span className="font-semibold text-foreground">{formatNum(trendStats.avgPerDay, 1)} {trendUnit || ''}</span></span>
              <span>Đỉnh: <span className="font-semibold text-foreground">{formatNum(trendStats.peakValue)} {trendUnit || ''}</span> ({trendStats.peakLabel})</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              total: { label: 'Tổng', color: COLOR_TOTAL },
              hanoi: { label: 'Hà Nội', color: COLOR_HANOI },
              bacninh: { label: 'Bắc Ninh', color: COLOR_BACNINH },
              other: { label: 'Kho khác/chưa xác định', color: CHART_COLORS[2] },
            }}
            className="h-[320px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradHanoi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR_HANOI} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLOR_HANOI} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradBacninh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR_BACNINH} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLOR_BACNINH} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompact(Number(v))} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area type="monotone" dataKey="hanoi" stroke={COLOR_HANOI} strokeWidth={2} fill="url(#gradHanoi)" name="Hà Nội" />
                <Area type="monotone" dataKey="bacninh" stroke={COLOR_BACNINH} strokeWidth={2} fill="url(#gradBacninh)" name="Bắc Ninh" />
                <Line type="monotone" dataKey="other" stroke={CHART_COLORS[2]} strokeWidth={2} name="Kho khác/chưa xác định" />
                <Line type="monotone" dataKey="total" stroke={COLOR_TOTAL} strokeWidth={2} strokeDasharray="4 4" dot={false} name="Tổng" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Composition + Low stock alert */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Cơ cấu theo loại vải</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[260px]">
              {typeComposition.length === 0 || typeComposition.every(t => t.value === 0) ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Không có dữ liệu</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeComposition} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {typeComposition.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value: number, _name: string, item: any) => [formatNum(Number(value)), item?.payload?.name || 'Số lượng']} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-2 space-y-1">
              {typeComposition.slice(0, 5).map((t, i) => {
                const total = typeComposition.reduce((s, x) => s + x.value, 0) || 1;
                const pct = (t.value / total) * 100;
                return (
                  <div key={t.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="truncate">{t.name}</span>
                    </div>
                    <span className="text-muted-foreground tabular-nums">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Cơ cấu theo xưởng</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[260px]">
              {warehouseComposition.every(t => t.value === 0) ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Không có dữ liệu</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={warehouseComposition} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} label={(e: any) => `${e.name}: ${((e.percent || 0) * 100).toFixed(0)}%`}>
                      {warehouseComposition.map((w, i) => <Cell key={i} fill={w.color} />)}
                    </Pie>
                    <RechartsTooltip formatter={(value: number, _name: string, item: any) => [formatNum(Number(value)), item?.payload?.name || 'Số lượng']} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              {warehouseComposition.map((w) => (
                <div key={w.name} className="flex items-center justify-between border rounded px-2 py-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: w.color }} />
                    <span>{w.name}</span>
                  </div>
                  <span className="font-medium tabular-nums">{formatNum(w.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Cảnh báo tồn thấp
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStockList.length === 0 ? (
              <div className="h-[240px] flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                {kpis.missingMinimum > 0 ? (
                  <>
                    <AlertTriangle className="h-8 w-8 text-amber-500" />
                    <span>Chưa đủ dữ liệu mức tồn tối thiểu</span>
                    <span className="text-xs">{kpis.missingMinimum} dòng chưa cấu hình</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-8 w-8 text-sidebar-primary" />
                    <span>Tất cả vải đủ tồn</span>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockList.map(r => {
                  const pct = Math.min(100, (r.stock / Math.max(1, r.min)) * 100);
                  return (
                    <div key={r.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="truncate">
                          <div className="font-medium truncate">{r.name}</div>
                          <div className="text-muted-foreground text-[11px] truncate">
                            {[r.width, r.color, r.warehouse].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <span className="font-semibold text-destructive">{formatNum(r.stock)}</span>
                          <span className="text-muted-foreground"> / {formatNum(r.min)} {r.unit}{!r.hasMinimum && ' (mặc định)'}</span>
                        </div>
                      </div>
                      <Progress value={pct} className="h-1.5 [&>div]:bg-destructive" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top horizontal bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopBarCard
          title="Vải dùng nhiều nhất"
          icon={<TrendingUp className="h-4 w-4 text-sidebar-primary" />}
          rows={topMost}
          stockByVariant={stockByVariant}
          color={COLOR_HANOI}
          action={<Button variant="outline" size="sm" onClick={handleExportTop}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>}
        />
        <TopBarCard
          title="Vải dùng ít nhất (có phát sinh)"
          icon={<TrendingDown className="h-4 w-4 text-destructive" />}
          rows={topLeast}
          stockByVariant={stockByVariant}
          color={CHART_COLORS[2]}
        />
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
                      <TableHead className="text-primary-foreground text-xs py-2 cursor-pointer select-none" onClick={() => toggleSort('name')}>
                        <span className="inline-flex items-center gap-1">Vải <ArrowUpDown className="h-3 w-3 opacity-70" /></span>
                      </TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2">Loại</TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2">Khổ</TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2">Màu</TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2 text-right cursor-pointer select-none" onClick={() => toggleSort('used')}>
                        <span className="inline-flex items-center gap-1 justify-end w-full">Đã dùng (kỳ) <ArrowUpDown className="h-3 w-3 opacity-70" /></span>
                      </TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2 text-right cursor-pointer select-none" onClick={() => toggleSort('stock')}>
                        <span className="inline-flex items-center gap-1 justify-end w-full">Tồn kho <ArrowUpDown className="h-3 w-3 opacity-70" /></span>
                      </TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2 text-right">Tồn / Min</TableHead>
                      <TableHead className="text-primary-foreground text-xs py-2 text-right cursor-pointer select-none" onClick={() => toggleSort('value')}>
                        <span className="inline-flex items-center gap-1 justify-end w-full">Giá trị tồn <ArrowUpDown className="h-3 w-3 opacity-70" /></span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRows.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-6">Không có dữ liệu</TableCell></TableRow>
                    ) : detailRows.map(r => {
                      const low = r.minStock > 0 && r.stock <= r.minStock;
                      const pct = r.minStock > 0 ? Math.min(200, (r.stock / r.minStock) * 100) : 100;
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
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-muted-foreground text-[11px] tabular-nums w-12 text-right">{r.minStock > 0 ? `${pct.toFixed(0)}%` : '—'}</span>
                              <div className="w-16 h-1.5 bg-muted rounded overflow-hidden">
                                <div
                                  className={cn("h-full", low ? "bg-destructive" : pct < 150 ? "bg-amber-500" : "bg-sidebar-primary")}
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums" title={r.costSource}>
                            {r.value > 0 ? formatCompact(r.value) : <span className="text-amber-600">Chưa có giá vốn</span>}
                          </TableCell>
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
