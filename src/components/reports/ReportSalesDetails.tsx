import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Download } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ReportSalesDetailsProps {
  filteredOrders: any[];
  monthlyData: any[];
  formatCurrency: (amount: number) => string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ xử lý",
  processing: "Đang xử lý",
  shipped: "Đã giao",
  delivered: "Đã giao",
  self_delivered: "Đã giao tự thu tiền",
  returned: "Hoàn hàng",
  cancelled: "Đã hủy",
};

const ReportSalesDetails = ({ filteredOrders, monthlyData, formatCurrency }: ReportSalesDetailsProps) => {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "quantity" | "revenue" | "orderCount">("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Fetch assignees
  const { data: assignees = [] } = useQuery({
    queryKey: ["assignees-reports"],
    queryFn: async () => {
      if (isLocalBackend()) return localApi.assignees();
      const { data, error } = await supabase.from("assignees").select("*").order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });

  // Top 10 products
  const topProducts = useMemo(() => {
    const productMap = new Map<string, { name: string; sku: string; quantity: number; revenue: number }>();
    filteredOrders.forEach(order => {
      if (!order.items) return;
      try {
        const items = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
        items.forEach((item: any) => {
          const key = item.sku || item.product?.sku || item.product?.id || item.originalProductId || item.name || "unknown";
          const existing = productMap.get(key) || { name: item.name || item.product?.name || "N/A", sku: item.sku || item.product?.sku || "-", quantity: 0, revenue: 0 };
          existing.quantity += Number(item.quantity || 0);
          existing.revenue += Number(item.total || 0) || (Number(item.price || 0) * Number(item.quantity || 1));
          productMap.set(key, existing);
        });
      } catch { /* skip */ }
    });
    const totalRevenue = Array.from(productMap.values()).reduce((s, p) => s + p.revenue, 0);
    return Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map(p => ({ ...p, percentage: totalRevenue > 0 ? ((p.revenue / totalRevenue) * 100).toFixed(1) : "0" }));
  }, [filteredOrders]);

  // Revenue by assignee
  const revenueByAssignee = useMemo(() => {
    const assigneeMap = new Map<string, { name: string; orderCount: number; totalRevenue: number }>();
    filteredOrders.forEach(order => {
      const assigneeId = order.assignee_id;
      if (!assigneeId) return;
      const assignee = assignees.find((a: any) => a.id === assigneeId);
      const name = assignee?.name || "Không xác định";
      const existing = assigneeMap.get(assigneeId) || { name, orderCount: 0, totalRevenue: 0 };
      existing.orderCount += 1;
      existing.totalRevenue += Number(order.total_amount || 0);
      assigneeMap.set(assigneeId, existing);
    });
    return Array.from(assigneeMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .map(a => ({ ...a, avgOrderValue: a.orderCount > 0 ? a.totalRevenue / a.orderCount : 0 }));
  }, [filteredOrders, assignees]);

  // Order status breakdown
  const orderStatusData = useMemo(() => {
    const statusMap = new Map<string, number>();
    filteredOrders.forEach(order => {
      const status = order.status || "pending";
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    });
    return Array.from(statusMap.entries()).map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
    }));
  }, [filteredOrders]);

  // ALL products sold (detailed)
  const allProducts = useMemo(() => {
    const map = new Map<string, { name: string; sku: string; unit: string; quantity: number; revenue: number; orderCount: number; lastSoldAt: Date | null }>();
    filteredOrders.forEach(order => {
      if (!order.items) return;
      try {
        const items = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
        const orderDate = order.created_at ? new Date(order.created_at) : null;
        const seenInOrder = new Set<string>();
        items.forEach((item: any) => {
          const key = (item.sku || item.product?.sku || item.product?.id || item.originalProductId || item.name || "unknown").toString();
          const existing = map.get(key) || {
            name: item.name || item.product?.name || "N/A",
            sku: item.sku || item.product?.sku || "-",
            unit: item.unit || "",
            quantity: 0,
            revenue: 0,
            orderCount: 0,
            lastSoldAt: null as Date | null,
          };
          existing.quantity += Number(item.quantity || 0);
          existing.revenue += Number(item.total || 0) || (Number(item.price || 0) * Number(item.quantity || 1));
          if (!seenInOrder.has(key)) {
            existing.orderCount += 1;
            seenInOrder.add(key);
          }
          if (orderDate && (!existing.lastSoldAt || orderDate > existing.lastSoldAt)) {
            existing.lastSoldAt = orderDate;
          }
          map.set(key, existing);
        });
      } catch { /* skip */ }
    });
    return Array.from(map.values());
  }, [filteredOrders]);

  const totalAllRevenue = useMemo(() => allProducts.reduce((s, p) => s + p.revenue, 0), [allProducts]);

  const filteredAllProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allProducts;
    if (q) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir;
    });
    return list;
  }, [allProducts, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredAllProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pagedProducts = filteredAllProducts.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
    setPage(0);
  };

  const exportCsv = () => {
    const headers = ["#", "Tên sản phẩm", "SKU", "Đơn vị", "Số lượng", "Đơn giá TB", "Doanh thu", "% DT", "Số đơn", "Lần bán gần nhất"];
    const rows = filteredAllProducts.map((p, i) => {
      const avg = p.quantity > 0 ? p.revenue / p.quantity : 0;
      const pct = totalAllRevenue > 0 ? (p.revenue / totalAllRevenue) * 100 : 0;
      return [
        i + 1,
        `"${(p.name || "").replace(/"/g, '""')}"`,
        `"${(p.sku || "").replace(/"/g, '""')}"`,
        `"${(p.unit || "").replace(/"/g, '""')}"`,
        p.quantity,
        Math.round(avg),
        Math.round(p.revenue),
        pct.toFixed(2),
        p.orderCount,
        p.lastSoldAt ? format(p.lastSoldAt, "dd/MM/yyyy") : "",
      ].join(",");
    });
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chi-tiet-san-pham-ban-ra-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Monthly Revenue BarChart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            📊 Doanh thu theo tháng
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 50, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="revenue" fill="#3b82f6" name="Doanh thu" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top Products Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            🏆 Top 10 sản phẩm bán chạy
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Không có dữ liệu</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Tên sản phẩm</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">SL bán</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                    <TableHead className="text-right">% DT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-bold">{i + 1}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.sku}</TableCell>
                      <TableCell className="text-right">{p.quantity}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(p.revenue)}</TableCell>
                      <TableCell className="text-right">{p.percentage}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Products Sold - Detailed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            📦 Chi tiết tất cả sản phẩm bán ra
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
            <Input
              placeholder="Tìm theo tên hoặc SKU..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="md:w-80"
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {filteredAllProducts.length} sản phẩm
              </span>
              <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv} disabled={filteredAllProducts.length === 0}>
                <Download className="h-4 w-4" /> Xuất CSV
              </Button>
            </div>
          </div>

          {filteredAllProducts.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Không có dữ liệu</p>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>
                        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("name")}>
                          Tên sản phẩm <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>ĐV</TableHead>
                      <TableHead className="text-right">
                        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("quantity")}>
                          SL bán <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">Đơn giá TB</TableHead>
                      <TableHead className="text-right">
                        <button className="inline-flex items-center gap-1 hover:text-foreground ml-auto" onClick={() => toggleSort("revenue")}>
                          Doanh thu <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">% DT</TableHead>
                      <TableHead className="text-right">
                        <button className="inline-flex items-center gap-1 hover:text-foreground ml-auto" onClick={() => toggleSort("orderCount")}>
                          Số đơn <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">Lần bán gần nhất</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedProducts.map((p, i) => {
                      const idx = currentPage * PAGE_SIZE + i + 1;
                      const avg = p.quantity > 0 ? p.revenue / p.quantity : 0;
                      const pct = totalAllRevenue > 0 ? (p.revenue / totalAllRevenue) * 100 : 0;
                      return (
                        <TableRow key={`${p.sku}-${p.name}-${i}`}>
                          <TableCell className="font-bold">{idx}</TableCell>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-muted-foreground">{p.sku}</TableCell>
                          <TableCell className="text-muted-foreground">{p.unit || "-"}</TableCell>
                          <TableCell className="text-right">{p.quantity.toLocaleString("vi-VN")}</TableCell>
                          <TableCell className="text-right">{formatCurrency(avg)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(p.revenue)}</TableCell>
                          <TableCell className="text-right">{pct.toFixed(1)}%</TableCell>
                          <TableCell className="text-right">{p.orderCount}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {p.lastSoldAt ? format(p.lastSoldAt, "dd/MM/yyyy") : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={4}>Tổng cộng (đã lọc)</TableCell>
                      <TableCell className="text-right">
                        {filteredAllProducts.reduce((s, p) => s + p.quantity, 0).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right">
                        {formatCurrency(filteredAllProducts.reduce((s, p) => s + p.revenue, 0))}
                      </TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Trang {currentPage + 1} / {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>
                      Trước
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}>
                      Sau
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Revenue by Assignee */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            👥 Doanh thu theo nhân viên
          </CardTitle>
        </CardHeader>
        <CardContent>
          {revenueByAssignee.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Không có dữ liệu nhân viên</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead className="text-right">Số đơn</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                    <TableHead className="text-right">TB/đơn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenueByAssignee.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-bold">{i + 1}</TableCell>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-right">{a.orderCount}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(a.totalRevenue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(a.avgOrderValue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Status Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            📋 Phân bố trạng thái đơn hàng
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Số lượng</TableHead>
                  <TableHead className="text-right">Tỷ lệ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderStatusData.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant="outline">{row.name}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{row.value}</TableCell>
                    <TableCell className="text-right">
                      {filteredOrders.length > 0 ? ((row.value / filteredOrders.length) * 100).toFixed(1) : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default ReportSalesDetails;
