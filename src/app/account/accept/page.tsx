import { AccountTokenKind } from "@prisma/client";
import { findActiveAccountToken } from "@/lib/account-tokens";
import { acceptInvitation } from "../actions";

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token = "", error } = await searchParams;
  const invitation = await findActiveAccountToken(token, AccountTokenKind.INVITATION);
  return <main className="auth-page"><section className="auth-card"><span className="eyebrow">ACCOUNT INVITATION</span><h1>{invitation ? "Set your password" : "Invitation unavailable"}</h1>
    {invitation ? <><p>Choose a password for {invitation.email}. The link works once and expires after 24 hours.</p>{error && <div className="notice notice-error" role="alert">This invitation is invalid or expired. Ask a platform administrator for a new one.</div>}
      <form action={acceptInvitation} className="auth-form"><input type="hidden" name="token" value={token} /><label className="field"><span>Password</span><input name="password" type="password" minLength={12} maxLength={256} autoComplete="new-password" required /><small>Use at least 12 characters.</small></label><label className="field"><span>Confirm password</span><input name="confirmation" type="password" minLength={12} maxLength={256} autoComplete="new-password" required /></label><button className="button button-primary" type="submit">Create account</button></form>
    </> : <p>This invitation link cannot be used. Contact your platform administrator.</p>}
  </section></main>;
}
