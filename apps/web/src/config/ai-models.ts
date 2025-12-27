import { webNnLocalModels } from './webnn-local-models'

export type WebLlmModelId =
  | 'Llama-3.2-3B-Instruct-q4f16_1-MLC'
  | 'Phi-3.5-mini-instruct-q4f16_1-MLC'
  | 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC'

export type WebNnModelId = string

export type AiModelId = WebLlmModelId | WebNnModelId

export type TransformersDtype = 'auto' | 'fp32' | 'fp16' | 'int8' | 'uint8' | 'q4' | 'q4f16' | 'q8' | 'bnb4'

export interface TransformersModelSpec {
  id: string
  label: string
  task: 'text-generation'
  dtype?: TransformersDtype
}

export interface WebLlmModel {
  id: WebLlmModelId
  label: string
  quantization: string
  size: string
  sizeBytes: number
  contextLength: string
  recommendedTier: string
  description: string
  transformers: TransformersModelSpec
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
  transformers: TransformersModelSpec
  webnnUnsupportedReason?: string
  webnnFreeDims?: Record<string, number>
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
    }
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
    }
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
    }
  }
]

export const webNnModels: WebNnModel[] = [
  {
    id: 'onnx-community/gemma-3-270m-it-ONNX',
    label: 'Gemma 3 270M IT (ORT)',
    format: 'ONNX (fp16)',
    size: '~570 MB',
    sizeBytes: 570_135_687,
    contextLength: '32K tokens',
    recommendedTier: 'WebNN / NPU friendly',
    description: 'Remote ONNX package hosted on Hugging Face for WebNN via ONNX Runtime.',
    transformers: {
      id: 'onnx-community/gemma-3-270m-it-ONNX',
      label: 'Gemma 3 270M IT (ORT)',
      task: 'text-generation',
      dtype: 'fp16'
    },
    webnnFreeDims: {
      batch_size: 1,
      sequence_length: 1024,
      total_sequence_length: 1024,
      past_sequence_length: 1024
    }
  },
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
  },
  ...webNnLocalModels
]

export const defaultWebLlmModelId: WebLlmModelId = webLlmModels[0]?.id ?? 'Llama-3.2-3B-Instruct-q4f16_1-MLC'
export const defaultWebNnModelId: WebNnModelId = webNnModels[0]?.id ?? 'Xenova/gpt2'

const webLlmModelIds = new Set(webLlmModels.map((model) => model.id))

export const isWebLlmModelId = (value: string): value is WebLlmModelId => webLlmModelIds.has(value as WebLlmModelId)

export const getTransformersModel = (modelId: AiModelId) =>
  webNnModels.find((model) => model.id === modelId) ?? webLlmModels.find((model) => model.id === modelId)
