/**
 * three の GLTFExporter を Node で動かすための最小限の polyfill。
 * GLTFExporter は Blob の中身を FileReader で読むため、Blob#arrayBuffer() で代わりに読む。
 */
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
}

export function installNodePolyfills(): void {
  const g = globalThis as { FileReader?: unknown };
  g.FileReader ??= NodeFileReader;
}
