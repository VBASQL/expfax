import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

// Dev-only endpoint to seed mock notifications for testing the notification bell.
// POST  /api/dev/mock-notifications?count=20   -> inserts mock fax messages
// DELETE /api/dev/mock-notifications           -> removes them (hard delete)
function devGuard() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_ENDPOINTS !== "true") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
  }
  return null;
}

const MOCK_TAG = "__mock_notification__";

const senders = [
  { name: "Acme Medical Group", number: "+15551234567" },
  { name: "Riverside Clinic", number: "+15557654321" },
  { name: "City Hospital", number: "+12125550199" },
  { name: "Lakeside Pharmacy", number: "+13105550142" },
  { name: "Downtown Dental", number: "+14155550188" },
  { name: "Sunset Imaging", number: "+16175550133" },
  { name: "Northwest Labs", number: "+12065550155" },
  { name: "Eastside Family Practice", number: "+17035550177" },
];

const subjects = [
  "Patient referral",
  "Lab results",
  "Insurance authorization",
  "Prescription request",
  "Records request",
  "Appointment confirmation",
  "Billing inquiry",
  "Discharge summary",
];

export async function POST(req: Request) {
  const blocked = devGuard();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const count = Math.min(parseInt(url.searchParams.get("count") || "20", 10) || 20, 100);
  const mix = url.searchParams.get("mix") || "both"; // received | sent | both

  const container = await containers.faxMessages();
  const now = Date.now();
  const created: string[] = [];

  for (let i = 0; i < count; i++) {
    const isReceived =
      mix === "received" ? true : mix === "sent" ? false : i % 2 === 0;
    const sender = senders[i % senders.length];
    const subject = subjects[i % subjects.length];
    const submitTime = new Date(now - i * 60_000).toISOString();
    const id = `mock-${now}-${i}`;
    const pageCount = 1 + (i % 5);

    const doc = {
      id,
      userId: user.id,
      messageHandle: id,
      direction: isReceived ? "received" : "sent",
      status: isReceived ? "received" : i % 3 === 0 ? "failed" : "sent",
      statusNum: 0,
      queue: 0,
      subject: isReceived ? "" : subject,
      senderName: isReceived ? sender.name : "",
      senderCompany: "",
      senderFaxNumber: isReceived ? sender.number : "",
      coverTemplate: "",
      appInfo: "",
      billingCode: "",
      resolution: 0,
      submitTime,
      scheduleTime: null,
      isRead: false,
      isDeleted: false,
      faxImagePath: "",
      sentDocumentPaths: [],
      tags: [MOCK_TAG],
      recipients: isReceived
        ? []
        : [{ name: sender.name, faxNumber: sender.number }],
      documents: [{ name: `${subject || "fax"}.pdf`, pageCount, blobPath: "" }],
      createdAt: submitTime,
      updatedAt: submitTime,
    };

    await container.items.create(doc);
    created.push(id);
  }

  return NextResponse.json({ success: true, created: created.length });
}

export async function DELETE() {
  const blocked = devGuard();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();
  const { resources } = await container.items
    .query<{ id: string }>({
      query: "SELECT c.id FROM c WHERE c.userId = @uid AND ARRAY_CONTAINS(c.tags, @tag)",
      parameters: [
        { name: "@uid", value: user.id },
        { name: "@tag", value: MOCK_TAG },
      ],
    })
    .fetchAll();

  for (const r of resources) {
    await container.item(r.id, user.id).delete();
  }

  return NextResponse.json({ success: true, deleted: resources.length });
}
