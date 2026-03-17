"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Job } from "@/lib/jobs/types"

export function useJobStatus(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!jobId) {
      setJob(null)
      return
    }

    setIsLoading(true)

    // Initial fetch
    fetch(`/api/jobs/${jobId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.job) setJob(data.job)
      })
      .finally(() => setIsLoading(false))

    // Subscribe to realtime updates
    const supabase = createClient()
    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          setJob(payload.new as Job)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [jobId])

  return { job, isLoading }
}
