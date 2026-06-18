import { NextResponse } from "next/server";
import { getOrder } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("order");
  if (!id) {
    return NextResponse.json({ error: "no order id" }, { status: 400 });
  }

  const order = await getOrder(id);
  if (!order) {
    return NextResponse.json({ status: "unknown" }, { status: 404 });
  }

  return NextResponse.json({
    status: order.status,
    filePath: order.file_path,
  });
}
