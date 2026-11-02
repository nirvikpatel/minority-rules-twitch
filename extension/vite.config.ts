import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  root:fileURLToPath(new URL('.',import.meta.url)),
  base:'./',
  build:{
    outDir:'../extension-dist',emptyOutDir:true,
    rollupOptions:{input:{viewer:fileURLToPath(new URL('viewer.html',import.meta.url)),config:fileURLToPath(new URL('config.html',import.meta.url))}},
  },
});
