const FAXBACK_ERROR_MAP: Record<string, { message: string; retryable: boolean }> = {
  "101": { message: "Invalid session — re-authenticating", retryable: true },
  "102": { message: "Invalid login credentials", retryable: false },
  "201": { message: "Account not found", retryable: false },
  "202": { message: "Account disabled", retryable: false },
  "301": { message: "Invalid fax number format", retryable: false },
  "302": { message: "Fax number not reachable", retryable: false },
  "303": { message: "Fax busy — will retry", retryable: true },
  "304": { message: "No answer from fax machine", retryable: true },
  "305": { message: "Fax transmission failed", retryable: true },
  "401": { message: "Document format not supported", retryable: false },
  "402": { message: "Document too large", retryable: false },
  "403": { message: "Empty document", retryable: false },
  "501": { message: "Queue is full", retryable: true },
  "502": { message: "Service temporarily unavailable", retryable: true },
};

export interface FaxBackError {
  code: string;
  message: string;
  retryable: boolean;
  rawMessage?: string;
}

export function mapFaxBackError(errorCode: string, rawMessage?: string): FaxBackError {
  const mapped = FAXBACK_ERROR_MAP[errorCode];
  if (mapped) {
    return { code: errorCode, ...mapped, rawMessage };
  }
  return {
    code: errorCode,
    message: rawMessage || `FaxBack error (code: ${errorCode})`,
    retryable: false,
    rawMessage,
  };
}

export function isFaxBackRetryable(errorCode: string): boolean {
  return FAXBACK_ERROR_MAP[errorCode]?.retryable ?? false;
}
