import { AccountTokenKind } from "@prisma/client";
import { findActiveAccountToken } from "@/lib/account-tokens";
import { resetPassword } from "../actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token = "", error } = await searchParams;
  const reset = await findActiveAccountToken(token, AccountTokenKind.PASSWORD_RESET);
  return <main className="auth-page"><section className="auth-card"><span className="eyebrow">ACCOUNT RECOVERY</span><h1>{reset ? "Choose a new password" : "Reset link unavailable"}</h1>
    {reset ? <><p>Reset link for {reset.email}. This link works once and expires after 30 minutes.</p>{error && <div className="notice notice-error" role="alert">This reset link is invalid or expired. Request a new one.</div>}<form action={resetPassword} className="auth-form"><input type="hidden" name="token" value={token} /><label className="field"><span>New password</span><input name="password" type="password" minLength={12} maxLength={256} autoComplete="new-password" required /></label><label className="field"><span>Confirm new password</span><input name="confirmation" type="password" minLength={12} maxLength={256} autoComplete="new-password" required /></label><button className="button button-primary" type="submit">Set new password</button></form></> : <p>This reset link cannot be used. Request a new one.</p>}
    <a href="/account/recover">Request another reset link</a>
  </section></main>;
}
