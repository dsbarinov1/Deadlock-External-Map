import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Cast process to any to resolve "Property 'cwd' does not exist on type 'Process'"
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 3000,
      strictPort: true,
    },
    define: {
      // Polyfill process.env for the Google GenAI SDK and App usage
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env': process.env
    }
  };
});