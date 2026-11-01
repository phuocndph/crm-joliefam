import { extractGhnExportCodes, parseGhnCsv } from '@/lib/ghn-history-export';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { ghnStatusLabel } from '@/lib/ghn-status';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuthReady } from '@/hooks/useAuthReady';
import { Loader2, ExternalLink, Trash2, Plus, RefreshCw, Download, Pencil, Search, Printer, CircleCheck, CircleAlert, CircleHelp, RotateCcw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { User } from '@supabase/supabase-js';
import { GHNTrackingFilters, FilterState } from '@/components/GHNTrackingFilters';
import { EditGHNOrderDialog } from '@/components/EditGHNOrderDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDebounce } from '@/hooks/useDebounce';
import { Card as UICard } from '@/components/ui/card';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';
import { LocalGhnPrintDialog } from '@/components/LocalGhnPrintDialog';
import { canLoadGhnTrackingSearch, clampGhnTrackingPage, createGhnTrackingRequestGate, ghnTrackingQueryFingerprint, type GhnTrackingQuerySnapshot } from '@/lib/ghn-tracking-list-state';

interface GHNTrackingData {
  id: string;
  ghn_order_code: string;
  internal_order_code?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  package_weight?: number;
  created_date?: string;
  expected_delivery_date?: string;
  delivered_date?: string;
  cod_amount?: number;
  ghn_status?: string;
  ghn_status_text?: string;
  tracking_url?: string;
  last_updated_at?: string;
  raw_data?: any;
}

const FINAL_STATUSES = ['delivered', 'self_delivered', 'cancel', 'cancelled', 'returned', 'lost', 'damage'];

// Map trạng thái và màu sắc
const statusColors: { [key: string]: string } = {
  'ready_to_pick': 'bg-yellow-100 text-yellow-800',
  'picking': 'bg-orange-100 text-orange-800',
  'picked': 'bg-blue-100 text-blue-800',
  'storing': 'bg-purple-100 text-purple-800',
  'transporting': 'bg-indigo-100 text-indigo-800',
  'sorting': 'bg-cyan-100 text-cyan-800',
  'delivering': 'bg-pink-100 text-pink-800',
  'delivered': 'bg-green-100 text-green-800',
  'delivery_fail': 'bg-red-100 text-red-800',
  'returning': 'bg-amber-100 text-amber-800',
  'returned': 'bg-gray-100 text-gray-800',
  'cancel': 'bg-red-100 text-red-800',
  'lost': 'bg-red-100 text-red-800',
  'damage': 'bg-red-100 text-red-800'
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('vi-VN');
  } catch {
    return '';
  }
}

function formatWeight(weight?: number): string {
  if (!weight) return '';
  return `${(weight / 1000).toFixed(2)} kg`;
}

function formatCurrency(amount?: number): string {
  if (!amount) return '0 ₫';
  return `${amount.toLocaleString('vi-VN')} ₫`;
}

function TrackingListState({ loading, error, total, onRetry }: { loading: boolean; error: string; total: number; onRetry: () => void }) {
  if (loading) return <>Đang tải dữ liệu tracking…</>;
  if (error) return <div className="flex flex-col items-center gap-2"><span>{error}</span><Button variant="outline" size="sm" onClick={onRetry}>Thử lại</Button></div>;
  return <>{total === 0 ? 'Chưa có dữ liệu tracking' : 'Không tìm thấy kết quả phù hợp với bộ lọc'}</>;
}

export default function GHNTrackingPage() {
  const localBackend = isLocalBackend();
  const [trackingData, setTrackingData] = useState<GHNTrackingData[]>([]);
  const [orderCodeInput, setOrderCodeInput] = useState('');
  const [isMultipleMode, setIsMultipleMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isTrackingLoading, setIsTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [updatingOrderCode, setUpdatingOrderCode] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    searchText: '',
    status: [],
    sortBy: localBackend ? 'priority' : 'created_date',
    sortOrder: localBackend ? 'asc' : 'desc'
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GHNTrackingData | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<GHNTrackingData | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteBusy = useRef(false);
  const deleteCancel = useRef<HTMLButtonElement>(null);
  const [printing, setPrinting] = useState(false);
  const [printDialogIds, setPrintDialogIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalTrackingCount, setTotalTrackingCount] = useState(0);
  const [connection, setConnection] = useState<Awaited<ReturnType<typeof localApi.checkGhnConnection>> | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [importCursor,setImportCursor] = useState<string | undefined>();
  const [importing,setImporting] = useState(false);
  const [importError,setImportError] = useState('');
  const [exportCodes,setExportCodes] = useState<string[]>([]);
  const [exportDone,setExportDone] = useState(0);
  const [exportAdded,setExportAdded] = useState(0);
  const exportFileInput = useRef<HTMLInputElement>(null);
  const [stoppingImport,setStoppingImport] = useState(false);
  const [importProgress,setImportProgress] = useState<Awaited<ReturnType<typeof localApi.importGhnPage>> | null>(null);
  const importBusy = useRef(false), importStop = useRef(false), importGeneration = useRef(0);
  useEffect(() => () => { importStop.current = true; importGeneration.current++; }, []);
  const [refreshCursor, setRefreshCursor] = useState<string | null>(null);
  
  const { user: authUser, isReady } = useAuthReady();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { setUser(authUser); }, [authUser]);
  const userId = user?.id || '';
  useEffect(() => {
    importStop.current = true; importGeneration.current++;
    setImportProgress(null); setExportCodes([]); setExportDone(0); setExportAdded(0); setImporting(false); setStoppingImport(false); setLoading(false);
    try { setImportCursor(userId ? sessionStorage.getItem(`ghn-history-import:${userId}`) || undefined : undefined); } catch { setImportCursor(undefined); }
  }, [userId]);
  const { role, roleReady } = useUserRole(user);
  const authReady = isReady && roleReady;
  const isMobile = useIsMobile();
  const debouncedSearchText = useDebounce(filters.searchText, 300);
  const searchPending = !canLoadGhnTrackingSearch(filters.searchText, debouncedSearchText);
  const filterStatusKey = filters.status.join(',');
  const roleKey = String(role || '');
  const requestGateRef = useRef(createGhnTrackingRequestGate());
  const mountedRef = useRef(true);
  const trackingQuery: GhnTrackingQuerySnapshot = {
    userId, authReady, role: roleKey, page: currentPage, pageSize, status: filterStatusKey,
    sortBy: filters.sortBy, sortOrder: filters.sortOrder, rawSearch: filters.searchText,
    debouncedSearch: debouncedSearchText, searchPending,
  };
  const latestTrackingParamsRef = useRef(trackingQuery);
  latestTrackingParamsRef.current = trackingQuery;

  const checkConnection = useCallback(async () => {
    if (!isLocalBackend()) return;
    setCheckingConnection(true);
    setConnectionError('');
    try { setConnection(await localApi.checkGhnConnection()); }
    catch (error) { setConnection(null); setConnectionError(error instanceof Error ? error.message : 'Không kiểm tra được kết nối GHN.'); }
    finally { setCheckingConnection(false); }
  }, []);
  useEffect(() => { if (user && authReady) void checkConnection(); }, [user, authReady, checkConnection]);
  useEffect(() => { setRefreshCursor(null); }, [user?.id]);
  useEffect(() => {
    setFilters((current) => {
      if (current.sortBy === 'none') {
        return { ...current, sortBy: localBackend ? 'priority' : 'created_date', sortOrder: localBackend ? 'asc' : 'desc' };
      }
      if (!localBackend && current.sortBy === 'priority') {
        return { ...current, sortBy: 'created_date', sortOrder: 'desc' };
      }
      return current;
    });
  }, [localBackend]);

  const loadTrackingData = useCallback(async () => {
    const params = latestTrackingParamsRef.current;
    if (!params.userId || !params.authReady || params.searchPending) return;
    const request = requestGateRef.current.invalidate();
    const paramsFingerprint = ghnTrackingQueryFingerprint(params);
    const canCommit = () => mountedRef.current && requestGateRef.current.isCurrent(request)
      && ghnTrackingQueryFingerprint(latestTrackingParamsRef.current) === paramsFingerprint;
    setIsTrackingLoading(true);
    setTrackingError('');

    try {
      const searchText = params.debouncedSearch.trim().replace(/[%,()]/g, ' ');
      let rows: GHNTrackingData[];
      let total: number;
      if (localBackend) {
        const result = await localApi.ghnTracking({
          page: params.page, pageSize: params.pageSize, search: searchText, status: params.status,
          sortBy: params.sortBy, sortOrder: params.sortOrder,
        });
        rows = result.rows as unknown as GHNTrackingData[];
        total = result.total;
      } else {
        let query = supabase
          .from('ghn_tracking')
          .select('id, ghn_order_code, internal_order_code, order_id, customer_name, customer_phone, customer_address, package_weight, created_date, expected_delivery_date, delivered_date, cod_amount, ghn_status, ghn_status_text, tracking_url, last_updated_at, tracking_notes, created_at, updated_at, manager_id, tenant_id', { count: 'exact' })
          .range((params.page - 1) * params.pageSize, params.page * params.pageSize - 1);
        if (params.status) query = query.in('ghn_status', params.status.split(','));
        const cloudSortBy = ['customer_name', 'ghn_status', 'created_date'].includes(params.sortBy) ? params.sortBy : 'created_date';
        const ascending = params.sortOrder === 'asc';
        query = query
          .order(cloudSortBy, { ascending, nullsFirst: false })
          .order('id', { ascending: true, nullsFirst: false });
        if (searchText) {
          query = query.or(`ghn_order_code.ilike.%${searchText}%,internal_order_code.ilike.%${searchText}%,customer_name.ilike.%${searchText}%,customer_phone.ilike.%${searchText}%,customer_address.ilike.%${searchText}%,ghn_status.ilike.%${searchText}%,ghn_status_text.ilike.%${searchText}%`);
        }
        const result = await query;
        if (result.error) throw result.error;
        rows = (result.data || []) as GHNTrackingData[];
        total = result.count || 0;
      }

      if (!canCommit()) return;
      const clampedPage = clampGhnTrackingPage(params.page, total, params.pageSize);
      if (clampedPage !== params.page) {
        requestGateRef.current.invalidate();
        setTrackingData([]);
        setTotalTrackingCount(total);
        setCurrentPage(clampedPage);
        setSelectedOrders(new Set());
        return;
      }
      setTrackingData(rows);
      setTotalTrackingCount(total);
    } catch (error) {
      if (!canCommit()) return;
      console.error('Error loading tracking data:', error);
      setTrackingError('Không thể tải dữ liệu tracking. Vui lòng thử lại.');
    } finally {
      if (canCommit()) setIsTrackingLoading(false);
    }
  }, [localBackend]);

  useEffect(() => {
    const requestGate = requestGateRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGate.invalidate();
    };
  }, []);

  // Invalidate immediately, including while a debounced search term is pending.
  useEffect(() => {
    requestGateRef.current.invalidate();
    setTrackingData([]);
    setTrackingError('');
    if (!userId || !authReady) {
      setTotalTrackingCount(0);
      setIsTrackingLoading(false);
      return;
    }
    setIsTrackingLoading(true);
  }, [userId, authReady, role, currentPage, pageSize, filterStatusKey, filters.sortBy, filters.sortOrder, filters.searchText]);

  useEffect(() => {
    if (userId && authReady && !searchPending) void loadTrackingData();
  }, [userId, authReady, role, currentPage, pageSize, filterStatusKey, filters.sortBy, filters.sortOrder, filters.searchText, debouncedSearchText, searchPending, loadTrackingData]);

  // Real-time subscription always asks the latest loader; stale responses cannot commit.
  useEffect(() => {
    if (!userId || localBackend) return;
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`ghn-tracking-changes-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ghn_tracking' }, () => {
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => { void loadTrackingData(); }, 1000);
      })
      .subscribe();
    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [userId, localBackend, loadTrackingData]);

  // Auto-load incomplete orders when accessing the page
  const autoLoadIncompleteOrders = useCallback(async () => {
    if (!userId || totalTrackingCount === 0) return;

    try {
      if (localBackend) {
        const result = await localApi.refreshGhnTracking({ staleOnly: true });
        if (result.updated) { toast.success(`Đã cập nhật ${result.updated} vận đơn chưa hoàn thành`); await loadTrackingData(); }
        if (result.failed) toast.error(`${result.failed} vận đơn chưa cập nhật được. ${result.errors[0]?.message || 'Hãy thử lại.'}`);
        return;
      }
      const staleBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: {
          action: 'update_all_tracking',
          managerId: userId,
          staleBefore,
        },
      });
      if (error) throw error;
      if (data?.success && data?.data?.updateCount > 0) {
        toast.success(`Đã tự động cập nhật ${data.data.updateCount} đơn hàng chưa hoàn thành`);
        await loadTrackingData();
      }
    } catch (error) {
      console.error('Lỗi tự động cập nhật GHN:', error);
    }
  }, [userId, totalTrackingCount, localBackend, loadTrackingData]);

  // Refresh stale, non-terminal orders once when the page opens. The Edge
  // Function performs this in one server-side batch; avoid one browser request
  // per order because that multiplies Edge Function and GHN API usage.
  useEffect(() => {
    if (userId && totalTrackingCount > 0 && (!localBackend || connection?.connected)) {
      const timer = setTimeout(() => { void autoLoadIncompleteOrders(); }, 1000);
      return () => clearTimeout(timer);
    }
  }, [userId, totalTrackingCount, connection?.connected, localBackend, autoLoadIncompleteOrders]);

  const addOrderTracking = async () => {
    const input = orderCodeInput.trim();
    if (!input || !user) return;

    // Parse multiple order codes (separated by comma, semicolon, or newline)
    const orderCodes = [...new Set(input
      .split(/[,;\n]/)
      .map(code => code.trim())
      .filter(code => code.length > 0))];

    if (orderCodes.length === 0) return;

    if (isLocalBackend()) {
      setLoading(true);
      try {
        let added = 0;
        const failed: Array<{ code: string; message: string }> = [];
        for (const orderCode of orderCodes) {
          try {
            await localApi.createGhnTracking({ ghn_order_code: orderCode });
            added += 1;
          } catch (error: any) {
            failed.push({ code: orderCode, message: error instanceof Error ? error.message : 'Không thể xác minh mã GHN.' });
          }
        }
        if (added) await loadTrackingData();
        if (failed.length) {
          setOrderCodeInput(failed.map(item => item.code).join(isMultipleMode ? '\n' : ', '));
          toast.error(`Đã xác minh và lưu ${added}/${orderCodes.length} mã. Chưa lưu: ${failed.map(item => item.code).join(', ')}. ${failed[0].message}`);
        } else {
          setOrderCodeInput('');
          toast.success(`Đã xác minh và lưu ${added} mã theo dõi GHN.`);
        }
      } catch (error: any) { toast.error(error.message || 'Không thể thêm mã theo dõi cục bộ'); }
      finally { setLoading(false); }
      return;
    }

    // Check for duplicates
    const { data: existingCodes, error: duplicateCheckError } = await supabase
      .from('ghn_tracking')
      .select('ghn_order_code')
      .in('ghn_order_code', orderCodes);
    if (duplicateCheckError) {
      toast.error('Không thể kiểm tra mã tracking trùng');
      return;
    }
    const duplicates = (existingCodes || []).map(row => row.ghn_order_code);

    if (duplicates.length > 0) {
      toast.error(`Các mã đơn hàng đã tồn tại: ${duplicates.join(', ')}`);
      return;
    }

    setLoading(true);

    try {
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const orderCode of orderCodes) {
        try {
          const { data, error } = await supabase.functions.invoke('ghn-tracking', {
            body: {
              action: 'save_tracking',
              orderCode: orderCode,
              userId: user.id,
              managerId: user.id
            }
          });

          if (error) {
            throw error;
          }

          if (data.success) {
            successCount++;
          } else {
            errorCount++;
            errors.push(`${orderCode}: ${data.error}`);
          }
        } catch (error: any) {
          errorCount++;
          errors.push(`${orderCode}: ${error.message || 'Lỗi không xác định'}`);
        }
      }

      if (successCount > 0) {
        toast.success(`Đã thêm thành công ${successCount} đơn hàng`);
        setOrderCodeInput('');
        await loadTrackingData();
      }

      if (errorCount > 0) {
        toast.error(`${errorCount} đơn hàng thất bại. Chi tiết: ${errors.join('; ')}`);
      }
    } catch (error: any) {
      console.error('Error adding tracking:', error);
      toast.error(error.message || 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const updateAllTracking = async () => {
    if (!user || totalTrackingCount === 0) return;

    setLoading(true);

    try {
      if (isLocalBackend()) {
        const result = await localApi.refreshGhnTracking(refreshCursor ? { cursor: refreshCursor } : {});
        setRefreshCursor(result.next_cursor);
        if (result.updated) toast.success(`Đã cập nhật ${result.updated} vận đơn từ GHN`);
        else if (!result.failed) toast.info('Không có vận đơn đang giao cần cập nhật.');
        if (result.failed) toast.error(`${result.failed} vận đơn chưa cập nhật được. ${result.errors[0]?.message || 'Hãy thử lại.'}`);
        if (result.has_more) toast.info('Còn vận đơn cần cập nhật. Bấm cập nhật tiếp để xử lý lượt kế tiếp.');
        await loadTrackingData();
        return;
      }
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: {
          action: 'update_all_tracking',
          managerId: user.id
        }
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        toast.success(data.message);
        await loadTrackingData(); // Reload data
      } else {
        toast.error(data.error || 'Lỗi cập nhật tracking');
      }
    } catch (error: any) {
      console.error('Error updating tracking:', error);
      if (isLocalBackend()) setRefreshCursor(null);
      toast.error(error.message || 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const updateSingleTracking = async (orderCode: string) => {
    if (!user) return;

    setUpdatingOrderCode(orderCode);

    try {
      if (isLocalBackend()) {
        const result = await localApi.refreshGhnTracking({ orderCode });
        if (result.failed) throw new Error(result.errors[0]?.message || 'Không cập nhật được vận đơn.');
        if (result.updated) toast.success(`Đã cập nhật đơn hàng ${orderCode} từ GHN`);
        else toast.info('Vận đơn hoặc đơn CRM đã kết thúc; không tự thay đổi trạng thái.');
        await loadTrackingData();
        return;
      }
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: {
          action: 'save_tracking',
          orderCode: orderCode,
          userId: user.id,
          managerId: user.id
        }
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        toast.success(`Đã cập nhật đơn hàng ${orderCode}`);
        await loadTrackingData(); // Reload data
      } else {
        toast.error(data.error || 'Lỗi cập nhật tracking');
      }
    } catch (error: any) {
      console.error('Error updating single tracking:', error);
      toast.error(error.message || 'Lỗi kết nối server');
    } finally {
      setUpdatingOrderCode(null);
    }
  };

  const chooseGhnExport = async (file?: File) => {
    if (!file || loading) return;
    const generation = importGeneration.current;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('File tối đa 20 MB.');
      let rows: unknown[][];
      if (/\.csv$/i.test(file.name)) rows = parseGhnCsv(await file.text());
      else if (/\.xlsx$/i.test(file.name)) {
        const ExcelJS = await import('exceljs'); const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const sheet = workbook.worksheets[0]; if (!sheet) throw new Error('File Excel không có trang dữ liệu.');
        if (sheet.rowCount > 100000 || sheet.columnCount > 500) throw new Error('File vượt 100.000 dòng hoặc 500 cột. Hãy chia nhỏ file xuất GHN.');
        rows = []; sheet.eachRow({ includeEmpty: true }, row => { rows.push(Array.from({ length: sheet.columnCount }, (_, index) => row.getCell(index + 1).text)); });
      } else throw new Error('Chọn file .xlsx hoặc .csv xuất từ GHN. Với .xls, hãy lưu lại thành .xlsx.');
      const codes = extractGhnExportCodes(rows);
      if (generation !== importGeneration.current) return;
      setExportCodes(codes); setExportDone(0); setExportAdded(0); setImportError('');
    } catch (error) { if (generation === importGeneration.current) setImportError(error instanceof Error ? error.message : 'Không đọc được file GHN.'); }
  };

  const importGhnExport = async () => {
    if (!user || loading || importBusy.current || !exportCodes.length) return;
    const generation = importGeneration.current;
    importBusy.current = true; importStop.current = false; setLoading(true); setImporting(true); setStoppingImport(false); setImportError('');
    let offset = exportDone;
    try {
      while (offset < exportCodes.length && !importStop.current) {
        const result = await localApi.importGhnCodes(exportCodes.slice(offset, offset + 10));
        if (generation !== importGeneration.current) break;
        offset += result.processed; setExportDone(offset); setExportAdded(value => value + result.added);
        if (result.failed) { setImportError(`${result.errors[0]?.orderCode}: ${result.errors[0]?.message}`); break; }
        if (!result.processed) throw new Error('Không có tiến triển. Đã dừng nhập file.');
      }
      if (generation === importGeneration.current && offset === exportCodes.length) toast.success('Đã xác minh hết mã trong file GHN.');
    } catch (error) { if (generation === importGeneration.current) setImportError(error instanceof Error ? error.message : 'Nhập file chưa hoàn tất.'); }
    finally { importBusy.current = false; if (generation === importGeneration.current) { setLoading(false); setImporting(false); setStoppingImport(false); await loadTrackingData(); } }
  };

  const importAllOrdersFromGHN = async () => {
    if (!user) return;
    if (isLocalBackend()) {
      if (loading || importBusy.current) return;
      importBusy.current = true; importStop.current = false;
      setLoading(true); setImporting(true); setStoppingImport(false); setImportError('');
      const generation = importGeneration.current;
      let cursor = importCursor, latest = importProgress;
      const remember = (value?: string) => {
        setImportCursor(value);
        try { if (value) sessionStorage.setItem(`ghn-history-import:${user.id}`, value); else sessionStorage.removeItem(`ghn-history-import:${user.id}`); } catch { /* In-memory resume remains available. */ }
      };
      try {
        while (!importStop.current) {
          const result = await localApi.importGhnPage(cursor);
          if (generation !== importGeneration.current) break;
          latest = result; setImportProgress(result);
          if (result.has_more && (!result.next_cursor || result.next_cursor === cursor)) throw new Error('Đồng bộ chưa hoàn tất: máy chủ không trả trang tiếp theo.');
          cursor = result.next_cursor || undefined; remember(cursor);
          if (result.halted || result.failed) { setImportError(result.errors[0]?.message || 'Đồng bộ chưa hoàn tất.'); toast.error(`Đã dừng tại ${result.errors[0]?.orderCode || 'trang lỗi'}. ${result.errors[0]?.message || 'Bấm tiếp tục để thử lại.'}`); break; }
          if (!result.has_more) { toast.success('Đã duyệt hết danh sách GHN trả về; dữ liệu có sẵn được giữ nguyên.'); break; }
        }
        if (generation === importGeneration.current && importStop.current && latest?.has_more) toast.info('Đã dừng. Có thể tiếp tục đồng bộ sau.');
      } catch (error) { if (generation === importGeneration.current) { const message = `Đồng bộ chưa hoàn tất. ${error instanceof Error ? error.message : 'Không lấy được dữ liệu GHN.'}`; setImportError(message); toast.error(message); } }
      finally { importBusy.current = false; if (generation === importGeneration.current) { setLoading(false); setImporting(false); setStoppingImport(false); await loadTrackingData(); } }
      return;
    }

    setLoading(true);

    try {
      // First fetch all orders from GHN
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: {
          action: 'fetch_all_orders'
        }
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        const orders = data.data || [];
        
        if (orders.length === 0) {
          toast.info('Không tìm thấy đơn hàng nào trên GHN');
          return;
        }

        toast.info(`Tìm thấy ${orders.length} đơn hàng trên GHN. Đang nhập dữ liệu...`);

        // Save each order to database
        let savedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const order of orders) {
          try {
            // Check if order already exists
            const existingOrder = trackingData.find(item => item.ghn_order_code === order.orderCode);
            if (existingOrder) {
              skippedCount++;
              continue;
            }

            const { data: saveData, error: saveError } = await supabase.functions.invoke('ghn-tracking', {
              body: {
                action: 'save_tracking',
                orderCode: order.orderCode,
                userId: user.id,
                managerId: user.id
              }
            });

            if (saveError || !saveData.success) {
              errorCount++;
              console.error(`Error saving order ${order.orderCode}:`, saveError || saveData.error);
            } else {
              savedCount++;
            }
          } catch (saveError) {
            errorCount++;
            console.error(`Error saving order ${order.orderCode}:`, saveError);
          }
        }

        const message = `Nhập dữ liệu hoàn tất: ${savedCount} đã thêm, ${skippedCount} đã tồn tại${errorCount > 0 ? `, ${errorCount} lỗi` : ''}`;
        toast.success(message);
        
        if (savedCount > 0) {
          await loadTrackingData(); // Reload data only if new orders were added
        }
      } else {
        toast.error(data.error || 'Lỗi lấy dữ liệu từ GHN');
      }
    } catch (error: any) {
      console.error('Error importing orders:', error);
      toast.error(error.message || 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const confirmRemoveTracking = async () => {
    if (!deleteTarget || deleteBusy.current) return;
    const target = deleteTarget;
    deleteBusy.current = true;
    setDeleting(true);
    try {
      if (isLocalBackend()) await localApi.deleteGhnTracking(target.id);
      else {
        const { error } = await supabase.from('ghn_tracking').delete().eq('id', target.id);
        if (error) throw error;
      }
      setSelectedOrders(previous => { const next = new Set(previous); next.delete(target.ghn_order_code); return next; });
      setDeleteTarget(null);
      toast.success('\u0110\u00e3 x\u00f3a m\u00e3 theo d\u00f5i');
      await loadTrackingData();
    } catch {
      toast.error('Kh\u00f4ng x\u00f3a \u0111\u01b0\u1ee3c m\u00e3 theo d\u00f5i. Vui l\u00f2ng th\u1eed l\u1ea1i.');
    } finally {
      deleteBusy.current = false;
      setDeleting(false);
    }
  };

  // The database query already applies search, status, sort, and pagination.
  // Keep this alias for the existing table/mobile rendering.
  const filteredData = useMemo(() => {
    return trackingData;
  }, [trackingData]);

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);
    setSelectedOrders(new Set());
  }, []);

  const printA5 = async (orderCodes: string[]) => {
    if (orderCodes.length === 0) return;
    if (orderCodes.length > 50) { toast.error('Mỗi lần chỉ in tối đa 50 vận đơn. Hãy chọn lại trong trang hiện tại.'); return; }
    if (isLocalBackend()) {
      const ids = orderCodes.map((code) => trackingData.find((row) => row.ghn_order_code === code)?.id).filter((id): id is string => Boolean(id));
      if (ids.length !== orderCodes.length) { toast.error('Có vận đơn không còn trong danh sách. Hãy tải lại trước khi in.'); return; }
      setPrintDialogIds(ids); return;
    }
    setPrinting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: { action: 'print_a5', orderCodes }
      });
      if (error) throw error;
      if (data.success && data.data?.printUrl) {
        window.open(data.data.printUrl, '_blank');
        toast.success("Đang mở trang in phiếu A5...");
      } else {
        throw new Error(data.error || 'Không thể tạo link in phiếu');
      }
    } catch (error: any) {
      console.error('Error printing A5:', error);
      toast.error(error.message || 'Lỗi in phiếu A5');
    } finally {
      setPrinting(false);
    }
  };

  const toggleSelectOrder = (orderCode: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderCode)) next.delete(orderCode);
      else next.add(orderCode);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageCodes = paginatedData.map(d => d.ghn_order_code);
    const allSelected = pageCodes.every(c => selectedOrders.has(c));
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (allSelected) pageCodes.forEach(c => next.delete(c));
      else pageCodes.forEach(c => next.add(c));
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(totalTrackingCount / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedData = filteredData;
  const startIdx = totalTrackingCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, totalTrackingCount);

  const connectionStatus = checkingConnection ? 'Đang kiểm tra kết nối GHN' : connection?.connected ? 'GHN đã kết nối' : connection?.configured ? 'GHN kết nối chưa thành công' : connectionError ? 'Không kiểm tra được kết nối GHN' : connection ? 'GHN chưa cấu hình kết nối' : 'GHN chưa kiểm tra kết nối';
  const connectionDescription = [connectionStatus, connectionError || connection?.message].filter(Boolean).join('. ');

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-full">
      <Card className="w-full">
        <CardHeader className="px-3 sm:px-6 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Theo dõi đơn hàng GHN</CardTitle>
          {isLocalBackend() && <div className="flex shrink-0 items-center gap-1">
            <span role="status" aria-live="polite" aria-label={connectionDescription} title={connectionDescription} className="inline-flex p-1">
              {checkingConnection ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-muted-foreground" /> : connection?.connected ? <CircleCheck aria-hidden="true" className="h-4 w-4 text-emerald-600" /> : connectionError || connection ? <CircleAlert aria-hidden="true" className="h-4 w-4 text-destructive" /> : <CircleHelp aria-hidden="true" className="h-4 w-4 text-muted-foreground" />}
            </span>
            <Button variant="ghost" size="icon" onClick={checkConnection} disabled={checkingConnection} className="h-8 w-8" aria-label={`Kiểm tra lại kết nối GHN. ${connectionDescription}`} title="Kiểm tra lại kết nối GHN">
              <RefreshCw aria-hidden="true" className={`h-4 w-4 ${checkingConnection ? 'animate-spin' : ''}`} />
            </Button>
            {refreshCursor && <Button variant="ghost" size="icon" className="h-8 w-8" disabled={loading} onClick={() => setRefreshCursor(null)} aria-label="Bắt đầu lượt cập nhật mới" title="Bắt đầu lượt cập nhật mới"><RotateCcw aria-hidden="true" className="h-4 w-4" /></Button>}
          </div>}
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {importError && <p role="alert" className="mb-3 text-sm text-destructive">{importError}</p>}
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-2">
              <Button
                variant={!isMultipleMode ? "default" : "outline"}
                size="sm"
                onClick={() => setIsMultipleMode(false)}
                className="flex-1 sm:flex-none"
              >
                Đơn lẻ
              </Button>
              <Button
                variant={isMultipleMode ? "default" : "outline"}
                size="sm"
                onClick={() => setIsMultipleMode(true)}
                className="flex-1 sm:flex-none"
              >
                Nhiều đơn
              </Button>
              {localBackend && <>
                <input ref={exportFileInput} type="file" accept=".xlsx,.csv" className="hidden" onChange={event => { void chooseGhnExport(event.target.files?.[0]); event.target.value = ''; }} />
                <Button variant="outline" onClick={() => exportFileInput.current?.click()} disabled={loading}>
                  {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}Chọn file GHN
                </Button>
                {exportCodes.length > 0 && <><span className="text-xs text-muted-foreground" role="status">{exportDone}/{exportCodes.length} mã · {exportAdded} mới</span><Button variant="outline" disabled={loading || exportDone === exportCodes.length || !connection?.connected} onClick={importGhnExport}>{exportDone ? 'Tiếp tục nhập' : 'Nhập mã từ file'}</Button></>}
                {importing && <Button variant="outline" size="sm" disabled={stoppingImport} onClick={() => { importStop.current = true; setStoppingImport(true); }}>{stoppingImport ? 'Đang dừng…' : 'Dừng'}</Button>}
                {!importing && importCursor && <Button variant="ghost" size="icon" className="h-8 w-8" title="Bắt đầu lại đồng bộ từ GHN" aria-label="Bắt đầu lại đồng bộ từ GHN" disabled={loading} onClick={() => { setImportCursor(undefined); setImportProgress(null); try { sessionStorage.removeItem(`ghn-history-import:${userId}`); } catch { /* Optional resume storage. */ } }}><RotateCcw className="h-4 w-4" /></Button>}
                {importProgress && <span className="text-xs text-muted-foreground" role="status" title={importProgress.totals.map(row => `Shop ${row.shop_id}: duyệt ${row.scanned}, mới ${row.added}, bỏ qua ${row.skipped}, lỗi ${row.failed}${row.complete ? ' (đã duyệt hết)' : ''}`).join('\n')}>
                  {importProgress.totals.reduce((sum,row)=>sum+row.scanned,0)} đã duyệt · {importProgress.totals.reduce((sum,row)=>sum+row.added,0)} mới · {importProgress.totals.reduce((sum,row)=>sum+row.skipped,0)} bỏ qua{importProgress.totals.some(row=>row.failed) ? ' · có lỗi' : ''}{importProgress.complete ? ' · xong lượt' : ''}
                </span>}
              </>}

            </div>

            {!isMultipleMode ? (
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center sm:justify-between">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                  <Input
                    placeholder="Nhập mã đơn hàng GHN"
                    value={orderCodeInput}
                    onChange={(e) => setOrderCodeInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addOrderTracking()}
                    className="sm:max-w-xs"
                  />
                  <Button
                    onClick={addOrderTracking}
                    disabled={loading || !orderCodeInput.trim()}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Thêm tracking
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-4 items-center">
                     <span className="text-sm text-muted-foreground">
                       Hiển thị {filteredData.length} / {totalTrackingCount} đơn hàng
                     </span>
                     {selectedOrders.size > 0 && (
                       <><span className="text-xs text-muted-foreground">Chọn trong trang này, tối đa 50 mã/lần.</span><Button
                           onClick={() => printA5(Array.from(selectedOrders))}
                           disabled={printing}
                           variant="outline"
                           className="gap-2"
                         >
                           {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                           In A5 ({selectedOrders.size})
                         </Button></>
                     )}
                     <Button
                       onClick={updateAllTracking}
                       disabled={loading || totalTrackingCount === 0}
                       variant="outline"
                     >
                       {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                       {isLocalBackend() ? (refreshCursor ? 'Cập nhật lượt tiếp' : 'Cập nhật vận đơn đang giao') : 'Cập nhật tất cả'}
                     </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Textarea
                  placeholder="Nhập nhiều mã đơn hàng (mỗi mã một dòng hoặc ngăn cách bằng dấu phẩy)"
                  value={orderCodeInput}
                  onChange={(e) => setOrderCodeInput(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center sm:justify-between">
                  <div className="flex gap-2 sm:gap-4">
                    <Button
                      onClick={addOrderTracking}
                      disabled={loading || !orderCodeInput.trim()}
                      className="flex-1 sm:flex-none"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      Thêm tất cả
                    </Button>
                    <Button
                      onClick={() => setOrderCodeInput('')}
                      variant="outline"
                      disabled={loading}
                      className="flex-1 sm:flex-none"
                    >
                      Xóa
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:gap-4 items-center">
                     <span className="text-sm text-muted-foreground">
                       Hiển thị {filteredData.length} / {totalTrackingCount} đơn hàng
                     </span>
                     {selectedOrders.size > 0 && (
                       <><span className="text-xs text-muted-foreground">Chọn trong trang này, tối đa 50 mã/lần.</span><Button
                           onClick={() => printA5(Array.from(selectedOrders))}
                           disabled={printing}
                           variant="outline"
                           className="gap-2"
                         >
                           {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                           In A5 ({selectedOrders.size})
                         </Button></>
                     )}
                     <Button
                       onClick={updateAllTracking}
                       disabled={loading || totalTrackingCount === 0}
                       variant="outline"
                     >
                       {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                       {isLocalBackend() ? (refreshCursor ? 'Cập nhật lượt tiếp' : 'Cập nhật vận đơn đang giao') : 'Cập nhật tất cả'}
                     </Button>
                  </div>
                </div>
              </div>
            )}

            
            {/* Filter Component */}
            <GHNTrackingFilters
               filters={filters}
              onFiltersChange={handleFiltersChange}
              filteredCount={totalTrackingCount}
              totalCount={totalTrackingCount}
               isLocal={localBackend}
            />
          </div>

           {trackingError && paginatedData.length > 0 && (
             <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm" role="alert">
               <span>{trackingError}</span>
               <Button variant="outline" size="sm" onClick={() => void loadTrackingData()}>Thử lại</Button>
             </div>
           )}

          {!isMobile && (
          <div className="overflow-auto border rounded-lg max-h-[600px] w-full">
            <table className="w-full border-collapse min-w-[1800px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-blue-800 text-white border border-gray-300 px-2 py-4 text-center text-sm font-semibold min-w-[50px]">
                    <Checkbox
                      checked={paginatedData.length > 0 && paginatedData.every(d => selectedOrders.has(d.ghn_order_code))}
                      onCheckedChange={toggleSelectAll}
                      className="border-white data-[state=checked]:bg-white data-[state=checked]:text-blue-800"
                    />
                  </th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[80px]">STT</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[150px]">MÃ GHN</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px]">MÃ ĐƠN HÀNG</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[180px]">TRẠNG THÁI</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[180px]">TÊN KHÁCH HÀNG</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[140px]">SỐ ĐIỆN THOẠI</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[250px]">ĐỊA CHỈ</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px]">CÂN NẶNG</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[130px]">NGÀY TẠO</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[140px]">DỰ KIẾN GIAO</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[140px]">NGÀY GIAO</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px]">COD THU HỘ</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px] sticky right-[80px] shadow-lg">TRA CỨU</th>
                  <th className="bg-blue-800 text-white border border-gray-300 px-4 py-4 text-left text-sm font-semibold min-w-[120px] sticky right-0 shadow-lg">THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="border border-gray-300 px-3 py-4 text-center text-gray-500">
                      <TrackingListState loading={isTrackingLoading} error={trackingError} total={totalTrackingCount} onRetry={() => void loadTrackingData()} />
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item, index) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-2 py-3 text-center min-w-[50px]">
                        <Checkbox
                          checked={selectedOrders.has(item.ghn_order_code)}
                          onCheckedChange={() => toggleSelectOrder(item.ghn_order_code)}
                        />
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-center min-w-[80px]">{(safePage - 1) * pageSize + index + 1}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm font-mono min-w-[150px]">{item.ghn_order_code}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm font-mono min-w-[120px]">{item.internal_order_code || 'Kh\u00f4ng c\u00f3 m\u00e3 trong t\u00ean ng\u01b0\u1eddi nh\u1eadn'}</td>
                       <td className="border border-gray-300 px-4 py-3 text-sm min-w-[180px]">
                         <div className="flex items-center gap-2">
                           <Badge className={statusColors[item.ghn_status || ''] || 'bg-gray-100 text-gray-800'}>
                             {ghnStatusLabel(item.ghn_status)}
                           </Badge>
                           <Button
                             onClick={() => updateSingleTracking(item.ghn_order_code)}
                             variant="ghost"
                             size="sm"
                             className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                             disabled={updatingOrderCode === item.ghn_order_code}
                             title="Cập nhật đơn hàng này"
                           >
                             <RefreshCw className={`h-3 w-3 ${updatingOrderCode === item.ghn_order_code ? 'animate-spin' : ''}`} />
                           </Button>
                         </div>
                       </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm min-w-[180px]">{item.customer_name}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm min-w-[140px]">{item.customer_phone || '-'}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm min-w-[250px] break-words whitespace-normal leading-relaxed">
                        {item.customer_address || '-'}
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm min-w-[120px]">{formatWeight(item.package_weight)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm whitespace-nowrap min-w-[130px]">{formatDate(item.created_date)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm whitespace-nowrap min-w-[140px]">{formatDate(item.expected_delivery_date)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm whitespace-nowrap min-w-[140px]">{formatDate(item.delivered_date)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm whitespace-nowrap min-w-[120px]">{formatCurrency(item.cod_amount)}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm min-w-[120px] sticky right-[80px] bg-background shadow-lg">
                        <a
                          href={`https://donhang.ghn.vn/?order_code=${item.ghn_order_code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 text-sm"
                        >
                          <Search className="h-3 w-3" />
                          Tra cứu
                        </a>
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm min-w-[120px] sticky right-0 bg-background shadow-lg">
                        <div className="flex items-center gap-1">
                          <Button
                            onClick={() => printA5([item.ghn_order_code])}
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-800"
                            title="In phiếu A5"
                            disabled={printing}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          {!FINAL_STATUSES.includes(item.ghn_status || '') && (
                            <Button
                              onClick={() => { setEditingRecord(item); setEditDialogOpen(true); }}
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:text-blue-800"
                              title="Chỉnh sửa đơn hàng"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            onClick={() => { if (!deleteBusy.current) setDeleteTarget(item); }}
                            disabled={deleting}
                            aria-label={`X\u00f3a theo d\u00f5i ${item.ghn_order_code}`}
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}

          {isMobile && (
            <div className="space-y-3">
              {paginatedData.length === 0 ? (
                <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground">
                  <TrackingListState loading={isTrackingLoading} error={trackingError} total={totalTrackingCount} onRetry={() => void loadTrackingData()} />
                </div>
              ) : (
                paginatedData.map((item, index) => {
                  const isFinal = FINAL_STATUSES.includes(item.ghn_status || '');
                  const isSelected = selectedOrders.has(item.ghn_order_code);
                  return (
                    <UICard key={item.id} className="p-3 space-y-3">
                      {/* Header: checkbox + STT + mã + badge */}
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectOrder(item.ghn_order_code)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">#{(safePage - 1) * pageSize + index + 1}</span>
                            <span className="font-mono text-sm font-semibold truncate">{item.ghn_order_code}</span>
                          </div>
                          {(
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">
                              {item.internal_order_code || 'Kh\u00f4ng c\u00f3 m\u00e3 trong t\u00ean ng\u01b0\u1eddi nh\u1eadn'}
                            </div>
                          )}
                        </div>
                        <Badge className={`${statusColors[item.ghn_status || ''] || 'bg-muted text-muted-foreground'} shrink-0`}>
                          {ghnStatusLabel(item.ghn_status)}
                        </Badge>
                      </div>

                      {/* Customer */}
                      <div className="text-sm space-y-1 border-t pt-2">
                        <div className="font-medium">
                          {item.customer_name}
                          {item.customer_phone && <span className="text-muted-foreground font-normal"> · {item.customer_phone}</span>}
                        </div>
                        {item.customer_address && (
                          <div className="text-xs text-muted-foreground leading-relaxed">{item.customer_address}</div>
                        )}
                      </div>

                      {/* Meta grid */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs border-t pt-2">
                        <div>
                          <span className="text-muted-foreground">Cân: </span>
                          <span className="font-medium">{formatWeight(item.package_weight) || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">COD: </span>
                          <span className="font-medium">{formatCurrency(item.cod_amount)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tạo: </span>
                          <span className="font-medium">{formatDate(item.created_date) || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">DK giao: </span>
                          <span className="font-medium">{formatDate(item.expected_delivery_date) || '-'}</span>
                        </div>
                        {item.delivered_date && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Đã giao: </span>
                            <span className="font-medium text-sidebar-primary">{formatDate(item.delivered_date)}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 border-t pt-2 flex-wrap">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-9 flex-1 min-w-[88px] gap-1"
                        >
                          <a
                            href={`https://donhang.ghn.vn/?order_code=${item.ghn_order_code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Search className="h-3.5 w-3.5" />
                            Tra cứu
                          </a>
                        </Button>
                        <Button
                          onClick={() => updateSingleTracking(item.ghn_order_code)}
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          disabled={updatingOrderCode === item.ghn_order_code}
                          title="Cập nhật"
                        >
                          <RefreshCw className={`h-4 w-4 ${updatingOrderCode === item.ghn_order_code ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          onClick={() => printA5([item.ghn_order_code])}
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-green-600"
                          title="In A5"
                          disabled={printing}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        {!isFinal && (
                          <Button
                            onClick={() => { setEditingRecord(item); setEditDialogOpen(true); }}
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-blue-600"
                            title="Chỉnh sửa"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          onClick={() => { if (!deleteBusy.current) setDeleteTarget(item); }}
                            disabled={deleting}
                            aria-label={`X\u00f3a theo d\u00f5i ${item.ghn_order_code}`}
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-destructive"
                          title="Xóa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </UICard>
                  );
                })
              )}
            </div>
          )}

          {totalTrackingCount > 0 && (
            <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 flex-wrap">
                <span>Số dòng/trang:</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); setSelectedOrders(new Set()); }}>
                  <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[25, 50].map(n => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs sm:text-sm">{startIdx}-{endIdx} / {totalTrackingCount}</span>
              </div>
              <div className="flex items-center gap-1 justify-between sm:justify-end">
                <Button variant="outline" size="sm" onClick={() => { setCurrentPage(1); setSelectedOrders(new Set()); }} disabled={safePage === 1} className="hidden sm:inline-flex">«</Button>
                <Button variant="outline" size="sm" onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); setSelectedOrders(new Set()); }} disabled={safePage === 1}>‹ Trước</Button>
                <span className="px-2 whitespace-nowrap">{safePage} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); setSelectedOrders(new Set()); }} disabled={safePage === totalPages}>Sau ›</Button>
                <Button variant="outline" size="sm" onClick={() => { setCurrentPage(totalPages); setSelectedOrders(new Set()); }} disabled={safePage === totalPages} className="hidden sm:inline-flex">»</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleteBusy.current) setDeleteTarget(null); }}>
        <AlertDialogContent onOpenAutoFocus={(event) => { event.preventDefault(); deleteCancel.current?.focus(); }} onEscapeKeyDown={(event) => { if (deleteBusy.current) event.preventDefault(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa 1 mã theo dõi?</AlertDialogTitle>
            <AlertDialogDescription>
              Mã GHN: <strong className="font-mono text-foreground">{deleteTarget?.ghn_order_code}</strong>. Chỉ xóa khỏi danh sách theo dõi CRM, không hủy vận đơn tại GHN.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={deleteCancel} disabled={deleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting} onClick={(event) => { event.preventDefault(); void confirmRemoveTracking(); }}>
              {deleting ? 'Đang xóa…' : 'Xóa theo dõi'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditGHNOrderDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        trackingRecord={editingRecord}
        onSuccess={() => loadTrackingData()}
      />
      <LocalGhnPrintDialog open={localBackend && printDialogIds.length > 0} onOpenChange={(open) => { if (!open) setPrintDialogIds([]); }} ids={printDialogIds} />


    </div>
  );
}
