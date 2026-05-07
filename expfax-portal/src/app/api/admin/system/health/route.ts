import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getLoginId } from "@/lib/faxback/session";

interface Check {
  name: string;
  status: "healthy" | "degraded";
  message: string;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const checks: Check[] = [];

  // 1. FaxBack — getLoginId() always returns a non-empty string or throws
  try {
    const loginId = await getLoginId();
    checks.push({
      name: "faxback",
      status: loginId ? "healthy" : "degraded",
      message: loginId ? `Connected (login ID: ${loginId})` : "Session not initialized",
    });
  } catch (err) {
    checks.push({
      name: "faxback",
      status: "degraded",
      message: err instanceof Error ? err.message : "Connection failed",
    });
  }

  // 2. Cosmos DB
  try {
    const container = await containers.users();
    await container.items.query("SELECT TOP 1 c.id FROM c").fetchAll();
    checks.push({ name: "cosmos", status: "healthy", message: "Connected" });
  } catch (err) {
    checks.push({
      name: "cosmos",
      status: "degraded",
      message: err instanceof Error ? err.message : "Connection failed",
    });
  }

  // 3. Storage
  const storageEndpoint = process.env.STORAGE_BLOB_ENDPOINT;
  checks.push({
    name: "storage",
    status: storageEndpoint ? "healthy" : "degraded",
    message: storageEndpoint ? "Endpoint configured" : "STORAGE_BLOB_ENDPOINT not set",
  });

  // Env var names taken from src/lib/config.ts
  const ENV_VARS = [
    "COSMOS_ENDPOINT",
    "COSMOS_DATABASE",
    "STORAGE_BLOB_ENDPOINT",
    "SESSION_SECRET",
    "ENTRA_TENANT_ID",
    "ENTRA_CLIENT_ID",
    "FAXBACK_API_URL",
  ];

  const environment = ENV_VARS.map((name) => ({ name, set: Boolean(process.env[name]) }));

  const overall: "healthy" | "degraded" = checks.every((c) => c.status === "healthy")
    ? "healthy"
    : "degraded";

  return NextResponse.json({
    overall,
    checks,
    environment,
    build: {
      buildTime: new Date().toISOString(),
      nodeVersion: process.version,
    },
  });
}
