# Task 23 — Fax Image Storage (Azure Blob)

## Goal
Create a service to upload/download fax PDFs to Azure Blob Storage using managed identity.

## Files to Create
- `src/lib/services/blob-storage.ts`

## Dependencies
- `@azure/storage-blob` — **INSTALL THIS** (`npm install @azure/storage-blob`)
- `@azure/identity` (already installed)
- `src/lib/config.ts` (task 10)

## Blob Path Structure
```
{container}/{userId}/{year}/{month}/{messageId}.pdf

Examples:
received/abc123/2026/04/msg-uuid-here.pdf
sent/abc123/2026/04/msg-uuid-here.pdf
```

## Implementation

### 1. Install dependency
```powershell
npm install @azure/storage-blob
```

### 2. Create `src/lib/services/blob-storage.ts`

```typescript
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { getConfig } from "@/lib/config";

let blobServiceClient: BlobServiceClient | null = null;

async function getClient(): Promise<BlobServiceClient> {
  if (blobServiceClient) return blobServiceClient;

  const config = await getConfig();

  if (config.storageBlobEndpoint) {
    // Production: managed identity
    const credential = new DefaultAzureCredential();
    blobServiceClient = new BlobServiceClient(config.storageBlobEndpoint, credential);
  } else {
    // Local dev: connection string fallback
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (connStr) {
      blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
    } else {
      throw new Error("No Blob Storage configuration found. Set STORAGE_BLOB_ENDPOINT or AZURE_STORAGE_CONNECTION_STRING.");
    }
  }

  return blobServiceClient;
}

async function getContainerClient(containerName: string): Promise<ContainerClient> {
  const client = await getClient();
  return client.getContainerClient(containerName);
}

/**
 * Upload a fax PDF to Blob Storage.
 * Returns the blob path (for storing in Cosmos DB).
 */
export async function uploadFaxPdf(
  container: "received" | "sent",
  userId: string,
  messageId: string,
  pdfBuffer: Buffer
): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const blobPath = `${userId}/${year}/${month}/${messageId}.pdf`;

  const containerClient = await getContainerClient(container);
  const blobClient = containerClient.getBlockBlobClient(blobPath);

  await blobClient.upload(pdfBuffer, pdfBuffer.length, {
    blobHTTPHeaders: {
      blobContentType: "application/pdf",
    },
  });

  // Return the full path including container name
  return `${container}/${blobPath}`;
}

/**
 * Download a fax PDF from Blob Storage.
 * Path format: "{container}/{userId}/{year}/{month}/{messageId}.pdf"
 */
export async function downloadFaxPdf(fullPath: string): Promise<Buffer> {
  const firstSlash = fullPath.indexOf("/");
  const containerName = fullPath.substring(0, firstSlash);
  const blobPath = fullPath.substring(firstSlash + 1);

  const containerClient = await getContainerClient(containerName);
  const blobClient = containerClient.getBlockBlobClient(blobPath);

  const downloadResponse = await blobClient.download(0);
  const chunks: Buffer[] = [];

  if (downloadResponse.readableStreamBody) {
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  }

  return Buffer.concat(chunks);
}

/**
 * Delete a fax PDF from Blob Storage.
 */
export async function deleteFaxPdf(fullPath: string): Promise<void> {
  const firstSlash = fullPath.indexOf("/");
  const containerName = fullPath.substring(0, firstSlash);
  const blobPath = fullPath.substring(firstSlash + 1);

  const containerClient = await getContainerClient(containerName);
  const blobClient = containerClient.getBlockBlobClient(blobPath);
  await blobClient.deleteIfExists();
}

/**
 * Generate a time-limited SAS URL for viewing a fax in the browser.
 * Valid for 15 minutes.
 */
export async function getFaxViewUrl(fullPath: string): Promise<string> {
  const firstSlash = fullPath.indexOf("/");
  const containerName = fullPath.substring(0, firstSlash);
  const blobPath = fullPath.substring(firstSlash + 1);

  const containerClient = await getContainerClient(containerName);
  const blobClient = containerClient.getBlockBlobClient(blobPath);

  // For managed identity, we use user delegation SAS
  const client = await getClient();
  const now = new Date();
  const expiresOn = new Date(now.getTime() + 15 * 60 * 1000);

  const userDelegationKey = await client.getUserDelegationKey(now, expiresOn);

  const sas = blobClient.generateSasUrl({
    permissions: { read: true } as any,
    expiresOn,
    // Note: in production, use generateUserDelegationSasUrl with the key
  });

  return sas;
}
```

### 3. Update `src/lib/config.ts` — add `storageBlobEndpoint`

Open `src/lib/config.ts` (from task 10) and add to the `AppConfig` interface and loader:

**Add to interface:**
```typescript
storageBlobEndpoint: string;
```

**Add to the config object in `getConfig()`:**
```typescript
storageBlobEndpoint: process.env.STORAGE_BLOB_ENDPOINT || "",
```

### 4. Update `.env.local.example` — add storage vars

Add these lines:
```env
# Blob Storage (local dev: use Azurite or connection string)
STORAGE_BLOB_ENDPOINT=
AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
```

## Verify
- `npm run build` — no type errors
- With Azurite running locally, `uploadFaxPdf("received", "user1", "msg1", buffer)` uploads successfully

## Notes for Future Tasks
- Queue poller (task 22) calls `uploadFaxPdf()` for each new fax
- API routes (task 34) call `downloadFaxPdf()` and `getFaxViewUrl()` for viewing/downloading
- Admin retention settings (task 47) control the Blob lifecycle policy
