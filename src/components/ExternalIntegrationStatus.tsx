import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { localApi } from '@/lib/local-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Status = { ghn: { configured: boolean; source?: 'server_env'|'saved'|'disabled'; configured_shop_count?: number }; tax: { configured: boolean } };
export default function ExternalIntegrationStatus() {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; setError(''); localApi.externalIntegrationStatus().then(value => { if (active) setStatus(value); }).catch(() => { if (active) setError('Không tải được trạng thái tích hợp.'); }); return () => { active = false; }; }, [attempt]);
  return <Card><CardHeader><CardTitle>Tích hợp trên máy chủ</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
    {error ? <p role="alert">{error} <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Thử lại</Button></p> : !status ? <p>Đang tải trạng thái…</p> : <>
      <p>GHN: {status.ghn.configured ? `Đã cấu hình từ ${status.ghn.source === 'saved' ? 'cài đặt đã lưu' : 'biến máy chủ'}; hỗ trợ tạo đơn, tra cứu, tính cước và in lại phiếu A5 cho vận đơn đã lưu.` : status.ghn.source === 'disabled' ? 'Đã tắt rõ ràng trong Cài đặt API.' : 'Chưa có cấu hình GHN khả dụng.'}</p>
      <p>Quản trị viên quản lý khóa và shop tại <Link to="/api-settings" className="underline">Cài đặt API</Link>.</p>
      <p>Sửa và hủy vận đơn thực hiện trên cổng GHN; CRM chỉ hỗ trợ in lại A5 cho mã đã lưu và được phép truy cập.</p>
      <p>Mã số thuế: VietQR không cần khóa và chỉ được tra cứu khi sử dụng.</p>
      <p>Hóa đơn điện tử: chỉ lưu bản nháp; chưa phát hành hóa đơn thật.</p>
      <p>Gợi ý địa chỉ Goong: chưa được tích hợp.</p>
      <p>AI sử dụng cấu hình tại trang này. Trạng thái có cấu hình chưa xác nhận nhà cung cấp đang kết nối thành công.</p>
    </>}
  </CardContent></Card>;
}
