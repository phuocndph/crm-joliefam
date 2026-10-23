const validParts = (bucket: string, objectPath: string) => /^[A-Za-z0-9_-]+$/.test(bucket) && objectPath.length > 0 && !objectPath.includes('\\') && !objectPath.split('/').some(part => !part || part === '.' || part === '..') && !/[\x00-\x1f]/.test(objectPath);

export function normalizeStorageUrl(value: string): string {
  try {
    const url = new URL(value, 'https://local.invalid');
    let bucket: string, objectPath: string;
    const local = url.pathname.match(/^\/api\/local-storage\/([^/]+)\/object$/);
    if (local) { bucket = decodeURIComponent(local[1]); objectPath = url.searchParams.get('path') || ''; }
    else {
      // Only official Supabase origins, never unrelated URLs with matching paths.
      if (!/^https?:$/.test(url.protocol) || !/^[a-z0-9-]+\.supabase\.(?:co|in)$/.test(url.hostname)) return value;
      const match = url.pathname.match(/^\/storage\/v1\/(?:object\/(?:public|sign|authenticated)|render\/image\/(?:public|sign|authenticated))\/([^/]+)\/(.+)$/);
      if (!match) return value;
      bucket = decodeURIComponent(match[1]); objectPath = decodeURIComponent(match[2]);
    }
    if (!validParts(bucket, objectPath)) return value;
    return `/api/local-storage/${encodeURIComponent(bucket)}/object?path=${encodeURIComponent(objectPath)}`;
  } catch { return value; }
}

export function rewriteStorageUrls(value: unknown, depth = 0): unknown {
  if (depth > 40) return value;
  if (typeof value === 'string') {
    if (/^(?:https?:\/\/|\/api\/local-storage\/)/i.test(value)) return normalizeStorageUrl(value);
    // JSON fields such as items and template settings may still be serialized.
    if (/^\s*[\[{]/.test(value)) {
      try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object') return JSON.stringify(rewriteStorageUrls(parsed, depth + 1)); } catch { /* ordinary text */ }
    }
    return value;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) return value.map(item => rewriteStorageUrls(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteStorageUrls(item, depth + 1)]));
  return value;
}
