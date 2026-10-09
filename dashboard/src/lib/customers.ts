import type { Customer } from '@/lib/api/types';

/** The contact to show for a type: its primary one, else the first. */
export const contactOf = (c: Pick<Customer, 'contacts'>, type: string): string | undefined => {
  const all = (c.contacts ?? []).filter((x) => x.type === type);
  return (all.find((x) => x.primary) ?? all[0])?.value;
};

/** What to call a customer who gave no name: their email, else any other contact, else their ID. */
export const customerLabel = (c: Pick<Customer, 'name' | 'contacts' | 'id'>) => c.name || contactOf(c, 'email') || c.contacts?.[0]?.value || c.id;

/** Normalises a contact value the way the API does, for the form's duplicate check. */
export function normalizeContact(type: string, value: string): string {
  const v = value.trim();
  if (type === 'email') return v.toLowerCase();
  if (type === 'phone') return v.replace(/[\s\-.()]/g, '');
  return v;
}

export const CONTACT_TYPE = /^[a-z][a-z0-9_-]{1,31}$/;
export const COMMON_CONTACT_TYPES = ['email', 'phone', 'discord', 'telegram', 'whatsapp'];
