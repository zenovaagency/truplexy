/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_DASHBOARD_URL?: string;
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_PAY_PAGE_URL?: string;
  /** Demo mode only: image input in the mock API. off (default), on, plan, no_vision or on-expired. */
  readonly VITE_MOCK_IMAGE_INPUT?: string;
  /** `hidden` leaves the "Sending pictures" section out of the integration guide. */
  readonly VITE_IMAGE_INPUT_GUIDE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
