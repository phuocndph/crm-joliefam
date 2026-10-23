import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { listPayrollCapabilities } from '@/lib/payroll-master-data';
import type { PayrollCapability, PayrollPermissionType } from '@/integrations/supabase/production-execution-types';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';
import { listenPermissionRefresh } from '@/lib/permission-refresh';
import { captureLocalAuthGuard, type LocalAuthGuard } from '@/lib/local-auth';

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
  const userId = user?.id;
  const [permissions, setPermissions] = useState<EmployeePermission[]>([]);
  const [payrollCapabilities, setPayrollCapabilities] = useState<PayrollCapability[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [loadedIdentity, setLoadedIdentity] = useState('');
  const [payrollIdentity, setPayrollIdentity] = useState('');
  const [permissionDataIdentity, setPermissionDataIdentity] = useState('');
  const identity = `${localMode}:${userId || ''}:${userRole || ''}`;
  const authorization = useRef<{identity: string; guard: LocalAuthGuard} | null>(null);
  const hardRefresh = useRef(true);
  const refreshGeneration = useRef(0);
  useEffect(() => listenPermissionRefresh(reason => {
    refreshGeneration.current++;
    // Navigation pin pruning must wait for the new permission read, including
    // a foreground refresh that otherwise retains the last display state.
    setPermissionDataIdentity('');
    if (reason === 'permissions-changed' || !localMode) {
      hardRefresh.current = true; authorization.current = null;
      setPermissions([]); setPayrollCapabilities([]); setLoadedIdentity(''); setPayrollIdentity(''); setPermissionDataIdentity(''); setLoading(true);
    }
    setRevision(value => value + 1);
  }), [localMode]);

  useEffect(() => {
    let cancelled = false;
    const request = refreshGeneration.current;
    const current = () => !cancelled && request === refreshGeneration.current;
    const fetchPermissions = async () => {
      if (localMode) {
        if (!userId || !userRole) {
          authorization.current = null; hardRefresh.current = true;
          setPermissions([]);
          setPayrollCapabilities([]);
          setPermissionDataIdentity('');
          setLoading(false);
          return;
        }
        let retain = !hardRefresh.current && authorization.current?.identity === identity;
        try { authorization.current?.guard.assertCurrent(); } catch { retain = false; }
        if (!retain) { setLoading(true); setPermissions([]); setPayrollCapabilities([]); setLoadedIdentity(''); setPayrollIdentity(''); setPermissionDataIdentity(''); }
        try {
          const guard = await captureLocalAuthGuard(userId);
          guard.assertCurrent();
          const [generic, payroll] = await Promise.all([localApi.employeePermissions(userId), localApi.payrollCapabilities(userId)]);
          guard.assertCurrent();
          if (current()) {
            setPermissions(generic.map(item => ({ permission_type: item.permission_type as PermissionType, enabled: item.enabled })));
            setPayrollCapabilities(payroll as unknown as PayrollCapability[]);
            setLoadedIdentity(identity); setPayrollIdentity(identity);
            setPermissionDataIdentity(identity);
            authorization.current = {identity, guard}; hardRefresh.current = false;
          }
        } catch {
          if (current()) { authorization.current = null; hardRefresh.current = true; setPermissions([]); setPayrollCapabilities([]); setLoadedIdentity(''); setPayrollIdentity(''); setPermissionDataIdentity(''); }
        } finally { if (current()) setLoading(false); }
        return;
      }
      if (!userId || !userRole) {
        setPermissions([]);
        setPayrollCapabilities([]);
        setPermissionDataIdentity('');
        setLoading(false);
        return;
      }

      setLoading(true);
      setPermissionDataIdentity('');
      try {
        // `team_leader` is a local PostgreSQL role; never query the public
        // Supabase permission tables for it.
        const genericPermissionsPromise = userRole === 'employee' || userRole === 'accountant'
          ? supabase
              .from('employee_permissions')
              .select('permission_type, enabled')
              .eq('user_id', userId)
          : Promise.resolve({ data: [], error: null });
        let genericSucceeded = false;
        let payrollSucceeded = false;
        const markPermissionDataResolved = () => {
          if (current() && genericSucceeded && payrollSucceeded) setPermissionDataIdentity(identity);
        };
        void listPayrollCapabilities(userId).then(data => {
          if (current()) {
            setPayrollCapabilities(data); setPayrollIdentity(identity);
            payrollSucceeded = true; markPermissionDataResolved();
          }
        }).catch(() => {
          if (current()) { setPayrollCapabilities([]); setPayrollIdentity(identity); }
        });
        const genericResult = await genericPermissionsPromise;
        if (cancelled) return;

        if (genericResult.error) {
          console.error(
            'Error fetching permissions:',
            genericResult.error,
          );
          setPermissions([]);
        } else {
          setPermissions((genericResult.data || []) as EmployeePermission[]);
          genericSucceeded = true; markPermissionDataResolved();
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Error fetching permissions:', error);
        setPermissions([]);
      } finally {
        if (!cancelled) { setLoadedIdentity(identity); setLoading(false); }
      }
    };

    void fetchPermissions();
    return () => { cancelled = true; };
  }, [identity, localMode, userId, userRole, revision]);

  const hasPermission = (permissionType: PermissionType): boolean => {
    if (permissionType.startsWith('payroll_')) {
      return payrollIdentity === identity && payrollCapabilities.some(
        capability => capability.permission_type === permissionType && capability.allowed,
      );
    }
    if (userRole === 'admin' || userRole === 'manager') return true;

    // Kế toán và Employee kiểm tra quyền cụ thể
    if (userRole === 'accountant' || userRole === 'employee' || (localMode && userRole === 'team_leader')) {
      const permission = permissions.find(p => p.permission_type === permissionType);
      return loadedIdentity === identity && (permission?.enabled || false);
    }

    return false;
  };

  return {
    permissions: loadedIdentity === identity ? permissions : [],
    payrollCapabilities: payrollIdentity === identity ? payrollCapabilities : [],
    loading,
    /** True only after the full generic + payroll permission read succeeded for this identity. */
    permissionDataResolved: permissionDataIdentity === identity,
    hasPermission
  };
};
