import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/credentials";
const prisma = new PrismaClient();
async function main() {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (adminEmail || adminPassword) {
    if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || !adminPassword || adminPassword.length < 12 || adminPassword.length > 256) {
      throw new Error("Set a valid BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of 12–256 characters together.");
    }
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: { email: adminEmail, passwordHash: await hashPassword(adminPassword), role: "SUPER_ADMIN" },
    });
    console.log(`Provisioned Super Admin: ${adminEmail}`);
  }
  const tenant = await prisma.tenant.upsert({
    where: { slug: "madilu-womens-health" },
    update: {},
    create: {
      slug: "madilu-womens-health",
      name: "Madilu Women's Health",
      settings: { create: { siteTitle: "Madilu Women's Health", tagline: "Compassionate, expert women's healthcare" } },
      theme: { create: { name: "Women's Health Editorial", tokens: {
        primary:"#123B3B", secondary:"#A96B72", background:"#F8F5EF", surface:"#FFFFFF", text:"#1C2525",
        radius:"18px", headingFont:"serif", bodyFont:"sans-serif"
      }}},
      doctor: { create: {
        name:"Dr. Sunitha T", slug:"dr-sunitha-t",
        title:"Consultant Obstetrician & Gynaecologist", qualifications:[],
        specialties:["Antenatal Care","High-Risk Pregnancy","Gynaecology","PCOS","Menopause"]
      }},
      pages: { create: [{
        slug:"home", title:"Home", status:"PUBLISHED",
        blocks:[
          {type:"hero",props:{eyebrow:"Madilu Women's Health",headline:"Expert care for every stage of womanhood",cta:"Book Appointment"}},
          {type:"doctor-profile",props:{title:"Meet Your Doctor"}},
          {type:"services",props:{title:"Women's Health Services"}},
          {type:"testimonials",props:{title:"Patient Stories"}},
          {type:"faq",props:{title:"Frequently Asked Questions"}},
          {type:"cta",props:{title:"Take the next step in your care"}}
        ]
      }]},
      services: { create: [
        {slug:"antenatal-care",name:"Antenatal Care",shortDescription:"Personalised care throughout pregnancy"},
        {slug:"high-risk-pregnancy",name:"High-Risk Pregnancy",shortDescription:"Specialist monitoring and coordinated care"},
        {slug:"gynaecology",name:"Gynaecology",shortDescription:"Comprehensive care for women's health"},
        {slug:"pcos",name:"PCOS",shortDescription:"Evidence-based support for PCOS"},
        {slug:"menopause",name:"Menopause",shortDescription:"Guidance for a healthy menopause transition"}
      ]}
    }
  });
  if (await prisma.faq.count({ where: { tenantId: tenant.id } }) === 0) {
    await prisma.faq.createMany({
      data: [
        { tenantId: tenant.id, question: "How do I request an appointment?", answer: "Send an appointment request with your preferred date and time. The practice team will contact you to confirm availability." },
        { tenantId: tenant.id, question: "What if I am not sure which service I need?", answer: "Choose the option that seems closest, or leave the service blank. The practice team can help direct your request." },
        { tenantId: tenant.id, question: "Is my appointment confirmed when I submit the form?", answer: "No. The form sends a request. The practice will contact you to confirm the appointment." },
      ],
    });
  }
  console.log(`Seeded tenant: ${tenant.slug}`);
}
main().catch(console.error).finally(()=>prisma.$disconnect());
