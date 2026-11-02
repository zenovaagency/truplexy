import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/theme';
import { Button, Tip } from '@/components/ui';

/**
 * Light / dark button for the top bar, with the same filled, outlined look as the search box. The sun and moon turn into each other, and the new
 * theme grows out of the button (see lib/theme.ts).
 */
export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const dark = resolved === 'dark';
  const label = `Switch to ${dark ? 'light' : 'dark'} theme`;
  const icon = 'absolute transition-all duration-300 ease-[var(--ease-out-expo)]';
  return (
    <Tip content={label}>
      <Button
        icon
        variant="ghost"
        className="rounded-full"
        aria-label={label}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          toggle({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        }}
      >
        <span className="relative grid size-[18px] place-items-center">
          <Sun className={cn(icon, dark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0')} />
          <Moon className={cn(icon, dark ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')} />
        </span>
      </Button>
    </Tip>
  );
}
