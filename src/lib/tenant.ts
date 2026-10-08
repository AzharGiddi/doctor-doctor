import { prisma } from "./prisma";
export async function getTenantBySlug(slug: string, preview = false) {
  return prisma.tenant.findUnique({
    where:{slug},
    include:{
      doctor:true, settings:true, theme:true,
      services:{where:{active:true}},
      navigation:{where:{visible:true},orderBy:{sortOrder:"asc"}},
      pages:{where:{slug:"home",...(preview ? {} : { status:"PUBLISHED" })},take:1},
      testimonials:{where:{published:true},take:6},
      faqs:{where:{published:true},orderBy:{sortOrder:"asc"},take:10},
      media:{where:{type:"IMAGE"},orderBy:{createdAt:"desc"},take:6},
    }
  });
}
