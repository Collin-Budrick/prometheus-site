# WebGPU capability probe

This route uses a lightweight TypeGPU-style probe to assess available GPU capability without blocking navigation or requiring heavy client bundles.

## Probe goals

- Allocate progressively larger buffers to observe the largest safe size.
- Measure copy bandwidth to estimate device performance.
- Categorize devices into simple tiers for UI hints.
- Fail gracefully when WebGPU is not present or allocations fail.

## Implementation details

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

## UI behavior

- The island runs the probe in `useVisibleTask$` and exposes a re-run button.
- Status messages cover running, unavailable, error, and complete states.
- When a tier is detected, it emits via `onTierDetected$` so parents can react (e.g., adjust model picks).

## Safety notes

- All DOM access and WebGPU usage occur client-side; SSR renders remain pure.
- Buffers are destroyed after timing to avoid leaks.
- Timing uses `performance.now()` when available and guards against zero-duration measurements.
