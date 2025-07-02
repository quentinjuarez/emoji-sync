import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

import { emojis } from '../store.js'; // Removed tokens from here

// Helper function to extract token from Authorization header
const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }
  return null;
};

async function refreshToken(currentRefreshToken, groupPathForLog) {
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
        `Refresh token failed for group path hint ${groupPathForLog}:`,
        newTokenData
      );
      throw new Error('Failed to refresh token');
    }

    console.log(
      'Token refreshed successfully using group path hint:',
      groupPathForLog
    );
    // Important: The refreshed token data from GitLab might not include custom 'user' or 'groups' fields.
    // The frontend will need to merge this new token data with existing user/group info.
    return newTokenData; // Contains new access_token, refresh_token, expires_in etc.
  } catch (error) {
    console.error(
      `Error refreshing token for group path hint ${groupPathForLog}:`,
      error
    );
    throw error;
  }
}

router.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');

  try {
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

    const tokenDataFromGitlab = await tokenRes.json();

    if (!tokenDataFromGitlab.access_token) {
      return res
        .status(400)
        .json({ error: 'OAuth failed', details: tokenDataFromGitlab });
    }

    // Get user info using the new access token
    const userRes = await fetch('https://gitlab.com/api/v4/user', {
      headers: {
        Authorization: `Bearer ${tokenDataFromGitlab.access_token}`,
      },
    });
    const userData = await userRes.json();
    if (!userData.id) {
      return res.status(400).json({ error: 'Failed to fetch user info' });
    }

    // Get group info using the new access token
    const groupRes = await fetch(
      'https://gitlab.com/api/v4/groups?min_access_level=30', // Ensure user has at least developer access
      {
        headers: {
          Authorization: `Bearer ${tokenDataFromGitlab.access_token}`,
        },
      }
    );
    const groupData = await groupRes.json();
    // It's okay if a user has no groups with custom emoji permissions,
    // but we should inform the frontend.
    if (!Array.isArray(groupData)) {
      console.warn('No groups found or error fetching groups:', groupData);
      // Proceed without groups if that's the case, or handle as an error if groups are strictly required.
      // For now, let's assume it's okay to have no groups.
    }

    // Combine all information to be sent to the frontend
    const comprehensiveTokenData = {
      ...tokenDataFromGitlab, // access_token, refresh_token, expires_in, etc.
      user: userData,
      groups: Array.isArray(groupData)
        ? groupData.map((group) => group.full_path)
        : [],
    };

    // No server-side storage of tokens for GitLab anymore.
    // Send all data to the frontend.
    const b64Token = Buffer.from(
      JSON.stringify(comprehensiveTokenData)
    ).toString('base64');
    res.redirect(`${process.env.FRONT_URL}/gitlab/callback?token=${b64Token}`);
  } catch (err) {
    console.error('GitLab OAuth Callback Error:', err);
    res.status(500).send('OAuth Error with GitLab');
  }
});

router.get('/emojis', async (req, res) => {
  try {
    const groupPath = req.query.groupPath;
    if (!groupPath) return res.status(400).send('Missing groupPath query parameter');

    const accessToken = extractToken(req);
    if (!accessToken) {
      return res.status(401).send('Unauthorized: Missing access token');
    }

    // Use cached emojis if available
    if (emojis.gitlab[groupPath]) {
      return res.json(emojis.gitlab[groupPath]);
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
      body: JSON.stringify({
        query,
        variables: { groupPath },
      }),
    });

    const emojiData = await emojiRes.json();

    if (emojiRes.status === 401) {
        return res.status(401).send('Unauthorized: Token may be invalid or expired.');
    }


    if (!emojiData || emojiData.errors || !emojiData.data?.group) {
      console.error('Error fetching GitLab emojis from GraphQL:', emojiData?.errors || 'No data returned or group not found');
      // Check if group is null, which can happen if token has no access to this groupPath
      if (emojiData.data && emojiData.data.group === null) {
        return res.status(404).send(`Group not found or no permission for groupPath: ${groupPath}`);
      }
      return res.status(500).send('Error fetching GitLab emojis: Invalid response from GitLab');
    }

    const customEmojiNodes = emojiData.data.group.customEmoji?.nodes || [];
    const emojisList = customEmojiNodes.reduce((acc, emoji) => {
      acc[emoji.name] = emoji.url;
      return acc;
    }, {});

    emojis.gitlab[groupPath] = emojisList; // Cache emojis

    res.json(emojisList);
  } catch (error) {
    console.error('Error in /emojis endpoint:', error);
    res.status(500).send('Server error while fetching GitLab emojis');
  }
});

router.post('/emoji', async (req, res) => {
  try {
    const { groupPath, name, url } = req.body;
    if (!groupPath || !name || !url) {
      return res
        .status(400)
        .send('Missing groupPath, name, or url in request body');
    }

    const accessToken = extractToken(req);
    if (!accessToken) {
      return res.status(401).send('Unauthorized: Missing access token');
    }

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
        return res.status(401).send('Unauthorized: Token may be invalid or expired.');
    }

    const data = result.data?.createCustomEmoji;

    if (result.errors || (data?.errors && data.errors.length > 0)) {
      console.error('GraphQL Error creating emoji:', result.errors || data.errors);
      return res.status(400).json({
        error: 'Failed to create emoji',
        details: result.errors || data.errors,
      });
    }

    // Clear cached emojis for the group as it has been updated
    if (emojis.gitlab[groupPath]) {
      delete emojis.gitlab[groupPath];
    }


    res.json({
      success: true,
      emoji: data.customEmoji,
    });
  } catch (err) {
    console.error('Error in /emoji POST endpoint:', err);
    res.status(500).send('Server error while creating emoji');
  }
});

router.delete('/emoji', async (req, res) => {
  try {
    // For DELETE, parameters are often sent as query params or in URL, but body is also possible.
    // Let's assume they come from req.body as per original code for consistency here.
    const { groupPath, emojiId } = req.body;

    if (!groupPath || !emojiId) {
      return res
        .status(400)
        .send('Missing groupPath or emojiId in request body');
    }

    const accessToken = extractToken(req);
    if (!accessToken) {
      return res.status(401).send('Unauthorized: Missing access token');
    }

    const mutation = `
      mutation DestroyCustomEmoji($id: CustomEmojiID!) {
        destroyCustomEmoji(input: { id: $id }) {
          clientMutationId
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
        variables: { id: emojiId }, // Make sure emojiId is in the format "gid://gitlab/CustomEmoji/123"
      }),
    });

    const result = await gqlRes.json();

    if (gqlRes.status === 401) {
        return res.status(401).send('Unauthorized: Token may be invalid or expired.');
    }

    const mutationData = result.data?.destroyCustomEmoji;

    if (result.errors || (mutationData?.errors && mutationData.errors.length > 0)) {
      console.error('GraphQL Error deleting emoji:', result.errors || mutationData.errors);
      return res.status(400).json({
        error: 'Failed to delete emoji',
        details: result.errors || mutationData.errors,
      });
    }

    // Clear cached emojis for the group
    if (emojis.gitlab[groupPath]) {
      delete emojis.gitlab[groupPath];
    }

    res.json({
      success: true,
      message: `Emoji deleted successfully`,
    });
  } catch (err) {
    console.error('Error in /emoji DELETE endpoint:', err);
    res.status(500).send('Server error while deleting emoji');
  }
});

router.post('/connected', async (req, res) => {
  // Changed to POST to accept token and refresh token in body
  const {
    accessToken: currentAccessToken,
    refreshToken: currentRefreshToken,
    user, // User object from frontend localStorage
    groups, // groups array from frontend localStorage
    groupPath, // The specific groupPath being checked/refreshed
  } = req.body;

  if (!groupPath) {
    return res.status(400).json({ error: 'Missing groupPath in request body' });
  }
  if (!currentAccessToken) {
    return res.status(400).json({ error: 'Missing accessToken in request body' });
  }
  // currentRefreshToken is needed if we attempt a refresh
  // user and groups are needed to reconstruct the token data if refreshed

  try {
    // Test API call to check if the current access token is active
    let userRes = await fetch('https://gitlab.com/api/v4/user', {
      headers: { Authorization: `Bearer ${currentAccessToken}` },
    });

    let tokenToReturnToFrontend = {
      access_token: currentAccessToken,
      refresh_token: currentRefreshToken,
      user: user, // Pass back existing user info
      groups: groups, // Pass back existing groups info
    };

    if (userRes.status === 401) {
      // Token is invalid or expired, try to refresh
      if (!currentRefreshToken) {
        return res.status(401).json({
          connected: false,
          error: 'Token expired and no refresh token provided. Please re-authenticate.',
          needsReAuthentication: true,
        });
      }
      try {
        console.log(
          `Token for group path hint ${groupPath} expired, attempting refresh...`
        );
        const refreshedTokenData = await refreshToken(currentRefreshToken, groupPath); // refreshedTokenData has new access_token, refresh_token, etc.

        // Retry the API call with the new token
        userRes = await fetch('https://gitlab.com/api/v4/user', {
          headers: {
            Authorization: `Bearer ${refreshedTokenData.access_token}`,
          },
        });

        if (userRes.status === 401) {
          return res.status(401).json({
            connected: false,
            error: 'Token refresh failed or new token is also invalid. Please re-authenticate.',
            needsReAuthentication: true,
          });
        }
        // If refresh was successful, update the token data to return
        tokenToReturnToFrontend = {
            ...refreshedTokenData, // new access_token, refresh_token, expires_in
            user: user, // Preserve original user object
            groups: groups, // Preserve original groups list
        };

      } catch (refreshError) {
        console.error('Refresh token attempt failed:', refreshError.message);
        return res.status(401).json({
          connected: false,
          error: `Token refresh failed: ${refreshError.message}. Please re-authenticate.`,
          needsReAuthentication: true,
        });
      }
    }

    if (!userRes.ok) {
      // Handle other API errors not related to 401
      // This could indicate an issue with the GitLab API itself or network problems
      console.error(`GitLab API error after potential refresh: ${userRes.statusText} (status: ${userRes.status})`);
      return res.status(userRes.status).json({
          connected: false,
          error: `GitLab API error: ${userRes.statusText}`,
          details: await userRes.text(), // Include more details if possible
      });
    }

    const userDataFromApi = await userRes.json();
    if (!userDataFromApi.id) {
      return res.status(400).json({
        connected: false,
        error: 'Failed to fetch user info after potential refresh, user ID missing.',
      });
    }

    // If token is active or successfully refreshed, return success
    // Also return the potentially refreshed token so frontend can update localStorage
    res.json({
      connected: true,
      tokenData: tokenToReturnToFrontend, // Contains access_token, refresh_token, user, groups
    });

  } catch (error) {
    console.error('Error in /connected endpoint:', error.message);
    res.status(500).json({
        connected: false,
        error: `Error checking GitLab connection: ${error.message}`
    });
  }
});

export default router;
