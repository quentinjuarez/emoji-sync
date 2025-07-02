import express from 'express';
import fetch from 'node-fetch';

import { emojis } from '../../store.js';
import { extractToken } from '../../utils.js';

const router = express.Router();

router.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');

  try {
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        redirect_uri: process.env.SLACK_REDIRECT_URI,
      }),
    });

    const tokenDataFromSlack = await tokenRes.json(); // This is the direct response from Slack
    if (!tokenDataFromSlack.ok) {
      console.error('Slack OAuth error:', tokenDataFromSlack.error);
      return res.status(400).send('OAuth error: ' + tokenDataFromSlack.error);
    }

    const b64Token = Buffer.from(JSON.stringify(tokenDataFromSlack)).toString(
      'base64'
    );
    res.redirect(`${process.env.FRONT_URL}/slack/callback?token=${b64Token}`);
  } catch (err) {
    console.error('Error in Slack OAuth callback:', err);
    res.status(500).send('Server error during Slack OAuth callback');
  }
});

router.post('/connected', async (req, res) => {
  const accessToken = extractToken(req);
  const { teamId } = req.body;

  if (!accessToken) {
    return res
      .status(401)
      .json({ connected: false, error: 'Unauthorized: Missing access token.' });
  }

  try {
    const authTestRes = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const authTestData = await authTestRes.json();

    if (!authTestData.ok) {
      console.warn(
        `Slack auth.test failed for token (team hint: ${teamId || 'N/A'}): ${
          authTestData.error
        }`
      );
      return res.status(401).json({
        connected: false,
        error: `Token validation failed: ${authTestData.error}. Please re-authenticate.`,
        needsReAuthentication: true, // Signal to frontend
      });
    }

    res.json({
      connected: true,
      team: authTestData.team, // { id, name }
      user: authTestData.user, // { name, id }
      team_id: authTestData.team_id,
      user_id: authTestData.user_id,
    });
  } catch (error) {
    console.error(
      `Error checking Slack connection (team hint: ${teamId || 'N/A'}):`,
      error
    );
    res.status(500).json({
      connected: false,
      error: 'Server error while checking Slack connection.',
    });
  }
});

router.get('/emojis', async (req, res) => {
  const accessToken = extractToken(req);
  const teamId = req.query.teamId; // teamId can be used as a cache key for emojis

  if (!accessToken) {
    return res.status(401).send('Unauthorized: Missing access token');
  }
  if (!teamId) {
    return res
      .status(400)
      .send('Missing teamId query parameter for caching context');
  }

  if (emojis.slack[teamId]) {
    return res.json(emojis.slack[teamId]);
  }

  try {
    const emojiRes = await fetch('https://slack.com/api/emoji.list', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const emojiData = await emojiRes.json();

    if (!emojiData.ok) {
      console.error(
        `Slack emoji.list error for team ${teamId}: ${emojiData.error}`
      );
      return res.status(500).send('Emoji error: ' + emojiData.error);
    }

    const emojiList = Object.keys(emojiData.emoji).reduce((acc, emojiName) => {
      if (emojiData.emoji[emojiName].startsWith('alias:')) return acc;

      acc.push({
        id: emojiName,
        name: emojiName,
        url: emojiData.emoji[emojiName],
      });
      return acc;
    }, []);

    emojis.slack[teamId] = emojiList;

    res.json(emojiList);
  } catch (error) {
    console.error(`Error fetching Slack emojis for team ${teamId}:`, error);
    res.status(500).send('Error fetching Slack emojis');
  }
});

export default router;
