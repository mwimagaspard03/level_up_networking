import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canChangeRole, canInviteRole, canResendInvitation } from '../src/lib/auth/roles.ts';
import { safeInternalPath } from '../src/lib/auth/redirect.ts';

const root = new URL('../', import.meta.url);
const source = async (path) => readFile(new URL(path, root), 'utf8');

test('OWNER/ADMIN/STUDENT permissions follow the approved matrix', () => {
  assert.equal(canInviteRole('OWNER', 'STUDENT'), true);
  assert.equal(canInviteRole('ADMIN', 'STUDENT'), true);
  assert.equal(canInviteRole('STUDENT', 'STUDENT'), false);
  assert.equal(canInviteRole(null, 'STUDENT'), false);
  assert.equal(canInviteRole('OWNER', 'ADMIN'), true);
  assert.equal(canInviteRole('ADMIN', 'ADMIN'), false);
  assert.equal(canInviteRole('OWNER', 'OWNER'), false, 'ordinary invitations never create OWNER');
  assert.equal(canResendInvitation('OWNER', 'STUDENT'), true);
  assert.equal(canResendInvitation('OWNER', 'ADMIN'), true);
  assert.equal(canResendInvitation('OWNER', 'OWNER'), false);
  assert.equal(canResendInvitation('ADMIN', 'STUDENT'), true);
  assert.equal(canResendInvitation('ADMIN', 'ADMIN'), false);
  assert.equal(canResendInvitation('STUDENT', 'STUDENT'), false);
  assert.equal(canChangeRole('OWNER', 'OWNER'), true, 'OWNER may promote another profile to OWNER');
  assert.equal(canChangeRole('OWNER', 'ADMIN'), true);
  assert.equal(canChangeRole('OWNER', 'STUDENT'), true);
  assert.equal(canChangeRole('ADMIN', 'OWNER'), false);
  assert.equal(canChangeRole('ADMIN', 'STUDENT'), false);
  assert.equal(canChangeRole('STUDENT', 'ADMIN'), false);
});

test('internal redirect validator rejects external, protocol-relative and malformed paths', () => {
  assert.equal(safeInternalPath('/dashboard?tab=courses'), '/dashboard?tab=courses');
  assert.equal(safeInternalPath('/auth/complete-account#password'), '/auth/complete-account#password');
  assert.equal(safeInternalPath('https://evil.example/'), '/dashboard');
  assert.equal(safeInternalPath('//evil.example/'), '/dashboard');
  assert.equal(safeInternalPath('/\\\\evil.example/'), '/dashboard');
  assert.equal(safeInternalPath('/%0d%0aLocation:evil'), '/%0d%0aLocation:evil');
  assert.equal(safeInternalPath('/safe', '/courses'), '/safe');
  assert.equal(safeInternalPath('', '/courses'), '/courses');
});

test('login handler uses password sign-in, same-origin validation and generic credential failure', async () => {
  const login = await source('app/api/auth/login/route.ts');
  assert.match(login, /hasSameOrigin\(request\)/);
  assert.match(login, /readJsonObject\(request\)/);
  assert.match(login, /signInWithPassword\(/);
  assert.match(login, /E-mail ou mot de passe incorrect/);
  assert.doesNotMatch(login, /signUp\(/);
  assert.match(login, /Cache-Control/);
});

test('invitation handler rejects ordinary OWNER creation and promotes ADMIN through caller RPC', async () => {
  const invitation = await source('app/api/admin/invitations/route.ts');
  assert.match(invitation, /canInviteRole\(identity\.profile\.role, requestedRole\)/);
  assert.match(invitation, /requestedRole !== 'STUDENT' && requestedRole !== 'ADMIN'/);
  assert.match(invitation, /admin\.auth\.admin\.inviteUserByEmail/);
  assert.match(invitation, /identity\.client\.rpc\('owner_set_profile_role'/);
  assert.doesNotMatch(invitation, /admin\.rpc\(/);
  assert.match(invitation, /promotion_failed/);
});

test('role endpoint accepts OWNER promotion but relies on OWNER-only predicate and public wrapper', async () => {
  const roleRoute = await source('app/api/admin/profiles/role/route.ts');
  assert.match(roleRoute, /canChangeRole\(identity\.profile\.role, body\.newRole\)/);
  assert.match(roleRoute, /identity\.client\.rpc\('owner_set_profile_role'/);
  assert.doesNotMatch(roleRoute, /\.from\(['"]profiles['"]\)\s*\.update\([^)]*role/s);
});

test('untrusted requests and protected routes perform independent server authorization', async () => {
  const resend = await source('app/api/admin/invitations/resend/route.ts');
  const audit = await source('app/api/admin/audit-logs/route.ts');
  const recovery = await source('app/api/auth/forgot-password/route.ts');
  assert.match(resend, /hasSameOrigin\(request\)/);
  assert.match(resend, /getRequestIdentity\(\)/);
  assert.match(resend, /canResendInvitation\(/);
  assert.match(audit, /identity\.profile\.role !== 'OWNER'/);
  assert.match(recovery, /hasSameOrigin\(request\)/);
  assert.match(recovery, /genericMessage/);
  assert.match(recovery, /password_recovery_requested/);
});

test('server-only Admin client and secret are absent from client components and static browser bundles', async () => {
  const clientFiles = [
    'src/components/auth/LoginForm.tsx',
    'src/components/auth/ForgotPasswordForm.tsx',
    'src/components/auth/PasswordUpdateForm.tsx',
    'src/lib/supabase/browser.ts',
  ];
  for (const file of clientFiles) {
    const content = await source(file);
    assert.doesNotMatch(content, /SUPABASE_SECRET_KEY|createSupabaseAdminClient|inviteUserByEmail/);
  }
  const admin = await source('src/lib/supabase/admin.ts');
  assert.match(admin, /^import ['"]server-only['"]/m);
  assert.match(admin, /process\.env\.SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(admin, /NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
});

test('password change separates authenticated account, recovery and invitation flows', async () => {
  const update = await source('app/api/auth/update-password/route.ts');
  const callback = await source('app/auth/callback/route.ts');
  const flow = await source('src/lib/auth/password-flow.ts');
  const recoveryPage = await source('app/reset-password/page.tsx');
  const invitationPage = await source('app/auth/complete-account/page.tsx');
  const accountPage = await source('app/account/security/page.tsx');
  const dashboard = await source('app/dashboard/page.tsx');
  const form = await source('src/components/auth/PasswordUpdateForm.tsx');

  assert.match(update, /hasSameOrigin\(request\)/);
  assert.match(update, /getClaims\(\)/);
  assert.match(update, /body\.flow !== 'account'.*body\.flow !== 'recovery'.*body\.flow !== 'invitation'/s);
  assert.match(update, /verifyPasswordFlowToken\(flowToken, flow, subject\)/);
  assert.match(update, /updateUser\(\{ password: body\.password \}\)/);
  assert.match(callback, /createPasswordFlowToken\(flowIntent, subject\)/);
  assert.match(callback, /flowIntent === 'recovery'[\s\S]*flowIntent === 'invitation'/);
  assert.match(flow, /createHmac\('sha256'/);
  assert.match(flow, /timingSafeEqual\(/);
  assert.match(flow, /FLOW_TTL_SECONDS = 30 \* 60/);
  assert.match(recoveryPage, /verifyPasswordFlowToken\(flowToken, 'recovery', subject\)/);
  assert.match(invitationPage, /verifyPasswordFlowToken\(flowToken, 'invitation', profile\.id\)/);
  assert.match(accountPage, /getRequestIdentity\(\)/);
  assert.match(accountPage, /PasswordUpdateForm flow="account"/);
  assert.match(dashboard, /href="\/account\/security"/);
  assert.match(form, /JSON\.stringify\(\{ password, flow \}\)/);
});

test('OWNER bootstrap serializes the first promotion and verifies UUID plus confirmed identity', async () => {
  const bootstrap = await source('docs/OWNER_BOOTSTRAP.sql');
  assert.match(bootstrap, /pg_advisory_xact_lock\(20261119000100::bigint\)/);
  assert.match(bootstrap, /v_owner_id uuid/);
  assert.match(bootstrap, /v_owner_email text/);
  assert.match(bootstrap, /lower\(u\.email\).*lower\(btrim\(v_owner_email\)\)/s);
  assert.match(bootstrap, /u\.email_confirmed_at IS NOT NULL/);
  assert.match(bootstrap, /WHERE p\.role = 'OWNER'::public\.app_role/);
  assert.match(bootstrap, /SET role = 'OWNER'::public\.app_role/);
});
