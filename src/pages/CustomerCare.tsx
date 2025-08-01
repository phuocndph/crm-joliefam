import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search, Filter, Download, Settings, BarChart3, UserPlus } from "lucide-react";

const CustomerCare = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedSource, setSelectedSource] = useState("all");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-primary">
          Hệ Thống Chăm Sóc Khách Hàng Joliefam
        </h1>
        <p className="text-muted-foreground">
          Quản lý và chăm sóc khách hàng thông minh với AI
        </p>
      </div>

      {/* Navigation Tabs */}
      <Tabs defaultValue="customers" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="customers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Khách Hàng
          </TabsTrigger>
          <TabsTrigger value="statistics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Thống Kê
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Import
          </TabsTrigger>
          <TabsTrigger value="ai-settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Cài Đặt AI
          </TabsTrigger>
        </TabsList>

        {/* Customer List Tab */}
        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Danh Sách Khách Hàng
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Thêm Khách Hàng
                  </Button>
                  <Select value="assignee">
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Chọn người phụ trách" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="me">Được phân cho tôi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Total customers */}
              <p className="text-sm text-muted-foreground">
                Tổng: <span className="font-medium">0 khách hàng</span>
              </p>

              {/* Filters */}
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Tất cả trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="new">Mới</SelectItem>
                    <SelectItem value="contacted">Đã liên hệ</SelectItem>
                    <SelectItem value="qualified">Đủ điều kiện</SelectItem>
                    <SelectItem value="proposal">Đề xuất</SelectItem>
                    <SelectItem value="negotiation">Đàm phán</SelectItem>
                    <SelectItem value="closed-won">Thành công</SelectItem>
                    <SelectItem value="closed-lost">Thất bại</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Tất cả" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="social">Mạng xã hội</SelectItem>
                    <SelectItem value="referral">Giới thiệu</SelectItem>
                    <SelectItem value="ads">Quảng cáo</SelectItem>
                  </SelectContent>
                </Select>

                <Select>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Tất cả nguồn" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả nguồn</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="direct">Trực tiếp</SelectItem>
                  </SelectContent>
                </Select>

                <Select>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Tất cả" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="today">Hôm nay</SelectItem>
                    <SelectItem value="week">Tuần này</SelectItem>
                    <SelectItem value="month">Tháng này</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent>
              {/* Customer Table */}
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <input type="checkbox" className="rounded" />
                      </TableHead>
                      <TableHead>Khách Hàng</TableHead>
                      <TableHead>Phụ Trách</TableHead>
                      <TableHead>Nguồn</TableHead>
                      <TableHead>Trạng Thái</TableHead>
                      <TableHead>Thời Gian</TableHead>
                      <TableHead>Ngày Cập Nhật</TableHead>
                      <TableHead>Theo Dõi</TableHead>
                      <TableHead>Điểm</TableHead>
                      <TableHead>Ghi Chú</TableHead>
                      <TableHead>Hành Động</TableHead>
                      <TableHead>Thao Tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2">
                          <Users className="h-12 w-12 text-muted-foreground" />
                          <p className="text-muted-foreground font-medium">
                            Không có khách hàng nào
                          </p>
                          <p className="text-sm text-muted-foreground">
                            phù hợp với bộ lọc hiện tại
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="statistics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Thống Kê Chăm Sóc Khách Hàng
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-sm text-muted-foreground">Tổng khách hàng</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-sm text-muted-foreground">Khách hàng mới</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">0%</div>
                    <p className="text-sm text-muted-foreground">Tỷ lệ chuyển đổi</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-sm text-muted-foreground">Tương tác trung bình</p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import Tab */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Import Khách Hàng
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center">
                <Download className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Import dữ liệu khách hàng</h3>
                <p className="text-muted-foreground mb-4">
                  Kéo thả file Excel hoặc CSV vào đây để import dữ liệu khách hàng
                </p>
                <Button>Chọn file</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Settings Tab */}
        <TabsContent value="ai-settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Cài Đặt AI Chăm Sóc Khách Hàng
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-2">Tự động phân loại khách hàng</h3>
                  <p className="text-muted-foreground mb-4">
                    Sử dụng AI để tự động phân loại và gán điểm cho khách hàng mới
                  </p>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="auto-classify" className="rounded" />
                    <label htmlFor="auto-classify">Bật tự động phân loại</label>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Gợi ý tương tác</h3>
                  <p className="text-muted-foreground mb-4">
                    AI sẽ gợi ý thời điểm và cách thức tương tác tối ưu với khách hàng
                  </p>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="interaction-suggestions" className="rounded" />
                    <label htmlFor="interaction-suggestions">Bật gợi ý tương tác</label>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Phân tích cảm xúc</h3>
                  <p className="text-muted-foreground mb-4">
                    Phân tích cảm xúc từ tin nhắn và cuộc gọi để hiểu rõ hơn về khách hàng
                  </p>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="sentiment-analysis" className="rounded" />
                    <label htmlFor="sentiment-analysis">Bật phân tích cảm xúc</label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CustomerCare;