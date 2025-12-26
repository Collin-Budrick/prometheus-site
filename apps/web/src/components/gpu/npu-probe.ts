const DEFAULT_MATRIX_SIZE = 256
const DEFAULT_ITERATIONS = 6

export type NpuTier = 'unavailable' | 'low' | 'mid' | 'high'

export type NpuProbeStatus = 'unavailable' | 'running' | 'complete' | 'error'

export interface NpuProbeMetrics {
  matrixSize: number
  iterations: number
  avgInferenceMs: number
  opsPerSecond: number
}

export interface NpuProbeResult {
  status: NpuProbeStatus
  tier: NpuTier
  backend?: string
  metrics?: NpuProbeMetrics
  message?: string
  error?: string
}

export const npuTierThresholds = {
  midGops: 10,
  highGops: 40
}

const safeNavigator = () => (typeof navigator === 'undefined' ? undefined : navigator)

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const resolveMaybe = async <T>(value: T | Promise<T>): Promise<T> => {
  if (value && typeof (value as Promise<T>).then === 'function') {
    return await (value as Promise<T>)
  }
  return value as T
}

const createDescriptor = (size: number) =>
  ({
    type: 'float32',
    dataType: 'float32',
    dimensions: [size, size],
    shape: [size, size]
  }) as Record<string, unknown>

const requestContext = async (ml: { createContext?: (options?: Record<string, unknown>) => Promise<any> }) => {
  const optionsList = [
    { deviceType: 'npu', powerPreference: 'high-performance' },
    { deviceType: 'npu' },
    { deviceType: 'auto', powerPreference: 'high-performance' },
    { deviceType: 'auto' }
  ]

  for (const options of optionsList) {
    try {
      const context = await ml.createContext?.(options)
      if (context) {
        return {
          context,
          requestedDeviceType: typeof options.deviceType === 'string' ? options.deviceType : 'auto'
        }
      }
    } catch {
      continue
    }
  }

  return null
}

const getGraphBuilder = (context: unknown) => {
  const MLGraphBuilderCtor = (globalThis as { MLGraphBuilder?: new (ctx: unknown) => any }).MLGraphBuilder
  if (MLGraphBuilderCtor) return new MLGraphBuilderCtor(context)
  if (typeof (context as { createGraphBuilder?: () => any }).createGraphBuilder === 'function') {
    return (context as { createGraphBuilder: () => any }).createGraphBuilder()
  }
  return null
}

type TensorInfo = {
  tensor: unknown | null
  needsWrite: boolean
}

const createTensor = async (
  context: any,
  desc: Record<string, unknown>,
  data?: Float32Array
): Promise<TensorInfo> => {
  if (typeof context?.createTensor !== 'function') {
    return { tensor: null, needsWrite: false }
  }
  if (data) {
    try {
      return { tensor: await resolveMaybe(context.createTensor(desc, data)), needsWrite: false }
    } catch {
      return { tensor: await resolveMaybe(context.createTensor(desc)), needsWrite: true }
    }
  }
  return { tensor: await resolveMaybe(context.createTensor(desc)), needsWrite: false }
}

const ensureTensorData = async (context: any, info: TensorInfo | null, data: Float32Array) => {
  if (!info?.tensor || !info.needsWrite) return
  if (typeof context?.writeTensor === 'function') {
    try {
      await resolveMaybe(context.writeTensor(info.tensor, data))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (/write access/i.test(reason)) return
      throw error
    }
    return
  }
  if (typeof (info.tensor as { write?: (data: Float32Array) => Promise<void> }).write === 'function') {
    await resolveMaybe((info.tensor as { write: (data: Float32Array) => Promise<void> }).write(data))
  }
}

type ComputeOperands = Record<string, unknown>

const runCompute = async (
  context: any,
  graph: any,
  tensorInputs: ComputeOperands | null,
  tensorOutputs: ComputeOperands | null,
  arrayInputs: ComputeOperands,
  arrayOutputs: ComputeOperands
) => {
  let lastError: unknown = null
  let triedMethod = false

  const tryCall = async (target: unknown, methodName: string, args: unknown[]) => {
    const method = (target as Record<string, unknown> | null)?.[methodName]
    if (typeof method !== 'function') return false
    triedMethod = true
    try {
      await resolveMaybe((method as (...values: unknown[]) => unknown).apply(target, args))
      return true
    } catch (error) {
      lastError = error
      return false
    }
  }

  const graphMethods = ['compute', 'dispatch', 'run', 'execute']
  const contextMethods = ['compute', 'dispatch', 'run', 'execute']

  const attemptWith = async (inputs: ComputeOperands, outputs: ComputeOperands | null) => {
    for (const method of graphMethods) {
      if (outputs && (await tryCall(graph, method, [inputs, outputs]))) return true
      if (await tryCall(graph, method, [inputs])) return true
    }
    for (const method of contextMethods) {
      if (outputs && (await tryCall(context, method, [graph, inputs, outputs]))) return true
      if (await tryCall(context, method, [graph, inputs])) return true
    }
    return false
  }

  if (tensorInputs && (await attemptWith(tensorInputs, tensorOutputs ?? null))) return
  if (await attemptWith(arrayInputs, arrayOutputs)) return

  if (!triedMethod) {
    throw new Error('WebNN compute API unavailable.')
  }
  if (lastError instanceof Error) {
    throw lastError
  }
  throw new Error(String(lastError ?? 'WebNN compute failed.'))
}

const destroyTensor = (tensor: unknown) => {
  if (tensor && typeof (tensor as { destroy?: () => void }).destroy === 'function') {
    ;(tensor as { destroy: () => void }).destroy()
  }
}

const classifyTier = (opsPerSecond: number): NpuTier => {
  if (opsPerSecond <= 0) return 'unavailable'
  const gops = opsPerSecond / 1_000_000_000
  if (gops >= npuTierThresholds.highGops) return 'high'
  if (gops >= npuTierThresholds.midGops) return 'mid'
  return 'low'
}

export const probeNpuCapabilities = async (): Promise<NpuProbeResult> => {
  const nav = safeNavigator()
  const ml = nav && (nav as Navigator & { ml?: { createContext?: (options?: Record<string, unknown>) => Promise<any> } }).ml

  if (!ml?.createContext) {
    return {
      status: 'unavailable',
      tier: 'unavailable',
      message: 'WebNN not detected; NPU probe skipped.'
    }
  }

  try {
    const contextInfo = await requestContext(ml)
    if (!contextInfo) {
      return {
        status: 'unavailable',
        tier: 'unavailable',
        message: 'WebNN context unavailable.'
      }
    }

    const { context, requestedDeviceType } = contextInfo
    const backend = typeof context?.deviceType === 'string' ? context.deviceType : requestedDeviceType

    const builder = getGraphBuilder(context)
    if (!builder || typeof builder.input !== 'function' || typeof builder.matmul !== 'function' || typeof builder.build !== 'function') {
      return {
        status: 'unavailable',
        tier: 'unavailable',
        message: 'WebNN graph builder unavailable.'
      }
    }

    const matrixSize = DEFAULT_MATRIX_SIZE
    const iterations = DEFAULT_ITERATIONS
    const desc = createDescriptor(matrixSize)

    const input = builder.input('input', desc)
    const weights = builder.input('weights', desc)
    const output = builder.matmul(input, weights)
    const graph = await resolveMaybe(builder.build({ output }))

    if (!graph) {
      return {
        status: 'unavailable',
        tier: 'unavailable',
        message: 'WebNN graph build failed.'
      }
    }

    const inputData = new Float32Array(matrixSize * matrixSize)
    inputData.fill(0.5)

    const weightsData = new Float32Array(matrixSize * matrixSize)
    weightsData.fill(0.25)

    const arrayInputs = { input: inputData, weights: weightsData }
    const arrayOutputs = { output: new Float32Array(matrixSize * matrixSize) }

    let inputTensor: TensorInfo | null = null
    let weightsTensor: TensorInfo | null = null
    let outputTensor: TensorInfo | null = null

    try {
      inputTensor = await createTensor(context, desc, inputData)
      weightsTensor = await createTensor(context, desc, weightsData)
      outputTensor = await createTensor(context, desc)

      const tensorInputs =
        inputTensor?.tensor && weightsTensor?.tensor
          ? { input: inputTensor.tensor, weights: weightsTensor.tensor }
          : null
      const tensorOutputs = outputTensor?.tensor ? { output: outputTensor.tensor } : null

      await ensureTensorData(context, inputTensor, inputData)
      await ensureTensorData(context, weightsTensor, weightsData)

      await runCompute(context, graph, tensorInputs, tensorOutputs, arrayInputs, arrayOutputs)

      const start = now()
      for (let i = 0; i < iterations; i += 1) {
        await runCompute(context, graph, tensorInputs, tensorOutputs, arrayInputs, arrayOutputs)
      }
      const end = now()
      const elapsedMs = Math.max(end - start, 0.0001)

      const opsPerIteration = 2 * matrixSize * matrixSize * matrixSize
      const totalOps = opsPerIteration * iterations
      const opsPerSecond = totalOps / (elapsedMs / 1000)
      const tier = classifyTier(opsPerSecond)

      return {
        status: 'complete',
        tier,
        backend,
        metrics: {
          matrixSize,
          iterations,
          avgInferenceMs: elapsedMs / iterations,
          opsPerSecond
        },
        message: backend && backend !== 'npu' ? `NPU not exposed; WebNN backend: ${backend}.` : undefined
      }
    } finally {
      destroyTensor(inputTensor?.tensor ?? null)
      destroyTensor(weightsTensor?.tensor ?? null)
      destroyTensor(outputTensor?.tensor ?? null)
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown WebNN error'

    return {
      status: 'error',
      tier: 'unavailable',
      error: reason,
      message: 'NPU probe failed.'
    }
  }
}
