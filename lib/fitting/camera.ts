export async function settleStream(
  pending: Promise<MediaStream>,
  isStale: () => boolean,
): Promise<MediaStream | null> {
  const stream = await pending
  if (isStale()) {
    stream.getTracks().forEach((track) => track.stop())
    return null
  }
  return stream
}
