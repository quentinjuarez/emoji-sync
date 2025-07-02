import { getEmojis as getSlackEmojis } from '../integrations/slack/service.js';
import {
  createEmoji as createGitlabEmoji,
  getEmojis as getGitlabEmojis,
} from '../integrations/gitlab/service.js';

export async function syncSlackToGitlab(
  slackAccessToken,
  slackTeamId,
  gitlabAccessToken,
  gitlabGroupPath,
  sendEvent
) {
  sendEvent({
    type: 'info',
    message: `Fetching emojis from Slack team: ${slackTeamId}`,
  });
  let slackEmojis;
  try {
    slackEmojis = await getSlackEmojis(slackAccessToken, slackTeamId);
    sendEvent({
      type: 'info',
      message: `Found ${slackEmojis.length} emojis in Slack.`,
    });
  } catch (error) {
    console.error(
      `Error fetching Slack emojis for team ${slackTeamId}:`,
      error
    );
    sendEvent({
      type: 'error',
      message: `Failed to fetch Slack emojis: ${error.message}`,
    });
    throw new Error(`Failed to fetch Slack emojis: ${error.message}`);
  }

  sendEvent({
    type: 'info',
    message: `Fetching existing emojis from GitLab group: ${gitlabGroupPath} to avoid duplicates.`,
  });
  let gitlabExistingEmojis;
  try {
    gitlabExistingEmojis = await getGitlabEmojis(
      gitlabAccessToken,
      gitlabGroupPath
    );
  } catch (error) {
    console.warn(
      `Could not fetch existing GitLab emojis for group ${gitlabGroupPath}:`,
      error
    );
    sendEvent({
      type: 'warning',
      message: `Could not pre-fetch existing GitLab emojis: ${error.message}. Proceeding with sync.`,
    });
    gitlabExistingEmojis = []; // Assume no existing emojis if fetch fails
  }
  // Store names in lowercase for case-insensitive comparison
  const gitlabExistingEmojiNames = new Set(
    gitlabExistingEmojis.map((e) => e.name.toLowerCase())
  );

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const emoji of slackEmojis) {
    sendEvent({ type: 'progress', message: `Processing emoji: ${emoji.name}` });

    const sanitizedName = emoji.name;

    try {
      await createGitlabEmoji(
        gitlabAccessToken,
        gitlabGroupPath,
        sanitizedName,
        emoji.url
      );
      sendEvent({
        type: 'success',
        emojiName: sanitizedName,
        originalName: emoji.name,
        message: `Emoji ${sanitizedName} (from Slack's ${emoji.name}) created successfully in GitLab.`,
      });
      successCount++;
      // Add newly created emoji to the set (lowercase) to prevent duplicate attempts
      gitlabExistingEmojiNames.add(sanitizedName);
    } catch (error) {
      // Check if the error is because the emoji already exists (fallback)
      const errorMessage = error.details?.[0]?.message || error.message || '';
      if (
        errorMessage.toLowerCase().includes('has already been taken') ||
        errorMessage.toLowerCase().includes('name has already been taken')
      ) {
        sendEvent({
          type: 'skipped',
          emojiName: emoji.name,
          newName: sanitizedName,
          message: `Emoji ${sanitizedName} (from Slack's ${emoji.name}) already exists in GitLab (detected during creation attempt). Skipped.`,
        });
        skippedCount++;
        gitlabExistingEmojiNames.add(sanitizedName); // Ensure it's marked as existing
      } else {
        console.error(
          `Error creating GitLab emoji ${emoji.name} (as ${sanitizedName}):`,
          error.details || error.message
        );
        sendEvent({
          type: 'error',
          emojiName: emoji.name,
          message: `Failed to create emoji ${emoji.name} in GitLab: ${errorMessage}`,
        });
        errorCount++;
      }
    }
  }

  sendEvent({
    type: 'summary',
    message: `Synchronization finished. Successful: ${successCount}, Skipped (already exist): ${skippedCount}, Errors: ${errorCount}.`,
    counts: {
      success: successCount,
      skipped: skippedCount,
      errors: errorCount,
    },
  });
}
