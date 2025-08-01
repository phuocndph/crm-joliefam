import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AINextActionCellProps {
  customer: any;
}

const AINextActionCell = ({ customer }: AINextActionCellProps) => {
  const [suggestion, setSuggestion] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const { toast } = useToast();

  // Check if AI is enabled for the current user
  useEffect(() => {
    checkAISettings();
  }, []);

  // Generate AI suggestion when component mounts if AI is enabled
  useEffect(() => {
    if (aiEnabled && !suggestion) {
      generateAISuggestion();
    }
  }, [aiEnabled]);

  const checkAISettings = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('ai_settings')
        .select('setting_value')
        .eq('user_id', user.user.id)
        .eq('setting_name', 'ai_next_actions')
        .single();

      if (!error && data) {
        setAiEnabled(data.setting_value);
      }
    } catch (error) {
      console.error('Error checking AI settings:', error);
    }
  };

  const generateAISuggestion = async () => {
    if (!aiEnabled) {
      setSuggestion(getStaticSuggestion(customer.current_status));
      return;
    }

    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('ai-customer-suggestions', {
        body: { 
          customer: customer, 
          action_type: 'next_action' 
        }
      });

      if (error) throw error;

      setSuggestion(data.suggestion || getStaticSuggestion(customer.current_status));
    } catch (error) {
      console.error('Error getting AI suggestion:', error);
      // Fallback to static suggestion
      setSuggestion(getStaticSuggestion(customer.current_status));
      
      if (aiEnabled) {
        toast({
          title: "AI không khả dụng",
          description: "Sử dụng gợi ý mặc định thay thế",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const getStaticSuggestion = (status: string) => {
    const staticSuggestions = {
      'waiting-payment': 'Gọi xác nhận thanh toán',
      'waiting-deposit': 'Follow up tiền cọc',
      'sent-sample': 'Gọi hỏi feedback mẫu',
      'sent-quote': 'Follow up báo giá',
      'waiting-response': 'Chờ phản hồi khách',
      'ordered': 'Theo dõi đơn hàng',
      'paid': 'Chăm sóc sau bán',
      'see-notes': 'Xem ghi chú chi tiết',
      'no-response': 'Thử liên hệ lại',
    };
    return staticSuggestions[status as keyof typeof staticSuggestions] || 'Liên hệ tư vấn';
  };

  const getSuggestionColor = (status: string) => {
    const colors = {
      'waiting-payment': 'bg-yellow-50 text-yellow-700 border-yellow-200',
      'waiting-deposit': 'bg-orange-50 text-orange-700 border-orange-200',
      'sent-sample': 'bg-blue-50 text-blue-700 border-blue-200',
      'sent-quote': 'bg-indigo-50 text-indigo-700 border-indigo-200',
      'waiting-response': 'bg-purple-50 text-purple-700 border-purple-200',
      'ordered': 'bg-emerald-50 text-emerald-700 border-emerald-200',
      'paid': 'bg-green-50 text-green-700 border-green-200',
      'see-notes': 'bg-cyan-50 text-cyan-700 border-cyan-200',
      'no-response': 'bg-red-50 text-red-700 border-red-200',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-50 text-gray-600 border-gray-200';
  };

  return (
    <div className="flex items-center gap-2">
      <Badge 
        variant="outline" 
        className={`${getSuggestionColor(customer.current_status || 'waiting-payment')} ${aiEnabled ? 'ring-1 ring-purple-200' : ''}`}
      >
        {aiEnabled && <Sparkles className="h-3 w-3 mr-1" />}
        {loading ? 'Đang tạo...' : (suggestion || getStaticSuggestion(customer.current_status))}
      </Badge>
      
      {aiEnabled && (
        <Button
          variant="ghost"
          size="sm"
          onClick={generateAISuggestion}
          disabled={loading}
          className="h-6 w-6 p-0"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      )}
    </div>
  );
};

export default AINextActionCell;