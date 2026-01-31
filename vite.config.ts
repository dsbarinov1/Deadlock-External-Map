import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Cast process to any to resolve "Property 'cwd' does not exist on type 'Process'"
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    // CRITICAL for Overwolf: Use relative paths because the app runs from local file system
    base: './', 
    server: {
      port: 3000,
      strictPort: true,
    },
    define: {
      // Properly polyfill process.env for the browser
      // We do NOT want to pass the whole server process.env to the client for security and size reasons
      'process.env': {
        API_KEY: env.API_KEY || ''
      }
    }
  };
});