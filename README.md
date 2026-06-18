# Rainscope Open Sign (rssign)

A self-hosted, Rainscope-branded open/closed sign for an office tablet — with automatic business hours and Discord remote control.

## Overview

| Surface | Who uses it | Purpose |
|---------|-------------|---------|
| **Kiosk display** | Android tablet (fullscreen browser) | Branded OPEN / CLOSED sign |
| **Discord bot** | Team on phones, anywhere | Remote override + schedule management |
| **Local admin page** | Office PC browser (backup) | Same controls if Discord is unavailable |

The tablet loads a page from your office LAN (`http://OFFICE_PC_IP:3847`). No inbound internet exposure is required — the Discord bot connects outbound to Discord.

## Stack

- Node.js + TypeScript
- Express (kiosk page, admin page, API)
- discord.js (slash commands)
- SQLite (status, hours, overrides)
- systemd (auto-start on Linux office PC)

## Quick start

```sh
npm install
cp .env.example .env
npm run dev
```

Open:

- Kiosk display: <http://localhost:3847/display>
- Local admin: <http://localhost:3847/admin>
- Status API: <http://localhost:3847/api/status>

The admin page requires `ADMIN_PASSWORD` from `.env` for write actions.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3847` | HTTP port for the LAN web app |
| `HOST` | `0.0.0.0` | Bind address for the office PC |
| `DATABASE_PATH` | `./data/rssign.sqlite` | SQLite file path |
| `TIMEZONE` | `America/Vancouver` | Schedule timezone |
| `ADMIN_PASSWORD` | unset | Required for local admin write actions |
| `DISCORD_TOKEN` | unset | Enables the Discord bot when present |
| `DISCORD_CLIENT_ID` | unset | Required for slash command registration |
| `DISCORD_GUILD_ID` | unset | Optional guild-scoped command registration |
| `DISCORD_ALLOWED_ROLE_ID` | unset | Restricts Discord commands to the Rainscope role |

Default weekly hours are seeded from `config/hours.default.json` on first run.

## Discord setup

1. Create a Discord application and bot at <https://discord.com/developers>.
2. Copy the bot token into `.env` as `DISCORD_TOKEN`.
3. Set `DISCORD_CLIENT_ID` and, for faster command updates, `DISCORD_GUILD_ID`.
4. Set `DISCORD_ALLOWED_ROLE_ID` to the **Rainscope** role ID (members with that role can control the sign).
5. Register slash commands:

   ```sh
   npm run register-commands
   ```

Available commands:

- `/status`
- `/open`
- `/closed`
- `/message text:"Back at 2pm"`
- `/back-in time:"2:30 PM"` or `/back-in time:"30 minutes"`
- `/auto`
- `/hours`
- `/set-hours day:monday open:09:00 close:17:00`

## Tablet kiosk setup

1. Assign the Linux office PC a static LAN IP or DHCP reservation.
2. Connect the Android tablet to office Wi-Fi.
3. Install Fully Kiosk Browser or use Chrome fullscreen.
4. Set the start URL to `http://<LINUX_PC_LAN_IP>:3847/display`.
5. Enable keep-screen-on and auto-relaunch options.

The display polls `/api/status` every 5 seconds. If the office PC becomes unreachable,
it shows the last cached status with a connection banner.

## Linux service

Install the systemd unit from `deploy/rssign.service` after cloning to `/opt/rssign`:

```sh
sudo cp deploy/rssign.service /etc/systemd/system/rssign.service
sudo systemctl daemon-reload
sudo systemctl enable --now rssign
curl http://localhost:3847/api/status
```

## Development checks

```sh
npm run typecheck
npm test
npm run check
```

## Quick links

- [Full plan](./PLAN.md)
- [Rainscope](https://rainscope.ca)
