/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_DASHBOARD_URL?: string;
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_PAY_PAGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
