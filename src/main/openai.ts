import {
  compactAiScene,
  parseAiCommand,
  type AiCommand,
  type AiRequest,
  type AiResponse,
} from "../shared/ai";
import { randomUUID } from "node:crypto";
import { logAiEvent } from "./ai-logger";
import { getAiCredentials } from "./settings";

const nullableNumber = { type: ["number", "null"] };
const nullableColor = {
  anyOf: [{ type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, { type: "null" }],
};
const shapeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["rect", "ellipse", "triangle", "pen"] },
    name: { type: "string", minLength: 1, maxLength: 80 },
    x: nullableNumber,
    y: nullableNumber,
    width: nullableNumber,
    height: nullableNumber,
    rotation: { type: "number" },
    fill: nullableColor,
    stroke: nullableColor,
    strokeWidth: { type: "number", minimum: 0 },
    radius: { type: "number", minimum: 0 },
    points: {
      anyOf: [
        {
          type: "array",
          minItems: 3,
          maxItems: 64,
          items: {
            type: "object",
            additionalProperties: false,
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"],
          },
        },
        { type: "null" },
      ],
    },
  },
  required: [
    "type",
    "name",
    "x",
    "y",
    "width",
    "height",
    "rotation",
    "fill",
    "stroke",
    "strokeWidth",
    "radius",
    "points",
  ],
};

const tools = [
  {
    type: "function",
    name: "create_shape",
    description:
      "Create one primitive or pen shape without overlapping existing objects.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { shape: shapeSchema },
      required: ["shape"],
    },
  },
  {
    type: "function",
    name: "create_asset",
    description:
      "Create one named game asset from essential parts of the requested object. Children may overlap each other, but do not add decorative or unrelated parts.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        groupName: { type: "string", minLength: 1, maxLength: 80 },
        children: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          items: shapeSchema,
        },
      },
      required: ["groupName", "children"],
    },
  },
  {
    type: "function",
    name: "generate_palette",
    description:
      "Create a new palette or update a specifically named existing palette.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: { type: "string", enum: ["create", "update"] },
        paletteName: { type: "string", minLength: 1, maxLength: 40 },
        targetPaletteId: { type: ["string", "null"] },
        colors: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        },
      },
      required: ["mode", "paletteName", "targetPaletteId", "colors"],
    },
  },
  {
    type: "function",
    name: "recolor_objects",
    description:
      "Recolor existing objects using only a selected palette or reviewed suggestions.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        paletteId: { type: "string", minLength: 1 },
        paletteSuggestions: {
          type: "array",
          maxItems: 16,
          items: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        },
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 200,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              objectId: { type: "string", minLength: 1 },
              fill: nullableColor,
              stroke: nullableColor,
            },
            required: ["objectId", "fill", "stroke"],
          },
        },
      },
      required: ["paletteId", "paletteSuggestions", "changes"],
    },
  },
  {
    type: "function",
    name: "request_clarification",
    description:
      "Ask one concise question when the requested action is ambiguous.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        question: { type: "string", minLength: 1, maxLength: 300 },
      },
      required: ["question"],
    },
  },
];

function validateRequest(value: unknown): AiRequest {
  if (!value || typeof value !== "object")
    throw new Error("Invalid AI request");
  const request = value as AiRequest;
  if (
    typeof request.prompt !== "string" ||
    !request.prompt.trim() ||
    request.prompt.length > 4000
  )
    throw new Error("Prompt must be 1 to 4000 characters");
  if (
    !request.scene ||
    !Array.isArray(request.scene.objects) ||
    request.scene.objects.length > 500 ||
    !request.scene.activePalette ||
    !request.scene.settings
  )
    throw new Error("Invalid AI scene context");
  if (request.image) {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(
        request.image.mimeType,
      ) ||
      typeof request.image.data !== "string" ||
      request.image.data.length > 7_000_000 ||
      !/^[\w+/]*={0,2}$/.test(request.image.data)
    )
      throw new Error("Invalid prompt image");
  }
  return request;
}

function outputText(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content)
        ? content
            .filter(
              (part): part is { type: string; text: string } =>
                Boolean(part) &&
                typeof part === "object" &&
                (part as { type?: unknown }).type === "output_text" &&
                typeof (part as { text?: unknown }).text === "string",
            )
            .map((part) => part.text)
        : [];
    })
    .join("\n")
    .trim();
}

export async function runAi(value: unknown): Promise<AiResponse> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  await logAiEvent("ai.request.received", { requestId, payload: value });
  try {
    const request = validateRequest(value);
    const credentials = await getAiCredentials();
    const scene = JSON.stringify(compactAiScene(request.scene));
    const content: Array<Record<string, unknown>> = [
      {
        type: "input_text",
        text: `${request.prompt}\nSCENE=${scene}`,
      },
    ];
    if (request.image)
      content.push({
        type: "input_image",
        image_url: `data:${request.image.mimeType};base64,${request.image.data}`,
        detail: "auto",
      });
    const apiPayload = {
      model: credentials.model,
      store: false,
      max_output_tokens: 4000,
      ...(credentials.reasoningEffort !== "auto"
        ? { reasoning: { effort: credentials.reasoningEffort } }
        : {}),
      instructions:
        "Plan SVG edits; call tools only. SCENE keys: c=[width,height], o rows=[id,type,name,left,top,width,height,rotation,z,strokeWidth,radius], s=selected IDs, p=active palette colors, d=[strokeWidth,radius,snap,gridSize], v=version. Treat d as the authoritative game-asset style profile: keep new assets consistent in line weight, corner treatment, geometry language, and palette usage. Created fill/stroke colors must come from p; stroked shapes use d[0]; rect radius=min(d[1],width/2,height/2), other shapes use radius=0. Interpret the requested subject literally. Create only geometry required to depict the named subject. Do not add decorations, labels, plants, buildings, characters, props, or secondary subjects unless explicitly requested. Style words control palette, shape language, stroke, radius, and composition only; they do not add objects. Prefer the fewest shapes that clearly represent the request: simple nouns use 1-4 shapes, complex named assets use 2-8 essential shapes. Use create_shape for simple subjects and create_asset only for genuinely multi-part objects. Every asset child must be an essential part of that one asset. Keep new top-level items inside c and clear of existing/new top-level items; asset children may overlap. Prefer rect, ellipse, triangle; use pen only when needed. Palette mode must be explicit; otherwise ask. Recolor only with p; put proposed colors in paletteSuggestions. Never delete, flatten, ungroup, save, or change unrequested content.",
      input: [{ role: "user", content }],
      tools,
      tool_choice: "required",
      parallel_tool_calls: true,
    };
    await logAiEvent("ai.api.request", {
      requestId,
      url: credentials.url,
      method: "POST",
      headers: {
        Authorization: "Bearer [REDACTED]",
        "Content-Type": "application/json",
      },
      payload: apiPayload,
    });
    const response = await fetch(credentials.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.secret}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify(apiPayload),
    });
    const responseText = await response.text();
    let payload: unknown = responseText;
    try {
      payload = JSON.parse(responseText);
    } catch {
      // Keep the raw body in the log and report it as an invalid response.
    }
    await logAiEvent("ai.api.response", {
      requestId,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      payload,
      durationMs: Date.now() - startedAt,
    });
    if (!response.ok) {
      const message =
        payload && typeof payload === "object"
          ? JSON.stringify(payload).slice(0, 500)
          : response.statusText;
      throw new Error(`OpenAI request failed (${response.status}): ${message}`);
    }
    if (!payload || typeof payload !== "object")
      throw new Error("OpenAI returned an invalid response");
    const output = Array.isArray((payload as { output?: unknown }).output)
      ? ((payload as { output: unknown[] }).output ?? [])
      : [];
    const commands: AiCommand[] = [];
    const questions: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const call = item as {
        type?: unknown;
        name?: unknown;
        arguments?: unknown;
      };
      if (
        call.type !== "function_call" ||
        typeof call.name !== "string" ||
        typeof call.arguments !== "string"
      )
        continue;
      const parsed = parseAiCommand(call.name, JSON.parse(call.arguments));
      if (typeof parsed === "string") questions.push(parsed);
      else commands.push(parsed);
    }
    const result = {
      message:
        questions.join("\n") ||
        outputText(payload as Record<string, unknown>) ||
        (commands.length
          ? "Review the proposed changes."
          : "No changes proposed."),
      commands: questions.length ? [] : commands,
      sceneVersion: request.scene.sceneVersion,
    };
    await logAiEvent("ai.request.succeeded", {
      requestId,
      result,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    await logAiEvent("ai.request.failed", {
      requestId,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}
