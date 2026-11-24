# XP and leveling foundation

Status: migration 44 deployed to production with user approval. Citizen initialization, authenticated progress reads, disabled earning rules, and browser write protections verified.

## Initial behavior

Migration `20261130000044_citizen_leveling.sql` initializes every existing citizen at 0 XP and initializes new citizens in the same transaction as citizen creation. Level is derived from the configured cumulative XP thresholds, so it cannot drift from the XP total. Only Level 1 (0 XP) is configured. No earning amounts, activities, rewards, or unlocks are seeded or activated. Existing money, purchases, education, careers, and other rules are unchanged.

The home player card shows the server-confirmed level and total XP. Its progress bar uses the interval between the current and next configured levels. Until another threshold is configured, it remains empty and says “Next level coming soon”; it does not invent a target or claim the player has reached a permanent maximum. Loading or unavailable backend data is never presented as a confirmed 0 XP balance.

## Central configuration and secure access

- `xp_level_config.thresholds` is the single cumulative threshold array. Position 1 is Level 1, position 2 is Level 2, and so on. The first value must be 0, and subsequent values must strictly increase. A curve change is atomic and immediately changes derived levels; review any future rebalancing before applying it.
- `citizen_xp` stores the authoritative total. Browser roles cannot read or mutate this table directly.
- `get_my_level_progress()` accepts no citizen ID and resolves only the signed-in citizen. It returns total XP, level, the next threshold, remaining XP, and percentage. XP integers are JSON strings to preserve bigint precision.
- `xp_activity_rules` is empty. Future rules need an explicit positive amount and must be enabled before awards are possible.
- `award_citizen_xp(citizen_id, activity_key, event_key)` is executable only by the trusted service role. It obtains the amount from the rule, locks the citizen's XP row, credits XP and writes a ledger entry in one transaction. Browser and moderator accounts cannot call it, and even the service role has no direct update grant on XP totals.
- `citizen_xp_ledger` prevents duplicate awards using the unique `(citizen_id, activity_key, event_key)` combination. A replay returns the original amount and current progress without re-awarding, including after a rule is disabled or its amount changes. Distinct concurrent awards serialize on the citizen's XP row. Failed or overflowing awards leave no partial credit or ledger entry.
- `xp_level_milestones` is an empty configuration registry for future rewards and feature unlocks. It grants nothing and is not consulted by existing game rules. Future reward delivery needs its own transactional, idempotent claim implementation; future gates must be checked on the server.
- Citizen deletion cascades only that citizen's XP and XP ledger, matching the existing permanent-account-deletion behavior. Existing shared-content deletion checks remain intact.
- Future XP total changes appear in the existing owner Activity Center. Initial 0 XP setup creates no fake earned-XP activity.

No service key is included in frontend code. Existing auth and unrelated table policies are unchanged. New tables use RLS with no browser policies; only the self-read RPC is granted to authenticated clients.

## Connecting a future earning activity

After balancing and approval, configure its rule and thresholds on the trusted backend. Validate the completed activity and recipient server-side, then call `award_citizen_xp` with a stable event ID derived from the real source record. Never accept arbitrary activity completion, recipient, XP amounts, or idempotency keys directly from a browser. If the source action occurs in SQL, award in the same transaction; for external processing, use a durable retry/outbox mechanism. No earning event is connected in this release.

The returned ledger ID and before/after levels support later milestone processing. After a confirmed future award, the frontend can call `TyrannyLeveling.refresh()` to read authoritative progress. `start(citizenId)` caches the current account's initial read; no polling, realtime subscription, or local-storage XP is added. Signout and account changes clear the card and reject stale responses.

## Tests and deployment

Run `npm ci` and `npm test`. PGlite is a development-only, isolated PostgreSQL test dependency; it is not loaded by the website and needs no Docker. The database fixture models the existing citizen/auth contract and uses the actual Activity Center audit function. All example thresholds and earning amounts exist solely in the disposable test database, never in migration seeds.

Coverage includes initial/backfilled citizens, role grants and denied writes, self-only reads, invalid curves, disabled rules, exact and multiple-level crossings, retry deduplication, bigint precision, transaction rollback, audit events, deletion, loading/error UI, stale requests, and existing regression tests. Multi-session load testing and real Supabase gateway behavior are not simulated by the single-process test engine; run those in a separate staging environment before enabling earning activities.

With production approval, apply migration 44 before publishing `leveling.js`, `index.html`, `scipt.css`, and `app.js`. No Edge Function deployment is required. The migration itself changes no existing balances and awards no XP. Verify a signed-in citizen shows Level 1 / 0 XP after deployment. Keep activities and milestones empty until their rules have been approved.
