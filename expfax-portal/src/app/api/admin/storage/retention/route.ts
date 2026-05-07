import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

interface RetentionConfig {
  id: string;
  userId: string;
  globalRetentionDays: number;
  overrides: Array<{ userId: string; retentionDays: number; reason: string }>;
  updatedAt: string;
}

const DOC_ID = "retention-config";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const container = await containers.users();
  const { resource } = await container.item(DOC_ID, DOC_ID).read<RetentionConfig>();

  if (!resource) {
    return NextResponse.json({
      id: DOC_ID,
      userId: DOC_ID,
      globalRetentionDays: 365,
      overrides: [],
      updatedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json(resource);
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const container = await containers.users();

  const config: RetentionConfig = {
    id: DOC_ID,
    userId: DOC_ID,
    globalRetentionDays: body.globalRetentionDays ?? 365,
    overrides: body.overrides ?? [],
    updatedAt: new Date().toISOString(),
  };

  await container.items.upsert(config);
  return NextResponse.json(config);
}
