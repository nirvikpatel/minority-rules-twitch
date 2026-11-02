# Verification record

- 20 engine/question-pack tests passed, including 1,000 players and 10,000 vote changes.
- TypeScript check and Vite production build passed.
- Cloudflare Worker bundle dry run passed; SQLite Durable Object binding verified.
- Local integration smoke passed: 100 simulated voters, real server deadlines, hidden suspense counts, read-only display capabilities, same-origin mutation protection, stale command rejection, refresh recovery, next round, and clean reset.
- Browser inspection covered the desktop panel, 390px mobile layout, and separate OBS display. No horizontal overflow in the inspected desktop layout.
- Deployed to https://minority-rules.nirvik.workers.dev using the existing authenticated Cloudflare account.
- Production integration smoke passed against the deployed Cloudflare Worker, including capability boundaries and a complete timed round.
- Production full-game simulation completed in four rounds with three named winners.

## Extension voting update

- Replaced the EventSub/chat input path with signed Twitch Extension votes. Chat messages no longer enter the live game.
- 39 unit tests passed: the original 20 engine tests plus 19 Extension authorization/gateway tests.
- Added standalone viewer/configuration assets and an upload ZIP, plus an explicitly simulated clickable viewer preview.
- Original deployed full-game and smoke results above describe the server/game engine before the Extension update; repeat the deployment smoke against the new version.

## Real Twitch verification — November 1, 2026

- Registered Minority Rules 0.0.1 in the authenticated patelnirvik Developer Console. Panel and Mobile enabled, identity linking enabled, chat capability disabled.
- Uploaded the seven-file Extension ZIP; configured viewer/configuration paths and the Cloudflare backend allowlist; restricted hosting to patelnirvik.
- Installed and activated the Extension as EXTENSION-PANEL-1, then moved it to Hosted Test.
- Stored the existing Twitch signing secret and a random session-signing secret in Cloudflare. No secret values were written to source files or emitted in chat output.
- Real broadcaster JWT authorization generated a one-use control link; opening it created a signed dashboard session and enabled live controls.
- On the real Twitch channel, patelnirvik selected A and changed to B. Total participation remained one, and the panel confirmed the replacement. Both option totals remained hidden until reveal.
- The single-player unanimous vote resolved to a wipeout, as specified. No simulated identities were inserted into the live game.
- Reloaded the channel after Hosted Test transition: the Extension loaded from its versioned ext-twitch.tv CDN URL, called the Cloudflare backend successfully, and accepted a real B vote. This exercised the CDN CORS allowlist, JWT verification, and Twitch Helix profile lookup.
- The Extension update passed the production integration smoke: 100 simulated voters, deadline/reveal, capability boundaries, stale commands, refresh, next round, and reset.
- Browser tests exercised standalone vote selection/replacement and the narrow panel layout. The Twitch upload is configured for a 500px panel, approximately 318 × 496px internally.

Still pending: a multi-account live survival game, identity-sharing consent with an unlinked viewer, Twitch mobile-app behavior, OBS audio capture, review assets/privacy notice, public release approval, and submission video. The testing allowlist currently includes only patelnirvik. The source is in a private GitHub repository.

## Minimal UI update

- Replaced the decorative dashboard with a stream preview and essential controls. OBS setup, help, and round history are collapsed by default. The question pack and timer save automatically when starting a waiting game.
- Simplified the Extension to a question, countdown, two answer buttons, and a short personal status. Removed repeated instructions and decorative badges; kept the simulated preview clearly labeled.
- All 39 existing tests and the TypeScript/Vite production build passed. The timed local integration smoke passed.
- Browser verification confirmed automatic saving of a 15-second Food round, continued round resolution, and A-to-B switching with nine total voters in the standalone panel. The panel fits 318 × 496px.
- Published the minimal dashboard and stream display to Cloudflare. Re-uploaded the six-file Extension bundle and restored Hosted Test. Verified the actual Twitch channel loads the new CDN version (`7a6d555fa97813ac17c0ec6b08d1cbe4`) and authenticated live dashboard controls remain available.

## 3D materials and winner celebration — November 2, 2026

- Added raised button surfaces, recessed form fields, beveled answer tiles, soft card shadows, and a gold winner emblem without adding dashboard sections.
- Winner-phase screens mount 72 stream confetti pieces and 38 Extension pieces; other phases do not mount them. CSS animations have one finite iteration. Extension polling does not retrigger the same winner version.
- Uses external CSS and static particle markup for compatibility with Twitch's CSP. No runtime graphics dependency or new backend API was added.
- Both builds and all 39 regression tests passed. A real isolated simulated game produced the saved winning fixture used for stream-display QA.
- The browser reported reduced motion; verified the stream renders 18 still confetti pieces under that preference, with readable winner text. Normal-motion falling behavior is defined by the finite CSS animation; it was not visually exercised in this reduced-motion browser.
- Verified the three-winner Extension layout at 318 × 496px: 38 confetti nodes, no horizontal overflow, and a total document height of 496px. The winner names and replay button remain visible.
- Published the Cloudflare update and uploaded the matching seven-file Twitch bundle (MD5 `3aeb80243f35e8e006e2bc14549acb57`), restoring version 0.0.1 to Hosted Test.

## Animated confetti fix — November 2, 2026
- Replaced the static reduced-motion fallback with fewer, gently falling particles following the explicit animation request. Other UI motion remains reduced.
- Confetti uses its own container height so falling distance matches both dashboard previews and the Extension. Three finite showers play on a winner transition.
- Production builds passed. In the reduced-motion browser, the first particle transform changed from y=11px to y=69px between consecutive DOM readings; computed animation was confetti-gentle, 6 seconds, three iterations.


## New-viewer authorization fix — November 2, 2026
- Corrected opaque Twitch ID validation to accept hyphens and underscores, including documented U- and A- viewer identities. Signature, channel, role, expiry, and numeric linked-user checks remain enforced.
- All 42 tests passed, including new signed-token cases and a gateway regression proving unlinked viewers can load state while voting remains forbidden until identity sharing.
- Friend-account retest remains pending after deployment.


## Welcome, automatic rounds, and custom questions — November 2, 2026

- All 50 tests passed: welcome reset, refusal during active games, auto-next deadlines/cancellation, no automatic new games, custom validation and minority rules, private library access, and restored pending alarms.
- Local integration completed a four-round custom-pack demo without any next-round commands, stopped at winners, and remained stopped after another delay. Welcome reset retained the custom library. Read-only access to the question library was denied.
- Browser verified saving a custom question, selecting My questions, maintaining the draft 15-second timer while enabling automation, starting the saved question, and the welcome presentation.
- Twitch viewer includes the welcome screen and a next-round countdown. Custom questions use the existing signed vote flow.

## Clear welcome animation — November 2, 2026
- Added three staggered glowing dots and brighter dashed rings to both welcome screens. Reduced motion uses a clearly visible opacity sequence rather than movement.
- Production builds passed. Browser inspection confirmed three dots, a running 1.2-second infinite welcome-dot-soft animation, and opacity changing from 0.278 to 0.945.


## Public source release — November 2, 2026

A separate clean source snapshot was prepared for https://github.com/nirvikpatel/minority-rules-twitch with a rewritten README, hosted environment links, setup instructions, and a generated thumbnail. Credentials and runtime files were excluded. The development test runner was updated to Vitest 4.1.12; all 50 tests passed, and npm reported zero known dependency vulnerabilities.
