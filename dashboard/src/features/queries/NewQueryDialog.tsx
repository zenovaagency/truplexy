import { useEffect, useMemo, useState } from 'react';
import { useCreateQuery } from '@/lib/api/endpoints/queries';
import { useProperties } from '@/lib/api/endpoints/properties';
import type { CustomerQuery, QueryType } from '@/lib/api/types';
import { filledValues, toField, valueProblem, type FieldValue } from '@/lib/properties';
import { Button, Dialog, Field, Input, Select, SkeletonRows } from '@/components/ui';
import { PropertyFields } from '@/components/domain/Properties';

/** What another page fills in: the customer, conversation or ticket the query is about. */
export interface QueryPrefill {
  customer_id?: string;
  conversation_id?: string;
  ticket_id?: string;
}

export function NewQueryDialog({ types, prefill, onClose, onCreated }: { types: QueryType[]; prefill?: QueryPrefill; onClose: () => void; onCreated: (q: CustomerQuery) => void }) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const type = types.find((t) => t.id === typeId);
  const fields = useProperties('query', { scopeId: typeId, enabled: Boolean(typeId) });
  const defs = useMemo(() => fields.data ?? [], [fields.data]);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState('');
  const [touched, setTouched] = useState(false);
  const create = useCreateQuery();
  useEffect(() => {
    setValues(Object.fromEntries(defs.map((d) => [d.key, toField(d, undefined)])));
    setStatus(type?.default_status ?? '');
  }, [defs, type]);
  const problems = Object.fromEntries(defs.map((d) => [d.key, valueProblem(d, values[d.key] ?? '')]));
  const valid = Boolean(type) && !Object.values(problems).some(Boolean);

  const submit = () => {
    setTouched(true);
    if (!valid || !type) return;
    const properties = filledValues(defs, values);
    create.mutate(
      {
        type_id: type.id,
        subject: subject.trim() || undefined,
        status: status || undefined,
        ...prefill,
        ...(Object.keys(properties).length && { properties }),
      },
      {
        onSuccess: (q) => {
          onClose();
          onCreated(q);
        },
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New query"
      description={prefill?.customer_id || prefill?.conversation_id ? 'It is linked to the customer and conversation you came from.' : 'Pick what kind of request it is, then fill in its form.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="accent" loading={create.isPending} disabled={touched && !valid} onClick={submit}>
            Open query
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)} options={types.map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} options={(type?.statuses ?? []).filter((s) => s.category !== 'done').map((s) => ({ value: s.key, label: s.label }))} />
          </Field>
        </div>
        <Field label="Subject" optional>
          <Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} placeholder="What the customer needs, in a line" />
        </Field>
        {fields.isPending ? <SkeletonRows rows={2} /> : <PropertyFields defs={defs} values={values} errors={touched ? problems : undefined} onChange={(k, v) => setValues((x) => ({ ...x, [k]: v }))} />}
      </form>
    </Dialog>
  );
}
