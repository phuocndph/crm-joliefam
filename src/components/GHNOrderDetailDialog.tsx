import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink, Package } from "lucide-react";

interface GHNOrderDetailDialogProps {
  ghnOrderCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusColors: Record<string, string> = {
  'ready_to_pick': 'bg-yellow-100 text-yellow-800',
  'picking': 'bg-orange-100 text-orange-800',
  'picked': 'bg-blue-100 text-blue-800',
  'storing': 'bg-purple-100 text-purple-800',
  'transporting': 'bg-indigo-100 text-indigo-800',
  'sorting': 'bg-cyan-100 text-cyan-800',
  'delivering': 'bg-pink-100 text-pink-800',
  'delivered': 'bg-green-100 text-green-800',
  'delivery_fail': 'bg-red-100 text-red-800',
  'returning': 'bg-amber-100 text-amber-800',
  'returned': 'bg-gray-100 text-gray-800',
  'cancel': 'bg-red-100 text-red-800',
  'lost': 'bg-red-100 text-red-800',
  'damage': 'bg-red-100 text-red-800',
};

function fmt(amount?: number): string {
  if (amount == null) return "0 ₫";
  return `${amount.toLocaleString("vi-VN")} ₫`;
}

function fmtDate(d?: string): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return "—"; }
}

function fmtDateTime(d?: string): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function fmtTime(d?: string): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function getDateLabel(d: string): string {
  try {
    const date = new Date(d);
    const days = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    return `${days[date.getDay()]}, ${date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  } catch { return d; }
}

interface LogEntry {
  status: string;
  updated_date: string;
  comment?: string;
}

export function GHNOrderDetailDialog({ ghnOrderCode, open, onOpenChange }: GHNOrderDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && ghnOrderCode) fetchDetail();
    if (!open) { setData(null); setError(null); }
  }, [open, ghnOrderCode]);

  const fetchDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("ghn-tracking", {
        body: { action: "track_order", orderCode: ghnOrderCode },
      });
      if (err) throw err;
      if (!res.success) throw new Error(res.error || "Không thể lấy thông tin");
      setData(res.data);
    } catch (e: any) {
      setError(e.message || "Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  };

  const raw = data?.rawData || {};
  const logs: LogEntry[] = data?.logs || [];
  const trackingUrl = `https://donhang.ghn.vn/?order_code=${ghnOrderCode}`;

  // Build expected delivery range
  const leadtime = raw.leadtime;
  const pickDate = raw.pick_date || raw.picking_shift_date;

  // Group logs by date
  const groupedLogs = logs.reduce((acc: Record<string, LogEntry[]>, log) => {
    const dateKey = log.updated_date ? new Date(log.updated_date).toDateString() : "unknown";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(log);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0" aria-describedby={undefined}>
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Chi tiết đơn hàng {ghnOrderCode}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Đang tải từ GHN...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-destructive px-6">
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchDetail}>Thử lại</Button>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-0">
            {/* Top sections: 2 columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border mx-6">
              {/* THÔNG TIN ĐƠN HÀNG */}
              <div className="bg-background p-4 space-y-2">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Thông tin đơn hàng</h3>
                <InfoRow label="Mã đơn hàng:" value={raw.order_code || ghnOrderCode} />
                <InfoRow label="Ngày lấy dự kiến:" value={fmtDate(pickDate)} />
                <InfoRow label="Ngày giao dự kiến:" value={fmtDate(leadtime)} />
                <div className="flex justify-between text-sm gap-2">
                  <span className="text-muted-foreground shrink-0">Trạng thái hiện tại:</span>
                  <Badge className={`${statusColors[data.status] || "bg-muted text-muted-foreground"} text-xs`}>
                    {data.statusText || data.status}
                  </Badge>
                </div>
                {(raw.shipper_name || raw.shipper_phone) && (
                  <InfoRow
                    label="Nhân viên giao hàng:"
                    value={[raw.shipper_name, raw.shipper_phone].filter(Boolean).join(" - ")}
                  />
                )}
              </div>

              {/* THÔNG TIN CHI TIẾT */}
              <div className="bg-background p-4 space-y-2">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Thông tin chi tiết</h3>
                <InfoRow label="Mã đơn khách hàng:" value={raw.client_order_code || raw.content || "—"} />
                <InfoRow label="Sản phẩm:" value={raw.items?.map((i: any) => `${i.name} x${i.quantity}`).join(", ") || raw.content || "—"} />
                <InfoRow label="Cân nặng:" value={raw.weight ? `${raw.weight} gram` : "—"} />
                <InfoRow label="Lưu ý giao hàng:" value={raw.note || raw.required_note || "—"} />
              </div>
            </div>

            {/* Bottom sections: 2 columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border mx-6 mt-px">
              {/* NGƯỜI NHẬN */}
              <div className="bg-background p-4 space-y-2">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Người nhận</h3>
                <InfoRow label="Họ và tên:" value={raw.to_name || data.customerName} />
                <InfoRow label="Điện thoại:" value={raw.to_phone || data.customerPhone} />
                <InfoRow label="Địa chỉ:" value={buildFullAddress(raw) || data.customerAddress} />
              </div>

              {/* CHI PHÍ */}
              <div className="bg-background p-4 space-y-2">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Chi phí</h3>
                <InfoRow label="Phí vận chuyển:" value={fmt(raw.total_fee)} />
                <InfoRow label="Tiền thu hộ (COD):" value={fmt(raw.cod_amount ?? data.codAmount)} highlight />
                <InfoRow label="Phí bảo hiểm:" value={fmt(raw.insurance_value)} />
                <InfoRow
                  label="Người trả:"
                  value={raw.payment_type_id === 1 ? "Người gửi trả phí" : "Người nhận trả phí"}
                />
              </div>
            </div>

            {/* Lịch sử đơn hàng */}
            {logs.length > 0 && (
              <div className="mx-6 mt-4 border rounded-lg">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wide p-4 pb-2">
                  Lịch sử đơn hàng
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium text-muted-foreground w-[180px]"></th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Chi tiết</th>
                        <th className="text-right p-3 font-medium text-muted-foreground w-[80px]">Thời gian</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(groupedLogs)
                        .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                        .map(([dateKey, dateLogs]) => (
                          <React.Fragment key={dateKey}>
                            <tr className="border-b bg-muted/30">
                              <td colSpan={3} className="p-2 px-3 font-semibold text-xs text-foreground">
                                {getDateLabel(dateKey)}
                              </td>
                            </tr>
                            {dateLogs
                              .sort((a, b) => new Date(b.updated_date).getTime() - new Date(a.updated_date).getTime())
                              .map((log, i) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="p-3 text-primary font-medium">
                                    {getStatusTextFromLog(log.status)}
                                  </td>
                                  <td className="p-3 text-muted-foreground">{log.comment || "—"}</td>
                                  <td className="p-3 text-right font-medium">{fmtTime(log.updated_date)}</td>
                                </tr>
                              ))}
                          </React.Fragment>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-between items-center p-6 pt-4 border-t mt-4">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open(trackingUrl, "_blank")}>
                <ExternalLink className="h-4 w-4" />
                Mở trên GHN
              </Button>
              <span className="text-xs text-muted-foreground">
                Cập nhật lúc: {fmtDateTime(raw.updated_date || new Date().toISOString())}
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-sm gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right ${highlight ? "font-semibold text-primary" : "text-foreground"}`}>{value || "—"}</span>
    </div>
  );
}

function buildFullAddress(raw: any): string {
  return [raw.to_address, raw.to_ward_name, raw.to_district_name, raw.to_province_name].filter(Boolean).join(", ");
}

function getStatusTextFromLog(status: string): string {
  const map: Record<string, string> = {
    'ready_to_pick': 'Sẵn sàng lấy hàng',
    'picking': 'Đang lấy hàng',
    'picked': 'Đã lấy hàng',
    'storing': 'Lưu kho',
    'transporting': 'Đang vận chuyển',
    'sorting': 'Đang phân loại',
    'delivering': 'Đang giao hàng',
    'delivered': 'Đã giao hàng',
    'delivery_fail': 'Giao hàng thất bại',
    'returning': 'Đang trả hàng',
    'returned': 'Hoàn hàng thành công',
    'cancel': 'Đã hủy',
    'waiting_to_return': 'Chờ trả hàng',
    'return_transporting': 'Đang vận chuyển trả hàng',
    'return_sorting': 'Phân loại trả hàng',
    'money_collect_delivering': 'Thu tiền người nhận',
    'money_collect_picking': 'Thu tiền người gửi',
    'exception': 'Ngoại lệ',
    'damage': 'Hư hỏng',
    'lost': 'Thất lạc',
    'ready_to_deliver': 'Sẵn sàng giao hàng',
    'nhap_hang_vao_buu_cuc_giao': 'Nhập hàng vào bưu cục giao',
  };
  return map[status] || status;
}
