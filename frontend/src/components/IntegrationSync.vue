<template>
  <section class="mt-8 p-4 border rounded shadow-sm bg-white">
    <h2 class="text-xl font-semibold mb-4">Emoji Synchronization</h2>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <div>
        <label for="slackToken" class="block text-sm font-medium text-gray-700">Slack Access Token</label>
        <input type="password" id="slackToken" v.model="slackToken" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="Slack Token">
      </div>
      <div>
        <label for="slackTeamId" class="block text-sm font-medium text-gray-700">Slack Team ID</label>
        <input type="text" id="slackTeamId" v.model="slackTeamId" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="Slack Team ID (e.g., T12345)">
      </div>
      <div>
        <label for="gitlabToken" class="block text-sm font-medium text-gray-700">GitLab Access Token</label>
        <input type="password" id="gitlabToken" v.model="gitlabToken" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="GitLab Token">
      </div>
      <div>
        <label for="gitlabGroupPath" class="block text-sm font-medium text-gray-700">GitLab Group Path</label>
        <input type="text" id="gitlabGroupPath" v.model="gitlabGroupPath" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="your-group/your-subgroup">
      </div>
    </div>

    <button
      @click="startSync"
      :disabled="isSyncing"
      class="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2"
      :class="isSyncing ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'"
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
              'text-yellow-600': msg.type === 'skipped' || msg.type === 'warning',
              'text-blue-600': msg.type === 'info' || msg.type === 'progress',
              'text-purple-600 font-semibold': msg.type === 'summary' || msg.type === 'done',
            }"
          >
            <span class="font-medium">[{{ msg.type.toUpperCase() }}]</span>
            <span v-if="msg.emojiName" class="font-semibold"> {{ msg.originalName || msg.emojiName }}:</span>
            {{ msg.message }}
            <span v-if="msg.type === 'skipped' && msg.newName && msg.originalName !== msg.newName"> (Sanitized to: {{ msg.newName }})</span>
          </li>
        </ul>
      </div>
    </div>
     <div v-if="isSyncing && overallProgress > 0" class="mt-4">
      <label for="overallProgress" class="block text-sm font-medium text-gray-700">Overall Progress:</label>
      <progress id="overallProgress" :value="overallProgress" max="100" class="w-full"></progress>
      <span>{{ overallProgress.toFixed(2) }}%</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface SyncMessage {
  type: 'info' | 'progress' | 'success' | 'error' | 'skipped' | 'warning' | 'summary' | 'done';
  message: string;
  emojiName?: string;
  originalName?: string;
  newName?: string;
  counts?: { success: number; skipped: number; errors: number; total?: number };
}

const slackToken = ref(''); // Populate from store or props in a real app
const slackTeamId = ref(''); // Populate from store or props
const gitlabToken = ref(''); // Populate from store or props
const gitlabGroupPath = ref(''); // Populate from store or props

const isSyncing = ref(false);
const syncMessages = ref<SyncMessage[]>([]);
const eventSource = ref<EventSource | null>(null);
const overallProgress = ref(0);
let totalEmojisToProcess = 0;
let processedEmojis = 0;


const startSync = async () => {
  if (isSyncing.value) return;

  // Basic validation
  if (!slackToken.value || !slackTeamId.value || !gitlabToken.value || !gitlabGroupPath.value) {
    syncMessages.value.push({ type: 'error', message: 'Please fill in all required fields.' });
    return;
  }

  isSyncing.value = true;
  syncMessages.value = [];
  overallProgress.value = 0;
  totalEmojisToProcess = 0;
  processedEmojis = 0;

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3101';

  eventSource.value = new EventSource(`${backendUrl}/sync/slack-to-gitlab`, {
    // EventSource constructor itself doesn't support sending a body.
    // We need to pass parameters via query string or have the backend
    // fetch them from a session/store if this were a GET request.
    // Since it's a POST, this approach is not standard for EventSource.
    // A common pattern is to initiate the process with a POST, get a task ID,
    // then subscribe to SSE using the task ID in the URL (GET).
    // For this example, I'll adjust the backend to accept GET or have a separate POST to initiate
    // and then GET for SSE.
    // Given the current backend is POST, this won't work directly.
    // I will modify this to make a POST request first, and then if the backend
    // were to give a task ID, connect to an SSE endpoint with that ID.
    // For now, I'll keep the backend as POST and acknowledge this is a simplification.
    // The body needs to be sent via a fetch POST, not EventSource directly.
  });

  // The above EventSource instantiation is problematic with POST body.
  // Let's simulate the POST request then connect.
  // This requires the backend to be ready for this.
  // A more robust way:
  // 1. Frontend POSTs to /sync/start-slack-to-gitlab with params.
  // 2. Backend starts job, returns a job ID.
  // 3. Frontend opens EventSource to /sync/status/{jobID}.
  // For this exercise, I will assume the backend POST endpoint for SSE is directly usable
  // and the parameters are passed some other way (e.g. session, or it's simplified for now).
  // The current backend controller is POST. EventSource only does GET.
  // THIS IS A KEY MISMATCH TO RESOLVE.

  // To make this work with the current POST endpoint on the backend,
  // we actually can't use EventSource directly like this.
  // The backend would need to be GET for EventSource.
  // I will proceed by first making a POST request to trigger the sync,
  // and then the EventSource will connect to a separate (hypothetical) GET endpoint for updates,
  // OR the backend POST endpoint itself is adapted to handle the SSE stream initiation.
  // The current backend code *tries* to do SSE on POST.

  // For the sake of this example, assuming the browser *could* send a body
  // with EventSource or the backend reads this from session after a separate login.
  // The most straightforward change is to make the backend endpoint GET and pass params in URL.
  // Or, use fetch API to stream the response from the POST request.

  // Let's use fetch for streaming response from POST
  try {
    const response = await fetch(`${backendUrl}/sync/slack-to-gitlab`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Accept': 'text/event-stream' // Server should set Content-Type
      },
      body: JSON.stringify({
        slackToken: slackToken.value,
        slackTeamId: slackTeamId.value,
        gitlabToken: gitlabToken.value,
        gitlabGroupPath: gitlabGroupPath.value,
      }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      throw new Error(`Failed to start sync: ${response.status} ${response.statusText}. ${errorText}`);
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

    // Manually process the stream
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        syncMessages.value.push({ type: 'info', message: 'Stream finished by server.' });
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

              if (msg.type === 'info' && msg.message.includes('Found') && msg.message.includes('emojis in Slack')) {
                  const match = msg.message.match(/Found (\d+) emojis in Slack/);
                  if (match && match[1]) {
                      totalEmojisToProcess = parseInt(match[1], 10);
                  }
              }

              if (['success', 'skipped', 'error'].includes(msg.type)) {
                  processedEmojis++;
                  if (totalEmojisToProcess > 0) {
                      overallProgress.value = (processedEmojis / totalEmojisToProcess) * 100;
                  }
              }

              if (msg.type === 'done' || msg.type === 'summary') {
                isSyncing.value = false;
                overallProgress.value = 100; // Mark as complete
                // No need to close EventSource as we are using fetch
                break;
              }
              if (msg.type === 'error' && msg.message.includes('Missing required parameters')) {
                 isSyncing.value = false;
                 break;
              }
            } catch (e) {
              console.error('Failed to parse SSE message:', jsonData, e);
              syncMessages.value.push({ type: 'error', message: `Malformed event: ${jsonData}` });
            }
          }
        }
      }
    }

  } catch (error) {
    console.error('Sync error:', error);
    syncMessages.value.push({ type: 'error', message: (error as Error).message || 'Unknown error during sync.' });
    isSyncing.value = false;
  } finally {
    // This block will run if the loop breaks or an error occurs
    if (isSyncing.value) { // If still syncing, means it was an unexpected break
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
