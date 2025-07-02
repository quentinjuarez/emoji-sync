import { getEmojis as getSlackEmojis } from '../integrations/slack/service.js';
import { createEmoji as createGitlabEmoji, getEmojis as getGitlabEmojis } from '../integrations/gitlab/service.js';

export async function syncSlackToGitlab(
  slackAccessToken,
  slackTeamId,
  gitlabAccessToken,
  gitlabGroupPath,
  sendEvent
) {
  sendEvent({ type: 'info', message: `Fetching emojis from Slack team: ${slackTeamId}` });
  let slackEmojis;
  try {
    slackEmojis = await getSlackEmojis(slackAccessToken, slackTeamId);
    sendEvent({ type: 'info', message: `Found ${slackEmojis.length} emojis in Slack.` });
  } catch (error) {
    console.error(`Error fetching Slack emojis for team ${slackTeamId}:`, error);
    sendEvent({ type: 'error', message: `Failed to fetch Slack emojis: ${error.message}` });
    throw new Error(`Failed to fetch Slack emojis: ${error.message}`);
  }

  sendEvent({ type: 'info', message: `Fetching existing emojis from GitLab group: ${gitlabGroupPath} to avoid duplicates.` });
  let gitlabExistingEmojis;
  try {
    gitlabExistingEmojis = await getGitlabEmojis(gitlabAccessToken, gitlabGroupPath);
  } catch (error) {
    // Log the error but proceed, as this is an optimization.
    // Worst case, we try to create duplicates and handle those errors.
    console.warn(`Could not fetch existing GitLab emojis for group ${gitlabGroupPath}:`, error);
    sendEvent({ type: 'warning', message: `Could not pre-fetch existing GitLab emojis: ${error.message}. Proceeding with sync.` });
    gitlabExistingEmojis = []; // Assume no existing emojis if fetch fails
  }
  // Store names in lowercase for case-insensitive comparison
  const gitlabExistingEmojiNames = new Set(gitlabExistingEmojis.map(e => e.name.toLowerCase()));


  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const emoji of slackEmojis) {
    sendEvent({ type: 'progress', message: `Processing emoji: ${emoji.name}` });

    const originalNameLower = emoji.name.toLowerCase();
    // GitLab emoji names must be at least 2 chars, alphanumeric or underscores
    let sanitizedName = emoji.name.replace(/[^a-zA-Z0-9_]/g, '_');
    if (emoji.name !== sanitizedName) {
        sendEvent({ type: 'info', emojiName: emoji.name, message: `Original name "${emoji.name}" was sanitized to "${sanitizedName}" for GitLab compatibility.` });
    }

    if (sanitizedName.length < 2) {
      sendEvent({ type: 'error', emojiName: emoji.name, message: `Emoji name ${emoji.name} (sanitized: ${sanitizedName}) is too short (minimum 2 chars). Skipped.` });
      errorCount++;
      continue;
    }
    // Max length for GitLab emoji names is 64 characters.
    if (sanitizedName.length > 64) {
        const truncatedName = sanitizedName.substring(0, 64);
        sendEvent({ type: 'warning', emojiName: emoji.name, message: `Emoji name ${sanitizedName} (from ${emoji.name}) is too long (max 64 chars). It will be truncated to ${truncatedName}.`});
        sanitizedName = truncatedName;
    }


    const sanitizedNameLower = sanitizedName.toLowerCase();

    if (gitlabExistingEmojiNames.has(sanitizedNameLower)) {
      sendEvent({ type: 'skipped', emojiName: emoji.name, newName: sanitizedName, message: `Emoji ${sanitizedName} (from Slack's ${emoji.name}) already exists in GitLab (case-insensitive). Skipped.` });
      skippedCount++;
      continue;
    }

    try {
      await createGitlabEmoji(gitlabAccessToken, gitlabGroupPath, sanitizedName, emoji.url);
      sendEvent({ type: 'success', emojiName: sanitizedName, originalName: emoji.name, message: `Emoji ${sanitizedName} (from Slack's ${emoji.name}) created successfully in GitLab.` });
      successCount++;
      // Add newly created emoji to the set (lowercase) to prevent duplicate attempts
      gitlabExistingEmojiNames.add(sanitizedNameLower);
    } catch (error) {
      // Check if the error is because the emoji already exists (fallback)
      const errorMessage = error.details?.[0]?.message || error.message || '';
      if (errorMessage.toLowerCase().includes('has already been taken') || errorMessage.toLowerCase().includes('name has already been taken')) {
        sendEvent({ type: 'skipped', emojiName: emoji.name, newName: sanitizedName, message: `Emoji ${sanitizedName} (from Slack's ${emoji.name}) already exists in GitLab (detected during creation attempt). Skipped.` });
        skippedCount++;
        gitlabExistingEmojiNames.add(sanitizedNameLower); // Ensure it's marked as existing
      } else {
        console.error(`Error creating GitLab emoji ${emoji.name} (as ${sanitizedName}):`, error.details || error.message);
        sendEvent({ type: 'error', emojiName: emoji.name, message: `Failed to create emoji ${emoji.name} in GitLab: ${errorMessage}` });
        errorCount++;
      }
    }
  }

  sendEvent({
    type: 'summary',
    message: `Synchronization finished. Successful: ${successCount}, Skipped (already exist): ${skippedCount}, Errors: ${errorCount}.`,
    counts: { success: successCount, skipped: skippedCount, errors: errorCount },
  });
}
