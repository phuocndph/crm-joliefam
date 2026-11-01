import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { NavigationFavoriteResult } from '@/hooks/useNavigationFavorites';
import type { NavigationGroup, NavigationItem } from '@/lib/navigation-catalog';
import { Button } from '@/components/ui/button';
import { NavigationItemRow } from './NavigationItemRow';

type Props = {
  group: NavigationGroup;
  items: readonly NavigationItem[];
  pathname: string;
  favoriteIds: readonly string[];
  onToggleFavorite: (id: NavigationItem['id']) => NavigationFavoriteResult;
  onNavigate?: () => void;
};

/** Mobile groups start closed, except the one containing the active route. */
export function MobileNavigationGroup({ group, items, pathname, favoriteIds, onToggleFavorite, onNavigate }: Props) {
  const containsActiveRoute = items.some(item => item.path === pathname);
  const [open, setOpen] = useState(containsActiveRoute);

  useEffect(() => {
    if (containsActiveRoute) setOpen(true);
  }, [containsActiveRoute]);

  return <section className="space-y-1">
    <Button type="button" variant="ghost" className="h-10 w-full justify-start gap-2 px-2 text-sm font-semibold" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <group.icon className="h-4 w-4" /><span className="flex-1 text-left">{group.label}</span><span className="text-xs font-normal text-muted-foreground">{items.length}</span>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </Button>
    {open && <div className="ml-3 space-y-1 border-l border-sidebar-border/50 pb-1 pl-2">{items.map(item => <NavigationItemRow key={item.id} item={item} active={item.path === pathname} favorite={favoriteIds.includes(item.id)} onToggleFavorite={onToggleFavorite} onNavigate={onNavigate} />)}</div>}
  </section>;
}
