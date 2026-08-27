import React from "react";
import { Badge } from "@/components/ui/badge";
import MobileCard from "./MobileCard";
import { User, Package, Calendar, DollarSign, MapPin, Clock } from "lucide-react";

interface Order {
  id: string;
  order_number?: string;
  customer_name?: string;
  total_amount?: number;
  status?: string;
  delivery_date?: string;
  created_at?: string;
  delivery_address?: string;
  product_count?: number;
  notes?: string;
}

interface MobileOrderCardProps {
  order: Order;
  onEdit: (order: Order) => void;
  onDelete: (order: Order) => void;
  onView: (order: Order) => void;
}

export const MobileOrderCard: React.FC<MobileOrderCardProps> = ({
  order,
  onEdit,
  onDelete,
  onView
}) => {
  const getStatusVariant = (status?: string) => {
    switch (status) {
      case 'pending': return 'outline';
      case 'confirmed': return 'default';
      case 'shipping': return 'secondary';
      case 'delivered': return 'default';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'pending': return 'Chờ xác nhận';
      case 'confirmed': return 'Đã xác nhận';
      case 'shipping': return 'Đang giao';
      case 'delivered': return 'Đã giao';
      case 'cancelled': return 'Đã hủy';
      default: return 'Không xác định';
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return "0 VNĐ";
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Không xác định";
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getTimeAgo = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return "Vừa tạo";
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} ngày trước`;
    return formatDate(dateString);
  };

  return (
    <MobileCard
      title={order.order_number || `Đơn hàng #${order.id.slice(-6)}`}
      subtitle={order.customer_name}
      status={{
        label: getStatusLabel(order.status),
        variant: getStatusVariant(order.status)
      }}
      value={{
        amount: formatCurrency(order.total_amount),
        unit: ""
      }}
      onClick={() => onView(order)}
      actions={[
        {
          label: "Sửa",
          onClick: () => onEdit(order),
          variant: "outline"
        },
        {
          label: "Xóa",
          onClick: () => onDelete(order),
          variant: "destructive"
        }
      ]}
    >
      <div className="space-y-3">
        {/* Order Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span>{order.product_count || 0} sản phẩm</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{getTimeAgo(order.created_at)}</span>
          </div>
        </div>

        {/* Delivery Info */}
        {(order.delivery_date || order.delivery_address) && (
          <div className="space-y-2">
            {order.delivery_date && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Giao hàng: {formatDate(order.delivery_date)}</span>
              </div>
            )}
            {order.delivery_address && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="line-clamp-2">{order.delivery_address}</span>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div className="text-xs text-muted-foreground pt-2 border-t line-clamp-2">
            <strong>Ghi chú:</strong> {order.notes}
          </div>
        )}
      </div>
    </MobileCard>
  );
};

export default MobileOrderCard;