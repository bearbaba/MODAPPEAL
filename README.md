# MODAPPEAL

A local moderation-appeal prototype: author appeal → moderator response → frozen evidence → **manually selected test decision** → restoration or revision → verified local publication.

**Status (2026-11-13):** Real Node.js + SQLite code, UI, and automated HTTP tests now accompany this README. This is **not** a deployed GenLayer contract or a live Discourse integration. Previous README described files that were not committed; this version corrects that distinction.

## Run locally

Install Node.js 24 or newer; there are no third-party runtime dependencies.

```bash
npm run demo
npm test
```

Open http://127.0.0.1:4100. The app binds exclusively to `127.0.0.1`, uses sample records, and stores data in `data/modappeal.sqlite`. Demo role headers are **not authentication**. `APP_MODE=live` fails closed until proper wallet and contract verification are added.

## Demonstrate

- **P100**: a benign guide is hidden. Author opens appeal; moderator responds and freezes; quote exact text and select RESTORE. Executing updates the demo board, reads the post back, and records one publication event.
- **P200**: original has an affiliate link. After ALLOW_REVISION, author submits link-free text. The new snapshot has a new SHA-256 and needs a new RESTORE decision before publishing.
- **Conflict**: modify a post after freeze with `POST /api/demo/posts/P100/change` as moderator; execution refuses.
- **Deny**: DENY never allows publishing.

Endpoints: `GET /api/state`, `POST /api/cases`, `POST /api/cases/:id/respond|freeze|decide|revision|execute`, `GET /api/cases/:id`.

Read [acceptance evidence and gaps](docs/ACCEPTANCE.md) before treating the prototype as production-ready.
