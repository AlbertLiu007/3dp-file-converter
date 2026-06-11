import * as THREE from 'three';
import { measureModel } from '@/lib/model/model-measure';
import { analyzeModelRisk } from '@/lib/model/model-risk';
import { parseModelBuffer } from '@/lib/model/parse-model';
import { getModelFormat, type ModelMeasurement } from '@/lib/model/model-types';

type SerializedVector = [number, number, number];
type SerializedTriangle = [SerializedVector, SerializedVector, SerializedVector];
type SerializedEdge = [SerializedVector, SerializedVector];

type SerializedRiskAnalysis = Omit<ReturnType<typeof analyzeModelRisk>, 'annotation'> & {
  annotation: {
    overhangTriangles: SerializedTriangle[];
    bottomContactTriangles: SerializedTriangle[];
    boundaryEdges: SerializedEdge[];
    nonManifoldEdges: SerializedEdge[];
  };
};

type SerializedMesh = {
  name: string;
  positions: Float32Array;
  normals: Float32Array | null;
  indices: Uint32Array | null;
  matrix: number[];
};

type ParseRequest = {
  id: string;
  fileName: string;
  buffer: ArrayBuffer;
};

type ParseSuccess = {
  id: string;
  ok: true;
  measurement: ModelMeasurement;
  riskAnalysis: SerializedRiskAnalysis;
  meshes: SerializedMesh[];
};

type ParseFailure = {
  id: string;
  ok: false;
  message: string;
};

type WorkerScope = {
  onmessage: ((event: MessageEvent<ParseRequest>) => void | Promise<void>) | null;
  postMessage: (message: ParseSuccess | ParseFailure, transfer?: Transferable[]) => void;
};

const reusableVector = new THREE.Vector3();
const workerScope = self as unknown as WorkerScope;

function serializeVector(vector: THREE.Vector3): SerializedVector {
  return [vector.x, vector.y, vector.z];
}

function serializeTriangle(triangle: THREE.Vector3[]): SerializedTriangle {
  return [serializeVector(triangle[0]), serializeVector(triangle[1]), serializeVector(triangle[2])];
}

function serializeEdge(edge: [THREE.Vector3, THREE.Vector3]): SerializedEdge {
  return [serializeVector(edge[0]), serializeVector(edge[1])];
}

function copyVectorAttribute(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const values = new Float32Array(attribute.count * 3);
  for (let index = 0; index < attribute.count; index += 1) {
    reusableVector.fromBufferAttribute(attribute, index);
    const offset = index * 3;
    values[offset] = reusableVector.x;
    values[offset + 1] = reusableVector.y;
    values[offset + 2] = reusableVector.z;
  }
  return values;
}

function copyIndexAttribute(attribute: THREE.BufferAttribute | null) {
  if (!attribute) return null;
  const values = new Uint32Array(attribute.count);
  for (let index = 0; index < attribute.count; index += 1) {
    values[index] = attribute.getX(index);
  }
  return values;
}

function serializeRiskAnalysis(riskAnalysis: ReturnType<typeof analyzeModelRisk>): SerializedRiskAnalysis {
  return {
    ...riskAnalysis,
    annotation: {
      overhangTriangles: riskAnalysis.annotation.overhangTriangles.map(serializeTriangle),
      bottomContactTriangles: riskAnalysis.annotation.bottomContactTriangles.map(serializeTriangle),
      boundaryEdges: riskAnalysis.annotation.boundaryEdges.map(serializeEdge),
      nonManifoldEdges: riskAnalysis.annotation.nonManifoldEdges.map(serializeEdge),
    },
  };
}

function serializeObject(object: THREE.Object3D) {
  const meshes: SerializedMesh[] = [];
  object.updateMatrixWorld(true);

  object.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh)) return;
    const position = entry.geometry.getAttribute('position');
    if (!position) return;

    entry.updateMatrixWorld(true);
    const normal = entry.geometry.getAttribute('normal');
    meshes.push({
      name: entry.name,
      positions: copyVectorAttribute(position),
      normals: normal ? copyVectorAttribute(normal) : null,
      indices: copyIndexAttribute(entry.geometry.index),
      matrix: entry.matrixWorld.toArray(),
    });
  });

  return meshes;
}

workerScope.onmessage = async (event: MessageEvent<ParseRequest>) => {
  const { id, fileName, buffer } = event.data;

  try {
    const format = getModelFormat(fileName);
    const object = await parseModelBuffer(buffer, format);
    const measurement = measureModel(object);
    const riskAnalysis = serializeRiskAnalysis(analyzeModelRisk(object));
    const meshes = serializeObject(object);
    const transferList: Transferable[] = [];

    meshes.forEach((mesh) => {
      transferList.push(mesh.positions.buffer as ArrayBuffer);
      if (mesh.normals) transferList.push(mesh.normals.buffer as ArrayBuffer);
      if (mesh.indices) transferList.push(mesh.indices.buffer as ArrayBuffer);
    });

    workerScope.postMessage({ id, ok: true, measurement, riskAnalysis, meshes } satisfies ParseSuccess, transferList);
  } catch (error) {
    workerScope.postMessage({
      id,
      ok: false,
      message: error instanceof Error ? error.message : 'Model parsing failed.',
    } satisfies ParseFailure);
  }
};
