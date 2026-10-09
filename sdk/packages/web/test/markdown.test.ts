import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/markdown';

describe('renderMarkdown', () => {
  it('escapes HTML', () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('only links http(s) and mailto', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a');
    expect(renderMarkdown('[x](data:text/html,hi)')).not.toContain('<a');
    expect(renderMarkdown('[track](https://ex.com/t?a=1&b=2)')).toContain(
      '<a href="https://ex.com/t?a=1&amp;b=2" target="_blank" rel="noopener noreferrer nofollow">track</a>',
    );
    expect(renderMarkdown('mail [us](mailto:a@b.c)')).toContain('href="mailto:a@b.c"');
  });

  it('cannot break out of an href', () => {
    const html = renderMarkdown('[x](https://ex.com/"onmouseover="alert(1))');
    expect(html).not.toMatch(/href="[^"]*"onmouseover/);
  });

  it('autolinks bare URLs without trailing punctuation', () => {
    expect(renderMarkdown('See https://ex.com/a_b_c.')).toContain(
      '<a href="https://ex.com/a_b_c" target="_blank" rel="noopener noreferrer nofollow">https://ex.com/a_b_c</a>.',
    );
    expect(renderMarkdown('https://ex.com/_x_')).not.toContain('<em>');
  });

  it('renders emphasis, code, lists and paragraphs', () => {
    expect(renderMarkdown('**bold** and *it* and `a*b*c`')).toBe('<p><strong>bold</strong> and <em>it</em> and <code>a*b*c</code></p>');
    expect(renderMarkdown('Plans:\n- Free\n- Pro')).toBe('<p>Plans:</p><ul><li>Free</li><li>Pro</li></ul>');
    expect(renderMarkdown('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>');
    expect(renderMarkdown('a\nb\n\nc')).toBe('<p>a<br>b</p><p>c</p>');
    expect(renderMarkdown('```\n<b>x</b>\n```')).toBe('<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>');
  });
});
