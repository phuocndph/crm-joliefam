import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";

export const AuthStatusBadge = () => {
  const [status, setStatus] = useState<'active' | 'expiring' | 'expired'>('active');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setStatus('expired');
        return;
      }

      const expiresAt = session.expires_at;
      if (!expiresAt) return;

      const now = Math.floor(Date.now() / 1000);
      const timeRemaining = expiresAt - now;
      setTimeLeft(timeRemaining);

      if (timeRemaining < 300) { // < 5 minutes
        setStatus('expiring');
      } else {
        setStatus('active');
      }
    };

    checkSession();
    const interval = setInterval(checkSession, 30000); // Check every 30s

    return () => clearInterval(interval);
  }, []);

  if (status === 'active') {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
        <CheckCircle className="w-3 h-3 mr-1" />
        Đã đăng nhập
      </Badge>
    );
  }

  if (status === 'expiring') {
    return (
      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
        <Clock className="w-3 h-3 mr-1" />
        Phiên sắp hết ({Math.floor((timeLeft || 0) / 60)}p)
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
      <AlertCircle className="w-3 h-3 mr-1" />
      Phiên đã hết hạn
    </Badge>
  );
};
