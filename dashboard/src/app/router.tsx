import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import type { Permission } from '@/lib/api/types';
import { pages } from './nav';
import { RequireAuth, RequirePermission, RequirePlatformAdmin, RootRedirect, ScopeLayout } from './guards';
import { NotFound, RouteError } from './errors';
import { PlatformLayout } from './layouts/PlatformLayout';

/** A route whose component loads with its own chunk. */
function lazyRoute<M>(load: () => Promise<M>, pick: (m: M) => ComponentType): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: pick(await load()) }) };
}

/** Routes behind one permission: hidden in the nav, and a no-access state when opened by URL. */
const gated = (permission: Permission, what: string, children: RouteObject[]): RouteObject => ({
  element: <RequirePermission permission={permission} what={what} />,
  children,
});

const auth = () => import('@/features/auth/AuthPages');

const businessRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="overview" replace /> },
  gated('usage.read', 'the overview', [{ path: 'overview', ...lazyRoute(pages.overview, (m) => m.default) }]),
  gated('tickets.read', 'tickets', [
    { path: 'tickets/handoffs', ...lazyRoute(pages.tickets, (m) => m.HandoffsPage) },
    { path: 'tickets/:ticketId?', ...lazyRoute(pages.tickets, (m) => m.default) },
  ]),
  gated('knowledge.read', 'the knowledge base', [
    {
      path: 'knowledge',
      ...lazyRoute(pages.knowledge, (m) => m.default),
      children: [
        { index: true, ...lazyRoute(pages.knowledge, (m) => m.DocumentsTab) },
        { path: 'search', ...lazyRoute(pages.knowledge, (m) => m.SearchTab) },
      ],
    },
  ]),
  gated('bot.read', 'the assistant settings', [
    {
      // LLM, Tools and Playground share one unsaved draft of the bot's configuration.
      ...lazyRoute(pages.draft, (m) => m.default),
      children: [
        {
          path: 'llm',
          ...lazyRoute(pages.llm, (m) => m.default),
          children: [
            { index: true, element: <Navigate to="model" replace /> },
            { path: 'model', lazy: async () => ({ Component: (await import('@/features/llm/ModelTab')).default }) },
            gated('usage.read', 'model usage', [{ path: 'usage', lazy: async () => ({ Component: (await import('@/features/llm/UsageTab')).default }) }]),
            // Earlier addresses of these pages.
            { path: 'prompt', element: <Navigate to="../model" replace /> },
            { path: 'configuration', element: <Navigate to="../model" replace /> },
            { path: 'tools', element: <Navigate to="../../tools" replace /> },
            { path: 'playground', element: <Navigate to="../../playground" replace /> },
          ],
        },
        gated('tools.read', 'tools', [{ path: 'tools', ...lazyRoute(pages.tools, (m) => m.default) }]),
        gated('playground.run', 'the playground', [{ path: 'playground', ...lazyRoute(pages.playground, (m) => m.default) }]),
      ],
    },
  ]),
  gated('integrations.read', 'integrations', [
    {
      path: 'integrations',
      ...lazyRoute(pages.integrations, (m) => m.default),
      children: [
        { index: true, ...lazyRoute(pages.integrations, (m) => m.CatalogTab) },
        { path: 'webhook', ...lazyRoute(pages.integrations, (m) => m.WebhookTab) },
      ],
    },
    { path: 'api-keys', ...lazyRoute(pages.apiKeys, (m) => m.default) },
  ]),
  gated('audit.read', 'the activity log', [{ path: 'logs', ...lazyRoute(pages.logs, (m) => m.default) }]),
  gated('members.read', 'the team', [
    {
      path: 'team',
      ...lazyRoute(pages.team, (m) => m.default),
      children: [
        { index: true, ...lazyRoute(pages.team, (m) => m.MembersTab) },
        { path: 'invitations', ...lazyRoute(pages.team, (m) => m.InvitesTab) },
        { path: 'roles', ...lazyRoute(pages.team, (m) => m.RolesTab) },
      ],
    },
    {
      path: 'settings',
      ...lazyRoute(pages.settings, (m) => m.default),
      children: [
        { index: true, element: <Navigate to="business" replace /> },
        { path: 'business', ...lazyRoute(pages.settings, (m) => m.BusinessTab) },
        { path: 'plan', ...lazyRoute(pages.settings, (m) => m.PlanTab) },
        gated('usage.read', 'billing', [{ path: 'billing', ...lazyRoute(pages.settings, (m) => m.BillingTab) }]),
        { path: 'bots', ...lazyRoute(pages.settings, (m) => m.BotsTab) },
        { path: 'backup', ...lazyRoute(pages.settings, (m) => m.BackupTab) },
        { path: 'danger', ...lazyRoute(pages.settings, (m) => m.DangerTab) },
      ],
    },
  ]),
  { path: '*', element: <NotFound inShell /> },
];

const platformRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="overview" replace /> },
  { path: 'overview', ...lazyRoute(pages.platform, (m) => m.PlatformOverview) },
  { path: 'businesses', ...lazyRoute(pages.platform, (m) => m.PlatformBusinesses) },
  { path: 'users', ...lazyRoute(pages.platform, (m) => m.PlatformUsers) },
  { path: 'tickets', ...lazyRoute(pages.platform, (m) => m.PlatformTickets) },
  { path: 'tools', ...lazyRoute(pages.platform, (m) => m.PlatformTools) },
  { path: 'usage', ...lazyRoute(pages.platform, (m) => m.PlatformUsage) },
  { path: 'models', ...lazyRoute(pages.platform, (m) => m.PlatformModels) },
  { path: 'templates', ...lazyRoute(pages.platform, (m) => m.PlatformTemplates) },
  { path: '*', element: <NotFound inShell /> },
];

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      { path: '/sign-in', ...lazyRoute(auth, (m) => m.SignInPage) },
      { path: '/auth/callback', ...lazyRoute(auth, (m) => m.AuthCallbackPage) },
      { path: '/invite/:token', ...lazyRoute(auth, (m) => m.InvitePage) },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <RootRedirect /> },
          { path: '/onboarding', ...lazyRoute(auth, (m) => m.OnboardingPage) },
          // The pathless child keeps errors inside the shell, so navigation still works.
          { path: '/t/:tenant/:bot', element: <ScopeLayout />, children: [{ errorElement: <RouteError />, children: businessRoutes }] },
          {
            path: '/platform',
            element: <RequirePlatformAdmin />,
            children: [{ element: <PlatformLayout />, children: [{ errorElement: <RouteError />, children: platformRoutes }] }],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
