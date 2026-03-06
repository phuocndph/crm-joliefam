import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ReportSalesDetailsProps {
  filteredOrders: any[];
  monthlyData: any[];
  formatCurrency: (amount: number) => string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ xử lý",
  confirmed: "Đã xác nhận",
  producing: "Đang sản xuất",
  shipping: "Đang giao",
  delivered: "Đã giao",
  cancelled: "Đã hủy",
};

const ReportSalesDetails = ({ filteredOrders, monthlyData, formatCurrency }: ReportSalesDetailsProps) => {
  // Fetch assignees
  const { data: assignees = [] } = useQuery({
    queryKey: ["assignees-reports"],
    queryFn: async () => {
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
          const key = item.sku || item.name || "unknown";
          const existing = productMap.get(key) || { name: item.name || "N/A", sku: item.sku || "-", quantity: 0, revenue: 0 };
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
