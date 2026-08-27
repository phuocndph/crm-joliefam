import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import MobileCard from "./MobileCard";
import { User, Phone, Mail, MapPin, ShoppingBag } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  purchase_count?: number;
  total_spent?: number;
  last_purchase?: string;
  status?: string;
}

interface MobileCustomerCardProps {
  customer: Customer;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
  onView: (customer: Customer) => void;
}

export const MobileCustomerCard: React.FC<MobileCustomerCardProps> = ({
  customer,
  onEdit,
  onDelete,
  onView
}) => {
  const getStatusVariant = (status?: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'inactive': return 'secondary';
      case 'vip': return 'destructive';
      default: return 'outline';
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return "0 VNĐ";
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  const formatLastPurchase = (date?: string) => {
    if (!date) return "Chưa mua hàng";
    const purchaseDate = new Date(date);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Hôm nay";
    if (diffDays === 1) return "Hôm qua";
    if (diffDays < 30) return `${diffDays} ngày trước`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} tháng trước`;
    return `${Math.floor(diffDays / 365)} năm trước`;
  };

  return (
    <MobileCard
      title={customer.name}
      subtitle={customer.email}
      status={customer.status ? {
        label: customer.status === 'vip' ? 'VIP' : customer.status.toUpperCase(),
        variant: getStatusVariant(customer.status)
      } : undefined}
      onClick={() => onView(customer)}
      actions={[
        {
          label: "Sửa",
          onClick: () => onEdit(customer),
          variant: "outline"
        },
        {
          label: "Xóa",
          onClick: () => onDelete(customer),
          variant: "destructive"
        }
      ]}
    >
      <div className="space-y-3">
        {/* Contact Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {customer.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{customer.phone}</span>
            </div>
          )}
          {customer.address && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{customer.address}</span>
            </div>
          )}
        </div>

        {/* Purchase Stats */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Đơn hàng</span>
            </div>
            <div className="font-semibold">{customer.purchase_count || 0}</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <span className="text-xs text-muted-foreground">Tổng chi</span>
            </div>
            <div className="font-semibold text-green-600">
              {formatCurrency(customer.total_spent)}
            </div>
          </div>
        </div>

        {/* Last Purchase */}
        {customer.last_purchase && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Mua hàng lần cuối: {formatLastPurchase(customer.last_purchase)}
          </div>
        )}
      </div>
    </MobileCard>
  );
};

export default MobileCustomerCard;