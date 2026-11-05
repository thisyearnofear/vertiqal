/**
 * Triggers a browser download for a Blob/File. The object URL is revoked on a
 * delay — revoking synchronously after click() can cancel the download before
 * the browser has started fetching the blob.
 */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
