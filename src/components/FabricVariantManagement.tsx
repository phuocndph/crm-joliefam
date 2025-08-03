import React, { useState } from 'react';
import { Plus, Edit, Trash2, Palette, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CurrencyInput } from '@/components/ui/currency-input';
import { 
  useFabricVariants, 
  useFabricTypes, 
  useFabricWidths, 
  useCreateFabricVariant 
} from '@/hooks/useFabrics';
import { toast } from '@/hooks/use-toast';

export const FabricVariantManagement = () => {
  const { data: fabricVariants = [] } = useFabricVariants();
  const { data: fabricTypes = [] } = useFabricTypes();
  const { data: fabricWidths = [] } = useFabricWidths();
  const createFabricVariant = useCreateFabricVariant();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');
  const [formData, setFormData] = useState({
    fabric_type_id: '',
    variant_name: '',
    fabric_width_id: '',
    width_code: '',
    weight: '',
    color: '',
    origin: 'TQ',
    unit: 'kg',
    cost_price: 0,
    selling_price: 0
  });

  // Filter variants
  const filteredVariants = fabricVariants.filter(variant => {
    const matchesSearch = searchTerm === '' || 
      variant.variant_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      variant.color?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      variant.width_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      variant.fabric_types?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = selectedTypeFilter === 'all' || variant.fabric_type_id === selectedTypeFilter;
    
    return matchesSearch && matchesType;
  });

  const handleSubmit = async () => {
    if (!formData.fabric_type_id || !formData.variant_name.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập đầy đủ thông tin bắt buộc", variant: "destructive" });
      return;
    }

    try {
      await createFabricVariant.mutateAsync(formData);
      setFormData({
        fabric_type_id: '',
        variant_name: '',
        fabric_width_id: '',
        width_code: '',
        weight: '',
        color: '',
        origin: 'TQ',
        unit: 'kg',
        cost_price: 0,
        selling_price: 0
      });
      setShowCreateDialog(false);
      toast({ title: "Thành công", description: "Đã thêm biến thể vải mới" });
    } catch (error) {
      console.error('Error:', error);
      toast({ title: "Lỗi", description: "Không thể thêm biến thể vải", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({
      fabric_type_id: '',
      variant_name: '',
      fabric_width_id: '',
      width_code: '',
      weight: '',
      color: '',
      origin: 'TQ',
      unit: 'kg',
      cost_price: 0,
      selling_price: 0
    });
    setShowCreateDialog(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Quản lý biến thể vải
            </CardTitle>
            <CardDescription>
              Tạo và quản lý các biến thể vải với thông tin chi tiết
            </CardDescription>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={(open) => {
            if (!open) resetForm();
            setShowCreateDialog(open);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Thêm biến thể vải
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Thêm biến thể vải mới</DialogTitle>
                <DialogDescription>
                  Nhập thông tin chi tiết cho biến thể vải mới
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fabric_type_id">Loại vải *</Label>
                  <Select value={formData.fabric_type_id} onValueChange={(value) => setFormData(prev => ({ ...prev, fabric_type_id: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn loại vải" />
                    </SelectTrigger>
                    <SelectContent>
                      {fabricTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="variant_name">Tên biến thể *</Label>
                  <Input
                    id="variant_name"
                    value={formData.variant_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, variant_name: e.target.value }))}
                    placeholder="Ví dụ: T300, C180, P250..."
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="width_code">Khổ vải</Label>
                  <Input
                    id="width_code"
                    value={formData.width_code}
                    onChange={(e) => setFormData(prev => ({ ...prev, width_code: e.target.value }))}
                    placeholder="Ví dụ: K150, K260..."
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="color">Màu sắc</Label>
                  <Input
                    id="color"
                    value={formData.color}
                    onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    placeholder="Ví dụ: Trắng, Xám, Đen..."
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="weight">Trọng lượng</Label>
                  <Input
                    id="weight"
                    value={formData.weight}
                    onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                    placeholder="Ví dụ: 200g/m²"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="origin">Xuất xứ</Label>
                  <Select value={formData.origin} onValueChange={(value) => setFormData(prev => ({ ...prev, origin: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TQ">Trung Quốc</SelectItem>
                      <SelectItem value="VN">Việt Nam</SelectItem>
                      <SelectItem value="KR">Hàn Quốc</SelectItem>
                      <SelectItem value="JP">Nhật Bản</SelectItem>
                      <SelectItem value="US">Mỹ</SelectItem>
                      <SelectItem value="OTHER">Khác</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="unit">Đơn vị tính</Label>
                  <Select value={formData.unit} onValueChange={(value) => setFormData(prev => ({ ...prev, unit: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">Kilogram (kg)</SelectItem>
                      <SelectItem value="m">Mét (m)</SelectItem>
                      <SelectItem value="yard">Yard</SelectItem>
                      <SelectItem value="roll">Cuộn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="cost_price">Giá vốn</Label>
                  <CurrencyInput
                    value={formData.cost_price}
                    onChange={(value) => setFormData(prev => ({ ...prev, cost_price: value || 0 }))}
                    placeholder="Nhập giá vốn"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="selling_price">Giá bán</Label>
                  <CurrencyInput
                    value={formData.selling_price}
                    onChange={(value) => setFormData(prev => ({ ...prev, selling_price: value || 0 }))}
                    placeholder="Nhập giá bán"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 mt-6">
                <Button variant="outline" onClick={resetForm}>
                  Hủy
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  disabled={createFabricVariant.isPending}
                >
                  {createFabricVariant.isPending ? "Đang xử lý..." : "Thêm mới"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search and Filter */}
        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm biến thể vải..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedTypeFilter} onValueChange={setSelectedTypeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại vải</SelectItem>
              {fabricTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Variants Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loại vải</TableHead>
                <TableHead>Tên biến thể</TableHead>
                <TableHead>Màu sắc</TableHead>
                <TableHead>Khổ vải</TableHead>
                <TableHead>Trọng lượng</TableHead>
                <TableHead>Xuất xứ</TableHead>
                <TableHead>Giá vốn</TableHead>
                <TableHead>Giá bán</TableHead>
                <TableHead>Đơn vị</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVariants.length > 0 ? (
                filteredVariants.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell className="font-medium">
                      <Badge variant="outline">
                        {variant.fabric_types?.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{variant.variant_name}</TableCell>
                    <TableCell>
                      {variant.color ? (
                        <span className="inline-flex items-center gap-2">
                          <div 
                            className="w-4 h-4 rounded-full border"
                            style={{ backgroundColor: variant.color.toLowerCase() === 'white' || variant.color.toLowerCase() === 'trắng' ? '#ffffff' : 
                                     variant.color.toLowerCase() === 'black' || variant.color.toLowerCase() === 'đen' ? '#000000' :
                                     variant.color.toLowerCase() === 'gray' || variant.color.toLowerCase() === 'xám' ? '#808080' : '#e5e5e5' }}
                          ></div>
                          {variant.color}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {variant.width_code ? (
                        <Badge variant="secondary" className="font-mono">
                          {variant.width_code}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{variant.weight || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {variant.origin}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {variant.cost_price > 0 ? formatCurrency(variant.cost_price) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {variant.selling_price > 0 ? formatCurrency(variant.selling_price) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{variant.unit}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {searchTerm || selectedTypeFilter !== 'all' 
                      ? 'Không tìm thấy biến thể vải nào phù hợp'
                      : 'Chưa có biến thể vải nào. Hãy thêm biến thể đầu tiên!'
                    }
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};