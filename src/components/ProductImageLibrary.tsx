import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Upload, Folder, Image, Trash2, Plus, FolderOpen, Edit2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ProductImage {
  id: string;
  name: string;
  url: string;
  fullPath: string;
  category: string;
  displayCategory?: string; // Tên hiển thị gốc của thư mục
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
  const [categories, setCategories] = useState<{safeName: string, displayName: string}[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadCategory, setUploadCategory] = useState(selectedCategory || '');
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [showRenameCategoryDialog, setShowRenameCategoryDialog] = useState(false);
  const [categoryToRename, setCategoryToRename] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renamingCategory, setRenamingCategory] = useState(false);
  const [categoryDisplayNames, setCategoryDisplayNames] = useState<{[key: string]: string}>({});
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
      // Get all files recursively from the bucket
      const { data, error } = await supabase.storage
        .from('product-images')
        .list('', { 
          limit: 1000, 
          offset: 0,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (error) throw error;

      // Get files from all subdirectories
      const allFiles: ProductImage[] = [];
      const categoryMap: {[key: string]: string} = {};

      if (data) {
        // First get top-level files
        const topLevelFiles = data.filter(item => item.name && item.name.match(/\.(jpg|jpeg|png|gif|webp)$/i));
        
        for (const file of topLevelFiles) {
          const { data: urlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(file.name);

          allFiles.push({
            id: file.id || file.name,
            name: file.name,
            url: urlData.publicUrl,
            fullPath: file.name,
            category: 'Không phân loại',
            displayCategory: 'Không phân loại',
            size: file.metadata?.size || 0,
            uploaded_at: file.created_at || file.updated_at || '',
          });
        }

        // Then get files from subdirectories
        const directories = data.filter(item => !item.name.includes('.'));
        
        for (const dir of directories) {
          // Try to get display name from localStorage or use folder name
          const storedDisplayNames = localStorage.getItem('categoryDisplayNames');
          const displayNamesMap = storedDisplayNames ? JSON.parse(storedDisplayNames) : {};
          const displayName = displayNamesMap[dir.name] || dir.name;
          
          categoryMap[dir.name] = displayName;
          
          const { data: subFiles } = await supabase.storage
            .from('product-images')
            .list(dir.name, { limit: 1000 });

          if (subFiles) {
            for (const file of subFiles.filter(f => f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
              const fullPath = `${dir.name}/${file.name}`;
              const { data: urlData } = supabase.storage
                .from('product-images')
                .getPublicUrl(fullPath);

              allFiles.push({
                id: file.id || fullPath,
                name: file.name,
                url: urlData.publicUrl,
                fullPath: fullPath,
                category: dir.name,
                displayCategory: displayName,
                size: file.metadata?.size || 0,
                uploaded_at: file.created_at || file.updated_at || '',
              });
            }
          }
        }
      }

      setImages(allFiles);
      setCategoryDisplayNames(categoryMap);
      
      // Set categories with both safe name and display name
      const uniqueCategories = Object.keys(categoryMap).map(safeName => ({
        safeName,
        displayName: categoryMap[safeName]
      }));
      setCategories(uniqueCategories);
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

  const sanitizeFolderName = (name: string) => {
    return name
      .replace(/[^\w\-_.]/g, '_') // Replace special chars with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
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
    
    const sanitizedCategory = sanitizeFolderName(category);
    
    // Save display name to localStorage
    const storedDisplayNames = localStorage.getItem('categoryDisplayNames');
    const displayNamesMap = storedDisplayNames ? JSON.parse(storedDisplayNames) : {};
    displayNamesMap[sanitizedCategory] = category; // Save original name as display name
    localStorage.setItem('categoryDisplayNames', JSON.stringify(displayNamesMap));

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${sanitizedCategory}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

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

  const handleRenameCategory = async () => {
    if (!categoryToRename || !newCategoryName) return;

    const sanitizedNewName = sanitizeFolderName(newCategoryName);
    
    // Check if new name is the same as old name
    if (sanitizedNewName === categoryToRename) {
      toast({
        title: "Thông báo",
        description: "Tên thư mục mới giống tên cũ",
        variant: "destructive",
      });
      return;
    }

    setRenamingCategory(true);

    try {
      // Get all files in the old category
      const filesToMove = images.filter(img => img.category === categoryToRename);
      
      // Move each file to the new category folder
      for (const file of filesToMove) {
        const fileName = file.name;
        const newPath = `${sanitizedNewName}/${fileName}`;
        
        // Download the file
        const { data: fileData } = await supabase.storage
          .from('product-images')
          .download(file.fullPath);

        if (fileData) {
          // Upload to new location with upsert: true to overwrite if exists
          const { error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(newPath, fileData, {
              upsert: true,
              cacheControl: '3600'
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            throw uploadError;
          }

          // Delete old file after successful upload
          const { error: deleteError } = await supabase.storage
            .from('product-images')
            .remove([file.fullPath]);

          if (deleteError) {
            console.error('Delete error:', deleteError);
            // Continue with other files even if delete fails
          }
        }
      }

      toast({
        title: "Thành công",
        description: `Đã đổi tên thư mục từ "${categoryToRename}" thành "${sanitizedNewName}"`,
      });

      setShowRenameCategoryDialog(false);
      setCategoryToRename('');
      setNewCategoryName('');
      fetchImages();
    } catch (error) {
      console.error('Error renaming category:', error);
      toast({
        title: "Lỗi",
        description: "Không thể đổi tên thư mục",
        variant: "destructive",
      });
    } finally {
      setRenamingCategory(false);
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

      {/* Category Filter with Rename Option */}
      <div className="flex items-center gap-4">
        <Label htmlFor="category-filter">Thư mục:</Label>
        <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Chọn thư mục" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả thư mục</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.safeName} value={category.safeName}>
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4" />
                  {category.displayName}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedCategoryFilter !== 'all' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCategoryToRename(selectedCategoryFilter);
              const displayName = categoryDisplayNames[selectedCategoryFilter] || selectedCategoryFilter;
              setNewCategoryName(displayName);
              setShowRenameCategoryDialog(true);
            }}
          >
            <Edit2 className="h-4 w-4 mr-1" />
            Sửa tên
          </Button>
        )}
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
              : `Chưa có hình ảnh nào trong thư mục "${categoryDisplayNames[selectedCategoryFilter] || selectedCategoryFilter}"`
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
                      <SelectItem key={category.safeName} value={category.safeName}>
                        <div className="flex items-center gap-2">
                          <Folder className="h-4 w-4" />
                          {category.displayName}
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
                disabled={uploading}
              />
              <Button
                onClick={() => {
                  const input = document.getElementById('images') as HTMLInputElement;
                  if (input && input.files) {
                    handleFileUpload(input.files);
                  }
                }}
                disabled={uploading || (!uploadCategory && !showNewCategoryInput) || (showNewCategoryInput && !newCategory)}
                className="w-full"
              >
                {uploading ? "Đang tải lên..." : "Tải lên hình ảnh"}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Category Dialog */}
      <Dialog open={showRenameCategoryDialog} onOpenChange={setShowRenameCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa tên thư mục</DialogTitle>
            <DialogDescription>
              Đổi tên thư mục "{categoryDisplayNames[categoryToRename] || categoryToRename}" và di chuyển tất cả hình ảnh
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rename-category">Tên thư mục mới</Label>
              <Input
                id="rename-category"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Nhập tên thư mục mới"
                disabled={renamingCategory}
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowRenameCategoryDialog(false)}
              disabled={renamingCategory}
            >
              Hủy
            </Button>
            <Button 
              onClick={handleRenameCategory}
              disabled={renamingCategory || !newCategoryName || newCategoryName === categoryToRename}
            >
              {renamingCategory ? "Đang đổi tên..." : "Đổi tên"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductImageLibrary;