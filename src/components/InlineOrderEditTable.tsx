import React, { useState } from "react";
import { Check, X, Edit3, Calendar, DollarSign, Trash2, MoreHorizontal, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, differenceInDays } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getOrderDisplayNumber } from "@/lib/orderUtils";
import { useFabricUsageByOrder } from "@/hooks/useFabrics";
import { useAssignees } from "@/hooks/useAssignees";
import { useManagers } from "@/hooks/useManagers";
interface Order {
  id: string;
  order_number: string;
  display_order_number?: string;
  customer_id: string | null;
  assignee_id?: string | null;
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
  total_paid?: number;
  manager_id?: string | null;
  customers?: {
    id: string;
    customer_code: string | null;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
  } | null;
  assignees?: {
    name: string;
  } | null;
  order_payments?: {
    payment_amount: number;
    payment_date: string;
    payment_type: string;
  }[];
  manager_profile?: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}
interface InlineOrderEditTableProps {
  orders: Order[];
  onOrderUpdate: (orderId: string, updates: Partial<Order>) => Promise<void>;
  onDeleteOrder: (order: Order) => void;
  onViewOrderDetail?: (order: Order) => void;
}
const statusConfig = {
  pending: {
    label: "Chờ xử lý",
    color: "bg-yellow-100 text-yellow-800"
  },
  processing: {
    label: "Đang xử lý",
    color: "bg-blue-100 text-blue-800"
  },
  shipped: {
    label: "Đã giao",
    color: "bg-green-100 text-green-800"
  },
  delivered: {
    label: "Hoàn thành",
    color: "bg-green-100 text-green-800"
  },
  cancelled: {
    label: "Đã hủy",
    color: "bg-red-100 text-red-800"
  },
  self_delivered: {
    label: "Đã giao tự thu tiền",
    color: "bg-purple-100 text-purple-800"
  },
  returned: {
    label: "Hoàn Hàng",
    color: "bg-orange-100 text-orange-800"
  }
};

// Row color mapping by status
const statusRowStyles: Record<string, { bg: string; text: string; hoverBg: string }> = {
  pending:        { bg: '#C8F7C5', text: '#212121', hoverBg: '#B5E4B2' },
  processing:     { bg: '#FFF9C4', text: '#212121', hoverBg: '#F5EFA0' },
  shipped:        { bg: '#FFCDD2', text: '#212121', hoverBg: '#F3B8BD' },
  delivered:      { bg: '#FFFFFF', text: '#212121', hoverBg: '#EBEBEB' },
  cancelled:      { bg: '#B3E5FC', text: '#212121', hoverBg: '#9FD4EA' },
  self_delivered:  { bg: '#FFCDD2', text: '#212121', hoverBg: '#F3B8BD' },
  returned:       { bg: '#FFE0B2', text: '#212121', hoverBg: '#ECCF9E' },
};

export function applyRowColor(status: string): React.CSSProperties {
  const style = statusRowStyles[status];
  if (!style) return {};
  return { backgroundColor: style.bg, color: style.text };
}
const paymentStatusConfig = {
  pending: {
    label: "Chưa thanh toán",
    color: "bg-red-100 text-red-800"
  },
  partial: {
    label: "Thanh toán 1 phần",
    color: "bg-yellow-100 text-yellow-800"
  },
  paid: {
    label: "Đã thanh toán",
    color: "bg-green-100 text-green-800"
  }
};
const FabricUsageCell = ({
  orderId
}: {
  orderId: string;
}) => {
  const {
    data: fabricUsage = []
  } = useFabricUsageByOrder(orderId);
  if (fabricUsage.length === 0) {
    return <span className="text-sm text-muted-foreground italic">Chưa có</span>;
  }
  return <div className="text-xs space-y-1 max-w-40">
      {fabricUsage.map((usage: any, index: number) => <div key={usage.id} className="flex items-center gap-1 p-1 bg-blue-50 rounded text-blue-900">
          <span className="font-medium">{usage.fabric_variants?.fabric_types?.name}</span>
          <span className="text-blue-600">K{usage.fabric_variants?.fabric_widths?.width_code}</span>
          <span className="font-semibold">{usage.quantity_used}m</span>
        </div>)}
    </div>;
};
export function InlineOrderEditTable({
  orders,
  onOrderUpdate,
  onDeleteOrder,
  onViewOrderDetail
}: InlineOrderEditTableProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<any>("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const {
    data: assignees = []
  } = useAssignees();
  const { data: managers = [] } = useManagers();
  const managerMap = React.useMemo(() => new Map((managers as any[]).map((m: any) => [m.user_id, m.display_name])), [managers]);
  const handleCellEdit = (orderId: string, field: string, currentValue: any) => {
    setEditingCell(`${orderId}-${field}`);
    setEditValue(currentValue || "");
    if ((field === "delivery_date" || field === "created_at") && currentValue) {
      setSelectedDate(new Date(currentValue));
    }
  };
  const handleSave = async (orderId: string, field: string, dateValue?: Date, newValue?: any) => {
    try {
      let valueToSave = newValue !== undefined ? newValue : editValue;
      if (field === "delivery_date" || field === "created_at") {
        const dateToUse = dateValue || selectedDate;
        if (dateToUse) {
          valueToSave = dateToUse.toISOString();
        }
      }

      // Map order_number field to display_order_number in database
      const fieldToUpdate = field === "order_number" ? "display_order_number" : field;
      console.log('handleSave - field:', field, 'valueToSave:', valueToSave);
      await onOrderUpdate(orderId, {
        [fieldToUpdate]: valueToSave
      });
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
    if (!date) return {
      text: "Chưa đặt",
      isUrgent: false
    };

    // Validate and create Date object
    const deliveryDate = new Date(date);

    // Check if the date is valid
    if (isNaN(deliveryDate.getTime())) {
      return {
        text: "Ngày không hợp lệ",
        isUrgent: false
      };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset về đầu ngày
    deliveryDate.setHours(0, 0, 0, 0); // Reset về đầu ngày

    const daysLeft = differenceInDays(deliveryDate, today);
    let text = format(deliveryDate, "dd/MM/yyyy", {
      locale: vi
    });
    if (daysLeft < 0) {
      text += ` (Quá hạn ${Math.abs(daysLeft)} ngày)`;
      return {
        text,
        isUrgent: true
      };
    } else if (daysLeft === 0) {
      text += " (Hôm nay)";
      return {
        text,
        isUrgent: true
      };
    } else if (daysLeft <= 2) {
      text += ` (Còn ${daysLeft} ngày)`;
      return {
        text,
        isUrgent: true
      };
    } else {
      text += ` (Còn ${daysLeft} ngày)`;
      return {
        text,
        isUrgent: false
      };
    }
  };
  const getCellContent = (order: Order, field: string) => {
    const cellKey = `${order.id}-${field}`;
    const isEditing = editingCell === cellKey;
    if (isEditing) {
      switch (field) {
        case "status":
          return <Select open={true} value={editValue} onValueChange={value => {
            setEditValue(value);
            handleSave(order.id, field, undefined, value);
          }} onOpenChange={open => !open && handleCancel()}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusConfig).map(([key, config]) => <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>)}
              </SelectContent>
            </Select>;
        case "assignee_id":
          return <Select open={true} value={editValue || "unassigned"} onValueChange={value => {
            const actualValue = value === "unassigned" ? null : value;
            setEditValue(actualValue);
            handleSave(order.id, field, undefined, actualValue);
          }} onOpenChange={open => !open && handleCancel()}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Chưa phân công</SelectItem>
                {assignees.map((assignee: any) => <SelectItem key={assignee.id} value={assignee.id}>
                    {assignee.name}
                  </SelectItem>)}
              </SelectContent>
            </Select>;
        case "payment_status":
          // Payment status is now read-only, no editing needed
          return null;
        case "delivery_date":
        case "created_at":
          return <Popover open={true} onOpenChange={open => !open && handleCancel()}>
              <PopoverTrigger asChild>
                <div className="w-40" />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white z-50" align="start">
                <CalendarComponent mode="single" selected={selectedDate} onSelect={date => {
                setSelectedDate(date);
                if (date) {
                  handleSave(order.id, field, date);
                }
              }} initialFocus locale={vi} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>;
        case "order_number":
          return <div className="flex items-center gap-2">
              <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-40" placeholder="Nhập mã đơn hàng..." />
              <Button size="sm" variant="ghost" onClick={() => handleSave(order.id, field)}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>;
        case "notes":
          return <div className="flex items-start gap-2">
              <textarea value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full min-h-[60px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" placeholder="Nhập ghi chú..." rows={3} />
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="ghost" onClick={() => handleSave(order.id, field)}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>;
        default:
          return null;
      }
    }

    // Display mode
    switch (field) {
      case "status":
        const statusInfo = statusConfig[order.status as keyof typeof statusConfig];
        return <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, order.status)}>
            <Badge className={statusInfo?.color}>
              {statusInfo?.label || order.status}
            </Badge>
          </div>;
      case "payment_status":
        const totalPaid = order.total_paid || 0;
        const remainingAmount = (order.total_amount || 0) - totalPaid; // "CÒN LẠI = TỔNG TIỀN ĐÃ BAO GỒM GTGT - THANH TOÁN ĐÃ NHẬN"
        return <div className="text-sm space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-green-600">Đã thanh toán:</span>
              <span className="font-medium">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className={remainingAmount > 0 ? "text-orange-600" : "text-green-600"}>
                {remainingAmount > 0 ? "Còn lại:" : "Thừa:"}
              </span>
              <span className="font-medium">{formatCurrency(Math.abs(remainingAmount))}</span>
            </div>
          </div>;
      case "delivery_date":
        const dateInfo = formatDateWithCountdown(order.delivery_date);
        return <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, order.delivery_date)}>
            <span className={cn("text-sm", dateInfo.isUrgent && "text-red-600 font-semibold")}>
              {dateInfo.text}
            </span>
          </div>;
      case "created_at":
        return <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, order.created_at)}>
            <span className="text-sm">
              {format(new Date(order.created_at), "dd/MM/yyyy", { locale: vi })}
            </span>
          </div>;
      case "assignee_id":
        const assigneeName = order.assignees?.name || 'Chưa phân công';
        return <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, order.assignee_id || "unassigned")}>
            {assigneeName !== 'Chưa phân công' ? <span className="text-blue-600 font-medium">{assigneeName}</span> : <span className="text-muted-foreground italic">{assigneeName}</span>}
          </div>;
      case "order_number":
        return <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, getOrderDisplayNumber(order))}>
            <span className="text-sm font-medium">{getOrderDisplayNumber(order)}</span>
          </div>;
      case "notes":
        const formatNotes = (notes: string | null) => {
          if (!notes) return null;

          // Split by lines and format each line that starts with "•"
          const lines = notes.split('\n');
          return lines.map((line, index) => {
            if (line.trim().startsWith('•')) {
              return <div key={index} className="flex items-start gap-1 mb-1">
                  <span className="text-blue-600 font-bold text-base leading-none mt-0.5">•</span>
                  <span className="flex-1">{line.replace('•', '').trim()}</span>
                </div>;
            }
            return line && <div key={index} className="mb-1">{line}</div>;
          }).filter(Boolean);
        };
        return <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, order.notes)}>
            <div className="text-sm break-words leading-relaxed space-y-1">
              {formatNotes(order.notes)}
            </div>
          </div>;
      default:
        return null;
    }
  };
  return <div className="rounded-md border max-h-[600px] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <TableHead className="min-w-[120px] bg-background">Mã đơn hàng</TableHead>
            <TableHead className="min-w-[110px] bg-background">Ngày tạo đơn</TableHead>
            <TableHead className="min-w-[150px] bg-background">Quản lý</TableHead>
            <TableHead className="min-w-[200px] bg-background">Tên khách hàng</TableHead>
            <TableHead className="min-w-[150px] bg-background">Giá trị đơn hàng</TableHead>
            <TableHead className="min-w-[180px] bg-background">Ngày hẹn trả</TableHead>
            <TableHead className="min-w-[120px] bg-background">Tình trạng đơn</TableHead>
            <TableHead className="min-w-[280px] bg-background">Thanh toán</TableHead>
            <TableHead className="min-w-[150px] bg-background">Người phụ trách</TableHead>
            <TableHead className="min-w-[250px] bg-background">Ghi chú</TableHead>
            <TableHead className="min-w-[200px] bg-background">Vải đã sử dụng</TableHead>
            <TableHead className="min-w-[100px] sticky right-0 bg-background shadow-lg">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map(order => {
            const rowStyle = statusRowStyles[order.status];
            const rowBg = rowStyle?.bg || '#FFFFFF';
            const rowText = rowStyle?.text || '#212121';
            const rowHoverBg = rowStyle?.hoverBg || '#F5F5F5';
            return <TableRow 
              key={order.id} 
              className="transition-colors group"
              style={{ backgroundColor: rowBg, color: rowText }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = rowHoverBg)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = rowBg)}
            >
              <TableCell className="font-medium min-w-[120px]" style={{ color: rowText }}>
                {getCellContent(order, "order_number")}
              </TableCell>
              <TableCell className="min-w-[110px]" style={{ color: rowText }}>
                {getCellContent(order, "created_at")}
              </TableCell>
              <TableCell className="min-w-[150px]">
                <div className="text-sm">
                  {order.manager_id ? (
                    <span className="font-medium text-blue-600">
                      {managerMap.get(order.manager_id) || 'Chưa có thông tin'}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">Chưa có thông tin</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="min-w-[200px]" style={{ color: rowText }}>
                <div>
                  <div className="font-medium">{order.customers?.name}</div>
                  {order.customers?.phone && <div className="text-sm opacity-70">{order.customers.phone}</div>}
                </div>
              </TableCell>
              <TableCell className="min-w-[150px]" style={{ color: rowText }}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    {formatCurrency(order.total_amount)}
                  </div>
                  {(() => {
                    const totalPaid = order.order_payments?.reduce((total: number, payment: any) => total + (payment.payment_amount || 0), 0) || 0;
                    const remaining = Math.max(0, (order.total_amount || 0) - totalPaid);
                    return remaining > 0 ? <div className="text-sm opacity-70">
                        Còn: {formatCurrency(remaining)}
                      </div> : null;
                  })()}
                </div>
              </TableCell>
              <TableCell className="min-w-[180px]" style={{ color: rowText }}>
                {getCellContent(order, "delivery_date")}
              </TableCell>
              <TableCell className="min-w-[120px]">
                {getCellContent(order, "status")}
              </TableCell>
              <TableCell className="min-w-[280px]">
                {getCellContent(order, "payment_status")}
              </TableCell>
              <TableCell className="min-w-[150px]">
                {getCellContent(order, "assignee_id")}
              </TableCell>
              <TableCell className="min-w-[250px]" style={{ color: rowText }}>
                {getCellContent(order, "notes")}
              </TableCell>
              <TableCell className="min-w-[200px]">
                <FabricUsageCell orderId={order.id} />
              </TableCell>
              <TableCell className="min-w-[100px] sticky right-0 shadow-lg outline-none focus:outline-none" style={{ backgroundColor: rowBg, outline: 'none' }} tabIndex={-1}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Mở menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onViewOrderDetail && <DropdownMenuItem onClick={() => onViewOrderDetail(order)} className="text-blue-600 hover:text-blue-900">
                        <Eye className="mr-2 h-4 w-4" />
                        Xem chi tiết
                      </DropdownMenuItem>}
                    <DropdownMenuItem onClick={() => onDeleteOrder(order)} className="text-red-600 hover:text-red-900">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Xóa đơn hàng
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table>
      </div>
    </div>;
}