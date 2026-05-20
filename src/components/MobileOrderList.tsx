import React from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { AlertTriangle, CalendarDays, CreditCard, Edit, Eye, MoreVertical, Trash2, Truck, User, Edit3, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getOrderDisplayNumber } from "@/lib/orderUtils";

interface MobileOrderListProps {
  orders: any[];
  duplicateNumbers?: Set<string>;
  statusConfig: Record<string, { label: string; color: string; icon: any }>;
  paymentStatusConfig: Record<string, { label: string; color: string }>;
  calculateTotalPaid: (order: any) => number;
  calculateRemainingAmount: (order: any) => number;
  onView: (order: any) => void;
  onEdit: (order: any) => void;
  onDelete: (order: any) => void;
  onAddPayment: (order: any) => void;
  onEditNumber: (order: any) => void;
  onCreateGHN: (order: any) => void;
  onGHNTracking: (order: any) => void;
}

const formatCurrency = (n?: number | null) =>
  (n || 0).toLocaleString("vi-VN") + "đ";

const statusBorder: Record<string, string> = {
  pending: "border-l-yellow-500",
  processing: "border-l-blue-500",
  shipped: "border-l-green-500",
  delivered: "border-l-green-600",
  self_delivered: "border-l-purple-500",
  returned: "border-l-orange-500",
  cancelled: "border-l-red-500",
};

export const MobileOrderList: React.FC<MobileOrderListProps> = ({
  orders,
  duplicateNumbers,
  statusConfig,
  paymentStatusConfig,
  calculateTotalPaid,
  calculateRemainingAmount,
  onView,
  onEdit,
  onDelete,
  onAddPayment,
  onEditNumber,
  onCreateGHN,
  onGHNTracking,
}) => {
  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        Không có đơn hàng
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => {
        const displayNum = getOrderDisplayNumber(order);
        const isDup = duplicateNumbers?.has(String(displayNum));
        const status = statusConfig[order.status] || statusConfig.pending;
        const payCfg = paymentStatusConfig[order.payment_status] || paymentStatusConfig.pending;
        const totalPaid = calculateTotalPaid(order);
        const remaining = calculateRemainingAmount(order);
        const ghnCode = order.ghn_tracking?.[0]?.ghn_order_code;

        return (
          <Card
            key={order.id}
            onClick={() => onView(order)}
            className={cn(
              "p-3 space-y-2 border-l-4 cursor-pointer active:bg-muted/50 transition-colors",
              statusBorder[order.status] || "border-l-muted",
              isDup && "bg-amber-50/70 border-l-amber-500"
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-foreground">#{displayNum}</span>
                  {isDup && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-amber-500 text-amber-700 bg-amber-100 gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Trùng
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {order.customers?.name || "Khách lẻ"}
                  {order.customers?.customer_code && ` · ${order.customers.customer_code}`}
                </div>
              </div>
              <Badge className={cn("text-[10px] whitespace-nowrap", status.color)}>
                {status.label}
              </Badge>
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs pt-1 border-t border-border/60">
              <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{order.assignees?.name || "—"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {order.delivery_date
                    ? format(new Date(order.delivery_date), "dd/MM/yyyy", { locale: vi })
                    : "Chưa hẹn"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">Tổng</span>
                <span className="font-semibold">{formatCurrency(order.total_amount)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">Đã thu</span>
                <span className="font-semibold text-sidebar-primary">{formatCurrency(totalPaid)}</span>
              </div>
              {remaining > 0 && (
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">Còn lại</span>
                  <span className="font-semibold text-red-600">{formatCurrency(remaining)}</span>
                </div>
              )}
              <div className="flex items-center justify-end">
                <Badge variant="outline" className={cn("text-[10px]", payCfg.color)}>
                  {payCfg.label}
                </Badge>
              </div>
            </div>

            {ghnCode && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Truck className="h-3.5 w-3.5" />
                <span className="font-mono">{ghnCode}</span>
              </div>
            )}

            {/* Actions */}
            <div
              className="flex items-center gap-1.5 pt-1 border-t border-border/60"
              onClick={(e) => e.stopPropagation()}
            >
              <Button size="sm" variant="outline" className="flex-1 h-9 gap-1" onClick={() => onView(order)}>
                <Eye className="h-3.5 w-3.5" /> Xem
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-9 gap-1" onClick={() => onEdit(order)}>
                <Edit className="h-3.5 w-3.5" /> Sửa
              </Button>
              {remaining > 0 && (
                <Button size="sm" variant="default" className="flex-1 h-9 gap-1" onClick={() => onAddPayment(order)}>
                  <CreditCard className="h-3.5 w-3.5" /> Thu
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover z-[100]">
                  <DropdownMenuItem onClick={() => onEditNumber(order)}>
                    <Edit3 className="h-4 w-4 mr-2" /> Sửa số đơn
                  </DropdownMenuItem>
                  {!ghnCode && (
                    <DropdownMenuItem onClick={() => onCreateGHN(order)}>
                      <Truck className="h-4 w-4 mr-2" /> Tạo vận đơn GHN
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onGHNTracking(order)}>
                    <Navigation className="h-4 w-4 mr-2" /> Theo dõi GHN
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(order)}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Xóa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default MobileOrderList;