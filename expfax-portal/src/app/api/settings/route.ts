import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Settings stored directly on the user document
  return NextResponse.json({
    displayName: user.displayName,
    email: user.email,
    faxNumber: user.faxNumber,
    preferences: user.preferences || {
      notifyOnReceive: true,
      notifyOnSendComplete: false,
      defaultCoverTemplate: null,
      itemsPerPage: 20,
      timezone: "America/New_York",
    },
  });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const container = await containers.users();

  await container.item(user.id, user.id).patch([
    {
      op: "set",
      path: "/preferences",
      value: {
        notifyOnReceive: body.notifyOnReceive ?? true,
        notifyOnSendComplete: body.notifyOnSendComplete ?? false,
        defaultCoverTemplate: body.defaultCoverTemplate || null,
        itemsPerPage: body.itemsPerPage || 20,
        timezone: body.timezone || "America/New_York",
      },
    },
    { op: "set", path: "/updatedAt", value: new Date().toISOString() },
  ]);

  return NextResponse.json({ success: true });
}
