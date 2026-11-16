/** One IndexedDB photo record describes variants of a single image. */
export function selectZaloPhotoSource(media: Record<string, unknown>, params: unknown = media.params) {
  const record = (value: unknown): Record<string, unknown> => {
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch { return {}; }
    }
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  };
  const content = record(media.content);
  const fields = [media, record(params), content, record(content.params)];
  const urls = (keys: string[]) => keys.flatMap(key => fields.map(field => field[key]))
    .filter((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value.trim()))
    .map(value => value.trim());
  const originals = urls(["oriUrl", "originalUrl", "originUrl", "hd_renew", "hdUrl", "hd"]);
  const previews = new Set(urls(["thumbUrl", "thumbnailUrl", "thumb", "thumbnail"]));
  const normal = urls(["normalUrl", "imageUrl", "photoUrl", "href_renew", "href", "url"]);
  const selected = originals[0] || normal.find(url => !previews.has(url));
  return { imageUrls: selected ? [selected] : [], imagePreviewOnly: !selected && previews.size > 0 };
}

export function zaloPhotoSourceBrowserScript() {
  return `globalThis.__name = globalThis.__name || Object; globalThis.__zaloSelectPhotoSource = (${selectZaloPhotoSource.toString()});`;
}
