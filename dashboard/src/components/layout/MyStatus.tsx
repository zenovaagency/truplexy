import { useMe } from '@/lib/api/endpoints/account';
import { useMembers, useSetMyAvailability } from '@/lib/api/endpoints/business';
import type { Availability } from '@/lib/api/types';
import { AVAILABILITIES, AVAILABILITY_LABEL, PRESENCE_LABEL, presenceOf } from '@/lib/support';
import { MenuRadioGroup, MenuRadioItem, MenuSub, MenuSubContent, MenuSubTrigger } from '@/components/ui';
import { StatusDot } from '@/components/domain/support';

const HINT: Record<Availability, string> = {
  available: 'New tickets can be assigned to you.',
  away: 'You keep your tickets, but get no new ones.',
  offline: 'You keep your tickets, but get no new ones.',
};

/** The signed-in member's availability, in the account menu. Hidden until the API reports availability. */
export function MyStatus() {
  const me = useMe();
  const members = useMembers();
  const set = useSetMyAvailability();
  const mine = members.data?.find((m) => m.user_id === me.data?.user.id);
  if (!mine?.availability) return null;
  return (
    <MenuSub>
      <MenuSubTrigger>
        <StatusDot member={mine} className="mx-1" />
        <span className="flex-1">Status</span>
        <span className="text-xs font-normal text-ink-faint">{PRESENCE_LABEL[presenceOf(mine)]}</span>
      </MenuSubTrigger>
      <MenuSubContent className="w-[240px]">
        <MenuRadioGroup value={mine.availability} onValueChange={(v) => set.mutate(v as Availability)}>
          {AVAILABILITIES.map((a) => (
            <MenuRadioItem key={a} value={a} className="items-start py-2">
              <span className="grid gap-0.5">
                <span>{AVAILABILITY_LABEL[a]}</span>
                <span className="text-[0.7rem] font-normal leading-snug text-ink-faint">{HINT[a]}</span>
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuSubContent>
    </MenuSub>
  );
}
