# XP and leveling foundation

Status: migrations 44 and 45 are deployed with user approval. Production checks verified all 12 activity triggers, the 100-XP interval, the $100 reward, deferred settlement, browser write protections, and authenticated progress reads. No test XP or money was awarded during deployment verification.

## Activity earning and level-up payments (migration 45)

The approved rules are 1 XP per completed gameplay activity, 100 XP for each new level, and $100 once per newly reached level, starting at Level 2. For example, 100 total XP is Level 2, 200 is Level 3, and 300 is Level 4. The home card displays the configured next-level cash offer. Migration 45 does not backfill old actions or grant cash on activation.

Server triggers connect these 12 activity types: approved MoneyTree contributions (including challenges/replies), social posts, comments, reactions, follows, associates, private messages, public chat messages, poll votes, completed Store purchases, daily claims, and settled casino rounds. Each source uses a stable server-derived event key. Re-approval, re-adding the same reaction/follow/associate, repeating a vote/claim, and request retries do not earn twice. Pending/rejected submissions, page views, notification reads, edits, deleted content, and moderator administration earn no XP. Existing action eligibility and moderation stay in place.

The central `xp_level_config.xp_per_level=100` selects a linear progression curve; setting it to NULL restores the custom cumulative threshold array. The `level_up_cash` milestone definition contains the $100 reward. The new `citizen_level_rewards` primary key `(citizen_id, level)` guarantees each level pays once, even if the curve is later changed and the same level is reached again. A single award crossing multiple levels pays each newly reached, unpaid level. Changing the curve alone never retroactively grants money.

Awards lock the wallet before the XP record, matching existing spending operations. A deferred ledger trigger pays rewards at transaction completion, after the originating action has settled its balance. XP, source action, reward history, money, and notification all commit or roll back together. The balance guard retains its existing checks and adds a narrowly scoped server-only level-reward authorization flag. No browser role can write rewards, credit itself, or call the credit trigger.

The existing private balance channel carries `xp_changed` signals after commit. Progress refreshes on awards and reconnect, with a catch-up read if XP changes during a request. Money and notification badges refresh when a level reward is paid. No additional realtime connection or healthy-connection polling is added. Each payment creates an account notification and an owner Activity Center event. Current wallet displays include the payment; purchase/casino receipts continue to describe their original transaction.

## Foundation behavior (migration 44)

Migration `20261130000044_citizen_leveling.sql` initializes every existing citizen at 0 XP and initializes new citizens in the same transaction as citizen creation. Level is derived from the configured cumulative XP thresholds, so it cannot drift from the XP total. Only Level 1 (0 XP) is configured. No earning amounts, activities, rewards, or unlocks are seeded or activated. Existing money, purchases, education, careers, and other rules are unchanged.

The home player card shows the server-confirmed level and total XP. Its progress bar uses the interval between the current and next configured levels. With migration 44 alone, it says “Next level coming soon.” Migration 45 supplies the approved 100-XP interval and reward offer. Loading or unavailable backend data is never presented as a confirmed 0 XP balance.

## Central configuration and secure access

- `xp_level_config.thresholds` is the single cumulative threshold array. Position 1 is Level 1, position 2 is Level 2, and so on. The first value must be 0, and subsequent values must strictly increase. A curve change is atomic and immediately changes derived levels; review any future rebalancing before applying it.
- `citizen_xp` stores the authoritative total. Browser roles cannot read or mutate this table directly.
- `get_my_level_progress()` accepts no citizen ID and resolves only the signed-in citizen. It returns total XP, level, the next threshold, remaining XP, and percentage. XP integers are JSON strings to preserve bigint precision.
- `xp_activity_rules` is empty in migration 44. Migration 45 enables the 12 listed rules at 1 XP each. Rules can be disabled without preventing their underlying game actions.
- `award_citizen_xp(citizen_id, activity_key, event_key)` is executable only by the trusted service role. It obtains the amount from the rule, locks the citizen's XP row, credits XP and writes a ledger entry in one transaction. Browser and moderator accounts cannot call it, and even the service role has no direct update grant on XP totals.
- `citizen_xp_ledger` prevents duplicate awards using the unique `(citizen_id, activity_key, event_key)` combination. A replay returns the original amount and current progress without re-awarding, including after a rule is disabled or its amount changes. Distinct concurrent awards serialize on the citizen's XP row. Failed or overflowing awards leave no partial credit or ledger entry.
- `xp_level_milestones` starts empty in migration 44. Migration 45 implements only the `level_up_cash` reward. Future rewards need their own transactional, idempotent claim implementation; future feature gates must be checked on the server.
- Citizen deletion cascades only that citizen's XP and XP ledger, matching the existing permanent-account-deletion behavior. Existing shared-content deletion checks remain intact.
- Future XP total changes appear in the existing owner Activity Center. Initial 0 XP setup creates no fake earned-XP activity.

No service key is included in frontend code. Existing auth and unrelated table policies are unchanged. New tables use RLS with no browser policies; only the self-read RPC is granted to authenticated clients.

## Connecting a future earning activity

For additional activities beyond migration 45, configure the approved rule on the trusted backend. Validate the completed activity and recipient server-side, then call `award_citizen_xp` with a stable event ID derived from the real source record. Never accept arbitrary activity completion, recipient, XP amounts, or idempotency keys directly from a browser. If the source action occurs in SQL, award in the same transaction; for external processing, use a durable retry/outbox mechanism.

The returned ledger ID and before/after levels support milestone processing. The frontend can call `TyrannyLeveling.invalidate()` after a confirmed award to read authoritative progress with an in-flight catch-up read, or `refresh()` for a normal read. `start(citizenId)` caches the current account's initial read. Signout and account changes clear the card and reject stale responses. Migration 45 reuses the existing private channel as described above; XP is never stored in local storage.

## Tests and deployment

Run `npm ci` and `npm test`. PGlite is a development-only, isolated PostgreSQL test dependency; it is not loaded by the website and needs no Docker. The database fixture models the existing citizen/auth contract and uses the actual Activity Center audit function. All example thresholds and earning amounts exist solely in the disposable test database, never in migration seeds.

Coverage includes initial/backfilled citizens, role grants and denied writes, self-only reads, invalid curves, disabled rules, all 12 activity sources, exact and multiple-level crossings, exactly-once cash rewards, retry deduplication, bigint precision, reward failure rollback, settlement ordering, audit events, deletion, loading/error UI, stale requests, live signal handling, and existing regression tests. Multi-session load testing and real Supabase gateway behavior are not simulated by the single-process test engine.

Migrations 44 and 45 have been applied. Publish the updated `leveling.js` and `live-balance.js` through the normal website release process to deliver the cash offer and live progress refresh behavior. No Edge Function deployment is required. Deployment itself awards no XP or money. A signed-in citizen can read their current level, progress toward the next 100 XP, and the $100 reward offer. New completed actions earn XP automatically.
