import dotenv from 'dotenv';
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = 3101;

app.use(cors());
app.use(express.json());

let emojiStore = {}; // Simple en mémoire pour test

app.get('/slack/callback', async (req, res) => {
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

    const accessToken = tokenData.access_token;

    const emojiRes = await fetch('https://slack.com/api/emoji.list', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const emojiData = await emojiRes.json();

    console.log(emojiData);

    if (!emojiData.ok)
      return res.status(500).send('Emoji error: ' + emojiData.error);

    // Stock pour test (à remplacer par DB)
    emojiStore[tokenData.team.id] = emojiData.emoji;

    // Redirige vers front
    res.redirect(
      process.env.FRONT_URL + '/emojis?team_id=' + tokenData.team.id
    );
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/api/emojis/:team_id', (req, res) => {
  const emojis = emojiStore[req.params.team_id];
  if (!emojis) return res.status(404).send('No emoji data');
  res.json(emojis);
});

app.listen(PORT, () => {
  console.log('Backend running on http://localhost:' + PORT);
});
