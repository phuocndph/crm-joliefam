import React, { useState } from "react";
import { Check, X, Edit3, Calendar, DollarSign, Trash2, MoreHorizontal, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
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
    address?: string | null;
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
  ghn_tracking?: { ghn_order_code: string }[];
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

// Status left border colors
const statusBorderColor: Record<string, string> = {
  pending:        'border-l-yellow-500',
  processing:     'border-l-blue-500',
  shipped:        'border-l-orange-500',
  delivered:      'border-l-green-500',
  cancelled:      'border-l-red-500',
  self_delivered:  'border-l-purple-500',
  returned:       'border-l-orange-400',
};

export function applyRowColor(status: string): React.CSSProperties {
  return {};
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
const GhnTrackingEditCell = ({ orderId, initialCodes, onDone }: { orderId: string; initialCodes: string[]; onDone: () => void }) => {
  const [value, setValue] = useState(initialCodes.join('\n'));
  const queryClient = useQueryClient();

  const handleSave = async () => {
    const newCodes = value.split('\n').map(c => c.trim()).filter(Boolean);

    // Delete existing tracking records for this order
    await supabase.from('ghn_tracking').delete().eq('order_id', orderId);

    // Insert new ones
    if (newCodes.length > 0) {
      const inserts = newCodes.map(code => ({
        ghn_order_code: code,
        order_id: orderId,
        internal_order_code: code,
      }));
      await supabase.from('ghn_tracking').insert(inserts);
    }

    queryClient.invalidateQueries({ queryKey: ['orders'] });
    onDone();
  };

  return (
    <div className="flex items-start gap-1">
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        className="w-full min-h-[40px] resize-none rounded-md border border-input bg-background px-2 py-1 text-xs font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Nhập mã vận đơn (mỗi dòng 1 mã)..."
        rows={2}
        autoFocus
      />
      <div className="flex flex-col gap-0.5">
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleSave}>
          <Check className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onDone}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
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
    if ((field === "delivery_date" || field === "created_at" || field === "delivered_date") && currentValue) {
      setSelectedDate(new Date(currentValue));
    }
  };
  const handleSave = async (orderId: string, field: string, dateValue?: Date, newValue?: any) => {
    try {
      let valueToSave = newValue !== undefined ? newValue : editValue;
      if (field === "delivery_date" || field === "created_at" || field === "delivered_date") {
        const dateToUse = dateValue || selectedDate;
        if (dateToUse) {
          valueToSave = dateToUse.toISOString();
        }
      }

      // Map order_number field to display_order_number in database
      const fieldToUpdate = field === "order_number" ? "display_order_number" : field;
      console.log('handleSave - field:', field, 'valueToSave:', valueToSave);
      const updateData: Record<string, any> = {
        [fieldToUpdate]: valueToSave
      };
      // Khi chuyển trạng thái sang "delivered", tự động set delivered_date = hôm nay
      if (field === "status" && (valueToSave === "shipped" || valueToSave === "self_delivered")) {
        updateData.delivered_date = new Date().toISOString();
      }
      await onOrderUpdate(orderId, updateData);
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
  const formatDateWithCountdown = (date: string | null, createdAt?: string) => {
    let effectiveDate = date;
    
    if (!effectiveDate && createdAt) {
      const created = new Date(createdAt);
      created.setDate(created.getDate() + 6);
      effectiveDate = created.toISOString();
    }
    
    if (!effectiveDate) return {
      dateText: "Chưa đặt",
      countdownText: "",
      isUrgent: false
    };

    const deliveryDate = new Date(effectiveDate);
    if (isNaN(deliveryDate.getTime())) {
      return { dateText: "Ngày không hợp lệ", countdownText: "", isUrgent: false };
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deliveryDate.setHours(0, 0, 0, 0);

    const daysLeft = differenceInDays(deliveryDate, today);
    const dateText = format(deliveryDate, "dd/MM/yyyy", { locale: vi });
    
    if (daysLeft < 0) {
      return { dateText, countdownText: `Quá hạn ${Math.abs(daysLeft)} ngày`, isUrgent: true };
    } else if (daysLeft === 0) {
      return { dateText, countdownText: "Hôm nay", isUrgent: true };
    } else if (daysLeft <= 2) {
      return { dateText, countdownText: `Còn ${daysLeft} ngày`, isUrgent: true };
    } else {
      return { dateText, countdownText: `Còn ${daysLeft} ngày`, isUrgent: false };
    }
  };
  const getCellContent = (order: Order, field: string) => {
    const cellKey = `${order.id}-${field}`;
    const deliveredCellKey = `${order.id}-delivered_date`;
    const isEditing = editingCell === cellKey || (field === "delivery_date" && editingCell === deliveredCellKey);
    const effectiveField = editingCell === deliveredCellKey ? "delivered_date" : field;
    if (isEditing) {
      switch (effectiveField) {
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
        case "delivered_date":
        case "created_at":
          return <Popover open={true} onOpenChange={open => !open && handleCancel()}>
              <PopoverTrigger asChild>
                <div className="w-40" />
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white z-50" align="start">
                <CalendarComponent mode="single" selected={selectedDate} onSelect={date => {
                setSelectedDate(date);
                if (date) {
                  handleSave(order.id, effectiveField, date);
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
              <span className="text-sidebar-primary">Đã thanh toán:</span>
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
        if (order.status === "shipped" || order.status === "self_delivered" || order.status === "delivered") {
          const deliveredDate = order.delivered_date ? format(new Date(order.delivered_date), "dd/MM/yyyy", { locale: vi }) : "—";
          const deliveryLabel = order.status === "self_delivered" ? "Đã giao tự thu tiền" : order.status === "delivered" ? "Hoàn thành" : "Đã giao";
          return <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, "delivered_date", order.delivered_date || new Date().toISOString())}>
              <div className="leading-tight">
                <span className="text-sm font-medium block">{deliveredDate}</span>
                <span className="text-xs block text-green-600 font-semibold">{deliveryLabel}</span>
              </div>
            </div>;
        }
        const dateInfo = formatDateWithCountdown(order.delivery_date, order.created_at);
        return <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, order.delivery_date)}>
            <div className="leading-tight">
              <span className="text-sm font-medium block">{dateInfo.dateText}</span>
              {dateInfo.countdownText && (
                <span className={cn("text-xs block", dateInfo.isUrgent ? "text-red-600 font-semibold" : "text-muted-foreground")}>
                  {dateInfo.countdownText}
                </span>
              )}
            </div>
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
        const isAutoNote = order.notes?.startsWith('Được tạo từ báo giá');
        const displayNotes = (!order.notes || isAutoNote) ? '' : order.notes;
        return <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, order.notes)}>
            <div className="text-sm whitespace-pre-wrap break-words">
              {displayNotes || '—'}
            </div>
          </div>;
      default:
        return null;
    }
  };
  return <div className="rounded-xl border shadow-sm max-h-[calc(100vh-220px)] overflow-auto order-table-scroll">
      <Table disableWrapper className="min-w-max">
        <TableHeader className="sticky top-0 z-10">
          <TableRow className="border-b-2 border-gray-300">
            <TableHead className="min-w-[110px] bg-gray-100 text-gray-700 font-semibold uppercase text-xs tracking-wide">Mã đơn</TableHead>
            <TableHead className="min-w-[130px] bg-gray-100 text-gray-700 font-semibold uppercase text-xs tracking-wide">Mã vận đơn</TableHead>
            <TableHead className="min-w-[100px] bg-gray-100 text-gray-700 font-semibold uppercase text-xs tracking-wide">Ngày tạo</TableHead>
            <TableHead className="min-w-[140px] bg-gray-100 text-gray-700 font-semibold uppercase text-xs tracking-wide">Ngày hẹn trả</TableHead>
            <TableHead className="min-w-[110px] bg-gray-100 text-gray-700 font-semibold uppercase text-xs tracking-wide">Trạng thái</TableHead>
            <TableHead className="min-w-[180px] bg-gray-100 text-gray-700 font-semibold uppercase text-xs tracking-wide">Khách hàng</TableHead>
            <TableHead className="min-w-[200px] bg-gray-100 text-gray-700 font-semibold uppercase text-xs tracking-wide">Tài chính</TableHead>
            <TableHead className="min-w-[140px] bg-gray-100 text-gray-700 font-semibold uppercase text-xs tracking-wide">Phân công</TableHead>
            <TableHead className="w-[220px] min-w-[220px] sticky right-[60px] z-20 bg-gray-100 text-gray-700 font-semibold uppercase text-xs tracking-wide shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">Ghi chú</TableHead>
            <TableHead className="min-w-[60px] sticky right-0 z-20 bg-gray-100 text-gray-700 font-semibold uppercase text-xs tracking-wide shadow-lg">⋯</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order, index) => {
            const borderClass = statusBorderColor[order.status] || 'border-l-gray-300';
            const zebraBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50/60';
            const totalPaid = order.total_paid || 0;
            const remaining = Math.max(0, (order.total_amount || 0) - totalPaid);
            
            return <TableRow 
              key={order.id} 
              className={cn(
                "transition-colors group border-l-4 hover:bg-blue-50/50",
                borderClass,
                zebraBg
              )}
            >
              <TableCell className="font-medium min-w-[110px] bg-gray-50/40">
                {getCellContent(order, "order_number")}
              </TableCell>
              <TableCell className="min-w-[130px]">
                {editingCell === `${order.id}-ghn_tracking` ? (
                  <GhnTrackingEditCell
                    orderId={order.id}
                    initialCodes={order.ghn_tracking?.map(t => t.ghn_order_code) || []}
                    onDone={() => { setEditingCell(null); }}
                  />
                ) : (
                  <div className="flex flex-col gap-0.5 cursor-pointer min-h-[24px]" onClick={() => setEditingCell(`${order.id}-ghn_tracking`)}>
                    {order.ghn_tracking && order.ghn_tracking.length > 0 ? (
                      order.ghn_tracking.map((t, i) => (
                        <span key={i} className="text-xs font-mono">{t.ghn_order_code}</span>
                      ))
                    ) : (
                      <span className="text-xs opacity-50 italic">—</span>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell className="min-w-[100px]">
                {getCellContent(order, "created_at")}
              </TableCell>
              <TableCell className="min-w-[140px]">
                {getCellContent(order, "delivery_date")}
              </TableCell>
              <TableCell className="min-w-[110px]">
                {getCellContent(order, "status")}
              </TableCell>
              <TableCell className="min-w-[180px]">
                <div>
                  <div className="font-medium text-sm">{order.customers?.name || 'Khách lẻ'}</div>
                  {order.customers?.phone && <div className="text-xs text-muted-foreground">{order.customers.phone}</div>}
                  {order.customers?.customer_code && <div className="text-xs text-muted-foreground font-mono">{order.customers.customer_code}</div>}
                </div>
              </TableCell>
              <TableCell className="min-w-[200px]">
                <div className="flex flex-col gap-0.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tổng:</span>
                    <span className="font-mono font-medium text-right">{formatCurrency(order.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Đã TT:</span>
                    <span className={cn("font-mono font-medium text-right", totalPaid > 0 ? "text-green-600" : "text-muted-foreground")}>{formatCurrency(totalPaid)}</span>
                  </div>
                  {remaining > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Còn:</span>
                      <span className={cn("font-mono font-bold text-right", remaining > 10_000_000 ? "text-red-600" : "text-orange-600")}>{formatCurrency(remaining)}</span>
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="min-w-[140px]">
                <div className="flex flex-col gap-0.5">
                  <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, "assignee_id", order.assignee_id || "unassigned")}>
                    {order.assignees?.name ? (
                      <span className="text-xs font-medium text-blue-600">{order.assignees.name}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Chưa phân công</span>
                    )}
                  </div>
                  {order.manager_id && (
                    <span className="text-xs text-muted-foreground">
                      QL: {managerMap.get(order.manager_id) || '—'}
                    </span>
                  )}
                </div>
                {editingCell === `${order.id}-assignee_id` && getCellContent(order, "assignee_id")}
              </TableCell>
              <TableCell className="w-[220px] min-w-[220px] sticky right-[60px] z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]" style={{ backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F9FAFB' }}>
                {getCellContent(order, "notes")}
              </TableCell>
              <TableCell className="min-w-[60px] sticky right-0 shadow-lg" style={{ backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F9FAFB' }}>
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
    </div>;
}

