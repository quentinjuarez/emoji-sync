let emojiStore = {
  slack: {}, // Stocke les emojis Slack par team_id
  gitlab: {}, // Stocke les emojis GitLab par groupPath
}; // Simple en mémoire pour test

let tokens = {
  gitlab: {}, // Stocke les tokens GitLab par user_id
  slack: {}, // Stocke les tokens Slack par team_id
}; // Simple en mémoire pour test

export { emojiStore, tokens };
