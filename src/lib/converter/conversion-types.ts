import type * as THREE from 'three';
import type { MeshModelFormat, ModelFormat } from '@/lib/model/model-types';

export type ConversionInput = {
  fileName: string;
  sourceFormat: ModelFormat;
  targetFormat: MeshModelFormat;
  object: THREE.Object3D;
  scaleFactor?: number;
};

export type ConversionResult = {
  blob: Blob;
  fileName: string;
  mimeType: string;
};
