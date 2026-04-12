import React, { useState } from "react";
import { Check, X, Edit3, Calendar, DollarSign, Trash2, MoreHorizontal, Eye, AlertTriangle } from "lucide-react";
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

// Helper: get days until delivery
const getDaysLeft = (deliveryDate: string | null, createdAt?: string): number | null => {
  let effectiveDate = deliveryDate;
  if (!effectiveDate && createdAt) {
    const created = new Date(createdAt);
    created.setDate(created.getDate() + 6);
    effectiveDate = created.toISOString();
  }
  if (!effectiveDate) return null;
  const d = new Date(effectiveDate);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return differenceInDays(d, today);
};

// Dynamic status badge based on urgency
const getStatusBadgeStyle = (status: string, daysLeft: number | null): string => {
  if (status === 'delivered' || status === 'shipped' || status === 'self_delivered') {
    return "bg-[#D1FAE5] text-[#065F46]";
  }
  if (status === 'cancelled') {
    return "bg-[#E5E7EB] text-[#374151]";
  }
  if (status === 'returned') {
    return "bg-[#FED7AA] text-[#9A3412]";
  }
  if (status === 'processing') {
    return "bg-[#DBEAFE] text-[#1E40AF]";
  }
  // pending - based on urgency
  if (daysLeft !== null) {
    if (daysLeft <= 0) return "bg-[#FEE2E2] text-[#991B1B]";
    if (daysLeft <= 3) return "bg-[#FED7AA] text-[#9A3412]";
  }
  return "bg-[#FEF3C7] text-[#92400E]";
};

// Row urgency check
const isRowUrgent = (order: Order): boolean => {
  if (order.status === 'delivered' || order.status === 'shipped' || order.status === 'self_delivered' || order.status === 'cancelled') return false;
  const days = getDaysLeft(order.delivery_date, order.created_at);
  return days !== null && days <= 2;
};

export function applyRowColor(status: string): React.CSSProperties {
  return {};
}

const FabricUsageCell = ({ orderId }: { orderId: string }) => {
  const { data: fabricUsage = [] } = useFabricUsageByOrder(orderId);
  if (fabricUsage.length === 0) {
    return <span className="text-xs text-gray-400 italic">Chưa có</span>;
  }
  return (
    <div className="text-xs space-y-0.5 max-w-40">
      {fabricUsage.map((usage: any) => (
        <div key={usage.id} className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 rounded text-blue-800">
          <span className="font-medium">{usage.fabric_variants?.fabric_types?.name}</span>
          <span className="text-blue-600">K{usage.fabric_variants?.fabric_widths?.width_code}</span>
          <span className="font-semibold">{usage.quantity_used}m</span>
        </div>
      ))}
    </div>
  );
};

const GhnTrackingEditCell = ({ orderId, initialCodes, onDone }: { orderId: string; initialCodes: string[]; onDone: () => void }) => {
  const [value, setValue] = useState(initialCodes.join('\n'));
  const queryClient = useQueryClient();

  const handleSave = async () => {
    const newCodes = value.split('\n').map(c => c.trim()).filter(Boolean);
    await supabase.from('ghn_tracking').delete().eq('order_id', orderId);
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
        placeholder="Nhập mã vận đơn..."
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
  const { data: assignees = [] } = useAssignees();
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
        if (dateToUse) valueToSave = dateToUse.toISOString();
      }
      const fieldToUpdate = field === "order_number" ? "display_order_number" : field;
      const updateData: Record<string, any> = { [fieldToUpdate]: valueToSave };
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
    if (!effectiveDate) return { dateText: "Chưa đặt", countdownText: "", isUrgent: false };
    const deliveryDate = new Date(effectiveDate);
    if (isNaN(deliveryDate.getTime())) return { dateText: "Ngày không hợp lệ", countdownText: "", isUrgent: false };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deliveryDate.setHours(0, 0, 0, 0);
    const daysLeft = differenceInDays(deliveryDate, today);
    const dateText = format(deliveryDate, "dd/MM/yyyy", { locale: vi });
    if (daysLeft < 0) return { dateText, countdownText: `Quá hạn ${Math.abs(daysLeft)} ngày`, isUrgent: true };
    if (daysLeft === 0) return { dateText, countdownText: "Hôm nay", isUrgent: true };
    if (daysLeft <= 2) return { dateText, countdownText: `Còn ${daysLeft} ngày`, isUrgent: true };
    return { dateText, countdownText: `Còn ${daysLeft} ngày`, isUrgent: false };
  };

  const getCellContent = (order: Order, field: string) => {
    const cellKey = `${order.id}-${field}`;
    const deliveredCellKey = `${order.id}-delivered_date`;
    const isEditing = editingCell === cellKey || (field === "delivery_date" && editingCell === deliveredCellKey);
    const effectiveField = editingCell === deliveredCellKey ? "delivered_date" : field;

    if (isEditing) {
      switch (effectiveField) {
        case "status":
          return (
            <Select open={true} value={editValue} onValueChange={value => { setEditValue(value); handleSave(order.id, field, undefined, value); }} onOpenChange={open => !open && handleCancel()}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(statusConfig).map(([key, config]) => <SelectItem key={key} value={key}>{config.label}</SelectItem>)}
              </SelectContent>
            </Select>
          );
        case "assignee_id":
          return (
            <Select open={true} value={editValue || "unassigned"} onValueChange={value => { const v = value === "unassigned" ? null : value; setEditValue(v); handleSave(order.id, field, undefined, v); }} onOpenChange={open => !open && handleCancel()}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Chưa phân công</SelectItem>
                {assignees.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          );
        case "payment_status":
          return null;
        case "delivery_date":
        case "delivered_date":
        case "created_at":
          return (
            <Popover open={true} onOpenChange={open => !open && handleCancel()}>
              <PopoverTrigger asChild><div className="w-40" /></PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white z-50" align="start">
                <CalendarComponent mode="single" selected={selectedDate} onSelect={date => { setSelectedDate(date); if (date) handleSave(order.id, effectiveField, date); }} initialFocus locale={vi} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          );
        case "order_number":
          return (
            <div className="flex items-center gap-1">
              <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-32 h-7 text-xs" placeholder="Mã đơn..." />
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleSave(order.id, field)}><Check className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleCancel}><X className="h-3 w-3" /></Button>
            </div>
          );
        case "notes":
          return (
            <div className="flex items-start gap-1">
              <textarea value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full min-h-[50px] resize-none rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Ghi chú..." rows={2} />
              <div className="flex flex-col gap-0.5">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleSave(order.id, field)}><Check className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleCancel}><X className="h-3 w-3" /></Button>
              </div>
            </div>
          );
        default:
          return null;
      }
    }

    // Display mode
    switch (field) {
      case "status": {
        const daysLeft = getDaysLeft(order.delivery_date, order.created_at);
        const badgeStyle = getStatusBadgeStyle(order.status, daysLeft);
        const statusInfo = statusConfig[order.status as keyof typeof statusConfig];
        return (
          <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, order.status)}>
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", badgeStyle)}>
              {statusInfo?.label || order.status}
            </span>
          </div>
        );
      }
      case "payment_status": {
        const totalPaid = order.total_paid || 0;
        const remainingAmount = (order.total_amount || 0) - totalPaid;
        return (
          <div className="text-xs space-y-0.5 font-mono">
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Đã thanh toán:</span>
              <span className={cn("font-semibold", totalPaid > 0 ? "text-[#059669]" : "text-[#6B7280]")}>
                {formatCurrency(totalPaid)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Còn lại:</span>
              <span className={cn("font-bold", remainingAmount > 0 ? "text-[#DC2626]" : "text-[#059669]")}>
                {formatCurrency(Math.abs(remainingAmount))}
              </span>
            </div>
          </div>
        );
      }
      case "delivery_date": {
        if (order.status === "shipped" || order.status === "self_delivered" || order.status === "delivered") {
          const deliveredDate = order.delivered_date ? format(new Date(order.delivered_date), "dd/MM/yyyy", { locale: vi }) : "—";
          const deliveryLabel = order.status === "self_delivered" ? "Đã giao tự thu tiền" : order.status === "delivered" ? "Hoàn thành" : "Đã giao";
          return (
            <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, "delivered_date", order.delivered_date || new Date().toISOString())}>
              <span className="text-sm font-medium block">{deliveredDate}</span>
              <span className="text-xs block text-[#059669] font-semibold">{deliveryLabel}</span>
            </div>
          );
        }
        const dateInfo = formatDateWithCountdown(order.delivery_date, order.created_at);
        const urgent = isRowUrgent(order);
        return (
          <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, order.delivery_date)}>
            <span className="text-sm font-medium block">{dateInfo.dateText}</span>
            {dateInfo.countdownText && (
              <span className={cn("text-xs block", dateInfo.isUrgent ? "text-[#DC2626] font-bold" : "text-gray-500")}>
                {urgent && <AlertTriangle className="inline h-3 w-3 mr-0.5 -mt-0.5" />}
                {dateInfo.countdownText}
              </span>
            )}
          </div>
        );
      }
      case "created_at":
        return (
          <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, order.created_at)}>
            <span className="text-sm">{format(new Date(order.created_at), "dd/MM/yyyy", { locale: vi })}</span>
          </div>
        );
      case "assignee_id": {
        const assigneeName = order.assignees?.name || 'Chưa phân công';
        return (
          <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, order.assignee_id || "unassigned")}>
            {assigneeName !== 'Chưa phân công'
              ? <span className="text-blue-600 font-medium text-sm">{assigneeName}</span>
              : <span className="text-gray-400 italic text-sm">{assigneeName}</span>}
          </div>
        );
      }
      case "order_number":
        return (
          <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, getOrderDisplayNumber(order))}>
            <span className="font-semibold font-mono text-[#1F2937] text-sm">{getOrderDisplayNumber(order)}</span>
          </div>
        );
      case "notes": {
        const formatNotes = (notes: string | null) => {
          if (!notes) return null;
          const lines = notes.split('\n');
          return lines.map((line, index) => {
            if (line.trim().startsWith('•')) {
              return <div key={index} className="flex items-start gap-1"><span className="text-blue-600 font-bold">•</span><span className="flex-1">{line.replace('•', '').trim()}</span></div>;
            }
            return line && <div key={index}>{line}</div>;
          }).filter(Boolean);
        };
        return (
          <div className="cursor-pointer" onClick={() => handleCellEdit(order.id, field, order.notes)}>
            <div className="text-xs break-words leading-relaxed">{formatNotes(order.notes)}</div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4">
      <div className="rounded-lg border border-[#E5E7EB] max-h-[600px] overflow-auto order-table-scroll">
        <Table disableWrapper className="min-w-max">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="border-0 hover:bg-transparent">
              <TableHead className="min-w-[120px] bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-4 border-0">Mã đơn hàng</TableHead>
              <TableHead className="min-w-[130px] bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-3 border-0">Mã vận đơn</TableHead>
              <TableHead className="min-w-[100px] bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-3 border-0">Ngày tạo</TableHead>
              <TableHead className="min-w-[140px] bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-3 border-0">Ngày hẹn trả</TableHead>
              <TableHead className="min-w-[120px] bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-3 border-0">Trạng thái</TableHead>
              <TableHead className="min-w-[180px] bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-3 border-0">Khách hàng</TableHead>
              <TableHead className="min-w-[140px] bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-3 border-0 text-right">Giá trị</TableHead>
              <TableHead className="min-w-[240px] bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-3 border-0 text-right">Thanh toán</TableHead>
              <TableHead className="min-w-[220px] bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-3 border-0">Ghi chú</TableHead>
              <TableHead className="min-w-[130px] bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-3 border-0">Phụ trách</TableHead>
              <TableHead className="min-w-[130px] bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-3 border-0">Quản lý</TableHead>
              <TableHead className="min-w-[160px] bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-3 border-0">Vải sử dụng</TableHead>
              <TableHead className="min-w-[70px] sticky right-0 bg-[#0F766E] text-white font-bold text-[13px] uppercase tracking-[0.5px] py-3 px-3 border-0 shadow-[-4px_0_8px_rgba(0,0,0,0.1)]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order, index) => {
              const urgent = isRowUrgent(order);
              const isEven = index % 2 === 1;
              const rowBg = isEven ? '#F5F9F6' : '#FFFFFF';

              return (
                <TableRow
                  key={order.id}
                  className={cn(
                    "transition-colors duration-150 border-b border-[#E5E7EB] hover:bg-[#E8F1FB] group",
                    urgent && "border-l-4 border-l-[#DC2626]"
                  )}
                  style={{ backgroundColor: rowBg }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#E8F1FB')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = rowBg)}
                >
                  {/* Order code - anchored column */}
                  <TableCell className="py-2 px-4 bg-[#F3F4F6]/50 border-0" style={{ fontSize: '14px' }}>
                    {getCellContent(order, "order_number")}
                  </TableCell>
                  {/* GHN tracking */}
                  <TableCell className="py-2 px-3 border-0" style={{ fontSize: '14px' }}>
                    {editingCell === `${order.id}-ghn_tracking` ? (
                      <GhnTrackingEditCell
                        orderId={order.id}
                        initialCodes={order.ghn_tracking?.map(t => t.ghn_order_code) || []}
                        onDone={() => setEditingCell(null)}
                      />
                    ) : (
                      <div className="flex flex-col gap-0.5 cursor-pointer min-h-[20px]" onClick={() => setEditingCell(`${order.id}-ghn_tracking`)}>
                        {order.ghn_tracking && order.ghn_tracking.length > 0 ? (
                          order.ghn_tracking.map((t, i) => (
                            <span key={i} className="text-xs font-mono text-gray-700">{t.ghn_order_code}</span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400 italic">—</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  {/* Created date */}
                  <TableCell className="py-2 px-3 border-0" style={{ fontSize: '14px' }}>
                    {getCellContent(order, "created_at")}
                  </TableCell>
                  {/* Delivery date */}
                  <TableCell className="py-2 px-3 border-0" style={{ fontSize: '14px' }}>
                    {getCellContent(order, "delivery_date")}
                  </TableCell>
                  {/* Status */}
                  <TableCell className="py-2 px-3 border-0">
                    {getCellContent(order, "status")}
                  </TableCell>
                  {/* Customer */}
                  <TableCell className="py-2 px-3 border-0" style={{ fontSize: '14px' }}>
                    <div>
                      <div className="font-medium text-[#1F2937] text-sm">{order.customers?.name}</div>
                      {order.customers?.phone && <div className="text-xs text-[#6B7280]">{order.customers.phone}</div>}
                    </div>
                  </TableCell>
                  {/* Amount - right aligned, monospace */}
                  <TableCell className="py-2 px-3 border-0 text-right font-mono" style={{ fontSize: '14px' }}>
                    <div className="space-y-0.5">
                      <div className="font-semibold text-[#1F2937]">{formatCurrency(order.total_amount)}</div>
                      {(() => {
                        const totalPaid = order.order_payments?.reduce((total: number, payment: any) => total + (payment.payment_amount || 0), 0) || 0;
                        const remaining = Math.max(0, (order.total_amount || 0) - totalPaid);
                        return remaining > 0 ? (
                          <div className="text-xs text-[#DC2626] font-bold">Còn: {formatCurrency(remaining)}</div>
                        ) : null;
                      })()}
                    </div>
                  </TableCell>
                  {/* Payment info - right aligned, monospace */}
                  <TableCell className="py-2 px-3 border-0 text-right">
                    {getCellContent(order, "payment_status")}
                  </TableCell>
                  {/* Notes */}
                  <TableCell className="py-2 px-3 border-0" style={{ fontSize: '14px' }}>
                    {getCellContent(order, "notes")}
                  </TableCell>
                  {/* Assignee */}
                  <TableCell className="py-2 px-3 border-0">
                    {getCellContent(order, "assignee_id")}
                  </TableCell>
                  {/* Manager */}
                  <TableCell className="py-2 px-3 border-0">
                    <div className="text-sm">
                      {order.manager_id ? (
                        <span className="font-medium text-blue-600">{managerMap.get(order.manager_id) || '—'}</span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">—</span>
                      )}
                    </div>
                  </TableCell>
                  {/* Fabric usage */}
                  <TableCell className="py-2 px-3 border-0">
                    <FabricUsageCell orderId={order.id} />
                  </TableCell>
                  {/* Actions - sticky */}
                  <TableCell
                    className="py-2 px-3 sticky right-0 border-0 shadow-[-4px_0_8px_rgba(0,0,0,0.05)]"
                    style={{ backgroundColor: 'inherit' }}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0 rounded-full opacity-60 group-hover:opacity-100 group-hover:bg-gray-100 transition-all"
                        >
                          <span className="sr-only">Mở menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onViewOrderDetail && (
                          <DropdownMenuItem onClick={() => onViewOrderDetail(order)} className="text-blue-600">
                            <Eye className="mr-2 h-4 w-4" />Xem chi tiết
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onDeleteOrder(order)} className="text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" />Xóa đơn hàng
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
