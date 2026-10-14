import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";
import { useToast } from "@/hooks/use-toast";
import { Brain, Lightbulb, MessageCircle, Sparkles } from "lucide-react";

const AISettingsForm = () => {
  const [settings, setSettings] = useState({
    auto_classify: false,
    interaction_suggestions: false,
    sentiment_analysis: false,
    ai_next_actions: false
  });
  const [loading, setLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [testingSuggestion, setTestingSuggestion] = useState(false);
  const { toast } = useToast();

  // Load existing settings
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      if (isLocalBackend()) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const data=await localApi.myAiSettings();
        const next = data.reduce((acc: Record<string, boolean>, row: { setting_name: string; setting_value: unknown }) => {
          acc[row.setting_name] = Boolean(row.setting_value);
          return acc;
        }, {});
        setSettings(prev => ({ ...prev, ...next }));
        return;
      }
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('ai_settings')
        .select('setting_name, setting_value')
        .eq('user_id', user.user.id);

      if (!error && data) {
        const settingsMap = data.reduce((acc, setting) => {
          acc[setting.setting_name] = setting.setting_value;
          return acc;
        }, {} as Record<string, boolean>);

        setSettings(prev => ({ ...prev, ...settingsMap }));
      }
    } catch (error) {
      console.error('Error loading AI settings:', error);
    }
  };

  const updateSetting = async (settingName: string, value: boolean) => {
    try {
      setLoading(true);
      if (isLocalBackend()) {
        const next = { ...settings, [settingName]: value };
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Phiên đăng nhập không hợp lệ.");
        const { error } = await (supabase as any).from("ai_settings").upsert({
          user_id: user.id,
          setting_name: settingName,
          setting_value: value,
          tenant_id: "local-tenant",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,setting_name,tenant_id" });
        if (error) throw error;
        setSettings(next);
        window.dispatchEvent(new Event('local-ai-settings-updated'));
        toast({ title: "Đã lưu cục bộ", description: `Đã ${value ? 'bật' : 'tắt'} ${getSettingDisplayName(settingName)} trong PostgreSQL cục bộ.` });
        return;
      }
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { error } = await supabase
        .from('ai_settings')
        .upsert({
          user_id: user.user.id,
          setting_name: settingName,
          setting_value: value,
          tenant_id: 'default'
        }, {
          onConflict: 'user_id,setting_name,tenant_id'
        });

      if (error) throw error;

      setSettings(prev => ({ ...prev, [settingName]: value }));
      
      toast({
        title: "Thành công",
        description: `Đã ${value ? 'bật' : 'tắt'} ${getSettingDisplayName(settingName)}`,
      });
    } catch (error) {
      console.error('Error updating setting:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật cài đặt AI",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getSettingDisplayName = (settingName: string) => {
    const names = {
      auto_classify: "tự động phân loại",
      interaction_suggestions: "gợi ý tương tác",
      sentiment_analysis: "phân tích cảm xúc",
      ai_next_actions: "AI hành động tiếp theo"
    };
    return names[settingName as keyof typeof names] || settingName;
  };

  const testAISuggestion = async () => {
    try {
      setTestingSuggestion(true);
      
      // Test with sample customer data
      const sampleCustomer = {
        id: 'test',
        name: 'Khách hàng mẫu',
        current_status: 'waiting-payment',
        notes: 'Đã tư vấn sản phẩm, khách quan tâm nhưng chưa quyết định',
        tags: ['facebook'],
        purchase_count: 0,
        total_spent: 0,
        created_at: new Date().toISOString()
      };

      let data: { suggestion?: string } | null;
      if (isLocalBackend()) {
        data = await localApi.localFunction<{ suggestion?: string }>('ai-customer-suggestions', { customer: sampleCustomer, action_type: 'next_action', custom_prompt:customPrompt });
      } else {
        const response = await supabase.functions.invoke('ai-customer-suggestions', {
          body: { customer: sampleCustomer, action_type: 'next_action' }
        });
        if (response.error) throw response.error;
        data = response.data as { suggestion?: string };
      }

      toast({
        title: "Kiểm tra AI thành công",
        description: `Gợi ý: ${data.suggestion}`,
      });
    } catch (error) {
      console.error('Error testing AI:', error);
      toast({
        title: "Lỗi khi kiểm tra AI",
        description: "Không thể kết nối với dịch vụ AI",
        variant: "destructive",
      });
    } finally {
      setTestingSuggestion(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-blue-500" />
              Tự động phân loại khách hàng
            </CardTitle>
            <CardDescription>
              Sử dụng AI để tự động phân loại và gán điểm cho khách hàng mới
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-classify"
                checked={settings.auto_classify}
                onCheckedChange={(checked) => updateSetting('auto_classify', checked)}
                disabled={loading}
              />
              <Label htmlFor="auto-classify">
                {settings.auto_classify ? 'Đã bật' : 'Đã tắt'}
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Gợi ý tương tác
            </CardTitle>
            <CardDescription>
              AI sẽ gợi ý thời điểm và cách thức tương tác tối ưu với khách hàng
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Switch
                id="interaction-suggestions"
                checked={settings.interaction_suggestions}
                onCheckedChange={(checked) => updateSetting('interaction_suggestions', checked)}
                disabled={loading}
              />
              <Label htmlFor="interaction-suggestions">
                {settings.interaction_suggestions ? 'Đã bật' : 'Đã tắt'}
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-500" />
              Phân tích cảm xúc
            </CardTitle>
            <CardDescription>
              Phân tích cảm xúc từ tin nhắn và cuộc gọi để hiểu rõ hơn về khách hàng
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Switch
                id="sentiment-analysis"
                checked={settings.sentiment_analysis}
                onCheckedChange={(checked) => updateSetting('sentiment_analysis', checked)}
                disabled={loading}
              />
              <Label htmlFor="sentiment-analysis">
                {settings.sentiment_analysis ? 'Đã bật' : 'Đã tắt'}
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Hành động tiếp theo
            </CardTitle>
            <CardDescription>
              Tự động tạo gợi ý hành động tiếp theo dựa trên tình trạng khách hàng
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Switch
                id="ai-next-actions"
                checked={settings.ai_next_actions}
                onCheckedChange={(checked) => updateSetting('ai_next_actions', checked)}
                disabled={loading}
              />
              <Label htmlFor="ai-next-actions">
                {settings.ai_next_actions ? 'Đã bật' : 'Đã tắt'}
              </Label>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Custom Prompt */}
      <Card>
        <CardHeader>
          <CardTitle>Mẫu hướng dẫn tùy chỉnh</CardTitle>
          <CardDescription>
            Tùy chỉnh cách AI phân tích và đưa ra gợi ý cho khách hàng
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Dựa vào thông tin khách hàng và tình trạng hiện tại, hãy đưa ra gợi ý hành động tiếp theo phù hợp để chăm sóc khách hàng hiệu quả..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={6}
          />
          <p className="text-sm text-muted-foreground">
            Hướng dẫn này sẽ được dùng khi AI tạo gợi ý hành động tiếp theo. Thông tin khách hàng sẽ được tự động thêm vào sau phần hướng dẫn này.
          </p>
        </CardContent>
      </Card>

      {/* Test AI */}
      <Card>
        <CardHeader>
          <CardTitle>Kiểm tra hệ thống AI</CardTitle>
          <CardDescription>
            Kiểm tra hoạt động của hệ thống AI với dữ liệu mẫu
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={testAISuggestion}
            disabled={testingSuggestion}
            className="w-full"
          >
            {testingSuggestion ? 'Đang kiểm tra...' : 'Kiểm tra gợi ý AI'}
          </Button>
        </CardContent>
      </Card>

      {/* Save Settings */}
      <div className="flex justify-end">
        <Button 
          onClick={loadSettings}
          variant="outline"
          disabled={loading}
        >
          {loading ? 'Đang tải...' : 'Tải lại cài đặt'}
        </Button>
      </div>
    </div>
  );
};

export default AISettingsForm;
