<template>
  <main class="p-6">
    <Integrations :integrations="integrations" />
    <SyncPoc />
    <!-- <Sync :integrations="integrations" /> -->
  </main>
</template>

<script setup lang="ts">
interface Integration {
  type: string;
  status: string;
  name?: string; // e.g., Slack team name or GitLab group name
  teamId?: string; // For Slack
  groupPath?: string; // For GitLab
}
const integrations = ref<Integration[]>([]);
const isLoading = ref(true);

async function checkGitLabStatus() {
  const gitlabDataString = localStorage.getItem('gitlabData');
  if (gitlabDataString) {
    try {
      const gitlabData = JSON.parse(gitlabDataString);
      // Assuming the first group is the primary one for status checking, or adjust as needed
      const groupPath = gitlabData.groups?.[0];
      if (groupPath) {
        const res = await fetch(
          `${import.meta.env.VITE_BACK_URL}/gitlab/connected?groupPath=${encodeURIComponent(groupPath)}`
        );
        const data = await res.json();
        if (res.ok && data.connected) {
          return { type: 'gitlab', status: 'Connecté', name: data.user?.name || groupPath, groupPath };
        } else {
          localStorage.removeItem('gitlabData'); // Clear stale data
          return { type: 'gitlab', status: `Déconnecté: ${data.error || 'Veuillez vous reconnecter'}`, name: groupPath, groupPath };
        }
      }
    } catch (e) {
      console.error("Error parsing gitlabData or checking connection", e);
      localStorage.removeItem('gitlabData');
      return { type: 'gitlab', status: 'Erreur - Veuillez vous reconnecter', name: 'GitLab' };
    }
  }
  return null;
}

async function checkSlackStatus() {
  const slackDataString = localStorage.getItem('slackData');
  if (slackDataString) {
    try {
      const slackData = JSON.parse(slackDataString);
      const teamId = slackData.team?.id;
      if (teamId) {
        const res = await fetch(
          `${import.meta.env.VITE_BACK_URL}/slack/connected?teamId=${teamId}`
        );
        const data = await res.json();
        if (res.ok && data.connected) {
          return { type: 'slack', status: 'Connecté', name: data.team?.name || teamId, teamId };
        } else {
          localStorage.removeItem('slackData'); // Clear stale data
          return { type: 'slack', status: `Déconnecté: ${data.error || 'Veuillez vous reconnecter'}`, name: teamId, teamId };
        }
      }
    } catch (e) {
      console.error("Error parsing slackData or checking connection", e);
      localStorage.removeItem('slackData');
      return { type: 'slack', status: 'Erreur - Veuillez vous reconnecter', name: 'Slack' };
    }
  }
  return null;
}

onMounted(async () => {
  isLoading.value = true;
  const activeIntegrationsPromises = [checkGitLabStatus(), checkSlackStatus()];
  const resolvedIntegrations = await Promise.all(activeIntegrationsPromises);
  integrations.value = resolvedIntegrations.filter(Boolean) as Integration[];
  isLoading.value = false;
});
</script>
