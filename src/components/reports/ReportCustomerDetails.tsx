import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays } from "date-fns";

interface ReportCustomerDetailsProps {
  filteredOrders: any[];
  customers: any[];
  formatCurrency: (amount: number) => string;
}

const SEGMENT_COLORS = ["#f59e0b", "#3b82f6", "#10b981"];

const ReportCustomerDetails = ({ filteredOrders, customers, formatCurrency }: ReportCustomerDetailsProps) => {
  // Top 10 customers by revenue from orders
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

  // Customer segmentation
  const customerSegmentation = useMemo(() => {
    let vip = 0, frequent = 0, newCust = 0;
    customers.forEach(c => {
      const count = Number(c.purchase_count || 0);
      const spent = Number(c.total_spent || 0);
      if (count > 10 || spent > 50000000) {
        vip++;
      } else if (count >= 3) {
        frequent++;
      } else {
        newCust++;
      }
    });
    const total = customers.length;
    return [
      { name: "VIP (>10 đơn / >50tr)", value: vip, percentage: total > 0 ? ((vip / total) * 100).toFixed(1) : "0" },
      { name: "Thường xuyên (3-10 đơn)", value: frequent, percentage: total > 0 ? ((frequent / total) * 100).toFixed(1) : "0" },
      { name: "Mới (<3 đơn)", value: newCust, percentage: total > 0 ? ((newCust / total) * 100).toFixed(1) : "0" },
    ];
  }, [customers]);

  // Customers not returned (1 purchase, last purchase > 90 days ago)
  const inactiveCustomers = useMemo(() => {
    const ninetyDaysAgo = subDays(new Date(), 90);
    return customers
      .filter(c => {
        const count = Number(c.purchase_count || 0);
        const lastPurchase = c.last_purchase_date ? new Date(c.last_purchase_date) : null;
        return count === 1 && lastPurchase && lastPurchase < ninetyDaysAgo;
      })
      .sort((a, b) => new Date(a.last_purchase_date!).getTime() - new Date(b.last_purchase_date!).getTime())
      .slice(0, 20)
      .map(c => ({
        name: c.name,
        code: c.customer_code || "-",
        lastPurchase: c.last_purchase_date ? format(new Date(c.last_purchase_date), "dd/MM/yyyy") : "-",
        totalSpent: Number(c.total_spent || 0),
      }));
  }, [customers]);

  return (
    <>
      {/* Top 10 Customers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            👑 Top 10 khách hàng theo doanh thu
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topCustomers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Không có dữ liệu</p>
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

      {/* Customer Segmentation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              🎯 Phân loại khách hàng
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {customerSegmentation.map((seg, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[i] }} />
                    <span className="font-medium">{seg.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{seg.value} KH</Badge>
                    <span className="text-sm text-muted-foreground">{seg.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              🥧 Biểu đồ phân loại khách hàng
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie data={customerSegmentation} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
                    {customerSegmentation.map((_, index) => (
                      <Cell key={index} fill={SEGMENT_COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inactive Customers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            ⚠️ Khách hàng chưa mua lại (mua 1 lần, &gt;90 ngày)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inactiveCustomers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Không có khách hàng nào trong nhóm này</p>
          ) : (
            <div className="rounded-md border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Tên khách hàng</TableHead>
                    <TableHead>Mã KH</TableHead>
                    <TableHead>Lần mua cuối</TableHead>
                    <TableHead className="text-right">Tổng chi tiêu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inactiveCustomers.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.code}</TableCell>
                      <TableCell>{c.lastPurchase}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.totalSpent)}</TableCell>
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

export default ReportCustomerDetails;
