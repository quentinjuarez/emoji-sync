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
