import { useLocation } from 'react-router-dom';
import { Star } from 'lucide-react';
import {
  NAVIGATION_GROUPS,
  navigationItemsByGroup,
  navigationItemsInSection,
} from '@/lib/navigation-catalog';
import { NavigationItemRow } from '@/components/navigation/NavigationItemRow';
import { MobileNavigationGroup } from '@/components/navigation/MobileNavigationGroup';
import { NavigationSearch } from '@/components/navigation/NavigationSearch';
import { useNavigation } from '@/components/navigation/NavigationContext';

/** Full mobile menu. Visibility, search, and pins are shared with the drawer. */
export default function MobileMenu() {
  const location = useLocation();
  const { visibleItems, favoriteIds, visibleFavoriteItems, toggleFavorite } = useNavigation();
  const topItems = navigationItemsInSection(visibleItems, 'top');
  const accountItems = navigationItemsInSection(visibleItems, 'account');
  const active = (path: string) => location.pathname === path;
  const groupCount = NAVIGATION_GROUPS.reduce((count, group) => count + (navigationItemsByGroup(visibleItems, group.id).length ? 1 : 0), 0);

  if (!topItems.length && !groupCount && !accountItems.length) {
    return <div className="py-12 text-center text-muted-foreground">Bạn chưa được cấp quyền truy cập tính năng nào.<br />Vui lòng liên hệ quản trị viên.</div>;
  }

  return <div className="space-y-4">
    <NavigationSearch items={visibleItems} pathname={location.pathname} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} enableShortcut={false} />

    {topItems.length > 0 && <section className="space-y-1 rounded-lg border bg-card p-2">
      <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Truy cập nhanh</h2>
      {topItems.map(item => <NavigationItemRow key={item.id} item={item} active={active(item.path)} favorite={favoriteIds.includes(item.id)} onToggleFavorite={toggleFavorite} />)}
    </section>}

    {visibleFavoriteItems.length > 0 && <section className="space-y-1 rounded-lg border bg-card p-2">
      <h2 className="flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Star className="h-3.5 w-3.5 fill-current" />Đã ghim</h2>
      {visibleFavoriteItems.map(item => <NavigationItemRow key={`pin-${item.id}`} item={item} active={active(item.path)} favorite onToggleFavorite={toggleFavorite} />)}
    </section>}

    {NAVIGATION_GROUPS.map(group => {
      const items = navigationItemsByGroup(visibleItems, group.id);
      return items.length ? <section key={group.id} className="rounded-lg border bg-card p-2"><MobileNavigationGroup group={group} items={items} pathname={location.pathname} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} /></section> : null;
    })}

    {accountItems.length > 0 && <section className="space-y-1 rounded-lg border bg-card p-2">
      <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tài khoản</h2>
      {accountItems.map(item => <NavigationItemRow key={item.id} item={item} active={active(item.path)} />)}
    </section>}
  </div>;
}
