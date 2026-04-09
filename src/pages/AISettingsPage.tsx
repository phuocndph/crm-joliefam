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

// Known vision-capable model patterns
const VISION_MODEL_PATTERNS = [
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash', 'gemini-3.1',
  'gpt-5', 'gpt-5.2', 'gpt-5.4', 'claude-sonnet', 'claude-opus', 'claude-haiku',
  'glm-5', 'glm-4.7',
];

// Exclude non-chat models (image gen, video gen, embedding, codex)
const EXCLUDED_PATTERNS = [
  'dall-e', 'imagen-', 'sora-', 'veo-', 'gpt-image', 'chatgpt-image',
  'text-embedding', 'gemini-embedding', 'codex',
];

interface BeeknoeeModel {
  id: string;
  owned_by: string;
  context_window?: number;
}

function isVisionModel(modelId: string): boolean {
  return VISION_MODEL_PATTERNS.some(p => modelId.includes(p));
}

function isChatModel(model: BeeknoeeModel): boolean {
  if (EXCLUDED_PATTERNS.some(p => model.id.includes(p))) return false;
  if (model.context_window && model.context_window > 5000) return true;
  return false;
}

// Fallback static models in case API fails
const FALLBACK_MODELS = [
  { value: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite", desc: "Google — Nhanh", vision: false },
  { value: "gemini-2.5-flash", label: "gemini-2.5-flash", desc: "Google — Cân bằng", vision: true },
  { value: "gemini-3-flash", label: "gemini-3-flash", desc: "Google — Mới nhất", vision: true },
  { value: "glm-4.7-flash", label: "glm-4.7-flash", desc: "Z.AI — Nhanh", vision: false },
  { value: "gpt-5-mini", label: "gpt-5-mini", desc: "OpenAI — Cân bằng", vision: false },
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
  ai_quote_ocr_prompt: string;
  ai_quote_text_model: string;
  ai_quote_image_model: string;
  ai_quote_ocr_model: string;
  ai_quote_step_delay: string;
  ai_quote_type_categories: string;
  ai_quote_product_keywords: string;
  ai_quote_material_keywords: string;
  ai_quote_cache_ttl: string;
}

const DEFAULT_OCR_PROMPT = `Trích xuất TOÀN BỘ bảng sản phẩm từ ảnh. Trả về JSON thuần:
{"san_pham":[{"ten_san_pham":"...","quy_cach":"...","so_luong":1,"don_gia":0,"thanh_tien":0}]}
Giữ nguyên số liệu gốc. Chuỗi rỗng cho thông tin thiếu. KHÔNG giải thích.`;

const DEFAULTS: AISettings = {
  ai_quote_fill_prompt: '',
  ai_quote_ocr_prompt: '',
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
        // Skip empty prompts (means use default)
        if ((key === 'ai_quote_fill_prompt' || key === 'ai_quote_ocr_prompt') && !value) {
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
            {/* OCR Prompt */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="h-4 w-4 text-blue-500" />
                  Prompt OCR (trích xuất ảnh)
                </CardTitle>
                <CardDescription>
                  Prompt dùng để trích xuất bảng sản phẩm từ ảnh (Bước 1). Kết quả OCR sẽ được chuyển thành text rồi chạy qua pipeline matching bình thường.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted rounded-md p-4 overflow-x-auto max-h-[200px] overflow-y-auto">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Prompt mặc định:</p>
                  <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80">
                    {DEFAULT_OCR_PROMPT}
                  </pre>
                </div>
                <Textarea
                  value={settings.ai_quote_ocr_prompt}
                  onChange={(e) => setSettings(s => ({ ...s, ai_quote_ocr_prompt: e.target.value }))}
                  placeholder="Để trống = dùng prompt OCR mặc định..."
                  className="min-h-[150px] font-mono text-sm"
                />
                {settings.ai_quote_ocr_prompt ? (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-700 border-blue-300">Custom OCR prompt đang bật</Badge>
                    <span className="text-sm text-muted-foreground">
                      {settings.ai_quote_ocr_prompt.length} ký tự
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSettings(s => ({ ...s, ai_quote_ocr_prompt: '' }))}
                    >
                      Xoá & dùng mặc định
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline">Đang dùng OCR prompt mặc định</Badge>
                )}
              </CardContent>
            </Card>

            <Separator />

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

        <TabsContent value="model">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Model xử lý Text</CardTitle>
                  <CardDescription>Dùng cho Bước 2 — so khớp text với catalog (không ảnh)</CardDescription>
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
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-500" />
                    Model OCR (Bước 1)
                  </CardTitle>
                  <CardDescription>Trích xuất text từ ảnh. Chỉ model hỗ trợ vision.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Select
                    value={settings.ai_quote_ocr_model}
                    onValueChange={(v) => setSettings(s => ({ ...s, ai_quote_ocr_model: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VISION_MODELS.map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          <div className="flex items-center gap-2">
                            <span>{m.label}</span>
                            <span className="text-xs text-muted-foreground">— {m.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Khác với model Image (fallback khi OCR thất bại). OCR chỉ trích xuất text, không cần catalog.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Model xử lý Ảnh (Fallback)</CardTitle>
                  <CardDescription>Dùng khi OCR thất bại — full multimodal với catalog</CardDescription>
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
                      {VISION_MODELS.map(m => (
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
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Delay giữa 2 bước
                  </CardTitle>
                  <CardDescription>Thời gian chờ giữa OCR và Text Matching (ms). Giúp tránh rate limit.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Input
                      type="number"
                      value={settings.ai_quote_step_delay}
                      onChange={(e) => setSettings(s => ({ ...s, ai_quote_step_delay: e.target.value }))}
                      className="w-32"
                      min={0}
                      max={5000}
                      step={100}
                    />
                    <span className="text-sm text-muted-foreground">
                      = {(parseInt(settings.ai_quote_step_delay || '0') / 1000).toFixed(1)}s
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Cache TTL */}
            <Card>
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

            {/* Pipeline Visualization */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Luồng xử lý ảnh (Pipeline)
                </CardTitle>
                <CardDescription>
                  Sơ đồ pipeline 2 bước khi xử lý ảnh báo giá. Khi không có ảnh, chỉ chạy Bước 2.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Step 1 */}
                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">1</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">OCR — Trích xuất text từ ảnh</span>
                        <Badge variant="outline" className="text-xs">Vision</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Model: <span className="font-mono text-foreground">{AI_MODELS.find(m => m.value === settings.ai_quote_ocr_model)?.label || settings.ai_quote_ocr_model}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">Prompt ngắn, không gửi catalog → tiết kiệm 60-80% token</p>
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground">Beeknoee fallback:</p>
                        <div className="flex gap-1 flex-wrap mt-1">
                          <Badge variant="secondary" className="text-[10px]">gemini-2.5-flash</Badge>
                          <span className="text-[10px] text-muted-foreground self-center">→ timeout 90s</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delay arrow */}
                  <div className="flex items-center gap-2 pl-4">
                    <div className="w-0.5 h-4 bg-border mx-3.5" />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Delay {(parseInt(settings.ai_quote_step_delay || '0') / 1000).toFixed(1)}s — giải phóng concurrent slot
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">2</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">Text Matching — So khớp với catalog</span>
                        <Badge variant="outline" className="text-xs">Text-only</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Model: <span className="font-mono text-foreground">{AI_MODELS.find(m => m.value === settings.ai_quote_text_model)?.label || settings.ai_quote_text_model}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">Dùng text OCR + catalog đã lọc theo segment</p>
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground">Beeknoee fallback (ưu tiên GLM để tránh 429):</p>
                        <div className="flex gap-1 flex-wrap mt-1">
                          {['glm-4.7-flash', 'glm-4.5-flash', 'gemini-2.5-flash', 'gpt-oss-120b'].map((m, i) => (
                            <span key={m} className="flex items-center gap-0.5">
                              <Badge variant="secondary" className="text-[10px]">{m}</Badge>
                              {i < 3 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Fallback */}
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-dashed bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-400 text-white flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">Fallback — Full Multimodal</span>
                        <Badge variant="outline" className="text-xs text-orange-600">Khi OCR thất bại</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Model: <span className="font-mono text-foreground">{AI_MODELS.find(m => m.value === settings.ai_quote_image_model)?.label || settings.ai_quote_image_model}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">Gửi ảnh + catalog → tốn nhiều token hơn, chậm hơn</p>
                    </div>
                  </div>
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
