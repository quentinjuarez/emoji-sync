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
    const tokenData = JSON.parse(base64Token); // This is the full response object from Slack or GitLab

    if (isSlackCallback) {
      // Slack tokenData comes directly from Slack's oauth.v2.access response
      // It should have an 'ok: true' field and 'team.id', 'access_token', etc.
      if (tokenData.ok && tokenData.team?.id && tokenData.access_token) {
        localStorage.setItem('slackData', JSON.stringify(tokenData));
      } else {
        console.error('Invalid Slack token data received in callback:', tokenData);
        // Optionally clear any partial/old slackData or redirect to an error page
      }
    } else if (isGitlabCallback) { // For any GitLab callback
      // The backend now sends a comprehensive tokenData object which includes:
      // access_token, refresh_token, expires_in, token_type, scope, created_at,
      // user: {id, username, name, avatar_url, web_url, etc.},
      // groups: ["full/path/to/group1", "full/path/to/group2", ...]
      // We store the entire object.
      // It's fine if tokenData.groups is empty; we still connected to the user's GitLab account.
      localStorage.setItem('gitlabData', JSON.stringify(tokenData));
      if (!tokenData.groups?.length) {
        console.warn('GitLab callback: No groups with sufficient permissions found in tokenData, but storing token for user information.');
      }
    }
  } catch (error) {
    console.error('Error decoding or processing token in callback:', error);
    // Consider redirecting to an error page or showing a user-friendly message
  }

  router.push({ name: 'index' });
});
</script>

<style scoped></style>
