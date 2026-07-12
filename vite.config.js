import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// GitHub Pages project site: https://TysonK5.github.io/the_ride/
// Assets must load from /the_ride/assets/... not /assets/...
export default defineConfig({
  plugins: [react()],
  base: '/the_ride/',
})
