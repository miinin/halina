import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { networkInterfaces } from 'node:os';

/** dev:lan – hostin QR-koodi osoittaa koneen LAN-IP:hen */
function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  define: {
    __LAN_ORIGIN__: JSON.stringify(
      command === 'serve' && process.argv.includes('--host') ? `http://${lanAddress()}:5173` : '',
    ),
  },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 800 },
}));
