import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import UserManagement from "./pages/UserManagement";
import CustomerManagement from "./pages/CustomerManagement";
import ProductManagement from "./pages/ProductManagement";
import FabricManagement from "./pages/FabricManagement";
import QuotesPage from "./pages/QuotesPage";
import OrderManagement from "./pages/OrderManagement";
import CashFlowManagement from "./pages/CashFlowManagement";
import TransactionManagement from "./pages/TransactionManagement";
import ReportsPage from "./pages/ReportsPage";
import CustomerCare from "./pages/CustomerCare";
import GHNTrackingPage from "./pages/GHNTrackingPage";
import MainLayout from "./components/layout/MainLayout";
import MobileLayout from "./components/layout/MobileLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const isMobile = useIsMobile();
  const LayoutComponent = isMobile ? MobileLayout : MainLayout;

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={<LayoutComponent />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="user-management" element={<UserManagement />} />
        <Route path="customers" element={<CustomerManagement />} />
        <Route path="products" element={<ProductManagement />} />
        <Route path="fabrics" element={<FabricManagement />} />
        <Route path="quotes" element={<QuotesPage />} />
        <Route path="orders" element={<OrderManagement />} />
        <Route path="cash-flow" element={<CashFlowManagement />} />
        <Route path="transactions" element={<TransactionManagement />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="customer-care" element={<CustomerCare />} />
        <Route path="ghn-tracking" element={<GHNTrackingPage />} />
      </Route>
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
