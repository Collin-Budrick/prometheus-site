import type { WebNnModel } from './ai-models'

// Add custom/local WebNN models here. Place the model files under /apps/web/public/models/webnn/<folder>.
export const webNnLocalModels: WebNnModel[] = [
  {
    id: '/models/webnn/distilgpt2',
    label: 'DistilGPT-2 (local WebNN)',
    format: 'ONNX (fp16)',
    size: '~165 MB',
    sizeBytes: 164_003_836,
    contextLength: '1K tokens',
    recommendedTier: 'WebNN / NPU friendly',
    description: 'Local ONNX package stored under /models/webnn/distilgpt2.',
    transformers: {
      id: '/models/webnn/distilgpt2',
      label: 'DistilGPT-2 (local WebNN)',
      task: 'text-generation',
      dtype: 'fp16'
    }
  }
]
