import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

import { emojis, tokens } from '../store.js';

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

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res
        .status(400)
        .json({ error: 'OAuth failed', details: tokenData });
    }

    // get user info
    const userRes = await fetch('https://gitlab.com/api/v4/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userData = await userRes.json();
    if (!userData.id) {
      return res.status(400).json({ error: 'Failed to fetch user info' });
    }

    // store token with user info
    tokenData.user = userData;

    // get group info
    const groupRes = await fetch(
      'https://gitlab.com/api/v4/groups?min_access_level=30',
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    const groupData = await groupRes.json();
    if (!Array.isArray(groupData) || groupData.length === 0) {
      return res.status(400).json({ error: 'No accessible groups found' });
    }

    tokenData.groups = groupData.map((group) => group.full_path);

    groupData.forEach((group) => {
      tokens.gitlab[group.full_path] = tokenData;
    });

    const b64Token = Buffer.from(JSON.stringify(tokenData)).toString('base64');

    res.redirect(`${process.env.FRONT_URL}/gitlab/callback?token=${b64Token}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('OAuth Error');
  }
});

router.get('/emojis', async (req, res) => {
  try {
    const groupPath = req.query.groupPath;
    if (!groupPath) return res.status(400).send('Missing groupPath');

    // use cached emojis if available
    if (emojis.gitlab[groupPath]) {
      return res.json(emojis.gitlab[groupPath]);
    }

    const accessToken = tokens.gitlab[groupPath]?.access_token;

    if (!accessToken) {
      return res.status(401).send('Unauthorized: No access token found');
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

    if (!emojiData || !emojiData.data)
      throw new Error(emojiData.errors || 'No data returned');

    console.log(emojiData.data.group.customEmoji.nodes);

    const emojisList = emojiData.data.group.customEmoji.nodes.reduce(
      (acc, emoji) => {
        acc[emoji.name] = emoji.url;
        return acc;
      },
      {}
    );

    emojis.gitlab[groupPath] = emojisList;

    res.json(emojisList);
  } catch (error) {
    console.error('Error fetching GitLab emojis:', error);
    res.status(500).send('Error fetching GitLab emojis');
  }
});

router.post('/emoji', async (req, res) => {
  try {
    const { groupPath, name, url } = req.body;

    console.log(req.body);

    if (!groupPath || !name || !url) {
      return res.status(400).send('Missing groupPath, name, or url');
    }

    const accessToken = tokens.gitlab[groupPath]?.access_token;

    if (!accessToken) {
      return res.status(401).send('Unauthorized: No access token found');
    }

    const mutation = `
      mutation CreateCustomEmoji($groupPath: ID!) {
        createCustomEmoji(input: {
          groupPath: $groupPath,
          name: "${name}",
          url: "${url}"
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
        variables: { groupPath },
      }),
    });

    const result = await gqlRes.json();
    const data = result.data?.createCustomEmoji;

    if (result.errors || data?.errors?.length > 0) {
      return res.status(400).json({
        error: result.errors || data.errors,
      });
    }

    res.json({
      success: true,
      emoji: data.customEmoji,
    });
  } catch (err) {
    console.error('GraphQL Error:', err);
    res.status(500).send('Server error');
  }
});

router.delete('/emoji', async (req, res) => {
  try {
    const { groupPath, emojiId } = req.body;

    if (!groupPath || !emojiId) {
      return res.status(400).send('Missing groupPath or emojiId');
    }

    const accessToken = tokens.gitlab[groupPath]?.access_token;

    if (!accessToken) {
      return res.status(401).send('Unauthorized: No access token found');
    }

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
      body: JSON.stringify({
        query: mutation,
        variables: { id: emojiId },
      }),
    });

    const result = await gqlRes.json();
    const mutationData = result.data?.destroyCustomEmoji;

    if (result.errors || !mutationData) {
      return res.status(400).json({
        error: result.errors ?? 'Unknown error occurred',
      });
    }

    if (mutationData.errors?.length > 0) {
      return res.status(400).json({
        error: mutationData.errors,
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
    console.error('GraphQL Error:', err);
    res.status(500).send('Server error');
  }
});

// delete errors found
// [
//     {
//         "message": "The resource that you are attempting to access does not exist or you don't have permission to perform this action",
//         "locations": [
//             {
//                 "line": 3,
//                 "column": 9
//             }
//         ],
//         "path": [
//             "destroyCustomEmoji"
//         ]
//     }
// ]

// create errors found
// [
//     "Name has already been taken"
// ]

export default router;
