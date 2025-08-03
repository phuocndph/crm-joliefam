import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { FabricControlByWarehouse } from '@/components/FabricControlByWarehouse';

const FabricManagement = () => {
  const [user, setUser] = useState<any>(null);
  const { role, loading: userLoading } = useUserRole(user);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (userLoading) {
    return <div className="flex items-center justify-center h-64">Đang tải...</div>;
  }

  if (!user || !role || !['admin', 'manager', 'employee'].includes(role)) {
    return <div className="text-center text-muted-foreground">Bạn không có quyền truy cập trang này.</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Quản lý vải Hà Nội</h1>
        <p className="text-muted-foreground">Kiểm soát và theo dõi sử dụng vải kho Hà Nội</p>
      </div>

      <FabricControlByWarehouse 
        warehouseName="Hà Nội" 
        warehouseFilter="hanoi"
      />
    </div>
  );
};

export default FabricManagement;