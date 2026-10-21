"use client";

import { Bot } from "lucide-react";
import {
  Ai21,
  Anthropic,
  Baichuan,
  Baidu,
  Cohere,
  Dbrx,
  DeepSeek,
  Doubao,
  Gemini,
  Grok,
  Hunyuan,
  Kimi,
  Meta,
  Microsoft,
  Minimax,
  Mistral,
  NousResearch,
  Nova,
  Nvidia,
  OpenAI,
  Perplexity,
  Qwen,
  Yi,
  Zhipu,
} from "@lobehub/icons/es/icons";
import type { IconType } from "@lobehub/icons/es/types";

import { cn } from "@/lib/utils";
import { resolveModelBrand, type ModelBrand } from "@/lib/utils/model-brand";

type BrandIcon = IconType;

const BRAND_ICONS: Record<Exclude<ModelBrand, "generic">, BrandIcon> = {
  openai: OpenAI,
  deepseek: DeepSeek,
  anthropic: Anthropic,
  google: Gemini,
  qwen: Qwen,
  kimi: Kimi,
  zhipu: Zhipu,
  grok: Grok,
  meta: Meta,
  mistral: Mistral,
  doubao: Doubao,
  hunyuan: Hunyuan,
  baidu: Baidu,
  minimax: Minimax,
  yi: Yi,
  baichuan: Baichuan,
  cohere: Cohere,
  microsoft: Microsoft,
  nova: Nova,
  perplexity: Perplexity,
  nous: NousResearch,
  nvidia: Nvidia,
  ai21: Ai21,
  dbrx: Dbrx,
};

interface ModelIconProps {
  model?: string | null;
  className?: string;
  size?: number;
}

/**
 * 按模型 ID 渲染品牌图标。
 *
 * 未识别的模型使用中性 Bot 图标，而不是回退到 Provider 类型，
 * 避免 OpenAI 兼容渠道里的 DeepSeek/Qwen 等模型被误显示成 OpenAI。
 */
export function ModelIcon({ model, className, size = 18 }: ModelIconProps) {
  const brand = resolveModelBrand(model);
  if (brand === "generic") {
    return (
      <Bot
        aria-hidden="true"
        className={cn("shrink-0", className)}
        size={size}
      />
    );
  }

  const Icon = BRAND_ICONS[brand];
  return (
    <Icon
      aria-hidden="true"
      className={cn("shrink-0", className)}
      size={size}
    />
  );
}
