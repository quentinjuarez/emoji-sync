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
      v-if="props.integrations.length"
      :value="props.integrations"
      class="mb-6"
      dataKey="id"
    >
      <Column field="type" header="Type">
        <template #body="slotProps">
          <span class="font-semibold">{{
            slotProps.data.type === 'gitlab'
              ? 'GitLab'
              : slotProps.data.type === 'slack'
              ? 'Slack'
              : slotProps.data.type
          }}</span>
          <div v-if="slotProps.data.name" class="text-xs text-gray-500">
            {{ slotProps.data.name }}
          </div>
        </template>
      </Column>
      <Column field="status" header="Statut">
        <template #body="slotProps">
          <Tag
            :value="slotProps.data.status"
            :severity="getSeverity(slotProps.data)"
          />
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
            v-else
            icon="pi pi-eye"
            label="Voir Emojis"
            @click="viewEmojis(slotProps.data)"
            size="small"
          />
        </template>
      </Column>
      <Column header="Supprimer" style="width: 3rem; text-align: center">
        <template #body="slotProps">
          <Button
            icon="pi pi-trash"
            class="p-button-danger"
            size="small"
            @click="deleteIntegration(slotProps.data)"
          />
        </template>
      </Column>
    </DataTable>

    <div
      v-if="!integrations || integrations.length === 0"
      class="text-center text-gray-500"
    >
      Aucune intégration pour le moment. Cliquez sur "Ajouter une intégration".
    </div>

    <Dialog
      v-model:visible="emojiDialogVisible"
      modal
      header="Emojis"
      :style="{ width: '50vw' }"
    >
      <Message
        v-if="deleteAllSuccessMessage"
        severity="success"
        :closable="false"
        >{{ deleteAllSuccessMessage }}</Message
      >
      <Message v-if="deleteAllError" severity="error" :closable="false">{{
        deleteAllError
      }}</Message>

      <div v-if="isLoadingEmojis" class="text-center p-4">
        <ProgressSpinner style="width: 50px; height: 50px" strokeWidth="8" />
        <p>Chargement des emojis...</p>
      </div>
      <div
        v-else-if="displayedEmojis.length > 0"
        class="grid grid-cols-6 gap-3 max-h-[400px] overflow-auto mt-4"
      >
        <div
          v-for="{ url, name } in displayedEmojis"
          :key="name"
          class="text-center border p-2 rounded"
        >
          <img :src="url" :alt="name" class="w-10 h-10 mx-auto" />
          <div class="text-xs mt-1 truncate">{{ name }}</div>
        </div>
      </div>
      <div
        v-else-if="
          !isLoadingEmojis &&
          displayedEmojis.length === 0 &&
          !deleteAllSuccessMessage
        "
        class="text-center text-gray-500 py-4"
      >
        Aucun emoji personnalisé trouvé pour cette intégration.
      </div>

      <template #footer>
        <Button
          v-if="
            currentIntegration?.type === 'gitlab' &&
            displayedEmojis.length > 0 &&
            !deleteAllSuccessMessage
          "
          label="Supprimer tous les Emojis GitLab"
          icon="pi pi-trash"
          class="p-button-danger"
          @click="deleteAllGitLabEmojis"
          :loading="isDeletingAllEmojis"
        />
      </template>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  integrations: Integration[];
}>();

const selectedIntegration = ref();
const displayedEmojis = ref<Emoji[]>([]);
const emojiDialogVisible = ref(false);
const isLoadingEmojis = ref(false); // To show loading state in the dialog

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
    localStorage.removeItem('slackData'); // Clear old data before new auth
    window.location.href = slackOAuthUrl;
  } else if (selectedIntegration.value === 'gitlab') {
    localStorage.removeItem('gitlabData'); // Clear old data before new auth
    window.location.href = gitlabOAuthUrl;
  }
}

// Generic function to get token from localStorage
function getGitLabTokenData() {
  const gitlabDataString = localStorage.getItem('gitlabData');
  if (!gitlabDataString) return null;
  try {
    return JSON.parse(gitlabDataString);
  } catch (e) {
    console.error('Error parsing gitlabData:', e);
    localStorage.removeItem('gitlabData'); // Clear corrupted data
    return null;
  }
}

// Helper function to get Slack token data from localStorage
function getSlackTokenData() {
  const slackDataString = localStorage.getItem('slackData');
  if (!slackDataString) return null;
  try {
    const parsed = JSON.parse(slackDataString);
    // Basic validation: check for 'ok' and 'access_token'
    if (parsed && parsed.ok && parsed.access_token) {
      return parsed;
    }
    console.warn(
      'Stored slackData is invalid or missing access_token.',
      parsed
    );
    localStorage.removeItem('slackData'); // Clear corrupted/invalid data
    return null;
  } catch (e) {
    console.error('Error parsing slackData:', e);
    localStorage.removeItem('slackData'); // Clear corrupted data
    return null;
  }
}

async function fetchSlackEmojis(teamId: string) {
  const tokenData = getSlackTokenData();
  if (!tokenData || !tokenData.access_token) {
    throw new Error('Slack token not found or invalid in localStorage.');
  }

  const res = await fetch(
    `${import.meta.env.VITE_BACK_URL}/slack/emojis?teamId=${encodeURIComponent(
      teamId
    )}`,
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    }
  );
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        'Unauthorized to fetch Slack emojis. Token might be expired or invalid.'
      );
    }
    const errorData = await res.text();
    throw new Error(
      `Failed to fetch Slack emojis for team ${teamId}: ${res.status} ${errorData}`
    );
  }
  return await res.json();
}

async function fetchGitlabEmojis(groupPath: string) {
  const tokenData = getGitLabTokenData();
  if (!tokenData || !tokenData.access_token) {
    throw new Error('GitLab token not found in localStorage.');
  }

  const res = await fetch(
    `${
      import.meta.env.VITE_BACK_URL
    }/gitlab/emojis?groupPath=${encodeURIComponent(groupPath)}`,
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    }
  );
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        'Unauthorized to fetch GitLab emojis. Token might be expired.'
      );
    }
    const errorData = await res.text();
    throw new Error(
      `Failed to fetch GitLab emojis for ${groupPath}: ${res.status} ${errorData}`
    );
  }
  return await res.json();
}

async function viewEmojis(integration: Integration) {
  displayedEmojis.value = [];
  currentIntegration.value = integration; // Store the integration
  emojiDialogVisible.value = true;
  isLoadingEmojis.value = true;
  deleteAllError.value = ''; // Clear previous errors
  deleteAllSuccessMessage.value = '';

  try {
    if (integration.type === 'slack' && integration.id) {
      displayedEmojis.value = await fetchSlackEmojis(integration.id);
    } else if (integration.type === 'gitlab' && integration.id) {
      displayedEmojis.value = await fetchGitlabEmojis(integration.id);
    } else {
      throw new Error(
        'Integration type or required ID (teamId/groupPath) is missing.'
      );
    }
  } catch (error) {
    console.error('Error fetching emojis:', error);
    displayedEmojis.value = [];
    // Optionally, display this error in the dialog
  } finally {
    isLoadingEmojis.value = false;
  }
}

const currentIntegration = ref<Integration | null>(null); // To store the integration for which emojis are being viewed/deleted
const isDeletingAllEmojis = ref(false);
const deleteAllError = ref('');
const deleteAllSuccessMessage = ref('');

async function deleteAllGitLabEmojis() {
  if (
    !currentIntegration.value ||
    currentIntegration.value.type !== 'gitlab' ||
    !currentIntegration.value.id
  ) {
    deleteAllError.value =
      'Cannot delete emojis: No GitLab integration selected or groupPath is missing.';
    return;
  }

  isDeletingAllEmojis.value = true;
  deleteAllError.value = '';
  deleteAllSuccessMessage.value = '';

  const tokenData = getGitLabTokenData();
  if (!tokenData || !tokenData.access_token) {
    deleteAllError.value =
      'GitLab token not found in localStorage. Please reconnect.';
    isDeletingAllEmojis.value = false;
    return;
  }

  try {
    const res = await fetch(
      `${import.meta.env.VITE_BACK_URL}/gitlab/emojis/all`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenData.access_token}`,
        },
        body: JSON.stringify({ groupPath: currentIntegration.value.id }),
      }
    );

    const result = await res.json();

    if (!res.ok) {
      throw new Error(
        result.error || `Failed to delete all emojis: ${res.statusText}`
      );
    }

    deleteAllSuccessMessage.value =
      result.message || 'All emojis deleted successfully.';
    displayedEmojis.value = [];
  } catch (error: any) {
    console.error('Error deleting all GitLab emojis:', error);
    deleteAllError.value =
      error.message || 'An unknown error occurred while deleting emojis.';
  } finally {
    isDeletingAllEmojis.value = false;
  }
}

function getSeverity(integration: Integration) {
  if (integration.status === 'Connecté') {
    return 'success';
  }
  if (
    integration.status?.startsWith('Déconnecté') ||
    integration.status?.startsWith('Erreur')
  ) {
    return 'danger';
  }
  return 'info';
}

const reconnectIntegration = (integration: Integration) => {
  if (integration.type === 'slack') {
    localStorage.removeItem('slackData');
    window.location.href = slackOAuthUrl;
  } else if (integration.type === 'gitlab') {
    localStorage.removeItem('gitlabData');
    window.location.href = gitlabOAuthUrl;
  }
};

const emit = defineEmits(['delete-integration']);

function deleteIntegration(integration: Integration) {
  emit('delete-integration', integration);
}
</script>
