import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ReportOverviewDetailsProps {
  filteredOrders: any[];
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

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-green-100 text-green-800",
  delivered: "bg-green-100 text-green-800",
  self_delivered: "bg-purple-100 text-purple-800",
  returned: "bg-orange-100 text-orange-800",
  cancelled: "bg-red-100 text-red-800",
};

const ReportOverviewDetails = ({ filteredOrders, formatCurrency }: ReportOverviewDetailsProps) => {
  // Order status breakdown
  const orderStatusBreakdown = useMemo(() => {
    const statusMap = new Map<string, { count: number; totalValue: number }>();
    filteredOrders.forEach(order => {
      const status = order.status || "pending";
      const existing = statusMap.get(status) || { count: 0, totalValue: 0 };
      existing.count += 1;
      existing.totalValue += Number(order.total_amount || 0);
      statusMap.set(status, existing);
    });

    const total = filteredOrders.length;
    return Array.from(statusMap.entries()).map(([status, data]) => ({
      status,
      label: STATUS_LABELS[status] || status,
      count: data.count,
      percentage: total > 0 ? ((data.count / total) * 100).toFixed(1) : "0",
      totalValue: data.totalValue,
    }));
  }, [filteredOrders]);

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

  // Top 10 customers by revenue
  const topCustomers = useMemo(() => {
    const customerMap = new Map<string, { name: string; code: string; orderCount: number; totalRevenue: number }>();

    filteredOrders.forEach(order => {
      const customerId = order.customer_id;
      if (!customerId) return;
      const name = order.customers?.name || "N/A";
      const code = order.customers?.customer_code || "-";
      const existing = customerMap.get(customerId) || { name, code, orderCount: 0, totalRevenue: 0 };
      existing.orderCount += 1;
      existing.totalRevenue += Number(order.total_amount || 0);
      customerMap.set(customerId, existing);
    });

    return Array.from(customerMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10)
      .map(c => ({ ...c, avgOrderValue: c.orderCount > 0 ? c.totalRevenue / c.orderCount : 0 }));
  }, [filteredOrders]);

  return (
    <>
      {/* Order Status Breakdown */}
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
                  <TableHead className="text-right">Tổng giá trị</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderStatusBreakdown.map(row => (
                  <TableRow key={row.status}>
                    <TableCell>
                      <Badge className={STATUS_COLORS[row.status] || ""}>{row.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{row.count}</TableCell>
                    <TableCell className="text-right">{row.percentage}%</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.totalValue)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>Tổng cộng</TableCell>
                  <TableCell className="text-right">{filteredOrders.length}</TableCell>
                  <TableCell className="text-right">100%</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(filteredOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Top 10 Products */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            🏆 Top 10 sản phẩm bán chạy
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Không có dữ liệu sản phẩm</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Tên sản phẩm</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Số lượng</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                    <TableHead className="text-right">% Doanh thu</TableHead>
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

      {/* Top 10 Customers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            👑 Top 10 khách hàng theo doanh thu
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topCustomers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Không có dữ liệu khách hàng</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Tên khách hàng</TableHead>
                    <TableHead>Mã KH</TableHead>
                    <TableHead className="text-right">Số đơn</TableHead>
                    <TableHead className="text-right">Tổng doanh thu</TableHead>
                    <TableHead className="text-right">TB/đơn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-bold">{i + 1}</TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.code}</TableCell>
                      <TableCell className="text-right">{c.orderCount}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(c.totalRevenue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.avgOrderValue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default ReportOverviewDetails;
