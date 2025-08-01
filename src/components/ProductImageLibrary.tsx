import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Upload, Folder, Image, Trash2, Plus, FolderOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ProductImage {
  id: string;
  name: string;
  url: string;
  fullPath: string;
  category: string;
  size: number;
  uploaded_at: string;
}

interface ProductImageLibraryProps {
  onSelectImage: (imageUrl: string) => void;
  selectedCategory?: string;
}

const ProductImageLibrary = ({ onSelectImage, selectedCategory }: ProductImageLibraryProps) => {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [filteredImages, setFilteredImages] = useState<ProductImage[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadCategory, setUploadCategory] = useState(selectedCategory || '');
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchImages();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      setSelectedCategoryFilter(selectedCategory);
      setUploadCategory(selectedCategory);
    }
  }, [selectedCategory]);

  useEffect(() => {
    filterImages();
  }, [images, selectedCategoryFilter]);

  const fetchImages = async () => {
    try {
      const { data, error } = await supabase.storage
        .from('product-images')
        .list('', { limit: 1000 });

      if (error) throw error;

      if (data) {
        const imagePromises = data
          .filter(file => file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i))
          .map(async (file) => {
            const { data: urlData } = supabase.storage
              .from('product-images')
              .getPublicUrl(file.name);

            // Extract category from file path
            const pathParts = file.name.split('/');
            const category = pathParts.length > 1 ? pathParts[0] : 'Không phân loại';

            return {
              id: file.id || file.name,
              name: file.name,
              url: urlData.publicUrl,
              fullPath: file.name,
              category,
              size: file.metadata?.size || 0,
              uploaded_at: file.created_at || file.updated_at || '',
            };
          });

        const imageList = await Promise.all(imagePromises);
        setImages(imageList);

        // Extract unique categories
        const uniqueCategories = [...new Set(imageList.map(img => img.category))];
        setCategories(uniqueCategories);
      }
    } catch (error) {
      console.error('Error fetching images:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách hình ảnh",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterImages = () => {
    if (selectedCategoryFilter === 'all') {
      setFilteredImages(images);
    } else {
      setFilteredImages(images.filter(img => img.category === selectedCategoryFilter));
    }
  };

  const handleFileUpload = async (files: FileList) => {
    if (!files.length) return;

    const category = showNewCategoryInput ? newCategory : uploadCategory;
    if (!category) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn hoặc tạo thư mục",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${category}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        return fileName;
      });

      await Promise.all(uploadPromises);

      toast({
        title: "Thành công",
        description: `Đã tải lên ${files.length} hình ảnh`,
      });

      setShowUploadDialog(false);
      setNewCategory('');
      setShowNewCategoryInput(false);
      fetchImages();
    } catch (error) {
      console.error('Error uploading files:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải lên hình ảnh",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (imagePath: string) => {
    try {
      const { error } = await supabase.storage
        .from('product-images')
        .remove([imagePath]);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã xóa hình ảnh",
      });

      fetchImages();
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xóa hình ảnh",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Đang tải thư viện hình ảnh...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Image className="h-5 w-5" />
          Thư viện hình ảnh sản phẩm
        </h3>
        <Button onClick={() => setShowUploadDialog(true)} className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Tải lên hình ảnh
        </Button>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-4">
        <Label htmlFor="category-filter">Thư mục:</Label>
        <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Chọn thư mục" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả thư mục</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4" />
                  {category}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary">
          {filteredImages.length} hình ảnh
        </Badge>
      </div>

      {/* Image Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {filteredImages.map((image) => (
          <Card key={image.id} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-2">
              <div className="relative group">
                <img
                  src={image.url}
                  alt={image.name}
                  className="w-full h-24 object-cover rounded"
                  onClick={() => onSelectImage(image.url)}
                />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 rounded flex items-center justify-center transition-all">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteImage(image.fullPath);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 space-y-1">
                <p className="text-xs text-muted-foreground truncate" title={image.name}>
                  {image.name.split('/').pop()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(image.size)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredImages.length === 0 && (
        <div className="text-center py-8">
          <Image className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">
            {selectedCategoryFilter === 'all' 
              ? 'Chưa có hình ảnh nào trong thư viện'
              : `Chưa có hình ảnh nào trong thư mục "${selectedCategoryFilter}"`
            }
          </p>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tải lên hình ảnh sản phẩm</DialogTitle>
            <DialogDescription>
              Chọn thư mục và tải lên hình ảnh để tổ chức thư viện
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Thư mục</Label>
              <div className="flex gap-2">
                <Select 
                  value={showNewCategoryInput ? '' : uploadCategory} 
                  onValueChange={(value) => {
                    setUploadCategory(value);
                    setShowNewCategoryInput(false);
                  }}
                  disabled={showNewCategoryInput}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Chọn thư mục có sẵn" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        <div className="flex items-center gap-2">
                          <Folder className="h-4 w-4" />
                          {category}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewCategoryInput(!showNewCategoryInput)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {showNewCategoryInput && (
              <div className="space-y-2">
                <Label htmlFor="new-category">Tên thư mục mới</Label>
                <Input
                  id="new-category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Nhập tên thư mục mới"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="images">Chọn hình ảnh</Label>
              <Input
                id="images"
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files) {
                    handleFileUpload(e.target.files);
                  }
                }}
                disabled={uploading}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductImageLibrary;