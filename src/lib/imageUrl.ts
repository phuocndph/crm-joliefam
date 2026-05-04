/**
 * Convert a Supabase Storage public URL into a transformed (resized + compressed)
 * version using the `/storage/v1/render/image/public/...` endpoint.
 *
 * Egress optimization: thumbnails (300×300, q=65) typically reduce image bytes
 * by 70-90% vs serving the original full-resolution upload.
 *
 * Falls back to the original URL if it doesn't look like a Supabase public URL.
 */
export function transformImageUrl(
  url: string | null | undefined,
  opts: { width?: number; height?: number; quality?: number; resize?: 'cover' | 'contain' | 'fill' } = {}
): string {
  if (!url) return '';
  // Only Supabase public storage URLs are supported
  const PUBLIC = '/storage/v1/object/public/';
  if (!url.includes(PUBLIC)) return url;

  const { width = 400, height, quality = 70, resize = 'contain' } = opts;
  const transformed = url.replace(PUBLIC, '/storage/v1/render/image/public/');
  const params = new URLSearchParams();
  if (width) params.set('width', String(width));
  if (height) params.set('height', String(height));
  if (quality) params.set('quality', String(quality));
  if (resize) params.set('resize', resize);
  const sep = transformed.includes('?') ? '&' : '?';
  return `${transformed}${sep}${params.toString()}`;
}