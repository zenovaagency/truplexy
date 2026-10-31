import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, CreditCard } from 'lucide-react';
import { useBillingPortal, useChangePlan, useRefreshPlan, useStartCheckout, useSubscription, useTrialEligible } from '@/lib/api/endpoints/billing';
import type { BillingInterval, CheckoutPlan, PlanId, Subscription } from '@/lib/api/types';
import { CHECKOUT_PLANS, NO_PLAN, TRIAL_DAYS } from '@/lib/billing';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { notifySuccess } from '@/lib/notify';
import { useScopeCtx } from '@/lib/session/scope-context';
import { Badge, Button, Callout, Card, SkeletonRows, useConfirm } from '@/components/ui';

const isPlan = (v: string | null): v is CheckoutPlan => v === 'starter' || v === 'pro';
const isInterval = (v: string | null): v is BillingInterval => v === 'monthly' || v === 'yearly';

const STATUS: Record<Subscription['status'], { label: string; tone: 'live' | 'accent' | 'warn' | 'danger' | 'neutral' }> = {
  trialing: { label: 'Free trial', tone: 'accent' },
  active: { label: 'Active', tone: 'live' },
  past_due: { label: 'Payment failed', tone: 'danger' },
  paused: { label: 'Paused', tone: 'warn' },
  canceled: { label: 'Canceled', tone: 'neutral' },
};

/** What the subscription is doing, in a sentence. */
function summary(s: Subscription) {
  const cancel = s.cancel_at ?? (s.status === 'canceled' ? s.current_period_end : null);
  if (cancel) return `Access ends on ${formatDate(cancel)}. You won't be charged again.`;
  if (s.status === 'trialing' && s.trial_ends_at) return `Your free trial ends on ${formatDate(s.trial_ends_at)}, when your card is first charged. Cancel before then and you pay nothing.`;
  if (s.status === 'past_due') return 'The last payment failed. Update your card in billing so the plan stays active.';
  if (s.status === 'paused') return 'The subscription is paused.';
  if (s.current_period_end) return `Renews on ${formatDate(s.current_period_end)}.`;
  return '';
}

/**
 * Starting and managing the paid plan. Enterprise and hand-set plans have no
 * subscription: they show a short note instead. Everything that moves money
 * happens in Paddle's checkout (the site's /pay page) and portal.
 */
export function SubscriptionCard({ plan }: { plan: PlanId }) {
  const { can } = useScopeCtx();
  const allowed = can('billing.write');
  const sub = useSubscription();
  // Promise a trial only when the API says one would be sold.
  const trial = useTrialEligible().data !== false;
  const checkout = useStartCheckout();
  const change = useChangePlan();
  const portal = useBillingPortal();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [interval, setInterval] = useState<BillingInterval>(() => (isInterval(params.get('billing')) ? (params.get('billing') as BillingInterval) : 'monthly'));
  const [picked, setPicked] = useState<CheckoutPlan | null>(() => (isPlan(params.get('checkout')) ? (params.get('checkout') as CheckoutPlan) : null));
  const auto = useRef(false);
  const returned = useRef(false);
  const refresh = useRefreshPlan();

  const subscription = sub.data;
  const live = subscription && subscription.status !== 'canceled';

  // Back from the checkout page (/pay sends customers to ?paid=1 when they finish): the plan
  // changes when Paddle's webhook reaches the API, usually within seconds, so re-read a few times.
  useEffect(() => {
    if (returned.current || params.get('paid') !== '1') return;
    returned.current = true;
    const next = new URLSearchParams(params);
    next.delete('paid');
    setParams(next, { replace: true });
    notifySuccess('Thanks, your payment details are saved', 'Your plan updates in a moment.');
    refresh();
    for (const ms of [2_000, 5_000, 12_000]) setTimeout(refresh, ms);
  }, [params, setParams, refresh]);

  // Arriving from sign-up with a plan chosen on the pricing page: open its checkout once.
  useEffect(() => {
    const want = params.get('checkout');
    if (auto.current || !isPlan(want) || !allowed || !sub.isSuccess) return;
    auto.current = true;
    const next = new URLSearchParams(params);
    next.delete('checkout');
    next.delete('billing');
    setParams(next, { replace: true });
    if (!subscription) checkout.mutate({ plan: want, interval: isInterval(params.get('billing')) ? (params.get('billing') as BillingInterval) : 'monthly' });
  }, [params, setParams, allowed, sub.isSuccess, subscription, checkout]);

  if (sub.isPending) return <Card title="Subscription"><SkeletonRows rows={2} /></Card>;

  // A plan set by hand (Enterprise, a grandfathered account) has nothing to start or manage here.
  if (!subscription && (plan === 'enterprise' || ![NO_PLAN, 'starter', 'pro'].includes(plan))) {
    return (
      <Card title="Subscription" description="Your plan is arranged directly with Truplexy.">
        <p className="text-[0.8125rem] text-ink-muted">
          To change it or ask about invoices, write to{' '}
          <a className="font-medium text-accent hover:underline" href="mailto:hello@truplexy.com?subject=Plan%20change">
            hello@truplexy.com
          </a>
          .
        </p>
      </Card>
    );
  }

  const error = checkout.error ?? change.error ?? portal.error;

  if (live) {
    const st = STATUS[subscription.status];
    const other = CHECKOUT_PLANS.find((p) => p.id !== subscription.plan)!;
    const current = CHECKOUT_PLANS.find((p) => p.id === subscription.plan)!;
    const otherInterval: BillingInterval = subscription.interval === 'monthly' ? 'yearly' : 'monthly';
    const switchPlan = (to: CheckoutPlan, iv: BillingInterval, title: string, description: string) =>
      confirm({ title, description, confirmLabel: 'Confirm change', onConfirm: () => change.mutateAsync({ plan: to, interval: iv }) });

    return (
      <Card
        title={
          <span className="flex items-center gap-2">
            Subscription <Badge tone={st.tone} dot>{st.label}</Badge>
          </span>
        }
        description={`${current.name} · billed ${subscription.interval} · $${current.price[subscription.interval]}/month`}
      >
        <div className="grid gap-4">
          {subscription.status === 'past_due' && (
            <Callout tone="danger" icon={<AlertTriangle />} title="We couldn't take your last payment">
              Update your card in billing. Paddle retries automatically, and the plan stays active while it does.
            </Callout>
          )}
          <p className="text-[0.8125rem] text-ink-muted">{summary(subscription)}</p>
          {allowed ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="accent" size="sm" loading={portal.isPending} leading={<CreditCard />} onClick={() => portal.mutate()}>
                Manage billing
              </Button>
              {!subscription.cancel_at && (
                <>
                  <Button
                    variant="soft"
                    size="sm"
                    loading={change.isPending}
                    onClick={() =>
                      void switchPlan(
                        other.id,
                        subscription.interval,
                        `Switch to ${other.name}?`,
                        `You move to ${other.name} at $${other.price[subscription.interval]}/month, billed ${subscription.interval}. Paddle prorates the difference.`,
                      )
                    }
                  >
                    Switch to {other.name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={change.isPending}
                    onClick={() =>
                      void switchPlan(
                        subscription.plan,
                        otherInterval,
                        `Bill ${otherInterval} instead?`,
                        `${current.name} would be $${current.price[otherInterval]}/month, billed ${otherInterval}. Paddle prorates the difference.`,
                      )
                    }
                  >
                    Bill {otherInterval}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-faint">Owners and admins manage billing.</p>
          )}
          {error && <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-[0.8125rem] font-medium text-danger">{describeError(error).detail}</p>}
        </div>
      </Card>
    );
  }

  // No live subscription: choose a plan and start the trial.
  return (
    <Card
      title={trial ? 'Start your free trial' : 'Choose a plan'}
      description={
        trial
          ? `${TRIAL_DAYS} days free on any plan. Add a card to start; you're charged when the trial ends, and you can cancel before then.`
          : "Add a card to subscribe. You're charged at checkout, and you can cancel any time."
      }
    >
      <div className="grid gap-4">
        {subscription?.status === 'canceled' && (
          <Callout tone="neutral" title="Your last subscription ended">
            Pick a plan to subscribe again.
          </Callout>
        )}
        <div className="inline-flex w-fit rounded-full border border-line bg-paper p-1" role="group" aria-label="Billing period">
          {(['monthly', 'yearly'] as const).map((iv) => (
            <button
              key={iv}
              type="button"
              aria-pressed={interval === iv}
              onClick={() => setInterval(iv)}
              className={cn('rounded-full px-3.5 py-1 text-[0.8125rem] font-semibold capitalize transition-colors', interval === iv ? 'bg-ink text-paper' : 'text-ink-muted hover:text-ink')}
            >
              {iv}
              {iv === 'yearly' && <span className="ml-1.5 text-live">Save 20%</span>}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Plan">
          {CHECKOUT_PLANS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={picked === p.id}
              onClick={() => setPicked(p.id)}
              className={cn('panel grid content-start gap-1 p-4 text-left transition-all hover:-translate-y-0.5', picked === p.id && 'border-accent ring-2 ring-accent/25')}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-ink">{p.name}</span>
                <span className="tabular-nums text-ink">
                  ${p.price[interval]}
                  <span className="text-xs text-ink-faint"> /month</span>
                </span>
              </span>
              <span className="text-[0.8125rem] text-ink-muted">{p.blurb}</span>
              {interval === 'yearly' && <span className="text-xs text-ink-faint">Billed ${p.price.yearly * 12} yearly</span>}
            </button>
          ))}
        </div>
        {error && <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-[0.8125rem] font-medium text-danger">{describeError(error).detail}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-faint">Payments are handled by Paddle, our merchant of record. Taxes are added at checkout.</p>
          {allowed ? (
            <Button
              variant="accent"
              disabled={!picked}
              loading={checkout.isPending}
              onClick={() => picked && checkout.mutate({ plan: picked, interval })}
            >
              {trial ? `Start ${TRIAL_DAYS}-day free trial` : 'Subscribe'}
            </Button>
          ) : (
            <p className="text-xs text-ink-faint">Owners and admins can start a plan.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
