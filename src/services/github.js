// GitHub services with Device Flow (no backend needed)
// NOTE: For rate limits and CORS, unauthenticated requests are limited. Auth improves limits.

export async function fetchGitHubEvents(username, token) {
  const url = `https://api.github.com/users/${encodeURIComponent(
    username
  )}/events/public`;
  const res = await fetch(url, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        }
      : { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub events failed: ${res.status}`);
  return res.json();
}

// Device Flow: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
export async function startGitHubDeviceLogin(clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "read:user repo",
  });
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error("Device code request failed");
  return res.json(); // { device_code, user_code, verification_uri, interval }
}

export async function pollGitHubDeviceToken(
  clientId,
  deviceCode,
  intervalSec = 5
) {
  const params = new URLSearchParams({
    client_id: clientId,
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });
  while (true) {
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });
    if (!res.ok) throw new Error("Token polling failed");
    const data = await res.json();
    if (data.access_token) return data.access_token;
    if (
      data.error &&
      !["authorization_pending", "slow_down"].includes(data.error)
    )
      throw new Error(data.error);
  }
}
