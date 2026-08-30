import type { ProviderResult } from '../types'
import { generateOpenAiCompatible } from './openai'
import type { ProviderArgs } from './shared'

// DeepSeek's Chat Completions endpoint is wire-compatible with OpenAI's —
// same request/response shape, different host and key. Model ids:
// 'deepseek-chat' (DeepSeek-V3) and 'deepseek-reasoner' (R1).
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

/**
 * Call DeepSeek's Chat Completions endpoint with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens
 * in `generateReply`).
 */
export async function generateDeepSeek(args: ProviderArgs): Promise<ProviderResult> {
  return generateOpenAiCompatible(args, DEEPSEEK_URL, 'DeepSeek')
}
