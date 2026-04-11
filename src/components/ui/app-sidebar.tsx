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
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";

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

const menuItems = [
  { 
    title: "Dashboard", 
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
    description: "Cấu hình AI Quote Fill",
    permission: "user_management" as const
  },
  { 
    title: "Cào dữ liệu", 
    url: "/web-scraper", 
    icon: Globe,
    description: "Trích xuất dữ liệu từ web",
    permission: "user_management" as const
  },
  { 
    title: "Quản lý nhân viên", 
    url: "/user-management", 
    icon: Settings,
    description: "Phân quyền users",
    permission: "user_management" as const
  }
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  
  const [user, setUser] = useState<any>(null);
  const { role: userRole } = useUserRole(user);
  const { hasPermission } = useEmployeePermissions(user, userRole);

  useEffect(() => {
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
  const filteredMenuItems = menuItems.filter(item => 
    hasPermission(item.permission)
  );

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