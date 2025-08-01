import React, { useState } from "react";
import { Check, X, Edit3, Calendar, DollarSign, Trash2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, differenceInDays } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getOrderDisplayNumber } from "@/lib/orderUtils";

interface Order {
  id: string;
  order_number: string;
  display_order_number?: string;
  customer_id: string | null;
  total_amount: number | null;
  cost_price: number | null;
  profit_before: number | null;
  profit_after: number | null;
  status: string;
  payment_status: string;
  payment_date: string | null;
  delivery_date: string | null;
  delivered_date: string | null;
  notes: string | null;
  items: any;
  created_at: string;
  updated_at: string;
  customers?: {
    id: string;
    customer_code: string | null;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
  } | null;
}

interface InlineOrderEditTableProps {
  orders: Order[];
  onOrderUpdate: (orderId: string, updates: Partial<Order>) => Promise<void>;
  onDeleteOrder: (order: Order) => void;
}

const statusConfig = {
  pending: { label: "Chờ xử lý", color: "bg-yellow-100 text-yellow-800" },
  processing: { label: "Đang xử lý", color: "bg-blue-100 text-blue-800" },
  shipped: { label: "Đã giao", color: "bg-green-100 text-green-800" },
  delivered: { label: "Hoàn thành", color: "bg-green-100 text-green-800" },
  cancelled: { label: "Đã hủy", color: "bg-red-100 text-red-800" },
  self_delivered: { label: "Đã giao tự thu tiền", color: "bg-purple-100 text-purple-800" },
  returned: { label: "Hoàn Hàng", color: "bg-orange-100 text-orange-800" },
};

const paymentStatusConfig = {
  pending: { label: "Chưa thanh toán", color: "bg-red-100 text-red-800" },
  partial: { label: "Thanh toán 1 phần", color: "bg-yellow-100 text-yellow-800" },
  paid: { label: "Đã thanh toán", color: "bg-green-100 text-green-800" },
};

export function InlineOrderEditTable({ orders, onOrderUpdate, onDeleteOrder }: InlineOrderEditTableProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<any>("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  const handleCellEdit = (orderId: string, field: string, currentValue: any) => {
    setEditingCell(`${orderId}-${field}`);
    setEditValue(currentValue || "");
    if (field === "delivery_date" && currentValue) {
      setSelectedDate(new Date(currentValue));
    }
  };

  const handleSave = async (orderId: string, field: string, dateValue?: Date) => {
    try {
      let valueToSave = editValue;
      if (field === "delivery_date") {
        const dateToUse = dateValue || selectedDate;
        if (dateToUse) {
          valueToSave = dateToUse.toISOString().split('T')[0];
        }
      }
      
      // Map order_number field to display_order_number in database
      const fieldToUpdate = field === "order_number" ? "display_order_number" : field;
      
      await onOrderUpdate(orderId, { [fieldToUpdate]: valueToSave });
      setEditingCell(null);
      setEditValue("");
      setSelectedDate(undefined);
    } catch (error) {
      console.error("Error saving:", error);
    }
  };

  const handleCancel = () => {
    setEditingCell(null);
    setEditValue("");
    setSelectedDate(undefined);
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "0 VNĐ";
    return `${amount.toLocaleString("vi-VN")} VNĐ`;
  };

  const formatDateWithCountdown = (date: string | null) => {
    if (!date) return { text: "Chưa đặt", isUrgent: false };
    
    // Validate and create Date object
    const deliveryDate = new Date(date);
    
    // Check if the date is valid
    if (isNaN(deliveryDate.getTime())) {
      return { text: "Ngày không hợp lệ", isUrgent: false };
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset về đầu ngày
    deliveryDate.setHours(0, 0, 0, 0); // Reset về đầu ngày
    
    const daysLeft = differenceInDays(deliveryDate, today);
    
    let text = format(deliveryDate, "dd/MM/yyyy", { locale: vi });
    
    if (daysLeft < 0) {
      text += ` (Quá hạn ${Math.abs(daysLeft)} ngày)`;
      return { text, isUrgent: true };
    } else if (daysLeft === 0) {
      text += " (Hôm nay)";
      return { text, isUrgent: true };
    } else if (daysLeft <= 2) {
      text += ` (Còn ${daysLeft} ngày)`;
      return { text, isUrgent: true };
    } else {
      text += ` (Còn ${daysLeft} ngày)`;
      return { text, isUrgent: false };
    }
  };

  const getCellContent = (order: Order, field: string) => {
    const cellKey = `${order.id}-${field}`;
    const isEditing = editingCell === cellKey;

    if (isEditing) {
      switch (field) {
        case "status":
          return (
            <Select 
              open={true} 
              value={editValue} 
              onValueChange={(value) => {
                setEditValue(value);
                handleSave(order.id, field);
              }}
              onOpenChange={(open) => !open && handleCancel()}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );

        case "payment_status":
          return (
            <Select 
              open={true} 
              value={editValue} 
              onValueChange={(value) => {
                setEditValue(value);
                handleSave(order.id, field);
              }}
              onOpenChange={(open) => !open && handleCancel()}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(paymentStatusConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );

        case "delivery_date":
          return (
            <Popover open={true} onOpenChange={(open) => !open && handleCancel()}>
              <PopoverTrigger asChild>
                <div className="w-40" />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white z-50" align="start">
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    if (date) {
                      handleSave(order.id, field, date);
                    }
                  }}
                  initialFocus
                  locale={vi}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          );

        case "order_number":
          return (
            <div className="flex items-center gap-2">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-40"
                placeholder="Nhập mã đơn hàng..."
              />
              <Button size="sm" variant="ghost" onClick={() => handleSave(order.id, field)}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          );

        case "notes":
          return (
            <div className="flex items-center gap-2">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-40"
                placeholder="Nhập ghi chú..."
              />
              <Button size="sm" variant="ghost" onClick={() => handleSave(order.id, field)}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          );

        default:
          return null;
      }
    }

    // Display mode
    switch (field) {
      case "status":
        const statusInfo = statusConfig[order.status as keyof typeof statusConfig];
        return (
          <div 
            className="cursor-pointer"
            onClick={() => handleCellEdit(order.id, field, order.status)}
          >
            <Badge className={statusInfo?.color}>
              {statusInfo?.label || order.status}
            </Badge>
          </div>
        );

      case "payment_status":
        const paymentInfo = paymentStatusConfig[order.payment_status as keyof typeof paymentStatusConfig];
        return (
          <div 
            className="cursor-pointer"
            onClick={() => handleCellEdit(order.id, field, order.payment_status)}
          >
            <Badge className={paymentInfo?.color}>
              {paymentInfo?.label || order.payment_status}
            </Badge>
          </div>
        );

      case "delivery_date":
        const dateInfo = formatDateWithCountdown(order.delivery_date);
        return (
          <div 
            className="cursor-pointer"
            onClick={() => handleCellEdit(order.id, field, order.delivery_date)}
          >
            <span className={cn(
              "text-sm",
              dateInfo.isUrgent && "text-red-600 font-semibold"
            )}>
              {dateInfo.text}
            </span>
          </div>
        );

      case "order_number":
        return (
          <div 
            className="cursor-pointer"
            onClick={() => handleCellEdit(order.id, field, getOrderDisplayNumber(order))}
          >
            <span className="text-sm font-medium">{getOrderDisplayNumber(order)}</span>
          </div>
        );

      case "notes":
        return (
          <div 
            className="cursor-pointer"
            onClick={() => handleCellEdit(order.id, field, order.notes)}
          >
            <span className="text-sm truncate max-w-32">
              {order.notes || "Thêm ghi chú..."}
            </span>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã đơn hàng</TableHead>
            <TableHead>Ngày tạo đơn</TableHead>
            <TableHead>Tên khách hàng</TableHead>
            <TableHead>Giá trị đơn hàng</TableHead>
            <TableHead>Ngày hẹn trả</TableHead>
            <TableHead>Tình trạng đơn</TableHead>
            <TableHead>Thanh toán</TableHead>
            <TableHead>Ghi chú</TableHead>
            <TableHead className="w-[70px]">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className="hover:bg-muted/50">
              <TableCell className="font-medium">
                {getCellContent(order, "order_number")}
              </TableCell>
              <TableCell>
                {format(new Date(order.created_at), "dd/MM/yyyy", { locale: vi })}
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">{order.customers?.name}</div>
                  {order.customers?.phone && (
                    <div className="text-sm text-muted-foreground">{order.customers.phone}</div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  {formatCurrency(order.total_amount)}
                </div>
              </TableCell>
              <TableCell>
                {getCellContent(order, "delivery_date")}
              </TableCell>
              <TableCell>
                {getCellContent(order, "status")}
              </TableCell>
              <TableCell>
                {getCellContent(order, "payment_status")}
              </TableCell>
              <TableCell>
                {getCellContent(order, "notes")}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Mở menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      onClick={() => onDeleteOrder(order)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Xóa đơn hàng
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
