import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

import { emojiStore, tokens } from '../store.js';

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

    tokens.gitlab[tokenData.user_id] = tokenData;

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

    const accessToken = tokens.gitlab[groupPath]?.access_token;

    if (!accessToken) {
      return res.status(401).send('Unauthorized: No access token found');
    }

    const emojiRes = await fetch(
      'https://gitlab.com/api/v4/groups/' +
        encodeURIComponent(groupPath) +
        '/custom_emojis',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const emojiData = await emojiRes.json();
    if (!emojiData.ok)
      return res.status(500).send('Emoji error: ' + emojiData.error);

    emojiStore.gitlab[groupPath] = emojiData;

    res.json(emojiData);
  } catch (error) {
    console.error('Error fetching GitLab emojis:', error);
    res.status(500).send('Error fetching GitLab emojis');
  }
});

router.post('/sync', async (req, res) => {
  const { groupPath, name, url } = req.body;

  if (!groupPath || !name || !url) {
    return res.status(400).send('Missing groupPath, name, or url');
  }

  try {
    const mutation = `
      mutation CreateCustomEmoji($groupPath: ID!) {
        createCustomEmoji(input: {
          groupPath: $groupPath,
          name: "${name}",
          url: "${url}"
        }) {
          clientMutationId
          customEmoji {
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
        Authorization: `Bearer ${process.env.GITLAB_TOKEN}`,
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

export default router;
