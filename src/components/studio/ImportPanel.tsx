"use client"

import { useRouter } from "next/navigation"
import { ImportDropzone } from "@/components/import/ImportDropzone"

/**
 * Thin bridge between the client import component and the server job page: when a batch lands in
 * the database, refresh the page so the board grid, counts and trace re-render with real data.
 * The dropzone renders its own card, heading and actions, so nothing is wrapped around it here.
 */
export function ImportPanel({ jobId }: { jobId: string }) {
  const router = useRouter()
  return <ImportDropzone jobId={jobId} onImported={() => router.refresh()} />
}
