import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Globe, Play, Download, Loader2, CheckCircle, XCircle, Trash2 } from "lucide-react";

const FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gpt-5-nano",
  "gpt-5-mini",
  "gpt-5",
  "gpt-5.2",
  "glm-4.5-flash",
  "glm-4.7-flash",
];

const DEFAULT_PROMPT = `Trích xuất tất cả thông tin thành viên/doanh nghiệp từ nội dung sau thành JSON array.
Mỗi phần tử gồm các trường: name (Họ tên), company (Công ty), profession (Ngành nghề), phone (SĐT), email (Email).
Nếu không có thông tin thì để chuỗi rỗng "".
CHỈ trả về JSON array, KHÔNG markdown, KHÔNG giải thích.`;

type ScrapedRow = Record<string, string>;

interface ScrapeResult {
  url: string;
  success: boolean;
  error?: string;
  data: ScrapedRow[];
}

const WebScraperPage = () => {
  const { toast } = useToast();
  const [urls, setUrls] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [model, setModel] = useState("gemini-2.5-flash-lite");
  const [models, setModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [results, setResults] = useState<ScrapeResult[]>([]);
  const [allRows, setAllRows] = useState<ScrapedRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  // Fetch models from Beeknoee - only chat/text models (have context_window)
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("web-scraper", {
          body: { action: "list_models" },
        });
        if (data?.data) {
          const chatModels = data.data
            .filter((m: any) => m.id && m.context_window)
            .map((m: any) => m.id)
            .sort();
          setModels(chatModels.length > 0 ? chatModels : FALLBACK_MODELS);
        } else {
          setModels(FALLBACK_MODELS);
        }
      } catch (e) {
        console.error("Failed to fetch models:", e);
        setModels(FALLBACK_MODELS);
      }
    };
    fetchModels();
  }, []);

  const handleScrape = async () => {
    const urlList = urls
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urlList.length === 0) {
      toast({ title: "Lỗi", description: "Vui lòng nhập ít nhất 1 URL", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setProgress(0);
    setProgressText(`Đang xử lý 0/${urlList.length} URLs...`);
    setResults([]);
    setAllRows([]);
    setColumns([]);

    try {
      // Process URLs in batches of 5 to show progress
      const batchSize = 5;
      const allResults: ScrapeResult[] = [];

      for (let i = 0; i < urlList.length; i += batchSize) {
        const batch = urlList.slice(i, i + batchSize);
        setProgressText(`Đang xử lý ${i + 1}-${Math.min(i + batchSize, urlList.length)}/${urlList.length} URLs...`);
        setProgress(((i) / urlList.length) * 100);

        const { data, error } = await supabase.functions.invoke("web-scraper", {
          body: { urls: batch, model, prompt },
        });

        if (error) {
          toast({ title: "Lỗi", description: error.message, variant: "destructive" });
          break;
        }

        if (data?.results) {
          allResults.push(...data.results);
        }
      }

      setResults(allResults);
      setProgress(100);
      setProgressText("Hoàn tất!");

      // Flatten all data rows
      const rows = allResults.flatMap((r) => r.data);
      setAllRows(rows);

      // Detect columns from data
      if (rows.length > 0) {
        const cols = new Set<string>();
        rows.forEach((row) => Object.keys(row).forEach((k) => cols.add(k)));
        setColumns(Array.from(cols));
      }

      const successCount = allResults.filter((r) => r.success).length;
      const totalRows = rows.length;
      toast({
        title: "Hoàn tất cào dữ liệu",
        description: `${successCount}/${allResults.length} URLs thành công, ${totalRows} bản ghi`,
      });
    } catch (e) {
      console.error("Scrape error:", e);
      toast({ title: "Lỗi", description: "Đã xảy ra lỗi khi cào dữ liệu", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const exportCSV = () => {
    if (allRows.length === 0) return;

    const header = columns.join(",");
    const rows = allRows.map((row) =>
      columns.map((col) => `"${(row[col] || "").replace(/"/g, '""')}"`).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scraped_data_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6" />
            Cào dữ liệu từ Web
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Nhập URL, chọn model AI và tùy chỉnh prompt để trích xuất dữ liệu
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Danh sách URL</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder={"https://example.com/page1\nhttps://example.com/page2\nhttps://example.com/page3"}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                className="min-h-[150px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Mỗi dòng 1 URL. Hỗ trợ nhiều URL cùng lúc.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cấu hình AI</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Model AI</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.length > 0 ? (
                      models.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</SelectItem>
                        <SelectItem value="gemini-2.5-flash">gemini-2.5-flash</SelectItem>
                        <SelectItem value="gemini-2.5-pro">gemini-2.5-pro</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Prompt trích xuất</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[200px] text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Mô tả các trường dữ liệu cần trích xuất. AI sẽ trả về JSON array.
                </p>
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleScrape}
            disabled={isLoading || !urls.trim()}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Đang cào dữ liệu...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Bắt đầu cào
              </>
            )}
          </Button>

          {isLoading && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-xs text-center text-muted-foreground">{progressText}</p>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="space-y-4">
          {/* URL status */}
          {results.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  Trạng thái URLs
                  <Badge variant="outline">
                    {results.filter((r) => r.success).length}/{results.length} thành công
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {r.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className="truncate flex-1">{r.url}</span>
                      <Badge variant="secondary" className="text-xs">
                        {r.data.length} bản ghi
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Data table */}
      {allRows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Kết quả ({allRows.length} bản ghi)
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportCSV}>
                  <Download className="h-4 w-4 mr-1" />
                  Xuất CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setResults([]); setAllRows([]); setColumns([]); }}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Xóa kết quả
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[500px] overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    {columns.map((col) => (
                      <TableHead key={col} className="whitespace-nowrap">{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      {columns.map((col) => (
                        <TableCell key={col} className="max-w-[200px] truncate">
                          {row[col] || ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WebScraperPage;
