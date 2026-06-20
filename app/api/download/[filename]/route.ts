import path from "path";
import { promises as fs } from "fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_NAME = /^[a-z0-9_-]+\.pptx$/i;
const DOWNLOADS_DIR = path.join(process.cwd(), "public", "downloads");

export async function GET(
  _req: Request,
  { params }: { params: { filename: string } }
) {
  const { filename } = params;

  if (!SAFE_NAME.test(filename)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const filePath = path.join(DOWNLOADS_DIR, filename);
  const resolved = path.resolve(filePath);
  if (resolved !== filePath || !resolved.startsWith(DOWNLOADS_DIR + path.sep)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(resolved);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "Content-Length": String(data.length),
    },
  });
}
