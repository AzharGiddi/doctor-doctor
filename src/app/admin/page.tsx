import { AppointmentStatus, PublishStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { getPrincipal } from "@/lib/auth";
import { can } from "@/lib/authorization";
import { redirect } from "next/navigation";
import { logout as signOut } from "./auth-actions";
import { inviteUser } from "../account/actions";
import { PageBlockEditor } from "./page-block-editor";
import {
  createTenant,
  deleteContent,
  deleteMedia,
  saveAvailability,
  saveContent,
  saveDoctor,
  saveTenantDomain,
  savePage,
  saveSettings,
  saveTheme,
  updateAppointmentStatus,
  uploadMedia,
} from "./actions";

const modules = ["Dashboard", "Websites", "Doctors", "Pages", "Services", "Media Library", "Testimonials", "FAQs", "Articles", "Videos", "Podcasts", "Appointments", "Availability", "SEO", "Settings", "Users", "Audit Logs"];

type PageProps = { searchParams: Promise<{ section?: string; tenant?: string; saved?: string; error?: string; invited?: string }> };
type TenantOption = { id: string; slug: string; name: string };
const editableBlocks = [
  { type: "doctor-profile", title: "Doctor introduction", description: "A short profile and credentials." },
  { type: "services", title: "Services", description: "Care and services available at the practice." },
  { type: "testimonials", title: "Patient stories", description: "Patient feedback shared with consent." },
  { type: "faq", title: "Common questions", description: "Answers to questions patients often ask." },
  { type: "cta", title: "Appointment request", description: "A form for patients to contact the practice." },
];

function pageBlocks(input: unknown): Array<{ type?: string; props?: unknown; [key: string]: unknown }> {
  return Array.isArray(input) ? input.filter((item) => typeof item === "object" && item !== null) as Array<{ type?: string; props?: unknown; [key: string]: unknown }> : [];
}

function heroProps(input: unknown) {
  const block = pageBlocks(input).find((item) => item.type === "hero");
  return block && typeof block.props === "object" && block.props !== null ? block.props as Record<string, unknown> : {};
}

function textValue(input: unknown, fallback: string) {
  return typeof input === "string" ? input : fallback;
}

function sectionHref(section: string, tenantId?: string) {
  const params = new URLSearchParams();
  if (section !== "Dashboard") params.set("section", section);
  if (tenantId) params.set("tenant", tenantId);
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

function Field({ label, name, defaultValue = "", type = "text", required = false, placeholder = "" }: {
  label: string; name: string; defaultValue?: string | number; type?: string; required?: boolean; placeholder?: string;
}) {
  return <label className="field"><span>{label}</span><input name={name} type={type} defaultValue={defaultValue} required={required} placeholder={placeholder} /></label>;
}

function SectionHeading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="section-heading"><div><span className="eyebrow">Workspace</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function ContentForm({ section, tenantId, item }: { section: "Services" | "FAQs" | "Testimonials" | "Articles"; tenantId: string; item?: any }) {
  return <form action={saveContent} className="editor-form">
    <input type="hidden" name="type" value={section} />
    <input type="hidden" name="tenantId" value={tenantId} />
    <input type="hidden" name="id" value={item?.id ?? ""} />
    {section === "Services" && <>
      <Field label="Service name" name="name" defaultValue={item?.name ?? ""} required />
      <Field label="URL slug" name="slug" defaultValue={item?.slug ?? ""} placeholder="Created from name if blank" />
      <Field label="Short description" name="shortDescription" defaultValue={item?.shortDescription ?? ""} />
      <Field label="Duration (minutes)" name="durationMinutes" type="number" defaultValue={item?.durationMinutes ?? ""} />
      <Field label="Price" name="price" type="number" defaultValue={item?.price == null ? "" : (item.price / 100).toFixed(2)} />
      <label className="field field-wide"><span>Full description</span><textarea name="description" rows={3} defaultValue={item?.description ?? ""} /></label>
    </>}
    {section === "FAQs" && <>
      <Field label="Question" name="question" defaultValue={item?.question ?? ""} required />
      <Field label="Sort order" name="sortOrder" type="number" defaultValue={item?.sortOrder ?? 0} />
      <label className="field field-wide"><span>Answer</span><textarea name="answer" rows={4} defaultValue={item?.answer ?? ""} required /></label>
    </>}
    {section === "Testimonials" && <>
      <Field label="Patient name" name="name" defaultValue={item?.name ?? ""} required />
      <Field label="Rating (1 to 5)" name="rating" type="number" defaultValue={item?.rating ?? ""} />
      <label className="field field-wide"><span>Review</span><textarea name="quote" rows={4} defaultValue={item?.quote ?? ""} required /></label>
    </>}
    {section === "Articles" && <>
      <Field label="Article title" name="title" defaultValue={item?.title ?? ""} required />
      <Field label="URL slug" name="slug" defaultValue={item?.slug ?? ""} placeholder="Created from title if blank" />
      <Field label="Excerpt" name="excerpt" defaultValue={item?.excerpt ?? ""} />
      <label className="field"><span>Publication status</span><select name="status" defaultValue={item?.status ?? "DRAFT"}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></label>
      <label className="field field-wide"><span>Article content</span><textarea name="content" rows={8} defaultValue={item?.content ?? ""} required /></label>
    </>}
    <div className="form-actions"><button className="button button-primary" type="submit">{item ? "Save changes" : `Add ${section === "FAQs" ? "FAQ" : section.slice(0, -1).toLowerCase()}`}</button>
      {item && <button className="button button-danger" type="submit" formAction={deleteContent} name="type" value={section}>Delete</button>}
    </div>
  </form>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-mark">＋</span><p>{children}</p></div>;
}

export default async function AdminPage({ searchParams }: PageProps) {
  const principal = await getPrincipal();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const activeModule = modules.includes(params.section ?? "") ? params.section! : "Dashboard";
  const sectionCapability = activeModule === "Users" || activeModule === "Audit Logs" ? "platform:manage" : activeModule === "Appointments" ? "appointments:manage" : activeModule === "Availability" ? "availability:manage" : activeModule === "Dashboard" || activeModule === "Websites" ? "website:manage" : "content:manage";
  if (!can(principal, sectionCapability)) redirect(principal.role === UserRole.CONTENT_MANAGER ? "/admin?section=Pages" : "/admin?section=Appointments");
  const tenantWhere = principal.role === UserRole.SUPER_ADMIN ? {} : { id: principal.tenantId ?? "__no_tenant__" };
  const tenants = await prisma.tenant.findMany({
    where: tenantWhere,
    include: { doctor: true, settings: true, theme: true, _count: { select: { pages: true, services: true, appointments: true } } },
    orderBy: { createdAt: "asc" },
  });
  const requestedTenantId = principal.role === UserRole.SUPER_ADMIN ? params.tenant : principal.tenantId;
  const tenant = tenants.find((item) => item.id === requestedTenantId) ?? (principal.role === UserRole.SUPER_ADMIN ? tenants[0] : undefined);
  const tenantId = tenant?.id ?? "";
  const tenantOptions: TenantOption[] = tenants.map(({ id, slug, name }) => ({ id, slug, name }));
  const users = principal.role === UserRole.SUPER_ADMIN ? await prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, tenant: { select: { name: true } } }, orderBy: { createdAt: "desc" } }) : [];
  const auditLogs = principal.role === UserRole.SUPER_ADMIN ? await prisma.auditLog.findMany({ include: { actor: { select: { email: true, name: true } }, tenant: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) : [];

  const [services, pages, testimonials, faqs, articles, media, availability, appointments, counts] = await Promise.all([
    tenantId ? prisma.service.findMany({ where: { tenantId }, orderBy: { name: "asc" } }) : [],
    tenantId ? prisma.page.findMany({ where: { tenantId }, orderBy: { title: "asc" } }) : [],
    tenantId ? prisma.testimonial.findMany({ where: { tenantId }, orderBy: { id: "desc" } }) : [],
    tenantId ? prisma.faq.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" } }) : [],
    tenantId ? prisma.article.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" } }) : [],
    tenantId ? prisma.media.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }) : [],
    tenantId ? prisma.availability.findMany({ where: { tenantId }, orderBy: { weekday: "asc" } }) : [],
    tenantId ? prisma.appointment.findMany({ where: { tenantId }, orderBy: { startsAt: "desc" }, take: 50 }) : [],
    tenantId ? prisma.$transaction([
      prisma.appointment.count({ where: { tenantId, startsAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      prisma.page.count({ where: { tenantId, status: PublishStatus.DRAFT } }),
      prisma.appointment.count({ where: { tenantId, status: "PENDING" } }),
    ]) : [0, 0, 0],
  ]);

  const errorMessage = params.error === "slug" ? "That website address is already in use." : params.error === "domain" ? "Enter a valid domain that is not assigned to another practice." : params.error === "json" ? "The JSON content is invalid. Review it and save again." : params.error === "file" ? "Choose a supported file smaller than 10 MB." : params.error === "exists" ? "An account already uses that email." : params.error === "email" ? "The invitation email could not be sent in this environment." : params.error ? "Please complete the required fields and try again." : "";
  const successMessage = params.invited ? "The invitation was sent. The recipient has 24 hours to accept it." : params.saved ? "Your changes have been saved." : "";
  const sitePreview = tenant ? `/site/${tenant.slug}?preview=1` : "/";

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <a className="brand" href="/admin"><span className="brand-mark">M</span><span>Medwell<span className="brand-subtitle">Practice Studio</span></span></a>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="admin-nav" aria-label="Platform sections">
        {modules.map((module) => <a className={`nav${activeModule === module ? " active" : ""}`} key={module} href={sectionHref(module, tenantId || undefined)} aria-current={activeModule === module ? "page" : undefined}>
          <span className={`nav-icon nav-icon-${module.toLowerCase().replace(/[^a-z]+/g, "-")}`} aria-hidden="true">{({ Dashboard: "⌂", Websites: "▣", Doctors: "✳", Pages: "▤", Services: "＋", "Media Library": "▧", Testimonials: "♡", FAQs: "?", Articles: "≡", Videos: "▷", Podcasts: "◖", Appointments: "▦", Availability: "◷", SEO: "⌕", Settings: "⚙" } as Record<string, string>)[module]}</span>
          <span>{module}</span>{module === "Appointments" && counts[2] > 0 && <span className="nav-count">{counts[2]}</span>}
        </a>)}
      </nav>
      <div className="sidebar-footer"><span className="status-dot" /> {principal.role.replaceAll("_", " ")} <span className="version-tag">v0.1</span>
        <form action={signOut}><button className="button" type="submit">Sign out</button></form></div>
    </aside>

    <div className="admin-workspace">
      <header className="admin-topbar">
        <div className="breadcrumbs"><span>Workspace</span><span className="crumb-divider">/</span><strong>{activeModule}</strong></div>
        <div className="topbar-actions">
          {tenant && <details className="tenant-switcher"><summary className="tenant-chip"><span className="status-dot" />{tenant.name}<span aria-hidden="true">⌄</span></summary><div className="tenant-switcher-menu" aria-label="Switch practice">{tenantOptions.map((option) => <a key={option.id} href={sectionHref(activeModule, option.id)} aria-current={option.id === tenantId ? "true" : undefined}><strong>{option.name}</strong><small>/site/{option.slug}</small></a>)}</div></details>}
          {tenant && <a className="button button-quiet" href={sitePreview} target="_blank" rel="noreferrer">Preview site <span aria-hidden="true">↗</span></a>}
          <span className="avatar">DS</span>
        </div>
      </header>

      <div className="admin-content">
        {errorMessage && <div className="notice notice-error" role="alert">{errorMessage}</div>}
        {successMessage && <div className="notice notice-success" role="status">{successMessage}</div>}
        {!tenant && activeModule !== "Websites" ? <div className="panel"><EmptyState>Create a website first to start managing its content.</EmptyState><a className="button button-primary" href={sectionHref("Websites")}>Create a website</a></div> : null}

        {activeModule === "Dashboard" && tenant && <>
          <SectionHeading title="Good morning" description="Here’s what’s happening across your practice today." action={<a className="button button-primary" href={sectionHref("Websites", tenantId)}>Manage website <span aria-hidden="true">→</span></a>} />
          <div className="welcome-card"><div><span className="welcome-kicker">YOUR PRACTICE WEBSITE</span><h2>{tenant.settings?.siteTitle ?? tenant.name}</h2><p>{tenant.settings?.tagline ?? "Your digital front door is ready for a little care."}</p><a href={sitePreview} target="_blank" rel="noreferrer">Open live preview <span aria-hidden="true">↗</span></a></div><div className="welcome-decoration" aria-hidden="true"><span>✳</span></div></div>
          <div className="stats-grid">
            <a className="stat-card" href={sectionHref("Websites", tenantId)}><span className="stat-label">ACTIVE WEBSITE</span><strong>{tenants.length}</strong><span className="stat-foot">{tenants.length === 1 ? "Practice connected" : "Practices connected"} <b>→</b></span></a>
            <a className="stat-card" href={sectionHref("Appointments", tenantId)}><span className="stat-label">UPCOMING REQUESTS</span><strong>{counts[2]}</strong><span className="stat-foot">Awaiting your review <b>→</b></span></a>
            <a className="stat-card" href={sectionHref("Appointments", tenantId)}><span className="stat-label">TODAY’S APPOINTMENTS</span><strong>{counts[0]}</strong><span className="stat-foot">View your schedule <b>→</b></span></a>
            <a className="stat-card" href={sectionHref("Pages", tenantId)}><span className="stat-label">DRAFT PAGES</span><strong>{counts[1]}</strong><span className="stat-foot">Continue editing <b>→</b></span></a>
          </div>
          <div className="dashboard-columns">
            <section className="panel appointments-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR DAY</span><h2>Recent appointment requests</h2></div><a href={sectionHref("Appointments", tenantId)}>View all <span aria-hidden="true">→</span></a></div>
              {appointments.length ? <div className="appointment-list">{appointments.slice(0, 4).map((appointment) => <div className="appointment-row" key={appointment.id}><span className="appointment-avatar">{appointment.patientName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div className="appointment-person"><strong>{appointment.patientName}</strong><span>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(appointment.startsAt)}</span></div><span className={`badge badge-${appointment.status.toLowerCase()}`}>{appointment.status.toLowerCase()}</span></div>)}</div> : <EmptyState>No appointment requests yet. They’ll appear here when a patient books.</EmptyState>}
            </section>
            <section className="panel quick-actions"><div className="panel-heading"><div><span className="eyebrow">QUICK START</span><h2>Make an update</h2></div></div>
              <a className="quick-action" href={sectionHref("Services", tenantId)}><span className="quick-action-icon">＋</span><span><strong>Add a service</strong><small>Show patients how you can help</small></span><b>→</b></a>
              <a className="quick-action" href={sectionHref("Media Library", tenantId)}><span className="quick-action-icon">▧</span><span><strong>Upload a photo</strong><small>Refresh your practice imagery</small></span><b>→</b></a>
              <a className="quick-action" href={sectionHref("Settings", tenantId)}><span className="quick-action-icon">⚙</span><span><strong>Update contact details</strong><small>Keep your information current</small></span><b>→</b></a>
            </section>
          </div>
        </>}

        {activeModule === "Websites" && principal.role === UserRole.SUPER_ADMIN && <>
          <SectionHeading title="Websites" description="Create and manage independent websites for every practice." />
          <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">NEW PRACTICE</span><h2>Start a website</h2></div></div>
            <form action={createTenant} className="editor-form">
              <Field label="Practice name" name="name" required placeholder="e.g. Greenleaf Family Clinic" />
              <Field label="Website address" name="slug" placeholder="Created from practice name if blank" />
              <Field label="Doctor name" name="doctorName" required placeholder="Dr. Priya Sharma" />
              <Field label="Doctor title" name="doctorTitle" placeholder="Consultant Cardiologist" />
              <label className="field"><span>Website template</span><select name="template" defaultValue="womens-health"><option value="womens-health">Women's health · Editorial</option><option value="cardiology">Cardiology · Clinical</option><option value="dermatology">Dermatology · Minimal</option><option value="paediatrics">Paediatrics · Friendly</option><option value="dental">Dental · Modern</option></select></label>
              <div className="form-actions"><button className="button button-primary" type="submit">Create practice <span aria-hidden="true">→</span></button></div>
            </form>
          </section>
          <section className="panel data-panel"><div className="panel-heading"><div><span className="eyebrow">ALL PRACTICES</span><h2>Your websites</h2></div><span className="subtle-count">{tenants.length} total</span></div>
            {tenants.length ? <div className="table-scroll"><table><thead><tr><th>Practice</th><th>Doctor</th><th>Pages</th><th>Services</th><th>Appointments</th><th>Custom domain</th><th>Preview</th></tr></thead><tbody>{tenants.map((item) => <tr key={item.id}><td><a className="table-primary" href={sectionHref("Doctors", item.id)}>{item.settings?.siteTitle ?? item.name}</a><span className="table-subtitle">/site/{item.slug}</span></td><td>{item.doctor?.name ?? "—"}</td><td>{item._count.pages}</td><td>{item._count.services}</td><td>{item._count.appointments}</td><td><form action={saveTenantDomain} className="inline-form"><input type="hidden" name="tenantId" value={item.id} /><input name="domain" type="text" defaultValue={item.domain ?? ""} placeholder="clinic.example.com" aria-label={`Custom domain for ${item.name}`} /><button className="button button-small" type="submit">Save</button></form></td><td><a className="table-link" href={`/site/${item.slug}`} target="_blank" rel="noreferrer">Open ↗</a></td></tr>)}</tbody></table></div> : <EmptyState>No websites yet. Create your first practice above.</EmptyState>}
          </section>
        </>}

        {activeModule === "Users" && principal.role === UserRole.SUPER_ADMIN && <>
          <SectionHeading title="Platform users" description="Invite staff with a role and tenant scope." />
          {errorMessage && <div className="notice notice-error" role="alert">{errorMessage}</div>}{successMessage && <div className="notice notice-success" role="status">{successMessage}</div>}
          <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">NEW ACCOUNT</span><h2>Send an invitation</h2></div></div>
            <form action={inviteUser} className="editor-form"><Field label="Name" name="name" required /><Field label="Email" name="email" type="email" required />
              <label className="field"><span>Role</span><select name="role" defaultValue="DOCTOR"><option value="SUPER_ADMIN">Super Admin</option><option value="DOCTOR">Doctor</option><option value="RECEPTIONIST">Receptionist</option><option value="CONTENT_MANAGER">Content Manager</option></select></label>
              <label className="field"><span>Tenant (required for tenant roles)</span><select name="tenantId" defaultValue=""><option value="">No tenant</option>{tenantOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
              <div className="form-actions"><button className="button button-primary" type="submit">Send invitation</button></div>
            </form>
          </section>
          <section className="panel data-panel"><div className="panel-heading"><div><span className="eyebrow">ACCOUNTS</span><h2>Existing users</h2></div><span className="subtle-count">{users.length} total</span></div>
            <div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Tenant</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.name ?? "—"}</td><td>{user.email}</td><td>{user.role.replaceAll("_", " ")}</td><td>{user.tenant?.name ?? "Platform"}</td></tr>)}</tbody></table></div>
          </section>
        </>}

        {activeModule === "Audit Logs" && principal.role === UserRole.SUPER_ADMIN && <>
          <SectionHeading title="Audit logs" description="Recent account and platform changes. Personal appointment details are excluded." />
          <section className="panel data-panel"><div className="table-scroll"><table><thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Tenant</th><th>Target</th></tr></thead><tbody>{auditLogs.map((event) => <tr key={event.id}><td>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(event.createdAt)}</td><td>{event.action.replaceAll("_", " ")}</td><td>{event.actor?.name ?? event.actor?.email ?? "System"}</td><td>{event.tenant?.name ?? "Platform"}</td><td>{event.targetType}{event.targetId ? ` · ${event.targetId}` : ""}</td></tr>)}</tbody></table></div>{!auditLogs.length && <EmptyState>No audit events yet.</EmptyState>}</section>
        </>}

        {activeModule === "Doctors" && <>
          <SectionHeading title="Doctor profiles" description="Keep each clinician’s qualifications and introduction up to date." />
          {tenants.filter((item) => item.doctor).map((item) => <section className="panel editor-panel" key={item.id}><div className="panel-heading"><div><span className="eyebrow">{item.name}</span><h2>{item.doctor!.name}</h2></div><span className="status-pill"><span className="status-dot" />Active</span></div>
            <form action={saveDoctor} className="editor-form"><input type="hidden" name="id" value={item.doctor!.id} /><input type="hidden" name="tenantId" value={item.id} />
              <Field label="Doctor name" name="name" defaultValue={item.doctor!.name} required /><Field label="Professional title" name="title" defaultValue={item.doctor!.title ?? ""} />
              <Field label="Years of experience" name="experienceYears" type="number" defaultValue={item.doctor!.experienceYears ?? ""} /><Field label="Qualifications" name="qualifications" defaultValue={item.doctor!.qualifications.join(", ")} placeholder="MBBS, MD" />
              <Field label="Specialties" name="specialties" defaultValue={item.doctor!.specialties.join(", ")} placeholder="Cardiology, prevention" />
              <label className="field field-wide"><span>Doctor introduction</span><textarea name="bio" rows={4} defaultValue={item.doctor!.bio ?? ""} placeholder="A warm introduction for patients visiting your website." /></label>
              <div className="form-actions"><button className="button button-primary" type="submit">Save profile</button></div>
            </form>
          </section>)}
        </>}

        {activeModule === "Services" && tenant && <>
          <SectionHeading title="Services" description="Describe the care patients can book with your practice." />
          <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">ADD TO YOUR SITE</span><h2>New service</h2></div></div><ContentForm section="Services" tenantId={tenantId} /></section>
          <section className="content-list"><div className="list-heading"><h2>Published services</h2><span>{services.length} services</span></div>
            {services.length ? services.map((item) => <section className="panel content-card" key={item.id}><div className="panel-heading"><div><span className="eyebrow">{item.durationMinutes ? `${item.durationMinutes} MINUTES` : "PRACTICE SERVICE"}</span><h2>{item.name}</h2></div><span className="price-tag">{item.price == null ? "Price on request" : new Intl.NumberFormat("en", { style: "currency", currency: "INR" }).format(item.price / 100)}</span></div><ContentForm section="Services" tenantId={tenantId} item={item} /></section>) : <div className="panel"><EmptyState>Add your first service to show patients what you offer.</EmptyState></div>}
          </section>
        </>}

        {activeModule === "Testimonials" && tenant && <>
          <SectionHeading title="Patient stories" description="Share patient feedback with care and consent." />
          <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">ADD A REVIEW</span><h2>New testimonial</h2></div></div><ContentForm section="Testimonials" tenantId={tenantId} /></section>
          <section className="content-list">{testimonials.map((item) => <section className="panel content-card" key={item.id}><div className="panel-heading"><div><span className="eyebrow">PATIENT STORY</span><h2>{item.name}</h2></div><span className="rating">{"★".repeat(item.rating ?? 0)}</span></div><ContentForm section="Testimonials" tenantId={tenantId} item={item} /></section>)}{!testimonials.length && <div className="panel"><EmptyState>Patient feedback you add will appear on the public site.</EmptyState></div>}</section>
        </>}

        {activeModule === "FAQs" && tenant && <>
          <SectionHeading title="Frequently asked questions" description="Answer common questions before patients reach the clinic." />
          <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">ADD AN ANSWER</span><h2>New question</h2></div></div><ContentForm section="FAQs" tenantId={tenantId} /></section>
          <section className="content-list">{faqs.map((item) => <section className="panel content-card" key={item.id}><div className="panel-heading"><div><span className="eyebrow">QUESTION {item.sortOrder + 1}</span><h2>{item.question}</h2></div></div><ContentForm section="FAQs" tenantId={tenantId} item={item} /></section>)}{!faqs.length && <div className="panel"><EmptyState>Add clear answers to help patients feel prepared.</EmptyState></div>}</section>
        </>}

        {activeModule === "Articles" && tenant && <>
          <SectionHeading title="Articles" description="Publish useful, reviewed information for your patients." />
          <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">WRITE SOMETHING HELPFUL</span><h2>New article</h2></div></div><ContentForm section="Articles" tenantId={tenantId} /></section>
          <section className="content-list">{articles.map((item) => <section className="panel content-card" key={item.id}><div className="panel-heading"><div><span className="eyebrow">{item.status}</span><h2>{item.title}</h2></div><span className="table-subtitle">/{item.slug}</span></div><ContentForm section="Articles" tenantId={tenantId} item={item} /></section>)}{!articles.length && <div className="panel"><EmptyState>Your articles will be listed here.</EmptyState></div>}</section>
        </>}

        {activeModule === "Pages" && tenant && <>
          <SectionHeading title="Site pages" description="Manage the content and publishing state of each page." />
          {pages.map((page) => {
            const blocks = pageBlocks(page.blocks);
            const hero = heroProps(page.blocks);
            return <section className="panel editor-panel" key={page.id}><div className="panel-heading"><div><span className="eyebrow">/{page.slug}</span><h2>{page.title}</h2></div><span className={`badge badge-${page.status.toLowerCase()}`}>{page.status.toLowerCase()}</span></div>
              <form action={savePage} className="editor-form"><input type="hidden" name="id" value={page.id} /><input type="hidden" name="tenantId" value={tenantId} /><input type="hidden" name="visualEditor" value="1" /><Field label="Page title" name="title" defaultValue={page.title} required /><Field label="URL slug" name="slug" defaultValue={page.slug} required /><label className="field"><span>Publishing status</span><select name="status" defaultValue={page.status}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></label><Field label="SEO title" name="seoTitle" defaultValue={page.seoTitle ?? ""} /><Field label="SEO description" name="seoDescription" defaultValue={page.seoDescription ?? ""} />
                <div className="builder-group field-wide"><div><span className="builder-kicker">HERO SECTION</span><p>Set the main message patients see first.</p></div><div className="editor-form"><Field label="Eyebrow" name="heroEyebrow" defaultValue={textValue(hero.eyebrow, "")} /><Field label="Button text" name="heroCta" defaultValue={textValue(hero.cta, "Request an appointment")} required /><Field label="Main headline" name="heroHeadline" defaultValue={textValue(hero.headline, "Care that sees the whole person")} required /></div></div>
                <PageBlockEditor initialBlocks={blocks as any} />
                <div className="form-actions"><button className="button button-primary" type="submit">Save page</button></div></form>
            </section>;
          })}
          {!pages.length && <div className="panel"><EmptyState>Create page content for your website.</EmptyState></div>}
        </>}

        {activeModule === "SEO" && tenant && <>
          <SectionHeading title="Search appearance" description="Set the titles and summaries people see in search results." />
          {pages.map((page) => <section className="panel editor-panel" key={page.id}><div className="panel-heading"><div><span className="eyebrow">PAGE · /{page.slug}</span><h2>{page.title}</h2></div><span className={`badge badge-${page.status.toLowerCase()}`}>{page.status.toLowerCase()}</span></div><form action={savePage} className="editor-form"><input type="hidden" name="id" value={page.id} /><input type="hidden" name="title" value={page.title} /><input type="hidden" name="slug" value={page.slug} /><input type="hidden" name="status" value={page.status} /><input type="hidden" name="blocks" value={JSON.stringify(page.blocks)} /><Field label="Search title" name="seoTitle" defaultValue={page.seoTitle ?? ""} /><label className="field field-wide"><span>Search summary</span><textarea name="seoDescription" rows={3} defaultValue={page.seoDescription ?? ""} /></label><div className="form-actions"><button className="button button-primary" type="submit">Save search details</button></div></form></section>)}
        </>}

        {activeModule === "Settings" && tenant && <>
          <SectionHeading title="Site settings" description="Set your website identity, contact details, and visual style." />
          <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">PRACTICE INFORMATION</span><h2>Contact details</h2></div></div><form action={saveSettings} className="editor-form"><input type="hidden" name="tenantId" value={tenantId} /><Field label="Site title" name="siteTitle" defaultValue={tenant.settings?.siteTitle ?? tenant.name} required /><Field label="Appointment button" name="appointmentCta" defaultValue={tenant.settings?.appointmentCta ?? "Request an appointment"} /><Field label="Phone" name="phone" defaultValue={tenant.settings?.phone ?? ""} type="tel" /><Field label="Email" name="email" defaultValue={tenant.settings?.email ?? ""} type="email" /><label className="field"><span>Tagline</span><textarea name="tagline" rows={3} defaultValue={tenant.settings?.tagline ?? ""} /></label><label className="field"><span>Clinic address</span><textarea name="address" rows={3} defaultValue={tenant.settings?.address ?? ""} /></label><div className="form-actions"><button className="button button-primary" type="submit">Save details</button></div></form></section>
          <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">DESIGN SYSTEM</span><h2>Theme tokens</h2></div></div><form action={saveTheme} className="editor-form"><input type="hidden" name="tenantId" value={tenantId} /><Field label="Theme name" name="themeName" defaultValue={tenant.theme?.name ?? "Calm clinic"} /><label className="field field-wide"><span>Colors and design tokens</span><textarea className="code-field" name="tokens" rows={8} defaultValue={JSON.stringify(tenant.theme?.tokens ?? {}, null, 2)} required /><small>Use valid JSON. Common colors: primary, secondary, background, surface, text.</small></label><div className="form-actions"><button className="button button-primary" type="submit">Save theme</button></div></form></section>
        </>}

        {activeModule === "Media Library" && tenant && <MediaSection tenantId={tenantId} items={media} section="Media Library" />}
        {(activeModule === "Videos" || activeModule === "Podcasts") && tenant && <MediaSection tenantId={tenantId} items={media.filter((item) => item.type === (activeModule === "Videos" ? "VIDEO" : "AUDIO"))} section={activeModule} />}

        {activeModule === "Appointments" && tenant && <>
          <SectionHeading title="Appointments" description="Review requests and keep the practice schedule up to date." />
          <section className="panel data-panel"><div className="panel-heading"><div><span className="eyebrow">PATIENT REQUESTS</span><h2>Appointment inbox</h2></div><span className="subtle-count">{appointments.length} recent</span></div>
            {appointments.length ? <div className="table-scroll"><table><thead><tr><th>Patient</th><th>Requested time</th><th>Type</th><th>Phone</th><th>Status</th><th>Update</th></tr></thead><tbody>{appointments.map((item) => <tr key={item.id}><td><span className="table-primary">{item.patientName}</span><span className="table-subtitle">{item.patientEmail ?? "No email provided"}</span></td><td>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(item.startsAt)}</td><td>{item.consultationType.replace("_", " ").toLowerCase()}</td><td>{item.patientPhone}</td><td><span className={`badge badge-${item.status.toLowerCase()}`}>{item.status.toLowerCase()}</span></td><td><form action={updateAppointmentStatus} className="inline-form"><input type="hidden" name="id" value={item.id} /><input type="hidden" name="tenantId" value={tenantId} /><select aria-label={`Status for ${item.patientName}`} name="status" defaultValue={item.status}>{Object.values(AppointmentStatus).map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select><button className="button button-small" type="submit">Save</button></form></td></tr>)}</tbody></table></div> : <EmptyState>New booking requests from your public website will appear here.</EmptyState>}
          </section>
        </>}

        {activeModule === "Availability" && tenant && <>
          <SectionHeading title="Availability" description="Set the hours patients can request an appointment." />
          <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">WEEKLY HOURS</span><h2>Add availability</h2></div></div><form action={saveAvailability} className="editor-form"><input type="hidden" name="tenantId" value={tenantId} /><label className="field"><span>Day</span><select name="weekday" defaultValue="1">{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label><Field label="Start time" name="startTime" type="time" defaultValue="09:00" required /><Field label="End time" name="endTime" type="time" defaultValue="17:00" required /><div className="form-actions"><button className="button button-primary" type="submit">Add hours</button></div></form></section>
          <section className="panel data-panel"><div className="panel-heading"><div><span className="eyebrow">CURRENT SCHEDULE</span><h2>Bookable hours</h2></div></div>{availability.length ? <div className="availability-grid">{availability.map((item) => <div className="availability-row" key={item.id}><strong>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][item.weekday]}</strong><span>{`${String(Math.floor(item.startMinute / 60)).padStart(2, "0")}:${String(item.startMinute % 60).padStart(2, "0")}`} – {`${String(Math.floor(item.endMinute / 60)).padStart(2, "0")}:${String(item.endMinute % 60).padStart(2, "0")}`}</span><span className={`badge ${item.active ? "badge-published" : "badge-archived"}`}>{item.active ? "Available" : "Paused"}</span></div>)}</div> : <EmptyState>Add weekly hours before patients can choose an appointment time.</EmptyState>}</section>
        </>}
      </div>
    </div>
  </main>;
}

async function MediaSection({ tenantId, items, section }: { tenantId: string; items: any[]; section: "Media Library" | "Videos" | "Podcasts" }) {
  const isLibrary = section === "Media Library";
  const mediaItems = await Promise.all(items.map(async (item) => ({ ...item, publicUrl: await getStorage().url(item.storageKey) })));
  return <>
    <SectionHeading title={section} description={isLibrary ? "Keep practice photography, videos, and audio in one place." : section === "Videos" ? "Share helpful videos with your patients." : "Manage audio content for your practice."} />
    <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">UPLOAD FROM YOUR DEVICE</span><h2>{isLibrary ? "Add media" : `Add ${section.toLowerCase().slice(0, -1)}`}</h2></div><span className="upload-limit">10 MB max</span></div><form action={uploadMedia} className="editor-form media-upload-form" encType="multipart/form-data"><input type="hidden" name="tenantId" value={tenantId} /><label className="field field-wide"><span>Choose file</span><input name="file" type="file" accept={section === "Videos" ? "video/*" : section === "Podcasts" ? "audio/*" : "image/*,video/*,audio/*,application/pdf"} required /></label><Field label="Alternative text" name="altText" placeholder="Describe the image for screen readers" /><Field label="Caption" name="caption" /><label className="field field-wide"><span>Transcript or notes</span><textarea name="transcript" rows={3} /></label><div className="form-actions"><button className="button button-primary" type="submit">Upload media</button></div></form></section>
    <section className="content-list"><div className="list-heading"><h2>{isLibrary ? "Your files" : `${section} library`}</h2><span>{items.length} items</span></div>{items.length ? <div className="media-grid">{mediaItems.map((item) => <article className="panel media-card" key={item.id}><a className="media-preview" href={item.publicUrl} target="_blank" rel="noreferrer"><span>{item.type === "IMAGE" ? "▧" : item.type === "VIDEO" ? "▷" : item.type === "AUDIO" ? "◖" : "▤"}</span><small>{item.type.toLowerCase()}</small></a><div className="media-card-body"><strong>{item.filename}</strong><span>{(item.sizeBytes / 1024 / 1024).toFixed(2)} MB · {new Date(item.createdAt).toLocaleDateString()}</span>{item.caption && <p>{item.caption}</p>}<form action={deleteMedia}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="tenantId" value={tenantId} /><button className="text-button text-danger" type="submit">Remove file</button></form></div></article>)}</div> : <div className="panel"><EmptyState>Files you add will appear here and can be used across your practice site.</EmptyState></div>}</section>
  </>;
}
