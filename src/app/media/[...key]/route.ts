import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  if (!segments.length || segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) {
    return new Response("Not found", { status: 404 });
  }

  const storageKey = segments.join("/");
  const media = await prisma.media.findFirst({ where: { storageKey }, select: { mimeType: true, filename: true } });
  if (!media) return new Response("Not found", { status: 404 });

  try {
    const file = await getStorage().get(storageKey);
    const isDocument = media.mimeType === "application/pdf";
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(file.byteLength),
        "Content-Disposition": `${isDocument ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(media.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
