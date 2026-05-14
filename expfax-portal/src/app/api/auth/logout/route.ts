import { NextResponse } from "next/server";
import { destroySession, validateSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit/logger";

export async function POST() {
  const { session, user } = await validateSession();
  if (session) {
    await destroySession(session.id, session.userId);
  }
  if (user) {
    await audit({
      userId: user.id,
      action: "auth.logout",
      resourceType: "session",
      resourceId: session?.id ?? "unknown",
    });
  }

  return NextResponse.json({ success: true, redirectTo: "/login" });
}
