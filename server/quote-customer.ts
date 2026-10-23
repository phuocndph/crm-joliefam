import type { PoolClient } from 'pg';

type CustomerIdentity = { name: string; phone: string; email: string; address: string };
export type QuoteCustomerCandidate = CustomerIdentity & { id: string; is_active: boolean };
type Quote = Record<string, unknown>;
const clean = (value: unknown) => String(value ?? '').trim();
export const quoteCustomerNameKey = (value: unknown) => clean(value).normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase('vi');
export const quoteCustomerPhoneKey = (value: unknown) => {
  const digits = clean(value).replace(/\D/g, '');
  return /^(?:84|0084)\d{9,10}$/.test(digits) ? '0' + digits.replace(/^(?:0084|84)/, '') : digits;
};
export const quoteCustomerCandidate = (row: Quote): QuoteCustomerCandidate => ({
  id: clean(row.id), name: clean(row.name), phone: clean(row.phone), email: clean(row.email), address: clean(row.address), is_active: row.is_active !== false,
});
const conflict = (rows: Quote[]) => Object.assign(new Error('Có nhiều khách hàng phù hợp hoặc thông tin liên hệ thuộc khách khác. Hãy chọn khách hàng bên dưới rồi lưu lại.'), {
  status: 409, code: 'QUOTE_CUSTOMER_CONFLICT', candidates: rows.slice(0, 20).map(quoteCustomerCandidate),
});
/** Only this bounded DTO may leave the resolver; never expose full customer rows. */
export const quoteCustomerConflictDetails = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'QUOTE_CUSTOMER_CONFLICT') return null;
  const rows = 'candidates' in error && Array.isArray(error.candidates) ? error.candidates : [];
  return { code: 'QUOTE_CUSTOMER_CONFLICT', candidates: rows.slice(0, 20).filter(row => row && typeof row === 'object').map(quoteCustomerCandidate) };
};

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
    // FOR SHARE also blocks non-key ownership changes until the quote commits.
    const result = await client.query('select id,manager_id from local_customers where id=$1 for share', [retainedId]);
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
  const result = await client.query('select id,name,phone,email,address,is_active,manager_id from local_customers where manager_id is not distinct from $1 order by id', [managerId]);
  const name = quoteCustomerNameKey(identity.name), phone = quoteCustomerPhoneKey(identity.phone), email = quoteCustomerNameKey(identity.email);
  const relevant = result.rows.filter(row => quoteCustomerNameKey(row.name) === name || (phone && quoteCustomerPhoneKey(row.phone) === phone) || (email && quoteCustomerNameKey(row.email) === email));
  if (relevant.length) {
    const matches = relevant.filter(row => {
      if (quoteCustomerNameKey(row.name) !== name || row.is_active === false) return false;
      // A delivery address is a quote snapshot, never evidence of a different person.
      const keys: Array<[string, string]> = [[phone, quoteCustomerPhoneKey(row.phone)], [email, quoteCustomerNameKey(row.email)]];
      if (keys.some(([incoming, stored]) => incoming && stored && incoming !== stored)) return false;
      return !(phone || email) || !(quoteCustomerPhoneKey(row.phone) || quoteCustomerNameKey(row.email)) || keys.some(([incoming, stored]) => incoming && incoming === stored);
    });
    const contactOtherName = relevant.some(row => quoteCustomerNameKey(row.name) !== name);
    if (matches.length === 1 && !contactOtherName) {
      const before = matches[0];
      const locked = (await client.query('select id,name,phone,email,address,is_active,manager_id from local_customers where id=$1 for share', [before.id])).rows[0];
      // The scan may have waited behind a concurrent master edit. Revalidate the
      // latest owner and identity while holding the lock through quote commit.
      if (!locked || (locked.manager_id ?? null) !== managerId || locked.is_active === false ||
        quoteCustomerNameKey(locked.name) !== quoteCustomerNameKey(before.name) ||
        quoteCustomerPhoneKey(locked.phone) !== quoteCustomerPhoneKey(before.phone) ||
        quoteCustomerNameKey(locked.email) !== quoteCustomerNameKey(before.email)) {
        const current = await client.query('select id,name,phone,email,address,is_active from local_customers where manager_id is not distinct from $1 and id=any($2::text[]) order by id limit 20', [managerId, relevant.map(row => row.id)]);
        throw conflict(current.rows);
      }
      return locked.id;
    }
    // Only clearly distinct strong contacts may create another same-name person.
    // Inactive collisions remain visible for deliberate selection, never duplicated.
    const clearlyDistinct = !matches.length && !contactOtherName && Boolean(phone || email) && relevant.every(row => {
      if (row.is_active === false) return false;
      const storedPhone = quoteCustomerPhoneKey(row.phone), storedEmail = quoteCustomerNameKey(row.email);
      return Boolean((phone && storedPhone && phone !== storedPhone) || (email && storedEmail && email !== storedEmail)) &&
        !(phone && phone === storedPhone) && !(email && email === storedEmail);
    });
    if (!clearlyDistinct) throw conflict(relevant);
  }
  const inserted = await client.query(`insert into local_customers(name,phone,email,address,manager_id,tenant_id,is_snapshot_record,local_modified_at)
    values($1,$2,$3,$4,$5,$6,false,now()) returning id`, [identity.name, identity.phone || null, identity.email || null, identity.address || null, managerId, previous?.tenant_id || body.tenant_id || 'local-tenant']);
  return inserted.rows[0].id;
}
