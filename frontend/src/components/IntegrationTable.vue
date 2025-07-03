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

    <IntegrationEmojisDialog
      :integration="selectedIntegrationForEmojis"
      v-model:visible="isEmojiDialogVisible"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, defineEmits } from 'vue';
// Assuming Integration and Emoji types are globally available or auto-imported
import IntegrationEmojisDialog from './IntegrationEmojisDialog.vue';

const props = defineProps<{
  integrations: Integration[];
}>();

const emit = defineEmits(['delete-integration']);

const selectedIntegration = ref();
const isEmojiDialogVisible = ref(false);
const selectedIntegrationForEmojis = ref<Integration | null>(null);

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

function viewEmojis(integration: Integration) {
  selectedIntegrationForEmojis.value = integration;
  isEmojiDialogVisible.value = true;
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
