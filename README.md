# MODAPPEAL

A moderation appeal workspace connecting frozen policy and context to a verified publication outcome.

Author appeal → moderator response → frozen evidence → GenLayer decision → publication readback.

## Implementation status

The repository contains a runnable local workflow, responsive frontend, persistent SQLite backend, wallet-session authentication, GenLayer Intelligent Contract source, service integration code and automated tests. The local demo uses explicitly selected fixture decisions. Live operation requires deployment and credentials.

| Component | Status |
| --- | --- |
| Application and local workflow | Implemented and tested through HTTP |
| GenLayer contract | Source supplied; live deployment and consensus evidence pending |
| Wallet sign-in | Signature validation and single-use nonce tests pass |
| Discourse adapter | Implemented; external integration acceptance pending |
| Public deployment | Pending |
| Browser visual and wallet E2E | Pending; the available browser could not reach the isolated local server |

## Run the local demo

Requires Node.js 24 or newer.

```bash
npm ci
npm run build
npm run demo
```

Open `http://127.0.0.1:4100`. Demo mode binds to loopback and stores synthetic records in `data/demo.sqlite`. The role selector is available only in this mode. Decisions are manually selected fixtures and are visibly labeled throughout the interface. Demo and live databases are separate.

### Walk through a restoration

1. As **Author**, write an appeal explaining how the tutorial fits the policy.
2. Switch to **Moderator**, add a response and freeze the evidence.
3. Select the **RESTORE** test fixture and restore the post.
4. Open **Community board** to inspect the actual persisted publication.
5. For the revision branch, use a fresh case with **ALLOW_REVISION**, switch to Author, submit revised text and obtain a new frozen assessment before publishing.

## Live setup

1. Copy `.env.example` to `.env` and configure the operator wallet, service credentials and explicit wallet roster.
2. Deploy [`contracts/ModerationCourt.py`](contracts/ModerationCourt.py) on GenLayer Studionet with that operator wallet. Set `CONTRACT_ADDRESS` to the resulting address.
3. Run `npm start` and sign in with the appropriate wallet. Configure Studionet chain ID `61999` in the wallet.
4. Import a real source record using the operator account. Collect participant statements and freeze the snapshot.
5. Operator signs `open_case(key, subject, snapshot)`. After it finalizes, a participant signs `adjudicate(key)`.
6. Use **Verify final state**. The server reads `LATEST_FINAL`, checks operator binding, case identity, subject and the exact snapshot SHA-256.
7. Execute the permitted action. A fresh chain read is required before an external write, followed by service readback.

The contract deployer is the registered operator. Application statements are authenticated through wallet sessions and attested to chain by that operator. Individual statements are not separate on-chain signatures. Chain snapshots contain the supplied evidence text, so the pilot must use public, non-sensitive material.

See [acceptance and remaining work](docs/ACCEPTANCE.md) and [integration setup](docs/INTEGRATION.md).

## Architecture

- `src/` — responsive workspace, role-guided actions, wallet sign-in and GenLayer writes.
- `server/domain.mjs` — case state transitions and authorization.
- `server/store.mjs` — SQLite transactions, durable event history and fulfillment state.
- `server/chain.mjs` — finalized-state verification and contract/operator binding.
- `server/integration.mjs` — authenticated external reads, execution and reconciliation.
- `contracts/` — immutable evidence and independently assessed GenLayer decisions.
- `tests/` — state-machine, replay, authentication and HTTP workflow regressions.

Run checks with `npm run check` and `python -m py_compile contracts/*.py`.

The server requires a persistent filesystem for SQLite. Use a single application deployment with a durable disk, or migrate storage before using an ephemeral serverless host. Deployment URLs and on-chain transaction hashes will be added only after verification.
