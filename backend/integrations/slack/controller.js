import express from 'express';
import { extractToken } from '../../utils.js';
import * as SlackService from './service.js';

const router = express.Router();

router.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');

  try {
    const tokenDataFromSlack = await SlackService.exchangeCodeForToken(code);
    const b64Token = Buffer.from(JSON.stringify(tokenDataFromSlack)).toString(
      'base64'
    );
    res.redirect(`${process.env.FRONT_URL}/slack/callback?token=${b64Token}`);
  } catch (err) {
    console.error('Error in Slack OAuth callback:', err.message);
    res.status(500).send(err.message || 'Server error during Slack OAuth callback');
  }
});

router.post('/connected', async (req, res) => {
  const accessToken = extractToken(req);
  const { teamId } = req.body; // teamId is used for logging/context in service

  if (!accessToken) {
    return res
      .status(401)
      .json({ connected: false, error: 'Unauthorized: Missing access token.' });
  }

  try {
    const connectionData = await SlackService.checkConnection(accessToken, teamId);
    res.json(connectionData);
  } catch (error) {
    console.error(
      `Error checking Slack connection (team hint: ${teamId || 'N/A'}):`,
      error.message
    );
    const status = error.status || 500;
    const responseJson = {
        connected: false,
        error: error.message || 'Server error while checking Slack connection.',
    };
    if (error.needsReAuthentication) {
        responseJson.needsReAuthentication = true;
    }
    res.status(status).json(responseJson);
  }
});

router.get('/emojis', async (req, res) => {
  const accessToken = extractToken(req);
  const teamId = req.query.teamId;

  if (!accessToken) {
    return res.status(401).send('Unauthorized: Missing access token');
  }
  if (!teamId) {
    return res
      .status(400)
      .send('Missing teamId query parameter for caching context');
  }

  try {
    const emojiList = await SlackService.getEmojis(accessToken, teamId);
    res.json(emojiList);
  } catch (error) {
    console.error(`Error fetching Slack emojis for team ${teamId}:`, error.message);
    // Assuming service throws error with message from Slack API if available
    res.status(500).send(error.message || 'Error fetching Slack emojis');
  }
});

export default router;
