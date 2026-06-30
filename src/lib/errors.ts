// Supabase/Postgrest errors are plain objects, not `instanceof Error`, so a
// naive `err instanceof Error` check silently discards their message.
export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return fallback
}
