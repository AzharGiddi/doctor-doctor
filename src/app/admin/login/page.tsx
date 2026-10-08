import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { login } from "../auth-actions";
import { redirect } from "next/navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  if (await prisma.user.count() === 0) redirect("/admin/setup");
  const { error } = await searchParams;
  return <main className="auth-page"><section className="auth-card"><a className="brand" href="/"><span className="brand-mark">M</span><span>Medwell<span className="brand-subtitle">Practice Studio</span></span></a><span className="eyebrow">SECURE WORKSPACE</span><h1>Welcome back</h1><p>Sign in to manage your practice website.</p>{error && <div className="notice notice-error" role="alert">Email or password is incorrect.</div>}<form action={login} className="auth-form"><label className="field"><span>Email address</span><input name="email" type="email" autoComplete="username" maxLength={254} required /></label><label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" maxLength={256} required /></label><button className="button button-primary" type="submit">Sign in</button></form><a href="/account/recover">Forgot your password?</a></section></main>;
}
