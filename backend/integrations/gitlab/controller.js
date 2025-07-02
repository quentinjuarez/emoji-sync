import express from 'express';
import { extractToken } from '../../utils.js';
import * as GitLabService from './service.js';

const router = express.Router();

router.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');

  try {
    const tokenDataFromGitlab = await GitLabService.exchangeCodeForToken(code);
    const userData = await GitLabService.fetchGitLabUser(
      tokenDataFromGitlab.access_token
    );
    const groupData = await GitLabService.fetchGitLabGroups(
      tokenDataFromGitlab.access_token
    );

    const comprehensiveTokenData = {
      ...tokenDataFromGitlab,
      user: userData,
      groups: groupData,
    };

    const b64Token = Buffer.from(
      JSON.stringify(comprehensiveTokenData)
    ).toString('base64');
    res.redirect(`${process.env.FRONT_URL}/gitlab/callback?token=${b64Token}`);
  } catch (err) {
    console.error('GitLab OAuth Callback Error:', err.message);
    const status = err.status || 500;
    const message = status === 500 ? 'OAuth Error with GitLab' : err.message;
    const responseJson = { error: message };
    if (err.details) {
      responseJson.details = err.details;
    }
    res.status(status).json(responseJson);
  }
});

// Endpoint to delete all custom emojis for a group
router.delete('/emojis/delete-all', async (req, res) => {
  try {
    const { groupPath } = req.body;
    if (!groupPath) {
      return res.status(400).send('Missing groupPath in request body');
    }

    const accessToken = extractToken(req);
    if (!accessToken) {
      return res.status(401).send('Unauthorized: Missing access token');
    }

    const result = await GitLabService.deleteAllEmojisForGroup(accessToken, groupPath);
    res.json(result);
  } catch (err) {
    console.error('Error in /emojis/delete-all DELETE endpoint:', err.message);
    const status = err.status || 500;
    const responseJson = {
      error: err.message || 'Server error while deleting all emojis',
    };
    if (err.details) {
      responseJson.details = err.details;
    }
    res.status(status).json(responseJson);
  }
});

router.get('/emojis', async (req, res) => {
  try {
    const groupPath = req.query.groupPath;
    if (!groupPath) {
      return res.status(400).send('Missing groupPath query parameter');
    }

    const accessToken = extractToken(req);
    if (!accessToken) {
      return res.status(401).send('Unauthorized: Missing access token');
    }

    const emojisList = await GitLabService.getEmojis(accessToken, groupPath);
    res.json(emojisList);
  } catch (error) {
    console.error('Error in /emojis endpoint:', error.message);
    const status = error.status || 500;
    const message =
      status < 500
        ? error.message
        : 'Server error while fetching GitLab emojis';
    res.status(status).send(message);
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

    const newEmoji = await GitLabService.createEmoji(
      accessToken,
      groupPath,
      name,
      url
    );
    res.json({ success: true, emoji: newEmoji });
  } catch (err) {
    console.error('Error in /emoji POST endpoint:', err.message);
    const status = err.status || 500;
    const responseJson = {
      error: err.message || 'Server error while creating emoji',
    };
    if (err.details) {
      responseJson.details = err.details;
    }
    res.status(status).json(responseJson);
  }
});

router.delete('/emoji', async (req, res) => {
  try {
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

    const result = await GitLabService.deleteEmoji(
      accessToken,
      groupPath,
      emojiId
    );
    res.json(result);
  } catch (err) {
    console.error('Error in /emoji DELETE endpoint:', err.message);
    const status = err.status || 500;
    const responseJson = {
      error: err.message || 'Server error while deleting emoji',
    };
    if (err.details) {
      responseJson.details = err.details;
    }
    res.status(status).json(responseJson);
  }
});

router.post('/connected', async (req, res) => {
  const {
    accessToken: currentAccessToken,
    refreshToken: currentRefreshToken,
    user,
    groups,
    groupPath,
  } = req.body;

  if (!groupPath) {
    return res.status(400).json({ error: 'Missing groupPath in request body' });
  }
  if (!currentAccessToken) {
    return res
      .status(400)
      .json({ error: 'Missing accessToken in request body' });
  }

  try {
    const result = await GitLabService.checkConnection(
      currentAccessToken,
      currentRefreshToken,
      user,
      groups,
      groupPath
    );
    res.json(result);
  } catch (error) {
    console.error('Error in /connected endpoint:', error.message);
    const status = error.status || 500;
    const responseJson = {
      connected: false,
      error: error.message || 'Error checking GitLab connection',
    };
    if (error.needsReAuthentication) {
      responseJson.needsReAuthentication = true;
    }
    res.status(status).json(responseJson);
  }
});

export default router;
