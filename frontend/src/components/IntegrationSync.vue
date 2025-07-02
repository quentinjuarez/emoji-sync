<template>
  <section class="mt-8 p-4 border rounded shadow-sm bg-white">
    <h2 class="text-xl font-semibold mb-4">Emoji Synchronization</h2>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <div>
        <label
          for="slackConnection"
          class="block text-sm font-medium text-gray-700"
          >Select Slack Team</label
        >
        <select
          id="slackConnection"
          v-model="selectedSlackConnectionId"
          class="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          :disabled="slackConnections.length === 0 || isSyncing"
        >
          <option :value="null" disabled>
            {{
              slackConnections.length === 0
                ? 'No Slack connections available'
                : 'Select a Slack Team...'
            }}
          </option>
          <option
            v-for="conn in slackConnections"
            :key="conn.name"
            :value="conn.name"
          >
            {{ conn.name }} ({{ conn.id }})
          </option>
        </select>
      </div>
      <div>
        <label
          for="gitlabConnection"
          class="block text-sm font-medium text-gray-700"
          >Select GitLab Group</label
        >
        <select
          id="gitlabConnection"
          v-model="selectedGitlabConnectionId"
          class="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          :disabled="gitlabConnections.length === 0 || isSyncing"
        >
          <option :value="null" disabled>
            {{
              gitlabConnections.length === 0
                ? 'No GitLab connections available'
                : 'Select a GitLab Group...'
            }}
          </option>
          <option
            v-for="conn in gitlabConnections"
            :key="conn.name"
            :value="conn.name"
          >
            {{ conn.name }} ({{ conn.id }})
          </option>
        </select>
      </div>
    </div>

    <button
      @click="startSync"
      :disabled="isSyncing"
      class="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2"
      :class="
        isSyncing
          ? 'bg-gray-400 cursor-not-allowed'
          : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
      "
    >
      {{ isSyncing ? 'Syncing...' : 'Start Slack to GitLab Emoji Sync' }}
    </button>

    <div v-if="syncMessages.length > 0" class="mt-6">
      <h3 class="text-lg font-medium text-gray-900 mb-2">Sync Log:</h3>
      <div class="max-h-96 overflow-y-auto bg-gray-50 p-3 rounded border">
        <ul>
          <li
            v-for="(msg, index) in syncMessages"
            :key="index"
            class="py-1 text-sm"
            :class="{
              'text-green-600': msg.type === 'success',
              'text-red-600': msg.type === 'error',
              'text-yellow-600':
                msg.type === 'skipped' || msg.type === 'warning',
              'text-blue-600': msg.type === 'info' || msg.type === 'progress',
              'text-purple-600 font-semibold':
                msg.type === 'summary' || msg.type === 'done',
            }"
          >
            <span class="font-medium">[{{ msg.type.toUpperCase() }}]</span>
            <span v-if="msg.emojiName" class="font-semibold">
              {{ msg.originalName || msg.emojiName }}:</span
            >
            {{ msg.message }}
            <span
              v-if="
                msg.type === 'skipped' &&
                msg.newName &&
                msg.originalName !== msg.newName
              "
            >
              (Sanitized to: {{ msg.newName }})</span
            >
          </li>
        </ul>
      </div>
    </div>
    <div v-if="isSyncing && overallProgress > 0" class="mt-4">
      <label
        for="overallProgress"
        class="block text-sm font-medium text-gray-700"
        >Overall Progress:</label
      >
      <progress
        id="overallProgress"
        :value="overallProgress"
        max="100"
        class="w-full"
      ></progress>
      <span>{{ overallProgress.toFixed(2) }}%</span>
    </div>
  </section>
</template>

<script setup lang="ts">
interface SyncMessage {
  type:
    | 'info'
    | 'progress'
    | 'success'
    | 'error'
    | 'skipped'
    | 'warning'
    | 'summary'
    | 'done';
  message: string;
  emojiName?: string;
  originalName?: string;
  newName?: string;
  counts?: { success: number; skipped: number; errors: number; total?: number };
}

const props = defineProps<{
  integrations: Integration[];
}>();

const selectedSlackConnectionId = ref<string | null>(null);
const selectedGitlabConnectionId = ref<string | null>(null);

const isSyncing = ref(false);
const syncMessages = ref<SyncMessage[]>([]);
const eventSource = ref<EventSource | null>(null);
const overallProgress = ref(0);
let totalEmojisToProcess = 0;
let processedEmojis = 0;

const slackConnections = computed(() =>
  props.integrations.filter((i) => i.type === 'slack')
);
const gitlabConnections = computed(() =>
  props.integrations.filter((i) => i.type === 'gitlab')
);

const selectedSlackConnection = computed(() => {
  if (!selectedSlackConnectionId.value) return null;
  return (
    slackConnections.value.find(
      (sc) => sc.name === selectedSlackConnectionId.value
    ) || null
  );
});

const selectedGitlabConnection = computed(() => {
  if (!selectedGitlabConnectionId.value) return null;
  return (
    gitlabConnections.value.find(
      (gc) => gc.name === selectedGitlabConnectionId.value
    ) || null
  );
});

const startSync = async () => {
  if (isSyncing.value) return;

  // Validation
  if (!selectedSlackConnection.value || !selectedGitlabConnection.value) {
    syncMessages.value.push({
      type: 'error',
      message: 'Please select a Slack team and a GitLab group.',
    });
    return;
  }

  isSyncing.value = true;
  syncMessages.value = [];
  overallProgress.value = 0;
  totalEmojisToProcess = 0;
  processedEmojis = 0;

  const backendUrl =
    import.meta.env.VITE_BACKEND_URL || 'http://localhost:3101';

  eventSource.value = new EventSource(`${backendUrl}/sync/slack-to-gitlab`, {});

  // This check is already at the beginning of startSync, but good for type safety here
  if (!selectedSlackConnection.value || !selectedGitlabConnection.value) {
    syncMessages.value.push({
      type: 'error',
      message: 'Internal error: Connection details not found after selection.',
    });
    isSyncing.value = false;
    return;
  }

  // Let's use fetch for streaming response from POST
  try {
    const response = await fetch(`${backendUrl}/sync/slack-to-gitlab`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Accept': 'text/event-stream' // Server should set Content-Type
      },
      body: JSON.stringify({
        slackToken: selectedSlackConnection.value.accessToken, // Assuming accessToken is stored in the integration
        slackTeamId: selectedSlackConnection.value.id,
        gitlabToken: selectedGitlabConnection.value.accessToken, // Assuming accessToken is stored in the integration
        gitlabGroupPath: selectedGitlabConnection.value.id,
      }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      throw new Error(
        `Failed to start sync: ${response.status} ${response.statusText}. ${errorText}`
      );
    }

    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();

    // Manually process the stream
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        syncMessages.value.push({
          type: 'info',
          message: 'Stream finished by server.',
        });
        break;
      }
      // SSE messages are 'data: {...}\n\n'. Multiple messages can arrive in one chunk.
      const lines = value.split('\n\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonData = line.substring('data: '.length);
          if (jsonData.trim()) {
            try {
              const msg = JSON.parse(jsonData) as SyncMessage;
              syncMessages.value.push(msg);

              if (
                msg.type === 'info' &&
                msg.message.includes('Found') &&
                msg.message.includes('emojis in Slack')
              ) {
                const match = msg.message.match(/Found (\d+) emojis in Slack/);
                if (match && match[1]) {
                  totalEmojisToProcess = parseInt(match[1], 10);
                }
              }

              if (['success', 'skipped', 'error'].includes(msg.type)) {
                processedEmojis++;
                if (totalEmojisToProcess > 0) {
                  overallProgress.value =
                    (processedEmojis / totalEmojisToProcess) * 100;
                }
              }

              if (msg.type === 'done' || msg.type === 'summary') {
                isSyncing.value = false;
                overallProgress.value = 100; // Mark as complete
                // No need to close EventSource as we are using fetch
                break;
              }
              if (
                msg.type === 'error' &&
                msg.message.includes('Missing required parameters')
              ) {
                isSyncing.value = false;
                break;
              }
            } catch (e) {
              console.error('Failed to parse SSE message:', jsonData, e);
              syncMessages.value.push({
                type: 'error',
                message: `Malformed event: ${jsonData}`,
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Sync error:', error);
    syncMessages.value.push({
      type: 'error',
      message: (error as Error).message || 'Unknown error during sync.',
    });
    isSyncing.value = false;
  } finally {
    // This block will run if the loop breaks or an error occurs
    if (isSyncing.value) {
      // If still syncing, means it was an unexpected break
      isSyncing.value = false;
      syncMessages.value.push({ type: 'info', message: 'Sync process ended.' });
    }
    // No EventSource to close if using fetch for streaming
  }
};

// Lifecycle hook to clean up EventSource if component is unmounted
// import { onUnmounted } from 'vue';
// onUnmounted(() => {
//   if (eventSource.value) {
//     eventSource.value.close();
//     eventSource.value = null;
//   }
// });
</script>

<style scoped>
/* Add any additional styling if needed */
progress {
  -webkit-appearance: none;
  appearance: none;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
}

progress::-webkit-progress-bar {
  background-color: #eee;
  border-radius: 5px;
}

progress::-webkit-progress-value {
  background-color: #4f46e5; /* indigo-600 */
  border-radius: 5px;
  transition: width 0.2s ease-in-out;
}

progress::-moz-progress-bar {
  background-color: #4f46e5; /* indigo-600 */
  border-radius: 5px;
  transition: width 0.2s ease-in-out;
}
</style>
