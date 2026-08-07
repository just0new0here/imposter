# Imposter Party

A mobile-first multiplayer Imposter game. Everyone joins the same room from their own phone using a 5-character room code.

## Features
- Shared live rooms using Server-Sent Events (no third-party backend package)
- 3–16 players
- Classic Word mode: everyone gets the same word except the Imposter; the Imposter receives a one-word hint
- Prompt Mix mode: Imposter receives a similar-but-different question
- Categories
- Private role/prompt reveal on each phone
- Voting and result reveal
- Shared cumulative scoreboard shown to every player after results and between rounds
- iOS/Android-safe leave-session button using sendBeacon/keepalive with automatic host handoff
- Reconnects after a page refresh
- Invite links prefill the room code
- No accounts, API keys, or npm dependencies

## Run locally
```bash
npm start
```
Then open http://localhost:3000

## Deploy on Render
1. Put this folder in a GitHub repository.
2. In Render, create a **Web Service** from that repo.
3. Environment: Node.
4. Build command: leave blank or use `npm install`.
5. Start command: `npm start`.
6. Deploy and share the Render URL.

### Important hosting note
Rooms are stored in server memory. They are ideal for live party sessions, but a room disappears if the server restarts. For restart-safe rooms, Redis/database storage can be added later.

## v1.3 changes
- Reworked Prompt Mix pairs to remove obvious best/worst and direct-opposite wording.
- Added one-word Classic hints tied to the actual secret word.
- Made the cumulative leaderboard visible to everyone on the results/between-round screens.
- Replaced the native leave confirmation dialog with a two-tap confirmation and reliable iOS beacon request.
