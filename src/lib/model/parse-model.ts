import * as THREE from 'three';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { createModelMaterial } from './model-scene';
import { getModelFormat, isCadModelFormat, normalizeCadFormat, type CadModelFormat, type ModelFormat, type ParsedModel } from './model-types';

type OcctMesh = {
  name?: string;
  color?: [number, number, number];
  attributes?: {
    position?: { array: number[] };
    normal?: { array: number[] };
  };
  index?: { array: number[] };
};

type ValidOcctMesh = OcctMesh & {
  attributes: {
    position: { array: number[] };
    normal?: { array: number[] };
  };
  index: { array: number[] };
};

type OcctResult = {
  success: boolean;
  meshes?: OcctMesh[];
};

type OcctApi = {
  ReadFile: (format: string, buffer: Uint8Array, params: Record<string, unknown> | null) => OcctResult;
};

type OcctImportFactory = (options?: Record<string, unknown>) => Promise<OcctApi>;

let occtPromise: Promise<OcctApi> | null = null;

const cadTriangulationParams = [
  {
    linearUnit: 'millimeter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.005,
    angularDeflection: 0.8,
  },
  {
    linearUnit: 'millimeter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.001,
    angularDeflection: 0.5,
  },
  {
    linearUnit: 'millimeter',
    linearDeflectionType: 'absolute_value',
    linearDeflection: 0.5,
    angularDeflection: 0.6,
  },
];

async function getOcct() {
  if (!occtPromise) {
    occtPromise = import('occt-import-js').then((module) => {
      const factory = (module.default ?? module) as OcctImportFactory;
      return factory({
        locateFile: (path: string) => `/converter/vendor/${path}`,
      });
    });
  }
  return occtPromise;
}

function buildOcctObject(meshes: ValidOcctMesh[]) {
  const group = new THREE.Group();
  for (const mesh of meshes) {
    const positions = mesh.attributes.position.array;
    const indices = mesh.index.array;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (mesh.attributes?.normal?.array) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
    } else {
      geometry.computeVertexNormals();
    }
    geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices), 1));

    const color = mesh.color ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]) : new THREE.Color('#d7e7ef');
    const object = new THREE.Mesh(geometry, createModelMaterial(`#${color.getHexString()}`));
    object.name = mesh.name ?? 'cad-mesh';
    group.add(object);
  }
  return group;
}

function isValidOcctMesh(positions: number[] | undefined, indices: number[] | undefined) {
  return Boolean(positions && indices && positions.length >= 9 && indices.length >= 3 && positions.length % 3 === 0 && indices.length % 3 === 0);
}

function getValidOcctMeshes(meshes: OcctMesh[]) {
  return meshes.filter((mesh): mesh is ValidOcctMesh => {
    const positions = mesh.attributes?.position?.array;
    const indices = mesh.index?.array;
    return isValidOcctMesh(positions, indices);
  });
}

function countOcctTriangles(meshes: ValidOcctMesh[]) {
  return meshes.reduce((total, mesh) => total + Math.floor(mesh.index.array.length / 3), 0);
}

async function parseCadBuffer(buffer: ArrayBuffer, format: CadModelFormat) {
  const occt = await getOcct();
  const fileBuffer = new Uint8Array(buffer);
  let lastSuccessfulMeshCount = 0;

  for (const params of cadTriangulationParams) {
    const result = occt.ReadFile(normalizeCadFormat(format), fileBuffer, params);
    if (!result.success || !result.meshes?.length) continue;

    lastSuccessfulMeshCount = Math.max(lastSuccessfulMeshCount, result.meshes.length);
    const validMeshes = getValidOcctMeshes(result.meshes);
    if (countOcctTriangles(validMeshes) > 0) return buildOcctObject(validMeshes);
  }

  if (lastSuccessfulMeshCount > 0) {
    throw new Error('CAD 文件已读取，但未生成有效三角网格。该文件可能是复杂装配、空壳体、外部引用、线框/参考几何，或当前浏览器 CAD 内核暂不支持。');
  }

  throw new Error('CAD 文件解析失败，请检查文件是否完整，或尝试导出为简化后的 STEP/STP 文件。');
}

export async function parseModelBuffer(buffer: ArrayBuffer, format: ModelFormat): Promise<THREE.Object3D> {
  if (format === 'stl') {
    const geometry = new STLLoader().parse(buffer);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, createModelMaterial('#d9eef5'));
  }

  if (format === 'obj') {
    const text = new TextDecoder().decode(buffer);
    return new OBJLoader().parse(text);
  }

  if (format === 'ply') {
    const geometry = new PLYLoader().parse(buffer);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, createModelMaterial('#d9eef5'));
  }

  if (format === 'glb') {
    return new Promise<THREE.Object3D>((resolve, reject) => {
      new GLTFLoader().parse(buffer, '', (gltf) => resolve(gltf.scene), reject);
    });
  }

  if (format === '3mf') {
    return new ThreeMFLoader().parse(buffer);
  }

  if (isCadModelFormat(format)) return parseCadBuffer(buffer, format);

  throw new Error(`不支持的模型格式：${format}`);
}

export async function parseModelFile(file: File): Promise<ParsedModel> {
  const format = getModelFormat(file.name);
  const object = await parseModelBuffer(await file.arrayBuffer(), format);
  return {
    fileName: file.name,
    format,
    object,
  };
}
