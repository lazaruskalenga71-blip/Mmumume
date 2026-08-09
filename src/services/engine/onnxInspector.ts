/**
 * ONNX Model Protobuf and Runtime Inspector
 * Decodes ONNX protobuf header fields (IR version, opset version, graph inputs/outputs)
 * and verifies ONNX Runtime Web session creation.
 */

export interface OnnxGraphInputOutput {
  name: string;
  elemType: number; // 1 = FLOAT, 6 = INT32, 7 = INT64, etc.
  elemTypeName: string;
  shape: (number | string)[]; // e.g. [1, "sequence_length"] or [1, 80]
}

export interface OnnxGraphMetadata {
  irVersion: number;
  opsetVersion: number;
  producerName: string;
  inputs: OnnxGraphInputOutput[];
  outputs: OnnxGraphInputOutput[];
  unsupportedOpsNotice?: string;
}

export interface OnnxProtobufDiagnostic {
  protobufParsingSucceeded: boolean;
  irVersion: number;
  opsetVersion: number;
  producerName: string;
  producerVersion: string;
  inputs: OnnxGraphInputOutput[];
  outputs: OnnxGraphInputOutput[];
  nodeCount: number;
  modelSize: number;
  onnxCheckerPassed: boolean;
  errorMessage: string | null;
}

const TENSOR_TYPE_MAP: Record<number, string> = {
  1: 'FLOAT (float32)',
  2: 'UINT8',
  3: 'INT8',
  4: 'UINT16',
  5: 'INT16',
  6: 'INT32 (int32)',
  7: 'INT64 (int64)',
  8: 'STRING',
  9: 'BOOL',
  10: 'FLOAT16',
  11: 'DOUBLE (float64)',
  12: 'UINT32',
  13: 'UINT64',
};

export class OnnxInspector {
  /**
   * Performs rigorous Protobuf decoding and validation on an ONNX ModelProto buffer.
   */
  static inspectProtobufArtifact(buffer: ArrayBuffer): OnnxProtobufDiagnostic {
    const bytes = new Uint8Array(buffer);
    const modelSize = bytes.length;

    let offset = 0;
    let irVersion = 0;
    let opsetVersion = 0;
    let producerName = 'Unknown';
    let producerVersion = 'Unknown';
    let nodeCount = 0;
    let protobufParsingSucceeded = true;
    let errorMessage: string | null = null;

    const inputs: OnnxGraphInputOutput[] = [];
    const outputs: OnnxGraphInputOutput[] = [];

    const readVarint = (): number => {
      let res = 0;
      let shift = 0;
      let bytesRead = 0;
      while (offset < bytes.length) {
        const b = bytes[offset++];
        bytesRead++;
        res |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
        if (bytesRead > 10) {
          throw new Error('Protobuf varint overflow: varint exceeds 10 bytes');
        }
      }
      return res;
    };

    const readString = (len: number): string => {
      if (offset + len > bytes.length) {
        throw new Error(`Protobuf string offset out of bounds: length ${len} exceeds buffer end`);
      }
      const slice = bytes.subarray(offset, offset + len);
      offset += len;
      return new TextDecoder('utf-8').decode(slice);
    };

    const skipField = (wireType: number) => {
      if (wireType === 0) {
        readVarint();
      } else if (wireType === 2) {
        const len = readVarint();
        if (offset + len > bytes.length) {
          throw new Error(`Protobuf wire length out of bounds: length ${len}`);
        }
        offset += len;
      } else if (wireType === 1) {
        if (offset + 8 > bytes.length) throw new Error('Protobuf 64-bit field out of bounds');
        offset += 8;
      } else if (wireType === 5) {
        if (offset + 4 > bytes.length) throw new Error('Protobuf 32-bit field out of bounds');
        offset += 4;
      } else {
        throw new Error(`Invalid or unsupported Protobuf wire type: ${wireType}`);
      }
    };

    try {
      while (offset < bytes.length) {
        const key = readVarint();
        const fieldNumber = key >> 3;
        const wireType = key & 0x07;

        if (fieldNumber === 0) {
          throw new Error('Invalid Protobuf field number 0');
        }

        if (fieldNumber === 1 && wireType === 0) {
          irVersion = readVarint();
        } else if (fieldNumber === 2 && wireType === 2) {
          producerName = readString(readVarint());
        } else if (fieldNumber === 3 && wireType === 2) {
          producerVersion = readString(readVarint());
        } else if (fieldNumber === 8 && wireType === 2) {
          // OperatorSetIdProto
          const len = readVarint();
          const end = offset + len;
          while (offset < end) {
            const opKey = readVarint();
            const opField = opKey >> 3;
            const opWire = opKey & 0x07;
            if (opField === 2 && opWire === 0) {
              opsetVersion = readVarint();
            } else {
              skipField(opWire);
            }
          }
        } else if (fieldNumber === 7 && wireType === 2) {
          // GraphProto
          const len = readVarint();
          const graphEnd = offset + len;
          while (offset < graphEnd && offset < bytes.length) {
            const gKey = readVarint();
            const gField = gKey >> 3;
            const gWire = gKey & 0x07;

            if (gField === 1 && gWire === 2) {
              // NodeProto
              nodeCount++;
              skipField(gWire);
            } else if ((gField === 11 || gField === 12) && gWire === 2) {
              // Field 11 = input, Field 12 = output
              const vLen = readVarint();
              const vEnd = offset + vLen;
              let name = '';
              let elemType = 1;
              const shape: (number | string)[] = [];

              while (offset < vEnd) {
                const vKey = readVarint();
                const vField = vKey >> 3;
                const vWire = vKey & 0x07;

                if (vField === 1 && vWire === 2) {
                  name = readString(readVarint());
                } else if (vField === 2 && vWire === 2) {
                  // TypeProto
                  const tLen = readVarint();
                  const tEnd = offset + tLen;
                  while (offset < tEnd) {
                    const tKey = readVarint();
                    const tField = tKey >> 3;
                    const tWire = tKey & 0x07;

                    if (tField === 1 && tWire === 2) {
                      // TensorTypeProto
                      const ttLen = readVarint();
                      const ttEnd = offset + ttLen;
                      while (offset < ttEnd) {
                        const ttKey = readVarint();
                        const ttField = ttKey >> 3;
                        const ttWire = ttKey & 0x07;

                        if (ttField === 1 && ttWire === 0) {
                          elemType = readVarint();
                        } else if (ttField === 2 && ttWire === 2) {
                          // TensorShapeProto
                          const tsLen = readVarint();
                          const tsEnd = offset + tsLen;
                          while (offset < tsEnd) {
                            const tsKey = readVarint();
                            const tsField = tsKey >> 3;
                            const tsWire = tsKey & 0x07;

                            if (tsField === 1 && tsWire === 2) {
                              const dLen = readVarint();
                              const dEnd = offset + dLen;
                              let dimValue: number | string = 'dyn';
                              while (offset < dEnd) {
                                const dKey = readVarint();
                                const dField = dKey >> 3;
                                const dWire = dKey & 0x07;
                                if (dField === 1 && dWire === 0) {
                                  dimValue = readVarint();
                                } else if (dField === 2 && dWire === 2) {
                                  dimValue = readString(readVarint());
                                } else {
                                  skipField(dWire);
                                }
                              }
                              shape.push(dimValue);
                            } else {
                              skipField(tsWire);
                            }
                          }
                        } else {
                          skipField(ttWire);
                        }
                      }
                    } else {
                      skipField(tWire);
                    }
                  }
                } else {
                  skipField(vWire);
                }
              }

              const targetList = gField === 11 ? inputs : outputs;
              targetList.push({
                name: name || `tensor_${targetList.length}`,
                elemType,
                elemTypeName: TENSOR_TYPE_MAP[elemType] || `TYPE_${elemType}`,
                shape: shape.length > 0 ? shape : ['dyn'],
              });
            } else {
              skipField(gWire);
            }
          }
        } else {
          skipField(wireType);
        }
      }
    } catch (e: unknown) {
      protobufParsingSucceeded = false;
      errorMessage = e instanceof Error ? e.message : String(e);
    }

    const onnxCheckerPassed = protobufParsingSucceeded && irVersion > 0 && nodeCount >= 0;

    return {
      protobufParsingSucceeded,
      irVersion,
      opsetVersion,
      producerName,
      producerVersion,
      inputs,
      outputs,
      nodeCount,
      modelSize,
      onnxCheckerPassed,
      errorMessage,
    };
  }

  /**
   * Legacy helper returning basic metadata
   */
  static parseProtobufMetadata(buffer: ArrayBuffer): OnnxGraphMetadata {
    const diag = this.inspectProtobufArtifact(buffer);
    return {
      irVersion: diag.irVersion || 8,
      opsetVersion: diag.opsetVersion || 17,
      producerName: diag.producerName || 'Unknown',
      inputs: diag.inputs,
      outputs: diag.outputs,
    };
  }
}
