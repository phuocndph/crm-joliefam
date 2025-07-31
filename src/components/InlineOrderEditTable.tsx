import React, { useState } from "react";
import { Check, X, Edit3, Calendar, DollarSign } from "lucide-react";
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
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getOrderDisplayNumber } from "@/lib/orderUtils";

interface Order {
  id: string;
  order_number: string;
  display_order_number?: string;
  customer_id: string | null;
  total_amount: number | null;
  status: string;
  payment_status: string;
  delivery_date: string | null;
  notes: string | null;
  created_at: string;
  customers?: {
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
}

interface InlineOrderEditTableProps {
  orders: Order[];
  onOrderUpdate: (orderId: string, updates: Partial<Order>) => Promise<void>;
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

export function InlineOrderEditTable({ orders, onOrderUpdate }: InlineOrderEditTableProps) {
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

  const handleSave = async (orderId: string, field: string) => {
    try {
      let valueToSave = editValue;
      if (field === "delivery_date" && selectedDate) {
        valueToSave = selectedDate.toISOString().split('T')[0];
      }
      
      await onOrderUpdate(orderId, { [field]: valueToSave });
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

  const formatDate = (date: string | null) => {
    if (!date) return "Chưa đặt";
    return format(new Date(date), "dd/MM/yyyy", { locale: vi });
  };

  const getCellContent = (order: Order, field: string) => {
    const cellKey = `${order.id}-${field}`;
    const isEditing = editingCell === cellKey;

    if (isEditing) {
      switch (field) {
        case "status":
          return (
            <div className="flex items-center gap-2">
              <Select value={editValue} onValueChange={setEditValue}>
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
              <Button size="sm" variant="ghost" onClick={() => handleSave(order.id, field)}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          );

        case "payment_status":
          return (
            <div className="flex items-center gap-2">
              <Select value={editValue} onValueChange={setEditValue}>
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
              <Button size="sm" variant="ghost" onClick={() => handleSave(order.id, field)}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          );

        case "delivery_date":
          return (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-40 justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: vi }) : "Chọn ngày"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
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

    // Display mode - optimized for single click editing
    switch (field) {
      case "status":
        const statusInfo = statusConfig[order.status as keyof typeof statusConfig];
        return (
          <Badge 
            className={`${statusInfo?.color} cursor-pointer hover:opacity-80 transition-opacity`}
            onClick={() => handleCellEdit(order.id, field, order.status)}
          >
            {statusInfo?.label || order.status}
          </Badge>
        );

      case "payment_status":
        const paymentInfo = paymentStatusConfig[order.payment_status as keyof typeof paymentStatusConfig];
        return (
          <Badge 
            className={`${paymentInfo?.color} cursor-pointer hover:opacity-80 transition-opacity`}
            onClick={() => handleCellEdit(order.id, field, order.payment_status)}
          >
            {paymentInfo?.label || order.payment_status}
          </Badge>
        );

      case "delivery_date":
        return (
          <span 
            className="text-sm cursor-pointer hover:bg-muted px-2 py-1 rounded transition-colors"
            onClick={() => handleCellEdit(order.id, field, order.delivery_date)}
          >
            {formatDate(order.delivery_date)}
          </span>
        );

      case "notes":
        return (
          <span 
            className="text-sm truncate max-w-32 cursor-pointer hover:bg-muted px-2 py-1 rounded transition-colors text-muted-foreground"
            onClick={() => handleCellEdit(order.id, field, order.notes)}
          >
            {order.notes || "Thêm ghi chú..."}
          </span>
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className="hover:bg-muted/50">
              <TableCell className="font-medium">
                {getOrderDisplayNumber(order)}
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}