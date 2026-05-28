import * as THREE from 'three';
import type { ModelMeasurement } from './model-types';

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const weightedCentroid = new THREE.Vector3();
const triangleCentroid = new THREE.Vector3();

function readTriangleVertex(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, vertexIndex: number, matrix: THREE.Matrix4, target: THREE.Vector3) {
  return target.fromBufferAttribute(position, vertexIndex).applyMatrix4(matrix);
}

function signedTetrahedronVolume(v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3) {
  return v0.dot(b.copy(v1).cross(v2)) / 6;
}

function triangleArea(v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3) {
  return b.copy(v1).sub(v0).cross(c.copy(v2).sub(v0)).length() / 2;
}

function accumulateVolume(volume: number, target: THREE.Vector3) {
  triangleCentroid.copy(a).add(b).add(c).multiplyScalar(0.25);
  target.addScaledVector(triangleCentroid, volume);
}

function measureGeometry(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  if (!position) return { triangles: 0, volume: 0, surfaceArea: 0, weightedCentroid: new THREE.Vector3() };

  const matrix = mesh.matrixWorld;
  const index = geometry.index;
  let triangles = 0;
  let volume = 0;
  let surfaceArea = 0;
  const geometryWeightedCentroid = new THREE.Vector3();

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      readTriangleVertex(position, index.getX(i), matrix, a);
      readTriangleVertex(position, index.getX(i + 1), matrix, b);
      readTriangleVertex(position, index.getX(i + 2), matrix, c);
      const signedVolume = signedTetrahedronVolume(a, b, c);
      surfaceArea += triangleArea(a, b, c);
      volume += signedVolume;
      accumulateVolume(signedVolume, geometryWeightedCentroid);
      triangles += 1;
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      readTriangleVertex(position, i, matrix, a);
      readTriangleVertex(position, i + 1, matrix, b);
      readTriangleVertex(position, i + 2, matrix, c);
      const signedVolume = signedTetrahedronVolume(a, b, c);
      surfaceArea += triangleArea(a, b, c);
      volume += signedVolume;
      accumulateVolume(signedVolume, geometryWeightedCentroid);
      triangles += 1;
    }
  }

  return { triangles, volume, surfaceArea, weightedCentroid: geometryWeightedCentroid };
}

export function measureModel(object: THREE.Object3D): ModelMeasurement {
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);

  let triangleCount = 0;
  let meshCount = 0;
  let signedVolume = 0;
  let surfaceAreaMm2 = 0;
  weightedCentroid.set(0, 0, 0);

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    meshCount += 1;
    const measured = measureGeometry(child);
    triangleCount += measured.triangles;
    signedVolume += measured.volume;
    surfaceAreaMm2 += measured.surfaceArea;
    weightedCentroid.add(measured.weightedCentroid);
  });

  const volumeMm3 = Math.abs(signedVolume);
  const centerOfMassMm =
    Number.isFinite(signedVolume) && Math.abs(signedVolume) > 0
      ? {
          x: weightedCentroid.x / signedVolume,
          y: weightedCentroid.y / signedVolume,
          z: weightedCentroid.z / signedVolume,
        }
      : null;

  return {
    dimensionsMm: {
      x: size.x,
      y: size.y,
      z: size.z,
    },
    centerOfMassMm,
    volumeMm3: Number.isFinite(volumeMm3) && volumeMm3 > 0 ? volumeMm3 : null,
    volumeCm3: Number.isFinite(volumeMm3) && volumeMm3 > 0 ? volumeMm3 / 1000 : null,
    surfaceAreaMm2: Number.isFinite(surfaceAreaMm2) && surfaceAreaMm2 > 0 ? surfaceAreaMm2 : null,
    triangleCount: Math.round(triangleCount),
    meshCount,
    boundingBoxVolumeMm3: size.x * size.y * size.z,
  };
}
