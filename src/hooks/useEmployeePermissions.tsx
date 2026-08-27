import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

export type PermissionType = 
  | 'dashboard'
  | 'customers'
  | 'products'
  | 'quotes'
  | 'orders'
  | 'cash_flow'
  | 'transactions'
  | 'reports'
  | 'user_management'
  | 'quote_supplement'
  | 'customer_care'
  | 'fabric_management'
  | 'ghn_tracking'
  | 'quote_approval'
  | 'knowledge_base'
  | 'contracts'
  | 'shipping_companies'
  | 'cost_transactions'
  | 'cost_categories'
  | 'cost_centers'
  | 'cost_objects'
  | 'transaction_types'
  | 'cost_transaction_confirm'
  | 'cost_transaction_void'
  | 'cost_audit'
  | 'inventory_view'
  | 'inventory_items'
  | 'inventory_documents'
  | 'inventory_confirm'
  | 'inventory_adjustment'
  | 'inventory_opening'
  | 'inventory_cost_view'
  | 'inventory_audit'
  | 'bom_view'
  | 'bom_manage'
  | 'bom_approve'
  | 'cutting_profiles'
  | 'cutting_approve'
  | 'production_view'
  | 'production_manage'
  | 'production_release'
  | 'production_complete'
  | 'production_operations'
  | 'production_worker_manage';

export interface EmployeePermission {
  permission_type: PermissionType;
  enabled: boolean;
}

export const useEmployeePermissions = (user: User | null, userRole: string | null) => {
  const [permissions, setPermissions] = useState<EmployeePermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!user || (userRole !== 'employee' && userRole !== 'accountant')) {
        setPermissions([]);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('employee_permissions')
          .select('permission_type, enabled')
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching permissions:', error);
          setPermissions([]);
        } else {
          setPermissions((data || []) as EmployeePermission[]);
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
        setPermissions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [user, userRole]);

  const hasPermission = (permissionType: PermissionType): boolean => {
    // Admin và manager có tất cả quyền
    if (userRole === 'admin' || userRole === 'manager') {
      return true;
    }

    // Kế toán và Employee kiểm tra quyền cụ thể
    if (userRole === 'accountant' || userRole === 'employee') {
      const permission = permissions.find(p => p.permission_type === permissionType);
      return permission?.enabled || false;
    }

    return false;
  };

  return {
    permissions,
    loading,
    hasPermission
  };
};
