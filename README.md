# Rainscope Open Sign (rssign)

A self-hosted, Rainscope-branded open/closed sign for an office tablet — with automatic business hours and Discord remote control.

## Overview

| Surface | Who uses it | Purpose |
|---------|-------------|---------|
| **Kiosk display** | Android tablet (fullscreen browser) | Branded OPEN / CLOSED sign |
| **Discord bot** | Team on phones, anywhere | Remote override + schedule management |
| **Local admin page** | Office PC browser (backup) | Same controls if Discord is unavailable |

The tablet loads a page from your office LAN (`http://OFFICE_PC_IP:3847`). No inbound internet exposure is required — the Discord bot connects outbound to Discord.

## Status

**Planning phase.** See [PLAN.md](./PLAN.md) for the full implementation plan.

## Stack (planned)

- Node.js + TypeScript
- Express (kiosk page, admin page, API)
- discord.js (slash commands)
- SQLite (status, hours, overrides)
- systemd (auto-start on Linux office PC)

## Quick links

- [Full plan](./PLAN.md)
- [Rainscope](https://rainscope.ca)
