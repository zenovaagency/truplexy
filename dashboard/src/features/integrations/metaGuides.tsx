import type { MetaProvider } from '@/lib/api/types';
import { META_PAGE_LINKS, META_PERMISSIONS } from '@/lib/meta';
import { META_LINKS } from '@/lib/whatsapp';
import { B, C, CodeList, type GuideShot, type GuideStep } from './SetupGuide';

/* The steps in Meta for Messenger, Instagram and WhatsApp, each with a screenshot of the screen and what to click outlined. */

const shot = (name: string, alt: string): GuideShot => ({ src: `${import.meta.env.BASE_URL}guides/meta/${name}.webp`, alt });

const WHATSAPP_PERMISSIONS = ['whatsapp_business_messaging', 'whatsapp_business_management'];

const p = (children: React.ReactNode) => <p>{children}</p>;

/** Making the system user and its token: the same in all three guides, apart from what it gets. */
function systemUserSteps(kind: 'page' | 'whatsapp', permissions: string[]): GuideStep[] {
  return [
    {
      title: 'Add a system user',
      body: (
        <>
          {p(
            <>
              Open <B>Business settings → Users → System users</B> and click <B>Add</B>. Give it any name (for example “Truplexy”) and the <B>Admin</B> role. If Meta asks you to accept its
              non-discrimination policy first, accept it.
            </>,
          )}
          {p(<>A system user's token keeps working when people leave or change their password. Don't see System users? Ask whoever owns the portfolio for full control.</>)}
        </>
      ),
      shots: [shot('system-users-add', 'Business settings, System users, with the Add button outlined')],
      link: { href: META_PAGE_LINKS.systemUsers, label: 'Open System users' },
    },
    {
      title: 'Give it the app and the ' + (kind === 'page' ? 'Page' : 'WhatsApp account'),
      body: (
        <>
          {p(
            <>
              With the system user selected, click <B>Assign assets</B>.
            </>,
          )}
          {kind === 'page' ? (
            <>
              {p(
                <>
                  <B>Pages</B> → tick your Page → turn on <B>Full control → Everything</B>. Click Assign.
                </>,
              )}
              {p(
                <>
                  Then Assign assets again: <B>Apps</B> → tick the app you made → turn on <B>Full control → Manage app</B>. Click Assign.
                </>,
              )}
            </>
          ) : (
            <>
              {p(
                <>
                  <B>Apps</B> → tick the app you made → turn on <B>Full control → Manage app</B>. Click Assign.
                </>,
              )}
              {p(
                <>
                  Then Assign assets again: <B>WhatsApp accounts</B> → tick the account → turn on <B>Full control</B>. Click Assign.
                </>,
              )}
            </>
          )}
        </>
      ),
      shots:
        kind === 'page'
          ? [shot('assign-page', 'Assign assets: the Page ticked with Full control, Everything'), shot('assign-app', 'Assign assets: the app ticked with Manage app')]
          : [shot('assign-app', 'Assign assets: the app ticked with Manage app')],
    },
    {
      title: 'Generate a token that never expires',
      body: (
        <>
          {p(
            <>
              Still on the system user, click <B>Generate token</B> and pick your app. Change <B>Token expiration</B> to <B>Never</B>. Meta picks 60 days unless you change it.
            </>,
          )}
          {p(
            <>
              Under <B>Assign permissions</B>, search for and tick <CodeList items={permissions} />. Click <B>Generate token</B> and copy it. Meta shows it only once.
            </>,
          )}
          {kind === 'page' &&
            p(
              <>
                A permission missing from the list? Go back to the step “Add the permissions”.
              </>,
            )}
        </>
      ),
      shots: [shot('token-never', 'Generate token: Token expiration set to Never'), shot('token-permissions', 'Generate token: the permissions ticked and the Generate token button')],
    },
  ];
}

const appSecretStep = (extra?: React.ReactNode): GuideStep => ({
  title: 'Copy the App secret',
  body: (
    <>
      {p(
        <>
          Back in your app, open <B>App settings → Basic</B>. Click <B>Show</B> next to <B>App secret</B> and copy it (Meta asks for your password).
        </>,
      )}
      {p(
        <>
          While you're there, fill in <B>Privacy policy URL</B> and save. Meta needs it before your app can go live.
        </>,
      )}
      {extra}
    </>
  ),
  shots: [shot('app-secret', 'App settings, Basic: App secret with Show, and the Privacy policy URL field')],
  link: { href: META_PAGE_LINKS.apps, label: 'Open your apps' },
});

/** Messenger and Instagram: from a Page in a portfolio to the three values the form asks for. */
export function metaSetupSteps(provider: MetaProvider): GuideStep[] {
  const ig = provider === 'instagram';
  return [
    ...(ig
      ? [
          {
            title: 'Link Instagram to your Page',
            body: (
              <>
                {p(
                  <>
                    Your Instagram account must be a <B>professional</B> account (business or creator). On your Facebook Page, open <B>Settings → Linked accounts → Instagram</B> and connect
                    it.
                  </>,
                )}
                {p(
                  <>
                    Then in the Instagram app: <B>Settings → Messages and story replies → Message controls → Connected tools</B>, and turn on <B>Allow access to messages</B>.
                  </>,
                )}
              </>
            ),
          } satisfies GuideStep,
        ]
      : []),
    {
      title: 'Find your Page ID',
      body: (
        <>
          {p(
            <>
              Your {ig ? 'linked ' : ''}Facebook Page has to be in a <B>business portfolio</B> where you have <B>full control</B>. Open <B>Business settings → Accounts → Pages</B>. If your
              Page isn't listed, click Add and add it.
            </>,
          )}
          {p(
            <>
              Click the Page. The <B>ID</B> under its name is the Page ID: a long number. Copy it for the form below.
            </>,
          )}
        </>
      ),
      shots: [shot('page-id', 'Business settings, Pages: the Page ID under the Page name')],
      link: { href: META_PAGE_LINKS.pages, label: 'Open Pages in Business settings' },
    },
    {
      title: 'Create a Meta app',
      body: (
        <>
          {p(
            <>
              In Meta for Developers, click <B>Create app</B>. Give it a name, then under use cases pick the <B>Business messaging</B> filter and tick{' '}
              {ig ? (
                <>
                  both <B>Engage with customers on Messenger from Meta</B> and <B>Manage messaging & content on Instagram</B>
                </>
              ) : (
                <B>Engage with customers on Messenger from Meta</B>
              )}
              .
            </>,
          )}
          {p(<>When it asks for a business, pick the portfolio your Page is in. Then click through to <B>Create app</B>.</>)}
        </>
      ),
      shots: [shot(`use-case-${provider}`, `Create app, use cases: Business messaging with the ${ig ? 'Messenger and Instagram' : 'Messenger'} use case ticked`)],
      link: { href: META_PAGE_LINKS.apps, label: 'Open Meta for Developers' },
    },
    {
      title: 'Add the permissions',
      body: (
        <>
          {p(
            <>
              On the app's dashboard, click <B>Customize the Engage with customers on Messenger from Meta use case</B>, then <B>Permissions and features</B>.
            </>,
          )}
          {p(
            <>
              Click <B>Add</B> next to <C>pages_read_engagement</C>
              {ig ? (
                <>
                  , <C>instagram_basic</C> and <C>instagram_manage_messages</C>
                </>
              ) : null}
              . The others are there already. Without this, they're missing when you make the token.
            </>,
          )}
        </>
      ),
      shots: [shot('customize-use-case', 'The app dashboard with the Messenger use case to customise'), shot('add-permission', 'Permissions and features: Add next to pages_read_engagement')],
    },
    ...systemUserSteps('page', META_PERMISSIONS[provider]),
    appSecretStep(),
  ];
}

/** WhatsApp: from a new app to the four values the form asks for. */
export function whatsAppSetupSteps(): GuideStep[] {
  return [
    {
      title: 'Create a Meta app',
      body: (
        <>
          {p(
            <>
              In Meta for Developers, click <B>Create app</B>. Give it a name, then under use cases pick <B>Business messaging</B> and tick <B>Connect with customers through WhatsApp</B>.
            </>,
          )}
          {p(<>Pick your business portfolio when asked, then <B>Create app</B>. Meta adds a WhatsApp Business Account and a free test number.</>)}
        </>
      ),
      shots: [shot('use-case-whatsapp', 'Create app, use cases: Business messaging with the WhatsApp use case ticked')],
      link: { href: META_LINKS.apps, label: 'Open Meta for Developers' },
    },
    {
      title: 'Copy the two IDs',
      body: (
        <>
          {p(
            <>
              In the app, open <B>WhatsApp → API Setup</B>. Under the number, copy the <B>Phone number ID</B> and the <B>WhatsApp Business Account ID</B>. They're long numbers, not the phone
              number itself.
            </>,
          )}
          {p(<>To use your own number instead of the test one, click Add phone number there first and verify it by SMS.</>)}
        </>
      ),
      link: { href: META_LINKS.docs, label: "Meta's WhatsApp getting-started guide" },
    },
    ...systemUserSteps('whatsapp', WHATSAPP_PERMISSIONS),
    appSecretStep(p(<>Don't use the temporary token on API Setup: it stops working after a day.</>)),
  ];
}

/** After connecting a Page or Instagram account: the webhook, a test, and going public. */
export function metaAfterSteps(provider: MetaProvider): GuideStep[] {
  const ig = provider === 'instagram';
  return [
    {
      title: 'Add the webhook',
      body: ig ? (
        <>
          {p(
            <>
              In your app, open the Messenger use case and go to <B>Instagram settings</B>. Under <B>Webhooks</B>, click <B>Add callback URL</B>.
            </>,
          )}
          {p(
            <>
              Paste the <B>Callback URL</B> and <B>Verify token</B> from above and click <B>Verify and save</B>. The status above turns green when Meta has checked it.
            </>,
          )}
        </>
      ) : (
        <>
          {p(
            <>
              In your app, open the Messenger use case and go to <B>Messenger API Settings</B>. Under <B>1. Configure webhooks</B>, paste the <B>Callback URL</B> and <B>Verify token</B> from
              above.
            </>,
          )}
          {p(
            <>
              Click <B>Verify and save</B>. The status above turns green when Meta has checked it.
            </>,
          )}
        </>
      ),
      shots: [shot(`webhook-${provider}`, ig ? 'Instagram settings: Add callback URL under Webhooks' : 'Messenger API Settings: Callback URL, Verify token, and Verify and save')],
    },
    {
      title: 'Send a test message',
      body: (
        <>
          {p(
            <>
              Truplexy has already subscribed your {ig ? 'account' : 'Page'} to <C>messages</C> and <C>messaging_postbacks</C>. If Meta shows a list of webhook fields, make sure those two are
              on.
            </>,
          )}
          {p(
            <>
              Now message your {ig ? 'Instagram account' : 'Page'} from <B>your own</B> {ig ? 'Instagram' : 'Facebook'} account. The assistant should answer, and the status above shows{' '}
              <B>Receiving messages</B>.
            </>,
          )}
        </>
      ),
    },
    {
      title: 'Answer everyone',
      body: (
        <>
          {p(
            <>
              Until Meta reviews your app, only people with a role on it (you, and anyone you add under <B>App roles → Roles</B>) reach the assistant. Messages from customers don't arrive yet.
            </>,
          )}
          {p(
            <>
              To answer everyone: click <B>Publish</B> in the app (it needs the Privacy policy URL), then in the use case's <B>Complete App Review</B> step, request{' '}
              <CodeList items={ig ? ['pages_messaging', 'instagram_manage_messages'] : ['pages_messaging']} />. Meta asks for a short screen recording and may need your business verified.
            </>,
          )}
          {p(
            <>
              {ig ? 'Instagram' : 'Messenger'} lets your team reply within 24 hours of the customer's last message. After that, the reply is saved but not sent.
            </>,
          )}
        </>
      ),
      shots: [shot('publish', 'The app dashboard: the Publish step and button')],
      link: { href: META_PAGE_LINKS.apps, label: 'Open your apps' },
    },
  ];
}
