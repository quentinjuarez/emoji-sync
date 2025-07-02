import express from 'express';
import { syncSlackToGitlab } from './service.js';
import { store } from '../../store.js'; // Assuming store might be needed for tokens

const router = express.Router();

router.post('/slack-to-gitlab', async (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Flush the headers to establish the SSE connection immediately

  const { slackToken, slackTeamId, gitlabToken, gitlabGroupPath } = req.body;

  // Note: With SSE, we can't send a 400 status code in JSON format after headers are flushed.
  // Validation should happen before flushing headers, or errors reported via SSE events.
  // For simplicity, this example assumes parameters are present or handles it by closing the stream.
  if (!slackToken || !slackTeamId || !gitlabToken || !gitlabGroupPath) {
    res.write(`data: ${JSON.stringify({type: 'error', message: 'Missing required parameters.'})}\n\n`);
    res.end();
    return;
  }

  // A helper function to send SSE messages
  const sendEvent = (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    // Initial message is sent by sendEvent, no separate sendEvent here for starting.
    await syncSlackToGitlab(
      slackToken,
      slackTeamId,
      gitlabToken,
      gitlabGroupPath,
      sendEvent
    );
    sendEvent({ type: 'done', message: 'Synchronization complete!' });
    res.end();
  } catch (error) {
    console.error('Synchronization error in controller:', error);
    sendEvent({ type: 'error', message: `Error during synchronization: ${error.message}` });
    // Ensure the response is ended even if headers were already sent
    if (!res.writableEnded) {
      res.status(500).end(); // Cannot set status if headers already sent, but useful if error before flush.
    }
  }
});

export default router;
