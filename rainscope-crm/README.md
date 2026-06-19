# Rainscope CRM

A lightweight CRM starter for Rainscope customer, opportunity, and activity tracking.

## What is included

- Node.js + TypeScript
- Express API and static browser UI
- SQLite persistence with automatic schema setup
- Customer records with lifecycle status, deal value, next follow-up, and notes
- Activity timeline entries for calls, emails, meetings, notes, and tasks
- Vitest coverage for the core customer and activity API flows

## Quick start

```sh
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:3850>.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3850` | HTTP port for the CRM app |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_PATH` | `./data/rainscope-crm.sqlite` | SQLite database location |

## Development checks

```sh
npm run typecheck
npm test
npm run check
```

## Suggested GitHub setup

This folder is structured as a standalone repository seed. To publish it as a new GitHub repository from a local machine with write access:

```sh
cd rainscope-crm
git init
git add .
git commit -m "Initial Rainscope CRM scaffold"
gh repo create Rainscopefilmworks/rainscope-crm --private --source=. --remote=origin --push
```

Use `--public` instead of `--private` if the CRM should be public.
