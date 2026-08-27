import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CreateCustomerFormProps {
  onClose: () => void;
  onSubmit: () => void;
}

export function CreateCustomerForm({ onClose, onSubmit }: CreateCustomerFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    address: "",
    notes: "",
  });
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Lỗi",
        description: "Tên khách hàng là bắt buộc",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Check for duplicate customer name (case-insensitive)
      const { data: existingCustomers, error: checkError } = await supabase
        .from('customers')
        .select('id, name');

      if (checkError) {
        console.error('Error checking duplicate:', checkError);
        toast({
          title: "Lỗi",
          description: "Không thể kiểm tra tên khách hàng",
          variant: "destructive",
        });
        return;
      }

      // Check for exact match after trimming and normalizing case
      const normalizedName = formData.name.trim().toLowerCase();
      const duplicateExists = existingCustomers?.some(customer => 
        customer.name.trim().toLowerCase() === normalizedName
      );

      if (duplicateExists) {
        toast({
          title: "Lỗi",
          description: "Tên khách hàng đã tồn tại, vui lòng chọn tên khác",
          variant: "destructive",
        });
        return;
      }
      
      const customerData = {
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        company: formData.company.trim() || null,
        address: formData.address.trim() || null,
        notes: formData.notes.trim() || null,
        tags: tags.length > 0 ? tags : null,
        tenant_id: "default",
        manager_id: user?.id || null,
      };

      const { error } = await supabase
        .from("customers")
        .insert([customerData]);

      if (error) throw error;

      onSubmit();
    } catch (error) {
      console.error("Error creating customer:", error);
      toast({
        title: "Lỗi",
        description: "Không thể tạo khách hàng",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Tên khách hàng *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            placeholder="Nhập tên khách hàng"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange("email", e.target.value)}
            placeholder="email@example.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Điện thoại</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => handleInputChange("phone", e.target.value)}
            placeholder="0987654321"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company">Công ty</Label>
          <Input
            id="company"
            value={formData.company}
            onChange={(e) => handleInputChange("company", e.target.value)}
            placeholder="Tên công ty"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Địa chỉ</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) => handleInputChange("address", e.target.value)}
          placeholder="Địa chỉ đầy đủ"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">Tags</Label>
        <div className="flex gap-2">
          <Input
            id="tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Nhập tag và nhấn Enter"
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button type="button" onClick={addTag} variant="outline">
            Thêm
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {tags.map((tag, index) => (
              <Badge key={index} variant="secondary" className="gap-1">
                {tag}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 hover:bg-transparent"
                  onClick={() => removeTag(tag)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Ghi chú</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleInputChange("notes", e.target.value)}
          placeholder="Ghi chú về khách hàng..."
          rows={3}
        />
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Đang tạo..." : "Tạo khách hàng"}
        </Button>
      </div>
    </form>
  );
}