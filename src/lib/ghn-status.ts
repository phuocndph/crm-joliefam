export const ghnStatusOptions = [
  { value: 'delivered', label: 'Đã giao hàng' },
  { value: 'self_delivered', label: 'Tự giao thành công' },
  { value: 'delivering', label: 'Đang giao hàng' },
  { value: 'storing', label: 'Đang lưu kho' },
  { value: 'transporting', label: 'Đang vận chuyển' },
  { value: 'sorting', label: 'Đang phân loại' },
  { value: 'picking', label: 'Đang lấy hàng' },
  { value: 'ready_to_pick', label: 'Sẵn sàng lấy hàng' },
  { value: 'picked', label: 'Đã lấy hàng' },
  { value: 'returned', label: 'Đã hoàn hàng' },
  { value: 'return', label: 'Chờ chuyển hoàn' },
  { value: 'waiting_to_return', label: 'Chờ hoàn hàng' },
  { value: 'returning', label: 'Đang hoàn hàng' },
  { value: 'return_transporting', label: 'Đang vận chuyển hoàn' },
  { value: 'return_sorting', label: 'Đang phân loại hoàn' },
  { value: 'return_fail', label: 'Hoàn hàng thất bại' },
  { value: 'delivery_fail', label: 'Giao hàng thất bại' },
  { value: 'exception', label: 'Bất thường' },
  { value: 'cancel', label: 'Đã hủy' },
  { value: 'cancelled', label: 'Đã hủy đơn' },
  { value: 'lost', label: 'Thất lạc' },
  { value: 'damage', label: 'Hư hỏng' },
  { value: 'money_collect_picking', label: 'Thu ti\u1ec1n ng\u01b0\u1eddi g\u1eedi' },
  { value: 'money_collect_delivering', label: 'Thu ti\u1ec1n ng\u01b0\u1eddi nh\u1eadn' },
  { value: 'ready_to_deliver', label: 'S\u1eb5n s\u00e0ng giao h\u00e0ng' },
  { value: 'delivery', label: '\u0110ang giao h\u00e0ng' },
  { value: 'nhap_hang_vao_buu_cuc_giao', label: 'Nh\u1eadp h\u00e0ng v\u00e0o b\u01b0u c\u1ee5c giao' },
  { value: 'local_only', label: 'Chưa đồng bộ GHN' },
];

const labels = new Map(ghnStatusOptions.map(({ value, label }) => [value, label]));
/** Known carrier keys always use our Vietnamese label, never an English provider echo. */
export function ghnStatusLabel(status?: string | null): string {
  return labels.get(status?.trim().toLowerCase() || '') || (status ? 'Tr\u1ea1ng th\u00e1i kh\u00e1c' : 'Ch\u01b0a c\u00f3 tr\u1ea1ng th\u00e1i');
}
