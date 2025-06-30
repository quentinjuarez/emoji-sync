import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

import gitlabRouter from './integrations/gitlab.js';
import slackRouter from './integrations/slack.js';
import { emojis, tokens } from './store.js';

dotenv.config();

const app = express();
const PORT = 3101;

app.use(cors());
app.use(express.json());

app.use('/gitlab', gitlabRouter);
app.use('/slack', slackRouter);

app.get('/debug', (req, res) => {
  res.json({
    tokens,
    emojis,
  });
});

app.listen(PORT, () => {
  console.log('Backend running on http://localhost:' + PORT);
});
