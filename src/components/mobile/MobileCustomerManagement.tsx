import React, { useState, useMemo } from "react";
import { useInfiniteCustomers } from "@/hooks/useInfiniteCustomers";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import MobileCustomerCard from "./MobileCustomerCard";
import PullToRefresh from "./PullToRefresh";
import InfiniteScroll from "./InfiniteScroll";
import { CreateCustomerForm } from "@/components/CreateCustomerForm";
import { EditCustomerDialog } from "@/components/EditCustomerDialog";
import { DeleteCustomerDialog } from "@/components/DeleteCustomerDialog";
import { Search, Plus, SortAsc } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const ITEMS_PER_PAGE = 10;

const MobileCustomerManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 350);
  const {
    data: pages,
    isLoading: loading,
    error,
    refetch: loadCustomers,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteCustomers({ search: debouncedSearch });
  const customers = (pages?.pages || []).flat();
  const [sortBy, setSortBy] = useState<"name" | "created_at" | "total_spent">("created_at");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Filter and sort customers
  const filteredCustomers = useMemo(() => {
    // Server already filters; sort locally
    let filtered = [...customers];

    // Sort customers
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return (a.name || "").localeCompare(b.name || "");
        case "total_spent":
          return (b.total_spent || 0) - (a.total_spent || 0);
        case "created_at":
        default:
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
    });

    return filtered;
  }, [customers, sortBy]);

  const displayedCustomers = filteredCustomers;
  const hasMore = !!hasNextPage;

  const handleRefresh = async () => {
    try {
      await loadCustomers();
      toast({
        title: "Đã cập nhật",
        description: "Danh sách khách hàng đã được làm mới",
      });
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể tải dữ liệu",
        variant: "destructive",
      });
    }
  };

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  const handleEditCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setShowEditDialog(true);
  };

  const handleDeleteCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setShowDeleteDialog(true);
  };

  const handleViewCustomer = (customer: any) => {
    // For now, just edit. Later we can add a view-only mode
    handleEditCustomer(customer);
  };

  const getSortLabel = (sort: string) => {
    switch (sort) {
      case "name": return "Tên A-Z";
      case "total_spent": return "Chi tiêu cao";
      case "created_at": return "Mới nhất";
      default: return "Sắp xếp";
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <p className="text-destructive mb-4">Có lỗi xảy ra khi tải dữ liệu</p>
          <Button onClick={handleRefresh} variant="outline">
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Khách hàng</h1>
          <p className="text-sm text-muted-foreground">
            {filteredCustomers.length} khách hàng
          </p>
        </div>
        
        <Sheet open={showCreateForm} onOpenChange={setShowCreateForm}>
          <SheetTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Thêm
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[90vh]">
            <SheetHeader>
              <SheetTitle>Thêm khách hàng mới</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <CreateCustomerForm 
                onClose={() => setShowCreateForm(false)}
                onSubmit={() => {
                  setShowCreateForm(false);
                  loadCustomers();
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Search and Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên, email, số điện thoại..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 flex-1">
                <SortAsc className="h-4 w-4" />
                {getSortLabel(sortBy)}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[40vh]">
              <SheetHeader>
                <SheetTitle>Sắp xếp theo</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-2">
                {[
                  { value: "created_at", label: "Mới nhất" },
                  { value: "name", label: "Tên A-Z" },
                  { value: "total_spent", label: "Chi tiêu cao nhất" }
                ].map((option) => (
                  <Button
                    key={option.value}
                    variant={sortBy === option.value ? "default" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => {
                      setSortBy(option.value as any);
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Customer List */}
      <PullToRefresh onRefresh={handleRefresh}>
        <InfiniteScroll
          hasMore={hasMore}
          loading={loading}
          onLoadMore={handleLoadMore}
        >
          <div className="space-y-3">
            {loading && displayedCustomers.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : displayedCustomers.length > 0 ? (
              displayedCustomers.map((customer) => (
                <MobileCustomerCard
                  key={customer.id}
                  customer={customer}
                  onEdit={handleEditCustomer}
                  onDelete={handleDeleteCustomer}
                  onView={handleViewCustomer}
                />
              ))
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Không có khách hàng nào</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowCreateForm(true)}
                >
                  Thêm khách hàng đầu tiên
                </Button>
              </div>
            )}
          </div>
        </InfiniteScroll>
      </PullToRefresh>

      {/* Dialogs */}
      <EditCustomerDialog
        customer={selectedCustomer}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        onSubmit={() => {
          setShowEditDialog(false);
          loadCustomers();
        }}
      />

      <DeleteCustomerDialog
        customer={selectedCustomer}
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={() => {
          setShowDeleteDialog(false);
          loadCustomers();
        }}
      />
    </div>
  );
};

export default MobileCustomerManagement;