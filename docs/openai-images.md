# OpenAI Images API Reference

Quick reference for the Images API as used in this project. Source of truth is
the OpenAI docs — links inline.

- Guide: <https://developers.openai.com/api/docs/guides/image-generation>
- Resource overview: <https://developers.openai.com/api/reference/resources/images>

## Endpoints

| Operation | Method / Path | Reference |
|---|---|---|
| Generate | `POST /images/generations` | <https://developers.openai.com/api/reference/resources/images/methods/generate> |
| Edit | `POST /images/edits` | <https://developers.openai.com/api/reference/resources/images/methods/edit> |
| Variation | `POST /images/variations` | <https://developers.openai.com/api/reference/resources/images/methods/create_variation> |

`variations` only supports `dall-e-2`. The other endpoints take any of the
GPT image models.

## Models

| Model | Notes |
|---|---|
| `gpt-image-2` | Latest. No `input_fidelity`, no transparent background. Wider size range (up to 4K). |
| `gpt-image-1.5` | Supports `input_fidelity` and transparent backgrounds. Fixed size set. |
| `gpt-image-1` | Older. |
| `gpt-image-1-mini` | Cheaper, lower fidelity. |
| `dall-e-3` | Legacy. Returns URL by default; supports `revised_prompt`. |
| `dall-e-2` | Legacy. Only model that supports `variations`. |

This project defaults to `gpt-image-2` and exposes a model select that toggles
between `gpt-image-2` and `gpt-image-1.5` (`lib/types.ts`).

API organization verification is required before any GPT image model can be
used.

## Generate parameters (gpt-image-2)

| Param | Values | Notes |
|---|---|---|
| `model` | `gpt-image-2` | required to opt in |
| `prompt` | string | up to 32k chars on GPT models |
| `size` | `auto`, `1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`, `2048x1152`, `3840x2160`, `2160x3840` | edges multiple of 16, max edge 3840, ratio ≤ 3:1 |
| `quality` | `low`, `medium`, `high`, `auto` | latency and cost scale with quality |
| `output_format` | `png`, `jpeg`, `webp` | png is default |
| `output_compression` | 0–100 | jpeg/webp only |
| `background` | `transparent`, `opaque`, `auto` | **rejected by gpt-image-2** — use 1.5 if you need transparent |
| `moderation` | `auto`, `low` | `auto` is default |
| `n` | 1–10 | |
| `stream` | bool | enables partial-image events |
| `partial_images` | 0–3 | each partial costs +100 output tokens |
| `user` | string | abuse-monitoring identifier |

GPT models always return base64 (`b64_json`). `response_format` only applies to
`dall-e-*`.

## Edit parameters

Same surface as generate, plus:

| Param | Notes |
|---|---|
| `image` | one or many; up to 16 input images on GPT models |
| `mask` | optional; same format/size as input, alpha channel required, <50MB |
| `input_fidelity` | `high` / `low` — **gpt-image-1.5 only**, gpt-image-2 ignores it |

Edit reference: <https://developers.openai.com/api/reference/resources/images/methods/edit>

## Code examples

### Generate

```ts
import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI();

const result = await openai.images.generate({
  model: "gpt-image-2",
  prompt: "a children's book drawing of an otter at the vet",
  size: "1024x1024",
  quality: "high",
  output_format: "png",
});

const bytes = Buffer.from(result.data[0].b64_json, "base64");
fs.writeFileSync("otter.png", bytes);
```

### Edit with mask

```ts
import OpenAI, { toFile } from "openai";
import fs from "fs";

const openai = new OpenAI();

const rsp = await openai.images.edit({
  model: "gpt-image-2",
  image: await toFile(fs.createReadStream("room.png"), null, { type: "image/png" }),
  mask: await toFile(fs.createReadStream("mask.png"), null, { type: "image/png" }),
  prompt: "Add a flamingo standing in the indoor pool",
});

fs.writeFileSync("out.png", Buffer.from(rsp.data[0].b64_json, "base64"));
```

### Streaming partial images

```ts
const stream = await openai.images.generate({
  model: "gpt-image-2",
  prompt: "a tiny porcelain doll",
  stream: true,
  partial_images: 2,
});

for await (const event of stream) {
  // event.type === "image.partial" | "image.complete"
}
```

## Pricing notes (gpt-image-2)

Per-image cost ranges roughly:

| Quality | Cost range |
|---|---|
| low | $0.005 – $0.006 |
| medium | $0.041 – $0.053 |
| high | $0.165 – $0.211 |

Tokens are computed dynamically — there is no fixed per-size table like older
models. Edit calls bill input tokens for each reference image. Each
`partial_images` adds +100 output tokens.

## Limitations to expect

- Text rendering is unreliable; precise placement still struggles.
- Character / brand consistency across calls is not guaranteed.
- Complex prompts may take up to ~2 minutes.
- gpt-image-2 cannot produce transparent backgrounds — switch to gpt-image-1.5.
- Mask must match the input image format/size and have an alpha channel.

## How this project uses the API

| Where | What it does |
|---|---|
| `lib/ai.ts` | thin wrappers around `openai.images.generate` / `.edit`, threading `model`, `size`, `transparent` |
| `lib/types.ts` | `IMAGE_MODELS`, `IMAGE_SIZES`, `SIZES_BY_MODEL`, `SUPPORTS_TRANSPARENT` |
| `app/api/generate/route.ts` | accepts `prompt`, `size`, `model`, `transparent`; persists to project |
| `app/api/edit/route.ts` | reuses project's `model`/`size`/`transparent` for edits |
| `app/page.tsx` | model + size selects; transparent checkbox auto-disables on gpt-image-2 |
