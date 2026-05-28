import * as THREE from 'three';

export type ModelRiskAnalysis = {
  isClosed: boolean | null;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  degenerateTriangleCount: number;
  shellCount: number;
  triangleCountAbnormal: boolean;
  overhangTriangleCount: number;
  overhangRatio: number;
  bottomContactAreaMm2: number;
  selfIntersectionCount: number;
  enclosedCavityCount: number;
  thinWallAreaCount: number;
  smallHoleSlotCount: number;
  slenderFeatureCount: number;
  annotation: ModelRiskAnnotation;
};

export type ModelRiskAnnotation = {
  overhangTriangles: THREE.Vector3[][];
  bottomContactTriangles: THREE.Vector3[][];
  boundaryEdges: [THREE.Vector3, THREE.Vector3][];
  nonManifoldEdges: [THREE.Vector3, THREE.Vector3][];
};

const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const edgeA = new THREE.Vector3();
const edgeB = new THREE.Vector3();
const edgeNormal = new THREE.Vector3();
const triangleSize = new THREE.Vector3();

type TriangleRecord = {
  meshId: number;
  localTriangleIndex: number;
  edges: string[];
  box: THREE.Box3;
  normal: THREE.Vector3;
  area: number;
};

function vertexKey(vertex: THREE.Vector3) {
  return `${vertex.x.toFixed(5)},${vertex.y.toFixed(5)},${vertex.z.toFixed(5)}`;
}

function edgeKey(first: THREE.Vector3, second: THREE.Vector3) {
  const firstKey = vertexKey(first);
  const secondKey = vertexKey(second);
  return firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
}

function parseEdgeKey(key: string): [THREE.Vector3, THREE.Vector3] {
  const [first, second] = key.split('|').map((entry) => entry.split(',').map(Number));
  return [new THREE.Vector3(first[0], first[1], first[2]), new THREE.Vector3(second[0], second[1], second[2])];
}

function pushLimited<T>(target: T[], value: T, limit: number) {
  if (target.length < limit) target.push(value);
}

function triangleArea(first: THREE.Vector3, second: THREE.Vector3, third: THREE.Vector3) {
  return edgeA.copy(second).sub(first).cross(edgeB.copy(third).sub(first)).length() / 2;
}

function triangleNormal(first: THREE.Vector3, second: THREE.Vector3, third: THREE.Vector3) {
  return new THREE.Vector3().copy(second).sub(first).cross(new THREE.Vector3().copy(third).sub(first)).normalize();
}

function readVertex(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number, matrix: THREE.Matrix4, target: THREE.Vector3) {
  return target.fromBufferAttribute(position, index).applyMatrix4(matrix);
}

function hasSharedEdge(first: TriangleRecord, second: TriangleRecord) {
  return first.edges.some((edge) => second.edges.includes(edge));
}

function countPossibleSelfIntersections(triangles: TriangleRecord[]) {
  const maxComparisons = 120000;
  const maxSamples = 900;
  const checkedTriangles = triangles.length > maxSamples ? triangles.filter((_, index) => index % Math.ceil(triangles.length / maxSamples) === 0) : triangles;
  const comparisonStep = Math.max(1, Math.ceil((checkedTriangles.length * checkedTriangles.length) / maxComparisons));
  let count = 0;

  for (let i = 0; i < checkedTriangles.length; i += 1) {
    for (let j = i + 1; j < checkedTriangles.length; j += comparisonStep) {
      if (checkedTriangles[i].meshId === checkedTriangles[j].meshId && Math.abs(checkedTriangles[i].localTriangleIndex - checkedTriangles[j].localTriangleIndex) <= 1) continue;
      if (!checkedTriangles[i].box.intersectsBox(checkedTriangles[j].box)) continue;
      if (hasSharedEdge(checkedTriangles[i], checkedTriangles[j])) continue;
      if (Math.abs(checkedTriangles[i].normal.dot(checkedTriangles[j].normal)) < 0.98) {
        count += 1;
        if (count > 999) return Math.round(count * comparisonStep);
      }
    }
  }

  return Math.round(count * comparisonStep);
}

function countSmallBoundaryLoops(edgeOwners: Map<string, number[]>) {
  let smallEdges = 0;
  edgeOwners.forEach((owners, key) => {
    if (owners.length !== 1) return;
    const [first, second] = key.split('|').map((entry) => entry.split(',').map(Number));
    const length = new THREE.Vector3(first[0], first[1], first[2]).distanceTo(new THREE.Vector3(second[0], second[1], second[2]));
    if (length < 2) smallEdges += 1;
  });
  return Math.round(smallEdges / 3);
}

function countSlenderShells(triangles: TriangleRecord[]) {
  const shellBoxes = new Map<number, THREE.Box3>();
  triangles.forEach((triangle) => {
    const existing = shellBoxes.get(triangle.meshId) ?? new THREE.Box3();
    existing.union(triangle.box);
    shellBoxes.set(triangle.meshId, existing);
  });

  let count = 0;
  shellBoxes.forEach((box) => {
    const size = new THREE.Vector3();
    box.getSize(size);
    const dimensions = [size.x, size.y, size.z].filter((value) => value > 1e-5).sort((first, second) => first - second);
    if (dimensions.length < 3) return;
    if (dimensions[0] < 2 && dimensions[2] / Math.max(dimensions[0], 0.01) > 8) count += 1;
    else if (dimensions[0] < 1 && dimensions[1] / Math.max(dimensions[0], 0.01) > 6) count += 1;
  });
  return count;
}

function countThinTriangleAreas(triangles: TriangleRecord[]) {
  let count = 0;
  triangles.forEach((triangle) => {
    triangle.box.getSize(triangleSize);
    const dimensions = [triangleSize.x, triangleSize.y, triangleSize.z].sort((first, second) => first - second);
    if (dimensions[0] < 0.25 && dimensions[2] > 2 && triangle.area < 8) count += 1;
  });
  return count;
}

class DisjointSet {
  private parents: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    const parent = this.parents[index];
    if (parent === index) return index;
    const root = this.find(parent);
    this.parents[index] = root;
    return root;
  }

  union(first: number, second: number) {
    const firstRoot = this.find(first);
    const secondRoot = this.find(second);
    if (firstRoot !== secondRoot) this.parents[secondRoot] = firstRoot;
  }
}

export function analyzeModelRisk(object: THREE.Object3D): ModelRiskAnalysis {
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const minY = box.min.y;
  const size = new THREE.Vector3();
  box.getSize(size);
  const bottomTolerance = Math.max(size.y * 0.002, 0.02);

  const edgeOwners = new Map<string, number[]>();
  const triangles: TriangleRecord[] = [];
  const overhangTriangles: THREE.Vector3[][] = [];
  const bottomContactTriangles: THREE.Vector3[][] = [];
  let meshId = 0;
  let degenerateTriangleCount = 0;
  let overhangTriangleCount = 0;
  let bottomContactAreaMm2 = 0;
  let totalTriangleCount = 0;

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const currentMeshId = meshId;
    meshId += 1;

    const position = child.geometry.getAttribute('position');
    if (!position) return;
    const index = child.geometry.index;
    const triangleTotal = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3);

    for (let localTriangleIndex = 0; localTriangleIndex < triangleTotal; localTriangleIndex += 1) {
      if (index) {
        readVertex(position, index.getX(localTriangleIndex * 3), child.matrixWorld, va);
        readVertex(position, index.getX(localTriangleIndex * 3 + 1), child.matrixWorld, vb);
        readVertex(position, index.getX(localTriangleIndex * 3 + 2), child.matrixWorld, vc);
      } else {
        readVertex(position, localTriangleIndex * 3, child.matrixWorld, va);
        readVertex(position, localTriangleIndex * 3 + 1, child.matrixWorld, vb);
        readVertex(position, localTriangleIndex * 3 + 2, child.matrixWorld, vc);
      }

      const area = triangleArea(va, vb, vc);
      const globalTriangleIndex = triangles.length;
      totalTriangleCount += 1;

      if (area <= 1e-8) {
        degenerateTriangleCount += 1;
        continue;
      }

      edgeNormal.copy(edgeA.copy(vb).sub(va)).cross(edgeB.copy(vc).sub(va)).normalize();
      if (edgeNormal.y < -Math.cos(THREE.MathUtils.degToRad(45))) {
        overhangTriangleCount += 1;
        pushLimited(overhangTriangles, [va.clone(), vb.clone(), vc.clone()], 240);
      }

      if (Math.abs(va.y - minY) <= bottomTolerance && Math.abs(vb.y - minY) <= bottomTolerance && Math.abs(vc.y - minY) <= bottomTolerance) {
        bottomContactAreaMm2 += area;
        pushLimited(bottomContactTriangles, [va.clone(), vb.clone(), vc.clone()], 180);
      }

      const edges = [edgeKey(va, vb), edgeKey(vb, vc), edgeKey(vc, va)];
      const first = va.clone();
      const second = vb.clone();
      const third = vc.clone();
      triangles.push({
        meshId: currentMeshId,
        localTriangleIndex,
        edges,
        box: new THREE.Box3().setFromPoints([first, second, third]).expandByScalar(1e-7),
        normal: triangleNormal(first, second, third),
        area,
      });
      edges.forEach((key) => {
        const owners = edgeOwners.get(key) ?? [];
        owners.push(globalTriangleIndex);
        edgeOwners.set(key, owners);
      });
    }
  });

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  const boundaryEdges: [THREE.Vector3, THREE.Vector3][] = [];
  const nonManifoldEdges: [THREE.Vector3, THREE.Vector3][] = [];
  const disjointSet = new DisjointSet(Math.max(triangles.length, 1));

  edgeOwners.forEach((owners, key) => {
    if (owners.length === 1) {
      boundaryEdgeCount += 1;
      pushLimited(boundaryEdges, parseEdgeKey(key), 260);
    }
    if (owners.length > 2) {
      nonManifoldEdgeCount += 1;
      pushLimited(nonManifoldEdges, parseEdgeKey(key), 260);
    }
    for (let index = 1; index < owners.length; index += 1) {
      disjointSet.union(owners[0], owners[index]);
    }
  });

  const shellIds = new Set<string>();
  triangles.forEach((_, index) => {
    shellIds.add(String(disjointSet.find(index)));
  });

  return {
    isClosed: triangles.length > 0 ? boundaryEdgeCount === 0 && nonManifoldEdgeCount === 0 : null,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    degenerateTriangleCount,
    shellCount: triangles.length > 0 ? shellIds.size : 0,
    triangleCountAbnormal: totalTriangleCount > 500000 || totalTriangleCount < 20,
    overhangTriangleCount,
    overhangRatio: totalTriangleCount > 0 ? overhangTriangleCount / totalTriangleCount : 0,
    bottomContactAreaMm2,
    selfIntersectionCount: countPossibleSelfIntersections(triangles),
    enclosedCavityCount: boundaryEdgeCount === 0 && nonManifoldEdgeCount === 0 && shellIds.size > 1 ? shellIds.size - 1 : 0,
    thinWallAreaCount: countThinTriangleAreas(triangles),
    smallHoleSlotCount: countSmallBoundaryLoops(edgeOwners),
    slenderFeatureCount: countSlenderShells(triangles),
    annotation: {
      overhangTriangles,
      bottomContactTriangles,
      boundaryEdges,
      nonManifoldEdges,
    },
  };
}
