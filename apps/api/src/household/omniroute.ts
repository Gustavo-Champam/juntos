/**
 * OpenAI-compatible client for OmniRoute's free catalog.
 *
 * OmniRoute (https://www.omniroute.online) is a router: one /v1/chat/completions
 * endpoint, model "auto", fallback across free providers. In this hosted app we
 * cannot run the local gateway, so we talk to LLM7 — the same free provider
 * OmniRoute lists (no credit card, anonymous key). If you self-host OmniRoute,
 * set OMNIROUTE_BASE_URL (e.g. http://127.0.0.1:20128/v1) and optionally
 * OMNIROUTE_API_KEY + OMNIROUTE_MODEL=auto.
 */

const DEFAULT_FREE_BASE = "https://api.llm7.io/v1";
const DEFAULT_FREE_KEY = "unused";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type OmniChatResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string };

function baseUrl(): string {
  return (process.env.OMNIROUTE_BASE_URL ?? DEFAULT_FREE_BASE).trim().replace(/\/$/, "");
}

function apiKey(): string {
  return (process.env.OMNIROUTE_API_KEY ?? DEFAULT_FREE_KEY).trim() || DEFAULT_FREE_KEY;
}

function preferredModels(): string[] {
  const configured = process.env.OMNIROUTE_MODEL?.trim();
  if (configured) return [configured];
  if (baseUrl().includes("llm7.io")) return ["default", "fast"];
  return ["auto", "default"];
}

export async function omniChat(input: {
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<OmniChatResult> {
  const url = `${baseUrl()}/chat/completions`;
  const key = apiKey();
  let lastError = "A IA gratuita não respondeu.";

  for (const model of preferredModels()) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: input.messages,
          temperature: 0.2,
          max_tokens: input.maxTokens ?? 500,
        }),
      });
      const raw = await response.text();
      if (!response.ok) {
        lastError = `A IA gratuita recusou o pedido (${response.status}).`;
        continue;
      }
      const body = JSON.parse(raw) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
      };
      const text = body.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) {
        lastError = "A IA gratuita voltou vazia.";
        continue;
      }
      return { ok: true, text, model: body.model ?? model };
    } catch {
      lastError = "Não deu para falar com a IA gratuita agora.";
    }
  }

  return { ok: false, error: lastError };
}
