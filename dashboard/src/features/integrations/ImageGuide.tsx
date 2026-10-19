import type { ReactNode } from 'react';
import { Badge, CodeBlock } from '@/components/ui';
import { isServed, usePictureFeature } from '@/lib/images/feature';
import { useScopeCtx } from '@/lib/session/scope-context';
import { ALL_LANGS, LangPicker, useLang } from './languages';
import { IMAGE_CURL, IMAGE_ENDPOINTS, IMAGE_ERRORS, IMAGE_FEATURE_CHECK, IMAGE_LIMITS, IMAGE_NOTES, IMAGE_SNIPPETS, IMAGE_WIDGET } from './snippets/images';

/**
 * The flag for this section: set VITE_IMAGE_INPUT_GUIDE=hidden at build time to leave it out
 * altogether. Without it the section is shown, labelled "Coming soon", until the feature check
 * (`GET /playground/attachments/config`) says the API serves image input. Nothing here is part
 * of the public docs: they never import this file.
 */
export const IMAGE_GUIDE_HIDDEN = import.meta.env.VITE_IMAGE_INPUT_GUIDE === 'hidden';

const CORS_DOCS = 'https://github.com/zenovaagency/truplexy/blob/main/dashboard/README.md#configuration';

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-[12px] border border-line bg-surface">
      <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[0.8125rem] font-semibold text-ink [&::-webkit-details-marker]:hidden">{title}</summary>
      <div className="grid gap-3 border-t border-line px-3.5 py-3.5 text-[0.8125rem] text-ink-muted">{children}</div>
    </details>
  );
}

const code = (s: string) => <code>{s}</code>;

export function SendingPictures() {
  const { can } = useScopeCtx();
  const { feature } = usePictureFeature(can('playground.run'));
  const [lang, setLang] = useLang(ALL_LANGS);
  if (IMAGE_GUIDE_HIDDEN) return null;
  // Off for this business (plan, model) still means the API serves it: only "not served" is "coming soon".
  const live = isServed(feature);
  const snippet = IMAGE_SNIPPETS[lang];

  return (
    <section aria-labelledby="sending-pictures" className="grid gap-4 border-t border-line pt-5 text-[0.8125rem] text-ink-muted">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="sending-pictures" className="text-[0.9375rem] font-bold text-ink">
          Sending pictures
        </h3>
        {!live && <Badge tone="warn">Coming soon</Badge>}
      </div>

      {!live && (
        <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-warn">
          Pictures are not live yet. Until they are, the calls below answer 404 NOT_FOUND and an {code('attachments')} field is refused with INVALID_REQUEST. You can build against this now:
          check {code('attachments')} in {code('GET /profile')} (see “Check that pictures are available”) and show the attach button only when it says so, and nothing changes for your customers until then.
        </p>
      )}

      <p>
        A customer can attach pictures to a message and the assistant reads them. Pictures never pass through the API’s JSON bodies: they go straight to storage, and the message names them by ID. Each one takes three
        steps, and the third is the message itself:
      </p>
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>
          <strong className="text-ink">Register</strong> the picture: {code('POST /conversations/{id}/attachments')} with {code('{filename, content_type, size, sha256}')}. The answer has a presigned {code('url')}, the {code('headers')} to send and an
          attachment {code('id')}.
        </li>
        <li>
          <strong className="text-ink">PUT</strong> the raw file to that {code('url')} within 15 minutes, with exactly those headers and nothing else. This request goes to storage, not to Truplexy, so it never carries your chat key.
        </li>
        <li>
          <strong className="text-ink">Send the message</strong> with {code('attachments: ["att_…"]')}: 1 to 3 IDs. The reply to that call has read the pictures.
        </li>
      </ol>

      <div className="grid gap-3">
        <LangPicker langs={ALL_LANGS} value={lang} onChange={setLang} />
        <CodeBlock key={lang} samples={[{ label: snippet.file, code: snippet.code }, { label: 'curl', code: IMAGE_CURL }]} />
        <p className="text-xs text-ink-faint">Server code only: the chat key never goes in a browser or an app. The language examples build on the helper file shown above for that language.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Server SDK</th>
              <th>Behavior</th>
            </tr>
          </thead>
          <tbody>
            {IMAGE_ENDPOINTS.map(([method, path, sdk, description]) => (
              <tr key={path + method}>
                <td>
                  <code>
                    {method} {path}
                  </code>
                </td>
                <td>
                  <code>{sdk}</code>
                </td>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Part title="A website widget: the browser puts the file in storage">
        <p>
          A browser never holds a chat key, so it never calls these endpoints. Your server registers the picture and passes {code('url')} and {code('headers')} to the browser, which does the {code('PUT')} itself; then your server sends the
          message with the attachment ID. The file never has to pass through your server.
        </p>
        <CodeBlock samples={[{ label: IMAGE_WIDGET.server.file, code: IMAGE_WIDGET.server.code }, { label: IMAGE_WIDGET.browser.file, code: IMAGE_WIDGET.browser.code }]} />
        <p>
          The registration route is yours, so protect it like the message route: sign-in or rate limits, and pass on only the four fields. For other server languages, the first and third calls are the ones in the examples above; the
          browser code is the same.
        </p>
      </Part>

      <Part title="Limits, and what happens to a picture">
        <div className="overflow-x-auto">
          <table className="table">
            <tbody>
              {IMAGE_LIMITS.map(([what, detail]) => (
                <tr key={what}>
                  <th className="whitespace-nowrap text-left">{what}</th>
                  <td>{detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Read the limits from {code('GET /profile')} rather than copying them: the numbers above are today’s, and the server may change them. Do not assume the stored picture matches the file you uploaded in size, dimensions or type.
        </p>
      </Part>

      <Part title="Behavior notes">
        <ul className="list-disc space-y-2 pl-5">
          {IMAGE_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Part>

      <Part title="Check that pictures are available">
        <p>
          Don’t assume the feature exists. Read {code('attachments')} from {code('GET /profile')} on your server and show the attach button only when it is there and {code('enabled')} is true.
        </p>
        <CodeBlock code={IMAGE_FEATURE_CHECK} title="server.js" />
      </Part>

      <Part title="Errors">
        <p>
          A picture error happens before anything is stored or paid for, so there is nothing to clean up. Match on {code('error.code')}, never on the text, and keep {code('error.request_id')} for support. Don’t retry INVALID_IMAGE,
          UNSUPPORTED_IMAGE_TYPE or IMAGE_TOO_LARGE; do retry a failed PUT (a network error or a 5xx) up to twice with a short wait.
        </p>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>HTTP</th>
                <th>What to do</th>
              </tr>
            </thead>
            <tbody>
              {IMAGE_ERRORS.map(([name, status, what]) => (
                <tr key={name}>
                  <td>
                    <code>{name}</code>
                  </td>
                  <td>{status}</td>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Part>

      <Part title="Retries and storage CORS">
        <p>
          Retrying the <em>message</em> with the same {code('Idempotency-Key')} is safe: you get the first answer back and the message is stored and paid for once. An attachment itself is single-use, so a retry that has to start again registers the
          picture again.
        </p>
        <p>
          A browser’s {code('PUT')} to storage needs the storage bucket’s CORS rule to allow {code('PUT')} and {code('Content-Type')} from your website’s origin. The dashboard setup notes describe the same rule for knowledge uploads:{' '}
          <a href={CORS_DOCS} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            Configuration → R2 CORS
          </a>
          . Showing a picture from its {code('url')} in an {code('<img>')} needs no rule; fetching it with {code('fetch()')} does (a {code('GET')} rule).
        </p>
      </Part>
    </section>
  );
}
