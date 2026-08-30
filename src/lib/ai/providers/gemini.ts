import type { ProviderResult } from '../types'
import { generateOpenAiCompatible } from './openai'
import type { ProviderArgs } from './shared'

// Google's OpenAI-compatibility layer for Gemini — same request/response
// shape as OpenAI's Chat Completions, different host and key. Model ids:
// 'gemini-2.5-flash' (fast, generous free tier) and 'gemini-2.5-pro'
// (higher quality, tighter free-tier limits).
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

/**
 * Call Gemini's OpenAI-compatible Chat Completions endpoint with the
 * caller's own key. Returns the raw assistant text + token usage
 * (handoff parsing happens in `generateReply`).
 */
export async function generateGemini(args: ProviderArgs): Promise<ProviderResult> {
  return generateOpenAiCompatible(args, GEMINI_URL, 'Gemini')
}
