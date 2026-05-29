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

type OcctResult = {
  success: boolean;
  meshes?: OcctMesh[];
};

type OcctApi = {
  ReadFile: (format: string, buffer: Uint8Array, params: Record<string, unknown> | null) => OcctResult;
};

type OcctImportFactory = (options?: Record<string, unknown>) => Promise<OcctApi>;

let occtPromise: Promise<OcctApi> | null = null;

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

function buildOcctObject(meshes: OcctMesh[]) {
  const group = new THREE.Group();
  for (const mesh of meshes) {
    const positions = mesh.attributes?.position?.array;
    const indices = mesh.index?.array;
    if (!positions || !indices) continue;

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

async function parseCadBuffer(buffer: ArrayBuffer, format: CadModelFormat) {
  const occt = await getOcct();
  const result = occt.ReadFile(normalizeCadFormat(format), new Uint8Array(buffer), {
    linearUnit: 'millimeter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.001,
    angularDeflection: 0.5,
  });
  if (!result.success || !result.meshes?.length) throw new Error('CAD 文件解析失败，请检查文件是否完整。');
  return buildOcctObject(result.meshes);
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
