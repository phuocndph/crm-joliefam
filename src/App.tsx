import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { SafeTooltipProvider } from "@/components/SafeTooltipProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const LocalDashboardPage = lazy(() => import("./pages/LocalDashboardPage"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const ProfileReviewPage = lazy(() => import("./pages/ProfileReviewPage"));
const IntegrationAccessPage = lazy(() => import("./pages/IntegrationAccessPage"));
const ApiSettingsPage = lazy(() => import("./pages/ApiSettingsPage"));
const CustomerManagement = lazy(() => import("./pages/CustomerManagement"));
const LocalCustomerManagementPage = lazy(() => import("./pages/LocalCustomerManagementPage"));
const ProductManagement = lazy(() => import("./pages/ProductManagement"));
const FabricManagement = lazy(() => import("./pages/FabricManagement"));
const QuotesPage = lazy(() => import("./pages/QuotesPage"));
const OrderManagement = lazy(() => import("./pages/OrderManagement"));
const ContractManagement = lazy(() => import("./pages/ContractManagement"));
const EInvoiceManagement = lazy(() => import("./pages/EInvoiceManagement"));
const CashFlowManagement = lazy(() => import("./pages/CashFlowManagement"));
const TransactionManagement = lazy(() => import("./pages/TransactionManagement"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const CostManagementPage = lazy(() => import("./pages/CostManagementPage"));
const InventoryManagementPage = lazy(() => import("./pages/InventoryManagementPage"));
const LocalProductCatalogPage = lazy(() => import("./pages/LocalProductCatalogPage"));
const ProductionOrdersPage = lazy(() => import("./pages/ProductionOrdersPage"));
const ProductionWorkspacePage = lazy(() => import("./pages/ProductionWorkspacePage"));
const ProductionAttendancePage = lazy(() => import("./pages/ProductionAttendancePage"));
const ProductionAttendanceV2Page = lazy(() => import("./pages/ProductionAttendanceV2Page"));
const PayrollSettingsPage = lazy(() => import("./pages/PayrollSettingsPage"));
const MyAttendancePage = lazy(() => import("./pages/MyAttendancePage"));
const MyProfilePage = lazy(() => import("./pages/MyProfilePage"));
const CustomerCare = lazy(() => import("./pages/CustomerCare"));
const GHNTrackingPage = lazy(() => import("./pages/GHNTrackingPage"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const AISettingsPage = lazy(() => import("./pages/AISettingsPage"));
const WebScraperPage = lazy(() => import("./pages/WebScraperPage"));
const ShippingCompanyPage = lazy(() => import("./pages/ShippingCompanyPage"));
const MobileMenu = lazy(() => import("./pages/MobileMenu"));
import MainLayout from "./components/layout/MainLayout";
import MobileLayout from "./components/layout/MobileLayout";
import NotFound from "./pages/NotFound";
import { isLocalBackend } from "@/lib/runtime-config";
import { LocalGhnCreateHostProvider } from "@/components/LocalGhnCreateHost";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache 2 min, keep in memory 10 min. Prevents refetch storms on every mount/tab focus.
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

// Fallback UI khi app crash
const AppErrorFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background p-4">
    <div className="text-center space-y-4 max-w-md">
      <h1 className="text-2xl font-bold text-foreground">Đã xảy ra lỗi</h1>
      <p className="text-muted-foreground">
        Ứng dụng gặp sự cố. Vui lòng tải lại trang.
      </p>
      <button
        onClick={() => {
          // Clear caches and reload
          if ('caches' in window) {
            caches.keys().then(names => {
              names.forEach(name => caches.delete(name));
            });
          }
          window.location.reload();
        }}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        Tải lại trang
      </button>
    </div>
  </div>
);

const AppRoutes = () => {
  const isMobile = useIsMobile();
  const LayoutComponent = isMobile ? MobileLayout : MainLayout;

  useEffect(() => {
    if (isLocalBackend()) return;
    // Set up session refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'TOKEN_REFRESHED') {
          console.log('✅ Session token refreshed automatically');
        }
        
        if (event === 'SIGNED_OUT') {
          console.log('⚠️ User signed out');
        }
      }
    );

    // Auto-refresh 5 minutes before expiry
    const refreshInterval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const expiresAt = session.expires_at;
        if (!expiresAt) return;

        const now = Math.floor(Date.now() / 1000);
        const timeRemaining = expiresAt - now;

        // Refresh if less than 5 minutes remaining
        if (timeRemaining < 300 && timeRemaining > 0) {
          console.log('🔄 Auto-refreshing session token...');
          await supabase.auth.refreshSession();
        }
      }
    }, 60000); // Check every minute

    return () => {
      subscription.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={<LayoutComponent />}>
        <Route path="menu" element={<MobileMenu />} />
        <Route path="dashboard" element={isLocalBackend() ? <LocalDashboardPage /> : isMobile ? <MobileMenu /> : <Dashboard />} />
        <Route path="user-management" element={<UserManagement />} />
        <Route path="profile-review" element={<ProfileReviewPage />} />
        <Route path="integration-access" element={<IntegrationAccessPage />} />
        <Route path="api-settings" element={<ApiSettingsPage />} />
        {/* Keep the complete CRM screens in local mode as well. Their Supabase
            calls are routed through the local adapter, so local SQL does not
            replace or hide the existing customer/product workflows. */}
        <Route path="customers" element={<CustomerManagement />} />
        <Route path="products" element={<ProductManagement />} />
        <Route path="fabrics" element={<FabricManagement />} />
        <Route path="quotes" element={<QuotesPage />} />
        <Route path="orders" element={<OrderManagement />} />
        <Route path="contracts" element={<ContractManagement />} />
        <Route path="einvoices" element={<EInvoiceManagement />} />
        <Route path="cash-flow" element={<CashFlowManagement />} />
        <Route path="transactions" element={<TransactionManagement />} />
        <Route path="reports" element={<ReportsPage />} />
          <Route path="cost-management" element={<CostManagementPage />} />
          <Route path="inventory-management" element={<InventoryManagementPage />} />
          <Route path="production-orders" element={isLocalBackend()?<ProductionWorkspacePage/>:<ProductionOrdersPage />} />
          <Route path="production-orders-legacy" element={<ProductionOrdersPage />} />
          {/* Local SQL uses the new single-screen workspace; public Supabase keeps V1 unchanged. */}
          <Route path="production-attendance" element={isLocalBackend() ? <ProductionAttendanceV2Page /> : <ProductionAttendancePage />} />
          <Route path="production-attendance-v2" element={<ProductionAttendanceV2Page />} />
          <Route path="production-attendance-legacy" element={<ProductionAttendancePage />} />
          <Route path="my-attendance" element={<MyAttendancePage />} />
          <Route path="my-profile" element={<MyProfilePage />} />
          <Route path="payroll-settings" element={<PayrollSettingsPage />} />
        <Route path="customer-care" element={<CustomerCare />} />
        <Route path="ghn-tracking" element={<GHNTrackingPage />} />
        <Route path="knowledge-base" element={<KnowledgeBase />} />
        <Route path="ai-settings" element={<AISettingsPage />} />
        <Route path="web-scraper" element={<WebScraperPage />} />
        <Route path="shipping-companies" element={<ShippingCompanyPage />} />
      </Route>
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const RouteLoadingFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center">
    <div className="animate-pulse text-muted-foreground">Đang tải...</div>
  </div>
);

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light">
        <SafeTooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <LocalGhnCreateHostProvider>
            <ErrorBoundary fallback={<AppErrorFallback />}>
              <Suspense fallback={<RouteLoadingFallback />}>
                <AppRoutes />
              </Suspense>
            </ErrorBoundary>
            </LocalGhnCreateHostProvider>
          </BrowserRouter>
        </SafeTooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
