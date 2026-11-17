import { fileURLToPath } from 'node:url';
import { defineConfig, createServer, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));
const alias = { '@shared': fileURLToPath(new URL('../server/src/shared', import.meta.url)) };
const WEBSITE_ENTRY = '/src/website/render.tsx';
const PLACEHOLDER = '<!--website-->';

/**
 * Pre-render the public website (src/website) into index.html, so search engines get the full
 * page as plain HTML. In development the dev server renders it on every request; during
 * `vite build` a short-lived Vite server renders it once.
 */
function prerenderWebsite(): Plugin {
  let devServer: ViteDevServer | undefined;
  async function renderWebsite(): Promise<string> {
    const server =
      devServer ??
      (await createServer({
        configFile: false,
        root,
        resolve: { alias },
        plugins: [react()],
        logLevel: 'silent',
        appType: 'custom',
        server: { middlewareMode: true, hmr: false, ws: false },
      }));
    try {
      const { render } = (await server.ssrLoadModule(WEBSITE_ENTRY)) as { render: () => string };
      return render();
    } finally {
      if (server !== devServer) await server.close();
    }
  }
  return {
    name: 'a2z-prerender-website',
    configureServer(server) {
      devServer = server;
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        return html.includes(PLACEHOLDER) ? html.replace(PLACEHOLDER, await renderWebsite()) : html;
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), prerenderWebsite()],
  resolve: { alias },
  server: {
    // The API runs separately (npm run dev -w server); the browser still sees one origin.
    proxy: { '/api': 'http://127.0.0.1:4173' },
  },
  build: {
    rollupOptions: {
      input: {
        website: fileURLToPath(new URL('index.html', import.meta.url)),
        app: fileURLToPath(new URL('app/index.html', import.meta.url)),
      },
    },
  },
});
