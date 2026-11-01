export function extractGhnExportCodes(rows: readonly (readonly unknown[])[]): string[] {
  if (rows.length > 100000) throw new Error('File tối đa 100.000 dòng. Hãy chia nhỏ file xuất GHN.');
  const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
  const headers = new Set(['mavandon','mavandonghn','ghnordercode','ordercode','trackingcode','trackingnumber']);
  let headerRow = -1, column = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const matches = rows[i].flatMap((value, index) => headers.has(normalize(value)) ? [index] : []);
    if (matches.length > 1) throw new Error('Có nhiều cột mã vận đơn. Chỉ giữ một cột mã GHN trước khi nhập.');
    if (matches.length === 1) { headerRow = i; column = matches[0]; break; }
  }
  if (column < 0) throw new Error('Không tìm thấy cột Mã vận đơn hoặc order_code trong file.');
  const codes = new Set<string>();
  for (let i = headerRow + 1; i < rows.length; i++) {
    const code = String(rows[i][column] ?? '').trim();
    if (!code) continue;
    if (!/^[A-Za-z0-9_-]{3,60}$/.test(code)) throw new Error(`Mã vận đơn không hợp lệ ở dòng ${i + 1}.`);
    codes.add(code);
  }
  if (!codes.size) throw new Error('File không có mã vận đơn.');
  return [...codes];
}

export function parseGhnCsv(text: string): string[][] {
  const delimiter = text.split(/\r?\n/,1)[0].split(';').length > text.split(/\r?\n/,1)[0].split(',').length ? ';' : ',';
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i+1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && char === delimiter) { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) { if (char === '\r' && text[i+1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) throw new Error('File CSV có dấu ngoặc kép chưa đóng.');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
