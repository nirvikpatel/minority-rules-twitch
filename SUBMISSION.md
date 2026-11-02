# Minority Rules — submission kit

## Short description

Go against the crowd. Minority Rules turns Twitch chat into a live survival game where the less popular answer is the only safe one.

## Project description

Every round puts two options on stream. Viewers click A or B in a custom Twitch Extension, change their minds until time runs out, and wait for the hidden vote split to be revealed. The majority is eliminated. The minority survives. When only one to three players remain, they take the crown.

The streamer gets a simple control panel, themed question packs, and a separate OBS display with neon answer cards, countdowns, suspenseful reveals, funny ghost-vote reactions, and winner names. A 100-player demo crowd makes the game easy to try without an existing audience.

Minority Rules verifies each viewer's signed Twitch Extension identity, uses Cloudflare Workers for its application gateway, and a SQLite-backed Durable Object to own game state and voting deadlines. Refreshing the panel does not reset a round. Individual selections stay private; viewers see only their own choice, and aggregate totals appear together during reveal. The Extension replaces chat commands and native Polls while preserving per-player survival rules.

Codex helped turn the rules into a state machine, create the React interface and question packs, implement Cloudflare hosting and Twitch authentication, and develop automated tests. During the demo, show concrete code or test evidence from this build rather than making claims about features that have not been verified live.

## Demo outline — target 2 minutes 45 seconds

- **0:00–0:15:** “What if winning a Twitch poll got you eliminated?” Show the title and explain the minority rule.
- **0:15–0:35:** Show the broadcaster panel, question packs, timer, Twitch Extension on the channel, and the OBS display.
- **0:35–1:15:** Run a 15-second round with allowlisted real Twitch test viewers. Show them sharing identity, clicking a vote, changing it, hidden counts, and the dramatic reveal. Label the unreleased Extension as Hosted Test.
- **1:15–1:45:** Continue a prepared small game to the winner screen. Show a ghost attempting to vote if possible. Avoid presenting simulated users as real chatters.
- **1:45–2:10:** Switch to the labeled demo and show the 100-player crowd. Explain round-1 enrollment and nonvoter elimination.
- **2:10–2:35:** Show the Codex chat and engine/security tests. Point to server-owned deadlines and verified per-viewer votes.
- **2:35–2:45:** End on the winner screen and the deployed URL.

## Fill before submitting

- Deployed application URL: https://minority-rules.nirvik.workers.dev
- Source repository URL: https://github.com/nirvikpatel/minority-rules-twitch (public source repository).
- Public YouTube demo URL: record the working Twitch integration and upload the video.
- Codex session ID: copy the actual session ID of the main build chat from Codex.
- Confirm the repository includes all source, `package-lock.json`, setup instructions, and `.dev.vars.example`, with no secrets.

Hackathon source: https://twitchcon-codex.devpost.com/
