<template>
  <section class="mt-8 p-4 border rounded shadow-sm bg-white">
    <h2 class="text-xl font-semibold mb-4">Synchronisation d'emojis</h2>

    <div class="flex items-center gap-4 mb-4">
      <!-- Source -->
      <Dropdown
        v-model="syncSource"
        :options="syncOptions"
        optionLabel="label"
        class="w-48"
        placeholder="Source"
      />

      <!-- Arrow -->
      <i class="pi pi-arrow-right text-xl" />

      <!-- Cible -->
      <Dropdown
        v-model="syncTarget"
        :options="syncOptions"
        optionLabel="label"
        class="w-48"
        placeholder="Cible"
      />

      <!-- Sync button -->
      <Button
        label="Synchroniser"
        icon="pi pi-refresh"
        class="ml-4"
        :disabled="!canSync"
        @click="handleSync"
      />
    </div>

    <div v-if="syncMessage" class="text-green-600 font-medium">
      {{ syncMessage }}
    </div>
  </section>
</template>

<script setup lang="ts">
const syncSource = ref(null);
const syncTarget = ref(null);
const syncMessage = ref('');

const syncOptions = [
  { label: 'Slack', value: 'slack' },
  { label: 'GitLab', value: 'gitlab' },
];

const canSync = computed(() => {
  return syncSource.value === 'slack' && syncTarget.value === 'gitlab';
});

async function handleSync() {
  if (!canSync.value) return;

  try {
    const slackData = localStorage.getItem('slackData');
    const gitlabData = localStorage.getItem('gitlabData');

    if (!slackData || !gitlabData) {
      syncMessage.value = 'Intégrations manquantes.';
      return;
    }

    const { team } = JSON.parse(slackData);
    const { groups } = JSON.parse(gitlabData);

    const res = await fetch(
      `${import.meta.env.VITE_BACK_URL}/sync/slack-to-gitlab`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slackTeamId: team.id,
          gitlabGroupPath: groups[0].path,
        }),
      }
    );

    if (res.ok) {
      syncMessage.value = 'Synchronisation réussie 🎉';
    } else {
      syncMessage.value = 'Échec de la synchronisation.';
    }
  } catch (err) {
    console.error(err);
    syncMessage.value = 'Erreur pendant la synchronisation.';
  }
}
</script>
