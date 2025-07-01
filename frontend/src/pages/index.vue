<template>
  <main class="p-6">
    <Integrations :integrations="integrations" />
    <SyncPoc />
    <!-- <Sync :integrations="integrations" /> -->
  </main>
</template>

<script setup lang="ts">
const integrations = ref<{ type: string; status: string }[]>([]);

onMounted(() => {
  const activeIntegrations = [];

  if (localStorage.getItem('slackData')) {
    activeIntegrations.push({ type: 'slack', status: 'Connecté' });
  }
  if (localStorage.getItem('gitlabData')) {
    activeIntegrations.push({ type: 'gitlab', status: 'Connecté' });
  }

  integrations.value = activeIntegrations;
});
</script>
