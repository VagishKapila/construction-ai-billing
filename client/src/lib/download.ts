/**
 * Download Helper Utility
 * Shared function for downloading blobs as files
 */

/**
 * Download a blob as a file
 * @param blob The blob to download
 * @param filename The filename to save as
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
