# PRD — Flaviu Workspace (workspace.flaviu.dev)

## Original Problem Statement
Personal DevOps workspace for flaviu.dev. Multiple sysadmin scripts (DNS zone lookup, IMAP mail sync between 2 addresses, cPanel file migration, etc.). Phase 1: key-based login (20-char key), elegant loading screen, then a panel/dashboard with cards for the tools. Design & layout first; functionality later. Keep credit usage low.

## Architecture
- Frontend: React 19 (CRA/craco), Tailwind, shadcn/ui, framer-motion, lucide-react.
- Backend: FastAPI, `/api` prefix. Key verified via `POST /api/auth/verify` against `WORKSPACE_KEY` in env (constant-time compare).
- Design: Swiss Minimalist light theme, Plus Jakarta Sans + JetBrains Mono.

## User Personas
- Flaviu / sysadmin needing quick access to server management utilities.

## Core Requirements (static)
- 20-char key login → loading screen → dashboard panel with tool cards.
- Tools: DNS Zone Lookup, IMAP Mail Sync, cPanel File Migration (Ready UI), + SSL Monitor, DB Dump, Script Runner (Soon).

## Implemented (2026-06)
- Key login page with live validation + server verification.
- Telemetry-style loading screen (~2.2s animated boot sequence).
- Swiss bento dashboard with 6 tool cards, session lock, masked key badge.
- Tool detail modal ("funcționalitate în curând" placeholder).
- Session persisted in sessionStorage.

## Backlog / Remaining
- P1: DNS Zone Lookup functionality (dnspython backend).
- P1: IMAP Mail Sync engine (imaplib/imapsync flow).
- P1: cPanel File Migration (cPanel API / FTP).
- P2: SSL monitor, DB dump/restore, custom script runner.
- P2: Command palette (Ctrl+K).

## Notes
- Design-only phase per user request; heavy testing agent skipped to conserve credits. Auth verified via curl + login UI screenshot.
