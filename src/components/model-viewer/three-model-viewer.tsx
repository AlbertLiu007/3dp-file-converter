'use client';

import dynamic from 'next/dynamic';
import type * as THREE from 'three';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const DynamicThreeModelViewer = dynamic(
  () => import('./three-model-viewer-client').then((module) => module.ThreeModelViewerClient),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0" />,
  },
);

export function ThreeModelViewer(props: { object: THREE.Object3D | null; color?: string; labels: Dictionary }) {
  return <DynamicThreeModelViewer {...props} />;
}
