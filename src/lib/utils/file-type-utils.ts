const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

/** True when a filename's extension indicates a raster image safe to preview as a thumbnail. */
export function isImageFilename(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return Boolean(ext && IMAGE_EXTENSIONS.has(ext));
}
