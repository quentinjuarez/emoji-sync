<template>
  <div class="h-screen w-screen flex items-center justify-center">
    Loading...
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

onMounted(async () => {
  const token = route.query.token as string | null;

  const isSlackCallback = route.name === 'slack-callback';
  const isGitlabCallback = route.name === 'gitlab-callback';

  if (!token) return;

  try {
    const base64Token = atob(token || '');
    const tokenData = JSON.parse(base64Token);

    if (isSlackCallback && tokenData.team?.id) {
      localStorage.setItem('slackData', JSON.stringify(tokenData));
    } else if (isGitlabCallback && tokenData.groups?.length) {
      localStorage.setItem('gitlabData', JSON.stringify(tokenData));
    }
  } catch (error) {
    console.error('Error decoding token:', error);
  }

  router.push({ name: 'index' });
});
</script>

<style scoped></style>
