let emojis = {
  slack: {}, // Stocke les emojis Slack par team_id
  gitlab: {}, // Stocke les emojis GitLab par groupPath
};

let tokens = {
  gitlab: {}, // Stocke les tokens GitLab par user_id
  slack: {}, // Stocke les tokens Slack par team_id
};

export { emojis, tokens };
