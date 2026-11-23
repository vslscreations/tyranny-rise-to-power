const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const source = app.slice(app.indexOf('function isModeratorDevOverrideEnabled()'), app.indexOf('function renderNotificationCenter()'));

function fixture(results, signedIn = true) {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: signedIn ? { user: { id: 'test-user' } } : null } }) },
    rpc(name) {
      calls.push(name);
      // Match Supabase's PostgREST builder: awaitable, but no .catch method.
      return { then(resolve, reject) {
        const value = results[name];
        return (value instanceof Error ? Promise.reject(value) : Promise.resolve(value)).then(resolve, reject);
      } };
    },
  };
  const context = {
    authBootstrapEpoch: 0, moderatorAppState: { visible: false },
    window: { location: { protocol: 'https:' } }, localStorage: { getItem: () => null },
    getAuthClient: () => client, renderAppGrid() {}, console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, calls };
}

for (const [label, moderator, owner, expected] of [
  ['moderator', true, false, true],
  ['owner', false, true, true],
  ['regular citizen', false, false, false],
]) {
  test(`${label} visibility with actual query-builder interface`, async () => {
    const { context, calls } = fixture({ can_access_moderator_app: { data: moderator }, is_owner_for_authenticated_user: { data: owner } });
    assert.equal(await context.refreshModeratorAppVisibility(), expected);
    assert.equal(context.moderatorAppState.visible, expected);
    assert.equal(calls.length, 2);
    assert(!calls.includes('get-moneytree-moderation-queue'));
  });
}

test('an owner lookup failure does not hide a confirmed moderator', async () => {
  const { context } = fixture({ can_access_moderator_app: { data: true }, is_owner_for_authenticated_user: new Error('offline') });
  assert.equal(await context.refreshModeratorAppVisibility(), true);
});

test('an errored access response cannot grant visibility', async () => {
  const { context } = fixture({ can_access_moderator_app: { data: true, error: { message: 'failed' } }, is_owner_for_authenticated_user: { data: false } });
  assert.equal(await context.refreshModeratorAppVisibility(), false);
});

test('signed-out visitors do not query or see the Moderator app', async () => {
  const { context, calls } = fixture({}, false);
  assert.equal(await context.refreshModeratorAppVisibility(), false);
  assert.equal(calls.length, 0);
});

test('an account change discards an old access response', async () => {
  const { context } = fixture({ can_access_moderator_app: { data: true }, is_owner_for_authenticated_user: { data: false } });
  const pending = context.refreshModeratorAppVisibility();
  context.authBootstrapEpoch++;
  assert.equal(await pending, false);
  assert.equal(context.moderatorAppState.visible, false);
});
