import type { ModelRecord } from '@mlc-ai/web-llm'
import { prebuiltAppConfig } from '@mlc-ai/web-llm'

export type WebLlmModelId =
  | 'Llama-3.2-3B-Instruct-q4f16_1-MLC'
  | 'Phi-3.5-mini-instruct-q4f16_1-MLC'
  | 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC'

export interface WebLlmModel {
  id: WebLlmModelId
  label: string
  quantization: string
  size: string
  contextLength: string
  recommendedTier: string
  description: string
  record: ModelRecord
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
    contextLength: '4K tokens',
    recommendedTier: '4–6 GB VRAM / mid-tier WebGPU',
    description: 'Balanced general-purpose model tuned for quick WebGPU warmup.',
    record: pickRecord('Llama-3.2-3B-Instruct-q4f16_1-MLC')
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    label: 'Phi-3.5 Mini (q4f16_1)',
    quantization: 'q4f16_1',
    size: '~3.6 GB',
    contextLength: '4K tokens',
    recommendedTier: '≤4 GB VRAM / low-power devices',
    description: 'Small-footprint chat baseline for devices without much headroom.',
    record: pickRecord('Phi-3.5-mini-instruct-q4f16_1-MLC')
  },
  {
    id: 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC',
    label: 'Hermes 2 Pro Llama 3 8B (q4f16_1)',
    quantization: 'q4f16_1',
    size: '~5.0 GB',
    contextLength: '4K tokens',
    recommendedTier: '8–12 GB VRAM / desktop dGPU',
    description: 'Higher quality responses when more VRAM is available.',
    record: pickRecord('Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC')
  }
]

export const defaultWebLlmModelId: WebLlmModelId = webLlmModels[0]?.id ?? 'Llama-3.2-3B-Instruct-q4f16_1-MLC'
export const webLlmModelRecords = webLlmModels.map((model) => model.record)
