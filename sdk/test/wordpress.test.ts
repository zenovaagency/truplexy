import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('WordPress plugin', () => {
  it('is the same file the dashboard shows', () => {
    const plugin = read('../wordpress/truplexy-chat/truplexy-chat.php');
    const embed = read('../../dashboard/src/features/integrations/snippets/wordpress-plugin.ts');
    const start = embed.indexOf('String.raw`') + 'String.raw`'.length;
    expect(embed.slice(start, embed.lastIndexOf('`;'))).toBe(plugin);
  });
});
