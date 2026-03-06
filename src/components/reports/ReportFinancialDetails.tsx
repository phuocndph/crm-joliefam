import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";

interface ReportFinancialDetailsProps {
  filteredOrders: any[];
  filteredExpenses: any[];
  orderPayments: any[];
  monthlyData: any[];
  formatCurrency: (amount: number) => string;
}

const CATEGORY_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const ReportFinancialDetails = ({ filteredOrders, filteredExpenses, orderPayments, monthlyData, formatCurrency }: ReportFinancialDetailsProps) => {
  // Expenses by category
  const expensesByCategory = useMemo(() => {
    const categoryMap = new Map<string, number>();
    filteredExpenses.forEach(e => {
      const cat = e.category || "Khác";
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + Number(e.amount));
    });
    const total = Array.from(categoryMap.values()).reduce((s, v) => s + v, 0);
    return Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount], i) => ({
        category,
        amount,
        percentage: total > 0 ? ((amount / total) * 100).toFixed(1) : "0",
        fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }));
  }, [filteredExpenses]);

  // Cash flow monthly (Area Chart)
  const cashFlowData = useMemo(() => {
    return monthlyData.map(m => ({
      month: m.month,
      revenue: m.revenue,
      expenses: m.expenses + (m.costPrice || 0),
      netProfit: m.profit,
    }));
  }, [monthlyData]);

  // Payment collection progress
  const paymentProgress = useMemo(() => {
    const filteredOrderIds = new Set(filteredOrders.map(o => o.id));
    const paymentsForOrders = orderPayments.filter(p => p.order_id && filteredOrderIds.has(p.order_id));
    const totalOrderValue = filteredOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const totalPaid = paymentsForOrders.reduce((s, p) => s + Number(p.payment_amount || 0), 0);
    const remaining = Math.max(0, totalOrderValue - totalPaid);
    const percentage = totalOrderValue > 0 ? (totalPaid / totalOrderValue) * 100 : 0;
    return { totalOrderValue, totalPaid, remaining, percentage };
  }, [filteredOrders, orderPayments]);

  // Unpaid/partial orders detail
  const unpaidOrdersDetail = useMemo(() => {
    const filteredOrderIds = new Set(filteredOrders.map(o => o.id));
    const paymentsByOrder = new Map<string, number>();
    orderPayments.forEach(p => {
      if (p.order_id && filteredOrderIds.has(p.order_id)) {
        paymentsByOrder.set(p.order_id, (paymentsByOrder.get(p.order_id) || 0) + Number(p.payment_amount || 0));
      }
    });

    return filteredOrders
      .filter(o => o.payment_status !== "paid")
      .map(o => {
        const paid = paymentsByOrder.get(o.id) || 0;
        const total = Number(o.total_amount || 0);
        return {
          orderNumber: o.display_order_number || o.order_number,
          customerName: o.customers?.name || "N/A",
          totalAmount: total,
          paidAmount: paid,
          remaining: Math.max(0, total - paid),
          status: o.payment_status || "pending",
        };
      })
      .sort((a, b) => b.remaining - a.remaining)
      .slice(0, 20);
  }, [filteredOrders, orderPayments]);

  return (
    <>
      {/* Expenses by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              📂 Chi phí theo danh mục
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expensesByCategory.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Không có dữ liệu chi phí</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Danh mục</TableHead>
                      <TableHead className="text-right">Số tiền</TableHead>
                      <TableHead className="text-right">Tỷ lệ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expensesByCategory.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.category}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(row.amount)}</TableCell>
                        <TableCell className="text-right">{row.percentage}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              🥧 Biểu đồ chi phí theo danh mục
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expensesByCategory.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Không có dữ liệu</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={expensesByCategory.map(e => ({ name: e.category, value: e.amount }))}
                      cx="50%" cy="50%" outerRadius={80} dataKey="value" label
                    >
                      {expensesByCategory.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Area Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            📈 Dòng tiền theo tháng
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cashFlowData.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Không có dữ liệu</p>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowData} margin={{ top: 20, right: 30, left: 50, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Area type="monotone" dataKey="revenue" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Doanh thu" />
                  <Area type="monotone" dataKey="expenses" stackId="2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Chi phí + Giá vốn" />
                  <Area type="monotone" dataKey="netProfit" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Lợi nhuận ròng" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Collection Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            💰 Tiến độ thu tiền
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-700 mb-1">Tổng giá trị đơn</div>
                <div className="text-xl font-bold text-blue-600">{formatCurrency(paymentProgress.totalOrderValue)}</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-sm text-green-700 mb-1">Đã thu</div>
                <div className="text-xl font-bold text-green-600">{formatCurrency(paymentProgress.totalPaid)}</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-sm text-red-700 mb-1">Còn lại</div>
                <div className="text-xl font-bold text-red-600">{formatCurrency(paymentProgress.remaining)}</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Tỷ lệ thu</span>
                <span className="font-semibold">{paymentProgress.percentage.toFixed(1)}%</span>
              </div>
              <Progress value={paymentProgress.percentage} className="h-3" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unpaid Orders Detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            📋 Đơn hàng chưa thanh toán đủ
          </CardTitle>
        </CardHeader>
        <CardContent>
          {unpaidOrdersDetail.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Tất cả đơn hàng đã thanh toán đầy đủ</p>
          ) : (
            <div className="rounded-md border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Mã đơn</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead className="text-right">Tổng giá trị</TableHead>
                    <TableHead className="text-right">Đã thu</TableHead>
                    <TableHead className="text-right">Còn lại</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unpaidOrdersDetail.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.orderNumber}</TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalAmount)}</TableCell>
                      <TableCell className="text-right text-green-600">{formatCurrency(row.paidAmount)}</TableCell>
                      <TableCell className="text-right font-semibold text-red-600">{formatCurrency(row.remaining)}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "partial" ? "secondary" : "destructive"}>
                          {row.status === "partial" ? "Một phần" : "Chưa TT"}
                        </Badge>
                      </TableCell>
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

export default ReportFinancialDetails;
