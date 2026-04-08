import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save, Loader2, Play, Sparkles, Brain, Database, TestTube, RotateCcw } from "lucide-react";

const AI_MODELS = [
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", desc: "Nhanh & tiết kiệm" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "Cân bằng (mặc định text)" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash Preview", desc: "Mặc định ảnh" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Chính xác cao" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", desc: "OpenAI cân bằng" },
  { value: "openai/gpt-5", label: "GPT-5", desc: "Cao cấp nhất" },
];

const DEFAULT_TYPE_CATEGORIES: Record<string, string[]> = {
  'ga chun': ['ga chun'],
  'ga tấm phủ': ['ga tấm phủ', 'ga phủ'],
  'ga phủ': ['ga tấm phủ', 'ga phủ'],
  'ga': ['ga chun', 'ga tấm phủ', 'ga phủ'],
  'chăn hè chần': ['chăn hè'],
  'chăn hè': ['chăn hè'],
  'vỏ chăn chần': ['vỏ chăn chần'],
  'chăn đông': ['vỏ chăn chần'],
  'vỏ chăn': ['vỏ chăn'],
  'chăn': ['chăn'],
  'vỏ gối ôm': ['gối ôm'],
  'gối ôm': ['gối ôm'],
  'vỏ gối': ['gối'],
  'bảo vệ nệm': ['bảo vệ'],
  'khăn tắm': ['khăn'],
  'tấm trang trí': ['trang trí'],
  'gối trang trí': ['gối trang trí', 'trang trí'],
  'ruột chăn': ['ruột chăn'],
  'ruột gối': ['ruột gối'],
  'áo choàng': ['áo choàng'],
  'váy giường': ['váy'],
  'topper': ['topper'],
  'đệm': ['đệm'],
  'rèm': ['rem', 'rèm'],
  'bộ': ['bộ'],
};

const DEFAULT_PRODUCT_TYPE_KEYWORDS = [
  'chan he', 'chan dong', 'vo chan', 'ga chun', 'ga phu', 'ga goi',
  'vo goi', 'goi trang tri', 'bao ve nem', 'bvn', 'tam trang tri',
  'tham chan', 'tham', 'khan tam', 'khan mat', 'chan', 'ga', 'goi',
  'drap', 'rap', 'nem', 'ruot chan', 'ruot goi', 'ao goi',
];

const DEFAULT_MATERIAL_KEYWORDS = ['t200', 't250', 't300', 't350', 't400', 't500', 'lth', 'tencel', 'mcr', 'modal', 'satin'];

interface AISettings {
  ai_quote_fill_prompt: string;
  ai_quote_text_model: string;
  ai_quote_image_model: string;
  ai_quote_type_categories: string;
  ai_quote_product_keywords: string;
  ai_quote_material_keywords: string;
  ai_quote_cache_ttl: string;
}

const DEFAULTS: AISettings = {
  ai_quote_fill_prompt: '',
  ai_quote_text_model: 'google/gemini-2.5-flash',
  ai_quote_image_model: 'google/gemini-3-flash-preview',
  ai_quote_type_categories: JSON.stringify(DEFAULT_TYPE_CATEGORIES, null, 2),
  ai_quote_product_keywords: JSON.stringify(DEFAULT_PRODUCT_TYPE_KEYWORDS),
  ai_quote_material_keywords: JSON.stringify(DEFAULT_MATERIAL_KEYWORDS),
  ai_quote_cache_ttl: '300',
};

export default function AISettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const { role: userRole } = useUserRole(user);
  const [settings, setSettings] = useState<AISettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('ai_settings')
        .select('setting_name, setting_value')
        .in('setting_name', Object.keys(DEFAULTS));

      if (data && data.length > 0) {
        const loaded = { ...DEFAULTS };
        for (const row of data) {
          const key = row.setting_name as keyof AISettings;
          if (key in loaded) {
            // setting_value is boolean in DB, but we store JSON strings as setting_name-based
            // We need a text field. Let's use a workaround with the existing schema.
          }
        }
        // The ai_settings table has setting_value as boolean — not suitable for text.
        // We'll store config as JSON in a single setting or use a different approach.
        // For now, load from localStorage as a fallback until migration adds text support.
        const stored = localStorage.getItem('ai_settings_config');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setSettings({ ...DEFAULTS, ...parsed });
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to load AI settings:', err);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Store settings - since ai_settings table only has boolean values,
      // we use a combined approach: store in localStorage for UI and pass to edge function
      localStorage.setItem('ai_settings_config', JSON.stringify(settings));
      
      // Validate JSON fields
      if (settings.ai_quote_type_categories) {
        JSON.parse(settings.ai_quote_type_categories);
      }
      if (settings.ai_quote_product_keywords) {
        JSON.parse(settings.ai_quote_product_keywords);
      }
      if (settings.ai_quote_material_keywords) {
        JSON.parse(settings.ai_quote_material_keywords);
      }

      toast({ title: "Đã lưu", description: "Cài đặt AI đã được lưu thành công" });
    } catch (err) {
      toast({ 
        title: "Lỗi", 
        description: err instanceof Error ? err.message : "JSON không hợp lệ", 
        variant: "destructive" 
      });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!testInput.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập dữ liệu test", variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('lookup-tax-code', {
        body: {
          type: 'ai_quote_debug',
          data: {
            request: testInput,
            config: {
              textModel: settings.ai_quote_text_model,
              imageModel: settings.ai_quote_image_model,
              customPrompt: settings.ai_quote_fill_prompt || undefined,
              typeCategories: settings.ai_quote_type_categories ? JSON.parse(settings.ai_quote_type_categories) : undefined,
              productKeywords: settings.ai_quote_product_keywords ? JSON.parse(settings.ai_quote_product_keywords) : undefined,
              materialKeywords: settings.ai_quote_material_keywords ? JSON.parse(settings.ai_quote_material_keywords) : undefined,
              cacheTtl: parseInt(settings.ai_quote_cache_ttl) || 300,
            }
          }
        }
      });

      if (error) throw error;
      setTestResult(data);
    } catch (err) {
      setTestResult({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
    setTesting(false);
  };

  const handleReset = () => {
    setSettings(DEFAULTS);
    localStorage.removeItem('ai_settings_config');
    toast({ title: "Đã reset", description: "Cài đặt AI đã được khôi phục mặc định" });
  };

  if (userRole && userRole !== 'admin' && userRole !== 'manager') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Bạn không có quyền truy cập trang này.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/quotes')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Cài đặt AI Quote Fill</h1>
          <p className="text-muted-foreground text-sm">Kiểm soát prompt, model, catalog filtering và debug</p>
        </div>
        <Button variant="outline" onClick={handleReset} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset mặc định
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Lưu cài đặt
        </Button>
      </div>

      <Tabs defaultValue="prompt" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="prompt" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Prompt
          </TabsTrigger>
          <TabsTrigger value="model" className="gap-2">
            <Brain className="h-4 w-4" />
            Model
          </TabsTrigger>
          <TabsTrigger value="catalog" className="gap-2">
            <Database className="h-4 w-4" />
            Catalog
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-2">
            <TestTube className="h-4 w-4" />
            Test & Debug
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: PROMPT */}
        <TabsContent value="prompt">
          <Card>
            <CardHeader>
              <CardTitle>System Prompt</CardTitle>
              <CardDescription>
                Prompt chính gửi cho AI khi xử lý AI Quote Fill. Để trống sẽ dùng prompt mặc định.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Custom Prompt (để trống = mặc định)</Label>
                <Textarea
                  value={settings.ai_quote_fill_prompt}
                  onChange={(e) => setSettings(s => ({ ...s, ai_quote_fill_prompt: e.target.value }))}
                  placeholder="Bạn là chuyên gia báo giá nội thất phòng ngủ VN..."
                  className="min-h-[300px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Prompt sẽ được chèn trước bảng giá sản phẩm. Các biến tự động: {'{productListText}'}, {'{segmentInstruction}'}
                </p>
              </div>
              {settings.ai_quote_fill_prompt && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Custom prompt</Badge>
                  <span className="text-sm text-muted-foreground">
                    {settings.ai_quote_fill_prompt.length} ký tự
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: MODEL */}
        <TabsContent value="model">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Model xử lý Text</CardTitle>
                <CardDescription>Dùng khi khách nhập yêu cầu bằng văn bản</CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={settings.ai_quote_text_model}
                  onValueChange={(v) => setSettings(s => ({ ...s, ai_quote_text_model: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map(m => (
                      <SelectItem key={m.value} value={m.value}>
                        <div className="flex items-center gap-2">
                          <span>{m.label}</span>
                          <span className="text-xs text-muted-foreground">— {m.desc}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Model xử lý Ảnh</CardTitle>
                <CardDescription>Dùng khi khách gửi hình ảnh báo giá/đơn hàng</CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={settings.ai_quote_image_model}
                  onValueChange={(v) => setSettings(s => ({ ...s, ai_quote_image_model: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map(m => (
                      <SelectItem key={m.value} value={m.value}>
                        <div className="flex items-center gap-2">
                          <span>{m.label}</span>
                          <span className="text-xs text-muted-foreground">— {m.desc}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Cache TTL</CardTitle>
                <CardDescription>Thời gian cache catalog sản phẩm (giây). Mặc định 300 = 5 phút.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    value={settings.ai_quote_cache_ttl}
                    onChange={(e) => setSettings(s => ({ ...s, ai_quote_cache_ttl: e.target.value }))}
                    className="w-32"
                    min={0}
                    max={3600}
                  />
                  <span className="text-sm text-muted-foreground">
                    = {Math.round(parseInt(settings.ai_quote_cache_ttl || '0') / 60)} phút
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: CATALOG */}
        <TabsContent value="catalog">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">TYPE_TO_CATEGORY Mapping</CardTitle>
                <CardDescription>
                  Ánh xạ loại sản phẩm (segment type) → danh mục tìm kiếm trong DB. JSON format.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={settings.ai_quote_type_categories}
                  onChange={(e) => setSettings(s => ({ ...s, ai_quote_type_categories: e.target.value }))}
                  className="min-h-[300px] font-mono text-xs"
                />
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Product Type Keywords</CardTitle>
                  <CardDescription>Từ khóa nhận diện loại sản phẩm (không dấu). JSON array.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={settings.ai_quote_product_keywords}
                    onChange={(e) => setSettings(s => ({ ...s, ai_quote_product_keywords: e.target.value }))}
                    className="min-h-[150px] font-mono text-xs"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Material Keywords</CardTitle>
                  <CardDescription>Từ khóa nhận diện chất liệu vải. JSON array.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={settings.ai_quote_material_keywords}
                    onChange={(e) => setSettings(s => ({ ...s, ai_quote_material_keywords: e.target.value }))}
                    className="min-h-[150px] font-mono text-xs"
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TAB 4: TEST & DEBUG */}
        <TabsContent value="test">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Test AI Quote Fill</CardTitle>
                <CardDescription>
                  Nhập yêu cầu mẫu để kiểm tra parsing, filtering và kết quả AI.
                  Sử dụng cấu hình hiện tại (chưa lưu cũng áp dụng).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Input yêu cầu</Label>
                  <Textarea
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder={"Vải T250 trắng sọc:\n4c Vỏ chăn 200x220\n4c Ga chun 160x200x12cm\n8c Vỏ gối 45x65"}
                    className="min-h-[120px]"
                  />
                </div>
                <Button onClick={handleTest} disabled={testing} className="gap-2">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Chạy Test
                </Button>
              </CardContent>
            </Card>

            {testResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Kết quả Debug</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {testResult.error ? (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-md">
                      <p className="font-medium">Lỗi:</p>
                      <pre className="text-sm mt-1 whitespace-pre-wrap">{testResult.error}</pre>
                    </div>
                  ) : (
                    <>
                      {/* Segments */}
                      {testResult.segments && (
                        <div>
                          <h3 className="font-semibold mb-2 flex items-center gap-2">
                            Parsed Segments
                            <Badge variant="secondary">{testResult.segments.length}</Badge>
                          </h3>
                          <div className="bg-muted rounded-md p-3 overflow-x-auto">
                            <pre className="text-xs font-mono whitespace-pre-wrap">
                              {JSON.stringify(testResult.segments, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}

                      <Separator />

                      {/* Filtered Products */}
                      {testResult.filtering && (
                        <div>
                          <h3 className="font-semibold mb-2">Filtering Info</h3>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="text-center p-3 bg-muted rounded-md">
                              <p className="text-2xl font-bold text-primary">{testResult.filtering.totalProducts}</p>
                              <p className="text-xs text-muted-foreground">Tổng SP</p>
                            </div>
                            <div className="text-center p-3 bg-muted rounded-md">
                              <p className="text-2xl font-bold text-primary">{testResult.filtering.filteredProducts}</p>
                              <p className="text-xs text-muted-foreground">Sau lọc</p>
                            </div>
                            <div className="text-center p-3 bg-muted rounded-md">
                              <p className="text-2xl font-bold text-primary">
                                {testResult.filtering.totalProducts > 0
                                  ? Math.round((1 - testResult.filtering.filteredProducts / testResult.filtering.totalProducts) * 100)
                                  : 0}%
                              </p>
                              <p className="text-xs text-muted-foreground">Giảm</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <Separator />

                      {/* AI Response */}
                      {testResult.aiResponse && (
                        <div>
                          <h3 className="font-semibold mb-2 flex items-center gap-2">
                            AI Response
                            {testResult.aiResponse.items && (
                              <Badge variant="secondary">{testResult.aiResponse.items.length} items</Badge>
                            )}
                          </h3>
                          <div className="bg-muted rounded-md p-3 overflow-x-auto max-h-[400px] overflow-y-auto">
                            <pre className="text-xs font-mono whitespace-pre-wrap">
                              {JSON.stringify(testResult.aiResponse, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Warnings */}
                      {testResult.warnings && testResult.warnings.length > 0 && (
                        <div className="p-4 bg-warning/10 rounded-md">
                          <h3 className="font-semibold mb-2 text-warning">Validation Warnings</h3>
                          <ul className="list-disc pl-4 space-y-1">
                            {testResult.warnings.map((w: string, i: number) => (
                              <li key={i} className="text-sm">{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Model used */}
                      {testResult.modelUsed && (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Model: {testResult.modelUsed}</Badge>
                          {testResult.processingTime && (
                            <Badge variant="outline">{testResult.processingTime}ms</Badge>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
