import { describe, expect, it } from "vitest";
import { archFromConfig } from "./hf";

describe("archFromConfig", () => {
  it("reads a plain GQA config (Llama 3.1 8B)", () => {
    const a = archFromConfig({ num_hidden_layers: 32, num_attention_heads: 32, num_key_value_heads: 8, hidden_size: 4096, max_position_embeddings: 131072 });
    expect(a).toEqual({ layers: 32, contextNative: 131072, attention: { fullLayers: 32, slidingLayers: 0, kvHeads: 8, headDim: 128 } });
  });
  it("reads layer_types with sliding windows (gpt-oss)", () => {
    const layer_types = Array.from({ length: 24 }, (_, i) => (i % 2 ? "full_attention" : "sliding_attention"));
    const a = archFromConfig({ num_hidden_layers: 24, num_attention_heads: 64, num_key_value_heads: 8, head_dim: 64, sliding_window: 128, layer_types, max_position_embeddings: 131072 });
    expect(a?.attention).toEqual({ fullLayers: 12, slidingLayers: 12, window: 128, kvHeads: 8, headDim: 64 });
  });
  it("ignores linear-attention layers (Qwen3-Next style)", () => {
    const layer_types = Array.from({ length: 48 }, (_, i) => ((i + 1) % 4 ? "linear_attention" : "full_attention"));
    const a = archFromConfig({ num_hidden_layers: 48, num_attention_heads: 16, num_key_value_heads: 2, head_dim: 256, layer_types });
    expect(a?.attention).toMatchObject({ fullLayers: 12, slidingLayers: 0 });
  });
  it("reads MLA (DeepSeek V3)", () => {
    const a = archFromConfig({ num_hidden_layers: 61, num_attention_heads: 128, kv_lora_rank: 512, qk_rope_head_dim: 64, max_position_embeddings: 163840 });
    expect(a?.attention).toMatchObject({ fullLayers: 61, mlaDim: 576 });
  });
  it("unwraps multimodal text_config (Gemma 3)", () => {
    const a = archFromConfig({ text_config: { num_hidden_layers: 62, num_attention_heads: 32, num_key_value_heads: 16, head_dim: 128, sliding_window: 1024, sliding_window_pattern: 6 } });
    expect(a?.attention).toEqual({ fullLayers: 10, slidingLayers: 52, window: 1024, kvHeads: 16, headDim: 128 });
  });
  it("returns null for unusable configs", () => {
    expect(archFromConfig({ foo: 1 })).toBeNull();
  });
});
