import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  NAVIGATION_GROUPS,
  navigationGroupForPath,
  navigationItemsByGroup,
  navigationItemsInSection,
  type NavigationGroupId,
  type NavigationGroup,
  type NavigationItem,
} from '@/lib/navigation-catalog';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sidebar, SidebarContent, useSidebar } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NavigationItemRow } from '@/components/navigation/NavigationItemRow';
import { useNavigation } from '@/components/navigation/NavigationContext';
import { cn } from '@/lib/utils';

const closedGroups = (): Record<NavigationGroupId, boolean> => ({
  sales: false, operations: false, delivery: false, people: false, finance: false, system: false,
});

function CollapsedNavigationLink({ item, active }: { item: NavigationItem; active: boolean }) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <NavLink
        to={item.path}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        className={cn('flex h-10 items-center justify-center rounded-md hover:bg-sidebar-accent', active && 'bg-sidebar-accent text-sidebar-accent-foreground')}
      >
        <item.icon className="h-4 w-4" aria-hidden="true" />
      </NavLink>
    </TooltipTrigger>
    <TooltipContent side="right">{item.label}</TooltipContent>
  </Tooltip>;
}

function CollapsedGroupPopover({ group, items, active, favoriteIds, onToggleFavorite }: {
  group: NavigationGroup;
  items: readonly NavigationItem[];
  active: (path: string) => boolean;
  favoriteIds: readonly string[];
  onToggleFavorite: ReturnType<typeof useNavigation>['toggleFavorite'];
}) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" title={group.label} aria-label={group.label} className="h-10 w-full"><group.icon className="h-4 w-4" /></Button></PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent side="right">{group.label}</TooltipContent>
    </Tooltip>
    <PopoverContent side="right" align="start" className="w-64 p-2">
      <p className="px-2 pb-1 text-sm font-semibold">{group.label}</p>
      {items.map(item => <NavigationItemRow key={item.id} item={item} active={active(item.path)} favorite={favoriteIds.includes(item.id)} onToggleFavorite={onToggleFavorite} onNavigate={() => setOpen(false)} />)}
    </PopoverContent>
  </Popover>;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { visibleItems, favoriteIds, visibleFavoriteItems, toggleFavorite } = useNavigation();
  const activeGroup = navigationGroupForPath(location.pathname, visibleItems);
  const [openGroups, setOpenGroups] = useState<Record<NavigationGroupId, boolean>>(() => ({
    ...closedGroups(),
    ...(activeGroup ? { [activeGroup]: true } : {}),
  }));
  const topItems = navigationItemsInSection(visibleItems, 'top');
  const accountItems = navigationItemsInSection(visibleItems, 'account');
  const active = (path: string) => location.pathname === path;

  useEffect(() => {
    if (activeGroup) setOpenGroups(current => current[activeGroup] ? current : { ...current, [activeGroup]: true });
  }, [activeGroup]);

  return <Sidebar className="border-r bg-sidebar" collapsible="icon">
    <SidebarContent className="flex h-full p-2">
      {!collapsed && <div className="px-2 py-2"><p className="text-sm font-semibold text-sidebar-foreground">Điều hướng</p><p className="text-xs text-sidebar-foreground/60">Ctrl B để thu gọn menu</p></div>}
      <nav className="min-h-0 space-y-1 overflow-y-auto" aria-label="Điều hướng chính">
        {!collapsed && topItems.map(item => <NavigationItemRow key={item.id} item={item} active={active(item.path)} favorite={favoriteIds.includes(item.id)} onToggleFavorite={toggleFavorite} />)}
        {collapsed && <div className="space-y-1">{topItems.map(item => <CollapsedNavigationLink key={item.id} item={item} active={active(item.path)} />)}</div>}

        {!collapsed && visibleFavoriteItems.length > 0 && <section className="border-y py-2" aria-label="Đã ghim">
          <p className="flex items-center gap-2 px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60"><Star className="h-3.5 w-3.5 fill-current" />Đã ghim</p>
          {visibleFavoriteItems.map(item => <NavigationItemRow key={`pin-${item.id}`} item={item} active={active(item.path)} favorite onToggleFavorite={toggleFavorite} />)}
        </section>}

        {NAVIGATION_GROUPS.map(group => {
          const items = navigationItemsByGroup(visibleItems, group.id);
          if (!items.length) return null;
          if (collapsed) return <CollapsedGroupPopover key={group.id} group={group} items={items} active={active} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} />;

          const expanded = openGroups[group.id];
          return <section key={group.id} className="border-b border-sidebar-border/60 pb-1">
            <Button type="button" variant="ghost" className="h-10 w-full justify-start gap-2 px-2 text-sm font-semibold" aria-expanded={expanded} onClick={() => setOpenGroups(current => ({ ...current, [group.id]: !current[group.id] }))}>
              <group.icon className="h-4 w-4" /><span className="flex-1 text-left">{group.label}</span>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            {expanded && <div className="space-y-1 pb-1">{items.map(item => <NavigationItemRow key={item.id} item={item} active={active(item.path)} favorite={favoriteIds.includes(item.id)} onToggleFavorite={toggleFavorite} />)}</div>}
          </section>;
        })}
      </nav>
      {!collapsed && accountItems.length > 0 && <footer className="mt-auto border-t pt-2" aria-label="Tài khoản">
        <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">Tài khoản</p>
        {accountItems.map(item => <NavigationItemRow key={item.id} item={item} active={active(item.path)} />)}
      </footer>}
      {collapsed && accountItems.length > 0 && <div className="mt-auto space-y-1 border-t pt-2">{accountItems.map(item => <CollapsedNavigationLink key={item.id} item={item} active={active(item.path)} />)}</div>}
    </SidebarContent>
  </Sidebar>;
}
