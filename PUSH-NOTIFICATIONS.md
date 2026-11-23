# Phone push notifications

The homescreen notification inbox includes an opt-in control for the current device.
On iPhone/iPad, use iOS/iPadOS 16.4 or newer, add Tyranny to the Home Screen,
open the installed app, sign in, then enable notifications. Android requires a
browser supporting Web Push. Permission must be granted by the player.

## Delivery

New game notification records queue a delivery for each subscribed device belonging
to the recipient. World announcements fan out to eligible current citizens.
Existing historical notifications are not backfilled. Associate additions remain
silent because the existing inbox does not create notifications for them.

A minute-by-minute database job invokes the web-push Edge Function. Gateway JWT
verification remains enabled, and the worker separately checks its private secret.
Device registration requires a verified user session. Browser roles cannot access
the subscription or delivery tables. Only known browser push service hosts are accepted.

Delivery uses a five-minute lease, at most six attempts, a 24-hour queue age limit,
and a one-hour provider TTL. Read notifications are skipped. Invalid/expired endpoints
(404/410) are removed. Old delivery records are cleaned after two days.
Provider acceptance does not guarantee display: device permissions, connectivity,
Focus modes, and OS behavior still apply. Tags collapse repeat alerts for the same event.

Phone previews contain no account details. Tapping opens the current signed-in
citizen's notification inbox. No authenticated responses are cached by the service worker.
Turning off removes the server subscription and unsubscribes the browser. Explicit
logout removes the binding before sign-out; session-loss cleanup unsubscribes locally.
Each citizen can register up to ten devices.

## Deployment and operations

Publish index.html, app.js, notifications.js, push-notifications.js, service-worker.js,
manifest.webmanifest, scipt.css, and the pwa-192.png / pwa-512.png icons together over
HTTPS, along with the rest of the current frontend dependencies.
Relative paths support GitHub Pages project subdirectories.

Backend migrations: 20261130000038_web_push.sql and 20261130000039_push_gateway_auth.sql.
Deploy the web-push function with gateway JWT verification enabled.
The function uses npm:web-push@3.6.7.

Secrets in Edge Functions: WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY,
WEB_PUSH_WORKER_SECRET. Vault entries: tyranny_push_worker_secret,
tyranny_push_worker_url, tyranny_push_gateway_token (the project anonymous JWT
used only for the gateway; the separate worker secret authorizes queue delivery).
Never put private keys or worker credentials in browser code or source control.
Preserve the VAPID signing key pair; rotating it requires devices to subscribe again.

Monitor cron.job / cron.job_run_details, net._http_response, and web_push_deliveries
(attempts, last_status, delivered_at) from trusted administrative access.
Browser endpoints and encryption keys are sensitive; do not include them in logs.

## Verification

Rollback database checks cover private recipients, world events, account rebinding,
queue leases, and denied browser access. Local checks cover explicit permission,
subscription registration/removal, generic previews, and scoped notification clicks.
The deployed worker has been invoked successfully with an empty queue.

Final device acceptance requires publishing the frontend, subscribing a real device,
then triggering a normal account event or a deliberately approved world announcement.
Verify background delivery, inbox opening, and disabling on both iPhone and Android.
No test announcement has been broadcast.
