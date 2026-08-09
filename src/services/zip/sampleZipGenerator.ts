import JSZip from 'jszip';

export class SampleZipGenerator {
  /**
   * Generates a valid test Bemba Voice Model ZIP blob in memory.
   */
  static async generateSampleZip(): Promise<Blob> {
    throw new Error(
      'Synthetic ONNX model generation has been disabled. Real ONNX model exported from "facebook/mms-tts-bem" must be provided via upload.'
    );
  }

  /**
   * Generates a malicious test ZIP with path traversal ("../../evil.onnx", "../../malicious.txt") to test security rejection.
   */
  static async generateMaliciousZip(): Promise<Blob> {
    const zip = new JSZip();
    zip.file('model.onnx', new Uint8Array([1, 2, 3]));
    zip.file('../../malicious_system_override.txt', 'MALICIOUS_PAYLOAD');
    zip.file('../../evil.onnx', 'MALICIOUS_EVIL_ONNX_PAYLOAD');
    zip.file('..\\..\\win_evil.onnx', 'MALICIOUS_WIN_TRAVERSAL');
    zip.file('/absolute/etc/passwd.onnx', 'MALICIOUS_ABS_PATH');
    return await zip.generateAsync({ type: 'blob' });
  }

  /**
   * Generates an invalid test ZIP missing "model.onnx".
   */
  static async generateMissingModelZip(): Promise<Blob> {
    const zip = new JSZip();
    zip.file('config.json', JSON.stringify({ name: 'Empty' }));
    return await zip.generateAsync({ type: 'blob' });
  }

  /**
   * Generates an invalid test ZIP with an empty model.onnx (0 bytes).
   */
  static async generateEmptyModelZip(): Promise<Blob> {
    const zip = new JSZip();
    zip.file('model.onnx', new Uint8Array(0));
    zip.file('config.json', JSON.stringify({ name: 'Empty ONNX' }));
    return await zip.generateAsync({ type: 'blob' });
  }

  /**
   * Generates an invalid test ZIP containing an HTML document stored as "model.onnx".
   */
  static async generateHtmlModelZip(): Promise<Blob> {
    const zip = new JSZip();
    const htmlContent = `<!DOCTYPE html>\n<html>\n<head><title>404 Not Found</title></head>\n<body><h1>Error 404: Download Failed</h1></body>\n</html>`;
    zip.file('model.onnx', new TextEncoder().encode(htmlContent));
    zip.file('config.json', JSON.stringify({ name: 'HTML Error Page Model' }));
    return await zip.generateAsync({ type: 'blob' });
  }
}
