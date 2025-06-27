<template>
  <main class="p-6">
    <h1 class="text-2xl font-bold mb-4">Slack Emoji Sync</h1>

    <div v-if="!emojis">
      <a :href="slackOAuthUrl" class="bg-blue-600 text-white px-4 py-2 rounded">
        Get emojis from Slack
      </a>

      <!-- <a
        href="https://slack.com/oauth/v2/authorize?client_id=7105649663652.9114575314594&scope=emoji:read&user_scope="
        ><img
          alt="Add to Slack"
          height="40"
          width="139"
          src="https://platform.slack-edge.com/img/add_to_slack.png"
          srcSet="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x"
      /></a> -->
    </div>

    <div v-else>
      <h2 class="text-xl mb-2">Emojis :</h2>
      <div class="grid grid-cols-4 gap-2">
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

onMounted(async () => {
  const url = new URL(window.location.href);
  const teamId = url.searchParams.get('team_id');
  if (teamId) {
    const res = await fetch(`http://localhost:3101/api/emojis/${teamId}`);
    emojis.value = await res.json();
  }
});
</script>
