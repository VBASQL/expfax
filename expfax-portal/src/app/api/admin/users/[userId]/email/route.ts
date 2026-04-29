import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getAccountEmailSettings, updateEmailConfig } from "@/lib/faxback/accounts";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;
  const container = await containers.users();
  const { resource: targetUser } = await container.item(userId, userId).read();
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const settings = await getAccountEmailSettings(targetUser.faxbackAccountGuid);
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;
  const container = await containers.users();
  const { resource: targetUser } = await container.item(userId, userId).read();
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const config = await request.json();

  // updateEmailConfig takes a single UpdateEmailConfigParams object
  await updateEmailConfig({
    accountGuid: targetUser.faxbackAccountGuid,
    inboundAlias: config.inboundEnabled && config.emailAlias ? config.emailAlias : null,
    outbound: config.outboundEnabled
      ? {
          deliveryEmail: config.deliveryEmail ?? "",
          attachmentFormat: config.format === "tiff" ? "tif" : "pdf",
          deliveryNotification: config.notifyOnSend ?? false,
          nonDeliveryNotification: config.notifyOnFail ?? false,
        }
      : null,
    useCoverPage: config.includeCoverPage ?? false,
  });

  return NextResponse.json({ success: true });
}
