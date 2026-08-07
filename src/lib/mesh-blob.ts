/** Cache remote/expiring GLB URLs into blob: URLs in the browser */
export async function ensureLocalMeshUrl(url: string): Promise<string> {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    const response = await fetch(url);
    if (!response.ok) return url;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return url;
  }
}
