"use server";

import { AppointmentStatus, ConsultationType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bookingError(slug: string, reason: string): never {
  redirect(`/site/${encodeURIComponent(slug)}?booking=${reason}#booking`);
}

export async function requestAppointment(formData: FormData) {
  const slug = formValue(formData, "tenantSlug");
  const patientName = formValue(formData, "patientName");
  const patientPhone = formValue(formData, "patientPhone");
  const patientEmail = formValue(formData, "patientEmail");
  const startsAt = new Date(formValue(formData, "startsAt"));
  const serviceId = formValue(formData, "serviceId");
  const consultationType = formValue(formData, "consultationType") as ConsultationType;

  if (!slug || !patientName || patientName.length > 120 || patientPhone.length > 32 || !/^[+\d().\s-]{7,32}$/.test(patientPhone)) bookingError(slug, "details");
  if (patientEmail && (patientEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail))) bookingError(slug, "details");
  if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() < Date.now() || startsAt.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) bookingError(slug, "date");
  if (!Object.values(ConsultationType).includes(consultationType)) bookingError(slug, "details");

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!tenant || tenant.status !== "ACTIVE") bookingError(slug, "unavailable");

  const service = serviceId
    ? await prisma.service.findFirst({ where: { id: serviceId, tenantId: tenant.id, active: true } })
    : null;
  if (serviceId && !service) bookingError(slug, "service");

  const durationMinutes = service?.durationMinutes ?? 30;
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  const weekday = startsAt.getDay();
  const startMinute = startsAt.getHours() * 60 + startsAt.getMinutes();
  const endMinute = startMinute + durationMinutes;
  const hours = await prisma.availability.findMany({ where: { tenantId: tenant.id, weekday, active: true } });
  if (hours.length && !hours.some((slot) => startMinute >= slot.startMinute && endMinute <= slot.endMinute)) bookingError(slug, "hours");

  try {
    const created = await prisma.$transaction(async (tx) => {
      const conflict = await tx.appointment.findFirst({
        where: {
          tenantId: tenant.id,
          status: { not: AppointmentStatus.CANCELLED },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { id: true },
      });
      if (conflict) return false;
      const appointment = await tx.appointment.create({
        data: {
          tenantId: tenant.id,
          serviceId: service?.id,
          patientName,
          patientPhone,
          patientEmail: patientEmail || null,
          startsAt,
          endsAt,
          consultationType,
          notes: formValue(formData, "notes").slice(0, 1000) || null,
        },
      });
      await tx.auditLog.create({ data: { tenantId: tenant.id, action: "APPOINTMENT_REQUESTED", targetType: "Appointment", targetId: appointment.id } });
      return appointment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!created) bookingError(slug, "taken");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2004")) bookingError(slug, "taken");
    throw error;
  }

  revalidatePath("/admin");
  redirect(`/site/${encodeURIComponent(slug)}?booking=received#booking`);
}
