
## Kế hoạch khắc phục 6 lỗi bảo mật

### Tổng quan các lỗi phát hiện

| # | Lỗi | Mức độ | Nguyên nhân |
|---|-----|--------|-------------|
| 1 | Service Role Key Exposed in Database Migration | Error | Hai file migration chứa hardcoded JWT token trong cron job |
| 2 | Edge Functions Missing Authentication Checks | Error | `ai-customer-suggestions` và `ghn-tracking` không kiểm tra xác thực |
| 3 | Products Table Allows Universal Write Access | Error | RLS policies với `USING (true)` cho INSERT/UPDATE/DELETE |
| 4 | Security Definer View | Error | View `payment_summary` dùng SECURITY DEFINER |
| 5 | Product Pricing and Cost Data Exposed to Competitors | Error | Mọi user authenticated đều xem được cost_price, price |
| 6 | Any Employee Can Delete or Modify Product Catalog | Error | Policies cho phép tất cả user thao tác products |

---

### Giải pháp chi tiết

#### 1. Edge Functions - Thêm Authentication Checks

**File: `supabase/functions/ai-customer-suggestions/index.ts`**

Thêm kiểm tra authentication vào đầu function:

```typescript
// Sau dòng const { customer, action_type } = await req.json()
const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
if (!authHeader) {
  return new Response(
    JSON.stringify({ error: 'Unauthorized' }),
    { status: 401, headers: corsHeaders }
  );
}

const supabaseAdmin = createClient(
  'https://kmxfljxsmnozvvgypdei.supabase.co',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader);
if (authError || !user) {
  return new Response(
    JSON.stringify({ error: 'Invalid token' }),
    { status: 401, headers: corsHeaders }
  );
}
```

**File: `supabase/functions/ghn-tracking/index.ts`**

Thêm authentication check cho các action `fetch_all_orders` và `track_order`:

```typescript
// Sau dòng const { action } = requestBody;
const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');

// Các action cần authentication
if (['fetch_all_orders', 'track_order'].includes(action)) {
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: corsHeaders }
    );
  }
  
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
  if (authError || !user) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid token' }),
      { status: 401, headers: corsHeaders }
    );
  }
}
```

---

#### 2. Database Migration - Xóa Service Role Key và cập nhật Cron Jobs

Tạo migration mới để:
- Xóa các cron jobs cũ chứa hardcoded keys
- Tạo lại với cách gọi an toàn hơn (không cần auth header vì ghn-auto-update đã có `verify_jwt = false`)

```sql
-- Xóa cron jobs cũ
SELECT cron.unschedule('ghn-tracking-hourly-sync');
SELECT cron.unschedule('update-ghn-tracking-hourly');

-- Tạo cron job mới không chứa key (function đã có verify_jwt = false)
SELECT cron.schedule(
  'ghn-auto-update-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kmxfljxsmnozvvgypdei.supabase.co/functions/v1/ghn-auto-update',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

---

#### 3. Products Table - Thay thế RLS Policies

Xóa các policies quá mở và thay bằng role-based policies:

```sql
-- Xóa policies cũ không an toàn
DROP POLICY IF EXISTS "Users can view products" ON products;
DROP POLICY IF EXISTS "Users can insert products" ON products;
DROP POLICY IF EXISTS "Users can update products" ON products;
DROP POLICY IF EXISTS "Users can delete products" ON products;

-- Tạo policies mới dựa trên role
-- Admins có toàn quyền (đã có)

-- Managers quản lý products của mình
CREATE POLICY "Managers can manage their products"
  ON products FOR ALL
  USING (
    has_role(auth.uid(), 'manager'::app_role) 
    AND (manager_id = (auth.uid())::text OR manager_id IS NULL)
  )
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND (manager_id = (auth.uid())::text OR manager_id IS NULL)
  );

-- Employees quản lý products của manager được gán
CREATE POLICY "Employees can manage their manager's products"
  ON products FOR ALL
  USING (
    has_role(auth.uid(), 'employee'::app_role) 
    AND manager_id IN (
      SELECT (assigned_by)::text 
      FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'employee'::app_role) 
    AND (manager_id IS NULL OR manager_id IN (
      SELECT (assigned_by)::text 
      FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'employee'::app_role
    ))
  );

-- Accountants chỉ xem, không sửa/xóa
CREATE POLICY "Accountants can view products"
  ON products FOR SELECT
  USING (has_role(auth.uid(), 'accountant'::app_role));
```

---

#### 4. Security Definer View - Chuyển sang SECURITY INVOKER

```sql
-- Xóa view cũ và tạo lại với SECURITY INVOKER
DROP VIEW IF EXISTS payment_summary;

CREATE VIEW payment_summary 
WITH (security_invoker = true) AS
SELECT 
  o.id AS order_id,
  o.order_number,
  o.payment_status,
  o.total_amount,
  o.payment_date AS final_payment_date,
  c.name AS customer_name,
  c.customer_code,
  COALESCE(sum(op.payment_amount), 0::numeric) AS total_paid,
  (o.total_amount - COALESCE(sum(op.payment_amount), 0::numeric)) AS remaining_amount,
  count(op.id) AS payment_count,
  min(op.payment_date) AS first_payment_date,
  max(op.payment_date) AS last_payment_date
FROM orders o
  LEFT JOIN order_payments op ON o.id = op.order_id
  LEFT JOIN customers c ON o.customer_id = c.id
GROUP BY o.id, o.order_number, o.payment_status, o.total_amount, o.payment_date, c.name, c.customer_code;
```

---

### Tổng kết file cần thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/functions/ai-customer-suggestions/index.ts` | Thêm authentication check |
| `supabase/functions/ghn-tracking/index.ts` | Thêm authentication check cho fetch_all_orders và track_order |
| Migration SQL mới | Xóa hardcoded keys, tạo cron job an toàn |
| Migration SQL mới | Thay thế RLS policies cho products |
| Migration SQL mới | Chuyển payment_summary sang SECURITY INVOKER |

---

### Lưu ý quan trọng

1. **Rotate Service Role Key**: Sau khi deploy, bạn cần vào Supabase Dashboard → Settings → API để rotate service role key vì key cũ đã bị lộ trong git history

2. **Test sau deploy**: Kiểm tra các chức năng sau:
   - Tạo/sửa/xóa products (với các role khác nhau)
   - Gọi AI suggestions
   - Theo dõi GHN tracking
   - Xem payment summary

3. **Không ảnh hưởng dữ liệu**: Các thay đổi này chỉ ảnh hưởng đến quyền truy cập, không xóa hay thay đổi dữ liệu hiện có
