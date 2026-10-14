import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { listPayrollCapabilities } from '@/lib/payroll-master-data';
import type { PayrollCapability, PayrollPermissionType } from '@/integrations/supabase/production-execution-types';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';

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
  | 'production_sales_submit'
  | 'production_sales_workflow'
  | 'production_cutting_plan'
  | 'production_worker_manage'
  | 'production_attendance_approve'
  | PayrollPermissionType;

export interface EmployeePermission {
  permission_type: PermissionType;
  enabled: boolean;
}

export const useEmployeePermissions = (user: User | null, userRole: string | null) => {
  const localMode = isLocalBackend();
  const [permissions, setPermissions] = useState<EmployeePermission[]>([]);
  const [payrollCapabilities, setPayrollCapabilities] = useState<PayrollCapability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (localMode) {
        if (!user || !userRole) {
          setPermissions([]);
          setPayrollCapabilities([]);
          setLoading(false);
          return;
        }
        setLoading(true);
        Promise.all([
          localApi.employeePermissions(user.id),
          localApi.payrollCapabilities(user.id),
        ]).then(([generic, payroll]) => {
          setPermissions(generic.map((item) => ({ permission_type: item.permission_type as PermissionType, enabled: item.enabled })));
          setPayrollCapabilities(payroll as unknown as PayrollCapability[]);
        }).catch((error) => {
          console.error('Error fetching local permissions:', error);
          setPermissions([]);
          setPayrollCapabilities([]);
        }).finally(() => setLoading(false));
        return;
      }
      if (!user || !userRole) {
        setPermissions([]);
        setPayrollCapabilities([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // `team_leader` is a local PostgreSQL role; never query the public
        // Supabase permission tables for it.
        const genericPermissionsPromise = userRole === 'employee' || userRole === 'accountant'
          ? supabase
              .from('employee_permissions')
              .select('permission_type, enabled')
              .eq('user_id', user.id)
          : Promise.resolve({ data: [], error: null });
        const [genericResult, payrollResult] = await Promise.allSettled([
          genericPermissionsPromise,
          listPayrollCapabilities(user.id),
        ]);

        if (genericResult.status === 'fulfilled' && !genericResult.value.error) {
          setPermissions((genericResult.value.data || []) as EmployeePermission[]);
        } else {
          console.error(
            'Error fetching permissions:',
            genericResult.status === 'rejected' ? genericResult.reason : genericResult.value.error,
          );
          setPermissions([]);
        }
        if (payrollResult.status === 'fulfilled') {
          setPayrollCapabilities(payrollResult.value);
        } else {
          console.error('Error fetching payroll capabilities:', payrollResult.reason);
          setPayrollCapabilities([]);
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
        setPermissions([]);
        setPayrollCapabilities([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [localMode, user, userRole]);

  const hasPermission = (permissionType: PermissionType): boolean => {
    if (userRole === 'admin' || userRole === 'manager') return true;
    if (permissionType.startsWith('payroll_')) {
      return payrollCapabilities.some(
        capability => capability.permission_type === permissionType && capability.allowed,
      );
    }

    // Kế toán và Employee kiểm tra quyền cụ thể
    if (userRole === 'accountant' || userRole === 'employee' || (localMode && userRole === 'team_leader')) {
      const permission = permissions.find(p => p.permission_type === permissionType);
      return permission?.enabled || false;
    }

    return false;
  };

  return {
    permissions,
    payrollCapabilities,
    loading,
    hasPermission
  };
};
