import {defineConfig} from 'vite';
export default defineConfig({
  base:'/',
  build:{outDir:'dist',target:'es2022',assetsDir:'assets',cssCodeSplit:false,reportCompressedSize:true},
  server:{port:5173,strictPort:true}
});