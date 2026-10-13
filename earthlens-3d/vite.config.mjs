import {defineConfig} from 'vite';
export default defineConfig({
  base:process.env.EARTHLENS_BASE || '/',
  build:{outDir:'dist',target:'es2022',assetsDir:'assets',cssCodeSplit:false,reportCompressedSize:true},
  server:{port:5173,strictPort:true}
});