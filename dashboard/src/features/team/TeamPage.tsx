import { useEffect, useState } from 'react';
import { Link, Outlet, useSearchParams } from 'react-router';
import { Check, Clock, Mail, MailPlus, Minus, Shield, Trash2, UserMinus, Users } from 'lucide-react';
import { useMe } from '@/lib/api/endpoints/account';
import { useCreateInvite, useInvites, useMembers, useRemoveMember, useRevokeInvite, useTenant, useUpdateMember } from '@/lib/api/endpoints/business';
import type { Invite, Member, Permission, Role } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { env } from '@/lib/env';
import { formatDate, formatRelative } from '@/lib/format';
import { assignableRoles, DEFAULT_ROLE_PERMISSIONS, ROLE_DESCRIPTION, ROLE_LABEL, ROLES } from '@/lib/permissions';
import { useScopeCtx } from '@/lib/session/scope-context';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CopyField,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LimitBar,
  Page,
  PageHeader,
  Select,
  SkeletonRows,
  SubNav,
  Tip,
  useConfirm,
  type Column,
} from '@/components/ui';
import { RoleBadge } from '@/components/domain/badges';

export default function TeamPage() {
  const { href, can, businessName } = useScopeCtx();
  const tenant = useTenant();
  const invites = useInvites();
  const members = useMembers();
  const t = tenant.data;
  return (
    <Page>
      <PageHeader
        title="Team"
        description={`Everyone who works in ${businessName}, and what their role lets them do.`}
        actions={
          can('members.write') && (
            <Button asChild variant="accent" leading={<MailPlus />}>
              <Link to={href('team/invitations?invite=1')}>
                Invite teammate
              </Link>
            </Button>
          )
        }
      />
      {t && (
        <div className="panel max-w-md p-4">
          <LimitBar label="Seats used" used={t.usage.members} limit={t.limits.members} />
          <p className="mt-2 text-xs text-ink-faint">Pending invitations count toward seats. Plan: {t.plan}.</p>
        </div>
      )}
      <SubNav
        items={[
          { to: href('team'), label: 'Members', icon: <Users />, end: true, count: members.data?.length },
          { to: href('team/invitations'), label: 'Invitations', icon: <Mail />, count: invites.data?.length },
          { to: href('team/roles'), label: 'Roles & permissions', icon: <Shield /> },
        ]}
      />
      <Outlet />
    </Page>
  );
}

/* ------------------------------------------------------------------ */

export function MembersTab() {
  const { can, href } = useScopeCtx();
  const me = useMe();
  const members = useMembers();
  const update = useUpdateMember();
  const remove = useRemoveMember();
  const confirm = useConfirm();
  const writable = can('members.write');
  const ownersOk = can('owners.manage');
  const myId = me.data?.user.id;

  const changeRole = (m: Member, role: Role) => {
    const promote = role === 'owner';
    const demoteSelf = m.user_id === myId;
    if (!promote && !demoteSelf) return update.mutate({ userId: m.user_id, role });
    void confirm({
      title: promote ? `Make ${m.name} an owner?` : 'Change your own role?',
      description: promote
        ? 'Owners can do everything, including removing other owners.'
        : `You'll become ${ROLE_LABEL[role]} and may lose access to some pages right away.`,
      confirmLabel: 'Change role',
      tone: promote ? 'default' : 'danger',
      onConfirm: () => update.mutateAsync({ userId: m.user_id, role }),
    });
  };

  const onRemove = (m: Member) =>
    confirm({
      title: `Remove ${m.name}?`,
      description: `${m.email} loses access to this business right away. Their tickets stay, unassigned.`,
      confirmLabel: 'Remove',
      tone: 'danger',
      onConfirm: () => remove.mutateAsync(m.user_id),
    });

  const editable = (m: Member) => writable && (ownersOk || m.role !== 'owner');

  const columns: Column<Member>[] = [
    {
      key: 'person',
      header: 'Person',
      cell: (m) => (
        <span className="flex items-center gap-3">
          <Avatar name={m.name} email={m.email} size={32} />
          <span className="grid min-w-0">
            <span className="flex items-center gap-1.5 truncate font-semibold text-ink">
              {m.name}
              {m.user_id === myId && <Badge tone="outline" className="px-1.5 py-0 text-[0.65rem]">You</Badge>}
            </span>
            <span className="truncate text-xs text-ink-faint">{m.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (m) =>
        editable(m) ? (
          <Select
            size="sm"
            aria-label={`Role for ${m.name}`}
            className="w-36"
            value={m.role}
            onChange={(e) => changeRole(m, e.target.value as Role)}
            options={assignableRoles(ownersOk).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          />
        ) : (
          <Tip content={m.role === 'owner' && writable ? 'Only owners can change an owner.' : undefined}>
            <span>
              <RoleBadge role={m.role} />
            </span>
          </Tip>
        ),
    },
    { key: 'joined', header: 'Joined', hideBelowLg: true, cell: (m) => <span className="text-ink-muted">{formatDate(m.joined_at)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (m) =>
        m.user_id === myId ? (
          <Link to={href('settings/danger')} className="text-xs font-semibold text-ink-muted hover:text-danger">
            Leave
          </Link>
        ) : editable(m) ? (
          <Tip content="Remove from business">
            <Button size="xs" icon variant="quiet" className="hover:text-danger" onClick={() => void onRemove(m)} aria-label={`Remove ${m.name}`}>
              <UserMinus />
            </Button>
          </Tip>
        ) : null,
    },
  ];

  return (
    <Card flush>
      {members.isPending ? (
        <SkeletonRows rows={5} className="p-4" />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={[...members.data].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name))}
          getKey={(m) => m.user_id}
        />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function InvitesTab() {
  const { can } = useScopeCtx();
  const invites = useInvites();
  const revoke = useRevokeInvite();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const writable = can('members.write');

  const onRevoke = (i: Invite) =>
    confirm({
      title: `Cancel the invitation for ${i.email}?`,
      description: 'Their link stops working.',
      confirmLabel: 'Cancel invitation',
      cancelLabel: 'Keep it',
      tone: 'danger',
      onConfirm: () => revoke.mutateAsync(i.id),
    });

  const columns: Column<Invite>[] = [
    {
      key: 'email',
      header: 'Email',
      cell: (i) => (
        <span className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-ink-faint">
            <Mail className="size-4" />
          </span>
          <span className="grid min-w-0">
            <span className="truncate font-semibold text-ink">{i.email}</span>
            <span className="truncate text-xs text-ink-faint">Invited by {i.invited_by} · {formatRelative(i.created_at)}</span>
          </span>
        </span>
      ),
    },
    { key: 'role', header: 'Role', cell: (i) => <RoleBadge role={i.role} /> },
    {
      key: 'expires',
      header: 'Expires',
      cell: (i) => (
        <span className="flex items-center gap-1.5 text-ink-muted">
          <Clock className="size-3.5" /> {formatRelative(i.expires_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      hideOnCard: !writable,
      cell: (i) =>
        writable && (
          <Tip content="Cancel invitation">
            <Button size="xs" icon variant="quiet" className="hover:text-danger" onClick={() => void onRevoke(i)} aria-label={`Cancel invitation for ${i.email}`}>
              <Trash2 />
            </Button>
          </Tip>
        ),
    },
  ];

  return (
    <>
      <Card flush>
        {invites.isPending ? (
          <SkeletonRows rows={3} className="p-4" />
        ) : invites.isError ? (
          <ErrorState error={invites.error} onRetry={() => invites.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={invites.data}
            getKey={(i) => i.id}
            empty={
              <EmptyState
                icon={<MailPlus />}
                title="No pending invitations"
                description="Invite teammates to answer tickets, edit knowledge or manage the assistant."
                action={writable && <Button variant="accent" leading={<MailPlus />} onClick={() => setParams({ invite: '1' })}>Invite teammate</Button>}
              />
            }
          />
        )}
      </Card>
      {writable && <InviteDialog open={params.get('invite') === '1'} onOpenChange={(o) => !o && setParams({}, { replace: true })} />}
    </>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { can } = useScopeCtx();
  const create = useCreateInvite();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [created, setCreated] = useState<Invite | null>(null);
  useEffect(() => {
    if (open) {
      setEmail('');
      setRole('agent');
      setCreated(null);
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const link = created?.token ? `${env.dashboardUrl}/invite/${created.token}` : '';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={created ? 'Invitation created' : 'Invite a teammate'}
      description={created ? `Send this link to ${created.email}. It works once, for that address, until ${formatDate(created.expires_at)}.` : 'They join with the role you pick. You can change it later.'}
      footer={
        created ? (
          <Button variant="accent" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" variant="accent" loading={create.isPending} disabled={!valid}>
              Create invitation
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="grid gap-3">
          <CopyField value={link} />
          <Callout tone="neutral" icon={<Mail />}>
            Truplexy doesn't email the link for you. Share it however you like; only {created.email} can accept it.
          </Callout>
        </div>
      ) : (
        <form
          id="invite-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate({ email: email.trim().toLowerCase(), role }, { onSuccess: setCreated });
          }}
        >
          <Field label="Email">
            <Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </Field>
          <div className="grid gap-2" role="radiogroup" aria-label="Role">
            <span className="text-[0.8125rem] font-semibold text-ink">Role</span>
            {assignableRoles(can('owners.manage')).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => setRole(r)}
                className={cn('flex items-start gap-3 rounded-[12px] border p-3 text-left transition-colors', role === r ? 'border-accent bg-accent-soft/50' : 'border-line hover:border-line-strong')}
              >
                <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2', role === r ? 'border-btn' : 'border-line-strong')}>
                  {role === r && <span className="size-1.5 rounded-full bg-btn" />}
                </span>
                <span className="grid">
                  <span className="text-[0.8125rem] font-semibold text-ink">{ROLE_LABEL[r]}</span>
                  <span className="text-xs text-ink-muted">{ROLE_DESCRIPTION[r]}</span>
                </span>
              </button>
            ))}
          </div>
        </form>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

const PERMISSION_GROUPS: { label: string; items: [Permission, string][] }[] = [
  { label: 'Support', items: [['tickets.read', 'See tickets and handoffs'], ['tickets.write', 'Reply, assign and change tickets'], ['tickets.delete', 'Delete tickets']] },
  { label: 'Assistant', items: [['bot.read', 'See the configuration'], ['bot.write', 'Change the configuration'], ['playground.run', 'Use the playground'], ['knowledge.read', 'See the knowledge base'], ['knowledge.write', 'Add and edit knowledge'], ['tools.read', 'See tools'], ['tools.write', 'Create, edit and run tools']] },
  { label: 'Connect', items: [['integrations.read', 'See integrations, keys and webhook'], ['integrations.write', 'Issue keys and manage the webhook']] },
  { label: 'Business', items: [['usage.read', 'See usage and stats'], ['members.read', 'See the team'], ['members.write', 'Invite, remove and change roles'], ['owners.manage', 'Manage owners'], ['bots.create', 'Create bots'], ['business.write', 'Edit business details'], ['audit.read', 'See the activity log']] },
];

export function RolesTab() {
  const me = useMe();
  const { role } = useScopeCtx();
  const table = me.data?.roles ?? DEFAULT_ROLE_PERMISSIONS;
  return (
    <Card flush title="What each role can do" description={role ? `You're ${ROLE_LABEL[role]}. Only owners and admins change roles.` : undefined}>
      <div className="overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead>
            <tr>
              <th className="w-[40%]">Permission</th>
              {ROLES.map((r) => (
                <th key={r} className={cn('text-center', r === role && 'text-accent')}>
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => [
              <tr key={g.label}>
                <td colSpan={6} className="bg-surface-2/50 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ink-faint">
                  {g.label}
                </td>
              </tr>,
              ...g.items.map(([p, label]) => (
                <tr key={p}>
                  <td>
                    <span className="grid">
                      <span className="text-ink">{label}</span>
                      <code className="font-mono text-[0.68rem] text-ink-faint">{p}</code>
                    </span>
                  </td>
                  {ROLES.map((r) => (
                    <td key={r} className={cn('text-center', r === role && 'bg-accent-soft/40')}>
                      {table[r]?.includes(p) ? <Check className="mx-auto size-4 text-live" aria-label="Yes" /> : <Minus className="mx-auto size-4 text-line-strong" aria-label="No" />}
                    </td>
                  ))}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
