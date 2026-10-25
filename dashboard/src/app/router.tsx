import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import type { Permission } from '@/lib/api/types';
import { pages } from './nav';
import { LegacyScopeRedirect, RequireAuth, RequirePermission, RequirePlatformAdmin, ScopeLayout } from './guards';
import { NotFound, RouteError } from './errors';
import { PlatformLayout } from './layouts/PlatformLayout';

/** A route whose component loads with its own chunk. */
function lazyRoute<M>(load: () => Promise<M>, pick: (m: M) => ComponentType): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: pick(await load()) }) };
}

/** Routes behind one permission: hidden in the nav, and a 404 when opened by URL. */
const gated = (permission: Permission, children: RouteObject[]): RouteObject => ({
  element: <RequirePermission permission={permission} />,
  children,
});

/** An unknown tab inside a section (/settings/nope): a 404 inside the shell, so the nav stays. */
const missing: RouteObject = { path: '*', element: <NotFound variant="inline" /> };

const auth = () => import('@/features/auth/AuthPages');

const businessRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="overview" replace /> },
  gated('usage.read', [{ path: 'overview', ...lazyRoute(pages.overview, (m) => m.default) }]),
  gated('usage.read', [{ path: 'usage', ...lazyRoute(pages.usage, (m) => m.default) }]),
  gated('usage.read', [{ path: 'performance', ...lazyRoute(pages.performance, (m) => m.default) }]),
  // The LLM page is gone: its usage moved to Usage, and the rest is no longer configurable.
  { path: 'llm/usage', element: <Navigate to="../usage" replace /> },
  { path: 'llm/*', element: <Navigate to="../tools" replace /> },
  gated('tickets.read', [
    { path: 'tickets/handoffs', ...lazyRoute(pages.tickets, (m) => m.HandoffsPage) },
    { path: 'tickets/:ticketId?', ...lazyRoute(pages.tickets, (m) => m.default) },
    { ...missing, path: 'tickets/*' },
  ]),
  gated('customers.read', [{ path: 'customers', ...lazyRoute(pages.customers, (m) => m.default) }]),
  gated('knowledge.read', [
    {
      path: 'knowledge',
      ...lazyRoute(pages.knowledge, (m) => m.default),
      children: [
        { index: true, ...lazyRoute(pages.knowledge, (m) => m.DocumentsTab) },
        { path: 'search', ...lazyRoute(pages.knowledge, (m) => m.SearchTab) },
        missing,
      ],
    },
  ]),
  gated('bot.read', [
    {
      // Tools and Playground share one unsaved draft of the bot's configuration.
      ...lazyRoute(pages.draft, (m) => m.default),
      children: [
        gated('tools.read', [{ path: 'tools', ...lazyRoute(pages.tools, (m) => m.default) }]),
        gated('playground.run', [{ path: 'playground', ...lazyRoute(pages.playground, (m) => m.default) }]),
      ],
    },
  ]),
  gated('integrations.read', [
    {
      path: 'integrations',
      ...lazyRoute(pages.integrations, (m) => m.default),
      children: [
        { index: true, ...lazyRoute(pages.integrations, (m) => m.ChannelsTab) },
        { path: 'guides', ...lazyRoute(pages.integrations, (m) => m.CatalogTab) },
        { path: 'webhook', ...lazyRoute(pages.integrations, (m) => m.WebhookTab) },
        missing,
      ],
    },
    { path: 'api-keys', ...lazyRoute(pages.apiKeys, (m) => m.default) },
  ]),
  gated('audit.read', [{ path: 'logs', ...lazyRoute(pages.logs, (m) => m.default) }]),
  gated('members.read', [
    {
      path: 'team',
      ...lazyRoute(pages.team, (m) => m.default),
      children: [
        { index: true, ...lazyRoute(pages.team, (m) => m.MembersTab) },
        { path: 'invitations', ...lazyRoute(pages.team, (m) => m.InvitesTab) },
        { path: 'roles', ...lazyRoute(pages.team, (m) => m.RolesTab) },
        missing,
      ],
    },
    {
      path: 'settings',
      ...lazyRoute(pages.settings, (m) => m.default),
      children: [
        { index: true, element: <Navigate to="business" replace /> },
        { path: 'business', ...lazyRoute(pages.settings, (m) => m.BusinessTab) },
        { path: 'plan', ...lazyRoute(pages.settings, (m) => m.PlanTab) },
        gated('usage.read', [{ path: 'billing', ...lazyRoute(pages.settings, (m) => m.BillingTab) }]),
        { path: 'bots', ...lazyRoute(pages.settings, (m) => m.BotsTab) },
        gated('properties.read', [{ path: 'properties', ...lazyRoute(pages.settings, (m) => m.PropertiesTab) }]),
        { path: 'backup', ...lazyRoute(pages.settings, (m) => m.BackupTab) },
        { path: 'danger', ...lazyRoute(pages.settings, (m) => m.DangerTab) },
        missing,
      ],
    },
  ]),
];

const platformRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="overview" replace /> },
  { path: 'overview', ...lazyRoute(pages.platform, (m) => m.PlatformOverview) },
  { path: 'businesses', ...lazyRoute(pages.platform, (m) => m.PlatformBusinesses) },
  { path: 'deletions', ...lazyRoute(pages.platform, (m) => m.PlatformDeletions) },
  { path: 'users/:userId?', ...lazyRoute(pages.platform, (m) => m.PlatformUsers) },
  { path: 'customers', ...lazyRoute(pages.platform, (m) => m.PlatformCustomers) },
  { path: 'tickets', ...lazyRoute(pages.platform, (m) => m.PlatformTickets) },
  { path: 'channels', ...lazyRoute(pages.platform, (m) => m.PlatformChannels) },
  { path: 'tools', ...lazyRoute(pages.platform, (m) => m.PlatformTools) },
  { path: 'usage', ...lazyRoute(pages.platform, (m) => m.PlatformUsage) },
  { path: 'performance', ...lazyRoute(pages.performance, (m) => m.PlatformPerformance) },
  { path: 'models', ...lazyRoute(pages.platform, (m) => m.PlatformModels) },
  { path: 'templates', ...lazyRoute(pages.platform, (m) => m.PlatformTemplates) },
  { path: 'channel-types', ...lazyRoute(pages.platform, (m) => m.PlatformChannelTypes) },
  missing,
];

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      { path: '/sign-in', ...lazyRoute(auth, (m) => m.SignInPage) },
      { path: '/auth/callback', ...lazyRoute(auth, (m) => m.AuthCallbackPage) },
      // Supabase's suggested email templates link to /auth/confirm?token_hash=…&type=…&next=….
      { path: '/auth/confirm', ...lazyRoute(auth, (m) => m.AuthCallbackPage) },
      { path: '/invite/:token', ...lazyRoute(auth, (m) => m.InvitePage) },
      {
        element: <RequireAuth />,
        children: [
          { path: '/onboarding', ...lazyRoute(auth, (m) => m.OnboardingPage) },
          // Earlier address of business pages, still used by shared links.
          { path: '/t/:tenant/:bot/*', element: <LegacyScopeRedirect /> },
          // Business pages sit at the root (/overview, /tickets/…); the business and bot are not in the URL.
          // The pathless child keeps errors inside the shell, so navigation still works.
          { element: <ScopeLayout />, children: [{ errorElement: <RouteError />, children: businessRoutes }] },
          {
            path: '/platform',
            element: <RequirePlatformAdmin />,
            children: [{ element: <PlatformLayout />, children: [{ errorElement: <RouteError />, children: platformRoutes }] }],
          },
        ],
      },
      // Every other unknown address, signed in or not: a full-screen 404 outside the shell and the sign-in guard.
      // Unknown tabs inside a section, and pages a role can't open, get the 404 inside the shell instead.
      { path: '*', element: <NotFound /> },
    ],
  },
]);
