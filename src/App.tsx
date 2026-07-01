import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { SafeTooltipProvider } from "@/components/SafeTooltipProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import UserManagement from "./pages/UserManagement";
import CustomerManagement from "./pages/CustomerManagement";
import ProductManagement from "./pages/ProductManagement";
import FabricManagement from "./pages/FabricManagement";
import QuotesPage from "./pages/QuotesPage";
import OrderManagement from "./pages/OrderManagement";
import ContractManagement from "./pages/ContractManagement";
import EInvoiceManagement from "./pages/EInvoiceManagement";
import CashFlowManagement from "./pages/CashFlowManagement";
import TransactionManagement from "./pages/TransactionManagement";
import ReportsPage from "./pages/ReportsPage";
import CustomerCare from "./pages/CustomerCare";
import GHNTrackingPage from "./pages/GHNTrackingPage";
import KnowledgeBase from "./pages/KnowledgeBase";
import AISettingsPage from "./pages/AISettingsPage";
import WebScraperPage from "./pages/WebScraperPage";
import ShippingCompanyPage from "./pages/ShippingCompanyPage";
import MobileMenu from "./pages/MobileMenu";
import MainLayout from "./components/layout/MainLayout";
import MobileLayout from "./components/layout/MobileLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="user-management" element={<UserManagement />} />
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

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light">
        <SafeTooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ErrorBoundary fallback={<AppErrorFallback />}>
              <AppRoutes />
            </ErrorBoundary>
          </BrowserRouter>
        </SafeTooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
