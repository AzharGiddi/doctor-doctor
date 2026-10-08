import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

type Fixture = { email: string; password: string; tenantId: string; tenantSlug: string };
const fixture = JSON.parse(readFileSync(path.join(process.cwd(), "test-results", "e2e-fixture.json"), "utf8")) as Fixture;

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("anonymous visitors are redirected to the login screen", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("admin can log in, reach the dashboard, and log out", async ({ page, context }) => {
  await loginAsAdmin(page);
  await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
  const sessionCookie = (await context.cookies()).find((cookie) => cookie.name === "doctor_platform_session");
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie?.httpOnly).toBe(true);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("super admin can create a reusable tenant website", async ({ page }) => {
  const slug = `e2e-created-${Date.now()}`;
  await loginAsAdmin(page);
  await page.goto("/admin?section=Websites");
  await page.getByLabel("Practice name").fill("Created E2E Clinic");
  await page.getByLabel("Website address").fill(slug);
  await page.getByLabel("Doctor name").fill("Dr. Test Clinician");
  await page.getByLabel("Doctor title").fill("Consultant Physician");
  await page.getByLabel("Website template").selectOption("cardiology");
  await page.getByRole("button", { name: "Create practice" }).click();
  const prisma = new PrismaClient();
  try {
    await expect(page).toHaveURL(/section=Websites.*saved=1/);
    await expect(page.getByRole("table").getByText(`/site/${slug}`, { exact: true })).toBeVisible();
    const createdTenant = await prisma.tenant.findUnique({ where: { slug }, select: { name: true, template: true } });
    expect(createdTenant).toEqual({ name: "Created E2E Clinic", template: "cardiology" });
    await page.goto(`/site/${slug}`);
    await expect(page.getByRole("heading", { name: "Care that sees the whole person" })).toBeVisible();
  } finally {
    await prisma.tenant.deleteMany({ where: { slug } });
    await prisma.$disconnect();
  }
});

test("invalid login shows a generic error", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill(`unknown-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/login\?error=credentials/);
  await expect(page.getByText("Email or password is incorrect.", { exact: true })).toBeVisible();
});

test("tenant website renders its own published content", async ({ page }) => {
  await page.goto(`/site/${fixture.tenantSlug}`);
  await expect(page.getByText("E2E clinic homepage")).toBeVisible();
  await expect(page.getByText("E2E Test Clinic").first()).toBeVisible();
});

test("public appointment requests are stored against the resolved tenant", async ({ page }) => {
  const email = `booking-${fixture.tenantSlug}@example.test`;
  await page.goto(`/site/${fixture.tenantSlug}#booking`);
  await page.getByLabel("Your name").fill("Test Patient");
  await page.getByLabel("Phone number").fill("9876543210");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Preferred date & time").fill(new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: /Send appointment request/ }).click();
  await expect(page.getByText("Thank you. Your appointment request has been sent to the practice.")).toBeVisible();

  const prisma = new PrismaClient();
  try {
    const appointment = await prisma.appointment.findFirst({ where: { patientEmail: email } });
    expect(appointment?.tenantId).toBe(fixture.tenantId);
  } finally {
    await prisma.$disconnect();
  }
});
