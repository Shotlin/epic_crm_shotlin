import { defineConfig } from 'vite';
import { resolveBuildRevisionSync } from './src/main/build-revision';

// https://vitejs.dev/config
export default defineConfig({
  define: {
    EPIC_BOS_BUILD_REVISION: JSON.stringify(resolveBuildRevisionSync()),
  },
});
