import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Selaindemo: yksi itsenäinen HTML-tiedosto ilman Firebasea (scripts/build-demo.mjs inlinettaa). */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __LAN_ORIGIN__: '""' },
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
    rollupOptions: { input: 'demo.html', output: { inlineDynamicImports: true } },
  },
});
