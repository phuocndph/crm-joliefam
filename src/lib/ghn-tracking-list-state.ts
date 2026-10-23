export function clampGhnTrackingPage(page: number, total: number, pageSize: number) {
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 1;
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / safePageSize));
  const requestedPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  return Math.min(requestedPage, totalPages);
}

export function createGhnTrackingRequestGate() {
  let latest = 0;
  return {
    invalidate: () => ++latest,
    isCurrent: (request: number) => request === latest,
  };
}

export function canLoadGhnTrackingSearch(rawSearch: string, debouncedSearch: string) {
  return rawSearch === debouncedSearch;
}

export interface GhnTrackingQuerySnapshot {
  userId: string;
  authReady: boolean;
  role: string;
  page: number;
  pageSize: number;
  status: string;
  sortBy: string;
  sortOrder: string;
  rawSearch: string;
  debouncedSearch: string;
  searchPending: boolean;
}

export function ghnTrackingQueryFingerprint(snapshot: GhnTrackingQuerySnapshot) {
  return JSON.stringify([
    snapshot.userId, snapshot.authReady, snapshot.role, snapshot.page, snapshot.pageSize,
    snapshot.status, snapshot.sortBy, snapshot.sortOrder, snapshot.rawSearch,
    snapshot.debouncedSearch, snapshot.searchPending,
  ]);
}
