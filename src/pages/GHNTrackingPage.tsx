import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Truck } from "lucide-react";

interface GHNOrder {
  order_code: string;
  status: string;
  to_name: string;
  to_phone: string;
  to_address: string;
  weight: number;
  created_date: string;
  leadtime?: string;
  finish_date?: string;
  cod_amount: number;
  error?: string;
}

// Map trạng thái sang tiếng Việt và màu nền
const statusMap = {
  picking: { label: "Đang lấy hàng", color: "#FFFF99" },
  storing: { label: "Đang lưu kho", color: "#FFCC99" },
  transporting: { label: "Đang vận chuyển", color: "#99CCFF" },
  delivered: { label: "Đã giao hàng", color: "#99FF99" },
  canceled: { label: "Đã hủy", color: "#FF9999" },
  returning: { label: "Đang trả hàng", color: "#FFCCFF" },
  return_transporting: { label: "Đang vận chuyển trả hàng", color: "#FF9966" },
  ready_to_pick: { label: "Sẵn sàng lấy hàng", color: "#CCFF99" },
  delivering: { label: "Đang giao hàng", color: "#ED849C" },
  returned: { label: "Hoàn hàng thành công", color: "#B8A6A0" },
};

function formatDate(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN");
}

export default function GHNTrackingPage() {
  const [orders, setOrders] = useState<GHNOrder[]>([]);
  const [orderInput, setOrderInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  // Load từ localStorage khi khởi tạo
  useEffect(() => {
    const saved = localStorage.getItem("ghn_orders");
    if (saved) {
      try {
        setOrders(JSON.parse(saved));
      } catch (e) {
        console.error("Error loading saved orders:", e);
      }
    }
  }, []);

  // Lưu vào localStorage khi orders thay đổi
  useEffect(() => {
    localStorage.setItem("ghn_orders", JSON.stringify(orders));
  }, [orders]);

  // Thêm đơn mới
  const addOrder = async () => {
    const code = orderInput.trim();
    if (!code) return;
    
    setLoading(true);
    setError("");
    
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: { 
          action: 'track_order',
          orderCode: code
        }
      });

      if (error) throw error;

      if (data.success) {
        // Kiểm tra đã có trong bảng chưa
        if (orders.some((o) => o.order_code === code)) {
          setError("Đơn đã tồn tại trong danh sách.");
          toast({
            title: "Cảnh báo",
            description: "Đơn đã tồn tại trong danh sách.",
            variant: "destructive",
          });
        } else {
          setOrders(prev => [data.data, ...prev]);
          toast({
            title: "Thành công",
            description: "Đã thêm đơn hàng mới",
            duration: 2000,
          });
        }
      } else {
        setError(data.error || "Không tìm thấy đơn hàng");
        toast({
          title: "Lỗi",
          description: data.error || "Không tìm thấy đơn hàng",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      const errorMsg = error.message || "Lỗi kết nối server!";
      setError(errorMsg);
      toast({
        title: "Lỗi",
        description: errorMsg,
        variant: "destructive",
      });
    }
    
    setLoading(false);
    setOrderInput("");
  };

  // Cập nhật trạng thái toàn bộ đơn
  const updateAll = async () => {
    if (orders.length === 0) return;
    
    setLoading(true);
    setError("");
    
    try {
      const updated: GHNOrder[] = [];
      for (let o of orders) {
        const { data, error } = await supabase.functions.invoke('ghn-tracking', {
          body: { 
            action: 'track_order',
            orderCode: o.order_code
          }
        });

        if (error) {
          updated.push({ ...o, error: error.message });
        } else if (data.success) {
          updated.push(data.data);
        } else {
          updated.push({ ...o, error: data.error || "Lỗi cập nhật" });
        }
      }
      setOrders(updated);
      toast({
        title: "Thành công",
        description: "Đã cập nhật trạng thái tất cả đơn hàng",
        duration: 2000,
      });
    } catch (error: any) {
      setError("Lỗi cập nhật trạng thái!");
      toast({
        title: "Lỗi",
        description: "Lỗi cập nhật trạng thái!",
        variant: "destructive",
      });
    }
    
    setLoading(false);
  };

  // Xóa đơn hàng
  const removeOrder = (code: string) => {
    setOrders(orders.filter((o) => o.order_code !== code));
    toast({
      title: "Đã xóa",
      description: "Đã xóa đơn hàng khỏi danh sách",
      duration: 1500,
    });
  };

  return (
    <div style={{ padding: 32, maxWidth: 1280, margin: "auto", fontFamily: "Segoe UI" }}>
      <div className="flex items-center gap-2 mb-6">
        <Truck className="h-6 w-6 text-blue-600" />
        <h2 className="text-2xl font-bold">Quản lý đơn hàng GHN</h2>
      </div>
      
      <div style={{ marginBottom: 16 }}>
        <Input
          value={orderInput}
          onChange={(e) => setOrderInput(e.target.value)}
          placeholder="Nhập mã đơn GHN"
          style={{ padding: 8, width: 240, marginRight: 8, fontSize: 16 }}
          onKeyDown={e => e.key === "Enter" && addOrder()}
          className="inline-block"
        />
        <Button onClick={addOrder} disabled={loading || !orderInput} style={{ padding: 8, fontSize: 16, marginRight: 8 }}>
          Thêm đơn
        </Button>
        <Button onClick={updateAll} disabled={loading || !orders.length} style={{ padding: 8 }}>
          Cập nhật trạng thái
        </Button>
      </div>
      
      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}
      
      <div style={{ overflowX: "auto" }}>
        <table border={1} cellPadding={6} cellSpacing={0} style={{ minWidth: 1200, background: "#fff", width: "100%" }}>
          <thead style={{ background: "#eaeaea" }}>
            <tr>
              <th>STT</th>
              <th>Mã đơn</th>
              <th>Trạng thái</th>
              <th>Tên khách</th>
              <th>SĐT khách</th>
              <th>Địa chỉ</th>
              <th>Cân nặng</th>
              <th>Ngày tạo</th>
              <th>Ngày dự kiến</th>
              <th>Ngày giao thành công</th>
              <th>Tiền COD</th>
              <th>Tra cứu GHN</th>
              <th>Xóa</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={13} style={{ textAlign: "center" }}>
                  Chưa có đơn nào.
                </td>
              </tr>
            )}
            {orders.map((o, idx) => {
              const statusObj = statusMap[o.status as keyof typeof statusMap] || { label: o.status, color: "#fff" };
              return (
                <tr key={o.order_code} style={{ background: statusObj.color }}>
                  <td style={{ textAlign: "center" }}>{idx + 1}</td>
                  <td>{o.order_code}</td>
                  <td>{statusObj.label}</td>
                  <td>{o.to_name}</td>
                  <td>{o.to_phone}</td>
                  <td>{o.to_address}</td>
                  <td>{o.weight ? `${o.weight / 1000} kg` : ""}</td>
                  <td>{formatDate(o.created_date)}</td>
                  <td>{formatDate(o.leadtime)}</td>
                  <td>{formatDate(o.finish_date)}</td>
                  <td>{o.cod_amount ? o.cod_amount.toLocaleString() : ""}</td>
                  <td>
                    <a
                      href={`https://donhang.ghn.vn/?order_code=${o.order_code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      Tra cứu
                    </a>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <Button 
                      onClick={() => removeOrder(o.order_code)} 
                      style={{ color: "red", background: "none", border: "none", cursor: "pointer" }}
                      variant="ghost"
                      size="sm"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {loading && <div style={{ color: "#888", marginTop: 12 }}>Đang xử lý...</div>}
      
      <div style={{ fontSize: 12, color: "#888", marginTop: 16 }}>
        * Dữ liệu được lưu tạm thời trong trình duyệt. Xóa cache sẽ mất dữ liệu.
      </div>
    </div>
  );
}