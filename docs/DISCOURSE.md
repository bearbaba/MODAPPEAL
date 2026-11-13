# Discourse adapter — integration boundary

The standalone, server-side `integrations/discourse.mjs` implements authenticated HTTPS `GET /posts/:id.json`, `PUT /posts/:id/unhide.json`, `PUT /posts/:id/recover.json`, and (for revision) `PUT /posts/:id.json`.

It checks current raw text + revision against the frozen source, verifies edits and rereads visibility. It refuses to call publication successful if Discourse still shows hidden/deleted or unexpected content. The fixture demo **does not call this adapter**.

**Pilot blockers:** authenticate real user/operator; verify finalized GenLayer case digest; register permitted automatic moderation actions; configure an isolated Discourse test site and credentials; handle read-back after timeout, 403 permissions and version conflicts; verify public visibility using an anonymous read of the topic. Discourse may not offer atomic compare-and-swap unhide, so there is a race between preflight and write. Manual reconciliation is required if state changes mid-operation. Do not retry blindly.
