import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import TenantSite from "./site/[tenant]/page";

export default async function Home() {
  const host = (await headers()).get("host")?.toLowerCase().split(":")[0];
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    const tenant = await prisma.tenant.findFirst({ where: { domain: host, status: "ACTIVE" }, select: { slug: true } });
    if (tenant) return <TenantSite params={Promise.resolve({ tenant: tenant.slug })} searchParams={Promise.resolve({})} />;
  }
  return <PlatformHome />;
}

function PlatformHome() {
  return <main className="platform-home">
    <header className="platform-header">
      <a className="platform-logo" href="/"><span className="brand-mark">✳</span><span>Medwell</span></a>
      <nav className="platform-nav" aria-label="Main navigation"><a href="#platform">Platform</a><a href="#how-it-works">How it works</a><a href="/site/madilu-womens-health">Sample practice</a><a className="platform-nav-cta" href="/admin">Open workspace <span aria-hidden="true">→</span></a></nav>
    </header>

    <section className="platform-hero">
      <div className="platform-hero-copy"><span className="platform-eyebrow"><i /> THE PRACTICE WEBSITE STUDIO</span><h1>More time for care.<br /><em>Less time online.</em></h1><p>A thoughtful home for your practice, your services, and the people who trust you with their health.</p><div className="platform-hero-actions"><a className="platform-primary" href="/admin">Go to your workspace <span aria-hidden="true">→</span></a><a className="platform-secondary" href="/site/madilu-womens-health">Explore a sample site <span aria-hidden="true">↗</span></a></div><div className="platform-proof"><span><b>✳</b> Built for independent practices</span><span><b>✳</b> Designed around patient trust</span></div></div>
      <div className="platform-preview" aria-label="Preview of a practice website"><div className="preview-browser"><div className="browser-bar"><span /><span /><span /><small>your-practice.com</small><b>•••</b></div><div className="preview-site"><div className="preview-site-nav"><span className="preview-mini-logo">✳</span><strong>Juniper Women’s Care</strong><span>Our care</span><span>About</span><span className="preview-book">Book a visit</span></div><div className="preview-site-body"><div><small>CARE THAT MEETS YOU WHERE YOU ARE</small><h2>Feel heard.<br />Feel cared for.</h2><p>Thoughtful women’s healthcare, at every stage.</p><span className="preview-site-cta">Meet your care team&nbsp; →</span></div><div className="preview-art"><span>✳</span><i /><b /></div></div></div></div><div className="preview-caption"><span className="preview-caption-icon">↗</span><span><strong>A site that feels like your practice</strong><small>Clear, calm, and easy to make your own</small></span><span className="preview-caption-arrow">→</span></div></div>
      <span className="platform-orbit orbit-one" /><span className="platform-orbit orbit-two" />
    </section>

    <div className="platform-ribbon"><span>ONE PRACTICE, ONE PLACE</span><i /><span>YOUR CONTENT, YOUR VOICE</span><i /><span>A BETTER FIRST VISIT STARTS HERE</span></div>

    <section className="platform-section" id="platform"><div className="platform-section-heading"><span className="platform-eyebrow">A LITTLE MORE ROOM TO BREATHE</span><h2>Everything your practice site needs.<br /><em>All in one calm place.</em></h2><p>Spend less energy maintaining your online presence and more time focused on the people in your care.</p></div><div className="platform-feature-grid"><article><span className="feature-icon">⌂</span><span className="feature-number">01</span><h3>A welcoming website</h3><p>Give patients a clear introduction to your practice, your approach, and the care you offer.</p><a href="/site/madilu-womens-health">See a sample <span>→</span></a></article><article><span className="feature-icon">▤</span><span className="feature-number">02</span><h3>A simple content studio</h3><p>Keep doctor profiles, services, patient resources, and your practice details current.</p><a href="/admin?section=Services">Explore the workspace <span>→</span></a></article><article><span className="feature-icon">◷</span><span className="feature-number">03</span><h3>A smoother way to connect</h3><p>Let patients send appointment requests and bring those requests into one inbox.</p><a href="/site/madilu-womens-health#booking">See appointment requests <span>→</span></a></article></div></section>

    <section className="platform-how" id="how-it-works"><div className="how-intro"><span className="platform-eyebrow">A MORE HUMAN START</span><h2>Set up with intention.<br /><em>Grow at your pace.</em></h2><p>Your practice is unique. Your website should feel that way too.</p><a className="platform-primary" href="/admin?section=Websites">Set up a practice <span aria-hidden="true">→</span></a></div><div className="how-steps"><article><span>01</span><div><h3>Tell your story</h3><p>Introduce your doctor, care philosophy, and the services patients can access.</p></div></article><article><span>02</span><div><h3>Make it yours</h3><p>Choose your practice details, add helpful content, and make the site feel like home.</p></div></article><article><span>03</span><div><h3>Welcome patients</h3><p>Share your website and receive appointment requests directly in your workspace.</p></div></article></div></section>

    <footer className="platform-footer"><a className="platform-logo" href="/"><span className="brand-mark">✳</span><span>Medwell</span></a><span>Built for thoughtful, independent care.</span><a href="/admin">Open your workspace <span aria-hidden="true">→</span></a></footer>
  </main>;
}
