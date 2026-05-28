import * as THREE from 'three';

export function createModelMaterial(color: string) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.58,
    metalness: 0.06,
  });
}

export function applyModelMaterial(object: THREE.Object3D, color: string) {
  const material = createModelMaterial(color);
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

export function fitModelToOrigin(object: THREE.Object3D, targetSize = 130) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxAxis = Math.max(size.x, size.y, size.z, 1);
  object.scale.multiplyScalar(targetSize / maxAxis);
  object.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(object);
  finalBox.getCenter(center);
  object.position.sub(center);
  object.updateMatrixWorld(true);
}

export function disposeObjectResources(object: THREE.Object3D) {
  object.traverse((entry) => {
    if (entry instanceof THREE.Mesh) {
      entry.geometry.dispose();
      const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
      materials.forEach((material) => material.dispose());
    }
  });
}
