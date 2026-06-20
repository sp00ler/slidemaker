import { NextResponse } from "next/server";
import { saveUpload, UploadError } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const uploadToken = String(form.get("uploadToken") || "").trim();
    const slideNumber = Number(form.get("slideNumber"));
    const descriptionRaw = String(form.get("description") || "").trim();
    const files = form.getAll("file");

    if (files.length !== 1 || !(files[0] instanceof File)) {
      return NextResponse.json({ error: "Нужен один файл" }, { status: 400 });
    }

    const result = await saveUpload({
      uploadToken,
      slideNumber,
      file: files[0],
      description: descriptionRaw || null,
    });

    return NextResponse.json({ ok: true, slideNumber: result.slideNumber });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("upload failed:", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}
