import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseCsvLine, parseVietnameseCurrency, formatVietnameseCurrency } from "@/lib/csvUtils";

interface ColumnMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  googleSheetsUrl: string;
  priceListId: string;
  onImportComplete: () => void;
}

interface ColumnMapping {
  [key: string]: string; // database field -> sheet column index
}

const DATABASE_FIELDS = [
  { key: 'sku', label: 'Mã SP', required: true },
  { key: 'name', label: 'Tên SP', required: true },
  { key: 'category', label: 'Danh mục', required: false },
  { key: 'specifications', label: 'Quy cách', required: false },
  { key: 'cost_price', label: 'Giá gốc', required: false },
  { key: 'price', label: 'Giá bán', required: false },
  { key: 'description', label: 'Mô tả', required: false },
];

export function ColumnMappingDialog({ 
  open, 
  onOpenChange, 
  googleSheetsUrl, 
  priceListId,
  onImportComplete 
}: ColumnMappingDialogProps) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleData, setSampleData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const loadPreviewData = async () => {
    if (!googleSheetsUrl) return;
    
    setIsLoading(true);
    try {
      const urlMatch = googleSheetsUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (!urlMatch) {
        toast.error('URL Google Sheets không hợp lệ');
        return;
      }

      const spreadsheetId = urlMatch[1];
      const gidMatch = googleSheetsUrl.match(/[#?&]gid=(\d+)/);
      const gid = gidMatch ? gidMatch[1] : '0';
      const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;

      const response = await fetch(csvUrl);
      if (!response.ok) {
        toast.error('Không thể truy cập Google Sheets. Vui lòng kiểm tra quyền chia sẻ.');
        return;
      }

      const csvText = await response.text();
      const lines = csvText.trim().split('\n');
      
      if (lines.length < 2) {
        toast.error('Google Sheets không có dữ liệu');
        return;
      }

      // Use shared CSV parsing logic
      const parsedHeaders = parseCsvLine(lines[0]).map(h => h.replace(/"/g, '').trim());
      const parsedSampleData = lines.slice(1, 6).map(line => 
        parseCsvLine(line).map(cell => {
          const cleanCell = cell.replace(/"/g, '').trim();
          // Format currency values for better preview
          if (cleanCell && /[\d,.]/.test(cleanCell)) {
            const parsed = parseVietnameseCurrency(cleanCell);
            if (parsed !== null && parsed > 1000) {
              return formatVietnameseCurrency(parsed);
            }
          }
          return cleanCell;
        })
      );

      setHeaders(parsedHeaders);
      setSampleData(parsedSampleData);
      setDataLoaded(true);

      // Auto-map some obvious columns
      const autoMapping: ColumnMapping = {};
      parsedHeaders.forEach((header, index) => {
        const headerUpper = header.toUpperCase();
        if (headerUpper.includes('MÃ SP') || headerUpper.includes('SKU')) {
          autoMapping['sku'] = index.toString();
        } else if (headerUpper.includes('TÊN SP') || headerUpper.includes('TEN SP')) {
          autoMapping['name'] = index.toString();
        } else if (headerUpper.includes('DANH MỤC') || headerUpper.includes('CATEGORY')) {
          autoMapping['category'] = index.toString();
        } else if (headerUpper.includes('QUY CÁCH') || headerUpper.includes('SPECIFICATIONS')) {
          autoMapping['specifications'] = index.toString();
        } else if (headerUpper.includes('GIÁ GỐC') || headerUpper.includes('GIA GOC')) {
          autoMapping['cost_price'] = index.toString();
        } else if (headerUpper.includes('GIÁ BÁN') || headerUpper.includes('GIA BAN')) {
          autoMapping['price'] = index.toString();
        } else if (headerUpper.includes('MÔ TẢ') || headerUpper.includes('DESCRIPTION')) {
          autoMapping['description'] = index.toString();
        }
      });
      setMapping(autoMapping);

    } catch (error) {
      toast.error('Lỗi khi tải dữ liệu preview');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    // Validate required fields
    const requiredFields = DATABASE_FIELDS.filter(field => field.required);
    const missingFields = requiredFields.filter(field => !mapping[field.key] || mapping[field.key] === "none");
    
    if (missingFields.length > 0) {
      toast.error(`Các trường bắt buộc chưa được map: ${missingFields.map(f => f.label).join(', ')}`);
      return;
    }

    setIsImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-products', {
        body: {
          googleSheetsUrl,
          priceListId,
          columnMapping: mapping
        }
      });

      if (error) throw error;

      toast.success(data.message || 'Import thành công!');
      onImportComplete();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi import sản phẩm');
      console.error('Import error:', error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cấu hình import sản phẩm</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!dataLoaded && (
            <div className="text-center">
              <Button onClick={loadPreviewData} disabled={isLoading}>
                {isLoading ? 'Đang tải...' : 'Tải dữ liệu preview'}
              </Button>
            </div>
          )}

          {dataLoaded && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Preview dữ liệu từ Google Sheets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-border">
                      <thead>
                        <tr>
                          {headers.map((header, index) => (
                            <th key={index} className="border border-border p-2 bg-muted font-medium">
                              <div className="text-xs text-muted-foreground">Cột {index}</div>
                              <div className="font-medium">{header}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sampleData.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex} className="border border-border p-2 text-sm">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Mapping các cột</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {DATABASE_FIELDS.map((field) => (
                      <div key={field.key} className="space-y-2">
                        <Label htmlFor={field.key}>
                          {field.label} {field.required && <span className="text-destructive">*</span>}
                        </Label>
                        <Select 
                          value={mapping[field.key] || "none"} 
                          onValueChange={(value) => setMapping(prev => ({ ...prev, [field.key]: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn cột từ Google Sheets" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">-- Không map --</SelectItem>
                            {headers.map((header, index) => (
                              <SelectItem key={index} value={index.toString()}>
                                Cột {index}: {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Hủy
                </Button>
                <Button onClick={handleImport} disabled={isImporting}>
                  {isImporting ? 'Đang import...' : 'Import sản phẩm'}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}