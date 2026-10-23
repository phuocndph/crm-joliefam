/** Local-only matching against GHN master data. Never sends the address anywhere. */
export type AddressLevel = 'province' | 'district' | 'ward';
export type GhnProvince = { ProvinceID: number; ProvinceName: string; NameExtension?: string[] | null };
export type GhnDistrict = { DistrictID: number; DistrictName: string; NameExtension?: string[] | null };
export type GhnWard = { WardCode: string; WardName: string; NameExtension?: string[] | null };
export type AddressMatch<T> = { kind: 'unique'; value: T } | { kind: 'missing' | 'ambiguous' };

export function normalizeGhnAddress(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/\btp\s*\.?\s*hcm\b|\btphcm\b/g, ' thanh pho ho chi minh ')
    .replace(/\bhcm\b/g, 'ho chi minh')
    .replace(/\b(tp|tx|tt|q|p|h|x)\s*\./g, '$1 ')
    .replace(/\b(q|p|h|x)(?=\d)/g, '$1 ')
    .replace(/\b(quan|phuong|huyen|xa)(?=\d)/g, '$1 ')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\b0+(\d+)\b/g, '$1')
    .replace(/\b(tp|tx|tt|q|p|h|x)\b/g, unit => ({tp:'thanh pho',tx:'thi xa',tt:'thi tran',q:'quan',p:'phuong',h:'huyen',x:'xa'}[unit]!))
    .replace(/\s+/g, ' ').trim();
}

const prefixes: Record<AddressLevel, string[]> = {
  province: ['thanh pho', 'tinh'],
  district: ['quan', 'huyen', 'thanh pho', 'thi xa'],
  ward: ['phuong', 'xa', 'thi tran'],
};
const allPrefixes = /^(?:thanh pho|tinh|quan|huyen|thi xa|phuong|xa|thi tran)\s+/;

export function matchGhnAddress<T>(address: string, rows: readonly T[], level: AddressLevel,
  id: (row: T) => string | number, name: (row: T) => string, aliases: (row: T) => readonly string[] = () => []): AddressMatch<T> {
  const segments = address.split(/[,;\n\r]+/).map(normalizeGhnAddress).filter(Boolean);
  const matches = new Map<string, T>();
  for (const row of rows) {
    const names = new Set([name(row), ...aliases(row)].filter(value => typeof value === 'string')
      .map(normalizeGhnAddress).map(value => value.replace(allPrefixes, '')).filter(Boolean));
    const matched = [...names].some(value => segments.some(segment => {
      // Bare names only count as an entire administrative segment, never a road substring.
      if (!/^\d+$/.test(value) && segment === value) return true;
      return prefixes[level].some(prefix => {
        const phrase = prefix + ' ' + value;
        let start = segment.indexOf(phrase);
        while (start !== -1) {
          const end = start + phrase.length;
          const before = segment.slice(0, start);
          const remainder = segment.slice(end).trim();
          if ((start === 0 || segment[start - 1] === ' ') && (end === segment.length || segment[end] === ' ')
            && (!remainder || allPrefixes.test(remainder))
            && !/(?:duong|pho|ngo|hem|ngach)\s*$/.test(before)) return true;
          start = segment.indexOf(phrase, start + 1);
        }
        return false;
      });
    }));
    if (matched) matches.set(String(id(row)), row);
  }
  if (matches.size > 1) return { kind: 'ambiguous' };
  if (!matches.size) return { kind: 'missing' };
  return { kind: 'unique', value: matches.values().next().value! };
}

export const matchProvince = (address: string, rows: readonly GhnProvince[]) => matchGhnAddress(address, rows, 'province', row => row.ProvinceID, row => row.ProvinceName, row => row.NameExtension || []);
export const matchDistrict = (address: string, rows: readonly GhnDistrict[]) => matchGhnAddress(address, rows, 'district', row => row.DistrictID, row => row.DistrictName, row => row.NameExtension || []);
export const matchWard = (address: string, rows: readonly GhnWard[]) => matchGhnAddress(address, rows, 'ward', row => row.WardCode, row => row.WardName, row => row.NameExtension || []);

export type AddressTailMatch<T> = { kind: 'unique'; value: T; rest: string } | { kind: 'missing' | 'ambiguous' };
const roadEnd = /(?:^|\s)(?:duong|pho|ngo|hem|ngach)$/;
const directoryNames = (name: string, aliases: readonly string[]) => [...new Set([name, ...aliases]
  .filter(value => typeof value === 'string').map(normalizeGhnAddress).map(value => value.replace(allPrefixes, '')).filter(Boolean))];

/** Exploratory only: a bare province tail must never commit a partial hierarchy. */
export function matchGhnAddressTail<T>(address: string, rows: readonly T[], level: AddressLevel,
  id: (row: T) => string | number, name: (row: T) => string, aliases: (row: T) => readonly string[] = () => []): AddressTailMatch<T> {
  const text = normalizeGhnAddress(address);
  const matches = new Map<string, { value: T; rest: string; length: number }>();
  for (const row of rows) {
    let best: { value: T; rest: string; length: number } | undefined;
    for (const value of directoryNames(name(row), aliases(row))) {
      const phrases = prefixes[level].map(prefix => prefix + ' ' + value);
      if (!/^\d+$/.test(value)) phrases.push(value);
      for (const phrase of phrases) {
        if (text !== phrase && !text.endsWith(' ' + phrase)) continue;
        const rest = text.slice(0, text.length - phrase.length).trim();
        if (!best || best.length < phrase.length) best = { value: row, rest, length: phrase.length };
      }
    }
    if (best) matches.set(String(id(row)), best);
  }
  // Prefer the longest administrative phrase, e.g. An Phu over Phu.
  const longest = Math.max(0, ...[...matches.values()].map(row => row.length));
  // A blocked long name must also block shorter names from other rows. Otherwise
  // “đường Bến Nghé” could fall back to an unrelated ward named “Nghé”.
  const candidates = [...matches.values()].filter(row => row.length === longest && !roadEnd.test(row.rest));
  if (candidates.length > 1) return { kind: 'ambiguous' };
  return candidates.length ? { kind: 'unique', value: candidates[0].value, rest: candidates[0].rest } : { kind: 'missing' };
}

export const matchProvinceTail = (address: string, rows: readonly GhnProvince[]) => matchGhnAddressTail(address, rows, 'province', row => row.ProvinceID, row => row.ProvinceName, row => row.NameExtension || []);
export const matchDistrictTail = (address: string, rows: readonly GhnDistrict[]) => matchGhnAddressTail(address, rows, 'district', row => row.DistrictID, row => row.DistrictName, row => row.NameExtension || []);
export const matchWardTail = (address: string, rows: readonly GhnWard[]) => matchGhnAddressTail(address, rows, 'ward', row => row.WardCode, row => row.WardName, row => row.NameExtension || []);

/** Prefix filtering for a directory control; no fuzzy or substring matches. */
export function filterGhnDirectory<T>(query: string, rows: readonly T[], level: AddressLevel,
  name: (row: T) => string, aliases: (row: T) => readonly string[] = () => []): T[] {
  const normalized = normalizeGhnAddress(query);
  if (!normalized) return [...rows];
  return rows.filter(row => directoryNames(name(row), aliases(row)).some(value =>
    [value, ...prefixes[level].map(prefix => prefix + ' ' + value)].some(phrase => phrase.startsWith(normalized))));
}

/** Inline hints require a separated segment or an explicit administrative prefix. */
export function ghnAddressSuggestionQuery(address: string, level: AddressLevel): string | null {
  const segments = address.split(/[,;\n\r–—-]+/);
  const tail = normalizeGhnAddress(segments[segments.length - 1]);
  if (!tail) return null;
  const markers = prefixes[level].flatMap(prefix => {
    const index = tail.lastIndexOf(prefix + ' ');
    return index >= 0 && (index === 0 || tail[index - 1] === ' ') && !roadEnd.test(tail.slice(0, index).trim()) ? [index] : [];
  });
  if (markers.length) return tail.slice(Math.max(...markers));
  if (segments.length > 1 || !/\d/.test(tail)) return tail;
  return null;
}

/** One shared generation for typing, manual selection and dialog lifecycle. */
export function createAddressGeneration() {
  let generation = 0;
  return { next: () => ++generation, capture: () => generation, current: (token: number) => generation === token };
}
