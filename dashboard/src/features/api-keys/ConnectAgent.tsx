import { connectSnippets, mcpUrl } from '@/lib/agents';
import { CodeBlock, CopyField, Field } from '@/components/ui';

/** How to connect Claude, Cursor and other MCP clients, with the key filled in when it is known. */
export function ConnectAgent({ apiKey }: { apiKey?: string }) {
  return (
    <div className="grid gap-3">
      <Field label="MCP endpoint">
        <CopyField value={mcpUrl()} />
      </Field>
      <CodeBlock samples={connectSnippets(apiKey)} />
      <p className="text-xs text-ink-faint">
        Any MCP client that speaks Streamable HTTP works: send the key as <code className="font-mono">Authorization: Bearer …</code>. The agent sees only the tools its key allows.
      </p>
    </div>
  );
}
