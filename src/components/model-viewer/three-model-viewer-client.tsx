'use client';

import { RotateCcw, ScanSearch } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { applyModelMaterial, disposeObjectResources, fitModelToOrigin } from '@/lib/model/model-scene';

export function ThreeModelViewerClient({ object, color = '#d9eef5', labels }: { object: THREE.Object3D | null; color?: string; labels: Dictionary }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const mountedObjectRef = useRef<THREE.Object3D | null>(null);
  const [mode, setMode] = useState<'rotate' | 'pan'>('rotate');

  function resetView() {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    controls.target.set(0, 0, 0);
    camera.position.set(140, 120, 185);
    controls.update();
  }

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.mouseButtons = {
      LEFT: mode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: mode === 'pan' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
    };
    controls.touches = {
      ONE: mode === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
  }, [mode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = '';
    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 5000);
    camera.position.set(140, 120, 185);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 35;
    controls.maxDistance = 900;

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(80, 140, 120);
    scene.add(keyLight);
    scene.add(new THREE.HemisphereLight(0xe5eefc, 0x1f2937, 1.55));

    const grid = new THREE.GridHelper(180, 12, 0x94a3b8, 0xd5dce6);
    grid.position.y = -68;
    scene.add(grid);

    let frameId = 0;

    if (object) {
      const mountedObject = object.clone(true);
      applyModelMaterial(mountedObject, color);
      fitModelToOrigin(mountedObject, 135);
      scene.add(mountedObject);
      mountedObjectRef.current = mountedObject;
    }

    function animate() {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    function handleResize() {
      const mountedHost = hostRef.current;
      if (!mountedHost) return;
      camera.aspect = mountedHost.clientWidth / Math.max(1, mountedHost.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(mountedHost.clientWidth, mountedHost.clientHeight);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      controls.dispose();
      renderer.dispose();
      if (mountedObjectRef.current) disposeObjectResources(mountedObjectRef.current);
      mountedObjectRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      host.innerHTML = '';
    };
  }, [object, color]);

  return (
    <div className="absolute inset-0">
      <div ref={hostRef} className="h-full w-full" />
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        <button
          type="button"
          title={labels.rotatePan}
          onClick={() => setMode((current) => (current === 'rotate' ? 'pan' : 'rotate'))}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-white/40 bg-white/85 px-2 text-xs font-semibold text-slate-800 shadow-sm"
        >
          <ScanSearch className="h-3.5 w-3.5" />
          {mode === 'rotate' ? labels.rotate : labels.pan}
        </button>
        <button
          type="button"
          title={labels.resetView}
          onClick={resetView}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/40 bg-white/85 text-slate-800 shadow-sm"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
