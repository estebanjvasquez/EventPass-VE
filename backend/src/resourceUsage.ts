import type { SupabaseClient } from '@supabase/supabase-js'

// Store counts and provider IDs only. Prompts, files and generated text stay out.
export async function observeAiUsage(db: SupabaseClient, org: string, event: string, payload: unknown, fallbackModel: string) {
  const response = payload as { id?: string; model?: string; usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } } | null
  const usage = response?.usage
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens) || usage.input_tokens! < 0 || usage.output_tokens! < 0) {
    console.error('[resource-usage] provider response has no usable token counts'); return
  }
  const observedCached = usage.input_tokens_details?.cached_tokens
  const cached = Math.max(0, Math.min(usage.input_tokens!, Number.isSafeInteger(observedCached) ? observedCached! : 0))
  const key = response?.id ?? crypto.randomUUID()
  const model = response?.model ?? fallbackModel
  const results = await Promise.allSettled([
    ['ai_input_tokens', usage.input_tokens! - cached], ['ai_cached_tokens', cached], ['ai_output_tokens', usage.output_tokens!],
  ].map(async ([metric, units]) => {
    const result = await db.rpc('worker_record_resource', { p_org: org, p_event: event, p_metric: metric, p_model: model, p_key: key, p_units: units })
    if (result.error) throw new Error(result.error.message)
  }))
  for (const result of results) if (result.status === 'rejected') console.error('[resource-usage] token observation failed', result.reason instanceof Error ? result.reason.message : 'unknown')
}

export async function observeAcceptedEmail(db: SupabaseClient, org: string, event: string | null, accepted: boolean) {
  if (!accepted) return
  try {
    const result = await db.rpc('worker_record_resource', { p_org: org, p_event: event, p_metric: 'email_accepted', p_model: '*', p_key: `worker-email:${crypto.randomUUID()}`, p_units: 1 })
    if (result.error) console.error('[resource-usage] email observation failed', result.error.message)
  } catch { console.error('[resource-usage] email observation unavailable') }
}
