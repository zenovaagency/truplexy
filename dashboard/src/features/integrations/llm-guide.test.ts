import { describe, expect, it } from 'vitest';
import { INTEGRATIONS } from './catalog';
import { buildLlmGuide } from './llm-guide';
import { IMAGE_CURL, IMAGE_ERRORS, IMAGE_SNIPPETS } from './snippets/images';

const integration = (id: string) => INTEGRATIONS.find((i) => i.id === id)!;
const guide = (id: string, extra: Partial<Parameters<typeof buildLlmGuide>[0]> = {}) => buildLlmGuide({ integration: integration(id), botName: 'Ada', channels: [], ...extra });

describe('the "Copy for AI" guide: pictures', () => {
  it('adds the picture flow, limits, errors and the availability check for a server integration', () => {
    const text = guide('telegram');
    expect(text).toContain('## Sending pictures (optional)');
    expect(text).toContain('POST /conversations/{id}/attachments');
    expect(text).toContain('never send the chat key with it');
    expect(text).toContain('`attachments.enabled`');
    for (const [name] of IMAGE_ERRORS) expect(text, name).toContain(`\`${name}\``);
    expect(text).toContain('JPEG, PNG and WebP');
  });

  it('shows the chosen language’s script when the language pack is loaded, else curl', () => {
    const withCurl = guide('telegram');
    expect(withCurl).toContain('### Picture upload (curl)');
    expect(withCurl).toContain(IMAGE_CURL.split('\n')[0]);

    const pack = { files: { server: 'server.js', helper: 'truplexy.js', webhook: 'webhook.js', verify: 'verify.js' }, helper: '// helper', verify: '// verify', receiver: () => '', integrations: {} };
    const code = { handler: '// handler' };
    const withNode = guide('telegram', { lang: 'node', pack, code });
    expect(withNode).toContain('### Picture upload (Node.js)');
    expect(withNode).toContain(IMAGE_SNIPPETS.node.code.split('\n')[0]);
    expect(withNode).not.toContain('### Picture upload (curl)');
  });

  it('never carries a key or secret', () => {
    expect(guide('telegram')).not.toMatch(/tpx_|whsec_[A-Za-z0-9]/);
  });

  it('is left out for the website widget and for team-side integrations', () => {
    const widget = INTEGRATIONS.find((i) => i.widget)!;
    const team = INTEGRATIONS.find((i) => i.teamSide)!;
    expect(guide(widget.id)).not.toContain('Sending pictures');
    expect(guide(team.id)).not.toContain('Sending pictures');
  });
});
