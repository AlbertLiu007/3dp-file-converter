import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { MeshModelFormat } from '@/lib/model/model-types';

function cloneForExport(object: THREE.Object3D) {
  const cloned = object.clone(true);
  cloned.updateMatrixWorld(true);
  return cloned;
}

function textBlob(content: string, mimeType: string) {
  return new Blob([content], { type: mimeType });
}

function arrayBufferBlob(content: ArrayBuffer, mimeType: string) {
  return new Blob([content], { type: mimeType });
}

function exportGlb(object: THREE.Object3D) {
  return new Promise<Blob>((resolve, reject) => {
    new GLTFExporter().parse(
      object,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(arrayBufferBlob(result, 'model/gltf-binary'));
          return;
        }
        reject(new Error('GLB 导出失败。'));
      },
      (error) => reject(error),
      { binary: true },
    );
  });
}

function exportPly(object: THREE.Object3D) {
  return new Promise<Blob>((resolve) => {
    const result = new PLYExporter().parse(
      object,
      (content) => {
        resolve(textBlob(content, 'application/octet-stream'));
      },
      { binary: false },
    );
    if (typeof result === 'string') resolve(textBlob(result, 'application/octet-stream'));
  });
}

export async function exportModelObject(object: THREE.Object3D, targetFormat: MeshModelFormat) {
  const exportObject = cloneForExport(object);

  if (targetFormat === 'stl') {
    const content = new STLExporter().parse(exportObject, { binary: false });
    return textBlob(content, 'model/stl');
  }

  if (targetFormat === 'obj') {
    const content = new OBJExporter().parse(exportObject);
    return textBlob(content, 'text/plain');
  }

  if (targetFormat === 'ply') {
    return exportPly(exportObject);
  }

  return exportGlb(exportObject);
}
