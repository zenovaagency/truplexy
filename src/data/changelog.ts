/**
 * Product changelog, newest first. Each entry is something a customer can
 * see or use; site-only and internal changes stay out.
 */
export type ChangeTag = 'SDK' | 'Dashboard' | 'Channels' | 'Pricing';

export interface ChangeEntry {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  title: string;
  tag: ChangeTag;
  items: string[];
}

export const CHANGELOG: ChangeEntry[] = [
  {
    date: '2026-10-27',
    title: 'Your assistant learns from your team’s answers',
    tag: 'Dashboard',
    items: [
      'Turn on Learn from closed tickets under Knowledge base → Suggested. When a ticket your team answered closes, the assistant drafts a reusable question and answer from it, without the customer’s details or your internal notes.',
      'Nothing is added on its own: edit a draft and add it to the knowledge base, or dismiss it. Added articles show as From a ticket and link back to it.',
      'Train bot on a ticket drafts its article right away, whether or not learning is on. Each draft counts as one AI reply.',
    ],
  },
  {
    date: '2026-10-26',
    title: 'Closed chats stay closed, and the team joins by name',
    tag: 'SDK',
    items: [
      'When your team closes a ticket, the chat widget shows the conversation read-only with a button to start a new chat, instead of letting the visitor carry on in a ticket nobody is watching. The closed chat stays in the visitor’s browser for 3 days (closed-retention-days sets it), and the API refuses new messages to it with 409 TICKET_CLOSED.',
      'The chat API’s GET /conversations/{id} returns the conversation’s current ticket, and sending a message takes if_ticket_closed: "reject" to refuse closed conversations. The server package, the WordPress plugin and the code in the setup guides do this for you.',
      'The widget shows “Sam has joined and will reply here.” and “handed the conversation back to the assistant” as lines in the chat, and a visitor who asks for a person is connected to the team at once. In the dashboard, replying to a ticket the assistant is still answering asks you to take it over first.',
      'Fixed: a widget set to open when the page loads no longer replaces the visitor’s saved chat with an empty one.',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Products, queries and custom properties',
    tag: 'Dashboard',
    items: [
      'Define your own fields for customers, products and queries under Settings → Properties: text, numbers, dates, choices, links and more. Mark one sensitive to hide it from read-only teammates and from the assistant.',
      'Products: keep a catalog with prices and stock, or import it from a CSV file, a document or a page of your shop, and review everything before it is saved. Turn on product search under Tools so the assistant can answer from it.',
      'Queries: set up the requests you handle, such as payment issues or deliveries, each with its own form and statuses. The assistant can open them in a conversation and tell customers how theirs stand, and only theirs.',
      'Customers have pictures, uploaded by your team or copied from their chat platform.',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Customer pictures and properties through the chat API',
    tag: 'SDK',
    items: [
      'PUT /customer takes avatar_url, a link to the person’s picture on your platform, which Truplexy copies, and properties, the values of your custom properties.',
      'The server package’s CustomerInput and Customer types include them. Released as 0.4.7 of the web, React, Vue and server packages.',
    ],
  },
  {
    date: '2026-10-12',
    title: 'Web search sources and tickets that stay open',
    tag: 'SDK',
    items: [
      'When the assistant searches the web, the chat widget links the pages it used under its reply.',
      'Inactive tickets now close on their own. Set keepTicketsOpen in the server route, or the same setting in the WordPress plugin, to keep them open.',
      'Released as 0.4.3 of the web, React, Vue and server packages.',
    ],
  },
  {
    date: '2026-10-12',
    title: 'A page and a setup guide for every channel',
    tag: 'Channels',
    items: [
      'Each channel has its own overview at /channels, with a sample conversation drawn in that platform’s look.',
      'Each channel has a step-by-step setup guide in the docs, with server code for every supported language.',
      'WordPress joins the channel list.',
    ],
  },
  {
    date: '2026-10-10',
    title: 'Customers',
    tag: 'Dashboard',
    items: [
      'A new Customers page with search, a contacts editor and a detail panel.',
      'A customer can have any number of contacts (email, phone, Discord or any platform ID), so their history follows them across channels.',
      'Tickets show who they’re from, and the ticket queue can be filtered by customer.',
    ],
  },
  {
    date: '2026-10-09',
    title: 'Visitor details and the business profile in the chat widget',
    tag: 'SDK',
    items: [
      'The widget asks for the visitor’s name and email and opens a ticket named after them on the first message. Set details="off" or tickets: false to turn it off.',
      'The widget header uses your business name and logo unless you set heading or avatar.',
      'Released as 0.2.0 of the web, React, Vue and server packages.',
    ],
  },
  {
    date: '2026-10-09',
    title: 'Website chat SDK',
    tag: 'SDK',
    items: [
      'A drop-in <truplexy-chat> widget for any site: no dependencies, Shadow DOM, about 12 KB gzipped.',
      'React and Vue wrappers, a server route for Node and any Fetch runtime, and a WordPress plugin.',
      'Team replies arrive in real time, and the browser never sees your chat key.',
    ],
  },
  {
    date: '2026-10-07',
    title: 'AI ticket summaries',
    tag: 'Dashboard',
    items: [
      'Escalated tickets get a Generate summary button. The summary sits at the top of the conversation.',
      'A hint shows when newer messages have arrived, so you know when to regenerate.',
      'Ticket statuses are now simply open and closed.',
    ],
  },
  {
    date: '2026-10-07',
    title: 'Plans and pricing',
    tag: 'Pricing',
    items: [
      'Free, Starter ($29 a month) and Pro ($79 a month), with 20% off when billed yearly.',
      'A dedicated pricing page with the full feature comparison and token add-ons.',
    ],
  },
];

export const formatChangeDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
