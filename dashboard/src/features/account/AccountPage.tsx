import { forwardRef, useEffect, useRef, useState, type ComponentProps } from 'react';
import { useSearchParams } from 'react-router';
import { Eye, EyeOff, KeyRound, Mail, MailCheck } from 'lucide-react';
import { useMe, useRemoveMyAvatar, useSetMyAvatar } from '@/lib/api/endpoints/account';
import { useAuth } from '@/lib/auth/AuthProvider';
import { CAPTCHA_ERROR_MESSAGE, TURNSTILE_FAILED_MESSAGE, useTurnstile } from '@/features/auth/Turnstile';
import { notifyError, notifySuccess } from '@/lib/notify';
import { ImageUploader } from '@/components/domain/ImageUploader';
import { Button, Callout, Card, Field, Input, Page, PageHeader } from '@/components/ui';

export const NAME_MAX = 80;
export const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Supabase's messages are written for developers; say what a person can do about the common ones. */
function authMessage(e: unknown, fallback: string) {
  const m = e instanceof Error ? e.message : '';
  if (/same password|different from the old/i.test(m)) return 'Choose a password you have not used before.';
  if (/reauthenticat|recently/i.test(m)) return 'For your security, sign out and back in, then try again.';
  if (/already (been )?registered|already exists|email_exists/i.test(m)) return 'That email already belongs to another account.';
  if (/captcha/i.test(m)) return CAPTCHA_ERROR_MESSAGE;
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a few minutes and try again.';
  return m || fallback;
}

export default function AccountPage() {
  const [params] = useSearchParams();
  const recovery = params.get('recovery') === '1';
  const emailChanged = params.get('changed') === 'email';

  useEffect(() => {
    if (emailChanged) notifySuccess('Email confirmed', 'Your sign-in email has been updated.');
  }, [emailChanged]);

  return (
    <Page>
      <PageHeader title="Account" description="Your name, sign-in email and password. These belong to you, not to any one business." />
      <div className="grid max-w-3xl gap-5">
        {recovery && (
          <Callout tone="accent" icon={<KeyRound />} title="Choose a new password">
            You are signed in from your reset link. Set a new password below.
          </Callout>
        )}
        <ProfileCard />
        <EmailCard />
        <PasswordCard focus={recovery} />
      </div>
    </Page>
  );
}

function ProfileCard() {
  const { user, updateProfile } = useAuth();
  const me = useMe();
  const saved = me.data?.user.name ?? user?.name ?? '';
  const [name, setName] = useState(saved);
  const [busy, setBusy] = useState(false);
  const setAvatar = useSetMyAvatar();
  const removeAvatar = useRemoveMyAvatar();
  // Fill the field once the saved name is known, without overwriting what is being typed.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setName(saved);
  }, [saved]);

  const trimmed = name.trim();
  const dirty = trimmed !== saved;
  const valid = trimmed.length >= 1 && trimmed.length <= NAME_MAX;

  return (
    <Card title="Profile" description="Teammates see your picture and name next to your replies and in the team list.">
      <div className="grid gap-5">
        <div className="grid gap-1.5">
          <p className="text-[0.8125rem] font-semibold text-ink">Profile picture</p>
          <ImageUploader
            name={saved || user?.email || 'You'}
            email={user?.email}
            src={me.data?.user.avatar_url}
            busy={setAvatar.isPending || removeAvatar.isPending}
            onUpload={(file) => setAvatar.mutate(file)}
            onRemove={() => removeAvatar.mutate()}
          />
          <p className="text-xs text-ink-faint">PNG, JPEG or WebP, up to 512 KiB. It is public, so pick one you are happy to share.</p>
        </div>
        <form
          className="grid gap-5 border-t border-line pt-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!dirty || !valid) return;
            setBusy(true);
            try {
              await updateProfile({ name: trimmed });
              touched.current = false;
              notifySuccess('Name updated');
            } catch (err) {
              notifyError(new Error(authMessage(err, "Couldn't update your name.")));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Your name" aside={`${name.length}/${NAME_MAX}`}>
            <Input
              autoComplete="name"
              value={name}
              onChange={(e) => {
                touched.current = true;
                setName(e.target.value.slice(0, NAME_MAX));
              }}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={!dirty || busy}
              onClick={() => {
                touched.current = false;
                setName(saved);
              }}
            >
              Reset
            </Button>
            <Button type="submit" variant="accent" loading={busy} disabled={!dirty || !valid}>
              Save name
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}

function EmailCard() {
  const { user, changeEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const next = email.trim();
  const valid = EMAIL_RE.test(next);
  const same = next.toLowerCase() === (user?.email ?? '').toLowerCase();
  const pending = sentTo ?? user?.pendingEmail;

  return (
    <Card title="Email" description="The address you sign in with, and where Truplexy writes to you.">
      <form
        className="grid gap-5"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || same) return;
          setBusy(true);
          try {
            await changeEmail(next);
            setSentTo(next);
            setEmail('');
          } catch (err) {
            notifyError(new Error(authMessage(err, "Couldn't change your email.")));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Current email">
          <Input value={user?.email ?? ''} readOnly disabled />
        </Field>
        {pending && (
          <Callout tone="neutral" icon={<MailCheck />} title="Confirm your new email">
            We sent a link to <span className="font-semibold text-ink">{pending}</span>. Your email changes once you open it. You may need to confirm from
            your current inbox too.
          </Callout>
        )}
        <Field label="New email" error={email && !valid ? 'Enter a valid email address' : email && same ? 'That is already your email' : undefined}>
          <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="flex justify-end border-t border-line pt-4">
          <Button type="submit" variant="accent" leading={<Mail />} loading={busy} disabled={!valid || same}>
            Send confirmation
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** A password input with a show/hide button. `Field` passes its id and aria props straight to the input. */
const PasswordInput = forwardRef<HTMLInputElement, Omit<ComponentProps<typeof Input>, 'type'> & { show: boolean; onToggle: () => void }>(
  ({ show, onToggle, ...rest }, ref) => (
    <div className="relative">
      <Input ref={ref} type={show ? 'text' : 'password'} className="w-full pr-10" {...rest} />
      <button
        type="button"
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-ink-faint hover:text-ink [&_svg]:size-4"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        onClick={onToggle}
      >
        {show ? <EyeOff /> : <Eye />}
      </button>
    </div>
  ),
);
PasswordInput.displayName = 'PasswordInput';

function PasswordCard({ focus }: { focus: boolean }) {
  const { user, setPassword, sendPasswordReset } = useAuth();
  const [password, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const captcha = useTurnstile();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focus) input.current?.focus();
  }, [focus]);

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN;
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = password.length >= PASSWORD_MIN && confirm === password;

  return (
    <Card
      title="Password"
      description="Choose a password to sign in with. If you usually sign in with an email link, this adds a password as another way in."
    >
      <form
        className="grid gap-5"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          try {
            await setPassword(password);
            setPw('');
            setConfirm('');
            notifySuccess('Password updated');
          } catch (err) {
            notifyError(new Error(authMessage(err, "Couldn't update your password.")));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="New password" error={tooShort ? `At least ${PASSWORD_MIN} characters` : undefined}>
          <PasswordInput ref={input} autoComplete="new-password" value={password} onChange={(e) => setPw(e.target.value)} show={show} onToggle={() => setShow((x) => !x)} />
        </Field>
        <Field label="Confirm new password" error={mismatch ? 'Passwords do not match' : undefined}>
          <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} show={show} onToggle={() => setShow((x) => !x)} />
        </Field>
        <div ref={captcha.ref} />
        {captcha.failed && <p className="text-[0.8125rem] font-medium text-danger">{TURNSTILE_FAILED_MESSAGE}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button
            variant="ghost"
            loading={resetting}
            disabled={busy || !user?.email || !captcha.ready}
            onClick={async () => {
              setResetting(true);
              try {
                await sendPasswordReset(user!.email, captcha.token);
                notifySuccess('Reset email sent', `Check ${user!.email} for a link.`);
              } catch (err) {
                notifyError(new Error(authMessage(err, "Couldn't send the reset email.")));
              } finally {
                setResetting(false);
                captcha.reset();
              }
            }}
          >
            Email me a reset link instead
          </Button>
          <Button type="submit" variant="accent" loading={busy} disabled={!valid}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}
