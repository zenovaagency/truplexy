import { useMe } from '@/lib/api/endpoints/account';
import { useMembers, useSetMyAvailability } from '@/lib/api/endpoints/business';
import type { Availability } from '@/lib/api/types';
import { PRESENCE_LABEL, presenceOf } from '@/lib/support';
import { MenuSub, MenuSubContent, MenuSubTrigger } from '@/components/ui';
import { AvailabilityItems, StatusDot } from '@/components/domain/support';

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
        {/* The dot sits in the 16px icon column, like the other items' icons. */}
        <span className="grid size-4 shrink-0 place-items-center">
          <StatusDot member={mine} />
        </span>
        <span className="flex-1">Status</span>
        <span className="text-xs font-normal text-ink-faint">{presenceOf(mine) === 'idle' ? 'Inactive' : PRESENCE_LABEL[presenceOf(mine)]}</span>
      </MenuSubTrigger>
      <MenuSubContent className="w-[272px]">
        <AvailabilityItems value={mine.availability} onChange={(a: Availability) => set.mutate(a)} />
      </MenuSubContent>
    </MenuSub>
  );
}
