"use server";

import { randomUUID } from "node:crypto";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppointmentStatus, ConsultationType, MediaType, Prisma, PublishStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { requireCapability, requireTenant } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { inspectMedia, safeMediaFilename } from "@/lib/media-validation";
import { z } from "zod";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" && raw.length <= 100_000 ? raw.trim() : "";
}

function safeJson(value: unknown, depth = 0): boolean {
  if (depth > 10) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 20_000;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every((item) => safeJson(item, depth + 1));
  if (typeof value === "object") {
    const entries = Object.entries(value);
    return entries.length <= 100 && entries.every(([key, item]) => key.length <= 120 && safeJson(item, depth + 1));
  }
  return false;
}

function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function done(section: string) {
  revalidatePath("/admin");
  revalidatePath("/site/[tenant]", "page");
  redirect(`/admin?section=${encodeURIComponent(section)}&saved=1`);
}

export async function createTenant(formData: FormData) {
  const principal = await requireCapability("platform:manage");
  const name = value(formData, "name");
  const doctorName = value(formData, "doctorName");
  const doctorSlug = slugify(doctorName);
  const slug = slugify(value(formData, "slug") || name);
  const template = value(formData, "template");
  const templates = ["womens-health", "cardiology", "dermatology", "paediatrics", "dental"];
  if (!name || name.length > 120 || !doctorName || doctorName.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(doctorSlug) || slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    redirect("/admin?section=Websites&error=required");
  }
  if (!templates.includes(template)) redirect("/admin?section=Websites&error=required");

  const existing = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (existing) redirect("/admin?section=Websites&error=slug");

  const title = value(formData, "doctorTitle") || "Consultant Physician";
  if (title.length > 200) redirect("/admin?section=Websites&error=required");
  const createdTenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      template,
      doctor: {
        create: {
          name: doctorName,
          slug: doctorSlug,
          title,
          qualifications: [],
          specialties: [],
        },
      },
      settings: { create: { siteTitle: name, tagline: "Thoughtful care, centered around you." } },
      theme: {
        create: {
          name: template.replaceAll("-", " "),
          tokens: template === "cardiology"
            ? { primary: "#174566", secondary: "#7aa6b8", background: "#f2f6f8", surface: "#ffffff", text: "#1c2d3b" }
            : template === "dermatology"
              ? { primary: "#554838", secondary: "#c1a48a", background: "#f8f5f1", surface: "#ffffff", text: "#302a25" }
              : template === "paediatrics"
                ? { primary: "#28756b", secondary: "#e3a869", background: "#f5f8f3", surface: "#ffffff", text: "#263934" }
                : template === "dental"
                  ? { primary: "#27657a", secondary: "#79b6b2", background: "#f2f7f8", surface: "#ffffff", text: "#1e343c" }
                  : { primary: "#235b52", secondary: "#bb826d", background: "#f7f5ef", surface: "#ffffff", text: "#20312e" },
        },
      },
      pages: {
        create: {
          slug: "home",
          title: "Home",
          status: PublishStatus.PUBLISHED,
          blocks: [
            { type: "hero", props: { eyebrow: name, headline: "Care that sees the whole person", cta: "Request an appointment" } },
            { type: "doctor-profile", props: { title: "Meet your doctor" } },
            { type: "services", props: { title: "Care and services" } },
            { type: "testimonials", props: { title: "Patient stories" } },
            { type: "faq", props: { title: "Frequently asked questions" } },
            { type: "cta", props: { title: "Request an appointment" } },
          ],
        },
      },
    },
  });
  await writeAudit({ actorId: principal.userId, tenantId: createdTenant.id, action: "TENANT_CREATED", targetType: "Tenant", targetId: createdTenant.id, metadata: { slug } });
  done("Websites");
}

export async function saveTenantDomain(formData: FormData) {
  const { principal, tenantId } = await requireTenant("website:manage", value(formData, "tenantId") || null);
  const domain = value(formData, "domain").toLowerCase().replace(/\.$/, "");
  if (domain && (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) || domain.includes(".."))) {
    redirect("/admin?section=Websites&error=domain");
  }
  await writeAudit({ actorId: principal.userId, tenantId, action: "TENANT_DOMAIN_UPDATED", targetType: "Tenant", targetId: tenantId });
  try {
    await prisma.tenant.updateMany({ where: { id: tenantId }, data: { domain: domain || null } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") redirect("/admin?section=Websites&error=domain");
    throw error;
  }
  done("Websites");
}

export async function saveDoctor(formData: FormData) {
  const id = value(formData, "id");
  const { principal, tenantId } = await requireTenant("website:manage", value(formData, "tenantId") || null);
  const name = value(formData, "name");
  const experienceRaw = value(formData, "experienceYears");
  const experienceYears = experienceRaw ? Number(experienceRaw) : null;
  const qualifications = value(formData, "qualifications").split(",").map((item) => item.trim()).filter(Boolean);
  const specialties = value(formData, "specialties").split(",").map((item) => item.trim()).filter(Boolean);
  if (!id || !tenantId || !name || name.length > 120 || value(formData, "title").length > 200 || value(formData, "bio").length > 10_000 || (experienceYears !== null && (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 100)) || qualifications.length > 30 || specialties.length > 30 || [...qualifications, ...specialties].some((item) => item.length > 120)) redirect("/admin?section=Doctors&error=required");
  await prisma.doctor.updateMany({
    where: { id, tenantId },
    data: {
      name,
      title: value(formData, "title") || null,
      bio: value(formData, "bio") || null,
      experienceYears,
      qualifications,
      specialties,
    },
  });
  await writeAudit({ actorId: principal.userId, tenantId, action: "DOCTOR_PROFILE_UPDATED", targetType: "Doctor", targetId: id });
  done("Doctors");
}

export async function saveContent(formData: FormData) {
  const type = value(formData, "type");
  const id = value(formData, "id");
  if (!["Services", "FAQs", "Testimonials", "Articles"].includes(type) || id.length > 64) redirect("/admin?section=Dashboard&error=required");
  const capability = type === "Appointments" || type === "Availability" ? "appointments:manage" : "content:manage";
  const { principal, tenantId } = await requireTenant(capability, value(formData, "tenantId") || null);

  if (type === "Services") {
    const name = value(formData, "name");
    const slug = slugify(value(formData, "slug") || name);
    if (!name || name.length > 120 || !slug || slug.length > 120) redirect("/admin?section=Services&error=required");
    const price = value(formData, "price");
    const priceAmount = price ? Number(price) : null;
    const durationRaw = value(formData, "durationMinutes");
    const durationMinutes = durationRaw ? Number(durationRaw) : null;
    if ((priceAmount !== null && (!Number.isFinite(priceAmount) || priceAmount < 0 || priceAmount > 10_000_000)) || (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440))) redirect("/admin?section=Services&error=required");
    const serviceData = {
      name, slug,
      shortDescription: value(formData, "shortDescription") || null,
      description: value(formData, "description") || null,
      durationMinutes,
      price: priceAmount === null ? null : Math.round(priceAmount * 100),
    };
    if (id) {
      await prisma.service.updateMany({ where: { id, tenantId }, data: serviceData });
    } else {
      await prisma.service.create({
        data: {
        tenantId, name, slug,
        shortDescription: value(formData, "shortDescription") || null,
        description: value(formData, "description") || null,
        durationMinutes,
        price: priceAmount === null ? null : Math.round(priceAmount * 100),
        },
      });
    }
  } else if (type === "FAQs") {
    const question = value(formData, "question");
    const answer = value(formData, "answer");
    const sortOrder = Number(value(formData, "sortOrder") || 0);
    if (!question || question.length > 500 || !answer || answer.length > 10_000 || !Number.isInteger(sortOrder) || Math.abs(sortOrder) > 100_000) redirect("/admin?section=FAQs&error=required");
    if (id) await prisma.faq.updateMany({ where: { id, tenantId }, data: { question, answer, sortOrder } });
    else await prisma.faq.create({ data: { tenantId, question, answer, sortOrder } });
  } else if (type === "Testimonials") {
    const name = value(formData, "name");
    const quote = value(formData, "quote");
    if (!name || name.length > 120 || !quote || quote.length > 10_000) redirect("/admin?section=Testimonials&error=required");
    const rating = value(formData, "rating") ? Number(value(formData, "rating")) : null;
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) redirect("/admin?section=Testimonials&error=required");
    if (id) await prisma.testimonial.updateMany({ where: { id, tenantId }, data: { name, quote, rating } });
    else await prisma.testimonial.create({ data: { tenantId, name, quote, rating } });
  } else if (type === "Articles") {
    const title = value(formData, "title");
    const slug = slugify(value(formData, "slug") || title);
    const content = value(formData, "content");
    if (!title || title.length > 200 || !slug || slug.length > 150 || !content || content.length > 100_000 || value(formData, "excerpt").length > 1000) redirect("/admin?section=Articles&error=required");
    const status = value(formData, "status") as PublishStatus;
    if (!Object.values(PublishStatus).includes(status)) redirect("/admin?section=Articles&error=required");
    const articleData = { title, slug, content, excerpt: value(formData, "excerpt") || null, status };
    if (id) await prisma.article.updateMany({ where: { id, tenantId }, data: articleData });
    else await prisma.article.create({ data: { tenantId, ...articleData } });
  }
  await writeAudit({ actorId: principal.userId, tenantId, action: id ? "CONTENT_UPDATED" : "CONTENT_CREATED", targetType: type, targetId: id || null });
  done(type);
}

export async function deleteContent(formData: FormData) {
  const id = value(formData, "id");
  const type = value(formData, "type");
  const { principal, tenantId } = await requireTenant("content:manage", value(formData, "tenantId") || null);
  if (!id || id.length > 64 || !["Services", "FAQs", "Testimonials", "Articles"].includes(type)) redirect("/admin?section=Dashboard&error=required");
  if (type === "Services") await prisma.service.deleteMany({ where: { id, tenantId } });
  if (type === "FAQs") await prisma.faq.deleteMany({ where: { id, tenantId } });
  if (type === "Testimonials") await prisma.testimonial.deleteMany({ where: { id, tenantId } });
  if (type === "Articles") await prisma.article.deleteMany({ where: { id, tenantId } });
  await writeAudit({ actorId: principal.userId, tenantId, action: "CONTENT_DELETED", targetType: type, targetId: id });
  done(type);
}

export async function savePage(formData: FormData) {
  const { principal, tenantId } = await requireTenant("content:manage", value(formData, "tenantId") || null);
  const id = value(formData, "id");
  const title = value(formData, "title");
  const slug = slugify(value(formData, "slug") || title);
  const status = value(formData, "status") as PublishStatus;
  if (!id || id.length > 64 || !title || title.length > 200 || !slug || slug.length > 150 || !Object.values(PublishStatus).includes(status)) redirect("/admin?section=Pages&error=required");
  let blocks: unknown;
  const blocksInput = value(formData, "blocks");
  if (!blocksInput || blocksInput.length > 100_000) redirect("/admin?section=Pages&error=json");
  try { blocks = JSON.parse(blocksInput); }
  catch { redirect("/admin?section=Pages&error=json"); }
  const allowedTypes = new Set(["hero", "doctor-profile", "services", "testimonials", "faq", "cta"]);
  if (!Array.isArray(blocks) || blocks.length > 50 || !safeJson(blocks) || blocks.some((item) => typeof item !== "object" || item === null || !("type" in item) || !allowedTypes.has(String(item.type)) || ("props" in item && (typeof item.props !== "object" || item.props === null || Array.isArray(item.props))))) redirect("/admin?section=Pages&error=json");
  if (value(formData, "visualEditor") === "1") {
    const updated = (blocks as unknown[]).filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && "type" in item && allowedTypes.has(String(item.type)),
    );
    const heroIndex = updated.findIndex((item) => item.type === "hero");
    const oldHero = heroIndex >= 0 && typeof updated[heroIndex].props === "object" && updated[heroIndex].props !== null
      ? updated[heroIndex].props as Record<string, unknown>
      : {};
    const heroEyebrow = value(formData, "heroEyebrow");
    const heroHeadline = value(formData, "heroHeadline");
    const heroCta = value(formData, "heroCta");
    if (heroEyebrow.length > 200 || heroHeadline.length > 500 || heroCta.length > 120) redirect("/admin?section=Pages&error=required");
    const hero = {
      ...oldHero,
      eyebrow: heroEyebrow,
      headline: heroHeadline,
      cta: heroCta,
    };
    if (heroIndex >= 0) updated[heroIndex] = { ...updated[heroIndex], props: hero };
    else updated.unshift({ type: "hero", props: hero });
    blocks = updated;
  }
  await prisma.page.updateMany({
    where: { id, tenantId },
    data: {
      title, slug, status, blocks: blocks as object,
      seoTitle: value(formData, "seoTitle").slice(0, 200) || null,
      seoDescription: value(formData, "seoDescription").slice(0, 500) || null,
    },
  });
  await writeAudit({ actorId: principal.userId, tenantId, action: "PAGE_UPDATED", targetType: "Page", targetId: id });
  done("Pages");
}

export async function saveSettings(formData: FormData) {
  const { principal, tenantId } = await requireTenant("website:manage", value(formData, "tenantId") || null);
  const siteTitle = value(formData, "siteTitle");
  const tagline = value(formData, "tagline");
  const phone = value(formData, "phone");
  const email = value(formData, "email");
  const address = value(formData, "address");
  const appointmentCta = value(formData, "appointmentCta");
  if (!tenantId || !siteTitle || siteTitle.length > 200 || tagline.length > 500 || phone.length > 40 || address.length > 2000 || appointmentCta.length > 120 || (email && !z.string().email().max(254).safeParse(email).success)) redirect("/admin?section=Settings&error=required");
  await prisma.siteSettings.upsert({
    where: { tenantId },
    create: {
      tenantId,
      siteTitle, tagline: tagline || null, phone: phone || null, email: email || null, address: address || null,
      appointmentCta: appointmentCta || "Request an appointment",
    },
    update: {
      siteTitle, tagline: tagline || null, phone: phone || null, email: email || null, address: address || null,
      appointmentCta: appointmentCta || "Request an appointment",
    },
  });
  await writeAudit({ actorId: principal.userId, tenantId, action: "SITE_SETTINGS_UPDATED", targetType: "SiteSettings", targetId: tenantId });
  done("Settings");
}

export async function saveTheme(formData: FormData) {
  const { principal, tenantId } = await requireTenant("website:manage", value(formData, "tenantId") || null);
  if (!tenantId) redirect("/admin?section=Settings&error=required");
  let tokens: unknown;
  const tokenInput = value(formData, "tokens");
  if (!tokenInput || tokenInput.length > 20_000) redirect("/admin?section=Settings&error=json");
  try { tokens = JSON.parse(tokenInput); }
  catch { redirect("/admin?section=Settings&error=json"); }
  if (typeof tokens !== "object" || tokens === null || Array.isArray(tokens) || !safeJson(tokens)) redirect("/admin?section=Settings&error=json");
  const themeName = value(formData, "themeName") || "Custom theme";
  if (themeName.length > 120) redirect("/admin?section=Settings&error=required");
  await prisma.theme.upsert({
    where: { tenantId },
    create: { tenantId, name: themeName, tokens: tokens as object },
    update: { name: themeName, tokens: tokens as object },
  });
  await writeAudit({ actorId: principal.userId, tenantId, action: "THEME_UPDATED", targetType: "Theme", targetId: tenantId });
  done("Settings");
}

export async function updateAppointmentStatus(formData: FormData) {
  const { principal, tenantId } = await requireTenant("appointments:manage", value(formData, "tenantId") || null);
  const id = value(formData, "id");
  const status = value(formData, "status") as AppointmentStatus;
  if (!id || id.length > 64 || !Object.values(AppointmentStatus).includes(status)) redirect("/admin?section=Appointments&error=required");
  await prisma.appointment.updateMany({ where: { id, tenantId }, data: { status } });
  await writeAudit({ actorId: principal.userId, tenantId, action: "APPOINTMENT_STATUS_UPDATED", targetType: "Appointment", targetId: id, metadata: { status } });
  done("Appointments");
}

function toMinutes(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export async function saveAvailability(formData: FormData) {
  const { principal, tenantId } = await requireTenant("availability:manage", value(formData, "tenantId") || null);
  const weekdayValue = value(formData, "weekday");
  const weekday = /^\d$/.test(weekdayValue) ? Number(weekdayValue) : -1;
  const startMinute = toMinutes(value(formData, "startTime"));
  const endMinute = toMinutes(value(formData, "endTime"));
  if (!tenantId || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 || startMinute === null || endMinute === null || endMinute <= startMinute) {
    redirect("/admin?section=Availability&error=required");
  }
  const availability = await prisma.availability.create({ data: { tenantId, weekday, startMinute, endMinute } });
  await writeAudit({ actorId: principal.userId, tenantId, action: "AVAILABILITY_CREATED", targetType: "Availability", targetId: availability.id });
  done("Availability");
}

export async function uploadMedia(formData: FormData) {
  const { principal, tenantId } = await requireTenant("content:manage", value(formData, "tenantId") || null);
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) redirect("/admin?section=Media%20Library&error=file");
  const bytes = Buffer.from(await file.arrayBuffer());
  const verified = inspectMedia(bytes, file.type);
  if (!tenantId || !verified) redirect("/admin?section=Media%20Library&error=file");
  const key = path.posix.join(tenantId, `${randomUUID()}${verified.extension}`);
  const storage = getStorage();
  const storageKey = await storage.put({ key, data: bytes, contentType: verified.mimeType });
  try {
    const media = await prisma.$transaction(async (tx) => {
      const created = await tx.media.create({
        data: {
          tenantId, type: verified.type, filename: safeMediaFilename(file.name), storageKey,
          mimeType: verified.mimeType, sizeBytes: bytes.byteLength,
          altText: value(formData, "altText").slice(0, 500) || null,
          caption: value(formData, "caption").slice(0, 500) || null,
          transcript: value(formData, "transcript").slice(0, 20_000) || null,
        },
      });
      await tx.auditLog.create({ data: { actorId: principal.userId, tenantId, action: "MEDIA_UPLOADED", targetType: "Media", targetId: created.id, metadata: { type: verified.type, sizeBytes: bytes.byteLength } } });
      return created;
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
  done("Media Library");
}

export async function deleteMedia(formData: FormData) {
  const id = value(formData, "id");
  const { principal, tenantId } = await requireTenant("content:manage", value(formData, "tenantId") || null);
  if (!id || id.length > 64) redirect("/admin?section=Media%20Library&error=required");
  const media = await prisma.media.findFirst({ where: { id, tenantId }, select: { storageKey: true } });
  if (media) {
    const removed = await prisma.$transaction(async (tx) => {
      const result = await tx.media.deleteMany({ where: { id, tenantId } });
      if (result.count) await tx.auditLog.create({ data: { actorId: principal.userId, tenantId, action: "MEDIA_DELETED", targetType: "Media", targetId: id } });
      return result.count;
    });
    if (removed) await getStorage().delete(media.storageKey).catch(() => undefined);
  }
  done("Media Library");
}
