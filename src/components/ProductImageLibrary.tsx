import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Upload, Folder, Image, Trash2, Plus, FolderOpen, Edit2, Eye, X } from 'lucide-react';
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
  hideDeleteButton?: boolean; // Ẩn nút xóa khi chọn hình ảnh cho sản phẩm
}

const ProductImageLibrary = ({ onSelectImage, selectedCategory, hideDeleteButton = false }: ProductImageLibraryProps) => {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [filteredImages, setFilteredImages] = useState<ProductImage[]>([]);
  const [categories, setCategories] = useState<{safeName: string, displayName: string}[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false); // Track if data has been loaded
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
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<string>('');
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    // Only fetch if data hasn't been loaded yet
    if (!dataLoaded) {
      fetchImages();
    } else {
      // If data is already loaded, just set loading to false and filter images
      setLoading(false);
      filterImages();
    }
    
    // Add paste event listener
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      
      if (imageFiles.length > 0) {
        handleQuickUpload(imageFiles);
      }
    };
    
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [dataLoaded]);

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
          // Get display name from localStorage, fallback to folder name
          let displayName = dir.name;
          try {
            const storedDisplayNames = localStorage.getItem('categoryDisplayNames');
            const displayNamesMap = storedDisplayNames ? JSON.parse(storedDisplayNames) : {};
            displayName = displayNamesMap[dir.name] || dir.name;
          } catch (error) {
            console.error('Error loading category display names:', error);
          }
          
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
      
      // Mark data as loaded
      setDataLoaded(true);
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
    // Convert Vietnamese characters to ASCII equivalents for storage
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/đ/g, 'd').replace(/Đ/g, 'D') // Handle đ/Đ specifically
      .replace(/[^a-zA-Z0-9\-_.]/g, '_') // Replace special chars with underscore
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
    
    // Use sanitized name for storage, original for display
    const sanitizedCategory = sanitizeFolderName(category);
    const folderName = sanitizedCategory;
    
    // Save display name mapping to localStorage
    try {
      const storedDisplayNames = localStorage.getItem('categoryDisplayNames');
      const displayNamesMap = storedDisplayNames ? JSON.parse(storedDisplayNames) : {};
      displayNamesMap[sanitizedCategory] = category; // Map sanitized name to original display name
      localStorage.setItem('categoryDisplayNames', JSON.stringify(displayNamesMap));
    } catch (error) {
      console.error('Error saving category display names:', error);
    }

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${folderName}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

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
      fetchImages(); // Refresh data after upload and update cache
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

  // Quick upload function for drag & drop and paste
  const handleQuickUpload = async (files: File[]) => {
    if (!files.length) return;

    // Use current selected category or default
    let targetCategory = selectedCategoryFilter !== 'all' ? selectedCategoryFilter : '';
    
    // If no category selected, store files and show dialog to select
    if (!targetCategory) {
      setPendingFiles(files);
      setShowUploadDialog(true);
      return;
    }

    setUploading(true);
    
    // Use the existing category
    const folderName = targetCategory;

    try {
      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${folderName}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        return fileName;
      });

      await Promise.all(uploadPromises);

      toast({
        title: "Thành công",
        description: `Đã tải lên ${files.length} hình ảnh vào thư mục "${categoryDisplayNames[targetCategory] || targetCategory}"`,
      });

      fetchImages(); // Refresh data after quick upload and update cache
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

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    );

    if (files.length > 0) {
      handleQuickUpload(files);
    }
  };

  const confirmDeleteImage = (imagePath: string) => {
    setImageToDelete(imagePath);
    setShowDeleteDialog(true);
  };

  const handleDeleteImage = async () => {
    try {
      const { error } = await supabase.storage
        .from('product-images')
        .remove([imageToDelete]);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã xóa hình ảnh",
      });

      setShowDeleteDialog(false);
      setImageToDelete('');
      fetchImages(); // Refresh data after deletion and update cache
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xóa hình ảnh",
        variant: "destructive",
      });
    }
  };

  const handleImageClick = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl);
    setShowImageViewer(true);
  };

  const handleRenameCategory = async () => {
    if (!categoryToRename || !newCategoryName) return;

    // Sanitize new name for storage
    const sanitizedNewName = sanitizeFolderName(newCategoryName);
    const newFolderName = sanitizedNewName;
    
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
        const newPath = `${newFolderName}/${fileName}`;
        
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
        description: `Đã đổi tên thư mục từ "${categoryDisplayNames[categoryToRename] || categoryToRename}" thành "${newCategoryName}"`,
      });

      // Update display names in localStorage
      try {
        const storedDisplayNames = localStorage.getItem('categoryDisplayNames');
        const displayNamesMap = storedDisplayNames ? JSON.parse(storedDisplayNames) : {};
        displayNamesMap[sanitizedNewName] = newCategoryName; // Save new display name
        delete displayNamesMap[categoryToRename]; // Remove old display name
        localStorage.setItem('categoryDisplayNames', JSON.stringify(displayNamesMap));
      } catch (error) {
        console.error('Error updating category display names:', error);
      }

      setShowRenameCategoryDialog(false);
      setCategoryToRename('');
      setNewCategoryName('');
      fetchImages(); // Refresh data after rename and update cache
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
    <div 
      className={`space-y-4 relative ${isDragOver ? 'bg-blue-50 border-2 border-dashed border-blue-400 rounded-lg' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-100/80 border-2 border-dashed border-blue-400 rounded-lg z-50 flex items-center justify-center">
          <div className="text-center">
            <Upload className="h-12 w-12 text-blue-500 mx-auto mb-2" />
            <p className="text-lg font-semibold text-blue-700">Thả hình ảnh vào đây</p>
            <p className="text-sm text-blue-600">
              {selectedCategoryFilter !== 'all' 
                ? `Sẽ tải lên vào thư mục "${categoryDisplayNames[selectedCategoryFilter] || selectedCategoryFilter}"`
                : 'Sẽ mở hộp thoại chọn thư mục'
              }
            </p>
          </div>
        </div>
      )}
      
      {/* Instructions */}
      <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
        💡 <strong>Mẹo:</strong> Bạn có thể kéo thả hình ảnh trực tiếp vào đây hoặc dùng <kbd className="px-1.5 py-0.5 bg-muted text-xs rounded">Ctrl+V</kbd> để dán hình ảnh từ clipboard
      </div>
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
            <SelectItem value="all">Tất cả</SelectItem>
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
          <Card 
            key={image.id} 
            className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-blue-400"
            onClick={() => onSelectImage(image.url)}
          >
            <CardContent className="p-2">
              <div className="relative group">
                <img
                  src={image.url}
                  alt={image.name}
                  className="w-full h-32 object-contain bg-muted rounded"
                />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 rounded flex items-center justify-center gap-2 transition-all">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleImageClick(image.url);
                    }}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                  {!hideDeleteButton && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDeleteImage(image.fullPath);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
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
              {pendingFiles.length > 0 ? (
                <div className="space-y-2">
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <p className="text-sm font-medium text-blue-700 mb-2">
                      📁 {pendingFiles.length} hình ảnh đã sẵn sàng:
                    </p>
                    <div className="space-y-1">
                      {pendingFiles.map((file, index) => (
                        <div key={index} className="text-xs text-blue-600 flex items-center gap-2">
                          <Image className="h-3 w-3" />
                          {file.name} ({formatFileSize(file.size)})
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      const category = showNewCategoryInput ? newCategory : uploadCategory;
                      if (category && pendingFiles.length > 0) {
                        const fileList = new DataTransfer();
                        pendingFiles.forEach(file => fileList.items.add(file));
                        handleFileUpload(fileList.files);
                        setPendingFiles([]);
                      }
                    }}
                    disabled={uploading || (!uploadCategory && !showNewCategoryInput) || (showNewCategoryInput && !newCategory)}
                    className="w-full"
                  >
                    {uploading ? "Đang tải lên..." : "Tải lên hình ảnh"}
                  </Button>
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowUploadDialog(false);
                setPendingFiles([]);
              }}
            >
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa hình ảnh</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa hình ảnh này không? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteDialog(false)}>
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteImage}>
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Viewer Dialog */}
      <Dialog open={showImageViewer} onOpenChange={setShowImageViewer}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <div className="relative">
            <img
              src={selectedImageUrl}
              alt="Xem hình ảnh"
              className="w-full h-auto max-h-[85vh] object-contain"
            />
            <Button
              variant="secondary"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => setShowImageViewer(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductImageLibrary;