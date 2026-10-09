"use client";

import dynamic from "next/dynamic";

const PrepareClient = dynamic(
  () => import("./PrepareClient"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-600" />

          <p className="mt-3 text-sm text-slate-500">
            Loading OnoSign editor...
          </p>
        </div>
      </div>
    ),
  }
);

export default function PreparePage() {
  return <PrepareClient />;
}