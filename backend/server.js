import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

import gitlabRouter from './integrations/gitlab/controller.js';
import slackRouter from './integrations/slack/controller.js';
import syncRouter from './sync/controller.js'; // Import the new sync router
import { emojis } from './store.js';

dotenv.config();

const app = express();
const PORT = 3101;

app.use(cors());
app.use(express.json());

app.use('/gitlab', gitlabRouter);
app.use('/slack', slackRouter);
app.use('/sync', syncRouter); // Use the new sync router

app.get('/debug', (req, res) => {
  res.json({
    emojis,
  });
});

app.listen(PORT, () => {
  console.log('Backend running on http://localhost:' + PORT);
});
