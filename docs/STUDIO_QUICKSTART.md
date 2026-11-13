# GenLayer Studio smoke test for MODAPPEAL

**Network:** Studionet (https://studio.genlayer.com), chain ID 61999.

1. Open **Contracts**, create a new Python Intelligent Contract, and paste the complete `contracts/ModerationCourt.py` from GitHub. Deploy from your selected funded Studio account.
2. Wait for finalized deployment with successful execution, then copy contract address. The deployer is the only permitted caller for `open_case` and `adjudicate`.
3. Invoke `open_case` (write) using the EXACT four arguments below. **This digest is SHA-256 of the synthetic public brief for smoke testing only, not a real persisted case snapshot.** 
4. After successful finalization, invoke `adjudicate` (write) with the same `case_id`. LLM validators independently assess the outcome.
5. Invoke `get_case` (view) with the same `case_id`. Check returned `snapshot_sha256` and the JSON `final` field. The expected outcome is **RESTORE**, but this is **not guaranteed**: LLM consensus can vary; inspect result and execution logs.

## Test arguments

`case_id`
```text
MOD-STUDIO-001
```

`snapshot_sha256`
```text
e23e3a624df7cff8e40f5081be12ee2d273b28107ebdd038c8b3d011228fdcfd
```

`public_brief`
```text
Post: How to install a self-custody wallet without exposing your recovery phrase. Moderator hid it as suspicious. Author says it is a safety tutorial. Moderator review confirms it contains no malicious instructions.
```

`rubric`
```text
P1: Educational technical guides without harmful instructions can be restored; posts containing affiliate links must be revised before publication.
```

The public brief contains no personal data. Do NOT put real private appeals, shipping details or sensitive merchant records on-chain.

## Important limits

- `adjudicate` is a nondeterministic consensus transaction and can fail/revert; inspect logs before retrying.
- The contract verifies citation substrings, but semantic quality is only as strong as the validator prompt and evidence.
- The demo Node server is not wired to read these on-chain results yet. An on-chain verdict alone does not unhide a Discourse post or create a WooCommerce order.
- For a **real** case, hash the exact frozen case snapshot from the backend and supply only a reviewed redacted public brief, then verify the digest equality when executing an external action.
- Do not call the same write twice blindly after network timeout; first read case state and check transaction outcome.
