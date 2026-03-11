import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContractTemplate {
  id: string;
  name: string;
  legal_basis: string[];
  seller_info: Record<string, string>;
  item_columns: { key: string; label: string }[];
  articles: { title: string; content: string }[];
  include_vat: boolean;
  vat_rate: number;
  payment_terms: {
    deposit_percentage: number;
    payment_stages: { name: string; percentage: number; description: string }[];
  };
  manager_id?: string;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

const defaultArticles = [
  { title: "ĐIỀU 1: NỘI DUNG HỢP ĐỒNG", content: "Bên A đồng ý cung cấp và Bên B đồng ý mua các sản phẩm/dịch vụ theo bảng chi tiết dưới đây:" },
  { title: "ĐIỀU 2: GIAO NHẬN", content: "- Địa điểm giao hàng: Theo địa chỉ Bên B cung cấp.\n- Thời gian giao hàng: Trong vòng 15-20 ngày làm việc kể từ ngày ký hợp đồng và nhận đặt cọc.\n- Bên A chịu trách nhiệm vận chuyển và lắp đặt tại địa điểm của Bên B." },
  { title: "ĐIỀU 3: PHƯƠNG THỨC THANH TOÁN", content: "- Đợt 1: Bên B thanh toán 70% giá trị hợp đồng ngay khi ký hợp đồng.\n- Đợt 2: Bên B thanh toán 30% còn lại sau khi Bên A hoàn thành giao hàng và lắp đặt.\n- Hình thức thanh toán: Tiền mặt hoặc chuyển khoản." },
  { title: "ĐIỀU 4: TRÁCH NHIỆM CỦA MỖI BÊN", content: "Bên A:\n- Cung cấp sản phẩm đúng chủng loại, số lượng, chất lượng.\n- Bảo hành sản phẩm theo quy định.\n- Hoàn trả tiền cọc nếu không thực hiện được hợp đồng.\n\nBên B:\n- Thanh toán đầy đủ, đúng hạn theo hợp đồng.\n- Tạo điều kiện để Bên A giao hàng và lắp đặt.\n- Kiểm tra hàng hóa khi nhận và ký biên bản nghiệm thu." },
  { title: "ĐIỀU 5: BẤT KHẢ KHÁNG", content: "Trong trường hợp bất khả kháng (thiên tai, dịch bệnh, chiến tranh...), bên bị ảnh hưởng được miễn trách nhiệm thực hiện hợp đồng trong thời gian xảy ra sự kiện bất khả kháng. Bên bị ảnh hưởng phải thông báo cho bên còn lại trong vòng 7 ngày." },
  { title: "ĐIỀU 6: GIẢI QUYẾT TRANH CHẤP", content: "Mọi tranh chấp phát sinh từ hợp đồng này sẽ được giải quyết thông qua thương lượng, hòa giải. Nếu không đạt được thỏa thuận, tranh chấp sẽ được đưa ra Tòa án nhân dân có thẩm quyền giải quyết." },
  { title: "ĐIỀU 7: ĐIỀU KHOẢN CHUNG", content: "- Hợp đồng có hiệu lực kể từ ngày ký.\n- Hợp đồng được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.\n- Mọi sửa đổi, bổ sung hợp đồng phải được hai bên thống nhất bằng văn bản." },
];

export const useContractTemplates = () => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['contract_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_templates' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]).map(t => ({
        ...t,
        legal_basis: Array.isArray(t.legal_basis) ? t.legal_basis : [],
        seller_info: t.seller_info || {},
        item_columns: Array.isArray(t.item_columns) ? t.item_columns : [],
        articles: Array.isArray(t.articles) ? t.articles : defaultArticles,
        payment_terms: t.payment_terms || { deposit_percentage: 70, payment_stages: [] },
      })) as ContractTemplate[];
    },
  });
};

export const useCreateContractTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: Partial<ContractTemplate>) => {
      const { data, error } = await supabase
        .from('contract_templates' as any)
        .insert({
          name: template.name,
          legal_basis: template.legal_basis,
          seller_info: template.seller_info,
          item_columns: template.item_columns,
          articles: template.articles || defaultArticles,
          include_vat: template.include_vat ?? false,
          vat_rate: template.vat_rate ?? 8,
          payment_terms: template.payment_terms,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract_templates'] }),
  });
};

export const useUpdateContractTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { data, error } = await supabase
        .from('contract_templates' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract_templates'] }),
  });
};

export const useDeleteContractTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('contract_templates' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract_templates'] }),
  });
};

export { defaultArticles };
