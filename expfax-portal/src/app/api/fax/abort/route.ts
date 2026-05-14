import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth/session";
import { readMessage, abortMessage } from "@/lib/faxback/messages";
import { audit } from "@/lib/audit/logger";

export async function POST(request: NextRequest) {
  const { valid, user } = await validateSession();
  if (!valid || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const messageHandle = typeof body?.messageHandle === "string" ? body.messageHandle.trim() : "";

  if (!messageHandle) {
    return NextResponse.json({ error: "messageHandle required" }, { status: 400 });
  }

  if (!user.faxbackAccountGuid) {
    return NextResponse.json({ error: "No FaxBack account linked" }, { status: 403 });
  }

  try {
    // Verify ownership before aborting
    const detail = await readMessage(messageHandle);
    const m = detail as Record<string, unknown>;
    if (String(m.AccountGuid || "") !== user.faxbackAccountGuid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await abortMessage(messageHandle);
    await audit({
      userId: user.id,
      action: "fax.abort",
      resourceType: "fax",
      resourceId: messageHandle,
      request,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Abort fax error:", error);
    return NextResponse.json({ error: "Failed to abort fax" }, { status: 500 });
  }
}
