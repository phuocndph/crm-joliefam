import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink, Package, User, MapPin, Banknote, Clock, Truck } from "lucide-react";

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
    return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

export function GHNOrderDetailDialog({ ghnOrderCode, open, onOpenChange }: GHNOrderDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && ghnOrderCode) {
      fetchDetail();
    }
    if (!open) {
      setData(null);
      setError(null);
    }
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
  const trackingUrl = `https://donhang.ghn.vn/?order_code=${ghnOrderCode}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
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
          <div className="text-center py-8 text-destructive">
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchDetail}>Thử lại</Button>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-5">
            {/* Status */}
            <div className="flex items-center gap-3">
              <Badge className={`${statusColors[data.status] || "bg-gray-100 text-gray-800"} px-3 py-1 text-sm`}>
                {data.statusText || data.status}
              </Badge>
              {raw.order_code && <span className="text-sm text-muted-foreground font-mono">{raw.order_code}</span>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Người nhận */}
              <Section icon={<User className="h-4 w-4" />} title="Người nhận">
                <Info label="Họ tên" value={raw.to_name || data.customerName} />
                <Info label="SĐT" value={raw.to_phone || data.customerPhone} />
                <Info label="Địa chỉ" value={buildFullAddress(raw) || data.customerAddress} />
              </Section>

              {/* Người gửi */}
              {(raw.from_name || raw.from_phone) && (
                <Section icon={<Truck className="h-4 w-4" />} title="Người gửi">
                  <Info label="Họ tên" value={raw.from_name} />
                  <Info label="SĐT" value={raw.from_phone} />
                  <Info label="Địa chỉ" value={[raw.from_address, raw.from_ward_name, raw.from_district_name, raw.from_province_name].filter(Boolean).join(", ")} />
                </Section>
              )}

              {/* Thông tin đơn */}
              <Section icon={<Package className="h-4 w-4" />} title="Thông tin đơn hàng">
                <Info label="Cân nặng" value={raw.weight ? `${(raw.weight / 1000).toFixed(2)} kg` : undefined} />
                <Info label="Kích thước" value={raw.length && raw.width && raw.height ? `${raw.length} × ${raw.width} × ${raw.height} cm` : undefined} />
                <Info label="Nội dung" value={raw.content} />
                <Info label="Ghi chú" value={raw.note || raw.required_note} />
                {raw.items && raw.items.length > 0 && (
                  <div className="mt-1">
                    <span className="text-xs text-muted-foreground">Sản phẩm:</span>
                    <ul className="text-sm ml-2">
                      {raw.items.map((item: any, i: number) => (
                        <li key={i}>• {item.name} × {item.quantity}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>

              {/* Tài chính */}
              <Section icon={<Banknote className="h-4 w-4" />} title="Tài chính">
                <Info label="Tiền thu hộ (COD)" value={fmt(raw.cod_amount ?? data.codAmount)} highlight />
                <Info label="Phí vận chuyển" value={fmt(raw.total_fee)} />
                <Info label="Phí dịch vụ chính" value={fmt(raw.main_service_fee)} />
                <Info label="Phí bảo hiểm" value={fmt(raw.insurance_value)} />
                {raw.pick_station_fee > 0 && <Info label="Phí bưu cục" value={fmt(raw.pick_station_fee)} />}
                {raw.r2s_fee > 0 && <Info label="Phí R2S" value={fmt(raw.r2s_fee)} />}
                {raw.return_fee > 0 && <Info label="Phí hoàn" value={fmt(raw.return_fee)} />}
                {raw.coupon != null && raw.coupon !== "" && <Info label="Coupon" value={raw.coupon} />}
              </Section>

              {/* Timeline */}
              <Section icon={<Clock className="h-4 w-4" />} title="Timeline" className="md:col-span-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <TimelineItem label="Ngày tạo" date={raw.created_date || data.createdDate} />
                  <TimelineItem label="Ngày lấy hàng" date={raw.pick_date || raw.picking_shift_date} />
                  <TimelineItem label="Dự kiến giao" date={raw.leadtime || data.expectedDeliveryTime} />
                  <TimelineItem label="Ngày giao" date={raw.finish_date || data.deliveredDate} success={!!raw.finish_date} />
                </div>
              </Section>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center pt-3 border-t">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open(trackingUrl, "_blank")}>
                <ExternalLink className="h-4 w-4" />
                Mở trên GHN
              </Button>
              <span className="text-xs text-muted-foreground">
                Cập nhật lúc: {fmtDate(raw.updated_date || new Date().toISOString())}
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ icon, title, children, className }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`border rounded-lg p-4 space-y-2 ${className || ""}`}>
      <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">{icon}{title}</h3>
      {children}
    </div>
  );
}

function Info({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-sm gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right ${highlight ? "font-semibold text-primary" : ""}`}>{value}</span>
    </div>
  );
}

function TimelineItem({ label, date, success }: { label: string; date?: string; success?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm font-medium ${success ? "text-green-600" : ""}`}>{fmtDate(date)}</div>
    </div>
  );
}

function buildFullAddress(raw: any): string {
  return [raw.to_address, raw.to_ward_name, raw.to_district_name, raw.to_province_name].filter(Boolean).join(", ");
}
