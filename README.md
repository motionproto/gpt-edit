# GPT Edit

Single-image playground for iterating with OpenAI `gpt-image-1.5`. Generate three variations of a prompt, then edit any of them in place.

Forked in spirit from [iconmaker](../iconmaker) — same generate / edit / preview loop, stripped down to one prompt and three slots.

## Setup

```bash
cp .env.example .env.local   # then add your OPENAI_API_KEY
npm install
npm run dev
```

Open http://localhost:3000.

## Models

Defaults to OpenAI `gpt-image-1.5`. Google Imagen 4 and Gemini 2.5 Flash Image are also wired up — switch via the model dropdown.

Image editing only works on OpenAI; the other models are generation-only.
