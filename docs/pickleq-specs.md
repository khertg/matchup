# PickleQ — App Specifications

**URL:** https://pickleq.app
**Tagline:** Free Pickleball Open Play Manager & Court Rotation Tool
**Version:** 1.1

---

## Overview

PickleQ is a free, browser-based open play manager for pickleball. It handles court rotation, queue management, matchmaking, and live leaderboards. No app download is required — it runs in any modern web browser on phones, tablets, or computers.

### Target Users
- Pickleball club staff and organizers
- Recreation center coordinators
- Casual weekend group organizers
- Players who want live queue and standings visibility

---

## How It Works

1. **Setup** — Staff creates a session: location name, number of courts (1–15), game mode (Doubles/Singles), matchmaking mode
2. **Check-in** — Players are checked in on arrival; queue order is determined by check-in timestamp
3. **Matchmaking** — System stages balanced matches and announces them (optionally via text-to-speech)
4. **Results** — Staff records game results; players rotate back into the queue
5. **End of Session** — Leaderboard displayed, shareable player stats cards generated, lifetime stats updated (if cloud sync is enabled)

Players follow the live queue, up-next matches, and standings from their own phones by scanning a QR code or visiting `pickleq.app/club/[your-club]`.

---

## Features

### Session & Court Management
- 1 to 15 courts per session
- Doubles mode (4 players/court) and Singles mode (2 players/court)
- Queue management: first-come-first-served with estimated wait times
- 10-second undo window for correcting erroneous results
- Mid-game player replacement
- Check-out and check-in for player breaks
- Partner locking for couples or designated pairs

### Matchmaking Modes (Doubles)
| Mode | Description |
|---|---|
| Auto-balanced | Even teams based on skill ratings |
| Skill-separated | Players matched by similar skill level |
| Winners vs. Losers | Ladder-style; winners play winners |
| Mixed Doubles | Gender-balanced team pairing |

### Player Management
- Six-level skill rating system: Beginner → Intermediate → Advanced → Expert (and levels in between)
- Auto-complete for returning players
- Reclub event import: paste participant lists directly from Reclub events
- Saved club roster for repeat sessions
- Late arrivals automatically placed in queue

### Live Viewing & Sharing
- Staff shares a QR code or URL so players can watch from their own devices
- Live display shows:
  - Active court matchups
  - Queue positions and estimated wait times
  - Real-time standings
  - "Up Next" groups
- Browser push notifications for queue alerts
- Voice announcements via text-to-speech (new matches, winners, end-of-session top 3)
  - Designed to connect to a Bluetooth speaker

### Statistics & Leaderboards
- Per-player tracking: Games Played, Wins, Losses, Win Rate
- Session leaderboards ranked by wins; tiebreakers: opponent strength, win rate
- All-time / lifetime leaderboards (requires cloud sync; configurable minimum games: 1–50)
- Medal rankings: Gold, Silver, Bronze
- Shareable stats cards formatted for Instagram, Facebook, and WhatsApp
- Stats cards downloadable as images

### Cloud & Club Features
- Club login is required when a cloud is configured: staff create a club (auto-generated URL, password of at least 8 characters for new passwords) or log in before using the app; the login is kept on the device, so the app keeps working offline. Without a cloud the app runs entirely on the device
- Cloud sync for multi-device staff access and lifetime stats
- Self-serve password recovery
- Public leaderboard accessible anytime post-session

### Offline Capability
- Full offline operation: all data saved locally on the device
- Auto-sync resumes when connectivity is restored (for cloud accounts)

---

## Pricing

| Tier | Price | Details |
|---|---|---|
| **Free (Core)** | Free forever | All core open play features for casual and club sessions |
| **Venue Pro** *(Early Access)* | ~₱1,499 / 3 months | For clubs using 5+ courts; includes DUPR score exports and Kiosk Mode |
| **Tournament Mode** | Separate pass *(TBD)* | Fixed-team doubles: pool play, round robin, playoffs, live standings, public results |

> Note: Self-serve tools only. Live event operations staffing, custom formats, and dispute handling are not included in any tier.

---

## Tech Stack

| Attribute | Detail |
|---|---|
| Delivery | Web application (Single Page App) |
| Compatible browsers | Chrome, Safari, Firefox |
| Platform | Device-agnostic: phones, tablets, computers |
| Data storage | Local browser storage (default); optional cloud sync |
| Voice announcements | Browser Text-to-Speech API |
| Session sharing | QR code generation + shareable URL |
| Download required | None |

---

## Integrations

| Integration | Type | Details |
|---|---|---|
| **Reclub** | Import | Paste participant lists from Reclub events directly into PickleQ |
| **DUPR** (Dynamic Universal Pickleball Rating) | Export | Score export for DUPR rating updates — Venue Pro tier only |

---

## Venue Pro Features

- Management of 5+ courts per session
- DUPR-ready score exports
- Kiosk Mode for faster self-serve player check-in
- Targeted at larger, professional club operations

---

## Tournament Mode (Planned)

- Self-managed pass for fixed-team doubles events
- Pool play, round robin, and playoffs
- Live standings and public results page
- Does not include live event staffing or custom format support

---

## Limitations

The following are explicitly out of scope for all tiers:
- Live event operations staffing
- Custom tournament formats
- Dispute handling

---

## Support & Social

| Channel | Link |
|---|---|
| Facebook | https://www.facebook.com/pickleqapp/ |
| Instagram | https://www.instagram.com/pickleq.app/ |
| Support | Via Facebook Messenger |
