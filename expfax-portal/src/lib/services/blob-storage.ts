import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { getConfig } from "@/lib/config";

let blobServiceClient: BlobServiceClient | null = null;

async function getClient(): Promise<BlobServiceClient> {
  if (blobServiceClient) return blobServiceClient;

  const config = await getConfig();

  if (config.storageBlobEndpoint) {
    // Production: managed identity
    const tenantId = process.env.AZURE_TENANT_ID;
    const credential = new DefaultAzureCredential(tenantId ? { tenantId } : undefined);
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
 * Upload the converted documents for a sent fax.
 * Stored at: sent-documents/{userId}/{year}/{month}/{messageHandle}/{index}_{filename}
 * Returns an array of full blob paths (one per document).
 */
export async function uploadSentDocuments(
  userId: string,
  messageHandle: string,
  documents: Array<{ name: string; contentBase64: string }>
): Promise<string[]> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const containerClient = await getContainerClient("sent-documents");
  const paths: string[] = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    // Sanitise filename for use in blob path
    const safeName = doc.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobPath = `${userId}/${year}/${month}/${messageHandle}/${i}_${safeName}`;
    const buf = Buffer.from(doc.contentBase64, "base64");
    const ext = safeName.split(".").pop()?.toLowerCase() ?? "";
    const contentType =
      ext === "pdf" ? "application/pdf" :
      ext === "tiff" || ext === "tif" ? "image/tiff" :
      ext === "rtf" ? "application/rtf" :
      "application/octet-stream";

    const blobClient = containerClient.getBlockBlobClient(blobPath);
    await blobClient.upload(buf, buf.length, { blobHTTPHeaders: { blobContentType: contentType } });
    paths.push(`sent-documents/${blobPath}`);
  }

  return paths;
}

/**
 * Upload draft attachment files to Blob Storage.
 * Stored at: drafts/{userId}/{draftId}/{filename}
 * Returns an array of full blob paths.
 */
export async function uploadDraftFiles(
  userId: string,
  draftId: string,
  files: Array<{ name: string; contentBase64: string }>
): Promise<string[]> {
  const containerClient = await getContainerClient("drafts");
  const paths: string[] = [];

  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobPath = `${userId}/${draftId}/${safeName}`;
    const buf = Buffer.from(file.contentBase64, "base64");
    const blobClient = containerClient.getBlockBlobClient(blobPath);
    await blobClient.upload(buf, buf.length, {
      blobHTTPHeaders: { blobContentType: "application/octet-stream" },
    });
    paths.push(`drafts/${blobPath}`);
  }

  return paths;
}

/**
 * Generate a short-lived SAS URL for a draft attachment file.
 * Valid for 30 minutes.
 */
export async function getDraftFileUrl(fullPath: string): Promise<string> {
  const firstSlash = fullPath.indexOf("/");
  const containerName = fullPath.substring(0, firstSlash);
  const blobPath = fullPath.substring(firstSlash + 1);

  const containerClient = await getContainerClient(containerName);
  const blobClient = containerClient.getBlockBlobClient(blobPath);

  const expiresOn = new Date(Date.now() + 30 * 60 * 1000);
  const sas = await blobClient.generateSasUrl({
    permissions: { read: true } as any,
    expiresOn,
  });
  return sas;
}

/**
 * Delete multiple blobs by their full paths (container/blobPath format).
 */
export async function deleteBlobsByPaths(paths: string[]): Promise<void> {
  for (const fullPath of paths) {
    const firstSlash = fullPath.indexOf("/");
    const containerName = fullPath.substring(0, firstSlash);
    const blobPath = fullPath.substring(firstSlash + 1);
    const containerClient = await getContainerClient(containerName);
    await containerClient.getBlockBlobClient(blobPath).deleteIfExists();
  }
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

  await client.getUserDelegationKey(now, expiresOn);

  const sas = await blobClient.generateSasUrl({
    permissions: { read: true } as any,
    expiresOn,
  });

  return sas;
}
