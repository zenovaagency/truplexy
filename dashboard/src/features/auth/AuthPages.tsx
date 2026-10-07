import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, FlaskConical, LifeBuoy, Lightbulb, Link2Off as LinkIcon, Mail, MailCheck, Wrench } from 'lucide-react';
import { fetchMe, previewInvite, useAcceptInvite, useBusinessTypes, useCreateTenant, useMe } from '@/lib/api/endpoints/account';
import { hasCode } from '@/lib/api/client';
import type { BusinessTypeId } from '@/lib/api/types';
import { AuthCallbackError, useAuth } from '@/lib/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { authConfigured, env } from '@/lib/env';
import { describeError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/permissions';
import { qk } from '@/lib/query-keys';
import { scopeLink } from '@/lib/session/scope-context';
import { Button, Callout, EmptyState, ErrorState, Field, Input, Skeleton } from '@/components/ui';
import { Splash } from '@/app/guards';
import { StatusScreen } from '@/app/errors';
import { BrandMark } from '@/components/layout/Brand';
import { AuthFrame } from './AuthFrame';

/**
 * Only this site's own pages are followed after sign-in. Email templates may pass `{{ .RedirectTo }}`, a full
 * URL that is itself the callback (`/auth/callback?next=/invite/…`): that resolves to its own `next`.
 */
function safeNext(next: string | null): string {
  if (!next) return '/';
  let url: URL;
  try {
    url = new URL(next, window.location.origin);
  } catch {
    return '/';
  }
  if (url.origin !== window.location.origin) return '/';
  if (url.pathname === '/auth/callback' || url.pathname === '/auth/confirm') return safeNext(url.searchParams.get('next'));
  return `${url.pathname}${url.search}${url.hash}`;
}

/* ------------------------------------------------------------------ */
/* Sign in / create account                                             */
/* ------------------------------------------------------------------ */

interface Creds {
  name: string;
  email: string;
  password: string;
}

function validate(v: Creds, mode: 'signin' | 'signup' | 'magic') {
  const errs: Partial<Record<keyof Creds, string>> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errs.email = 'Enter a valid email address';
  if (mode !== 'magic' && v.password.length < 8) errs.password = 'At least 8 characters';
  return errs;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

export function SignInPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>(() => {
    const m = params.get('mode');
    return m === 'signup' || m === 'magic' ? m : 'signin';
  });
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  const nav = useNavigate();

  const [v, setV] = useState<Creds>(env.useMocks ? { email: 'alex@acme.example', password: 'demo-password', name: '' } : { email: '', password: '', name: '' });
  const [errs, setErrs] = useState<Partial<Record<keyof Creds, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const field = (k: keyof Creds) => ({
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setV((x) => ({ ...x, [k]: e.target.value }));
      if (errs[k]) setErrs((x) => ({ ...x, [k]: undefined }));
    },
  });

  if (auth.status === 'signedIn') return <Navigate to={next} replace />;
  if (auth.status === 'loading') return <Splash />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(v, mode);
    setErrs(found);
    if (Object.keys(found).length) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'magic') {
        await auth.sendMagicLink(v.email, next);
        if (!env.useMocks) setSent(v.email);
      } else if (mode === 'signup') {
        const r = await auth.signUp(v.email, v.password, v.name || undefined, next);
        if (r.needsConfirmation) setSent(v.email);
      } else {
        await auth.signInWithPassword(v.email, v.password);
      }
      if (env.useMocks) nav(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthFrame>
        <div className="grid justify-items-center gap-4 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <MailCheck className="size-6" />
          </span>
          <h1 className="text-2xl font-bold text-ink">Check your inbox</h1>
          <p className="text-ink-muted">
            We sent a link to <span className="font-semibold text-ink">{sent}</span>. Open it on this device to continue.
          </p>
          <Button variant="ghost" onClick={() => setSent(null)} leading={<ArrowLeft />}>
            Use a different email
          </Button>
        </div>
      </AuthFrame>
    );
  }

  const title = mode === 'signup' ? 'Create your account' : 'Welcome back';

  return (
    <AuthFrame>
      <div className="grid gap-7">
        <div className="grid gap-2">
          <h1 className="text-[1.75rem] font-bold leading-tight text-ink">{title}</h1>
          <p className="text-ink-muted">
            {mode === 'signup' ? 'Set up your assistant in a few minutes.' : 'Sign in to run your Truplexy assistant.'}
          </p>
        </div>

        {env.useMocks && (
          <Callout tone="accent" icon={<FlaskConical />} title="Demo mode">
            Any email and password signs you in as Alex Rivera, with sample businesses stored in this browser.
          </Callout>
        )}
        {!authConfigured && (
          <Callout tone="warn" title="Sign-in isn't configured">
            Set <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and <code className="font-mono text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code>, or run{' '}
            <code className="font-mono text-xs">npm run dev:mock</code> for demo mode.
          </Callout>
        )}

        <Button
          size="md"
          variant="ghost"
          className="w-full"
          loading={google}
          leading={<GoogleIcon />}
          disabled={!authConfigured}
          onClick={async () => {
            setGoogle(true);
            try {
              await auth.signInWithGoogle(next);
              if (env.useMocks) nav(next, { replace: true });
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Google sign-in failed.');
              setGoogle(false);
            }
          }}
        >
          Continue with Google
        </Button>

        <div className="flex items-center gap-3 text-xs text-ink-faint">
          <span className="h-px flex-1 bg-line" />
          or with email
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={submit} className="grid gap-4" noValidate>
          {mode === 'signup' && (
            <Field label="Your name" optional>
              <Input autoComplete="name" {...field('name')} />
            </Field>
          )}
          <Field label="Work email" error={errs.email}>
            <Input type="email" autoComplete="email" inputMode="email" {...field('email')} />
          </Field>
          {mode !== 'magic' && (
            <Field label="Password" error={errs.password}>
              <Input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} {...field('password')} />
            </Field>
          )}
          {error && <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-[0.8125rem] font-medium text-danger">{error}</p>}
          <Button type="submit" size="md" variant="accent" className="w-full" loading={submitting} disabled={!authConfigured}>
            {mode === 'signup' ? 'Create account' : mode === 'magic' ? 'Email me a sign-in link' : 'Sign in'}
          </Button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 text-[0.8125rem] font-semibold text-accent hover:underline"
            onClick={() => setMode(mode === 'magic' ? 'signin' : 'magic')}
          >
            <Mail className="size-3.5" />
            {mode === 'magic' ? 'Use a password instead' : 'Email me a sign-in link instead'}
          </button>
        </form>

        <p className="text-center text-[0.8125rem] text-ink-muted">
          {mode === 'signup' ? 'Already have an account? ' : 'New to Truplexy? '}
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
            {mode === 'signup' ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>
    </AuthFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Redirect target for magic links, confirmations and OAuth             */
/* ------------------------------------------------------------------ */

interface CallbackFailure {
  code: string;
  message: string;
  next: string;
}

interface CallbackCopy {
  title: string;
  description: string;
  /** `resend` offers a fresh magic link; `signin` goes back to the sign-in form. */
  action: 'resend' | 'signin';
  actionLabel?: string;
}

/** Supabase error codes, in words a person can act on. */
function describeCallbackError(code: string, message: string): CallbackCopy {
  switch (code) {
    case 'otp_expired':
    case 'expired':
      return {
        title: 'This link has expired',
        description: 'Sign-in links work once and expire after a short time. Request a new one and open it on this device.',
        action: 'resend',
      };
    case 'access_denied':
      return {
        title: 'Sign-in was cancelled',
        description: "Sign-in wasn't completed with your provider, so nothing changed. Try again whenever you're ready.",
        action: 'signin',
        actionLabel: 'Try again',
      };
    case 'flow_state_not_found':
    case 'flow_state_expired':
    case 'bad_code_verifier':
    case 'pkce_code_verifier_not_found':
      return {
        title: 'Open the link in the same browser',
        description: 'For your security, a sign-in link only works in the browser where you asked for it. Open it there, or sign in again here.',
        action: 'signin',
        actionLabel: 'Sign in again',
      };
    case 'email_address_not_authorized':
      return {
        title: "This email can't sign in",
        description: "Sign-in isn't enabled for this address. Use a different email, or contact support.",
        action: 'signin',
      };
    case 'signup_disabled':
      return {
        title: 'Sign-ups are closed',
        description: "New accounts can't be created right now. Sign in with an existing account instead.",
        action: 'signin',
      };
    case 'user_banned':
      return {
        title: 'This account is suspended',
        description: 'Contact support if you think this is a mistake.',
        action: 'signin',
      };
    case 'missing_code':
      return {
        title: 'This link is incomplete',
        description: 'The sign-in code is missing. Open the link straight from the email rather than copying it, or sign in again.',
        action: 'signin',
      };
    default:
      return { title: "That link didn't work", description: message, action: 'signin' };
  }
}

export function AuthCallbackPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const [failure, setFailure] = useState<CallbackFailure | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const url = new URL(window.location.href);
    const next = safeNext(url.searchParams.get('next'));
    auth
      .completeSignIn(url)
      .then(() => nav(next, { replace: true }))
      .catch((e: unknown) => {
        const f: CallbackFailure = {
          code: e instanceof AuthCallbackError ? e.code : 'unknown',
          message: e instanceof Error ? e.message : 'This sign-in link is invalid or expired.',
          next,
        };
        // Drop the spent code and any tokens from the address bar; keep the error so a refresh shows it again.
        const clean = new URLSearchParams({ error_code: f.code, error_description: f.message });
        if (next !== '/') clean.set('next', next);
        window.history.replaceState(window.history.state, '', `${url.pathname}?${clean}`);
        setFailure(f);
      });
  }, [auth, nav]);

  if (!failure || auth.status === 'loading') return <Splash />;
  // An old or reused link, but this browser is already signed in: carry on.
  if (auth.status === 'signedIn') return <Navigate to={failure.next} replace />;

  const copy = describeCallbackError(failure.code, failure.message);
  const nextQuery = failure.next !== '/' ? `next=${encodeURIComponent(failure.next)}` : '';
  const primary =
    copy.action === 'resend'
      ? { to: `/sign-in?mode=magic${nextQuery && `&${nextQuery}`}`, label: 'Send a new link', icon: <Mail /> }
      : { to: `/sign-in${nextQuery && `?${nextQuery}`}`, label: copy.actionLabel ?? 'Back to sign in', icon: <ArrowLeft /> };
  const support = `mailto:hello@truplexy.com?subject=${encodeURIComponent(`Sign-in problem (${failure.code})`)}`;

  return (
    <StatusScreen
      hero={
        <span className="grid size-16 place-items-center rounded-[20px] border border-warn/25 bg-warn-soft text-warn [&_svg]:size-7">
          <LinkIcon />
        </span>
      }
      eyebrow="Sign-in error"
      title={copy.title}
      description={<p>{copy.description}</p>}
      actions={
        <>
          <Button asChild variant="accent" size="md" className="w-full sm:w-auto" leading={primary.icon}>
            <Link to={primary.to}>{primary.label}</Link>
          </Button>
          <Button asChild variant="ghost" size="md" className="w-full sm:w-auto" leading={<LifeBuoy />}>
            <a href={support}>Contact support</a>
          </Button>
        </>
      }
      detail={<p className="mono break-all text-ink-faint">Error code · {failure.code}</p>}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Onboarding: a business type, a name, done.                           */
/* ------------------------------------------------------------------ */

export function OnboardingPage() {
  const types = useBusinessTypes();
  const me = useMe();
  const create = useCreateTenant();
  const nav = useNavigate();
  const [type, setType] = useState<BusinessTypeId | null>(null);
  const [name, setName] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const selected = types.data?.find((t) => t.id === type);
  const hasBusiness = (me.data?.memberships.length ?? 0) > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!type || !name.trim()) return;
    create.mutate(
      { name: name.trim(), business_type: type },
      {
        onSuccess: ({ tenant, bot_id }) => {
          const link = scopeLink({ tenant: tenant.id, bot: bot_id });
          nav(link.to, { state: link.state, replace: true });
        },
      },
    );
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-paper">
      <div className="aurora" />
      <div className="relative mx-auto grid max-w-[1040px] gap-8 px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex items-center justify-between">
          <BrandMark className="h-7" />
          {hasBusiness && (
            <Button asChild variant="quiet" size="sm" leading={<ArrowLeft />}>
              <Link to="/">Back to dashboard</Link>
            </Button>
          )}
        </div>

        <div className="grid gap-2">
          <p className="mono text-accent">Step {step} of 2</p>
          <h1 className="text-[1.75rem] font-bold leading-tight text-ink sm:text-[2.125rem]">
            {step === 1 ? 'What kind of business is this?' : 'Name your business'}
          </h1>
          <p className="max-w-xl text-ink-muted">
            {step === 1
              ? 'We start your assistant with a prompt, tone and knowledge checklist made for your industry. You can change everything later.'
              : 'Customers see this name in replies. You become the owner, with a support bot ready to configure.'}
          </p>
        </div>

        {step === 1 ? (
          <>
            {types.isError ? (
              <ErrorState error={types.error} onRetry={() => types.refetch()} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Business type">
                {(types.data ?? Array.from({ length: 8 }, () => null)).map((t, i) =>
                  t ? (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={type === t.id}
                      onClick={() => setType(t.id)}
                      onDoubleClick={() => {
                        setType(t.id);
                        setStep(2);
                      }}
                      className={cn(
                        'panel grid content-start gap-1.5 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md',
                        type === t.id && 'border-accent ring-2 ring-accent/25',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-bold text-ink">{t.label}</span>
                        {type === t.id && <CheckCircle2 className="size-4 text-accent" />}
                      </span>
                      <span className="text-[0.8125rem] leading-snug text-ink-muted">{t.description}</span>
                    </button>
                  ) : (
                    <Skeleton key={i} className="h-28" />
                  ),
                )}
              </div>
            )}

            {selected && (
              <div className="panel grid gap-5 p-5 animate-fade-in md:grid-cols-2">
                <div className="grid content-start gap-2.5">
                  <p className="flex items-center gap-2 text-[0.8125rem] font-bold text-ink">
                    <Lightbulb className="size-4 text-accent" /> Knowledge to add first
                  </p>
                  <ul className="grid gap-1.5 text-[0.8125rem] text-ink-muted">
                    {selected.knowledge_topics.map((k) => (
                      <li key={k} className="flex gap-2">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-faint" />
                        {k}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid content-start gap-2.5">
                  <p className="flex items-center gap-2 text-[0.8125rem] font-bold text-ink">
                    <Wrench className="size-4 text-accent" /> Tools worth connecting
                  </p>
                  <ul className="grid gap-1.5 text-[0.8125rem] text-ink-muted">
                    {selected.tool_ideas.map((k) => (
                      <li key={k} className="flex gap-2">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-faint" />
                        {k}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="accent" size="md" disabled={!type} onClick={() => setStep(2)}>
                Continue <ArrowRight />
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="panel grid max-w-lg gap-5 p-5 sm:p-6">
            <div className="flex items-center gap-3 rounded-[12px] bg-surface-2 p-3">
              <span className="grid size-9 place-items-center rounded-[10px] bg-surface text-accent">
                <Building2 className="size-4" />
              </span>
              <div className="grid flex-1">
                <span className="text-xs text-ink-faint">Business type</span>
                <span className="text-[0.8125rem] font-semibold text-ink">{selected?.label}</span>
              </div>
              <Button size="xs" variant="quiet" onClick={() => setStep(1)}>
                Change
              </Button>
            </div>
            <Field label="Business name" hint="1–80 characters. You can rename it in Settings." aside={`${name.length}/80`}>
              <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="e.g. Acme Store" autoFocus />
            </Field>
            {create.isError && hasCode(create.error, 'BUSINESS_LIMIT_REACHED') && (
              <Callout tone="warn" title="You already own 3 businesses">
                Leave or hand over one of them before creating another.
              </Callout>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(1)} leading={<ArrowLeft />}>
                Back
              </Button>
              <Button type="submit" variant="accent" loading={create.isPending} disabled={!name.trim()}>
                Create business
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invitation                                                          */
/* ------------------------------------------------------------------ */

export function InvitePage() {
  const { token = '' } = useParams();
  const auth = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const accept = useAcceptInvite();
  const [switching, setSwitching] = useState(false);
  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => previewInvite(token),
    enabled: auth.status === 'signedIn',
    retry: false,
    meta: { silent: true },
  });

  if (auth.status === 'loading') return <Splash />;

  if (auth.status === 'signedOut') {
    return (
      <AuthFrame>
        <div className="grid gap-5 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Mail className="size-6" />
          </span>
          <h1 className="text-2xl font-bold text-ink">You've been invited</h1>
          <p className="text-ink-muted">Sign in or create an account with the address the invitation was sent to.</p>
          <div className="grid gap-2">
            <Button asChild variant="accent" size="md">
              <Link to={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept</Link>
            </Button>
            <Button asChild variant="ghost" size="md">
              <Link to={`/sign-in?mode=signup&next=${encodeURIComponent(`/invite/${token}`)}`}>Create an account</Link>
            </Button>
          </div>
        </div>
      </AuthFrame>
    );
  }

  const onAccept = () =>
    accept.mutate(token, {
      onSuccess: async (inv) => {
        const me = await qc.fetchQuery({ queryKey: qk.me, queryFn: () => fetchMe(), staleTime: 0 });
        const m = me.memberships.find((x) => x.tenant_id === inv.tenant_id);
        const link = m?.bots[0] ? scopeLink({ tenant: m.tenant_id, bot: m.bots[0].id }) : { to: '/', state: undefined };
        nav(link.to, { state: link.state, replace: true });
      },
    });

  // Only the invited address can accept. The mock accepts any address, so it isn't checked there.
  const mismatchError = accept.isError && hasCode(accept.error, 'INVITE_EMAIL_MISMATCH');
  const wrongAccount =
    mismatchError || (!env.useMocks && !!preview.data && !!auth.user?.email && preview.data.email.toLowerCase() !== auth.user.email.toLowerCase());
  // Signing out shows the signed-out invitation, whose sign-in links come back here.
  const switchAccount = () => {
    setSwitching(true);
    void auth.signOut().finally(() => setSwitching(false));
  };

  const err = preview.error ?? (mismatchError ? null : accept.error);
  const d = err ? describeError(err) : null;

  return (
    <AuthFrame>
      {preview.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24" />
        </div>
      ) : d ? (
        <EmptyState
          title={d.title}
          description={d.detail}
          action={
            <Button asChild variant="accent">
              <Link to="/">Go to dashboard</Link>
            </Button>
          }
        />
      ) : (
        preview.data && (
          <div className="grid gap-6">
            <div className="grid gap-2">
              <p className="mono text-accent">Invitation</p>
              <h1 className="text-[1.75rem] font-bold leading-tight text-ink">Join {preview.data.business_name}</h1>
              <p className="text-ink-muted">
                You're invited as <span className="font-semibold text-ink">{ROLE_LABEL[preview.data.role]}</span>.{' '}
                {ROLE_DESCRIPTION[preview.data.role]}
              </p>
            </div>
            <dl className="grid gap-2 rounded-[14px] border border-line bg-surface p-4 text-[0.8125rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">Sent to</dt>
                <dd className="font-medium text-ink">{preview.data.email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">Expires</dt>
                <dd className="font-medium text-ink">{formatDate(preview.data.expires_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">Signed in as</dt>
                <dd className="font-medium text-ink">{auth.user?.email}</dd>
              </div>
            </dl>
            {wrongAccount ? (
              <>
                <Callout tone="warn" title="Wrong account for this invitation">
                  This invitation is for <span className="font-semibold text-ink">{preview.data.email}</span>. Sign in with that address to accept it.
                </Callout>
                <Button variant="accent" size="md" loading={switching} onClick={switchAccount}>
                  Sign in as {preview.data.email}
                </Button>
              </>
            ) : (
              <Button variant="accent" size="md" loading={accept.isPending} onClick={onAccept}>
                Accept and continue
              </Button>
            )}
          </div>
        )
      )}
    </AuthFrame>
  );
}
