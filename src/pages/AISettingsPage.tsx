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
import { ArrowLeft, Save, Loader2, Play, Sparkles, Brain, Database, TestTube, RotateCcw, ChevronDown, ChevronUp, Eye, Clock, Zap, ArrowRight, AlertTriangle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const DEFAULT_PROMPT_DISPLAY = `Bạn là chuyên gia báo giá nội thất phòng ngủ VN. Nhân viên gõ nhanh, không dấu, viết tắt.

## BẢNG GIÁ (\${catalogHeader})
\${productListText}
\${segmentInstruction}
## SO KHỚP
1. So khớp từ khóa yêu cầu với TÊN SP. Phân biệt bằng: chất liệu (T200/T250/T300...), mẫu (trơn/sọc), kích thước
2. Kích thước khách KHÔNG có trong bảng → lấy GIÁ & matchedProductId của SP kích thước LỚN HƠN gần nhất. customName/specifications ghi ĐÚNG kích thước KHÁCH, KHÔNG làm tròn. Note: "Giá theo SP [KT bảng giá], khách yêu cầu [KT thực]"
   VD: ga 12cm, bảng có 15cm → matchedProductId=SP 15cm, ghi "12cm". BVN trên 10cm → giá SP 25cm
3. KHÔNG hoán đổi Trơn↔Sọc nếu khách ghi rõ
4. PHÂN BIỆT: "chăn hè" → match "Chăn hè chần" (SP riêng, KHÔNG có từ "vỏ"). "vỏ chăn chần" → match "Vỏ chăn chần bông" (SP riêng, KHÔNG phải chăn hè). Hai loại KHÁC NHAU hoàn toàn.

## TIẾNG VIỆT KHÔNG DẤU
trang/trắng=TRƠN | soc=SỌC | chan he/chăn hè=Chăn hè chần (SP riêng, KHÔNG phải vỏ chăn) | vo chan chan/vỏ chăn chần=Vỏ chăn chần bông (SP riêng, KHÔNG phải chăn hè) | chan dong=Vỏ chăn chần dày
ga phu=ga phủ | bvn=bảo vệ nệm | tam trang tri=tấm trang trí | goi trang tri=Vỏ gối trang trí
"gối" không rõ loại→Vỏ gối | LTH=T225 | hai mat/2 mat→ghi note

## SUY LUẬN CHẤT LIỆU
- SP ghi rõ chất liệu → dùng đúng. SP KHÔNG ghi → suy luận từ SP khác cùng báo giá:
  + 1 chất liệu duy nhất → áp dụng cho tất cả
  + Nhiều chất liệu → theo vị trí gần nhất + cùng mẫu (trơn/sọc)
  + Không có chất liệu nào → mặc định T250

## KÍCH THƯỚC
Số <10 = mét (1.6→160, 2.0→200). "1m6"=160. 14p/14f=14cm. T200/T250...=chất liệu KHÔNG PHẢI kích thước

## GIÁ & SL
Giá khách ghi → dùng giá khách. Không ghi → từ bảng giá. "x2"/"4 cái"→số lượng. Mặc định=1

## OUTPUT — JSON thuần, KHÔNG markdown/backtick
matchedProductId PHẢI là UUID chính xác từ CỘT ĐẦU bảng giá. TUYỆT ĐỐI KHÔNG bịa UUID.
{"items":[{"matchedProductId":"uuid-từ-bảng-giá","customName":"tên SP kích thước ĐÚNG khách","quantity":1,"price":0,"specifications":"KT đúng khách, KHÔNG làm tròn","note":""}]}
Không tìm thấy: {"items":[]}. Thiếu info: {"clarification":"câu hỏi"}`;

const AI_MODELS = [
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", desc: "Nhanh & tiết kiệm", vision: false },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "Cân bằng (mặc định text)", vision: true },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash Preview", desc: "Mặc định ảnh", vision: true },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Chính xác cao", vision: true },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", desc: "OpenAI cân bằng", vision: false },
  { value: "openai/gpt-5", label: "GPT-5", desc: "Cao cấp nhất", vision: true },
];

const VISION_MODELS = AI_MODELS.filter(m => m.vision);

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
  ai_quote_ocr_model: string;
  ai_quote_step_delay: string;
  ai_quote_type_categories: string;
  ai_quote_product_keywords: string;
  ai_quote_material_keywords: string;
  ai_quote_cache_ttl: string;
}

const DEFAULTS: AISettings = {
  ai_quote_fill_prompt: '',
  ai_quote_text_model: 'google/gemini-2.5-flash',
  ai_quote_image_model: 'google/gemini-3-flash-preview',
  ai_quote_ocr_model: 'google/gemini-2.5-flash',
  ai_quote_step_delay: '1500',
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
      const { data, error } = await (supabase as any)
        .from('ai_config')
        .select('config_key, config_value');

      if (!error && data && data.length > 0) {
        const loaded = { ...DEFAULTS };
        for (const row of data) {
          const key = row.config_key as keyof AISettings;
          if (key in loaded) {
            loaded[key] = row.config_value;
          }
        }
        setSettings(loaded);
      }
    } catch (err) {
      console.error('Failed to load AI settings:', err);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Validate JSON fields first
      if (settings.ai_quote_type_categories) {
        JSON.parse(settings.ai_quote_type_categories);
      }
      if (settings.ai_quote_product_keywords) {
        JSON.parse(settings.ai_quote_product_keywords);
      }
      if (settings.ai_quote_material_keywords) {
        JSON.parse(settings.ai_quote_material_keywords);
      }

      // Upsert each setting into ai_config
      const { data: userData } = await supabase.auth.getUser();
      const entries = Object.entries(settings) as [keyof AISettings, string][];
      
      for (const [key, value] of entries) {
        // Skip empty prompt (means use default)
        if (key === 'ai_quote_fill_prompt' && !value) {
          // Delete the key if it exists
          await (supabase as any).from('ai_config').delete().eq('config_key', key);
          continue;
        }
        const { error } = await (supabase as any)
          .from('ai_config')
          .upsert({
            config_key: key,
            config_value: value,
            updated_by: userData.user?.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'config_key' });
        
        if (error) throw error;
      }

      toast({ title: "Đã lưu", description: "Cài đặt AI đã được lưu vào database thành công" });
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

  const handleReset = async () => {
    setSettings(DEFAULTS);
    // Delete all config keys from DB
    try {
      for (const key of Object.keys(DEFAULTS)) {
        await (supabase as any).from('ai_config').delete().eq('config_key', key);
      }
    } catch {}
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
          <div className="space-y-4">
            {/* Default Prompt - always visible */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Prompt mặc định (đang sử dụng)</CardTitle>
                <CardDescription>
                  Đây là prompt hệ thống đang dùng trong edge function. Các biến {'{productListText}'}, {'{segmentInstruction}'}, {'{catalogHeader}'} sẽ được thay thế tự động.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-md p-4 overflow-x-auto max-h-[400px] overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80">
                    {DEFAULT_PROMPT_DISPLAY}
                  </pre>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary">{DEFAULT_PROMPT_DISPLAY.length} ký tự</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(DEFAULT_PROMPT_DISPLAY);
                      toast({ title: "Đã copy", description: "Prompt mặc định đã được copy vào clipboard" });
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Custom Prompt Override */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Custom Prompt (ghi đè)</CardTitle>
                <CardDescription>
                  Nhập prompt tùy chỉnh để thay thế prompt mặc định. Để trống sẽ dùng prompt mặc định ở trên.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Textarea
                    value={settings.ai_quote_fill_prompt}
                    onChange={(e) => setSettings(s => ({ ...s, ai_quote_fill_prompt: e.target.value }))}
                    placeholder="Để trống = dùng prompt mặc định..."
                    className="min-h-[250px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Biến tự động: {'{productListText}'} (bảng giá), {'{segmentInstruction}'} (phân đoạn), {'{catalogHeader}'} (header)
                  </p>
                </div>
                {settings.ai_quote_fill_prompt ? (
                  <div className="flex items-center gap-2">
                    <Badge>Custom prompt đang bật</Badge>
                    <span className="text-sm text-muted-foreground">
                      {settings.ai_quote_fill_prompt.length} ký tự
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSettings(s => ({ ...s, ai_quote_fill_prompt: '' }))}
                    >
                      Xoá & dùng mặc định
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline">Đang dùng prompt mặc định</Badge>
                )}
              </CardContent>
            </Card>
          </div>
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
