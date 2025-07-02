export async function refreshToken(currentRefreshToken, groupPathForLog) {
  if (!currentRefreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    const response = await fetch('https://gitlab.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GITLAB_CLIENT_ID,
        client_secret: process.env.GITLAB_CLIENT_SECRET,
        refresh_token: currentRefreshToken,
        grant_type: 'refresh_token',
        redirect_uri: process.env.GITLAB_REDIRECT_URI,
      }),
    });

    const newTokenData = await response.json();
    if (!newTokenData.access_token) {
      console.error(
        `Refresh token failed for group path hint ${groupPathForLog}:`,
        newTokenData
      );
      throw new Error('Failed to refresh token');
    }

    console.log(
      'Token refreshed successfully using group path hint:',
      groupPathForLog
    );

    return newTokenData;
  } catch (error) {
    console.error(
      `Error refreshing token for group path hint ${groupPathForLog}:`,
      error
    );
    throw error;
  }
}
