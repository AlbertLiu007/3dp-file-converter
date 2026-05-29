'use client';

import { Grid2X2, RotateCcw, ScanSearch, SunMedium } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { applyModelMaterial, disposeObjectResources, fitModelToOrigin } from '@/lib/model/model-scene';

function countTriangles(object: THREE.Object3D) {
  let triangles = 0;
  object.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh)) return;
    const geometry = entry.geometry;
    const position = geometry.getAttribute('position');
    if (!position) return;
    triangles += geometry.index ? geometry.index.count / 3 : position.count / 3;
  });
  return triangles;
}

function createEdgeOverlay(object: THREE.Object3D, color: string) {
  const group = new THREE.Group();
  object.updateMatrixWorld(true);

  object.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh)) return;
    const geometry = new THREE.EdgesGeometry(entry.geometry, 24);
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color,
        depthTest: true,
        opacity: 0.62,
        transparent: true,
      }),
    );
    entry.updateMatrixWorld(true);
    lines.matrix.copy(entry.matrixWorld);
    lines.matrixAutoUpdate = false;
    group.add(lines);
  });

  return group;
}

function disposeViewerObject(object: THREE.Object3D) {
  disposeObjectResources(object);
  object.traverse((entry) => {
    if (entry instanceof THREE.LineSegments) {
      entry.geometry.dispose();
      const material = entry.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
  });
}

export function ThreeModelViewerClient({ object, color = '#d9eef5', labels }: { object: THREE.Object3D | null; color?: string; labels: Dictionary }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const mountedObjectRef = useRef<THREE.Object3D | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const lightModeRef = useRef<'fixed' | 'camera'>('fixed');
  const showGridRef = useRef(true);
  const [mode, setMode] = useState<'rotate' | 'pan'>('rotate');
  const [lightMode, setLightMode] = useState<'fixed' | 'camera'>('fixed');
  const [showGrid, setShowGrid] = useState(true);

  function resetView() {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    controls.reset();
    camera.updateProjectionMatrix();
  }

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.mouseButtons = {
      LEFT: mode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: mode === 'pan' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
    };
  }, [mode]);

  useEffect(() => {
    lightModeRef.current = lightMode;
  }, [lightMode]);

  useEffect(() => {
    showGridRef.current = showGrid;
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = '';
    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 5000);
    camera.position.set(140, 120, 185);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new TrackballControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.rotateSpeed = 2.2;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.35;
    controls.dynamicDampingFactor = 0.08;
    controls.minDistance = 35;
    controls.maxDistance = 900;

    scene.add(new THREE.AmbientLight(0xffffff, 0.78));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.85);
    keyLight.position.set(-120, 180, 125);
    scene.add(keyLight);
    keyLightRef.current = keyLight;
    const fillLight = new THREE.DirectionalLight(0xdff8ff, 0.62);
    fillLight.position.set(130, 80, -150);
    scene.add(fillLight);
    fillLightRef.current = fillLight;
    scene.add(new THREE.HemisphereLight(0xf5fbff, 0x334155, 0.82));

    const grid = new THREE.GridHelper(180, 12, 0x5f7384, 0xc4d0dc);
    grid.position.y = -68;
    grid.visible = showGridRef.current;
    grid.traverse((entry) => {
      if (entry instanceof THREE.LineSegments) {
        entry.material.opacity = 0.72;
        entry.material.transparent = true;
      }
    });
    scene.add(grid);
    gridRef.current = grid;

    let frameId = 0;

    if (object) {
      const viewerGroup = new THREE.Group();
      const mountedObject = object.clone(true);
      applyModelMaterial(mountedObject, color === '#d9eef5' ? '#d7f3f7' : color);
      fitModelToOrigin(mountedObject, 135);
      viewerGroup.add(mountedObject);
      if (countTriangles(mountedObject) <= 1_200_000) {
        viewerGroup.add(createEdgeOverlay(mountedObject, '#31515a'));
      }
      scene.add(viewerGroup);
      mountedObjectRef.current = viewerGroup;
    }

    function animate() {
      frameId = requestAnimationFrame(animate);
      controls.update();
      if (lightModeRef.current === 'camera') {
        keyLight.position.copy(camera.position);
        fillLight.position.copy(camera.position).multiplyScalar(-0.35);
      } else {
        keyLight.position.set(-120, 180, 125);
        fillLight.position.set(130, 80, -150);
      }
      renderer.render(scene, camera);
    }
    animate();

    function handleResize() {
      const mountedHost = hostRef.current;
      if (!mountedHost) return;
      camera.aspect = mountedHost.clientWidth / Math.max(1, mountedHost.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(mountedHost.clientWidth, mountedHost.clientHeight);
      controls.handleResize();
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      controls.dispose();
      renderer.dispose();
      if (mountedObjectRef.current) disposeViewerObject(mountedObjectRef.current);
      mountedObjectRef.current = null;
      keyLightRef.current = null;
      fillLightRef.current = null;
      gridRef.current = null;
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
          title={lightMode === 'fixed' ? labels.lightFixed : labels.lightFollow}
          onClick={() => setLightMode((current) => (current === 'fixed' ? 'camera' : 'fixed'))}
          className={`inline-flex h-8 items-center gap-1 rounded-md border border-white/40 px-2 text-xs font-semibold shadow-sm ${
            lightMode === 'camera' ? 'bg-[#0b4f9c] text-white' : 'bg-white/85 text-slate-800'
          }`}
        >
          <SunMedium className="h-3.5 w-3.5" />
          {lightMode === 'fixed' ? labels.lightFixedShort : labels.lightFollowShort}
        </button>
        <button
          type="button"
          title={showGrid ? labels.hideGrid : labels.showGrid}
          onClick={() => setShowGrid((current) => !current)}
          className={`inline-flex h-8 items-center gap-1 rounded-md border border-white/40 px-2 text-xs font-semibold shadow-sm ${
            showGrid ? 'bg-white/85 text-slate-800' : 'bg-[#0b4f9c] text-white'
          }`}
        >
          <Grid2X2 className="h-3.5 w-3.5" />
          {showGrid ? labels.gridOn : labels.gridOff}
        </button>
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
