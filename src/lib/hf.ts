/**
 * Hugging Face config.json -> catalog architecture fields. Pure so it can be tested
 * without network access; scripts/sync-hf.ts does the fetching.
 */
import type { Attention, Model } from "./schema";

type Json = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export interface ArchFromConfig {
  layers: number;
  attention: Attention;
  contextNative: number | null;
}

/** Multimodal configs nest the language model under text_config / llm_config. */
function textConfig(cfg: Json): Json {
  for (const k of ["text_config", "llm_config", "language_config"]) {
    const sub = cfg[k];
    if (sub && typeof sub === "object" && num((sub as Json).num_hidden_layers)) return { ...cfg, ...(sub as Json) };
  }
  return cfg;
}

export function archFromConfig(raw: Json): ArchFromConfig | null {
  const cfg = textConfig(raw);
  const layers = num(cfg.num_hidden_layers);
  const heads = num(cfg.num_attention_heads);
  if (!layers || !heads) return null;
  const kvHeads = num(cfg.num_key_value_heads) ?? heads;
  const headDim = num(cfg.head_dim) ?? Math.round((num(cfg.hidden_size) ?? 0) / heads);
  const contextNative = num(cfg.max_position_embeddings) ?? null;

  // DeepSeek-style MLA: one latent of kv_lora_rank + rope dims per token per layer.
  const loraRank = num(cfg.kv_lora_rank);
  if (loraRank) {
    const mlaDim = loraRank + (num(cfg.qk_rope_head_dim) ?? 0);
    return { layers, contextNative, attention: { fullLayers: layers, slidingLayers: 0, kvHeads: 1, headDim: 128, mlaDim } };
  }

  const types = Array.isArray(cfg.layer_types) ? (cfg.layer_types as string[]) : null;
  const window = num(cfg.sliding_window) ?? num(cfg.attention_chunk_size);
  let fullLayers = layers;
  let slidingLayers = 0;
  if (types) {
    fullLayers = types.filter((t) => t === "full_attention" || t === "attention").length;
    slidingLayers = types.filter((t) => t === "sliding_attention" || t === "chunked_attention").length;
    // linear_attention / mamba layers keep a fixed-size state and are not counted.
  } else if (num(cfg.full_attention_interval)) {
    fullLayers = Math.floor(layers / num(cfg.full_attention_interval)!);
  } else if (num(cfg.sliding_window_pattern) && window) {
    const every = num(cfg.sliding_window_pattern)!;
    fullLayers = Math.floor(layers / every);
    slidingLayers = layers - fullLayers;
  }
  return {
    layers,
    contextNative,
    attention: { fullLayers, slidingLayers, ...(slidingLayers && window ? { window } : {}), kvHeads, headDim },
  };
}

export interface FieldDiff {
  field: string;
  catalog: unknown;
  upstream: unknown;
}

/** Compare a catalog row with upstream facts; returns only fields that differ. */
export function diffModel(m: Model, arch: ArchFromConfig | null, totalParams: number | null): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const push = (field: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ field, catalog: a, upstream: b });
  };
  if (arch) {
    push("layers", m.layers, arch.layers);
    push("attention", m.attention, arch.attention);
    if (arch.contextNative) push("contextNative", m.contextNative, arch.contextNative);
  }
  if (totalParams) {
    const b = Math.round(totalParams / 1e7) / 100;
    if (Math.abs(b - m.totalParamsB) / m.totalParamsB > 0.03) push("totalParamsB", m.totalParamsB, b);
  }
  return diffs;
}
