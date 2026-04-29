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
