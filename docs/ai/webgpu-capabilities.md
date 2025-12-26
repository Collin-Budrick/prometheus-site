# WebGPU + NPU capability probes

This route uses lightweight probes to assess available GPU (WebGPU) and NPU (WebNN) capability without blocking navigation or requiring heavy client bundles.

## Probe goals

- Allocate progressively larger buffers to observe the largest safe GPU buffer size.
- Measure WebGPU copy bandwidth to estimate device throughput.
- Build a tiny WebNN graph to time inference and estimate accelerator throughput.
- Categorize devices into simple tiers for UI hints.
- Fail gracefully when WebGPU/WebNN are not present or probes fail.

## WebGPU probe details

The probe lives in `apps/web/src/components/gpu/capability-probe.ts` and runs client-side via a Qwik island (`apps/web/src/routes/[locale]/ai/gpu-probe-island.tsx`). It intentionally avoids DOM access during SSR.

1. **Adapter selection**: request a `high-performance` adapter first, then fall back to `low-power`.
2. **Buffer sweep**: attempt buffer allocations from 32 MB up to the lesser of `device.limits.maxBufferSize` and 512 MB, doubling each iteration. Bandwidth is measured for each successful size via `copyBufferToBuffer` and `queue.onSubmittedWorkDone()` timing.
3. **Metrics captured**:
   - `peakBufferBytes`: largest buffer successfully copied.
   - `bestBandwidthGBps`: fastest observed throughput.
   - `attempts`: successful buffer sizes tested.
4. **Tier classification** (see `gpuTierThresholds`):
   - `low`: ≥ 128 MB buffers
   - `mid`: ≥ 384 MB buffers or ≥ 40 GB/s bandwidth
   - `high`: ≥ 768 MB buffers or ≥ 90 GB/s bandwidth
   - `unavailable`: no WebGPU, adapter missing, or no successful attempts
5. **Error handling**: missing `navigator.gpu` or adapter returns an `unavailable` status with a friendly message; runtime errors surface as an `error` status with the message and a fallback tier of `unavailable`.

## WebNN (NPU) probe details

The NPU probe lives in `apps/web/src/components/gpu/npu-probe.ts` and is triggered from the same island. It prefers an `npu` context when possible and falls back to `auto` to run on any device.

1. **Context selection**: attempt `deviceType: 'npu'` (high-performance), then fall back to `deviceType: 'auto'`.
2. **Graph build**: create a small matmul graph with a square input/weight tensor (default 256 x 256).
3. **Timing**: run a warm-up dispatch, then time a fixed number of iterations to calculate average inference time and estimated throughput.
4. **Metrics captured**:
   - `matrixSize`: square dimension of the matmul.
   - `iterations`: number of timed dispatches.
   - `avgInferenceMs`: average time per dispatch.
   - `opsPerSecond`: estimated operations per second.
5. **Tier classification** (see `npuTierThresholds`):
   - `low`: below 10 GOPS
   - `mid`: ≥ 10 GOPS
   - `high`: ≥ 40 GOPS
6. **Fallback behavior**: when the backend is not `npu`, the UI surfaces the backend string so results are still informative without claiming NPU availability.

## UI behavior

- The island runs both probes in `useVisibleTask$` and exposes a re-run button.
- Status messages cover running, unavailable, error, and complete states for WebGPU and WebNN.
- When a tier is detected, it emits via `onTierDetected$` (GPU) and `onNpuTierDetected$` so parents can react (e.g., adjust model picks).

## Safety notes

- All DOM access and WebGPU/WebNN usage occur client-side; SSR renders remain pure.
- Buffers and tensors are destroyed after timing to avoid leaks.
- Timing uses `performance.now()` when available and guards against zero-duration measurements.
