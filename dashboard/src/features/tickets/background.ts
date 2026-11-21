/**
 * A message an integration sent only as background for the assistant, such as who the customer is or
 * a ticket's earlier history ("[Context only] …"). The API stores it as the customer's but never
 * answers it, and it isn't something the customer wrote. Same test as the API's (rag.ContextOnly).
 */
export const isContextOnly = (content: string | null | undefined) => /^\s*\[context only\b/i.test(content ?? '');

/** The background without its "[Context only…]" label. */
export const contextText = (content: string) => content.replace(/^\s*\[context only[^\]]*\]\s*/i, '');
