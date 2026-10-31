type UploadOptions = { url: string; file: File; headers: Record<string, string>; onProgress?: (percent: number) => void };
class UploadError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); }
}
/** Direct PUT with progress, stalled-connection detection and bounded transient retries. */
export async function uploadDirect(options: UploadOptions) {
  for (let attempt = 0; ; attempt++) {
    try { await put(options); return; }
    catch (error) {
      if (!(error instanceof UploadError) || !error.retryable || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}
function put({ url, file, headers, onProgress }: UploadOptions) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let watchdog: ReturnType<typeof setTimeout>;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(watchdog);
      if (error) reject(error); else resolve();
    };
    const touch = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        finish(new UploadError(`Kết nối tải ${file.name} không phản hồi. Hãy kiểm tra mạng và thử lại.`, true));
        xhr.abort();
      }, 60000);
    };
    xhr.open("PUT", url);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = event => { touch(); if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) finish();
      else finish(new UploadError(`Tải ${file.name} thất bại (HTTP ${xhr.status}). ${xhr.responseText.slice(0, 200)}`, xhr.status === 429 || xhr.status >= 500));
    };
    xhr.onerror = () => finish(new UploadError(`Không thể kết nối R2 để tải ${file.name}. Kiểm tra mạng hoặc cấu hình CORS.`, true));
    xhr.onabort = () => finish(new UploadError(`Đã ngừng tải ${file.name}.`, false));
    touch();
    try { xhr.send(file); } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
}
