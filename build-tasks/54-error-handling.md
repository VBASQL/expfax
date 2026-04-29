# Task 54 — Global Error Handling & FaxBack Error Mapping

## Goal
Create global error handling utilities: error boundary, FaxBack error code mapping, toast notifications, API error middleware.

## Files to Create
- `src/lib/errors.ts`
- `src/lib/faxback/errors.ts`
- `src/components/error-boundary.tsx`
- `src/components/toast-provider.tsx`
- `src/app/error.tsx`
- `src/app/not-found.tsx`

## Dependencies
- Next.js App Router error conventions
- `sonner` — toast notification library (**INSTALL**: `npm install sonner`)

## Implementation

### 1. Install sonner
```powershell
npm install sonner
```

### 2. Create `src/lib/errors.ts`

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = "INTERNAL_ERROR",
    public detail?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      detail: this.detail,
    };
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, detail?: Record<string, unknown>) {
    super(message, 400, "VALIDATION_ERROR", detail);
  }
}

/**
 * Wrap an API route handler with automatic error handling.
 *
 * @example
 * export const GET = withErrorHandler(async (req) => {
 *   const user = await requireAuth();
 *   return NextResponse.json({ data });
 * });
 */
export function withErrorHandler(
  handler: (request: Request, context?: any) => Promise<Response>
) {
  return async (request: Request, context?: any): Promise<Response> => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof AppError) {
        return Response.json(error.toJSON(), { status: error.statusCode });
      }

      console.error("Unhandled API error:", error);
      return Response.json(
        { error: "Internal server error", code: "INTERNAL_ERROR" },
        { status: 500 }
      );
    }
  };
}
```

### 3. Create `src/lib/faxback/errors.ts`

Map FaxBack XML error codes to friendly messages.

```typescript
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
```

### 4. Create `src/components/error-boundary.tsx`

```tsx
"use client";

import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center py-16">
          <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
          <p className="text-sm text-slate-400 mb-4 max-w-md text-center">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <Button onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### 5. Create `src/components/toast-provider.tsx`

```tsx
"use client";

import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        className: "text-sm",
        duration: 5000,
      }}
      richColors
      closeButton
    />
  );
}
```

Add `<ToastProvider />` to the root layout (task 16):
```tsx
// In src/app/(portal)/layout.tsx, add inside the body:
<ToastProvider />
```

### 6. Create `src/app/error.tsx`

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">{error.message}</p>
        <Button onClick={reset}>Try Again</Button>
      </div>
    </div>
  );
}
```

### 7. Create `src/app/not-found.tsx`

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <FileQuestion className="h-16 w-16 text-slate-300 mx-auto mb-4" />
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-sm text-slate-400 mb-6">Page not found</p>
        <Link href="/dashboard">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
```

## Integration Checklist
After creating these files, update existing API routes to use `withErrorHandler`:

```typescript
// Example — update src/app/api/fax/send/route.ts
import { withErrorHandler, ValidationError } from "@/lib/errors";

export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth(); // throws UnauthorizedError
  const body = await request.json();
  if (!body.recipientNumber) throw new ValidationError("Recipient number is required");
  // ... rest of handler
  return NextResponse.json({ success: true });
});
```

## Verify
- `npm run build` — no errors
- 404 page shows on unknown routes
- Error boundary catches render errors
- Toast notifications work
