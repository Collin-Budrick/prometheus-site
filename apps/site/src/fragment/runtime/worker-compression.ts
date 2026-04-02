import type { FragmentCompressionEncoding } from '@core/fragment/compression'

export const canReadWorkerStreamEncoding = (
  encoding: FragmentCompressionEncoding | null,
  acceptedEncodings: ReadonlyArray<FragmentCompressionEncoding>
) => {
  if (!encoding) return true
  if (encoding === 'zstd') return false
  return acceptedEncodings.includes(encoding)
}

export const shouldUseCompressedWorkerBootStream = ({
  firstWorkerCommitSent,
  supportedEncodingCount
}: {
  firstWorkerCommitSent: boolean
  supportedEncodingCount: number
}) => !firstWorkerCommitSent && supportedEncodingCount > 0
