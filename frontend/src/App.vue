<template>
  <main class="p-6">
    <h1 class="text-2xl font-bold mb-4">Slack Emoji Sync</h1>

    <div v-if="!emojis">
      <a :href="slackOAuthUrl" class="bg-blue-600 text-white px-4 py-2 rounded">
        Get emojis from Slack
      </a>
    </div>

    <div v-else>
      <h2 class="text-xl mb-2">Emojis :</h2>
      <div class="grid grid-cols-4 gap-2 mb-6">
        <div
          v-for="(url, name) in emojis"
          :key="name"
          class="border p-2 rounded text-center"
        >
          <img :src="url" :alt="name" class="w-12 h-12 mx-auto" />
          <div class="text-sm mt-1">{{ name }}</div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const emojis = ref<Record<string, string> | null>(null);

const slackOAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${
  import.meta.env.VITE_SLACK_CLIENT_ID
}&scope=emoji:read&redirect_uri=${import.meta.env.VITE_SLACK_REDIRECT_URI}`;

// const gitlabOAuthUrl = `https://gitlab.com/oauth/authorize?client_id=${
//   import.meta.env.VITE_GITLAB_CLIENT_ID
// }&redirect_uri=${
//   import.meta.env.VITE_GITLAB_REDIRECT_URI
// }&response_type=code&scope=api`;

onMounted(async () => {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');

  if (!token) return;
  try {
    const base64Token = atob(token || '');
    const tokenData = JSON.parse(base64Token);
    const teamId = tokenData.team?.id;
    if (teamId) {
      console.log('Fetching emojis for team:', teamId);
      const res = await fetch(
        `${import.meta.env.VITE_BACK_URL}/slack/emojis?teamId=${teamId}`
      );
      emojis.value = await res.json();
    }
  } catch (error) {
    console.error('Error decoding token:', error);
  }
});
</script>
