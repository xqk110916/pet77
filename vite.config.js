import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'chrome110',
    rollupOptions: {
      input: {
        main: page('./index.html'),
        stats: page('./stats.html'),
        menu: page('./menu.html'),
        chat: page('./chat.html'),
        bubble: page('./bubble.html'),
      },
    },
  },
});
