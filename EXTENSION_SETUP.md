# Twitch Extension setup — patelnirvik

Minority Rules now uses **clickable A/B buttons in a custom Twitch Extension**. It does not read chat messages or use native Twitch Polls. A separate OAuth application is not required.

## Current installation

- Extension: **Minority Rules 0.0.1**, **Hosted Test**.
- Client ID: `tci09cjiew49jy3sqg17zw5e0addyu`.
- Channel: **patelnirvik**, numeric ID `1601671453`.
- Installed and active as **EXTENSION-PANEL-1**, with Panel and Mobile views configured.
- Request Identity Link enabled; chat capability disabled; hosting restricted to patelnirvik.
- Viewer/configuration assets uploaded to Twitch; backend domain and launch URLs allowlisted.
- `EXTENSION_SECRET` and `SESSION_SECRET` stored in Cloudflare's secret store, with no values committed to the repository.
- Tested broadcaster control-link generation, signed dashboard session, a real vote and vote change, aggregate reveal/wipeout, and voting from Twitch's Hosted Test CDN.

Developer Console: https://dev.twitch.tv/console/extensions/tci09cjiew49jy3sqg17zw5e0addyu/0.0.1/status

Channel panel: https://www.twitch.tv/patelnirvik/about

The following instructions document the setup for future versions. **Do not create a duplicate Extension or rotate its secret for routine deployments.** Additional testers must be added to the Testing Account Allowlist. Review remains pending, including a privacy notice and the remaining directory/review assets.

## 1. Create the Extension

Open https://dev.twitch.tv/console/extensions and choose **Create Extension**.

- Name: **Minority Rules** (or a unique variation if Twitch requires it).
- Enable a **Panel** view. Set its height to **500px** (Twitch's maximum; approximately 318 × 496px internally).
- Enable **Mobile** support using the same viewer page.
- Enable **Request Identity Link**. Viewers opt in to sharing their Twitch identity before joining; anonymous or unlinked viewers can spectate.
- Add `patelnirvik` to the streamer allowlist and add your own account plus any demo participants to the testing-account allowlist.

The Extension includes an installation configuration page and can use the same page for live broadcaster configuration. It opens the external streamer dashboard through a verified, one-use link. Only the broadcaster can generate these links; moderators and viewers cannot.

## 2. Configure Asset Hosting

Use these paths for the ZIP-hosted version:

| Setting | Value |
| --- | --- |
| Panel Viewer Path | `viewer.html` |
| Mobile Viewer Path | `viewer.html` |
| Configuration Path | `config.html` |
| Live Configuration Path | `config.html` |

For **Local Test**, use `https://minority-rules.nirvik.workers.dev/extension/` as the testing base URI. The individual pages are already served there over HTTPS.

Add `https://minority-rules.nirvik.workers.dev` to the Extension's **Allowlisted Domains / EBS connection domains** so the iframe can call the backend. Keep the Twitch Extension Helper allowed. The packaged viewer uses no third-party images, fonts, analytics, or inline scripts.

## 3. Connect Cloudflare

Copy the Extension **Client ID** and its base64-encoded **Extension secret** from the Developer Console. The Extension secret is not an OAuth client secret. Never paste it into the Extension UI, source files, or chat.

Install and activate the Extension on your channel for testing. Open its Configuration page. The page shows your actual numeric **Channel ID** and the Extension Client ID even before the backend is configured.

In `wrangler.jsonc`, set:

```json
{
  "EXTENSION_CLIENT_ID": "your-extension-client-id",
  "BROADCASTER_ID": "the-numeric-channel-id-shown-in-config",
  "APP_ORIGIN": "https://minority-rules.nirvik.workers.dev"
}
```

Preserve the rest of the Wrangler configuration. Add the secrets through interactive prompts:

```sh
npx wrangler secret put EXTENSION_SECRET
npx wrangler secret put SESSION_SECRET
npm run deploy
```

The Extension secret must be copied exactly as base64. `SESSION_SECRET` is a separate strong random value of at least 32 characters. It signs the broadcaster's HttpOnly dashboard session. Keep it stable across deployments. No chat or Channel Points permission is requested.

For local EBS testing, copy `.dev.vars.example` to `.dev.vars`, fill its secrets and local APP_ORIGIN, and set the identifiers in Wrangler. Demo mode and the standalone preview need no credentials.

## 4. Upload the prepared ZIP

The build generates **`minority-rules-extension.zip`** next to the project folder. In the Developer Console, upload it as your Extension version's assets. Its root contains `viewer.html`, `config.html`, and `assets/`.

Move the version to **Hosted Test**. Install and activate it on `patelnirvik`. Test accounts will see the panel below the video and, when configured, in the mobile Extension view.

Open Configuration or Live Configuration, click **Open game controls**, then **Continue to game controls**. Each link expires after 60 seconds and can be used once. Use **Get a new link** if it expires. The resulting broadcaster session lasts 24 hours. Generating a link does not grant access to other viewers. Technical identifiers are inside **Connection details**.

## 5. Verify a real game

1. Have at least six allowlisted viewers open the Extension and share their identity. Start a 30-second round from the dashboard.
2. Viewers click A or B. Confirm changing choices leaves the total number of voters unchanged.
3. During voting, each viewer sees only their own choice and total participation. Confirm both totals appear together during reveal.
4. Continue to round 2. Verify eliminated viewers see the ghost message, late entrants spectate, and nonvoting survivors are eliminated.
5. Finish with 1–3 survivors or a wipeout and check real display names on the stream display.
6. Refresh the dashboard, the OBS display, and a viewer's panel; the current game must remain intact. A backend restart preserves the stored round and deadline.

Ordinary viewers cannot see an unreleased Extension unless their accounts are allowlisted for testing. Public availability requires Twitch review and release. Do not describe Hosted Test as publicly available. See https://dev.twitch.tv/docs/extensions/life-cycle/.

## Interactive preview

https://minority-rules.nirvik.workers.dev/extension/viewer.html?preview=1

This is a clearly labeled local simulation of the voting panel, with eight fake players. It does not cast real Twitch votes or affect the live game. It demonstrates selecting A/B, changing your choice, hidden splits, and the round ending without developer credentials.

## Review assets still needed

Supply your support contact, final branding images, Extension screenshots, privacy policy, and terms of service in Twitch's submission form. Describe identity use accurately: the game verifies numeric Twitch IDs, fetches display names from Twitch, and stores votes and eligibility for the current game. Names appear in winner screens and rate-limited gameplay toasts. Individual selections are returned only to the viewer who made them; the reveal displays aggregate counts.

Twitch documentation: https://dev.twitch.tv/docs/extensions/building/ and https://dev.twitch.tv/docs/extensions/reference/.
