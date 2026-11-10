import type { MetaProvider } from '@/lib/api/types';
import { META_PAGE_LINKS, META_PERMISSIONS } from '@/lib/meta';
import { META_LINKS } from '@/lib/whatsapp';
import { B, C, CodeList, type GuideShot, type GuideStep } from './SetupGuide';

/* The steps in Meta for Messenger, Instagram and WhatsApp, each with a screenshot of the screen and what to click outlined. */

const shot = (name: string, alt: string): GuideShot => ({ src: `${import.meta.env.BASE_URL}guides/meta/${name}.webp`, alt });

const WHATSAPP_PERMISSIONS = ['whatsapp_business_messaging', 'whatsapp_business_management'];

const p = (children: React.ReactNode) => <p>{children}</p>;

/** A link to a page in Meta, inside a step's text. */
const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
    {children}
  </a>
);

/** What someone new to Meta needs before the first step: an account that can make apps, and for Pages a portfolio. */
function beforeYouStart(kind: 'messenger' | 'instagram' | 'whatsapp'): GuideStep {
  const wa = kind === 'whatsapp';
  return {
    title: 'Before you start',
    body: (
      <>
        {p(<>New to Meta's developer tools? Set these up first. Each takes a few minutes, and you only do it once.</>)}
        <ol className="grid list-decimal gap-1.5 pl-5">
          <li>
            A <B>Meta developer account</B>: <L href={META_PAGE_LINKS.developer}>register as a developer</L> with your own Facebook account. Meta asks you to confirm your phone or email.
          </li>
          {wa ? (
            <li>
              A <B>business portfolio</B>. If you don't have one, Meta lets you create it while you make the app.
            </li>
          ) : (
            <>
              <li>
                A <B>Facebook Page</B> for your business, the one customers message. Don't have one? <L href={META_PAGE_LINKS.createPage}>Create a Page</L>.
              </li>
              <li>
                A <B>business portfolio</B> that owns the Page. In <L href={META_PAGE_LINKS.business}>Meta Business Suite</L>, create one if Meta asks, then add the Page under{' '}
                <B>Business settings → Accounts → Pages → Add</B>.
              </li>
            </>
          )}
          {kind === 'instagram' && (
            <li>
              An Instagram <B>professional</B> account (business or creator) for the business. The next step links it to the Page.
            </li>
          )}
          {wa && (
            <li>
              A phone number. To try it out, Meta gives you a free test number. To answer customers, use a number that can get a text or call and isn't in the WhatsApp or WhatsApp
              Business app (delete it there first if it is).
            </li>
          )}
        </ol>
        {p(<>Use the same Facebook account for all of it: it becomes the admin of the app, and it's the account you test with later.</>)}
      </>
    ),
    link: { href: META_PAGE_LINKS.developer, label: 'Register as a Meta developer' },
  };
}

/** Meta's list of webhook fields for a Page, with the two the assistant needs. */
const subscribeShots = [
  shot('messenger-subscribe', 'Edit Page Subscriptions: messages and messaging_postbacks ticked, then Confirm'),
  shot('messenger-subscribed', 'Generate access tokens: the Page with messages and messaging_postbacks subscribed'),
];

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
                  <B>Pages</B> → tick your Page → turn on <B>Full access → Everything</B>. Click Assign assets.
                </>,
              )}
              {p(
                <>
                  Then Assign assets again: <B>Apps</B> → tick the app you made → turn on <B>Full access → Manage app</B>. Click Assign assets.
                </>,
              )}
            </>
          ) : (
            <>
              {p(
                <>
                  <B>Apps</B> → tick the app you made → turn on <B>Full access → Manage app</B>. Click Assign assets.
                </>,
              )}
              {p(
                <>
                  Then Assign assets again: <B>WhatsApp accounts</B> → tick the account → turn on <B>Full access → Everything</B>. Click Assign assets.
                </>,
              )}
            </>
          )}
        </>
      ),
      shots:
        kind === 'page'
          ? [shot('assign-page', 'Assign assets: the Page ticked with Full access, Everything'), shot('assign-app', 'Assign assets: the app ticked with Manage app')]
          : [shot('assign-app', 'Assign assets: the app ticked with Manage app'), shot('wa-assign-account', 'Assign assets: the WhatsApp account ticked with Full access, Everything')],
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
      shots: [
        shot('token-never', 'Generate token: Token expiration set to Never'),
        shot(kind === 'page' ? 'token-permissions' : 'wa-token-permissions', 'Generate token: the permissions ticked and the Generate token button'),
      ],
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
    beforeYouStart(provider),
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

/** WhatsApp: from a new app to the four values the form asks for (Meta's layout as of November 2026). */
export function whatsAppSetupSteps(): GuideStep[] {
  return [
    beforeYouStart('whatsapp'),
    {
      title: 'Create a Meta app',
      body: (
        <>
          {p(
            <>
              In Meta for Developers, click <B>Create app</B>. Give it a name, then under use cases pick <B>Business messaging</B> and tick <B>Connect with customers through WhatsApp</B>.
            </>,
          )}
          {p(<>Pick your business portfolio when asked, then <B>Create app</B>.</>)}
        </>
      ),
      shots: [shot('use-case-whatsapp', 'Create app, use cases: Business messaging with the WhatsApp use case ticked')],
      link: { href: META_LINKS.apps, label: 'Open Meta for Developers' },
    },
    {
      title: 'Turn on WhatsApp',
      body: (
        <>
          {p(
            <>
              On the app's dashboard, click <B>Customize</B> next to the WhatsApp use case, then <B>Step 1. Try it out</B>.
            </>,
          )}
          {p(
            <>
              Check the business portfolio is yours and click <B>Continue</B>. This accepts Meta's WhatsApp terms and gives you a WhatsApp Business Account with a free test number.
            </>,
          )}
        </>
      ),
      shots: [shot('wa-terms', 'Step 1. Try it out: the business portfolio and the Continue button')],
    },
    {
      title: 'Copy the two IDs',
      body: (
        <>
          {p(
            <>
              Still on <B>Step 1. Try it out</B>, copy the <B>Phone Number ID</B> and the <B>Messaging account ID</B>. Paste the Messaging account ID in the form's WhatsApp Business Account ID
              field. Both are long numbers, not the phone number itself.
            </>,
          )}
          {p(
            <>
              To use your own number instead of the test one: open <B>Step 2. Production setup</B> → <B>Register your WhatsApp phone number</B> → <B>Add phone number</B>, and verify it. Then copy
              its Phone Number ID instead.
            </>,
          )}
        </>
      ),
      shots: [
        shot('wa-api-setup', 'Step 1. Try it out: the Phone Number ID and the Messaging account ID'),
        shot('wa-register', 'Step 2. Production setup: Add phone number, to use your own number'),
      ],
      link: { href: META_LINKS.docs, label: "Meta's WhatsApp getting-started guide" },
    },
    ...systemUserSteps('whatsapp', WHATSAPP_PERMISSIONS),
    appSecretStep(p(<>Don't use the token from Step 1. Try it out: it stops working after a day.</>)),
  ];
}

/** After connecting a Page or Instagram account: the webhook, the Page's message events, a test, and going public. */
export function metaAfterSteps(provider: MetaProvider, pageId?: string): GuideStep[] {
  const ig = provider === 'instagram';
  return [
    {
      title: 'Add the webhook',
      body: ig ? (
        <>
          {p(
            <>
              In your app, open the Messenger use case (<B>Customize</B>) and go to <B>Instagram settings</B>. Under <B>Webhooks</B>, click <B>Add callback URL</B>.
            </>,
          )}
          {p(
            <>
              Copy the <B>Callback URL</B> and <B>Verify token</B> from above into Meta's two boxes and click <B>Verify and save</B>. The status above turns green when Meta has checked them.
            </>,
          )}
          {p(
            <>
              If Meta then lists Instagram webhook fields, click <B>Subscribe</B> next to <C>messages</C> and <C>messaging_postbacks</C>.
            </>,
          )}
        </>
      ) : (
        <>
          {p(
            <>
              In your app, open the Messenger use case (<B>Customize</B>) and go to <B>Messenger API Settings</B>. Under <B>1. Configure webhooks</B>, copy the <B>Callback URL</B> and{' '}
              <B>Verify token</B> from above into Meta's two boxes.
            </>,
          )}
          {p(
            <>
              Click <B>Verify and save</B>. The status above turns green when Meta has checked them.
            </>,
          )}
        </>
      ),
      shots: [shot(`webhook-${provider}`, ig ? 'Instagram settings: Add callback URL under Webhooks' : 'Messenger API Settings: Callback URL, Verify token, and Verify and save')],
    },
    {
      title: 'Turn on message events',
      body: (
        <>
          {p(
            <>
              Don't skip this: with the webhook verified but no events turned on, Meta sends nothing and the assistant stays quiet.
            </>,
          )}
          {p(
            <>
              {ig ? (
                <>
                  Go to <B>Messenger API Settings</B> in the same use case and open
                </>
              ) : (
                <>Still on Messenger API Settings, open</>
              )}{' '}
              <B>2. Generate access tokens</B>. Your Page is listed there once it's connected in Truplexy; if it isn't, click <B>Add Page</B> and pick it.
            </>,
          )}
          {p(
            <>
              Click <B>Add Subscriptions</B> next to the Page, tick <C>messages</C> and <C>messaging_postbacks</C>, and click <B>Confirm</B>. The Page's row then says “messages and
              messaging_postbacks”.
            </>,
          )}
        </>
      ),
      shots: subscribeShots,
    },
    {
      title: 'Send a test message',
      body: (
        <>
          {p(
            <>
              Message your {ig ? 'Instagram account from a personal Instagram account linked to' : 'Page from'} the Facebook account you made the app with
              {pageId && !ig ? (
                <>
                  {' '}
                  (open <L href={`https://m.me/${pageId}`}>m.me/{pageId}</L>)
                </>
              ) : null}
              . The assistant should answer within a few seconds, and the status above changes to <B>Receiving messages</B>.
            </>,
          )}
          {p(
            <>
              No answer? Check the {ig ? 'webhook fields and the ' : ''}Page's row in <B>2. Generate access tokens</B> lists <C>messages</C>, and that you wrote from an account with a role
              on the app. Messages sent before the events were turned on don't arrive later; send a new one.
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

/** After connecting a WhatsApp number: publishing (Meta delivers nothing before), the webhook, a test, and going live. */
export function whatsAppAfterSteps(): GuideStep[] {
  return [
    {
      title: 'Publish the app',
      body: (
        <>
          {p(
            <>
              Do this first. Until the app is published, Meta delivers <B>no</B> WhatsApp messages to the assistant, not even yours.
            </>,
          )}
          {p(
            <>
              In your app, click <B>Publish</B> in the left menu and publish it. It needs the Privacy policy URL from App settings → Basic.
            </>,
          )}
        </>
      ),
      shots: [shot('publish', 'The app dashboard: the Publish step and button')],
      link: { href: META_LINKS.apps, label: 'Open your apps' },
    },
    {
      title: 'Add the webhook',
      body: (
        <>
          {p(
            <>
              In the WhatsApp use case, open <B>Step 2. Production setup</B>. Under <B>Configure Webhooks</B>, paste the <B>Callback URL</B> and <B>Verify token</B> from above and click{' '}
              <B>Verify and save</B>.
            </>,
          )}
          {p(
            <>
              If Meta then lists webhook fields, subscribe to <C>messages</C>. The status above turns green when Meta has checked the webhook.
            </>,
          )}
        </>
      ),
      shots: [shot('wa-webhook', 'Step 2. Production setup: Callback URL, Verify token, and Verify and save')],
    },
    {
      title: 'Send a test message',
      body: (
        <>
          {p(
            <>
              Send the number a WhatsApp message from your own phone. The assistant should answer, and the status above shows <B>Receiving messages</B>.
            </>,
          )}
          {p(
            <>
              On Meta's free test number, only up to five phone numbers you've added can chat. Add yours first: <B>Step 1. Try it out → Recipient → Manage phone number list</B> →{' '}
              <B>Add phone number</B>, then type the code WhatsApp sends you.
            </>,
          )}
          {p(<>No answer? Check the app is published and the webhook shows <C>messages</C> subscribed, then send a new message.</>)}
        </>
      ),
      shots: [shot('wa-recipient', 'Step 1. Try it out: the Recipient list and Manage phone number list')],
    },
    {
      title: 'Answer everyone',
      body: (
        <>
          {p(
            <>
              For customers to reach you, use your own number rather than the test one: <B>Step 2. Production setup → Register your WhatsApp phone number → Add phone number</B>. Then connect
              that number in Truplexy with its own Phone Number ID.
            </>,
          )}
          {p(<>WhatsApp lets your team reply within 24 hours of the customer's last message. After that, the reply is saved but not sent.</>)}
        </>
      ),
      shots: [shot('wa-register', 'Step 2. Production setup: Add phone number')],
    },
  ];
}
