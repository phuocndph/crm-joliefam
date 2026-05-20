import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Building2, User, Mail, Lock, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const REMEMBER_EMAIL_KEY = "remembered_email";

const Auth = () => {
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(REMEMBER_EMAIL_KEY) || ""; } catch { return ""; }
  });
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try { return localStorage.getItem(REMEMBER_EMAIL_KEY) !== null ? true : true; } catch { return true; }
  });
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Subscribe FIRST, then check session — handles late-restore on PWA
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate("/dashboard", { replace: true });
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard", { replace: true });
      } else {
        setCheckingSession(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        try {
          if (rememberMe) {
            localStorage.setItem(REMEMBER_EMAIL_KEY, email);
          } else {
            localStorage.removeItem(REMEMBER_EMAIL_KEY);
          }
        } catch {}

        toast({
          title: "Đăng nhập thành công!",
          description: "Chào mừng bạn trở lại hệ thống CRM.",
        });
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast({
        title: "Lỗi đăng nhập",
        description: error.message || "Có lỗi xảy ra khi đăng nhập",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/dashboard`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            first_name: firstName,
            last_name: lastName,
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        toast({
          title: "Đăng ký thành công!",
          description: "Vui lòng kiểm tra email để xác nhận tài khoản.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Lỗi đăng ký",
        description: error.message || "Có lỗi xảy ra khi đăng ký",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
        <div className="text-white/80 text-sm animate-pulse">Đang khôi phục phiên đăng nhập…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center space-x-2 mb-6">
            <Building2 className="h-8 w-8 text-white" />
            <h1 className="text-3xl font-bold text-white">CRM Enterprise</h1>
          </div>
          <p className="text-white/80">
            Hệ thống quản lý khách hàng chuyên nghiệp
          </p>
        </div>

        <Card className="bg-white/95 backdrop-blur-sm shadow-elegant border-0">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-semibold text-foreground">
              Chào mừng bạn
            </CardTitle>
            <CardDescription>
              Đăng nhập để truy cập hệ thống CRM
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="signin">Đăng nhập</TabsTrigger>
                <TabsTrigger value="signup">Đăng ký</TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4" autoComplete="on">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="admin@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        autoComplete="email"
                        inputMode="email"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password">Mật khẩu</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="rememberMe"
                      checked={rememberMe}
                      onCheckedChange={(v) => setRememberMe(v === true)}
                    />
                    <Label htmlFor="rememberMe" className="text-sm font-normal cursor-pointer">
                      Ghi nhớ đăng nhập trên thiết bị này
                    </Label>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={loading}
                    variant="gradient"
                    size="lg"
                  >
                    {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                  </Button>

                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center pt-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Phiên đăng nhập được giữ tới 60 ngày trên thiết bị này
                  </p>
                </form>

              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4" autoComplete="on">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">Họ</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="firstName"
                        name="given-name"
                          type="text"
                          placeholder="Nguyễn"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="pl-10"
                        autoComplete="given-name"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Tên</Label>
                      <Input
                        id="lastName"
                        name="family-name"
                        type="text"
                        placeholder="Văn A"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        autoComplete="family-name"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="signupEmail">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signupEmail"
                        name="email"
                        type="email"
                        placeholder="your.email@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        autoComplete="email"
                        inputMode="email"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="signupPassword">Mật khẩu</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signupPassword"
                        name="new-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                        autoComplete="new-password"
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={loading}
                    variant="gradient"
                    size="lg"
                  >
                    {loading ? "Đang đăng ký..." : "Đăng ký tài khoản"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-white/60 text-sm">
          Liên hệ admin để được hỗ trợ
        </p>
      </div>
    </div>
  );
};

export default Auth;