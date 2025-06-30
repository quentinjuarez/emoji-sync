import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import initRouter from './router';
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import 'primeicons/primeicons.css';

const app = createApp(App);

const router = initRouter();
app.use(router);

const MyPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#C8DFFD',
      100: '#B5D4FC',
      200: '#8DBDFB',
      300: '#66A6FA',
      400: '#3E8FF8',
      500: '#1778F7',
      600: '#075ECF',
      700: '#054599',
      800: '#032C62',
      900: '#02142C',
      950: '#010811',
    },
  },
});

app.use(PrimeVue, {
  theme: {
    preset: MyPreset,
    options: {
      darkModeSelector: '.dark',
    },
  },
  ripple: false,
});

app.directive('ripple', {});

app.mount('#app');
