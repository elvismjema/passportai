import Anthropic from '@anthropic-ai/sdk';
import type { TripProfile } from '@/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LOCAL_NATIONALITIES = ['united states', 'usa', 'us', 'american', 'canada', 'canadian', 'mexico', 'mexican'];

function buildSystemPrompt(tripProfile: TripProfile, locationGranted: boolean | null): string {
  const nationality = tripProfile.nationality?.toLowerCase() ?? '';
  const isLocal =
    tripProfile.isLocal || LOCAL_NATIONALITIES.some((n) => nationality.includes(n));

  const lines: string[] = [
    `You are PassportAI — a smart, friendly AI travel assistant for fans attending the 2026 FIFA World Cup across the USA, Canada, and Mexico.`,
    ``,
    `What I know about the user so far: ${JSON.stringify(tripProfile)}`,
    ``,
  ];

  if (tripProfile.currentCity && tripProfile.lat != null && tripProfile.lng != null) {
    lines.push(
      `The user is currently located in ${tripProfile.currentCity} (coordinates: ${tripProfile.lat.toFixed(4)}, ${tripProfile.lng.toFixed(4)}). Use this for all location-based recommendations.`
    );
  } else if (locationGranted === false) {
    lines.push(
      `The user denied location permission. If you don't already know their current city, naturally ask "Which city are you in right now?"`
    );
  }

  lines.push(``);
  lines.push(
    isLocal
      ? `IMPORTANT: This user is from a host country (USA, Canada, or Mexico) or has indicated they live locally. Skip visa and international travel advice entirely. Focus on: fan zones, stadium experience, parking and transit on match day, local restaurants and bars near venues, and making the most of the tournament as a local.`
      : `This is an international visitor. Help with: visa requirements, entry documents, currency exchange, border crossings, international flight connections, and local orientation on arrival.`
  );

  lines.push(``);
  lines.push(
    `Use the updateTripProfile tool silently whenever you learn something new about the user — their name, nationality, city, hotel, matches, budget, language, or whether they are local. Call it once per new piece of information. Never ask for information already stored. If you know their name, always address them by it.`
  );

  lines.push(``);
  lines.push(`For your very first message (when the conversation has just started):`);
  lines.push(
    tripProfile.name
      ? `- Greet them by name: "Hey ${tripProfile.name}! Welcome to PassportAI 👋"`
      : `- Welcome them warmly and ask for their name`
  );
  if (tripProfile.currentCity) {
    lines.push(`- Mention you can see they're in ${tripProfile.currentCity}`);
  }
  lines.push(`- Ask what matches they're attending or what they need help with`);
  lines.push(`- Keep it short, warm, and exciting — they're going to the World Cup!`);

  lines.push(``);
  lines.push(
    `Personality: warm, knowledgeable, direct — like a well-traveled friend who knows North America. Never robotic.`
  );

  return lines.join('\n');
}

const updateTripProfileTool: Anthropic.Tool = {
  name: 'updateTripProfile',
  description: `Call this silently whenever you learn something new about the user. One call per field. Never update a field you already have stored.

For "matches": pass a single object {date, teams, venue, city} — it appends to their list, never replaces.
For "budget": use exactly "budget", "mid", or "luxury".
For "isLocal": set true if the user is from USA, Canada, Mexico, or says they live in a host city.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      field: {
        type: 'string',
        enum: [
          'name', 'nationality', 'isLocal', 'currentCity', 'homeCity',
          'favoriteTeam', 'matches', 'hotel', 'hotelAddress', 'budget', 'language',
        ],
        description: 'The TripProfile field to update',
      },
      value: {
        description:
          'The value. Strings for text fields; boolean for isLocal; "budget"|"mid"|"luxury" for budget; {date,teams,venue,city} object for matches.',
      },
    },
    required: ['field', 'value'],
  },
};

export async function POST(request: Request) {
  let body: {
    messages?: unknown[];
    tripProfile?: TripProfile;
    locationGranted?: boolean | null;
  };

  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const tripProfile: TripProfile = (body.tripProfile as TripProfile) ?? {};
  const locationGranted = body.locationGranted ?? null;
  const systemPrompt = buildSystemPrompt(tripProfile, locationGranted);

  let messages: Anthropic.MessageParam[] =
    Array.isArray(body.messages) && body.messages.length > 0
      ? (body.messages as Anthropic.MessageParam[])
      : [{ role: 'user', content: 'Hi' }];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      };

      try {
        // Agentic loop: repeat until Claude stops calling tools
        while (true) {
          const msgStream = client.messages.stream({
            model: 'claude-opus-4-7',
            max_tokens: 1024,
            system: systemPrompt,
            messages,
            tools: [updateTripProfileTool],
            tool_choice: { type: 'auto' },
          });

          // Stream text deltas to client in real time
          msgStream.on('text', (text) => {
            send({ type: 'text', delta: text });
          });

          const response = await msgStream.finalMessage();

          const toolCalls = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
          );

          // No tool calls → done
          if (toolCalls.length === 0 || response.stop_reason !== 'tool_use') break;

          // Send tool events to client so React state can update silently
          for (const tool of toolCalls) {
            send({ type: 'tool', name: tool.name, input: tool.input });
          }

          // Continue loop with tool results
          messages = [
            ...messages,
            { role: 'assistant', content: response.content },
            {
              role: 'user',
              content: toolCalls.map((tool) => ({
                type: 'tool_result' as const,
                tool_use_id: tool.id,
                content: 'ok',
              })),
            },
          ];
        }
      } catch (err) {
        send({ type: 'error', message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}
