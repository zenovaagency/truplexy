/**
 * A small Markdown renderer for chat replies. Everything is escaped first, so
 * the only HTML in the output is what this file writes: paragraphs, line
 * breaks, lists, code, bold, italics and links to http(s) or mailto.
 */

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function inline(text: string): string {
  // Code and URLs are set aside first, so emphasis markers inside them stay literal.
  const held: string[] = [];
  const hold = (html: string) => `\u0000${held.push(html) - 1}\u0000`;
  const link = (href: string, label: string) => hold(`<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">`) + label + hold('</a>');
  const out = escape(text)
    .replace(/`([^`\n]+)`/g, (_, code: string) => hold(`<code>${code}</code>`))
    .replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (_, label: string, href: string) => link(href, label))
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,!?;:'"])/g, (_, before: string, href: string) => before + link(href, hold(href)))
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)]);
}

export function renderMarkdown(source: string): string {
  const html: string[] = [];
  const blocks = source.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').split(/```[^\n]*\n?/);
  blocks.forEach((block, i) => {
    if (i % 2 === 1) {
      html.push(`<pre><code>${escape(block.replace(/\n$/, ''))}</code></pre>`);
      return;
    }
    for (const para of block.split(/\n{2,}/)) {
      const lines = para.split('\n').filter((l) => l.trim());
      if (!lines.length) continue;
      let list: 'ul' | 'ol' | null = null;
      let text: string[] = [];
      const flush = () => {
        if (text.length) html.push(`<p>${text.map(inline).join('<br>')}</p>`);
        text = [];
      };
      for (const line of lines) {
        const item = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(line);
        const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
        const kind = item ? (item[1] ? 'ul' : 'ol') : null;
        if (kind !== list) {
          if (list) html.push(`</${list}>`);
          else flush();
          if (kind) html.push(`<${kind}>`);
          list = kind;
        }
        if (item) html.push(`<li>${inline(item[3])}</li>`);
        else if (heading) {
          flush();
          html.push(`<p><strong>${inline(heading[1])}</strong></p>`);
        } else text.push(line.trim());
      }
      if (list) html.push(`</${list}>`);
      flush();
    }
  });
  return html.join('');
}
