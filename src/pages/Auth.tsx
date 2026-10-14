import { useState, useEffect } from "react";
import { useQueryClient } from '@tanstack/react-query';
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
import { isLocalBackend, isLocalDemoEnabled } from "@/lib/runtime-config";
import { loginLocal, hasLocalUserSession, getLocalMe, logoutLocal, clearLocalSession } from "@/lib/local-auth";

const REMEMBER_EMAIL_KEY = "remembered_email";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};

const getPostAuthPath = () => {
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  return isMobile ? "/menu" : "/dashboard";
};

const Auth = () => {
  const queryClient = useQueryClient();
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
    if (isLocalBackend()) {
      let cancelled = false;
      // Local: nếu đã có phiên người dùng thì vào thẳng dashboard;
      // nếu chưa thì hiện form đăng nhập email/mật khẩu.
      if (hasLocalUserSession()) {
        void getLocalMe(true)
          .then(() => { if (!cancelled) navigate(getPostAuthPath(), { replace: true }); })
          .catch(() => {
            if (cancelled) return;
            // Remove an expired/corrupt browser token so the next local
            // attempt can use the loopback administrator session.
            void logoutLocal();
            setCheckingSession(false);
          });
      } else {
        setCheckingSession(false);
      }
      return () => { cancelled = true; };
    }
    // Subscribe FIRST, then check session — handles late-restore on PWA
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate(getPostAuthPath(), { replace: true });
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate(getPostAuthPath(), { replace: true });
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
      if (isLocalBackend()) {
        await loginLocal(email, password);
        queryClient.clear();
        try {
          if (rememberMe) localStorage.setItem(REMEMBER_EMAIL_KEY, email);
          else localStorage.removeItem(REMEMBER_EMAIL_KEY);
        } catch { /* bỏ qua */ }
        toast({ title: "Đăng nhập thành công!", description: "Chào mừng bạn trở lại hệ thống CRM." });
        navigate(getPostAuthPath());
        return;
      }
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
        } catch {
          // Storage may be unavailable in private browsing; authentication still succeeds.
        }

        toast({
          title: "Đăng nhập thành công!",
          description: "Chào mừng bạn trở lại hệ thống CRM.",
        });
        navigate(getPostAuthPath());
      }
    } catch (error: unknown) {
      toast({
        title: "Lỗi đăng nhập",
        description: getErrorMessage(error, "Có lỗi xảy ra khi đăng nhập"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLocalAdminAccess = async () => {
    if (!isLocalDemoEnabled()) return;
    setLoading(true);
    try {
      // The loopback admin session is restricted by the API to local origins;
      // it never creates or reuses a public Supabase session.
      await logoutLocal();
      // API restarts rotate the loopback token. Drop any in-memory token before
      // requesting a fresh one so the recovery button cannot reuse a revoked
      // bootstrap session from a previous server process.
      clearLocalSession();
      await getLocalMe(true);
      toast({ title: "Đã vào hệ thống local", description: "Đang sử dụng quản trị viên cục bộ." });
      navigate(getPostAuthPath(), { replace: true });
    } catch (error: unknown) {
      toast({
        title: "Không thể mở phiên local",
        description: getErrorMessage(error, "Local API chưa sẵn sàng hoặc tài khoản quản trị đã bị tắt."),
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
      const redirectUrl = `${window.location.origin}${getPostAuthPath()}`;
      
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
    } catch (error: unknown) {
      toast({
        title: "Lỗi đăng ký",
        description: getErrorMessage(error, "Có lỗi xảy ra khi đăng ký"),
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
              <TabsList className={`grid w-full ${isLocalBackend() ? "grid-cols-1" : "grid-cols-2"} mb-6`}>
                <TabsTrigger value="signin">Đăng nhập</TabsTrigger>
                {!isLocalBackend() && <TabsTrigger value="signup">Đăng ký</TabsTrigger>}
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

                  {isLocalDemoEnabled() && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={loading}
                      onClick={() => void handleLocalAdminAccess()}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Vào bằng quản trị viên local
                    </Button>
                  )}

                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center pt-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {isLocalBackend() ? "Phiên local có hiệu lực tối đa 8 giờ trên thiết bị này" : "Phiên đăng nhập được giữ tới 60 ngày trên thiết bị này"}
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
                        placeholder="tenban@congty.com"
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
