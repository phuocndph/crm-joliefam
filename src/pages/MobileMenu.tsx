import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions, type PermissionType } from "@/hooks/useEmployeePermissions";
import { Card } from "@/components/ui/card";
import {
  Home, Users2, Package, ShoppingCart, FileText, CreditCard,
  BarChart3, Headphones, Truck, Scissors, FileSignature, Receipt,
  Wallet, BookOpen, Bot, Globe, Building,
} from "lucide-react";

type Item = { icon: any; label: string; path: string; perm?: PermissionType };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Kinh doanh",
    items: [
      { icon: Users2, label: "Khách hàng", path: "/customers", perm: "customers" },
      { icon: Package, label: "Sản phẩm", path: "/products", perm: "products" },
      { icon: ShoppingCart, label: "Đơn hàng", path: "/orders", perm: "orders" },
      { icon: FileText, label: "Báo giá", path: "/quotes", perm: "quotes" },
      { icon: Headphones, label: "Chăm sóc KH", path: "/customer-care", perm: "customer_care" },
      { icon: Home, label: "Dashboard", path: "/dashboard", perm: "dashboard" },
    ],
  },
  {
    title: "Tài chính",
    items: [
      { icon: CreditCard, label: "Dòng tiền", path: "/cash-flow", perm: "cash_flow" },
      { icon: Wallet, label: "Giao dịch", path: "/transactions", perm: "transactions" },
      { icon: FileSignature, label: "Hợp đồng", path: "/contracts", perm: "contracts" },
      { icon: Receipt, label: "Hóa đơn ĐT", path: "/einvoices", perm: "contracts" },
    ],
  },
  {
    title: "Vận hành",
    items: [
      { icon: Truck, label: "Vận chuyển GHN", path: "/ghn-tracking", perm: "ghn_tracking" },
      { icon: Building, label: "ĐV vận chuyển", path: "/shipping-companies", perm: "shipping_companies" },
      { icon: Scissors, label: "Vải", path: "/fabrics", perm: "fabric_management" },
      { icon: BarChart3, label: "Báo cáo", path: "/reports", perm: "reports" },
    ],
  },
  {
    title: "Hệ thống",
    items: [
      { icon: Users2, label: "Quản lý user", path: "/user-management", perm: "user_management" },
      { icon: BookOpen, label: "Tri thức", path: "/knowledge-base", perm: "knowledge_base" },
      { icon: Bot, label: "Cài đặt AI", path: "/ai-settings" },
      { icon: Globe, label: "Web Scraper", path: "/web-scraper" },
    ],
  },
];

export default function MobileMenu() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
  }, []);
  const { role } = useUserRole(user);
  const { hasPermission, loading } = useEmployeePermissions(user, role);
  const isPriv = role === "admin" || role === "manager";
  const canSee = (p?: PermissionType) => (!p ? isPriv : hasPermission(p));

  if (loading) {
    return <div className="text-center text-muted-foreground py-8">Đang tải...</div>;
  }

  const groups = GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => canSee(i.perm)) }))
    .filter(g => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Bạn chưa được cấp quyền truy cập tính năng nào.
        <br />Vui lòng liên hệ quản trị viên.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.title} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
            {g.title}
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {g.items.map((it) => (
              <Card
                key={it.path}
                onClick={() => navigate(it.path)}
                className="flex flex-col items-center justify-center gap-2 p-3 aspect-square cursor-pointer active:scale-95 transition-transform hover:bg-accent"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <it.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-medium text-center leading-tight">
                  {it.label}
                </span>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
