import { 
  Home, 
  Users, 
  Package, 
  FileText, 
  ShoppingCart, 
  TrendingUp, 
  CreditCard, 
  BarChart3,
  Settings,
  UserCheck,
  Truck,
  Scissors,
  BookOpen,
  FileSignature,
  Receipt,
  Sparkles,
  Globe,
  Container,
  CircleDollarSign,
  Boxes,
  Factory,
  CalendarCheck2,
  WalletCards,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions, type PermissionType } from "@/hooks/useEmployeePermissions";
import { isLocalBackend, isLocalDemoEnabled, localAdminUser } from "@/lib/runtime-config";
import { getLocalMe, hasStoredLocalUserSession, hasLocalUserSession } from "@/lib/local-auth";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type MenuItem = { title: string; url: string; icon: LucideIcon; description: string; permission: PermissionType | PermissionType[]; integrationAdmin?: boolean };

const menuItems: MenuItem[] = [
  { title: 'API & kết nối Agent', url: '/integration-access', icon: Settings, description: 'Cấp khóa và quyền cho Hermes', permission: 'user_management', integrationAdmin: true },
  {
    title: "Tổng quan",
    url: "/dashboard",
    icon: Home,
    description: "Tổng quan & thống kê",
    permission: "dashboard" as const
  },
  { 
    title: "Khách hàng", 
    url: "/customers", 
    icon: Users,
    description: "Quản lý danh sách khách hàng",
    permission: "customers" as const
  },
  { 
    title: "Chăm sóc KH", 
    url: "/customer-care", 
    icon: UserCheck,
    description: "Hệ thống chăm sóc khách hàng",
    permission: "customers" as const
  },
  { 
    title: "Sản phẩm", 
    url: "/products", 
    icon: Package,
    description: "Quản lý kho hàng và giá",
    permission: "products" as const
  },
  { 
    title: "Quản lý vải", 
    url: "/fabrics", 
    icon: Scissors,
    description: "Quản lý kho vải xưởng sản xuất",
    permission: "fabric_management" as const
  },
  {
    title: "Kho & vật tư",
    url: "/inventory-management",
    icon: Boxes,
    description: "Nhập xuất kho và giá vốn vật tư",
    permission: "inventory_view" as const
  },
  {
    title: "Lệnh sản xuất",
    url: "/production-orders",
    icon: Factory,
    description: "Kế hoạch và thực tế sản xuất",
    permission: "production_view" as const
  },
  {
    title: "Chấm công xưởng",
    url: "/production-attendance",
    icon: CalendarCheck2,
    description: "Bảng công toàn bộ nhân sự xưởng",
    permission: "production_view" as const
  },
  {
    title: "Chấm công của tôi",
    url: "/my-attendance",
    icon: UserCheck,
    description: "Tự ghi chấm công và sản lượng của bạn",
    permission: "__self_attendance__" as unknown as PermissionType
  },
  {
    title: "Hồ sơ của tôi",
    url: "/my-profile",
    icon: UserRound,
    description: "Tự khai và cập nhật hồ sơ nhân sự",
    permission: "__self_profile__" as unknown as PermissionType
  },
  {
    title: "Thiết lập tiền lương",
    url: "/payroll-settings",
    icon: WalletCards,
    description: "Nhân sự, đơn giá và dữ liệu trả lương",
    permission: "payroll_view" as const
  },
  { 
    title: "Báo giá", 
    url: "/quotes", 
    icon: FileText,
    description: "Tạo và quản lý báo giá",
    permission: "quotes" as const
  },
  { 
    title: "Đơn hàng", 
    url: "/orders", 
    icon: ShoppingCart,
    description: "Xử lý và theo dõi đơn hàng",
    permission: "orders" as const
  },
  { 
    title: "Hợp đồng", 
    url: "/contracts", 
    icon: FileSignature,
    description: "Quản lý hợp đồng khách hàng",
    permission: "contracts" as const
  },
  { 
    title: "Hoá đơn ĐT", 
    url: "/einvoices", 
    icon: Receipt,
    description: "Quản lý hoá đơn điện tử",
    permission: "contracts" as const
  },
  {
    title: "Theo dõi GHN", 
    url: "/ghn-tracking", 
    icon: Truck,
    description: "Theo dõi giao hàng GHN",
    permission: "ghn_tracking" as const
  },
  { 
    title: "Dòng tiền", 
    url: "/cash-flow", 
    icon: TrendingUp,
    description: "Quản lý thu chi",
    permission: "cash_flow" as const
  },
  { 
    title: "Giao dịch", 
    url: "/transactions", 
    icon: CreditCard,
    description: "Lịch sử thanh toán",
    permission: "transactions" as const
  },
  { 
    title: "Báo cáo", 
    url: "/reports", 
    icon: BarChart3,
    description: "Thống kê và phân tích",
    permission: "reports" as const
  },
  {
    title: "Chi phí & Giá thành",
    url: "/cost-management",
    icon: CircleDollarSign,
    description: "Giao dịch và phân loại chi phí",
    permission: ["cost_transactions", "cost_categories", "cost_centers", "cost_objects", "transaction_types", "cost_audit"]
  },
  {
    title: "Kho Kiến Thức", 
    url: "/knowledge-base", 
    icon: BookOpen,
    description: "AI hỗ trợ bán hàng",
    permission: "knowledge_base" as const
  },
  { 
    title: "Cài đặt AI", 
    url: "/ai-settings", 
    icon: Sparkles,
    description: "Cấu hình công cụ AI cho báo giá",
    permission: "user_management" as const
  },
  { 
    title: "Cào dữ liệu", 
    url: "/web-scraper", 
    icon: Globe,
    description: "Trích xuất dữ liệu từ trang web",
    permission: "user_management" as const
  },
  { 
    title: "Nhà xe", 
    url: "/shipping-companies", 
    icon: Container,
    description: "Quản lý nhà xe vận chuyển",
    permission: "shipping_companies" as const
  },
  { 
    title: "Quản lý nhân viên", 
    url: "/user-management", 
    icon: Settings,
    description: "Phân quyền người dùng",
    permission: "user_management" as const
  },
  {
    title: "Duyệt hồ sơ nhân sự",
    url: "/profile-review",
    icon: UserCheck,
    description: "Xác nhận hồ sơ nhân viên tự khai",
    permission: "user_management" as const
  }
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  
  const [user, setUser] = useState<User | null>(null);
  const { role: userRole } = useUserRole(user);
  const { hasPermission } = useEmployeePermissions(user, userRole);

  useEffect(() => {
    if (isLocalBackend()) {
      if (!hasStoredLocalUserSession()) {
        setUser(isLocalDemoEnabled() ? localAdminUser as unknown as User : null);
      } else {
        void getLocalMe()
          .then((me) => setUser({
            ...localAdminUser,
            id: me.user_id,
            email: me.email,
            user_metadata: { first_name: me.first_name ?? '', last_name: me.last_name ?? '' },
          } as unknown as User))
          .catch(() => setUser(null));
      }
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  const isActive = (path: string) => currentPath === path;
  const getNavCls = (isActive: boolean) =>
    isActive 
      ? "bg-primary text-white hover:bg-primary hover:text-white shadow-brand" 
      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors";

  // Filter menu items based on user permissions
  const selfAttendanceVisible = isLocalBackend() && hasLocalUserSession();
  const filteredMenuItems = menuItems.filter((item) => {
    if (item.integrationAdmin) return isLocalBackend() && hasLocalUserSession() && userRole === 'admin' && user?.id !== 'local-admin';
    if ((item.permission as string) === "__self_attendance__" || (item.permission as string) === "__self_profile__") return selfAttendanceVisible;
    return Array.isArray(item.permission)
      ? item.permission.some((permission) => hasPermission(permission))
      : hasPermission(item.permission);
  });

  return (
    <Sidebar
      className={`transition-all duration-300 ${collapsed ? "w-14" : "w-64"} border-r bg-sidebar`}
      collapsible="icon"
    >
      <SidebarContent className="p-0">
        {/* Header */}
        <div className={`px-4 py-4 border-b ${collapsed ? 'px-2' : ''}`}>
          {!collapsed && (
            <h2 className="text-base font-semibold text-sidebar-foreground truncate">
              CRM Pro
            </h2>
          )}
        </div>

        {/* Navigation Menu */}
        <div className="px-2 py-2">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {filteredMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      className={`${getNavCls(isActive(item.url))} h-auto p-0`}
                      tooltip={collapsed ? item.title : undefined}
                    >
                      <NavLink 
                        to={item.url} 
                        className="flex items-center gap-2 px-2 py-2 rounded-md transition-all duration-200 group"
                      >
                        <item.icon className="h-4 w-4 flex-shrink-0" />
                        {!collapsed && (
                          <div className="flex-1 min-w-0">
                            <div className={`font-medium text-sm truncate ${isActive(item.url) ? 'text-white' : 'text-sidebar-foreground group-hover:text-sidebar-accent-foreground'}`}>
                              {item.title}
                            </div>
                            <div className={`text-xs truncate ${isActive(item.url) ? 'text-white/80' : 'text-sidebar-foreground/60 group-hover:text-sidebar-accent-foreground/70'}`}>
                              {item.description}
                            </div>
                          </div>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
