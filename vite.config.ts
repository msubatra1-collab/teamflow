import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(projectRoot, 'client'),
  publicDir: path.join(projectRoot, 'public'),
  plugins: [react()],
  resolve: { alias: { '@': path.join(projectRoot, 'client/src') } },
  build: { outDir: path.join(projectRoot, 'client/dist'), emptyOutDir: true },
  server: { host: '0.0.0.0', port: 5173 }
});
