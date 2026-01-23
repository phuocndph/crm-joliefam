import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Building2, ArrowRight, Shield, Users, BarChart3, Zap } from "lucide-react";

const Index = () => {
  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Use hard navigation to avoid Router-context issues during HMR
        window.location.assign("/dashboard");
      }
    };
    checkUser();
  }, []);

  const features = [
    {
      icon: Users,
      title: "Quản lý khách hàng",
      description: "Lưu trữ và quản lý thông tin khách hàng một cách hiệu quả"
    },
    {
      icon: BarChart3,
      title: "Báo cáo thống kê",
      description: "Phân tích dữ liệu và tạo báo cáo chi tiết về doanh số"
    },
    {
      icon: Shield,
      title: "Bảo mật cao",
      description: "Đảm bảo an toàn dữ liệu với hệ thống bảo mật hiện đại"
    },
    {
      icon: Zap,
      title: "Hiệu suất cao",
      description: "Trải nghiệm nhanh chóng và mượt mà trên mọi thiết bị"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800">
      {/* Header */}
      <header className="relative z-10 px-4 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Building2 className="h-8 w-8 text-white" />
            <span className="text-2xl font-bold text-white">CRM Enterprise</span>
          </div>
          <Button 
            onClick={() => window.location.assign("/auth")} 
            variant="outline" 
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            Đăng nhập
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 px-4 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 animate-fade-in">
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Hệ thống CRM
              <br />
              <span className="bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
                Chuyên nghiệp
              </span>
            </h1>
            <p className="text-xl text-white/80 mb-8 max-w-3xl mx-auto leading-relaxed">
              Quản lý khách hàng hiệu quả với công nghệ hiện đại. 
              Tăng cường doanh số và tối ưu hóa quy trình kinh doanh của bạn.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={() => window.location.assign("/auth")}
                size="xl"
                className="bg-white text-primary hover:bg-white/90 shadow-xl"
              >
                Bắt đầu ngay
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                variant="outline"
                size="xl"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                Tìm hiểu thêm
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-center hover:bg-white/20 transition-all duration-300 animate-scale-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-white/70">{feature.description}</p>
              </div>
            ))}
          </div>

          {/* Demo Account Info */}
          <div className="text-center">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 max-w-md mx-auto">
              <h3 className="text-lg font-semibold text-white mb-4">Tài khoản demo</h3>
              <div className="space-y-2 text-white/80">
                <p><strong>Email:</strong> admin@company.com</p>
                <p><strong>Password:</strong> SuperAdmin123!</p>
              </div>
              <Button 
                onClick={() => window.location.assign("/auth")}
                className="mt-4 w-full bg-white text-primary hover:bg-white/90"
              >
                Trải nghiệm ngay
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-white/5 rounded-full blur-3xl"></div>
      </div>
    </div>
  );
};

export default Index;
