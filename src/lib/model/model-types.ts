import type * as THREE from 'three';

export type MeshModelFormat = 'stl' | 'obj' | 'ply' | 'glb';
export type CadModelFormat = 'step' | 'stp';
export type ModelFormat = MeshModelFormat | CadModelFormat;

export type ParsedModel = {
  fileName: string;
  format: ModelFormat;
  object: THREE.Object3D;
};

export type ModelMeasurement = {
  dimensionsMm: {
    x: number;
    y: number;
    z: number;
  };
  centerOfMassMm: {
    x: number;
    y: number;
    z: number;
  } | null;
  volumeMm3: number | null;
  volumeCm3: number | null;
  surfaceAreaMm2: number | null;
  triangleCount: number;
  meshCount: number;
  boundingBoxVolumeMm3: number;
};

export const meshModelFormats: MeshModelFormat[] = ['stl', 'obj', 'ply', 'glb'];
export const cadModelFormats: CadModelFormat[] = ['step', 'stp'];

export function getModelFormat(fileName: string): ModelFormat {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'stl' || extension === 'obj' || extension === 'ply' || extension === 'glb' || extension === 'step' || extension === 'stp') {
    return extension;
  }
  throw new Error('暂不支持该模型格式。请使用 STL、OBJ、PLY、GLB、STEP 或 STP 文件。');
}

export function isCadModelFormat(format: string): format is CadModelFormat {
  return ['step', 'stp'].includes(format.toLowerCase());
}

export function isMeshModelFormat(format: string): format is MeshModelFormat {
  return ['stl', 'obj', 'ply', 'glb'].includes(format.toLowerCase());
}

export function normalizeCadFormat(format: CadModelFormat) {
  if (format === 'stp') return 'step';
  return format;
}
