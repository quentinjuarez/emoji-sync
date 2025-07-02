import fetch from 'node-fetch';
import { emojis } from '../../store.js';

export async function exchangeCodeForToken(code) {
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
  if (!tokenData.ok) {
    console.error('Slack OAuth error:', tokenData.error);
    throw new Error(`OAuth error: ${tokenData.error}`);
  }
  return tokenData;
}

export async function checkConnection(accessToken, teamId) {
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
    const error = new Error(`Token validation failed: ${authTestData.error}. Please re-authenticate.`);
    error.status = 401;
    error.needsReAuthentication = true;
    throw error;
  }
  return {
    connected: true,
    team: authTestData.team,
    user: authTestData.user,
    team_id: authTestData.team_id,
    user_id: authTestData.user_id,
  };
}

export async function getEmojis(accessToken, teamId) {
  if (emojis.slack[teamId]) {
    return emojis.slack[teamId];
  }

  const emojiRes = await fetch('https://slack.com/api/emoji.list', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const emojiData = await emojiRes.json();

  if (!emojiData.ok) {
    console.error(
      `Slack emoji.list error for team ${teamId}: ${emojiData.error}`
    );
    throw new Error(`Emoji error: ${emojiData.error}`);
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

  emojis.slack[teamId] = emojiList; // Cache emojis
  return emojiList;
}
