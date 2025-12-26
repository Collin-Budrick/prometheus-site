import type { ModelRecord } from '@mlc-ai/web-llm'
import { prebuiltAppConfig } from '@mlc-ai/web-llm'

export type WebLlmModelId =
  | 'Llama-3.2-3B-Instruct-q4f16_1-MLC'
  | 'Phi-3.5-mini-instruct-q4f16_1-MLC'
  | 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC'

export type WebNnModelId = 'Xenova/gpt2' | 'Xenova/distilgpt2' | 'Xenova/opt-125m'

export type AiModelId = WebLlmModelId | WebNnModelId

export interface WebLlmModel {
  id: WebLlmModelId
  label: string
  quantization: string
  size: string
  sizeBytes: number
  contextLength: string
  recommendedTier: string
  description: string
  transformers: {
    id: string
    label: string
    task: 'text-generation'
  }
  record: ModelRecord
}

export interface WebNnModel {
  id: WebNnModelId
  label: string
  format: string
  size: string
  sizeBytes: number
  contextLength: string
  recommendedTier: string
  description: string
  transformers: {
    id: string
    label: string
    task: 'text-generation'
  }
}

const modelLookup = new Map(prebuiltAppConfig.model_list.map((record) => [record.model_id, record]))

const pickRecord = (id: WebLlmModelId): ModelRecord => {
  const record = modelLookup.get(id)

  if (!record) {
    throw new Error(`Missing WebLLM prebuilt model for ${id}`)
  }

  return record
}

export const webLlmModels: WebLlmModel[] = [
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    label: 'Llama 3.2 3B (q4f16_1)',
    quantization: 'q4f16_1',
    size: '~2.3 GB',
    sizeBytes: 2_469_606_195,
    contextLength: '4K tokens',
    recommendedTier: '4–6 GB VRAM / mid-tier WebGPU',
    description: 'Balanced general-purpose model tuned for quick WebGPU warmup.',
    transformers: {
      id: 'Xenova/gpt2',
      label: 'GPT-2 (ONNX)',
      task: 'text-generation'
    },
    record: pickRecord('Llama-3.2-3B-Instruct-q4f16_1-MLC')
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    label: 'Phi-3.5 Mini (q4f16_1)',
    quantization: 'q4f16_1',
    size: '~3.6 GB',
    sizeBytes: 3_865_470_566,
    contextLength: '4K tokens',
    recommendedTier: '≤4 GB VRAM / low-power devices',
    description: 'Small-footprint chat baseline for devices without much headroom.',
    transformers: {
      id: 'Xenova/distilgpt2',
      label: 'DistilGPT-2 (ONNX)',
      task: 'text-generation'
    },
    record: pickRecord('Phi-3.5-mini-instruct-q4f16_1-MLC')
  },
  {
    id: 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC',
    label: 'Hermes 2 Pro Llama 3 8B (q4f16_1)',
    quantization: 'q4f16_1',
    size: '~5.0 GB',
    sizeBytes: 5_368_709_120,
    contextLength: '4K tokens',
    recommendedTier: '8–12 GB VRAM / desktop dGPU',
    description: 'Higher quality responses when more VRAM is available.',
    transformers: {
      id: 'Xenova/gpt2',
      label: 'GPT-2 (ONNX)',
      task: 'text-generation'
    },
    record: pickRecord('Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC')
  }
]

export const webNnModels: WebNnModel[] = [
  {
    id: 'Xenova/gpt2',
    label: 'GPT-2 (ORT)',
    format: 'ONNX (fp16)',
    size: '~550 MB',
    sizeBytes: 576_716_800,
    contextLength: '1K tokens',
    recommendedTier: 'WebNN / NPU friendly',
    description: 'Compact ONNX baseline optimized for fast WebNN startup.',
    transformers: {
      id: 'Xenova/gpt2',
      label: 'GPT-2 (ORT)',
      task: 'text-generation'
    }
  },
  {
    id: 'Xenova/distilgpt2',
    label: 'DistilGPT-2 (ORT)',
    format: 'ONNX (int8)',
    size: '~350 MB',
    sizeBytes: 367_001_600,
    contextLength: '1K tokens',
    recommendedTier: 'Low-power WebNN / CPU',
    description: 'Small-footprint ORT model for quick iterations on NPU-class hardware.',
    transformers: {
      id: 'Xenova/distilgpt2',
      label: 'DistilGPT-2 (ORT)',
      task: 'text-generation'
    }
  },
  {
    id: 'Xenova/opt-125m',
    label: 'OPT 125M (ORT)',
    format: 'ONNX (int8)',
    size: '~260 MB',
    sizeBytes: 272_629_760,
    contextLength: '2K tokens',
    recommendedTier: 'Balanced WebNN / GPU fallback',
    description: 'Lightweight OPT checkpoint packaged for ONNX Runtime Web.',
    transformers: {
      id: 'Xenova/opt-125m',
      label: 'OPT 125M (ORT)',
      task: 'text-generation'
    }
  }
]

export const defaultWebLlmModelId: WebLlmModelId = webLlmModels[0]?.id ?? 'Llama-3.2-3B-Instruct-q4f16_1-MLC'
export const defaultWebNnModelId: WebNnModelId = webNnModels[0]?.id ?? 'Xenova/gpt2'
export const webLlmModelRecords = webLlmModels.map((model) => model.record)

const webLlmModelIds = new Set(webLlmModels.map((model) => model.id))

export const isWebLlmModelId = (value: string): value is WebLlmModelId => webLlmModelIds.has(value as WebLlmModelId)

export const getTransformersModel = (modelId: AiModelId) =>
  webNnModels.find((model) => model.id === modelId) ?? webLlmModels.find((model) => model.id === modelId)
