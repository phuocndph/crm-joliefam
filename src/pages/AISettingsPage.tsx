import ExternalIntegrationStatus from "@/components/ExternalIntegrationStatus";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { isLocalBackend, localAdminUser } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";
import LocalAiProviderPanel from '@/components/LocalAiProviderPanel';
import { localAiRule } from '@/lib/local-ai-rules';
import LocalAiModelPicker, {type LocalAiModelCatalog} from '@/components/LocalAiModelPicker';
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
  ai_quote_text_model: 'gemini-2.5-flash',
  ai_quote_image_model: 'gemini-2.5-flash',
  ai_quote_ocr_model: 'gemini-2.5-flash-lite',
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
  const [localModelProvider,setLocalModelProvider]=useState('local');
  const [localCatalog,setLocalCatalog]=useState<LocalAiModelCatalog>({provider:'local',models:[],loading:false,error:'',loaded:false});
  const [mutationBusy,setMutationBusy]=useState(false);
  const catalogGeneration=useRef(0), selectionRevision=useRef(0), mutationLock=useRef(false), activeProviderRef=useRef(localModelProvider), alive=useRef(true);
  activeProviderRef.current=localModelProvider;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;catalogGeneration.current++;};},[]);
  const beginLocalMutation=()=>{if(mutationLock.current)return false;mutationLock.current=true;setMutationBusy(true);return true;};
  const endLocalMutation=()=>{mutationLock.current=false;if(alive.current)setMutationBusy(false);};
  const receiveCatalog=(catalog:LocalAiModelCatalog)=>{catalogGeneration.current++;setLocalCatalog(catalog);};
  const reloadStepModels=async()=>{
    const provider=localModelProvider;if(provider!=='f5quota'&&provider!=='beeknoee')return;
    const request=++catalogGeneration.current;setLocalCatalog({provider,models:[],loading:true,error:'',loaded:false});
    try{const result=await localApi.aiProviderModels(provider);if(!alive.current||request!==catalogGeneration.current||activeProviderRef.current!==provider)return;setLocalCatalog({provider,models:result.data,loading:false,error:'',loaded:true});}
    catch(error){if(!alive.current||request!==catalogGeneration.current||activeProviderRef.current!==provider)return;setLocalCatalog({provider,models:[],loading:false,error:error instanceof Error?error.message:'Không tải được mô hình.',loaded:false});}
  };
  const localModelPicker=(key:'ai_quote_text_model'|'ai_quote_image_model'|'ai_quote_ocr_model',label:string)=><LocalAiModelPicker label={label} value={settings[key]} onChange={value=>setSettings(s=>({...s,[key]:value}))} models={localCatalog.provider===localModelProvider?localCatalog.models:[]} loaded={localCatalog.provider===localModelProvider&&localCatalog.loaded} loading={localCatalog.provider===localModelProvider&&localCatalog.loading} error={localCatalog.provider===localModelProvider?localCatalog.error:''} disabled={loading||mutationBusy||userRole!=='admin'||localModelProvider==='local'||localCatalog.provider!==localModelProvider} onReload={localCatalog.provider===localModelProvider?()=>void reloadStepModels():undefined}/>;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [testPriceListId, setTestPriceListId] = useState<string>('');
  const [priceLists, setPriceLists] = useState<Array<{id: string; name: string; year: number}>>([]);

  const [beeknoeeModels, setBeeknoeeModels] = useState<Array<{value: string; label: string; desc: string; vision: boolean}>>(FALLBACK_MODELS);
  const [modelsLoading, setModelsLoading] = useState(false);

  useEffect(() => {
    if (isLocalBackend()) {
      void supabase.auth.getUser().then(({ data }) => setUser(data.user));
      localApi.catalogPriceLists().then((data) => setPriceLists(data.map((item) => ({ id: item.id, name: item.name, year: Number(item.year || 0) })))).catch(() => undefined);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    supabase.from('price_lists').select('id, name, year').eq('status', 'active').order('year', { ascending: false })
      .then(({ data }) => { if (data) setPriceLists(data); });
  }, []);

  // Fetch models from Beeknoee
  useEffect(() => {
    const fetchModels = async () => {
      if (isLocalBackend()) {
        setModelsLoading(false);
        return;
      }
      setModelsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('lookup-tax-code', {
          body: { type: 'list_models' },
        });
        if (!error && data?.data) {
          const chatModels = (data.data as BeeknoeeModel[])
            .filter(isChatModel)
            .map(m => ({
              value: m.id,
              label: m.id,
              desc: `${m.owned_by}${m.context_window ? ` — ${Math.round(m.context_window / 1000)}K ctx` : ''}`,
              vision: isVisionModel(m.id),
            }))
            .sort((a, b) => {
              // Sort: google first, then by name
              const ownerA = a.desc.split(' —')[0];
              const ownerB = b.desc.split(' —')[0];
              if (ownerA !== ownerB) return ownerA.localeCompare(ownerB);
              return a.label.localeCompare(b.label);
            });
          if (chatModels.length > 0) {
            setBeeknoeeModels(chatModels);
          }
        }
      } catch (err) {
        console.error('Failed to fetch Beeknoee models:', err);
      }
      setModelsLoading(false);
    };
    fetchModels();
  }, []);

  useEffect(() => {
    if (!user) return;
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    const revision=selectionRevision.current;
    setLoading(true);
    try {
      if (isLocalBackend()) {
        const { data, error } = await (supabase as any).from('ai_config').select('config_key, config_value');
        if (error) throw error;
        const loaded = { ...DEFAULTS };
        for (const row of data || []) {
          const key = row.config_key as keyof AISettings;
          if (key in loaded) loaded[key] = String(row.config_value ?? '');
        }
        const connection=await localApi.aiProviders();
        if(!alive.current||revision!==selectionRevision.current)return;
        const marker=(data || []).find((row:{config_key:string})=>row.config_key==='ai_quote_provider')?.config_value;
        const selected=connection.providers.find(provider=>provider.provider===connection.selected);
        if(selected&&marker!==connection.selected){loaded.ai_quote_text_model=selected.model;loaded.ai_quote_image_model=selected.model;loaded.ai_quote_ocr_model=selected.model;}
        setLocalModelProvider(connection.selected);
        activeProviderRef.current=connection.selected;
        setSettings(loaded);
        return;
      }

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
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const local=isLocalBackend();
    if(local&&!beginLocalMutation())return;
    const revision=local?++selectionRevision.current:selectionRevision.current;
    setSaving(true);
    try {
      // Preserve the public validation path; local rules use named byte limits.
      if(local){
        localAiRule(settings.ai_quote_type_categories,'Phân loại sản phẩm');
        localAiRule(settings.ai_quote_product_keywords,'Từ khóa loại sản phẩm');
        localAiRule(settings.ai_quote_material_keywords,'Từ khóa chất liệu');
      }else{
        if(settings.ai_quote_type_categories)JSON.parse(settings.ai_quote_type_categories);
        if(settings.ai_quote_product_keywords)JSON.parse(settings.ai_quote_product_keywords);
        if(settings.ai_quote_material_keywords)JSON.parse(settings.ai_quote_material_keywords);
      }

      if (isLocalBackend()) {
        const nextSettings = { ...settings };
        const markerError=(await (supabase as any).from('ai_config').upsert({config_key:'ai_quote_provider',config_value:localModelProvider,updated_at:new Date().toISOString()},{onConflict:'config_key'})).error;
        if(markerError)throw markerError;
        for (const [key, value] of Object.entries(nextSettings)) {
          if(!alive.current||revision!==selectionRevision.current)return;
          const { error } = await (supabase as any).from('ai_config').upsert({
            config_key: key,
            config_value: value,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'config_key' });
          if (error) throw error;
        }
        if(!alive.current||revision!==selectionRevision.current)return;
        setSettings(nextSettings);
        toast({ title: "Đã lưu cục bộ", description: "Cấu hình mô hình và câu lệnh đã được lưu. Nhà cung cấp dùng theo mục Kết nối AI." });
        return;
      }

      // Strip google/ prefix from model values before saving
      const cleanModel = (v: string) => v.replace(/^google\//, '');
      
      // Upsert each setting into ai_config
      const { data: userData } = await supabase.auth.getUser();
      const entries = Object.entries(settings) as [keyof AISettings, string][];
      const nextSettings = { ...settings };

      for (const [key, value] of entries) {
        const isModelKey = key.includes('_model');
        const cleanValue = isModelKey ? cleanModel(value) : value;
        if (isModelKey) {
          nextSettings[key] = cleanValue;
        }
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
            config_value: cleanValue,
            updated_by: userData.user?.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'config_key' });
        
        if (error) throw error;
      }

      const { error: refreshError } = await supabase.functions.invoke('lookup-tax-code', {
        body: { type: 'refresh_ai_config' },
      });

      if (refreshError) throw refreshError;

      setSettings(nextSettings);
      await loadSettings();

      toast({ title: "Đã lưu", description: "Cài đặt AI đã được lưu vào cơ sở dữ liệu thành công" });
    } catch (err) {
      toast({ 
        title: "Lỗi", 
        description: err instanceof Error ? err.message : "JSON không hợp lệ", 
        variant: "destructive" 
      });
    } finally {
      if(local)endLocalMutation();
      if(alive.current)setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testInput.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập dữ liệu kiểm tra", variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      if (isLocalBackend()) {
        setTestResult(await localApi.localFunction('lookup-tax-code', { type:'ai_quote_debug',data:{request:testInput,config:{textModel:settings.ai_quote_text_model,customPrompt:settings.ai_quote_fill_prompt,priceListId:testPriceListId && testPriceListId!=='all'?testPriceListId:undefined,typeCategories:localAiRule(settings.ai_quote_type_categories,'Phân loại sản phẩm'),productKeywords:localAiRule(settings.ai_quote_product_keywords,'Từ khóa loại sản phẩm'),materialKeywords:localAiRule(settings.ai_quote_material_keywords,'Từ khóa chất liệu')}} }));
        setTesting(false);
        return;
      }

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
              priceListId: testPriceListId && testPriceListId !== 'all' ? testPriceListId : undefined,
            }
          }
        }
      });

      if (error) throw error;
      setTestResult(data);
    } catch (err) {
      setTestResult({ error: err instanceof Error ? err.message : 'Lỗi không xác định' });
    }
    setTesting(false);
  };

  const handleReset = async () => {
    if (isLocalBackend()) {
      if(!beginLocalMutation())return;
      const revision=++selectionRevision.current;
      try {
        const connection=await localApi.aiProviders(), model=connection.providers.find(p=>p.provider===connection.selected)?.model;
        if(!alive.current||revision!==selectionRevision.current)return;
        const defaults={...DEFAULTS,...(model?{ai_quote_text_model:model,ai_quote_image_model:model,ai_quote_ocr_model:model}:{})};
        for (const [key, value] of Object.entries({...defaults,ai_quote_provider:connection.selected})) {
          if(!alive.current||revision!==selectionRevision.current)return;
          const { error } = await (supabase as any).from('ai_config').upsert({
            config_key: key,
            config_value: value,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'config_key' });
          if (error) throw error;
        }
        if(!alive.current||revision!==selectionRevision.current)return;
        setSettings(defaults);setLocalModelProvider(connection.selected);activeProviderRef.current=connection.selected;
      } catch (error) {
        toast({ title: "Không thể khôi phục", description: error instanceof Error ? error.message : "Không thể ghi cấu hình AI local.", variant: "destructive" });
        return;
      } finally {
        endLocalMutation();
      }
      toast({ title: "Đã khôi phục cục bộ", description: "Cài đặt AI cục bộ đã được khôi phục về mặc định." });
      return;
    }
    setSettings(DEFAULTS);
    // Delete all config keys from DB
    try {
      for (const key of Object.keys(DEFAULTS)) {
        await (supabase as any).from('ai_config').delete().eq('config_key', key);
      }
    } catch {}
    toast({ title: "Đã khôi phục", description: "Cài đặt AI đã được khôi phục về mặc định" });
  };

  if (userRole && userRole !== 'admin' && userRole !== 'manager') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Bạn không có quyền truy cập trang này.</p>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-5xl mx-auto min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/quotes')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold text-foreground">Cài đặt AI hỗ trợ báo giá</h1>
          <p className="text-muted-foreground text-sm">Kiểm soát câu lệnh, mô hình, lọc danh mục và gỡ lỗi</p>
        </div>
        <Button variant="outline" onClick={handleReset} disabled={isLocalBackend() && (userRole!=='admin'||loading||mutationBusy)} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Khôi phục mặc định
        </Button>
        <Button onClick={handleSave} disabled={saving || (isLocalBackend() && (userRole!=='admin'||loading||mutationBusy))} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Lưu cài đặt
        </Button>
      </div>

      {isLocalBackend() && ["admin", "manager"].includes(userRole || "") && <ExternalIntegrationStatus />}
      {isLocalBackend()&&<LocalAiProviderPanel admin={userRole==='admin'} locked={mutationBusy||loading} beginMutation={beginLocalMutation} endMutation={endLocalMutation} onSelected={(model,provider)=>{selectionRevision.current++;catalogGeneration.current++;setLocalModelProvider(provider);activeProviderRef.current=provider;if(provider!=='local')setSettings(s=>({...s,ai_quote_text_model:model,ai_quote_image_model:model,ai_quote_ocr_model:model}));}} onCatalog={receiveCatalog}/>}

      <Tabs defaultValue="prompt" className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto justify-start sm:grid sm:grid-cols-4 [&>button]:shrink-0">
          <TabsTrigger value="prompt" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Câu lệnh AI
          </TabsTrigger>
          <TabsTrigger value="model" className="gap-2">
            <Brain className="h-4 w-4" />
            Mô hình
          </TabsTrigger>
          <TabsTrigger value="catalog" className="gap-2">
            <Database className="h-4 w-4" />
            Danh mục
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-2">
            <TestTube className="h-4 w-4" />
            Kiểm tra & gỡ lỗi
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
                  Câu lệnh OCR (trích xuất ảnh)
                </CardTitle>
                <CardDescription>
                  Câu lệnh dùng để trích xuất bảng sản phẩm từ ảnh (Bước 1). Kết quả OCR sẽ được chuyển thành văn bản rồi xử lý theo quy trình so khớp thông thường.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted rounded-md p-4 overflow-x-auto max-h-[200px] overflow-y-auto">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Câu lệnh mặc định:</p>
                  <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80">
                    {DEFAULT_OCR_PROMPT}
                  </pre>
                </div>
                <Textarea
                  value={settings.ai_quote_ocr_prompt}
                  onChange={(e) => setSettings(s => ({ ...s, ai_quote_ocr_prompt: e.target.value }))}
                  placeholder="Để trống = dùng câu lệnh OCR mặc định..."
                  className="min-h-[150px] font-mono text-sm"
                />
                {settings.ai_quote_ocr_prompt ? (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-700 border-blue-300">Câu lệnh OCR tùy chỉnh đang bật</Badge>
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
                  <Badge variant="outline">Đang dùng câu lệnh OCR mặc định</Badge>
                )}
              </CardContent>
            </Card>

            <Separator />

            {/* Default Prompt - always visible */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Câu lệnh mặc định (đang sử dụng)</CardTitle>
                <CardDescription>
                  Đây là câu lệnh hệ thống đang dùng trong hàm xử lý. Các biến {'{productListText}'}, {'{segmentInstruction}'}, {'{catalogHeader}'} sẽ được thay thế tự động.
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
                      toast({ title: "Đã sao chép", description: "Câu lệnh mặc định đã được sao chép vào bộ nhớ tạm" });
                    }}
                  >
                    Sao chép
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Custom Prompt Override */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Câu lệnh tùy chỉnh (ghi đè)</CardTitle>
                <CardDescription>
                  Nhập câu lệnh tùy chỉnh để thay thế câu lệnh mặc định. Để trống sẽ dùng câu lệnh mặc định ở trên.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Textarea
                    value={settings.ai_quote_fill_prompt}
                    onChange={(e) => setSettings(s => ({ ...s, ai_quote_fill_prompt: e.target.value }))}
                  placeholder="Để trống = dùng câu lệnh mặc định..."
                    className="min-h-[250px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Biến tự động: {'{productListText}'} (bảng giá), {'{segmentInstruction}'} (phân đoạn), {'{catalogHeader}'} (tiêu đề bảng)
                  </p>
                </div>
                {settings.ai_quote_fill_prompt ? (
                  <div className="flex items-center gap-2">
                    <Badge>Câu lệnh tùy chỉnh đang bật</Badge>
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
                  <Badge variant="outline">Đang dùng câu lệnh mặc định</Badge>
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
                  <CardTitle className="text-lg flex items-center gap-2">
                    Mô hình xử lý văn bản
                    {modelsLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  </CardTitle>
                  <CardDescription>{isLocalBackend()?'Chọn từ danh sách của nhà cung cấp đang sử dụng, giữ nguyên mã mô hình.':'Dùng cho Bước 2 — so khớp văn bản với danh mục (không dùng ảnh). Lấy từ Beeknoee API.'}</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLocalBackend()?localModelPicker('ai_quote_text_model','Mô hình xử lý văn bản'):<Select
                    value={settings.ai_quote_text_model}
                    onValueChange={(v) => setSettings(s => ({ ...s, ai_quote_text_model: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {beeknoeeModels.map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          <div className="flex items-center gap-2">
                            <span>{m.label}</span>
                            <span className="text-xs text-muted-foreground">— {m.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-500" />
                    Mô hình OCR (Bước 1)
                  </CardTitle>
                  <CardDescription>Trích xuất văn bản từ ảnh. Chỉ dùng mô hình hỗ trợ nhận diện ảnh.</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLocalBackend()?localModelPicker('ai_quote_ocr_model','Mô hình OCR (Bước 1)'):<Select
                    value={settings.ai_quote_ocr_model}
                    onValueChange={(v) => setSettings(s => ({ ...s, ai_quote_ocr_model: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {beeknoeeModels.filter(m => m.vision).map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          <div className="flex items-center gap-2">
                            <span>{m.label}</span>
                            <span className="text-xs text-muted-foreground">— {m.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>}
                  <p className="text-xs text-muted-foreground mt-2">
                    Khác với mô hình xử lý ảnh dự phòng khi OCR thất bại. OCR chỉ trích xuất văn bản, không cần danh mục.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Mô hình xử lý ảnh (dự phòng)</CardTitle>
                  <CardDescription>Dùng khi OCR thất bại — xử lý đa phương thức với danh mục</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLocalBackend()?localModelPicker('ai_quote_image_model','Mô hình xử lý ảnh'):<Select
                    value={settings.ai_quote_image_model}
                    onValueChange={(v) => setSettings(s => ({ ...s, ai_quote_image_model: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {beeknoeeModels.filter(m => m.vision).map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          <div className="flex items-center gap-2">
                            <span>{m.label}</span>
                            <span className="text-xs text-muted-foreground">— {m.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Độ trễ giữa 2 bước
                  </CardTitle>
                  <CardDescription>Thời gian chờ giữa OCR và so khớp văn bản (ms). Giúp tránh giới hạn tần suất.</CardDescription>
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
                <CardTitle className="text-lg">Thời gian lưu đệm (TTL)</CardTitle>
                <CardDescription>Thời gian lưu đệm danh mục sản phẩm (giây). Mặc định 300 = 5 phút.</CardDescription>
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
                  Luồng xử lý ảnh
                </CardTitle>
                <CardDescription>
                  Sơ đồ xử lý 2 bước khi xử lý ảnh báo giá. Khi không có ảnh, chỉ chạy Bước 2.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Step 1 */}
                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">1</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">OCR — Trích xuất văn bản từ ảnh</span>
                        <Badge variant="outline" className="text-xs">Nhận diện ảnh</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Mô hình: <span className="font-mono text-foreground">{beeknoeeModels.find(m => m.value === settings.ai_quote_ocr_model)?.label || settings.ai_quote_ocr_model}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">Câu lệnh ngắn, không gửi danh mục → tiết kiệm 60-80% token</p>
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground">Phương án dự phòng Beeknoee:</p>
                        <div className="flex gap-1 flex-wrap mt-1">
                          <Badge variant="secondary" className="text-[10px]">gemini-2.5-flash</Badge>
                          <span className="text-[10px] text-muted-foreground self-center">→ hết thời gian chờ sau 90 giây</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delay arrow */}
                  <div className="flex items-center gap-2 pl-4">
                    <div className="w-0.5 h-4 bg-border mx-3.5" />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Độ trễ {(parseInt(settings.ai_quote_step_delay || '0') / 1000).toFixed(1)} giây — giải phóng suất xử lý đồng thời
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">2</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">So khớp văn bản — đối chiếu với danh mục</span>
                        <Badge variant="outline" className="text-xs">Chỉ văn bản</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Mô hình: <span className="font-mono text-foreground">{beeknoeeModels.find(m => m.value === settings.ai_quote_text_model)?.label || settings.ai_quote_text_model}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">Dùng văn bản OCR và danh mục đã lọc theo phân đoạn</p>
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground">Phương án dự phòng Beeknoee:</p>
                        <div className="flex gap-1 flex-wrap mt-1">
                          {['gemini-2.5-flash-lite', 'gemini-2.5-flash'].map((m, i) => (
                            <span key={m} className="flex items-center gap-0.5">
                              <Badge variant="secondary" className="text-[10px]">{m}</Badge>
                              {i < 1 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />}
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
                        <span className="font-semibold text-sm">Dự phòng — xử lý đa phương thức</span>
                        <Badge variant="outline" className="text-xs text-orange-600">Khi OCR thất bại</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Mô hình: <span className="font-mono text-foreground">{beeknoeeModels.find(m => m.value === settings.ai_quote_image_model)?.label || settings.ai_quote_image_model}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">Gửi ảnh và danh mục → tốn nhiều token hơn, chậm hơn</p>
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
                <CardTitle className="text-lg">Ánh xạ loại sang danh mục</CardTitle>
                <CardDescription>
                  Ánh xạ loại sản phẩm (loại phân đoạn) → danh mục tìm kiếm trong cơ sở dữ liệu. Định dạng JSON.
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
                  <CardTitle className="text-lg">Từ khóa loại sản phẩm</CardTitle>
                  <CardDescription>Từ khóa nhận diện loại sản phẩm (không dấu). Mảng JSON.</CardDescription>
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
                  <CardTitle className="text-lg">Từ khóa chất liệu</CardTitle>
                  <CardDescription>Từ khóa nhận diện chất liệu vải. Mảng JSON.</CardDescription>
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
                <CardTitle className="text-lg">Kiểm tra AI hỗ trợ báo giá</CardTitle>
                <CardDescription>
                  Nhập yêu cầu mẫu để kiểm tra phân tích, lọc dữ liệu và kết quả AI.
                  Sử dụng cấu hình hiện tại (chưa lưu cũng áp dụng).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
                  <div>
                    <Label>Yêu cầu đầu vào</Label>
                    <Textarea
                      value={testInput}
                      onChange={(e) => setTestInput(e.target.value)}
                      placeholder={"Vải T250 trắng sọc:\n4c Vỏ chăn 200x220\n4c Ga chun 160x200x12cm\n8c Vỏ gối 45x65"}
                      className="min-h-[120px]"
                    />
                  </div>
                  <div>
                    <Label>Bảng giá</Label>
                    <Select value={testPriceListId} onValueChange={setTestPriceListId}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Tất cả sản phẩm" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả sản phẩm</SelectItem>
                        {priceLists.map(pl => (
                          <SelectItem key={pl.id} value={pl.id}>{pl.name} ({pl.year})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleTest} disabled={testing || (isLocalBackend() && userRole!=='admin')} className="gap-2">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Chạy kiểm tra
                </Button>
              </CardContent>
            </Card>

            {testResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Kết quả gỡ lỗi</CardTitle>
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
                            Các phần đã phân tích
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
                          <h3 className="font-semibold mb-2">Thông tin lọc</h3>
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
                            Phản hồi AI
                            {testResult.aiResponse.items && (
                              <Badge variant="secondary">{testResult.aiResponse.items.length} mục</Badge>
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
                          <h3 className="font-semibold mb-2 text-warning">Cảnh báo kiểm tra</h3>
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
                          <Badge variant="outline">Mô hình: {testResult.modelUsed}</Badge>
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
