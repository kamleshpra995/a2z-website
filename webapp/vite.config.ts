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
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4173',
        // If the API server is not running, answer with a clear message instead of a bare 500.
        configure: (proxy) =>
          proxy.on('error', (_error, _req, res) => {
            if (!('writeHead' in res) || res.headersSent) return;
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error:
                  'The A2Z API server is not running. Check the [server] lines in the terminal where you ran npm run dev.',
              }),
            );
          }),
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        website: fileURLToPath(new URL('index.html', import.meta.url)),
        portal: fileURLToPath(new URL('portal/index.html', import.meta.url)),
      },
    },
  },
});
