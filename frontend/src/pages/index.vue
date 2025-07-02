<template>
  <main class="p-6">
    <IntegrationTable
      :integrations="integrations"
      @delete-integration="deleteIntegration"
    />
    <IntegrationSync :integrations="integrations" />
  </main>
</template>

<script setup lang="ts">
const integrations = ref<Integration[]>([]);
const isLoading = ref(true);

function getGitLabDataFromStorage() {
  const gitlabDataString = localStorage.getItem('gitlabData');
  if (!gitlabDataString) return null;
  try {
    return JSON.parse(gitlabDataString);
  } catch (e) {
    console.error('Error parsing gitlabData from localStorage:', e);
    localStorage.removeItem('gitlabData'); // Clear corrupted data
    return null;
  }
}

// This function will now generate a list of promises for each GitLab group
async function checkAllGitLabGroupStatuses(): Promise<Integration[]> {
  const gitlabStorageData = getGitLabDataFromStorage();
  if (
    !gitlabStorageData ||
    !gitlabStorageData.groups ||
    gitlabStorageData.groups.length === 0
  ) {
    if (gitlabStorageData && gitlabStorageData.access_token) {
      console.log(
        'GitLab connected, but no groups found with emoji permissions.'
      );
    }
    return [];
  }

  const groupPromises = gitlabStorageData.groups.map(
    async (groupPath: string) => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_BACK_URL}/gitlab/connected`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              accessToken: gitlabStorageData.access_token,
              refreshToken: gitlabStorageData.refresh_token,
              user: gitlabStorageData.user,
              groups: gitlabStorageData.groups,
              groupPath: groupPath,
            }),
          }
        );

        const data = await res.json();

        if (res.ok && data.connected) {
          if (
            data.tokenData &&
            data.tokenData.access_token !== gitlabStorageData.access_token
          ) {
            console.log(
              `GitLab token refreshed for group: ${groupPath}. Updating localStorage.`
            );
            const newGitlabStorageData = {
              ...gitlabStorageData,
              ...data.tokenData,
            };
            localStorage.setItem(
              'gitlabData',
              JSON.stringify(newGitlabStorageData)
            );
          }
          return {
            id: groupPath,
            type: 'gitlab',
            status: 'Connecté',
            accessToken: gitlabStorageData.access_token,
            name: groupPath,
          };
        } else {
          if (data.needsReAuthentication) {
            localStorage.removeItem('gitlabData'); // Clear data to force re-auth
          }
          return {
            id: groupPath,
            type: 'gitlab',
            status: `Déconnecté: ${data.error || 'Veuillez vous reconnecter'}`,
            name: groupPath,
          };
        }
      } catch (e) {
        console.error(
          `Error checking GitLab connection for group ${groupPath}:`,
          e
        );
        return {
          id: groupPath,
          type: 'gitlab',
          status: 'Erreur de connexion',
          name: groupPath,
        };
      }
    }
  );

  return Promise.all(groupPromises);
}

// Helper to get parsed Slack data from localStorage
function getSlackDataFromStorage() {
  const slackDataString = localStorage.getItem('slackData');
  if (!slackDataString) return null;
  try {
    // Add basic validation for the expected structure from Slack's oauth.v2.access response
    const parsed = JSON.parse(slackDataString);
    if (parsed && parsed.ok && parsed.access_token && parsed.team?.id) {
      return parsed;
    }
    console.warn('Stored slackData is invalid or missing key fields:', parsed);
    localStorage.removeItem('slackData'); // Clear corrupted/invalid data
    return null;
  } catch (e) {
    console.error('Error parsing slackData from localStorage:', e);
    localStorage.removeItem('slackData'); // Clear corrupted data
    return null;
  }
}

async function checkSlackStatus(): Promise<Integration | null> {
  const slackStorageData = getSlackDataFromStorage();
  if (!slackStorageData) {
    return null;
  }

  // Essential data for the backend call and for creating the Integration object
  const teamId = slackStorageData.team.id;
  const accessToken = slackStorageData.access_token;

  try {
    const res = await fetch(
      `${import.meta.env.VITE_BACK_URL}/slack/connected`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ teamId: teamId }), // Backend expects teamId in body
      }
    );

    const data = await res.json(); // This is the response from our backend's /slack/connected

    if (res.ok && data.connected) {
      // Backend's /connected response includes team details from auth.test
      // e.g., data.team.name, data.team_id (which should match teamId)
      return {
        id: teamId,
        type: 'slack',
        status: 'Connecté',
        name: slackStorageData.team.name || teamId,
        accessToken: accessToken,
      };
    } else {
      // If backend indicates disconnection (e.g. token invalid from auth.test)
      if (data.needsReAuthentication) {
        localStorage.removeItem('slackData'); // Clear data to force re-auth
      }
      return {
        id: teamId,
        type: 'slack',
        status: `Déconnecté: ${data.error || 'Veuillez vous reconnecter'}`,
        name: slackStorageData.team?.name || teamId,
      };
    }
  } catch (e) {
    console.error(`Error checking Slack connection for team ${teamId}:`, e);
    // Don't remove localStorage here, could be a temporary network issue
    return {
      id: teamId,
      type: 'slack',
      status: 'Erreur de connexion',
      name: slackStorageData.team?.name || teamId,
    };
  }
}

onMounted(async () => {
  isLoading.value = true;
  integrations.value = []; // Reset integrations

  const slackStatusPromise = checkSlackStatus();
  const gitlabGroupStatusesPromise = checkAllGitLabGroupStatuses();

  const [slackResult, gitlabResults] = await Promise.all([
    slackStatusPromise,
    gitlabGroupStatusesPromise,
  ]);

  const newIntegrations: Integration[] = [];
  if (slackResult) {
    newIntegrations.push(slackResult);
  }
  if (gitlabResults && gitlabResults.length > 0) {
    newIntegrations.push(...gitlabResults);
  }

  integrations.value = newIntegrations;
  isLoading.value = false;
});

const deleteIntegration = (integration: Integration) => {
  // Remove from localStorage if relevant
  if (integration.type === 'slack') {
    localStorage.removeItem('slackData');
  } else if (integration.type === 'gitlab') {
    localStorage.removeItem('gitlabData');
  }
  // Remove from list
  integrations.value = integrations.value.filter(
    (i) => i.id !== integration.id
  );
};
</script>
