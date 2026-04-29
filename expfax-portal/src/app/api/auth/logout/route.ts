import { NextResponse } from "next/server";
import { destroySession, validateSession } from "@/lib/auth/session";

export async function POST() {
  const { session } = await validateSession();
  if (session) {
    await destroySession(session.id, session.userId);
  }

  return NextResponse.json({ success: true, redirectTo: "/login" });
}
