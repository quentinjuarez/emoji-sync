<template>
  <main class="p-6">
    <h1 class="text-2xl font-bold mb-4">Slack Emoji Sync</h1>

    <div v-if="!slackEmojis">
      <a :href="slackOAuthUrl" class="bg-blue-600 text-white px-4 py-2 rounded">
        Get emojis from Slack
      </a>
    </div>

    <div v-else>
      <h2 class="text-xl mb-2">Emojis :</h2>
      <div class="grid grid-cols-4 gap-2 mb-6">
        <div
          v-for="(url, name) in slackEmojis"
          :key="name"
          class="border p-2 rounded text-center"
        >
          <img :src="url" :alt="name" class="w-12 h-12 mx-auto" />
          <div class="text-sm mt-1">{{ name }}</div>
        </div>
      </div>
    </div>

    <h1 class="text-2xl font-bold mb-4">Gitlab Emoji Sync</h1>
    <div v-if="!gitlabEmojis">
      <a
        :href="gitlabOAuthUrl"
        class="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Get emojis from Gitlab
      </a>
    </div>

    <div v-else>
      <h2 class="text-xl mb-2">Emojis :</h2>
      <div class="grid grid-cols-4 gap-2 mb-6">
        <div
          v-for="(url, name) in gitlabEmojis"
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

const slackEmojis = ref<Record<string, string> | null>(null);
const gitlabEmojis = ref<Record<string, string> | null>(null);

const slackOAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${
  import.meta.env.VITE_SLACK_CLIENT_ID
}&scope=emoji:read&redirect_uri=${import.meta.env.VITE_SLACK_REDIRECT_URI}`;

const gitlabOAuthUrl = `https://gitlab.com/oauth/authorize?client_id=${
  import.meta.env.VITE_GITLAB_CLIENT_ID
}&redirect_uri=${
  import.meta.env.VITE_GITLAB_REDIRECT_URI
}&response_type=code&scope=api`;

async function fetchSlackEmojis(teamId: string) {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_BACK_URL}/slack/emojis?teamId=${teamId}`
    );
    slackEmojis.value = await res.json();
  } catch (error) {
    console.error('Error fetching Slack emojis:', error);
  }
}

async function fetchGitlabEmojis(groupPath: string) {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_BACK_URL}/gitlab/emojis?groupPath=${groupPath}`
    );
    gitlabEmojis.value = await res.json();
  } catch (error) {
    console.error('Error fetching Gitlab emojis:', error);
  }
}

onMounted(async () => {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');

  const isSlackCallback = url.pathname === '/slack/callback';
  const isGitlabCallback = url.pathname === '/gitlab/callback';

  if (!token) return;

  try {
    const base64Token = atob(token || '');
    const tokenData = JSON.parse(base64Token);

    if (isSlackCallback && tokenData.team?.id) {
      await fetchSlackEmojis(tokenData.team.id);
    } else if (isGitlabCallback && tokenData.groups?.length) {
      await fetchGitlabEmojis(tokenData.groups[0]);
    }
  } catch (error) {
    console.error('Error decoding token:', error);
  }
});
</script>
