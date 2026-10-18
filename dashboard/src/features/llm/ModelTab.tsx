import { BookOpen } from 'lucide-react';
import { Card, Field, Input, Switch } from '@/components/ui';
import { useBotDraft } from './draft';
import { ViewOnly } from './LlmPage';
import { WebSearchCard } from './WebSearchCard';

/** The model and how it answers are the platform's, so this is only what the business decides. */
export default function ModelTab() {
  const { draft, setDraft, patchBot, canWrite } = useBotDraft();
  const b = draft.bot;

  return (
    <div className="grid gap-5">
      <ViewOnly />

      <Card title="Identity" description="How the assistant introduces itself.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assistant name" hint="Customers see this name." aside={`${b.name.length}/80`}>
            <Input value={b.name} disabled={!canWrite} onChange={(e) => patchBot({ name: e.target.value.slice(0, 80) })} />
          </Field>
          <Field label="Bot name" hint="Shown in this dashboard, e.g. in the bot switcher." aside={`${draft.name.length}/80`}>
            <Input value={draft.name} disabled={!canWrite} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.slice(0, 80) }))} />
          </Field>
        </div>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <BookOpen className="size-4 text-accent" /> Knowledge retrieval
          </span>
        }
        description="Answer from the knowledge base and cite it."
      >
        <Switch
          checked={b.ragEnabled ?? true}
          disabled={!canWrite}
          onCheckedChange={(v) => patchBot({ ragEnabled: v })}
          label="Use the knowledge base"
          description="Off means the assistant answers from its instructions alone."
        />
      </Card>

      <WebSearchCard />
    </div>
  );
}
