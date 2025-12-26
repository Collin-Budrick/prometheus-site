import type { ModelRecord } from '@mlc-ai/web-llm'
import { prebuiltAppConfig } from '@mlc-ai/web-llm'
import { webLlmModels, type WebLlmModelId } from '../config/ai-models'

const modelLookup = new Map(prebuiltAppConfig.model_list.map((record) => [record.model_id, record]))

const pickRecord = (id: WebLlmModelId): ModelRecord => {
  const record = modelLookup.get(id)

  if (!record) {
    throw new Error(`Missing WebLLM prebuilt model for ${id}`)
  }

  return record
}

export const webLlmModelRecords = webLlmModels.map((model) => pickRecord(model.id))
