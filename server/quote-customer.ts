import type { PoolClient } from 'pg';

type CustomerIdentity = { name: string; phone: string; email: string; address: string };
type Quote = Record<string, unknown>;
const clean = (value: unknown) => String(value ?? '').trim();
const normalized = (value: unknown) => clean(value).normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const phoneKey = (value: unknown) => clean(value).replace(/[\s().+-]/g, '');
const conflict = () => Object.assign(new Error('Thông tin khách hàng trùng hoặc không khớp. Vui lòng chọn đúng khách hàng từ danh sách gợi ý.'), { status: 409 });

export const quoteCustomerIdentity = (body: Quote): CustomerIdentity | null => {
  if (body.customer && typeof body.customer === 'object' && !Array.isArray(body.customer)) {
    const value = body.customer as Quote;
    return { name: clean(value.name), phone: clean(value.phone), email: clean(value.email), address: clean(value.address) };
  }
  // Older quotes stored these fields only in notes. Match one line at a time.
  const notes = clean(body.notes);
  const read = (label: string) => notes.match(new RegExp(`^${label}:[ \\t]*([^\\r\\n]*)`, 'm'))?.[1]?.trim() || '';
  const name = read('Khách hàng');
  return name ? { name, phone: read('Điện thoại'), email: read('Email'), address: read('Địa chỉ') } : null;
};

/** Must run inside the same transaction as the quote/order write. Never edits a customer master. */
export async function resolveQuoteCustomer(client: PoolClient, body: Quote, previous?: Quote, legacy = false): Promise<string | null> {
  const managerId = previous ? previous.manager_id ?? null : body.manager_id ?? null;
  const explicitId = clean(body.customer_id);
  const retainedId = explicitId || (!body.customer ? clean(previous?.customer_id) : '');
  if (retainedId) {
    const result = await client.query('select id,manager_id from local_customers where id=$1 for key share', [retainedId]);
    const customer = result.rows[0];
    if (!customer) throw Object.assign(new Error('Không tìm thấy khách hàng đã chọn. Vui lòng chọn lại khách hàng.'), { status: 400 });
    if ((customer.manager_id ?? null) !== managerId) throw Object.assign(new Error('Khách hàng không thuộc người quản lý của báo giá.'), { status: 403 });
    return customer.id;
  }
  // A null from an older client must not erase an existing relationship.
  const identity = body.customer ? quoteCustomerIdentity(body) : legacy ? quoteCustomerIdentity(previous || body) : null;
  if (!identity?.name) {
    if (body.customer || legacy) throw Object.assign(new Error('Vui lòng nhập hoặc chọn khách hàng trước khi lưu/duyệt báo giá.'), { status: 400 });
    return null;
  }
  // Serialize resolutions for an owner, including differently formatted contact data.
  await client.query("select pg_advisory_xact_lock(hashtextextended('quote-customer-owner:' || coalesce($1::text,'<unassigned>'),0))", [managerId]);
  const result = await client.query('select id,name,phone,email,address from local_customers where manager_id is not distinct from $1', [managerId]);
  const name = normalized(identity.name), phone = phoneKey(identity.phone), email = normalized(identity.email), address = normalized(identity.address);
  const relevant = result.rows.filter(row => normalized(row.name) === name || (phone && phoneKey(row.phone) === phone) || (email && normalized(row.email) === email));
  if (relevant.length) {
    const matches = relevant.filter(row => {
      if (normalized(row.name) !== name) return false;
      const keys: Array<[string, string]> = [[phone, phoneKey(row.phone)], [email, normalized(row.email)], [address, normalized(row.address)]];
      if (keys.some(([incoming, stored]) => incoming && stored && incoming !== stored)) return false;
      const suppliedContact = phone || email || address;
      return !suppliedContact || keys.some(([incoming, stored]) => incoming && incoming === stored);
    });
    // Same-name people with different contacts are common. An exact contact may
    // disambiguate them, but never resolve a contact attached to a different name.
    if (matches.length !== 1 || relevant.some(row => normalized(row.name) !== name)) throw conflict();
    return matches[0].id;
  }
  const inserted = await client.query(`insert into local_customers(name,phone,email,address,manager_id,tenant_id,is_snapshot_record,local_modified_at)
    values($1,$2,$3,$4,$5,$6,false,now()) returning id`, [identity.name, identity.phone || null, identity.email || null, identity.address || null, managerId, previous?.tenant_id || body.tenant_id || 'local-tenant']);
  return inserted.rows[0].id;
}
