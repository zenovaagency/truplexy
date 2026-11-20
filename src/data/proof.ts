/**
 * Social proof: customer logos, testimonials and a case study.
 *
 * PLACEHOLDER — every list here is empty on purpose. Add only real customers
 * who have agreed to be named, with words they actually said or wrote. Nothing
 * here may be invented, paraphrased into a quote, or rounded up.
 *
 * While a list is empty, its block is left off the live site. In `npm run dev`
 * the empty slots show as dashed "PLACEHOLDER" boxes, so the layout can be
 * reviewed before the content exists.
 */

export interface CustomerLogo {
  name: string;
  /** An SVG or PNG under public/customers/, e.g. '/customers/acme.svg'. */
  src: string;
  /** The customer's own site, if they're happy to be linked. */
  href?: string;
}

export interface Testimonial {
  /** Their words, exactly as approved by them. */
  quote: string;
  name: string;
  role: string;
  company: string;
  /** Optional headshot under public/customers/. */
  photo?: string;
}

export interface CaseStudy {
  company: string;
  /** One line: who they are and what they sell. */
  context: string;
  /** What changed, in their words or from figures they've approved. */
  summary: string;
  /** Up to three results, each with a source the customer has signed off. */
  results: { value: string; label: string }[];
  /** A page with the full story, once it exists. */
  href?: string;
}

/** PLACEHOLDER — logos of customers who have agreed to be shown. */
export const CUSTOMER_LOGOS: CustomerLogo[] = [];

/** PLACEHOLDER — approved quotes from real customers. */
export const TESTIMONIALS: Testimonial[] = [];

/** PLACEHOLDER — one real customer story, with figures the customer has approved. */
export const CASE_STUDY: CaseStudy | null = null;
