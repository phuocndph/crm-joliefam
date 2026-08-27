import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Eye, Plus, User, CalendarDays, DollarSign } from "lucide-react";
import { getOrderDisplayNumber } from "@/lib/orderUtils";

interface Props {
  orders: any[];
  calculatePaidAmount: (orderId: string) => number;
  calculateOrderExpenses: (orderId: string) => number;
  calculateRemainingAmount: (order: any) => number;
  formatCurrency: (n?: number) => string;
  formatDate: (d?: string) => string;
  getPaymentStatusColor: (s: string) => string;
  getPaymentStatusLabel: (s: string) => string;
  onView: (order: any) => void;
  onAddPayment: (order: any) => void;
  onUpdatePaymentStatus: (orderId: string, value: string) => void;
}

const statusBorder: Record<string, string> = {
  paid: "border-l-sidebar-primary",
  partial: "border-l-blue-500",
  pending: "border-l-yellow-500",
};

export const MobileTransactionList: React.FC<Props> = ({
  orders, calculatePaidAmount, calculateOrderExpenses, calculateRemainingAmount,
  formatCurrency, formatDate, getPaymentStatusColor, getPaymentStatusLabel,
  onView, onAddPayment, onUpdatePaymentStatus,
}) => {
  if (!orders?.length) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground flex flex-col items-center gap-2">
        <DollarSign className="h-8 w-8" />
        Không có đơn hàng
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {orders.map((order) => {
        const paid = calculatePaidAmount(order.id);
        const exp = calculateOrderExpenses(order.id);
        const rem = calculateRemainingAmount(order);
        return (
          <Card
            key={order.id}
            onClick={() => onView(order)}
            className={cn(
              "p-3 space-y-2 border-l-4 cursor-pointer active:bg-muted/50 transition-colors",
              statusBorder[order.payment_status] || "border-l-muted",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">#{getOrderDisplayNumber(order)}</div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {order.customers?.name || "Khách lẻ"}
                  {order.customers?.customer_code ? ` · ${order.customers.customer_code}` : ""}
                </div>
              </div>
              <Badge className={cn("text-[10px] whitespace-nowrap", getPaymentStatusColor(order.payment_status))}>
                {getPaymentStatusLabel(order.payment_status)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs pt-1 border-t border-border/60">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">Tổng</span>
                <span className="font-semibold">{formatCurrency(order.total_amount)}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground">Đã thu</span>
                <span className="font-semibold text-sidebar-primary">{formatCurrency(paid)}</span>
              </div>
              {exp > 0 && (
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">Chi phí</span>
                  <span className="font-semibold text-orange-600">{formatCurrency(exp)}</span>
                </div>
              )}
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground">Còn lại</span>
                <span className={cn("font-semibold", rem > 0 ? "text-red-600" : "text-sidebar-primary")}>
                  {formatCurrency(rem)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{formatDate(order.created_at)}</span>
              </div>
            </div>

            <div
              className="flex items-center gap-1.5 pt-1 border-t border-border/60"
              onClick={(e) => e.stopPropagation()}
            >
              <Button size="sm" variant="outline" className="flex-1 h-9 gap-1" onClick={() => onView(order)}>
                <Eye className="h-3.5 w-3.5" /> Xem
              </Button>
              {order.payment_status !== "paid" && (
                <Button size="sm" variant="default" className="flex-1 h-9 gap-1" onClick={() => onAddPayment(order)}>
                  <Plus className="h-3.5 w-3.5" /> Thu
                </Button>
              )}
              <Select
                value={order.payment_status}
                onValueChange={(v) => onUpdatePaymentStatus(order.id, v)}
              >
                <SelectTrigger className="h-9 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-[100]">
                  <SelectItem value="pending">Chưa TT</SelectItem>
                  <SelectItem value="partial">Một phần</SelectItem>
                  <SelectItem value="paid">Đã TT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default MobileTransactionList;