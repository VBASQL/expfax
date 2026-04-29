import { NextResponse } from "next/server";
import { containers } from "@/lib/db/cosmos";
import type { User } from "@/types";

/**
 * Email-first login lookup. Returns the auth method to use, or pretends a
 * password account exists (so we don't leak which emails are registered).
 */
export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ action: "password" });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ action: "password" });
  }

  const container = await containers.users();
  const { resources } = await container.items
    .query<User>({
      query:
        "SELECT * FROM c WHERE LOWER(c.email) = @email AND c.isActive = true",
      parameters: [{ name: "@email", value: email }],
    })
    .fetchAll();

  const user = resources[0];

  // Unknown email → fake a password prompt to avoid user enumeration.
  if (!user) {
    return NextResponse.json({ action: "password" });
  }

  if (user.authType === "microsoft") {
    return NextResponse.json({
      action: "redirect",
      url: `/api/auth/microsoft?login_hint=${encodeURIComponent(user.email)}`,
    });
  }

  return NextResponse.json({ action: "password" });
}
