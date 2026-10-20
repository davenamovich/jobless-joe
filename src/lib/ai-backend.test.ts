// Run: npx tsx --test src/lib/ai-backend.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { chat, type BackendConfig } from "./ai-backend";

/** A throwaway OpenAI-compatible endpoint that replays scripted responses. */
interface Reply {
  status?: number;
  body: unknown;
}

interface Ctx {
  requests: Array<Record<string, unknown>>;
  url: string;
  server: Server;
}

async function startServer(replies: Reply[]): Promise<Ctx> {
  const requests: Array<Record<string, unknown>> = [];
  const server = createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    requests.push(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)];
    res.writeHead(reply.status ?? 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { requests, url: `http://127.0.0.1:${address.port}/v1`, server };
}

function stop(ctx: Ctx) {
  return new Promise<void>((resolve) => ctx.server.close(() => resolve()));
}

function cfg(url: string): BackendConfig {
  return {
    activeBackend: "openai-compat",
    openaiBaseUrl: url,
    openaiApiKey: "",
    openaiModel: "test-model",
    audioEngine: "zai",
    aceStepBaseUrl: "",
    aceStepModel: "",
    prMcpUrl: "",
    prApiKey: "",
    prRef: "",
    publicBaseUrl: "",
    courseUrl: "",
    ytClientId: "",
    ytClientSecret: "",
    ytRefreshToken: "",
    ytChannelId: "",
    ytChannelTitle: "",
    ytPrivacy: "unlisted",
    upApiKey: "",
    upUser: "",
    upPlatforms: "",
    autoEnabled: false,
    autoIntervalMin: 60,
    autoPublish: false,
    autoChatId: "",
    fishApiKey: "",
    fishJoeVoiceId: "",
    fishGuestVoiceId: "",
    morningEnabled: false,
    morningHour: 7,
    morningCount: 5,
    morningTimeZone: "",
  };
}

/** A reply that burned its whole budget on hidden reasoning. */
const EMPTY_REASONING_REPLY: Reply = {
  body: {
    model: "test-model",
    choices: [
      { message: { role: "assistant", content: "" }, finish_reason: "length" },
    ],
    usage: {
      completion_tokens: 4096,
      completion_tokens_details: { reasoning_tokens: 4096 },
    },
  },
};

function textReply(text: string): Reply {
  return {
    body: {
      model: "test-model",
      choices: [
        { message: { role: "assistant", content: text }, finish_reason: "stop" },
      ],
    },
  };
}

describe("openai-compat chat", () => {
  it("retries with max_completion_tokens when reasoning ate the budget", async () => {
    const ctx = await startServer([EMPTY_REASONING_REPLY, textReply('{"ok":true}')]);
    try {
      const result = await chat("system", "user", cfg(ctx.url));
      assert.equal(result.content, '{"ok":true}');
      assert.equal(ctx.requests.length, 2);
      assert.equal(ctx.requests[0].max_tokens, 8192);
      assert.equal(ctx.requests[1].max_completion_tokens, 16000);
      assert.equal(ctx.requests[1].temperature, undefined);
    } finally {
      await stop(ctx);
    }
  });

  it("uses max_completion_tokens when the model rejects max_tokens", async () => {
    const ctx = await startServer([
      {
        status: 400,
        body: {
          error: {
            message:
              "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
          },
        },
      },
      textReply("the song"),
    ]);
    try {
      const result = await chat("system", "user", cfg(ctx.url));
      assert.equal(result.content, "the song");
      assert.equal(ctx.requests.length, 2);
      assert.equal(ctx.requests[1].max_completion_tokens, 8192);
    } finally {
      await stop(ctx);
    }
  });

  it("falls back to a wider max_tokens when the backend rejects max_completion_tokens", async () => {
    const ctx = await startServer([
      EMPTY_REASONING_REPLY,
      { status: 400, body: { error: { message: "Unknown parameter: max_completion_tokens" } } },
      textReply("the song"),
    ]);
    try {
      const result = await chat("system", "user", cfg(ctx.url));
      assert.equal(result.content, "the song");
      assert.equal(ctx.requests.length, 3);
      assert.equal(ctx.requests[2].max_tokens, 16000);
    } finally {
      await stop(ctx);
    }
  });

  it("reads content returned as parts", async () => {
    const ctx = await startServer([
      {
        body: {
          choices: [
            {
              message: {
                role: "assistant",
                content: [{ type: "text", text: "part one" }, { type: "text", text: " part two" }],
              },
              finish_reason: "stop",
            },
          ],
        },
      },
    ]);
    try {
      const result = await chat("system", "user", cfg(ctx.url));
      assert.equal(result.content, "part one part two");
    } finally {
      await stop(ctx);
    }
  });

  it("explains an empty response instead of guessing", async () => {
    const ctx = await startServer([EMPTY_REASONING_REPLY]);
    try {
      await assert.rejects(
        () => chat("system", "user", cfg(ctx.url)),
        /empty response \(finish_reason: length, 4096 reasoning tokens, 4096 completion tokens\)/
      );
    } finally {
      await stop(ctx);
    }
  });
});
