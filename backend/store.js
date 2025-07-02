let emojis = {
  slack: {}, // Stocke les emojis Slack par team_id
  gitlab: {}, // Stocke les emojis GitLab par groupPath
};

// All tokens are now stored in localStorage on the frontend
let tokens = {}; // Slack tokens also removed

export { emojis, tokens }; // tokens export might be vestigial if not used by any other part
// For now, keeping the export structure, but tokens object is empty.
// Consider removing 'tokens' export if nothing else uses it after Slack changes.
