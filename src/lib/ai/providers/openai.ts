import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

interface OpenAiResponse {
  choices?: { message?: { content?: string } }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/**
 * Call OpenAI's Chat Completions endpoint with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens
 * in `generateReply`).
 */
export async function generateOpenAi(args: ProviderArgs): Promise<ProviderResult> {
  // OpenAI's current (reasoning-family) models reject the classic
  // `max_tokens` outright ("Unsupported parameter"), so this is the one
  // caller that needs `max_completion_tokens`.
  return generateOpenAiCompatible(args, OPENAI_URL, 'OpenAI', 'max_completion_tokens')
}

/**
 * Shared implementation for any provider that speaks OpenAI's Chat
 * Completions wire format — same request/response shape, just a
 * different base URL, key, and token-limit field name. DeepSeek and
 * Gemini are the other consumers (see ./deepseek.ts, ./gemini.ts);
 * this is where a future OpenAI-compatible provider (Groq, Mistral, a
 * local vLLM/Ollama endpoint, …) would plug in too.
 *
 * `tokenLimitField` matters more than it looks: sending both
 * `max_tokens` and `max_completion_tokens` isn't universally safe —
 * Gemini's OpenAI-compat layer 400s with "max_tokens and
 * max_completion_tokens cannot both be set" if both are present, so
 * each provider gets exactly the one field it accepts.
 */
export async function generateOpenAiCompatible(
  args: ProviderArgs,
  url: string,
  providerName: string,
  tokenLimitField: 'max_tokens' | 'max_completion_tokens' = 'max_tokens',
): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...mergeConsecutive(messages),
        ],
        [tokenLimitField]: MAX_OUTPUT_TOKENS,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError(providerName, res)
  }

  const data = (await res.json().catch(() => null)) as OpenAiResponse | null
  const text = data?.choices?.[0]?.message?.content
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError(`${providerName} returned an empty response.`, {
      code: 'empty_response',
    })
  }
  const usage = normalizeUsage({
    prompt: data?.usage?.prompt_tokens,
    completion: data?.usage?.completion_tokens,
    total: data?.usage?.total_tokens,
  })
  return { text, usage }
}
