import { exportModelObject } from './export-model';
import type { ConversionInput, ConversionResult } from './conversion-types';

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '') || 'converted-model';
}

function mimeTypeForFormat(format: ConversionInput['targetFormat']) {
  if (format === 'stl') return 'model/stl';
  if (format === 'obj') return 'text/plain';
  if (format === 'glb') return 'model/gltf-binary';
  return 'application/octet-stream';
}

export async function convertModel(input: ConversionInput): Promise<ConversionResult> {
  const blob = await exportModelObject(input.object, input.targetFormat, input.scaleFactor);
  const mimeType = mimeTypeForFormat(input.targetFormat);
  const scaleSuffix = input.scaleFactor && input.scaleFactor !== 1 ? `-scaled-${Math.round(input.scaleFactor * 100)}pct` : '';
  return {
    blob: blob.type ? blob : new Blob([blob], { type: mimeType }),
    fileName: `${stripExtension(input.fileName)}${scaleSuffix}.${input.targetFormat}`,
    mimeType,
  };
}
