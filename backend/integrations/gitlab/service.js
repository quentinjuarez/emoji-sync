import fetch from 'node-fetch';
import { emojis } from '../../store.js';

export async function exchangeCodeForToken(code) {
  const tokenRes = await fetch('https://gitlab.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GITLAB_CLIENT_ID,
      client_secret: process.env.GITLAB_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.GITLAB_REDIRECT_URI,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(
      `OAuth failed: ${JSON.stringify(tokenData) || 'No access token'}`
    );
  }
  return tokenData;
}

export async function fetchGitLabUser(accessToken) {
  const userRes = await fetch('https://gitlab.com/api/v4/user', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userData = await userRes.json();
  if (!userData.id) {
    throw new Error('Failed to fetch user info');
  }
  return userData;
}

export async function fetchGitLabGroups(accessToken) {
  const groupRes = await fetch(
    'https://gitlab.com/api/v4/groups?min_access_level=30',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const groupData = await groupRes.json();
  return Array.isArray(groupData)
    ? groupData.map((group) => group.full_path)
    : [];
}

export async function getEmojis(accessToken, groupPath) {
  if (emojis.gitlab[groupPath]) {
    return emojis.gitlab[groupPath];
  }

  const query = `query GetCustomEmoji($groupPath: ID!) {
    group(fullPath: $groupPath) {
      id
      customEmoji {
        nodes {
          id
          name
          url
        }
      }
    }
  }`;

  const emojiRes = await fetch('https://gitlab.com/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables: { groupPath } }),
  });

  const emojiData = await emojiRes.json();

  if (emojiRes.status === 401) {
    const error = new Error('Unauthorized: Token may be invalid or expired.');
    error.status = 401;
    throw error;
  }

  if (!emojiData || emojiData.errors || !emojiData.data?.group) {
    const errorDetail = emojiData?.errors
      ? JSON.stringify(emojiData.errors)
      : 'No data returned or group not found';
    console.error('Error fetching GitLab emojis from GraphQL:', errorDetail);
    if (emojiData.data && emojiData.data.group === null) {
      const error = new Error(
        `Group not found or no permission for groupPath: ${groupPath}`
      );
      error.status = 404;
      throw error;
    }
    const error = new Error(
      `Error fetching GitLab emojis: Invalid response from GitLab. Details: ${errorDetail}`
    );
    error.status = 500;
    throw error;
  }

  const customEmojiNodes = emojiData.data.group.customEmoji?.nodes || [];
  const emojisList = customEmojiNodes.map((emoji) => ({
    id: emoji.id,
    name: emoji.name,
    url: emoji.url,
  }));

  emojis.gitlab[groupPath] = emojisList; // Cache emojis
  return emojisList;
}

export async function createEmoji(accessToken, groupPath, name, url) {
  const mutation = `
    mutation CreateCustomEmoji($groupPath: ID!, $name: String!, $url: String!) {
      createCustomEmoji(input: {
        groupPath: $groupPath,
        name: $name,
        url: $url
      }) {
        clientMutationId
        customEmoji {
          id
          name
          url
        }
        errors
      }
    }
  `;

  const gqlRes = await fetch('https://gitlab.com/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: mutation,
      variables: { groupPath, name, url },
    }),
  });

  const result = await gqlRes.json();

  if (gqlRes.status === 401) {
    const error = new Error('Unauthorized: Token may be invalid or expired.');
    error.status = 401;
    throw error;
  }

  const data = result.data?.createCustomEmoji;
  if (result.errors || (data?.errors && data.errors.length > 0)) {
    const errorDetails = result.errors || data.errors;
    console.error('GraphQL Error creating emoji:', errorDetails);
    const error = new Error('Failed to create emoji');
    error.status = 400;
    error.details = errorDetails;
    throw error;
  }

  if (emojis.gitlab[groupPath]) {
    delete emojis.gitlab[groupPath]; // Invalidate cache
  }
  return data.customEmoji;
}

export async function deleteEmoji(accessToken, groupPath, emojiId) {
  const mutation = `
    mutation DestroyCustomEmoji($id: CustomEmojiID!) {
      destroyCustomEmoji(input: { id: $id }) {
        clientMutationId
      }
    }
  `;

  const gqlRes = await fetch('https://gitlab.com/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query: mutation, variables: { id: emojiId } }),
  });

  const result = await gqlRes.json();

  if (gqlRes.status === 401) {
    const error = new Error('Unauthorized: Token may be invalid or expired.');
    error.status = 401;
    throw error;
  }

  const mutationData = result.data?.destroyCustomEmoji;
  if (
    result.errors ||
    (mutationData?.errors && mutationData.errors.length > 0)
  ) {
    const errorDetails = result.errors || mutationData.errors;
    console.error('GraphQL Error deleting emoji:', errorDetails);
    const error = new Error('Failed to delete emoji');
    error.status = 400;
    error.details = errorDetails;
    throw error;
  }

  if (emojis.gitlab[groupPath]) {
    delete emojis.gitlab[groupPath]; // Invalidate cache
  }
  return { success: true, message: 'Emoji deleted successfully' };
}

export async function refreshToken(currentRefreshToken, groupPathForLogHint) {
  if (!currentRefreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    const response = await fetch('https://gitlab.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GITLAB_CLIENT_ID,
        client_secret: process.env.GITLAB_CLIENT_SECRET,
        refresh_token: currentRefreshToken,
        grant_type: 'refresh_token',
        redirect_uri: process.env.GITLAB_REDIRECT_URI,
      }),
    });

    const newTokenData = await response.json();
    if (!newTokenData.access_token) {
      console.error(
        `Refresh token failed for group path hint ${groupPathForLogHint}:`,
        newTokenData
      );
      throw new Error(
        `Failed to refresh token. Details: ${JSON.stringify(newTokenData)}`
      );
    }

    console.log(
      'Token refreshed successfully using group path hint:',
      groupPathForLogHint
    );
    return newTokenData;
  } catch (error) {
    console.error(
      `Error refreshing token for group path hint ${groupPathForLogHint}:`,
      error
    );
    throw error;
  }
}

export async function deleteAllEmojisForGroup(accessToken, groupPath) {
  console.log(`Starting deletion of all emojis for group: ${groupPath}`);
  let existingEmojis;
  try {
    existingEmojis = await getEmojis(accessToken, groupPath);
  } catch (error) {
    console.error(
      `Failed to fetch emojis for group ${groupPath} before deletion:`,
      error.message
    );
    // If we can't get the emojis, we can't delete them. Re-throw or handle as appropriate.
    // It might be a 404 if the group doesn't exist or a 401 if token is bad.
    const serviceError = new Error(
      `Failed to retrieve emojis for group ${groupPath}. Cannot proceed with deletion. Original error: ${error.message}`
    );
    serviceError.status = error.status || 500;
    throw serviceError;
  }

  if (!existingEmojis || existingEmojis.length === 0) {
    console.log(
      `No custom emojis found for group ${groupPath}. Nothing to delete.`
    );
    return {
      success: true,
      message: 'No custom emojis found for this group.',
      deletedCount: 0,
      errors: [],
    };
  }

  console.log(
    `Found ${existingEmojis.length} emojis to delete for group ${groupPath}.`
  );
  const deletionResults = {
    success: true, // Overall success, may be set to false if any deletion fails critically
    deletedCount: 0,
    errors: [], // To store info about individual emoji deletion failures
  };

  for (const emoji of existingEmojis) {
    try {
      console.log(
        `Attempting to delete emoji: ${emoji.name} (ID: ${emoji.id}) from group ${groupPath}`
      );
      await deleteEmoji(accessToken, groupPath, emoji.id);
      deletionResults.deletedCount++;
      console.log(
        `Successfully deleted emoji: ${emoji.name} (ID: ${emoji.id})`
      );
    } catch (error) {
      console.error(
        `Failed to delete emoji ${emoji.name} (ID: ${emoji.id}) from group ${groupPath}:`,
        error.message
      );
      deletionResults.errors.push({
        emojiName: emoji.name,
        emojiId: emoji.id,
        error: error.message,
        status: error.status || 500,
      });
      // Decide if one failure should stop the whole process or just be logged.
      // For now, we continue trying to delete other emojis.
      // If any error occurs, we can mark overall success as false.
      deletionResults.success = false;
    }
  }

  // Invalidate cache for the group after all deletions are attempted
  if (emojis.gitlab[groupPath]) {
    delete emojis.gitlab[groupPath];
    console.log(
      `Cache invalidated for group ${groupPath} after mass deletion.`
    );
  }

  if (deletionResults.errors.length > 0) {
    console.warn(
      `Completed deletion process for group ${groupPath} with ${deletionResults.errors.length} errors.`
    );
  } else {
    console.log(
      `Successfully deleted all ${deletionResults.deletedCount} emojis for group ${groupPath}.`
    );
  }

  return {
    ...deletionResults,
    message:
      deletionResults.errors.length > 0
        ? `Completed deletion with ${deletionResults.errors.length} errors. ${deletionResults.deletedCount} emojis deleted.`
        : `Successfully deleted ${deletionResults.deletedCount} emojis.`,
  };
}

export async function checkConnection(
  currentAccessToken,
  currentRefreshToken,
  user,
  groups,
  groupPath
) {
  try {
    let userRes = await fetch('https://gitlab.com/api/v4/user', {
      headers: { Authorization: `Bearer ${currentAccessToken}` },
    });

    let tokenToReturnToFrontend = {
      access_token: currentAccessToken,
      refresh_token: currentRefreshToken,
      user: user,
      groups: groups,
    };

    if (userRes.status === 401) {
      if (!currentRefreshToken) {
        const error = new Error(
          'Token expired and no refresh token provided. Please re-authenticate.'
        );
        error.status = 401;
        error.needsReAuthentication = true;
        throw error;
      }
      console.log(
        `Token for group path hint ${groupPath} expired, attempting refresh...`
      );
      const refreshedTokenData = await refreshToken(
        currentRefreshToken,
        groupPath
      );

      userRes = await fetch('https://gitlab.com/api/v4/user', {
        headers: { Authorization: `Bearer ${refreshedTokenData.access_token}` },
      });

      if (userRes.status === 401) {
        const error = new Error(
          'Token refresh failed or new token is also invalid. Please re-authenticate.'
        );
        error.status = 401;
        error.needsReAuthentication = true;
        throw error;
      }
      tokenToReturnToFrontend = {
        ...refreshedTokenData,
        user: user,
        groups: groups,
      };
    }

    if (!userRes.ok) {
      const errorText = await userRes.text();
      const error = new Error(
        `GitLab API error: ${userRes.statusText}. Details: ${errorText}`
      );
      error.status = userRes.status;
      throw error;
    }

    const userDataFromApi = await userRes.json();
    if (!userDataFromApi.id) {
      const error = new Error(
        'Failed to fetch user info after potential refresh, user ID missing.'
      );
      error.status = 400;
      throw error;
    }

    return { connected: true, tokenData: tokenToReturnToFrontend };
  } catch (error) {
    console.error(
      `Error in checkConnection for groupPath ${groupPath}:`,
      error.message
    );
    const serviceError = new Error(
      error.message || 'Error checking GitLab connection.'
    );
    serviceError.status = error.status || 500;
    if (error.needsReAuthentication) {
      serviceError.needsReAuthentication = true;
    }
    throw serviceError;
  }
}
