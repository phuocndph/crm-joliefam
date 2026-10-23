import { useState, type Ref } from 'react';
import { NavLink } from 'react-router-dom';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NavigationItem } from '@/lib/navigation-catalog';
import type { NavigationFavoriteResult } from '@/hooks/useNavigationFavorites';
import { toast } from '@/hooks/use-toast';

type Props = {
  id?: string;
  rowRef?: Ref<HTMLDivElement>;
  item: NavigationItem;
  active?: boolean;
  favorite?: boolean;
  onNavigate?: () => void;
  onToggleFavorite?: (id: NavigationItem['id']) => NavigationFavoriteResult;
  className?: string;
};

export function NavigationItemRow({ id, rowRef, item, active = false, favorite = false, onNavigate, onToggleFavorite, className }: Props) {
  const [pinMessage, setPinMessage] = useState('');
  const toggle = () => {
    const result = onToggleFavorite?.(item.id);
    if (result === 'limit') {
      setPinMessage('Đã đủ lối tắt. Bạn chỉ có thể ghim tối đa 4 chức năng.');
      toast({ title: 'Đã đủ lối tắt', description: 'Bạn chỉ có thể ghim tối đa 4 chức năng.' });
    }
    if (result === 'unavailable') {
      setPinMessage('Chức năng này hiện không thể ghim.');
      toast({ title: 'Không thể ghim', description: 'Chức năng này hiện không thể ghim.' });
    }
    if (result === 'added') setPinMessage(`Đã ghim ${item.label}.`);
    if (result === 'removed') setPinMessage(`Đã bỏ ghim ${item.label}.`);
  };
  const canPin = item.pinnable !== false && Boolean(onToggleFavorite);
  return <div ref={rowRef} id={id} className={cn('group flex h-10 items-center gap-1 rounded-md', active && 'bg-primary text-primary-foreground shadow-brand', className)}>
    <NavLink
      to={item.path}
      onClick={onNavigate}
      title={item.label}
      aria-current={active ? 'page' : undefined}
      className={cn('flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground', active && 'hover:bg-primary hover:text-primary-foreground')}
    >
      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </NavLink>
    {canPin && <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('mr-1 h-8 w-8 shrink-0', active && 'hover:bg-primary-foreground/15 hover:text-primary-foreground')}
      aria-label={favorite ? `Bỏ ghim ${item.label}` : `Ghim ${item.label}`}
      aria-pressed={favorite}
      title={favorite ? 'Bỏ ghim' : 'Ghim'}
      onClick={toggle}
    >
      <Star className={cn('h-4 w-4', favorite && 'fill-current')} aria-hidden="true" />
    </Button>}
    <span className="sr-only" aria-live="polite">{pinMessage}</span>
  </div>;
}
