import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFabricInventory, useFabricVariants } from "@/hooks/useFabrics";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const FabricInventoryOverview = () => {
  const { data: inventory = [] } = useFabricInventory();
  const { data: variants = [] } = useFabricVariants();

  // Process inventory data for table display
  const inventoryData = inventory.map(item => ({
    ...item,
    fabricCode: item.fabric_variants?.variant_name || '',
    fabricType: item.fabric_variants?.fabric_types?.name || '',
    widthCode: item.fabric_variants?.width_code || '',
    warehouse: item.warehouses?.name || '',
    currentStockRolls: Math.floor(item.current_stock / 50), // Assuming 50m per roll
    currentStockMeters: item.current_stock,
  }));

  // Group by fabric type for chart
  const chartData = inventoryData.reduce((acc, item) => {
    const key = `${item.fabricCode} ${item.widthCode}`;
    const existing = acc.find(d => d.name === key);
    if (existing) {
      existing.meters += item.currentStockMeters;
      existing.rolls += item.currentStockRolls;
    } else {
      acc.push({
        name: key,
        meters: item.currentStockMeters,
        rolls: item.currentStockRolls,
      });
    }
    return acc;
  }, [] as Array<{ name: string; meters: number; rolls: number }>);

  // Calculate totals
  const totalRolls = inventoryData.reduce((sum, item) => sum + item.currentStockRolls, 0);
  const totalMeters = inventoryData.reduce((sum, item) => sum + item.currentStockMeters, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tổng số cuộn</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRolls}</div>
            <p className="text-xs text-muted-foreground">cuộn vải</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tổng số mét</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMeters.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">mét vải</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Loại vải</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{variants.length}</div>
            <p className="text-xs text-muted-foreground">loại khác nhau</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory Table */}
        <Card>
          <CardHeader>
            <CardTitle>Bảng tồn kho chi tiết</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã vải</TableHead>
                    <TableHead>Khổ vải</TableHead>
                    <TableHead>Tên vải</TableHead>
                    <TableHead className="text-center" colSpan={2}>Còn trong kho</TableHead>
                    <TableHead>Kho</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead colSpan={3}></TableHead>
                    <TableHead className="text-center">Cuộn</TableHead>
                    <TableHead className="text-center">Mét</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.fabricCode}</TableCell>
                      <TableCell>{item.widthCode}</TableCell>
                      <TableCell>{item.fabricType}</TableCell>
                      <TableCell className="text-center">{item.currentStockRolls}</TableCell>
                      <TableCell className="text-center">{item.currentStockMeters.toFixed(2)}</TableCell>
                      <TableCell>{item.warehouse}</TableCell>
                    </TableRow>
                  ))}
                  {inventoryData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Chưa có dữ liệu tồn kho
                      </TableCell>
                    </TableRow>
                  )}
                  {/* Total row */}
                  {inventoryData.length > 0 && (
                    <TableRow className="bg-muted/50 font-medium">
                      <TableCell colSpan={3}>Tổng</TableCell>
                      <TableCell className="text-center">{totalRolls}</TableCell>
                      <TableCell className="text-center">{totalMeters.toFixed(2)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Biểu đồ thể hiện tổng số mét vải các loại</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={10}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => [
                      `${Number(value).toFixed(2)} ${name === 'meters' ? 'mét' : 'cuộn'}`,
                      name === 'meters' ? 'Mét' : 'Cuộn'
                    ]}
                  />
                  <Bar dataKey="meters" fill="#3b82f6" name="meters" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};