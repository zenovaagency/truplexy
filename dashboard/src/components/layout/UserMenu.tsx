import { useContext, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical, ImagePlus, LogOut, Monitor, Moon, RotateCcw, Shield, ShieldCheck, Sun, UserCog } from 'lucide-react';
import { useMe, useRemoveMyAvatar, useSetMyAvatar } from '@/lib/api/endpoints/account';
import { ImageUploader } from '@/components/domain/ImageUploader';
import type { Role } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/AuthProvider';
import { notifyInfo } from '@/lib/notify';
import { ROLE_DESCRIPTION, ROLE_LABEL, ROLES } from '@/lib/permissions';
import { qk } from '@/lib/query-keys';
import { ScopeContext } from '@/lib/session/scope-context';
import { useTheme, type ThemePref } from '@/lib/theme';
import {
  Avatar,
  Button,
  Dialog,
  Menu,
  MenuCheckItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  useConfirm,
} from '@/components/ui';

const MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const mock = () => import('@/lib/api/mock/transport');

export function UserMenu() {
  const me = useMe();
  const { user, signOut } = useAuth();
  const scopeCtx = useContext(ScopeContext);
  const { pref, setPref } = useTheme();
  const nav = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [pictureOpen, setPictureOpen] = useState(false);
  const setAvatar = useSetMyAvatar();
  const removeAvatar = useRemoveMyAvatar();

  const name = me.data?.user.name || user?.name || user?.email || 'You';
  const email = me.data?.user.email || user?.email;
  const avatarUrl = me.data?.user.avatar_url;

  const previewAs = async (role: Role) => {
    if (!scopeCtx) return;
    (await mock()).setMockRole(scopeCtx.scope.tenant, role);
    await qc.invalidateQueries({ queryKey: qk.me });
    notifyInfo(`Previewing as ${ROLE_LABEL[role]}`, ROLE_DESCRIPTION[role]);
  };

  const togglePlatform = async (on: boolean) => {
    (await mock()).setMockPlatformAdmin(on);
    await qc.invalidateQueries({ queryKey: qk.me });
    if (!on && window.location.pathname.startsWith('/platform')) nav('/');
  };

  const reset = () =>
    confirm({
      title: 'Reset demo data?',
      description: 'Every change you made in demo mode is discarded and the sample businesses are restored.',
      confirmLabel: 'Reset',
      tone: 'danger',
      onConfirm: async () => {
        (await mock()).resetMockData();
        qc.clear();
        nav('/');
      },
    });

  return (
    <>
    <Menu>
      <MenuTrigger className="rounded-full outline-offset-2 [@media(pointer:coarse)]:min-h-0" aria-label="Account menu">
        <Avatar name={name} email={email} src={avatarUrl} size={32} />
      </MenuTrigger>
      <MenuContent className="w-[272px]">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <Avatar name={name} email={email} src={avatarUrl} size={36} />
          <div className="grid min-w-0">
            <p className="truncate text-[0.8125rem] font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-ink-faint">{email}</p>
          </div>
        </div>
        {scopeCtx && (scopeCtx.role || scopeCtx.isPlatformAdmin) && (
          <p className="mx-2.5 mb-1 flex items-center gap-1.5 text-xs text-ink-muted">
            <Shield className="size-3.5 text-ink-faint" />
            {scopeCtx.role ? `${ROLE_LABEL[scopeCtx.role]} in ${scopeCtx.businessName}` : 'Visiting as platform admin'}
          </p>
        )}
        <MenuSeparator />

        <MenuItem onSelect={() => setPictureOpen(true)}>
          <ImagePlus />
          Profile picture
        </MenuItem>

        <MenuSub>
          <MenuSubTrigger>
            {pref === 'dark' ? <Moon /> : pref === 'light' ? <Sun /> : <Monitor />}
            <span className="flex-1">Theme</span>
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuRadioGroup value={pref} onValueChange={(v) => setPref(v as ThemePref)}>
              <MenuRadioItem value="light">
                <Sun /> Light
              </MenuRadioItem>
              <MenuRadioItem value="dark">
                <Moon /> Dark
              </MenuRadioItem>
              <MenuRadioItem value="system">
                <Monitor /> System
              </MenuRadioItem>
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>

        {me.data?.platform_admin && (
          <MenuItem onSelect={() => nav('/platform')}>
            <ShieldCheck />
            Platform console
          </MenuItem>
        )}

        {MOCKS && (
          <>
            <MenuSeparator />
            <MenuLabel className="flex items-center gap-1.5">
              <FlaskConical className="size-3" /> Demo mode
            </MenuLabel>
            {scopeCtx?.membership && (
              <MenuSub>
                <MenuSubTrigger>
                  <UserCog />
                  <span className="flex-1">Preview as role</span>
                  <span className="text-xs font-normal text-ink-faint">{ROLE_LABEL[scopeCtx.membership.role]}</span>
                </MenuSubTrigger>
                <MenuSubContent className="w-[240px]">
                  <MenuRadioGroup value={scopeCtx.membership.role} onValueChange={(v) => void previewAs(v as Role)}>
                    {ROLES.map((r) => (
                      <MenuRadioItem key={r} value={r} className="items-start py-2">
                        <span className="grid gap-0.5">
                          <span>{ROLE_LABEL[r]}</span>
                          <span className="text-[0.7rem] font-normal leading-snug text-ink-faint">{ROLE_DESCRIPTION[r]}</span>
                        </span>
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuSubContent>
              </MenuSub>
            )}
            <MenuCheckItem checked={me.data?.platform_admin ?? false} onCheckedChange={(v) => void togglePlatform(v)}>
              <ShieldCheck />
              Platform admin
            </MenuCheckItem>
            <MenuItem onSelect={() => void reset()}>
              <RotateCcw />
              Reset demo data
            </MenuItem>
          </>
        )}

        <MenuSeparator />
        <MenuItem onSelect={() => void signOut().then(() => nav('/sign-in'))}>
          <LogOut />
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
    <Dialog
      open={pictureOpen}
      onOpenChange={setPictureOpen}
      title="Profile picture"
      description="Teammates see it next to your name. It is public, so pick one you are happy to share."
      footer={<Button onClick={() => setPictureOpen(false)}>Done</Button>}
    >
      <ImageUploader
        name={name}
        email={email}
        src={avatarUrl}
        busy={setAvatar.isPending || removeAvatar.isPending}
        onUpload={(file) => setAvatar.mutate(file)}
        onRemove={() => removeAvatar.mutate()}
      />
    </Dialog>
    </>
  );
}
