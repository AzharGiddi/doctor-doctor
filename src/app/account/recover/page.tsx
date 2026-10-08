import { requestPasswordReset } from "../actions";

export default async function RecoverPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return <main className="auth-page"><section className="auth-card"><span className="eyebrow">ACCOUNT RECOVERY</span><h1>Reset your password</h1>
    {sent ? <p>If an account matches that email, a one-time reset link has been issued.</p> : <><p>Enter your account email. If it matches an account, you’ll receive a reset link.</p><form action={requestPasswordReset} className="auth-form"><label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label><button className="button button-primary" type="submit">Send reset link</button></form></>}
    <a href="/admin/login">Return to sign in</a>
  </section></main>;
}
