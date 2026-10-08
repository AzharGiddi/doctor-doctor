import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createFirstAdmin } from "../auth-actions";
import { redirect } from "next/navigation";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  if (await prisma.user.count() > 0) redirect("/admin/login");
  const setupEnabled = Boolean(process.env.INITIAL_ADMIN_SETUP_TOKEN && process.env.INITIAL_ADMIN_SETUP_TOKEN.length >= 32);
  const { error } = await searchParams;
  return <main className="auth-page"><section className="auth-card"><a className="brand" href="/"><span className="brand-mark">M</span><span>Medwell<span className="brand-subtitle">Practice Studio</span></span></a><span className="eyebrow">FIRST RUN SETUP</span><h1>Create platform admin</h1>{setupEnabled ? <><p>This one-time account controls tenant setup and platform content.</p>{error && <div className="notice notice-error" role="alert">Enter the configured setup token, a valid email, and a password of at least 12 characters.</div>}<form action={createFirstAdmin} className="auth-form"><label className="field"><span>One-time setup token</span><input name="bootstrapToken" type="password" autoComplete="off" minLength={32} maxLength={256} required /></label><label className="field"><span>Your name</span><input name="name" autoComplete="name" maxLength={120} required /></label><label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label><label className="field"><span>Password</span><input name="password" type="password" minLength={12} maxLength={256} autoComplete="new-password" required /><small>Use at least 12 characters.</small></label><label className="field"><span>Confirm password</span><input name="confirmation" type="password" minLength={12} maxLength={256} autoComplete="new-password" required /></label><button className="button button-primary" type="submit">Create admin account</button></form></> : <p>First-run setup is disabled. Configure a random `INITIAL_ADMIN_SETUP_TOKEN` in the server environment or create the first admin with the bootstrap seed credentials.</p>}</section></main>;
}
