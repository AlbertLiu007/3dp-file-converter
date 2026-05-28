import { convertModel } from '@/lib/converter/convert-model';
import { parseModelBuffer } from '@/lib/model/parse-model';
import { getModelFormat, type MeshModelFormat } from '@/lib/model/model-types';

export type ConversionWorkerRequest = {
  id: string;
  fileName: string;
  buffer: ArrayBuffer;
  targetFormat: MeshModelFormat;
};

export type ConversionWorkerResponse =
  | {
      id: string;
      ok: true;
      fileName: string;
      mimeType: string;
      blob: Blob;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

self.onmessage = async (event: MessageEvent<ConversionWorkerRequest>) => {
  const { id, fileName, buffer, targetFormat } = event.data;
  try {
    const sourceFormat = getModelFormat(fileName);
    const object = await parseModelBuffer(buffer, sourceFormat);
    const result = await convertModel({ fileName, sourceFormat, targetFormat, object });
    self.postMessage({ id, ok: true, fileName: result.fileName, mimeType: result.mimeType, blob: result.blob } satisfies ConversionWorkerResponse);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Conversion failed.',
    } satisfies ConversionWorkerResponse);
  }
};
