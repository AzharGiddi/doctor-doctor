import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { ConsultationType } from "@prisma/client";
import { getTenantBySlug } from "@/lib/tenant";
import { getStorage } from "@/lib/storage";
import { getPrincipal } from "@/lib/auth";
import { canManageTenant } from "@/lib/authorization";
import { requestAppointment } from "../actions";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ booking?: string; service?: string; preview?: string }> };
type HeroContent = { eyebrow?: string; headline?: string; cta?: string };
type PageBlock = { type?: string; props?: Record<string, unknown>; hidden?: boolean };

function pageBlockMap(input: unknown) {
  const blocks = Array.isArray(input) ? input as PageBlock[] : [];
  return new Map(blocks.filter((block) => block && typeof block === "object" && typeof block.type === "string").map((block) => [block.type!, block]));
}

function blockTitle(block: PageBlock | undefined, fallback: string) {
  return typeof block?.props?.title === "string" ? block.props.title : fallback;
}

function heroContent(blocks: unknown): HeroContent {
  if (!Array.isArray(blocks)) return {};
  const block = blocks.find((item) => typeof item === "object" && item !== null && "type" in item && item.type === "hero");
  if (!block || typeof block !== "object" || !("props" in block) || typeof block.props !== "object" || !block.props) return {};
  const props = block.props as Record<string, unknown>;
  return {
    eyebrow: typeof props.eyebrow === "string" ? props.eyebrow : undefined,
    headline: typeof props.headline === "string" ? props.headline : undefined,
    cta: typeof props.cta === "string" ? props.cta : undefined,
  };
}

function safeHref(href: string) {
  return href.startsWith("#") || /^https?:\/\//i.test(href) ? href : "#booking";
}

const bookingMessages: Record<string, string> = {
  received: "Thank you. Your appointment request has been sent to the practice.",
  details: "Please check your contact details and try again.",
  date: "Choose an appointment time in the next 90 days.",
  service: "Choose one of the services listed for this practice.",
  hours: "That time is outside the practice’s appointment hours.",
  taken: "That time has just been requested. Please choose another time.",
  unavailable: "Appointment requests are not available for this practice right now.",
};

export async function generateMetadata({ params }: Props) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  return {
    title: tenant?.settings?.siteTitle ?? tenant?.name ?? "Doctor website",
    description: tenant?.settings?.tagline ?? "Thoughtful care, centered around you.",
  };
}

export default async function TenantSite({ params, searchParams }: Props) {
  const [{ tenant: slug }, query] = await Promise.all([params, searchParams]);
  const isPreview = query.preview === "1";
  const tenant = await getTenantBySlug(slug, isPreview);
  if (!tenant || tenant.status !== "ACTIVE") notFound();
  if (isPreview) {
    const principal = await getPrincipal();
    if (!principal || !canManageTenant(principal, tenant.id)) notFound();
  }

  const tokens = (tenant.theme?.tokens ?? {}) as Record<string, string>;
  const blocks = pageBlockMap(tenant.pages[0]?.blocks);
  const hero = heroContent(tenant.pages[0]?.blocks);
  const enabled = (type: string, hasContent = true) => hasContent && (blocks.size === 0 || (blocks.has(type) && !blocks.get(type)?.hidden));
  const showAbout = enabled("doctor-profile");
  const showServices = enabled("services", tenant.services.length > 0);
  const showStories = enabled("testimonials", tenant.testimonials.length > 0);
  const showFaq = enabled("faq", tenant.faqs.length > 0);
  const showBooking = enabled("cta");
  const sectionOrder = (type: string) => {
    const index = [...blocks.keys()].indexOf(type);
    return index < 0 ? 99 : Math.max(3, index + 2);
  };
  const links = tenant.navigation.length ? tenant.navigation : [
    ...(showAbout ? [{ id: "about", label: "About", href: "#about" }] : []),
    ...(showServices ? [{ id: "care", label: "Care & services", href: "#care" }] : []),
    ...(showStories ? [{ id: "stories", label: "Patient stories", href: "#stories" }] : []),
    ...(showFaq ? [{ id: "faq", label: "FAQs", href: "#faq" }] : []),
  ];
  const theme = {
    "--brand": tokens.primary ?? "#235b52",
    "--brand-strong": tokens.primary ?? "#17473f",
    "--accent": tokens.secondary ?? "#bd806c",
    "--paper": tokens.background ?? "#f7f5ef",
    "--surface": tokens.surface ?? "#fffefa",
    "--ink": tokens.text ?? "#20312e",
  } as CSSProperties;
  const bookingMessage = query.booking ? bookingMessages[query.booking] : undefined;
  const isConfirmation = query.booking === "received";
  const selectedServiceId = tenant.services.some((service) => service.id === query.service) ? query.service : "";
  const heroImage = tenant.media.find((item) => item.type === "IMAGE");
  const heroImageUrl = heroImage ? await getStorage().url(heroImage.storageKey) : null;

  return <main className={`clinic-site template-${tenant.template}`} id="top" style={theme}>
    <header className="clinic-header" style={{ order: 0 }}>
      <a className="clinic-brand" href={`/site/${tenant.slug}`}><span className="clinic-brand-mark" aria-hidden="true">✳</span><span><strong>{tenant.settings?.siteTitle ?? tenant.name}</strong><small>{tenant.settings?.tagline ?? "Care with clarity and kindness"}</small></span></a>
      <nav className="clinic-nav" aria-label="Main navigation">{links.map((item) => <a href={safeHref(item.href)} key={item.id}>{item.label}</a>)}</nav>
      {showBooking && <a className="clinic-header-cta" href="#booking">{tenant.settings?.appointmentCta ?? "Request a visit"}<span aria-hidden="true">↗</span></a>}
    </header>

    <section className="clinic-hero" style={{ order: 1 }}>
      <div className="clinic-hero-copy">
        <span className="clinic-eyebrow"><span />{hero.eyebrow ?? "PERSONALIZED WOMEN’S HEALTHCARE"}</span>
        <h1>{hero.headline ?? "Expert care for every stage of womanhood."}</h1>
        <p className="clinic-hero-intro">{tenant.settings?.tagline ?? "Compassionate, expert care to help you feel heard, informed, and supported."}</p>
        <div className="clinic-hero-actions">{showBooking && <a className="clinic-button" href="#booking">{hero.cta ?? tenant.settings?.appointmentCta ?? "Request an appointment"}<span aria-hidden="true">→</span></a>}{showAbout && <a className="clinic-text-link" href="#about">Meet your doctor <span aria-hidden="true">↓</span></a>}</div>
        <div className="clinic-trust-row"><span className="trust-stars" aria-hidden="true">★★★★★</span><span>Care that puts you first</span><i /> <span>{tenant.doctor?.experienceYears ? `${tenant.doctor.experienceYears}+ years of experience` : "Experienced, attentive care"}</span></div>
      </div>
      <div className="clinic-hero-art" aria-label={tenant.doctor?.name ? `Portrait placeholder for ${tenant.doctor.name}` : "Soft botanical illustration"} role="img">
        {heroImage && heroImageUrl ? <img src={heroImageUrl} alt={heroImage.altText ?? tenant.name} /> : <><div className="art-sun" /><div className="art-arch"><span className="art-stem stem-one" /><span className="art-stem stem-two" /><span className="art-stem stem-three" /><span className="art-flower">✳</span></div><span className="art-note">A space to feel<br />seen & supported</span></>}
        <div className="hero-doctor-card"><span className="doctor-card-icon">✳</span><span><strong>{tenant.doctor?.name ?? tenant.name}</strong><small>{tenant.doctor?.title ?? "Your care partner"}</small></span></div>
      </div>
      <span className="hero-vertical-note">CARE THAT MEETS YOU WHERE YOU ARE</span>
    </section>

    <div className="clinic-proof-strip" style={{ order: 2 }}><span>Thoughtful, evidence-based care</span><i /><span>Time to listen and understand</span><i /><span>Support at every stage</span><i /><span>Care plans made together</span></div>

    {showAbout && <section className="clinic-about clinic-section" id="about" style={{ order: sectionOrder("doctor-profile") }}>
      <div className="section-overline">A LITTLE ABOUT YOUR DOCTOR</div>
      <div className="clinic-about-grid"><div><p className="clinic-section-lead">Good care starts with a conversation.</p><p className="clinic-body-copy">{tenant.doctor?.bio ?? `${tenant.doctor?.name ?? "Your doctor"} believes every patient deserves time, clear answers, and a care plan built around their needs. You can expect a thoughtful, private, and judgment-free conversation at every visit.`}</p><a className="clinic-underlined-link" href="#booking">Get to know your doctor <span aria-hidden="true">→</span></a></div>
        <div className="doctor-details-card"><div className="doctor-monogram">{(tenant.doctor?.name ?? tenant.name).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div><div><h2>{tenant.doctor?.name ?? tenant.name}</h2><p>{tenant.doctor?.title ?? "Consultant Physician"}</p></div><div className="doctor-credentials"><span>QUALIFICATIONS</span><p>{tenant.doctor?.qualifications.length ? tenant.doctor.qualifications.join(" · ") : "Experienced and dedicated to your wellbeing"}</p></div>{tenant.doctor?.specialties.length ? <div className="specialty-list">{tenant.doctor.specialties.map((specialty) => <span key={specialty}>{specialty}</span>)}</div> : null}</div>
      </div>
    </section>}

    {showServices && <section className="clinic-care clinic-section" id="care" style={{ order: sectionOrder("services") }}>
      <div className="clinic-section-head"><div><div className="section-overline">HOW WE CAN HELP</div><h2>{blockTitle(blocks.get("services"), "Care for your whole journey.")}</h2></div><p>Every visit is a chance to understand what matters to you and find the right next step together.</p></div>
      {tenant.services.length ? <div className="clinic-service-grid">{tenant.services.map((service, index) => <article className="clinic-service-card" key={service.id}><span className="service-index">0{index + 1}</span><span className="service-symbol" aria-hidden="true">{["✳", "◌", "⌁", "❋", "◡"][index % 5]}</span><h3>{service.name}</h3><p>{service.shortDescription ?? service.description ?? "Personalized support from a team that takes the time to listen."}</p><a href={`/site/${tenant.slug}?service=${encodeURIComponent(service.id)}#booking`} className="service-link">Ask about this service <span aria-hidden="true">→</span></a></article>)}</div> : <div className="site-empty-note">Services will be added here soon. Contact the practice for more information.</div>}
    </section>}

    {showStories && <section className="clinic-stories clinic-section" id="stories" style={{ order: sectionOrder("testimonials") }}><div className="section-overline">KIND WORDS FROM PATIENTS</div><div className="clinic-section-head"><h2>{blockTitle(blocks.get("testimonials"), "Care that makes a difference.")}</h2><p>Every patient’s experience is personal. We’re grateful when they choose to share theirs.</p></div><div className="story-grid">{tenant.testimonials.map((story) => <figure className="story-card" key={story.id}><span className="story-stars" aria-label={`${story.rating ?? 5} out of 5 stars`}>{"★".repeat(story.rating ?? 5)}</span><blockquote>{story.quote}</blockquote><figcaption><span className="story-avatar">{story.name.slice(0, 1).toUpperCase()}</span><span><strong>{story.name}</strong><small>Patient</small></span></figcaption></figure>)}</div></section>}

    {showFaq && <section className="clinic-faq clinic-section" id="faq" style={{ order: sectionOrder("faq") }}><div><div className="section-overline">HERE TO HELP</div><h2>{blockTitle(blocks.get("faq"), "A few things you might be wondering.")}</h2><p>Still have a question? Reach out and we’ll be happy to help.</p>{tenant.settings?.phone && <a className="clinic-underlined-link" href={`tel:${tenant.settings.phone.replace(/[^+\d]/g, "")}`}>Call {tenant.settings.phone} <span aria-hidden="true">→</span></a>}</div><div className="faq-list">{tenant.faqs.map((faq) => <details key={faq.id}><summary>{faq.question}<span aria-hidden="true">＋</span></summary><p>{faq.answer}</p></details>)}</div></section>}

    {showBooking && <section className="clinic-booking" id="booking" style={{ order: sectionOrder("cta") }}><div className="booking-copy"><div className="section-overline">YOUR NEXT STEP</div><h2>{blockTitle(blocks.get("cta"), "Let’s make time for your health.")}</h2><p>Send an appointment request and the practice will follow up to confirm a time that works for you.</p><div className="booking-contact">{tenant.settings?.phone && <a href={`tel:${tenant.settings.phone.replace(/[^+\d]/g, "")}`}><span>CALL THE PRACTICE</span><strong>{tenant.settings.phone}</strong></a>}{tenant.settings?.email && <a href={`mailto:${tenant.settings.email}`}><span>EMAIL</span><strong>{tenant.settings.email}</strong></a>}{tenant.settings?.address && <div><span>VISIT</span><strong>{tenant.settings.address}</strong></div>}</div></div>
      <div className="booking-form-wrap">
        {bookingMessage && <div className={`booking-message ${isConfirmation ? "booking-success" : "booking-error"}`} role={isConfirmation ? "status" : "alert"}>{bookingMessage}</div>}
        {!isConfirmation && <form action={requestAppointment} className="booking-form"><input type="hidden" name="tenantSlug" value={tenant.slug} /><div className="form-intro"><span className="clinic-brand-mark" aria-hidden="true">✳</span><div><h3>Request a visit</h3><p>We’ll be in touch to confirm your appointment.</p></div></div>
          <label><span>Your name</span><input name="patientName" autoComplete="name" required maxLength={120} placeholder="Full name" /></label>
          <div className="booking-field-row"><label><span>Phone number</span><input name="patientPhone" type="tel" autoComplete="tel" required maxLength={32} placeholder="+91 98765 43210" /></label><label><span>Email <small>optional</small></span><input name="patientEmail" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" /></label></div>
          {tenant.services.length > 0 && <label><span>What would you like help with?</span><select name="serviceId" defaultValue={selectedServiceId}><option value="">Choose a service</option>{tenant.services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}</select></label>}
          <div className="booking-field-row"><label><span>Preferred date & time</span><input name="startsAt" type="datetime-local" required /></label><label><span>Visit type</span><select name="consultationType" defaultValue={ConsultationType.IN_PERSON}><option value={ConsultationType.IN_PERSON}>In person</option><option value={ConsultationType.VIDEO}>Video consultation</option><option value={ConsultationType.PHONE}>Phone consultation</option></select></label></div>
          <label><span>Anything you’d like us to know? <small>optional</small></span><textarea name="notes" rows={3} maxLength={1000} placeholder="A short note for the care team" /></label>
          <button className="clinic-button booking-submit" type="submit">Send appointment request <span aria-hidden="true">→</span></button>
          <p className="booking-privacy">Your details will be used by the practice to respond to this appointment request.</p>
        </form>}
      </div>
    </section>}

    <footer className="clinic-footer" style={{ order: 999 }}><a className="clinic-brand" href={`/site/${tenant.slug}`}><span className="clinic-brand-mark" aria-hidden="true">✳</span><span><strong>{tenant.settings?.siteTitle ?? tenant.name}</strong><small>{tenant.doctor?.name ?? "Care with clarity and kindness"}</small></span></a><p>Thoughtful care, centered around you.</p><a href="#top" className="footer-top">Back to top ↑</a><small className="footer-legal">© {new Date().getFullYear()} {tenant.name}. For emergencies, contact your local emergency service.</small></footer>
  </main>;
}
