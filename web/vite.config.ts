import { defineConfig, loadEnv, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * GitHub Pages не дає задавати HTTP-заголовки, тому політику безпеки вмісту (CSP)
 * вбудовуємо в кожну сторінку через <meta>. (frame-ancestors / X-Frame-Options через
 * <meta> не працюють — за потреби поставте Cloudflare перед сайтом.)
 */
function cspMeta(apiBase: string): Plugin {
  const api = apiBase ? new URL(apiBase).origin : '';
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://apis.google.com https://www.gstatic.com https://www.google.com/recaptcha/ https://www.recaptcha.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src 'self' ${api} https://*.googleapis.com https://*.cloudfunctions.net https://*.run.app https://www.google.com`.replace(/\s+/g, ' '),
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
  return {
    name: 'knb-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!--head-->',
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />\n    <!--head-->`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [cspMeta(env.VITE_API_BASE_URL || '')],
    resolve: {
      alias: {
        '@platforms': fileURLToPath(new URL('../functions/src/config/platforms.ts', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      fs: { allow: ['..'] },
      // Локально з емуляторами: /connect і /hooks обробляє Hosting-емулятор (rewrite → функції).
      proxy: {
        '/connect': 'http://127.0.0.1:5000',
        '/hooks': 'http://127.0.0.1:5000',
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
    },
  };
});
