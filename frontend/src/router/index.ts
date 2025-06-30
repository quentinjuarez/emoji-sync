import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'index',
    component: () => import('../pages/index.vue'),
  },
  {
    path: '/slack/callback',
    name: 'slack-callback',
    component: () => import('../pages/callback.vue'),
  },
  {
    path: '/gitlab/callback',
    name: 'gitlab-callback',
    component: () => import('../pages/callback.vue'),
  },
  // Fallback route for any unmatched paths
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../pages/error.vue'),
  },
];

export default () => {
  return createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
  });
};
