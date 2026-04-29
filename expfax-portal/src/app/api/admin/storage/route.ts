import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const endpoint = process.env.STORAGE_BLOB_ENDPOINT;
  if (!endpoint) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const credential = new DefaultAzureCredential(tenantId ? { tenantId } : undefined);
  const blobService = new BlobServiceClient(endpoint, credential);

  async function getStats(containerName: string) {
    let count = 0;
    let sizeBytes = 0;
    try {
      const container = blobService.getContainerClient(containerName);
      for await (const blob of container.listBlobsFlat()) {
        count++;
        sizeBytes += blob.properties.contentLength ?? 0;
      }
    } catch {
      // container may not exist yet
    }
    return { count, sizeMB: Math.round(sizeBytes / (1024 * 1024) * 100) / 100 };
  }

  const [received, sent] = await Promise.all([getStats("received"), getStats("sent")]);

  return NextResponse.json({
    received,
    sent,
    total: {
      count: received.count + sent.count,
      sizeMB: Math.round((received.sizeMB + sent.sizeMB) * 100) / 100,
    },
  });
}
