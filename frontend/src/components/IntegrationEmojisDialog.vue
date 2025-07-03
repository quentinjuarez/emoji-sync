<template>
  <Dialog
    :visible="props.visible"
    @update:visible="emit('update:visible', $event)"
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
          props.integration?.type === 'gitlab' &&
          displayedEmojis.length > 0 &&
          !deleteAllSuccessMessage
        "
        label="Supprimer tous les Emojis GitLab"
        icon="pi pi-trash"
        class="p-button-danger"
        @click="deleteAllGitLabEmojis"
        :loading="isDeletingAllEmojis"
      />
      <Button
        label="Fermer"
        icon="pi pi-times"
        class="p-button-text"
        @click="closeDialog"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, defineProps, defineEmits } from 'vue';
// Assuming Integration and Emoji types are globally available or auto-imported
// If not, they would need to be imported from their definition file.
// import type { Integration, Emoji } from '@/types/global'; // Example import

const props = defineProps<{
  integration: Integration | null;
  visible: boolean;
}>();

const emit = defineEmits(['update:visible']);

const displayedEmojis = ref<Emoji[]>([]);
const isLoadingEmojis = ref(false);
const isDeletingAllEmojis = ref(false);
const deleteAllError = ref('');
const deleteAllSuccessMessage = ref('');

// Helper function to get GitLab token data from localStorage
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
    if (parsed && parsed.ok && parsed.access_token) {
      return parsed;
    }
    console.warn(
      'Stored slackData is invalid or missing access_token.',
      parsed
    );
    localStorage.removeItem('slackData');
    return null;
  } catch (e) {
    console.error('Error parsing slackData:', e);
    localStorage.removeItem('slackData');
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

async function loadEmojis() {
  if (!props.integration) {
    displayedEmojis.value = [];
    return;
  }

  isLoadingEmojis.value = true;
  deleteAllError.value = '';
  deleteAllSuccessMessage.value = '';
  displayedEmojis.value = []; // Clear previous emojis

  try {
    if (props.integration.type === 'slack' && props.integration.id) {
      displayedEmojis.value = await fetchSlackEmojis(props.integration.id);
    } else if (props.integration.type === 'gitlab' && props.integration.id) {
      displayedEmojis.value = await fetchGitlabEmojis(props.integration.id);
    } else {
      // This case should ideally not be reached if an integration is passed
      // and dialog is visible.
      console.warn('Integration type or ID is missing for fetching emojis.');
      throw new Error(
        'Integration type or required ID (teamId/groupPath) is missing.'
      );
    }
  } catch (error) {
    console.error('Error fetching emojis in dialog:', error);
    // Display error in the dialog if needed, e.g., by setting a specific error ref
    // For now, just logging it. The empty state will be shown.
    deleteAllError.value = (error as Error).message || "Erreur lors du chargement des emojis.";
  } finally {
    isLoadingEmojis.value = false;
  }
}

async function deleteAllGitLabEmojis() {
  if (
    !props.integration ||
    props.integration.type !== 'gitlab' ||
    !props.integration.id
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
        body: JSON.stringify({ groupPath: props.integration.id }),
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
    displayedEmojis.value = []; // Clear emojis from display
    // Optionally emit an event if parent needs to know
    // emit('emojis-updated');
  } catch (error: any) {
    console.error('Error deleting all GitLab emojis:', error);
    deleteAllError.value =
      error.message || 'An unknown error occurred while deleting emojis.';
  } finally {
    isDeletingAllEmojis.value = false;
  }
}

function closeDialog() {
  emit('update:visible', false);
}

watch(
  () => props.visible,
  (newVal) => {
    if (newVal && props.integration) {
      loadEmojis();
    } else if (!newVal) {
      // Reset state when dialog is closed
      displayedEmojis.value = [];
      isLoadingEmojis.value = false;
      isDeletingAllEmojis.value = false;
      deleteAllError.value = '';
      deleteAllSuccessMessage.value = '';
    }
  }
);

// Watch for integration changes if the dialog is already visible
watch(
  () => props.integration,
  (newIntegration, oldIntegration) => {
    if (props.visible && newIntegration && newIntegration.id !== oldIntegration?.id) {
      loadEmojis();
    }
  },
  { deep: true } // Use deep watch if integration object might change internally
                 // but ID remains the same, though less likely for this use case.
);

</script>
<style scoped>
/* Scoped styles for the dialog if needed */
</style>
