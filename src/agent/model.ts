import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { config, requireEnv } from "@/lib/config";

/**
 * Modelos do agent, em ordem de preferência. O Mastra tenta de novo (maxRetries)
 * e, se houver LLM_FALLBACK_MODEL e o principal seguir indisponível (ex.: 503 por
 * alta demanda), passa para ele. Sem fallback configurado, só há o retry.
 *
 * Para trocar de provedor, instale o pacote `@ai-sdk/<provedor>` e devolva a
 * lista aqui; o resto do agent não muda.
 */
export function getModels() {
  if (config.llm.provider !== "google") {
    throw new Error(
      `LLM_PROVIDER="${config.llm.provider}" não suportado ainda; use "google" (veja src/agent/model.ts).`,
    );
  }
  const google = createGoogleGenerativeAI({
    apiKey: requireEnv("GOOGLE_GENERATIVE_AI_API_KEY"),
  });
  const names = [config.llm.model, config.llm.fallbackModel].filter(
    (name, i, all) => name && all.indexOf(name) === i,
  );
  return names.map((name) => ({ model: google(name), maxRetries: 2 }));
}
