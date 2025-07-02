<template>
  <section class="p-6">
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-2xl font-bold">Mes Intégrations</h1>

      <div class="flex items-center">
        <Dropdown
          v-model="selectedIntegration"
          :options="integrationOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Ajouter une intégration"
          class="w-60 mr-2"
        />
        <Button
          label="Ajouter"
          :disabled="!selectedIntegration"
          @click="onAddIntegration"
          class="ml-2"
        />
      </div>
    </div>

    <DataTable
      v-if="integrations.length"
      :value="integrations"
      class="mb-6"
      dataKey="type"
    >
      <Column field="type" header="Type">
        <template #body="slotProps">
          <span class="font-semibold">{{ slotProps.data.type === 'gitlab' ? 'GitLab' : slotProps.data.type === 'slack' ? 'Slack' : slotProps.data.type }}</span>
          <div v-if="slotProps.data.name" class="text-xs text-gray-500">{{ slotProps.data.name }}</div>
        </template>
      </Column>
      <Column field="status" header="Statut">
        <template #body="slotProps">
          <Tag :value="slotProps.data.status" :severity="getSeverity(slotProps.data)" />
        </template>
      </Column>
      <Column header="Actions" style="min-width: 12rem">
        <template #body="slotProps">
          <Button
            v-if="slotProps.data.status !== 'Connecté'"
            icon="pi pi-refresh"
            label="Reconnecter"
            @click="reconnectIntegration(slotProps.data)"
            size="small"
            class="p-button-warning mr-2"
          />
          <Button
            icon="pi pi-eye"
            label="Voir Emojis"
            @click="viewEmojis(slotProps.data)"
            :disabled="slotProps.data.status !== 'Connecté'"
            size="small"
          />
        </template>
      </Column>
    </DataTable>

    <div v-if="!integrations || integrations.length === 0" class="text-center text-gray-500">
      Aucune intégration pour le moment. Cliquez sur "Ajouter une intégration".
    </div>

    <Dialog
      v-model:visible="emojiDialogVisible"
      modal
      header="Emojis"
      :style="{ width: '50vw' }"
    >
      <div class="grid grid-cols-6 gap-3 max-h-[400px] overflow-auto">
        <div
          v-for="(url, name) in displayedEmojis"
          :key="name"
          class="text-center border p-2 rounded"
        >
          <img :src="url" :alt="name" class="w-10 h-10 mx-auto" />
          <div class="text-xs mt-1 truncate">{{ name }}</div>
        </div>
      </div>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
interface Integration {
  type: string;
  status: string;
  name?: string;
  teamId?: string;
  groupPath?: string;
}
const props = defineProps<{
  integrations: Integration[];
}>();

const emit = defineEmits(['refresh-integrations']);

const selectedIntegration = ref();
const displayedEmojis = ref<Record<string, string>>({});
const emojiDialogVisible = ref(false);

const integrationOptions = [
  { label: 'Slack', value: 'slack' },
  { label: 'GitLab', value: 'gitlab' },
];

const slackOAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${
  import.meta.env.VITE_SLACK_CLIENT_ID
}&scope=emoji:read&redirect_uri=${import.meta.env.VITE_SLACK_REDIRECT_URI}`;

const gitlabOAuthUrl = `https://gitlab.com/oauth/authorize?client_id=${
  import.meta.env.VITE_GITLAB_CLIENT_ID
}&redirect_uri=${
  import.meta.env.VITE_GITLAB_REDIRECT_URI
}&response_type=code&scope=api`;

function onAddIntegration() {
  if (selectedIntegration.value === 'slack') {
    window.location.href = slackOAuthUrl;
  } else if (selectedIntegration.value === 'gitlab') {
    window.location.href = gitlabOAuthUrl;
  }
}

async function fetchSlackEmojis(teamId: string) {
  const res = await fetch(
    `${import.meta.env.VITE_BACK_URL}/slack/emojis?teamId=${teamId}`
  );
  return await res.json();
}

async function fetchGitlabEmojis(groupPath: string) {
  const res = await fetch(
    `${import.meta.env.VITE_BACK_URL}/gitlab/emojis?groupPath=${groupPath}`
  );
  return await res.json();
}

function viewEmojis(integration: { type: string }) {
  if (integration.type === 'slack') {
    const slackData = localStorage.getItem('slackData');
    if (slackData) {
      const { team } = JSON.parse(slackData);
      if (team?.id) {
        fetchSlackEmojis(team.id).then((emojis) => {
          displayedEmojis.value = emojis;
          emojiDialogVisible.value = true;
        });
      }
    }
  } else if (integration.type === 'gitlab') {
    const gitlabData = localStorage.getItem('gitlabData');
    if (gitlabData) {
      const { groups } = JSON.parse(gitlabData);
      if (groups?.length) {
        fetchGitlabEmojis(groups[0]).then((emojis) => {
          displayedEmojis.value = emojis;
          emojiDialogVisible.value = true;
        });
      }
    }
  }
}

function getSeverity(integration: Integration) {
  if (integration.status === 'Connecté') {
    return 'success';
  }
  if (integration.status?.startsWith('Déconnecté') || integration.status?.startsWith('Erreur')) {
    return 'danger';
  }
  return 'info';
}

const reconnectIntegration = (integration: Integration) => {
  if (integration.type === 'slack') {
    // Clear potentially stale data before redirecting
    localStorage.removeItem('slackData');
    window.location.href = slackOAuthUrl;
  } else if (integration.type === 'gitlab') {
    // Clear potentially stale data before redirecting
    localStorage.removeItem('gitlabData');
    window.location.href = gitlabOAuthUrl;
  }
  // After redirecting for OAuth, the onMounted hook in index.vue should re-check statuses.
};

// This function is kept for adding NEW integrations.
// Reconnection for existing ones is handled by reconnectIntegration.
function onAddIntegration() {
  if (selectedIntegration.value === 'slack') {
    localStorage.removeItem('slackData'); // Clear before adding new
    window.location.href = slackOAuthUrl;
  } else if (selectedIntegration.value === 'gitlab') {
    localStorage.removeItem('gitlabData'); // Clear before adding new
    window.location.href = gitlabOAuthUrl;
  }
}
</script>

<style scoped>
/* Optionnel : ajuste la hauteur max du tableau si besoin */
</style>
