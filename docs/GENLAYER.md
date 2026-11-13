# GenLayer contract source — not yet deployed

This repository includes `contracts/ModerationCourt.py`, using the current `from genlayer import *` / `gl.Contract` pattern and a custom `gl.vm.run_nondet_unsafe` leader/validator pair. A validator independently runs the same LLM assessment and compares **decision outcome** while checking the leader's quote and cited clause against the original public brief and rubric.

The operator registers a unique case and **SHA-256 hex digest** of the frozen off-chain snapshot. The full snapshot remains in SQLite; only a specifically approved **public, non-sensitive summary** belongs on chain. Use a new case ID and digest after any revision. `get_case` reads the bound digest and final outcome after transaction finalization.

**Important verification gaps:** `python -m py_compile` proves syntax only. This source has NOT been executed through GenVM schema validation, contract deployment, independent validator consensus, or finalized blockchain readback. It is NOT connected to the current demo HTTP API, which continues to use explicitly labeled fixture decisions. Before external actions, the backend must verify the chain's operator, contract, case ID, snapshot SHA, finality and permitted outcome. Never use a decision from a different hash.
