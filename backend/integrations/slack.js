import express from 'express';
import fetch from 'node-fetch';

import { emojis, tokens } from '../store.js';

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

    const tokenData = await tokenRes.json();
    if (!tokenData.ok)
      return res.status(400).send('OAuth error: ' + tokenData.error);

    tokens.slack[tokenData.team.id] = tokenData;

    const b64Token = Buffer.from(JSON.stringify(tokenData)).toString('base64');

    res.redirect(`${process.env.FRONT_URL}/slack/callback?token=${b64Token}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.get('/connected', async (req, res) => {
  const teamId = req.query.teamId;
  if (!teamId) {
    // Try to infer teamId if only one token exists (e.g., during initial setup or if UI doesn't have teamId yet)
    const storedTeamIds = Object.keys(tokens.slack);
    if (storedTeamIds.length === 1) {
      // teamId = storedTeamIds[0]; // This is a potential auto-detection, but explicit teamId is better.
      // For now, require teamId to be explicit.
      return res.status(400).json({ connected: false, error: 'Missing teamId query parameter.' });
    } else if (storedTeamIds.length === 0) {
      return res.status(404).json({ connected: false, error: 'No Slack integration found.' });
    } else {
      // If multiple integrations, teamId is necessary to know which one to check
      return res.status(400).json({ connected: false, error: 'Missing teamId and multiple Slack integrations exist.' });
    }
  }

  const tokenData = tokens.slack[teamId];
  if (!tokenData || !tokenData.access_token) {
    return res.status(401).json({ connected: false, error: 'Unauthorized: No access token found for this teamId.' });
  }

  try {
    const authTestRes = await fetch('https://slack.com/api/auth.test', {
      method: 'POST', // Using POST as recommended by Slack docs for auth.test
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json', // Though no body is sent, it's good practice
      },
    });

    const authTestData = await authTestRes.json();

    if (!authTestData.ok) {
      // Token is invalid
      console.warn(`Slack auth.test failed for team ${teamId}: ${authTestData.error}`);
      // Clean up the invalid token from the store
      delete tokens.slack[teamId];
      delete emojis.slack[teamId]; // Also clear any cached emojis for this team
      return res.status(401).json({ connected: false, error: `Token validation failed: ${authTestData.error}. Please re-authenticate.` });
    }

    // Token is active
    res.json({
      connected: true,
      team: authTestData.team,
      user: authTestData.user,
      team_id: authTestData.team_id,
      user_id: authTestData.user_id,
    });
  } catch (error) {
    console.error(`Error checking Slack connection for team ${teamId}:`, error);
    res.status(500).json({ connected: false, error: 'Server error while checking Slack connection.' });
  }
});

router.get('/emojis', async (req, res) => {
  try {
    const teamId = req.query.teamId;
    if (!teamId) return res.status(400).send('Missing teamId');

    // use cached emojis if available
    if (emojis.slack[teamId]) {
      return res.json(emojis.slack[teamId]);
    }

    const accessToken = tokens.slack[teamId]?.access_token;

    if (!accessToken) {
      return res.status(401).send('Unauthorized: No access token found');
    }

    const emojiRes = await fetch('https://slack.com/api/emoji.list', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const emojiData = await emojiRes.json();

    if (!emojiData.ok)
      return res.status(500).send('Emoji error: ' + emojiData.error);

    emojis.slack[teamId] = emojiData.emoji;

    res.json(emojiData.emoji);
  } catch (error) {
    console.error('Error fetching Slack emojis:', error);
    res.status(500).send('Error fetching Slack emojis');
  }
});

export default router;
