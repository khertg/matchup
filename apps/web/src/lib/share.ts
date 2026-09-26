export interface ShareImagesOptions {
  files: File[]
  title: string
  text?: string
  url?: string
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  URL.revokeObjectURL(url)
}

/** Download every file directly, skipping the native share sheet entirely. */
export function downloadImages(files: File[]) {
  for (const file of files) downloadFile(file)
}

/** Try the native share sheet. "cancelled" for a dismissed sheet, "failed" for anything else, so the caller can fall back instead of erroring out. */
async function tryShare(data: ShareData): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    await navigator.share(data)
    return 'shared'
  } catch (error) {
    return isAbort(error) ? 'cancelled' : 'failed'
  }
}

/**
 * Share one or more images through the device's native share sheet when it can take files;
 * otherwise share a link through the same native sheet if one is given; otherwise download
 * every file. A person dismissing the share sheet is reported as "cancelled", not an error. Any
 * other share failure (the sheet refuses the files, a permission error, ...) falls back to a
 * download rather than leaving the person with nothing.
 */
export async function shareImages({ files, title, text, url }: ShareImagesOptions): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files })) {
    const result = await tryShare({ files, title, text })
    if (result !== 'failed') return result
  }
  if (typeof navigator.share === 'function' && url) {
    const result = await tryShare({ title, text, url })
    if (result !== 'failed') return result
  }
  downloadImages(files)
  return 'downloaded'
}

/** Whether shareImages() would open the device's native share sheet at all, to label a button. */
export function canShareNatively(): boolean {
  return typeof navigator.share === 'function'
}

/**
 * File names for a set of shared images: `<base>.<ext>` for one, `<base>-1-of-3.<ext>` and so on for
 * several, so they sort in order and say they belong together.
 */
export function cardFileNames(base: string, count: number, ext = 'png'): string[] {
  if (count === 1) return [`${base}.${ext}`]
  return Array.from({ length: count }, (_, i) => `${base}-${i + 1}-of-${count}.${ext}`)
}
