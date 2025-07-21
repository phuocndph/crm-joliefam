import { 
  Home, 
  Users, 
  Package, 
  FileText, 
  ShoppingCart, 
  TrendingUp, 
  CreditCard, 
  BarChart3,
  Settings
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

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
    description: "Tổng quan & thống kê"
  },
  { 
    title: "Khách hàng", 
    url: "/customers", 
    icon: Users,
    description: "Quản lý danh sách khách hàng"
  },
  { 
    title: "Sản phẩm", 
    url: "/products", 
    icon: Package,
    description: "Quản lý kho hàng và giá"
  },
  { 
    title: "Báo giá", 
    url: "/quotes", 
    icon: FileText,
    description: "Tạo và quản lý báo giá"
  },
  { 
    title: "Đơn hàng", 
    url: "/orders", 
    icon: ShoppingCart,
    description: "Xử lý và theo dõi đơn hàng"
  },
  { 
    title: "Dòng tiền", 
    url: "/cash-flow", 
    icon: TrendingUp,
    description: "Quản lý thu chi"
  },
  { 
    title: "Giao dịch", 
    url: "/transactions", 
    icon: CreditCard,
    description: "Lịch sử thanh toán"
  },
  { 
    title: "Báo cáo", 
    url: "/reports", 
    icon: BarChart3,
    description: "Thống kê và phân tích"
  },
  { 
    title: "Quản lý nhân viên", 
    url: "/user-management", 
    icon: Settings,
    description: "Phân quyền users"
  }
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;
  const getNavCls = (isActive: boolean) =>
    isActive 
      ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-brand" 
      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors";

  return (
    <Sidebar
      className={`transition-all duration-300 ${collapsed ? "w-16" : "w-64"} border-r bg-sidebar shadow-soft`}
      collapsible="icon"
    >
      <SidebarContent className="py-4">
        <SidebarGroup>
          <SidebarGroupLabel className={`text-sidebar-foreground font-semibold ${collapsed ? 'sr-only' : ''}`}>
            CRM Pro Navigation
          </SidebarGroupLabel>
          
          <SidebarGroupContent className="mt-4">
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    className={`mb-1 ${getNavCls(isActive(item.url))}`}
                    tooltip={collapsed ? item.title : undefined}
                  >
                    <NavLink 
                      to={item.url} 
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200"
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && (
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm block truncate">
                            {item.title}
                          </span>
                          <span className="text-xs opacity-70 block truncate">
                            {item.description}
                          </span>
                        </div>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}