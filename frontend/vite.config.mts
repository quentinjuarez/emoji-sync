import { defineConfig } from 'vite';

import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import vue from '@vitejs/plugin-vue';
import { PrimeVueResolver } from '@primevue/auto-import-resolver';

export default defineConfig({
  plugins: [
    AutoImport({
      imports: [
        { pinia: ['storeToRefs'] },
        'vue',
        { 'vue-i18n': ['useI18n'] },
        { 'vue-router': ['useRouter', 'useRoute'] },
      ],
      dirs: ['./src/stores', './src/utils', './src/composables'],
      dts: './src/types/auto-imports.d.ts',
      vueTemplate: true,
    }),
    Components({
      resolvers: [PrimeVueResolver()],
      dirs: ['src/components'],
      extensions: ['vue'],
      dts: './src/types/components.d.ts',
    }),
    vue(),
  ],
  server: {
    port: 3102,
  },
});
