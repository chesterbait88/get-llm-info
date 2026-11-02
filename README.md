# Local LLM Hardware Matcher

Answers one question: **"Given my machine, which open models can I run, and how fast will they write?"**

You get a ranked list of open models with a fit verdict, the best quantization that fits, and an estimated output speed in tokens/sec. Every number is labelled **Measured** (with a source) or **Estimated** (with a ± range).

## Stack

- **Next.js 15 (App Router) + TypeScript + Tailwind 4**, running as a Node server (`next start` or the standalone build in Docker).
- **Postgres + Drizzle ORM** holds the catalog (models, quants, GPUs, unified-memory chips, engines), the measured benchmarks, a model review queue (`models.status`), and user benchmark submissions.
- The **estimator** (`src/lib/estimator.ts`) is a pure TypeScript module. The server reads the approved catalog from Postgres and passes it to the page, and all the math runs in the browser so changing hardware or filters is instant.

```
Postgres ──(Drizzle)──> src/db/queries.ts ──> page.tsx (server) ──> Matcher (client) ──> estimator.ts
   ▲                                             └──> /api/catalog, /api/health
   ├── scripts/seed.ts      (src/db/seed/*.json → DB, idempotent)
   ├── scripts/sync-hf.ts   (re-verify against Hugging Face / queue new models as "pending")
   └── /api/submissions     (self-reported runs, physics-checked, stored "pending")
```

## Getting started

Requirements: Node 20+ and Postgres 14+.

```bash
cp .env.example .env              # set DATABASE_URL
docker compose up -d db           # or use your own Postgres
npm install
npm run db:setup                  # apply migrations + load the seed catalog
npm run dev                       # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm test` | Unit tests (estimator, detection, URL state, HF parsing, submission checks) plus a Postgres round-trip test when `DATABASE_URL` is set |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate a new SQL migration after editing `src/db/schema.ts` |
| `npm run db:migrate` / `db:seed` / `db:setup` | Apply migrations / upsert seed data / both |
| `npm run validate` | Schema + referential-integrity check of the seed JSON |
| `npm run sync:hf` | Compare `models.json` with Hugging Face `config.json` + safetensors counts (`-- --write` applies fixes, `-- --discover` queues new models as pending) |

Full stack in Docker: `docker compose --profile app up -d --build`, then run `npm run db:setup` against it once.

## Design

The visual direction is written down in [`DESIGN.md`](DESIGN.md): the hardware form is a circuit-board "spec board" (solder-mask green, silkscreen part labels in CPU → GPU → RAM order), results are plain rows with a log-scale speed ruler, and the one bold element is the **writer**, which streams sample text at the estimated tokens/sec. Tokens live in `src/app/globals.css`; the typeface is Archivo (variable width) from `@fontsource-variable/archivo`.

## The estimator

**Fit:** memory = weights (`params × bits/8`) + KV cache + ~1 GB runtime. The KV cache is computed per layer type: full attention grows with context, sliding/chunked layers are capped at their window, MLA layers store one latent per token, and linear-attention/Mamba layers are ignored (they keep a fixed state).

**Tier:** full GPU, partial offload, unified memory, CPU only, or won't fit. Usable VRAM is VRAM minus 0.8 GB. Unified memory keeps an OS slice (auto: 25%, between 4 and 16 GB, adjustable). The engine also matters: vLLM and MLX can't spill into system RAM.

**Speed:**

```
seconds/token = B_gpu/(η·BW_gpu) + B_cpu/(η_cpu·BW_ram) + layers × per-layer overhead
tok/s         = engine_factor / seconds_per_token
```

- `B` = active weights + the KV cache read at the quoted depth (1K tokens).
- The CPU side scales with physical cores (`min(1, cores/8)`, since fewer than ~8 cores can't saturate the memory bus) and gets +5% with AVX-512. Picking a CPU also fills in its platform's RAM type, speed and channel count.
- `η` (efficiency): NVIDIA 0.65, AMD 0.55, Intel 0.45. Apple base/Pro chips 0.75, Max chips 0.65, Ultra chips 0.47. Other unified chips 0.6, CPU 0.6.
- The per-layer overhead is 0.01 ms for dense layers and 0.12 ms for MoE layers. It is what pulls a 30B-A3B on an RTX 3090 down to the ~110 tok/s owners measure, instead of the ~260 bandwidth ceiling.
- **Calibration:** when a device has measured runs, its estimates are scaled by the median measured/estimated ratio and shown as "calibrated". A measured run for the exact model, quant and engine replaces the estimate.
- **Quant pick:** "Balanced" chooses the highest quant up to Q6_K that keeps the same speed verdict while the model is fully in fast memory, and stays on Q4_K_M once it spills to RAM. Q3_K_M is only used when nothing at Q4 or above fits, or when it moves the model up a verdict (for example, fully on the GPU instead of offloaded).

The brief's acceptance checks are in `src/lib/estimator.test.ts`:

| Check | Result |
| --- | --- |
| RTX 3090 + Qwen 3.6 35B-A3B Q4 near measured 30B-A3B (~110–120) | 127 tok/s (Qwen3 30B-A3B: 108) ✓ |
| M3 Max + 7B Q4_0 within 15% of 66.3 tok/s | 67.1 tok/s ✓ |
| 24 GB card shows Llama 3.3 70B as partial offload, low single digits | partial, ~1.3–2.4 tok/s (DDR4-3200 → DDR5-6000) ✓ |
| Detection pre-fills on Chrome/Windows/NVIDIA and an Apple Silicon Mac | unit-tested in `detect.test.ts`, checked in a headless browser with spoofed renderer strings ✓ (still needs a check on real hardware) |

## Data status: read before launch

**Nothing in the catalog is marked `verified` yet.** The sandbox this was built in could not reach huggingface.co, so:

- **Model rows** come from the research brief (sizes, context, licence). For 23 of the 45 models, mostly the late-2026 ones (Gemma 4, Qwen 3.6/3.8, DeepSeek V4, Kimi K3…), the **layer and attention layout is estimated** (`archSource: "estimated"`). Those rows show a note in the UI because their KV-cache size is approximate. Some `hfRepo` ids are best guesses, and Ollama tags are only filled where known. Run `npm run sync:hf` (and `-- --write`) from a machine with HF access to fix and verify them.
- **GPU/chip specs** marked `source: "estimated"` (mostly laptops, older cards, M5 Pro/Max) were not checked against a spec sheet. Cross-check them against dbgpu/TechPowerUp.
- **CPUs:** the 45 processors in `cpus.json` (cores, threads, memory channels, typical RAM speed, AVX-512) were entered from memory and are marked `source: "estimated"`.
- **Benchmarks:** the 13 Apple Silicon numbers (Llama 2 7B Q4_0, tg128) were transcribed from [llama.cpp discussion #4167](https://github.com/ggml-org/llama.cpp/discussions/4167) without re-checking. They are flagged `verified: false` and shown with an asterisk.

## Sorting and filtering

Results can be sorted by best match, output speed, model size, memory needed, release date, context length or name, in either direction. Models without a speed or date always sort last. Two switches add the models that are too slow (under 5 tok/s) or won't fit. Every setting, including sort order, is kept in the shareable URL (`sort`, `dir`, `slow`, `nofit`).

## API

- `GET /api/catalog`: the approved catalog as JSON.
- `GET /api/health`: database liveness check.
- `POST /api/submissions`: a self-reported run `{hardwareId, hardwareKind, modelId, quant, engine, tgTps, rawOutput?, …}`. It is rejected (422) above the hardware's bandwidth ceiling, otherwise stored as `pending` with flags such as `non-stock-vram` or `no-raw-output`.

## Roadmap (from the brief)

1. ~~Prototype~~: catalog, detection + confirm card, estimator, filters, shareable URL. Postgres, the submissions endpoint and the HF sync script are already in.
2. Live data: weekly `sync:hf` cron, an admin UI for the pending queue and submissions, and import from the llama.cpp CUDA/ROCm scoreboards and LocalScore.
3. Community: "measured on N machines" badges, and the verified benchmark program (pinned campaign, nonce, hash checks).
4. Extras: multi-GPU, upgrade advisor, release news, prompt-processing/TTFT, power cost.

Open questions from the brief are still open: site name/domain, the meaning of "power", image/audio models, and accounts vs. anonymous submissions.
