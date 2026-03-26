import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

/**
 * Generate embeddings using the Anthropic API via a Claude call.
 * We use Claude to produce a fixed-dimension numeric vector from text.
 * This avoids needing a separate embeddings API — Claude summarizes
 * the text into a semantic fingerprint we can store in LanceDB.
 *
 * For production scale, swap this with a dedicated embeddings model
 * (e.g., voyage-3 or text-embedding-3-small via OpenAI).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Generate a 256-dimension embedding vector for the following text. Return ONLY a JSON array of 256 floating point numbers between -1 and 1. No explanation, no markdown, just the JSON array.

Text: ${text.slice(0, 2000)}`,
      },
    ],
  });

  const content =
    response.content[0].type === "text" ? response.content[0].text : "[]";

  try {
    const vector = JSON.parse(content) as number[];
    if (vector.length !== 256) {
      // Pad or truncate to exactly 256
      while (vector.length < 256) vector.push(0);
      return vector.slice(0, 256);
    }
    return vector;
  } catch {
    // Fallback: return zero vector
    return new Array(256).fill(0);
  }
}

/**
 * Batch embed multiple texts in parallel.
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  return Promise.all(texts.map(generateEmbedding));
}
