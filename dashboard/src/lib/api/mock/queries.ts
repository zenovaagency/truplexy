import type { CustomerQuery, QueryEvent, QueryType, QueryTypePreset } from '@/lib/api/types';

/* Queries as the API keeps them, for demo mode. */

export type MockQueryType = Omit<QueryType, 'open'> & { tenant_id: string; bot_id: string };

export type MockQuery = Omit<CustomerQuery, 'reference' | 'type_name' | 'status_label' | 'customer_name' | 'assignee_name' | 'masked_properties'> & {
  tenant_id: string;
  bot_id: string;
  deleted?: boolean;
  events: QueryEvent[];
};

const opts = (...pairs: string[]) => pairs.flatMap((_, i) => (i % 2 ? [] : [{ value: pairs[i]!, label: pairs[i + 1]! }]));
const field = (key: string, label: string, type: QueryTypePreset['fields'][number]['type'], extra: Partial<QueryTypePreset['fields'][number]> = {}) => ({
  key, label, type, options: [], required: false, sensitive: false, ...extra,
});

const DEFAULT: QueryTypePreset['statuses'] = [
  { key: 'new', label: 'New', category: 'open' },
  { key: 'in_progress', label: 'In progress', category: 'open' },
  { key: 'waiting_customer', label: 'Waiting on customer', category: 'pending' },
  { key: 'resolved', label: 'Resolved', category: 'done' },
  { key: 'rejected', label: 'Rejected', category: 'done' },
];

/** The API's suggested query types. */
export const QUERY_PRESETS: QueryTypePreset[] = [
  {
    key: 'payment', name: 'Payment issue', description: 'A payment that failed, was charged twice, or needs a refund.', default_status: 'new', business_types: [],
    statuses: [
      { key: 'new', label: 'New', category: 'open' }, { key: 'investigating', label: 'Investigating', category: 'open' },
      { key: 'waiting_customer', label: 'Waiting on customer', category: 'pending' }, { key: 'refunded', label: 'Refunded', category: 'done' },
      { key: 'resolved', label: 'Resolved', category: 'done' }, { key: 'rejected', label: 'Rejected', category: 'done' },
    ],
    fields: [
      field('issue', 'Issue', 'select', { required: true, options: opts('failed', 'Payment failed', 'double_charge', 'Charged twice', 'refund', 'Refund request', 'other', 'Something else') }),
      field('transaction_id', 'Transaction or order ID', 'text'),
      field('amount', 'Amount', 'number'),
    ],
  },
  {
    key: 'order', name: 'Order problem', description: 'An order that arrived damaged, wrong or incomplete.', default_status: 'new', business_types: ['ecommerce'], statuses: DEFAULT,
    fields: [
      field('order_number', 'Order number', 'text', { required: true }),
      field('problem', 'Problem', 'select', { required: true, options: opts('damaged', 'Arrived damaged', 'wrong_item', 'Wrong item', 'missing_item', 'Item missing', 'other', 'Something else') }),
    ],
  },
  {
    key: 'delivery', name: 'Delivery', description: 'A late, lost or misdirected delivery.', default_status: 'new', business_types: ['ecommerce', 'hospitality'],
    statuses: [
      { key: 'new', label: 'New', category: 'open' }, { key: 'checking_carrier', label: 'Checking with carrier', category: 'pending' },
      { key: 'delivered', label: 'Delivered', category: 'done' }, { key: 'closed', label: 'Closed', category: 'done' },
    ],
    fields: [field('order_number', 'Order number', 'text', { required: true }), field('tracking_number', 'Tracking number', 'text'), field('address', 'Delivery address', 'long_text', { sensitive: true })],
  },
  {
    key: 'account', name: 'Account access', description: 'Someone can’t sign in or wants their account changed.', default_status: 'new', business_types: ['saas'], statuses: DEFAULT,
    fields: [field('request', 'Request', 'select', { required: true, options: opts('locked_out', 'Locked out', 'change_email', 'Change email', 'delete_account', 'Delete account') }), field('account_email', 'Account email', 'email', { required: true })],
  },
];
