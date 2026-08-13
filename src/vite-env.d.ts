/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GLYPHREACH_WS_URL?: string;
  readonly VITE_GLYPHREACH_BUILD_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
