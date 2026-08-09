import { DEFAULT_BEMBA_VOCAB, bembaTtsEngine } from './BembaTtsEngine';

export interface TokenizerDebugReport {
  phrase: string;
  normalizedText: string;
  tokenIds: number[];
  validRange: [number, number];
  invalidTokenIds: { index: number; char: string; tokenId: number }[];
  isDivergent: boolean;
  vocabSize: number;
}

/**
 * Diagnostic tool to map input text against model's loaded vocab.json / DEFAULT_BEMBA_VOCAB
 * and identify any token IDs falling outside the ONNX embedding layer's valid range [0, 32].
 */
export function debugTokenizerPhrase(
  phrase: string = 'Mwapoleni.',
  customVocab?: Record<string, number>
): TokenizerDebugReport {
  const activeVocab = customVocab || DEFAULT_BEMBA_VOCAB;
  const result = bembaTtsEngine.tokenizeText(phrase, activeVocab);

  const invalidTokenIds: { index: number; char: string; tokenId: number }[] = [];
  const chars = Array.from(result.normalizedText);

  result.ids.forEach((id, idx) => {
    if (id < 0 || id > 32) {
      invalidTokenIds.push({
        index: idx,
        char: chars[idx] || '?',
        tokenId: id,
      });
    }
  });

  const report: TokenizerDebugReport = {
    phrase,
    normalizedText: result.normalizedText,
    tokenIds: result.ids,
    validRange: [0, 32],
    invalidTokenIds,
    isDivergent: invalidTokenIds.length > 0,
    vocabSize: Object.keys(activeVocab).length,
  };

  console.log('=== [TOKENIZER DIAGNOSTIC REPORT] ===');
  console.log(`Input Phrase: "${phrase}"`);
  console.log(`Normalized Text: "${report.normalizedText}"`);
  console.log(`Token IDs:`, JSON.stringify(report.tokenIds));
  console.log(`Valid ONNX Embedding Range: [0, 32]`);
  console.log(`Divergent / Out-of-bounds Token IDs count: ${invalidTokenIds.length}`);
  if (invalidTokenIds.length > 0) {
    console.warn(`Divergence detected! Out-of-bounds tokens:`, invalidTokenIds);
  } else {
    console.log(`All token IDs fall safely within [0, 32]. No embedding index exception expected.`);
  }
  console.log('======================================');

  return report;
}
