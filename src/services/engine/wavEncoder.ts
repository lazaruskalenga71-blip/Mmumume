/**
 * WAV Audio Encoder Utility
 * Converts Float32Array PCM audio samples into a standard 16-bit PCM WAV Blob.
 */

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1; // Mono
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Helper function to write strings
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  /* RIFF chunk descriptor */
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  /* fmt sub-chunk */
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  /* data sub-chunk */
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write 16-bit PCM samples with clipping protection [-1.0, 1.0]
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const int16Val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, int16Val, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function downloadWavFile(samples: Float32Array, sampleRate: number, filename: string = 'bemba_tts_mwashibukeni.wav') {
  const blob = encodeWav(samples, sampleRate);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
