/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public base URL printed in store QR codes, e.g. https://www.a2zpowersolution.in */
  readonly VITE_PUBLIC_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
