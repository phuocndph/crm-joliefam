import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_NAVIGATION_PINS,
  NAVIGATION_CATALOG,
  navigationFavoritesStorageKey,
  parseNavigationFavoriteIds,
  sanitizeNavigationFavoriteIds,
  type NavigationItem,
  type NavigationRouteId,
} from '@/lib/navigation-catalog';

export type NavigationFavoriteResult = 'added' | 'removed' | 'limit' | 'unavailable';

type Input = {
  actorId: string | null | undefined;
  isLocalBackend: boolean;
  visibleItems: readonly NavigationItem[];
  /** Permission and identity lookups have completed, so pruning is safe to persist. */
  accessResolved?: boolean;
};

const currentOrigin = () => typeof window === 'undefined' ? '' : window.location.origin;
const sameIds = (left: readonly NavigationRouteId[], right: readonly NavigationRouteId[]) => left.length === right.length && left.every((id, index) => id === right[index]);

/**
 * Pins are stored per actor/backend/origin. Before permissions resolve, pins are
 * hidden from the UI but retained in storage; otherwise a transient empty
 * permission response could erase a user's shortcuts.
 */
export function useNavigationFavorites({ actorId, isLocalBackend, visibleItems, accessResolved = true }: Input) {
  const storageKey = useMemo(() => navigationFavoritesStorageKey({ actorId, isLocalBackend, origin: currentOrigin() }), [actorId, isLocalBackend]);
  const [storedIds, setStoredIds] = useState<NavigationRouteId[]>([]);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const latest = useRef<NavigationRouteId[]>([]);
  const loadedKeyRef = useRef<string | null>(null);
  const visibleRef = useRef(visibleItems);
  visibleRef.current = visibleItems;

  const favoriteIds = useMemo(() => {
    if (!accessResolved || !storageKey || loadedStorageKey !== storageKey) return [];
    return sanitizeNavigationFavoriteIds(storedIds, visibleItems);
  }, [accessResolved, loadedStorageKey, storageKey, storedIds, visibleItems]);

  const commit = useCallback((next: NavigationRouteId[]) => {
    if (!storageKey || loadedKeyRef.current !== storageKey) return false;
    latest.current = next;
    setStoredIds(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { /* Storage is optional; retain the choice in memory for this tab. */ }
    return true;
  }, [storageKey]);

  useEffect(() => {
    latest.current = [];
    loadedKeyRef.current = null;
    setStoredIds([]);
    setLoadedStorageKey(null);
    if (!storageKey || typeof window === 'undefined') return;

    let initial: NavigationRouteId[] = [];
    try {
      // Parse against canonical pinnable routes, not the temporarily visible set.
      initial = parseNavigationFavoriteIds(window.localStorage.getItem(storageKey), NAVIGATION_CATALOG);
    } catch { /* Keep the current tab usable when storage is blocked. */ }
    latest.current = initial;
    loadedKeyRef.current = storageKey;
    setStoredIds(initial);
    setLoadedStorageKey(storageKey);

    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      const next = parseNavigationFavoriteIds(event.newValue, NAVIGATION_CATALOG);
      latest.current = next;
      setStoredIds(next);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [storageKey]);

  useEffect(() => {
    if (!accessResolved || !storageKey || loadedStorageKey !== storageKey) return;
    const pruned = sanitizeNavigationFavoriteIds(storedIds, visibleItems);
    if (!sameIds(pruned, storedIds)) commit(pruned);
  }, [accessResolved, commit, loadedStorageKey, storageKey, storedIds, visibleItems]);

  const toggleFavorite = useCallback((id: NavigationRouteId): NavigationFavoriteResult => {
    if (!accessResolved || !storageKey || loadedKeyRef.current !== storageKey) return 'unavailable';
    const item = visibleRef.current.find(candidate => candidate.id === id);
    if (!item || item.pinnable === false) return 'unavailable';
    const current = sanitizeNavigationFavoriteIds(latest.current, visibleRef.current);
    if (current.includes(id)) return commit(current.filter(candidate => candidate !== id)) ? 'removed' : 'unavailable';
    if (current.length >= MAX_NAVIGATION_PINS) return 'limit';
    return commit([...current, id]) ? 'added' : 'unavailable';
  }, [accessResolved, commit, storageKey]);

  const visibleFavoriteItems = favoriteIds
    .map(id => visibleItems.find(item => item.id === id))
    .filter((item): item is NavigationItem => Boolean(item));

  return { favoriteIds, visibleFavoriteItems, toggleFavorite, maxPins: MAX_NAVIGATION_PINS };
}
