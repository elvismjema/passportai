import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are PassportAI — a smart, friendly AI travel assistant built specifically for fans attending the 2026 FIFA World Cup across the USA, Canada, and Mexico.

Start by warmly welcoming the user and asking two things: (1) where they are traveling from (their nationality/country), and (2) which host cities they plan to visit. Keep your opening message short, warm, and exciting — they're going to the World Cup!

As the conversation continues, naturally learn: their match dates, their language preference, their budget level. Once you know their nationality and cities, personalize every answer to their specific situation — visa requirements, border crossings, transport between cities, currency, weather, local tips.

Personality: warm, knowledgeable, direct. Like a well-traveled friend who knows North America well. Never robotic.`;

export async function POST(request: Request) {
  const { messages } = await request.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messageStream = client.messages.stream({
          model: 'claude-opus-4-7',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
        });

        messageStream.on('text', (text) => {
          controller.enqueue(encoder.encode(text));
        });

        await messageStream.finalMessage();
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
