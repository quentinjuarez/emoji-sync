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
  name?: string; // e.g., Slack team name or GitLab group path
  teamId?: string; // For Slack
  groupPath?: string; // For GitLab - this will be the specific group path
  key: string; // Unique key for Vue list rendering, e.g., "gitlab-group/path"
}
const integrations = ref<Integration[]>([]);
const isLoading = ref(true);

// Helper to get parsed GitLab data from localStorage
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
  if (!gitlabStorageData || !gitlabStorageData.groups || gitlabStorageData.groups.length === 0) {
    // If gitlabData exists but no groups, it means user is connected but has no usable groups.
    // We might still want to show a generic "GitLab Connected" status or nothing.
    // For now, returning empty array means no GitLab rows will be shown if no groups.
    // If there's an access_token, it means the user did connect.
    if (gitlabStorageData && gitlabStorageData.access_token) {
        // Could return a single entry representing the user's GitLab connection without specific groups
        // For example:
        // return [{
        //   type: 'gitlab',
        //   status: 'Connecté (aucun groupe avec emojis)',
        //   name: gitlabStorageData.user?.name || gitlabStorageData.user?.username || 'Utilisateur GitLab',
        //   key: 'gitlab-user',
        //   groupPath: undefined // No specific group
        // }];
        console.log("GitLab connected, but no groups found with emoji permissions.");
    }
    return [];
  }

  const groupPromises = gitlabStorageData.groups.map(async (groupPath: string) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_BACK_URL}/gitlab/connected`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken: gitlabStorageData.access_token,
          refreshToken: gitlabStorageData.refresh_token,
          user: gitlabStorageData.user,
          groups: gitlabStorageData.groups, // Send the whole list of groups
          groupPath: groupPath, // The specific group being checked
        }),
      });

      const data = await res.json();

      if (res.ok && data.connected) {
        // IMPORTANT: If token was refreshed, update localStorage
        if (data.tokenData && data.tokenData.access_token !== gitlabStorageData.access_token) {
          console.log(`GitLab token refreshed for group: ${groupPath}. Updating localStorage.`);
          // Preserve other potential top-level keys in gitlabStorageData if any, merge with new tokenData
          const newGitlabStorageData = { ...gitlabStorageData, ...data.tokenData };
          localStorage.setItem('gitlabData', JSON.stringify(newGitlabStorageData));
          // Update the reference for subsequent checks in this loop if needed, though map runs them in parallel.
          // More robustly, the parent onMounted should re-fetch or this function should ensure all calls get the new token.
          // For simplicity here, we update localStorage. Subsequent page loads will use it.
          // A more advanced solution might involve a shared reactive store for token data.
        }
        return {
          type: 'gitlab',
          status: 'Connecté',
          name: groupPath, // Display the group path as its name
          groupPath: groupPath,
          key: `gitlab-${groupPath}`,
        };
      } else {
        // If needsReAuthentication is true, or any other error
        if (data.needsReAuthentication) {
          localStorage.removeItem('gitlabData'); // Clear data to force re-auth
        }
        return {
          type: 'gitlab',
          status: `Déconnecté: ${data.error || 'Veuillez vous reconnecter'}`,
          name: groupPath,
          groupPath: groupPath,
          key: `gitlab-${groupPath}`,
        };
      }
    } catch (e) {
      console.error(`Error checking GitLab connection for group ${groupPath}:`, e);
      return {
        type: 'gitlab',
        status: 'Erreur de connexion',
        name: groupPath,
        groupPath: groupPath,
        key: `gitlab-${groupPath}`,
      };
    }
  });

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
    const res = await fetch(`${import.meta.env.VITE_BACK_URL}/slack/connected`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ teamId: teamId }), // Backend expects teamId in body
    });

    const data = await res.json(); // This is the response from our backend's /slack/connected

    if (res.ok && data.connected) {
      // Backend's /connected response includes team details from auth.test
      // e.g., data.team.name, data.team_id (which should match teamId)
      return {
        type: 'slack',
        status: 'Connecté',
        name: data.team?.name || slackStorageData.team?.name || teamId, // Prefer fresh name from auth.test
        teamId: teamId,
        key: `slack-${teamId}`,
      };
    } else {
      // If backend indicates disconnection (e.g. token invalid from auth.test)
      if (data.needsReAuthentication) {
        localStorage.removeItem('slackData'); // Clear data to force re-auth
      }
      return {
        type: 'slack',
        status: `Déconnecté: ${data.error || 'Veuillez vous reconnecter'}`,
        name: slackStorageData.team?.name || teamId,
        teamId: teamId,
        key: `slack-${teamId}`,
      };
    }
  } catch (e) {
    console.error(`Error checking Slack connection for team ${teamId}:`, e);
    // Don't remove localStorage here, could be a temporary network issue
    return {
      type: 'slack',
      status: 'Erreur de connexion',
      name: slackStorageData.team?.name || teamId,
      teamId: teamId,
      key: `slack-${teamId}`,
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
</script>
