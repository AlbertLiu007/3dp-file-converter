'use client';

import { CheckCircle2, Download, FileArchive, FileText, FileUp, Loader2, Printer, ShieldCheck } from 'lucide-react';
import { ToolHeader } from '@unionam/shared-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ThreeModelViewer } from '@/components/model-viewer/three-model-viewer';
import { convertModel } from '@/lib/converter/convert-model';
import { useLanguage } from '@/lib/i18n/use-language';
import { measureModel } from '@/lib/model/model-measure';
import { analyzeModelRisk, type ModelRiskAnalysis } from '@/lib/model/model-risk';
import { applyModelMaterial, disposeObjectResources, fitModelToOrigin } from '@/lib/model/model-scene';
import { parseModelBuffer } from '@/lib/model/parse-model';
import { getModelFormat, isCadModelFormat, meshModelFormats, type MeshModelFormat, type ModelFormat, type ModelMeasurement } from '@/lib/model/model-types';

type StatusKey = 'initial' | 'importing' | 'parsing' | 'measuring' | 'completed' | 'converting' | 'readyToDownload' | 'parseFailed' | 'convertFailed';

const MAX_MODEL_FILE_SIZE_BYTES = 300 * 1024 * 1024;

function formatNumber(value: number | null | undefined, language: 'zh' | 'en', fallback: string, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return value.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatFileSize(bytes: number | null) {
  if (!bytes || !Number.isFinite(bytes)) return '--';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const maxModelFileSizeLabel = formatFileSize(MAX_MODEL_FILE_SIZE_BYTES);

function readFileWithProgress(file: File, onProgress: (percent: number) => void) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.min(60, Math.max(1, Math.round((event.loaded / event.total) * 60))));
    };
    reader.onload = () => {
      onProgress(60);
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('File reading failed.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('File reading failed.'));
    reader.readAsArrayBuffer(file);
  });
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <span className="min-w-0 text-right text-sm font-black text-slate-900">{value}</span>
    </div>
  );
}

function ReportMetric({ label, value, status }: { label: string; value: string; status?: string }) {
  return (
    <div className="grid min-h-16 gap-1 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</span>
        {status ? <span className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-black text-slate-500">{status}</span> : null}
      </div>
      <div className="text-sm font-black leading-5 text-slate-950">{value}</div>
    </div>
  );
}

function RiskRow({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'good' | 'warn' }) {
  const toneClass = tone === 'good' ? 'bg-emerald-50 text-emerald-700' : tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-white text-slate-700';
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-[11px] font-bold text-slate-500">{label}</span>
      <span className={`inline-flex min-h-5 min-w-12 items-center justify-center rounded px-2 py-0.5 text-center text-[11px] font-black leading-4 ${toneClass}`}>{value}</span>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      <span>{label}</span>
    </div>
  );
}

type EngineeringViewMode = 'front' | 'top' | 'side' | 'iso';

function createTriangleOverlay(triangles: THREE.Vector3[][], color: string, opacity: number) {
  if (triangles.length === 0) return null;
  const positions = new Float32Array(triangles.length * 9);
  triangles.forEach((triangle, triangleIndex) => {
    triangle.forEach((vertex, vertexIndex) => {
      const offset = triangleIndex * 9 + vertexIndex * 3;
      positions[offset] = vertex.x;
      positions[offset + 1] = vertex.y;
      positions[offset + 2] = vertex.z;
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      depthWrite: false,
      opacity,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
}

function createEdgeOverlay(edges: [THREE.Vector3, THREE.Vector3][], color: string) {
  if (edges.length === 0) return null;
  const positions = new Float32Array(edges.length * 6);
  edges.forEach(([first, second], edgeIndex) => {
    const offset = edgeIndex * 6;
    positions[offset] = first.x;
    positions[offset + 1] = first.y;
    positions[offset + 2] = first.z;
    positions[offset + 3] = second.x;
    positions[offset + 4] = second.y;
    positions[offset + 5] = second.z;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, depthTest: false, linewidth: 2 }));
}

function ModelEngineeringView({
  label,
  mode,
  object,
  horizontalLabel,
  verticalLabel,
  annotation,
}: {
  label: string;
  mode: EngineeringViewMode;
  object: THREE.Object3D | null;
  horizontalLabel: string;
  verticalLabel: string;
  annotation: ModelRiskAnalysis['annotation'] | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !object) return;

    host.innerHTML = '';
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-90, 90, 68, -68, 0.1, 1000);

    if (mode === 'front') camera.position.set(0, 0, 260);
    if (mode === 'top') camera.position.set(0, 260, 0);
    if (mode === 'side') camera.position.set(260, 0, 0);
    if (mode === 'iso') camera.position.set(190, 150, 190);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(90, 130, 120);
    scene.add(keyLight);

    const mountedObject = object.clone(true);
    applyModelMaterial(mountedObject, '#cdeef6');
    fitModelToOrigin(mountedObject, 112);
    scene.add(mountedObject);

    const overlayGroup = new THREE.Group();
    if (annotation) {
      const sourceBox = new THREE.Box3().setFromObject(object);
      const sourceSize = new THREE.Vector3();
      const sourceCenter = new THREE.Vector3();
      sourceBox.getSize(sourceSize);
      sourceBox.getCenter(sourceCenter);
      const overlayScale = 112 / Math.max(sourceSize.x, sourceSize.y, sourceSize.z, 1);
      overlayGroup.scale.setScalar(overlayScale);
      overlayGroup.position.copy(sourceCenter).multiplyScalar(-overlayScale);

      const overhangOverlay = createTriangleOverlay(annotation.overhangTriangles, '#f59e0b', 0.48);
      const bottomOverlay = createTriangleOverlay(annotation.bottomContactTriangles, '#06b6d4', 0.5);
      const boundaryOverlay = createEdgeOverlay(annotation.boundaryEdges, '#ef4444');
      const nonManifoldOverlay = createEdgeOverlay(annotation.nonManifoldEdges, '#7c3aed');
      if (overhangOverlay) overlayGroup.add(overhangOverlay);
      if (bottomOverlay) overlayGroup.add(bottomOverlay);
      if (boundaryOverlay) overlayGroup.add(boundaryOverlay);
      if (nonManifoldOverlay) overlayGroup.add(nonManifoldOverlay);
      scene.add(overlayGroup);
    }

    function resizeAndRender() {
      const mountedHost = hostRef.current;
      if (!mountedHost) return;
      const aspect = mountedHost.clientWidth / Math.max(1, mountedHost.clientHeight);
      const viewHeight = 136;
      const viewWidth = viewHeight * aspect;
      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(mountedHost.clientWidth, mountedHost.clientHeight);
      renderer.render(scene, camera);
    }

    resizeAndRender();
    window.addEventListener('resize', resizeAndRender);

    return () => {
      window.removeEventListener('resize', resizeAndRender);
      renderer.dispose();
      disposeObjectResources(mountedObject);
      overlayGroup.traverse((entry) => {
        if (entry instanceof THREE.Mesh || entry instanceof THREE.LineSegments) {
          entry.geometry.dispose();
          const material = entry.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }
      });
      host.innerHTML = '';
    };
  }, [mode, object, annotation]);

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-slate-200 bg-white">
      <div ref={hostRef} className="absolute inset-7 bottom-10" />
      {!object ? <div className="absolute inset-0 grid place-items-center text-xs font-black text-slate-400">{label}</div> : null}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 320 240" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id={`${mode}-arrow`} markerHeight="6" markerWidth="6" orient="auto" refX="3" refY="3">
            <path d="M0,0 L6,3 L0,6 Z" fill="#0f766e" />
          </marker>
        </defs>
        <line x1="58" y1="207" x2="262" y2="207" stroke="#0f766e" strokeWidth="1.5" markerStart={`url(#${mode}-arrow)`} markerEnd={`url(#${mode}-arrow)`} />
        <line x1="58" y1="190" x2="58" y2="214" stroke="#0f766e" strokeWidth="1" />
        <line x1="262" y1="190" x2="262" y2="214" stroke="#0f766e" strokeWidth="1" />
        <text x="160" y="224" fill="#0f172a" fontSize="12" fontWeight="800" textAnchor="middle">
          {horizontalLabel}
        </text>

        <line x1="25" y1="45" x2="25" y2="170" stroke="#0f766e" strokeWidth="1.5" markerStart={`url(#${mode}-arrow)`} markerEnd={`url(#${mode}-arrow)`} />
        <line x1="18" y1="45" x2="45" y2="45" stroke="#0f766e" strokeWidth="1" />
        <line x1="18" y1="170" x2="45" y2="170" stroke="#0f766e" strokeWidth="1" />
        <text x="17" y="108" fill="#0f172a" fontSize="12" fontWeight="800" textAnchor="middle" transform="rotate(-90 17 108)">
          {verticalLabel}
        </text>
      </svg>
      <div className="absolute left-3 top-2 inline-flex min-h-7 items-center justify-center rounded border border-slate-100 bg-white px-2 py-1 text-center text-xs font-black leading-4 text-slate-700 shadow-sm">{label}</div>
      <div className="absolute bottom-2 right-3 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
        {mode}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { language, setLanguage, t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const downloadUrlRef = useRef<string | null>(null);
  const [currentFile, setCurrentFile] = useState<{ name: string; size: number; format: ModelFormat } | null>(null);
  const [modelObject, setModelObject] = useState<THREE.Object3D | null>(null);
  const [measurement, setMeasurement] = useState<ModelMeasurement | null>(null);
  const [riskAnalysis, setRiskAnalysis] = useState<ModelRiskAnalysis | null>(null);
  const [targetFormat, setTargetFormat] = useState<MeshModelFormat>('stl');
  const [statusKey, setStatusKey] = useState<StatusKey>('initial');
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [downloadFile, setDownloadFile] = useState<{ name: string; url: string } | null>(null);

  const targetOptions = useMemo(() => {
    if (!currentFile || isCadModelFormat(currentFile.format)) return meshModelFormats;
    return meshModelFormats.filter((format) => format !== currentFile.format);
  }, [currentFile]);

  const status = useMemo(() => {
    if (statusKey === 'importing') return t.importing;
    if (statusKey === 'parsing') return t.parsing;
    if (statusKey === 'measuring') return t.measuring;
    if (statusKey === 'completed') return t.completed;
    if (statusKey === 'converting') return t.converting;
    if (statusKey === 'readyToDownload') return t.readyToDownload;
    if (statusKey === 'parseFailed') return t.parseFailed;
    if (statusKey === 'convertFailed') return t.convertFailed;
    return t.initialStatus;
  }, [progressPercent, statusKey, t]);

  async function handleFile(file: File) {
    setError(null);
    setDownloadFile(null);
    if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    downloadUrlRef.current = null;
    if (file.size > MAX_MODEL_FILE_SIZE_BYTES) {
      setCurrentFile(null);
      setModelObject(null);
      setMeasurement(null);
      setRiskAnalysis(null);
      setProgressPercent(null);
      setStatusKey('parseFailed');
      setError(t.fileTooLarge(maxModelFileSizeLabel));
      return;
    }
    setProgressPercent(1);
    setStatusKey('importing');
    setModelObject(null);
    setMeasurement(null);
    setRiskAnalysis(null);
    try {
      const format = getModelFormat(file.name);
      const nextTarget = meshModelFormats.find((entry) => entry !== format) ?? 'stl';
      setTargetFormat(nextTarget);
      setCurrentFile({ name: file.name, size: file.size, format });
      const buffer = await readFileWithProgress(file, (percent) => {
        setProgressPercent(percent);
        setStatusKey('importing');
      });
      setProgressPercent(70);
      setStatusKey('parsing');
      await waitForPaint();
      const object = await parseModelBuffer(buffer, format);
      setProgressPercent(90);
      setStatusKey('measuring');
      await waitForPaint();
      const measured = measureModel(object);
      const risks = analyzeModelRisk(object);
      setModelObject(object);
      setMeasurement(measured);
      setRiskAnalysis(risks);
      setProgressPercent(100);
      setStatusKey('completed');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.modelParseFailed);
      setProgressPercent(null);
      setStatusKey('parseFailed');
      setModelObject(null);
      setMeasurement(null);
      setRiskAnalysis(null);
    }
  }

  async function handleConvert() {
    if (!currentFile || !modelObject) return;
    if (!isCadModelFormat(currentFile.format) && currentFile.format === targetFormat) {
      setError(t.unsupportedSameFormat);
      return;
    }

    setError(null);
    setIsConverting(true);
    setStatusKey('converting');
    try {
      const result = await convertModel({
        fileName: currentFile.name,
        sourceFormat: currentFile.format,
        targetFormat,
        object: modelObject,
      });
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      const url = URL.createObjectURL(result.blob);
      downloadUrlRef.current = url;
      setDownloadFile({ name: result.fileName, url });
      setStatusKey('readyToDownload');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.convertFailed);
      setStatusKey('convertFailed');
    } finally {
      setIsConverting(false);
    }
  }

  async function handleExportPdf() {
    if (!measurement || isExportingPdf) return;
    const reportElement = document.getElementById('technical-report');
    if (!reportElement) return;

    setIsExportingPdf(true);
    const previousBodyBackground = document.body.style.background;
    const previousReportBackground = reportElement.style.background;
    const previousReportShadow = reportElement.style.boxShadow;
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      document.body.style.background = '#ffffff';
      reportElement.style.background = '#ffffff';
      reportElement.style.boxShadow = 'none';
      window.dispatchEvent(new Event('resize'));
      await waitForPaint();
      await waitForPaint();
      const canvas = await html2canvas(reportElement, {
        backgroundColor: '#ffffff',
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
        logging: false,
        windowWidth: reportElement.scrollWidth,
        windowHeight: reportElement.scrollHeight,
      });
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      const pageWidth = 297;
      const pageHeight = 210;
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      const imageRatio = canvas.width / canvas.height;
      const pageRatio = pageWidth / pageHeight;
      const imageWidth = imageRatio > pageRatio ? pageWidth : pageHeight * imageRatio;
      const imageHeight = imageRatio > pageRatio ? pageWidth / imageRatio : pageHeight;
      const offsetX = (pageWidth - imageWidth) / 2;
      const offsetY = (pageHeight - imageHeight) / 2;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', offsetX, offsetY, imageWidth, imageHeight);
      const sourceName = currentFile?.name?.replace(/\.[^.]+$/, '') || 'model';
      const safeName = `${sourceName}&${t.reportDrawingTitle}`.replace(/[\\/:*?"<>|]/g, '_');
      pdf.save(`${safeName}.pdf`);
    } finally {
      document.body.style.background = previousBodyBackground;
      reportElement.style.background = previousReportBackground;
      reportElement.style.boxShadow = previousReportShadow;
      setIsExportingPdf(false);
    }
  }

  const formattedDimensions = measurement
    ? `${formatNumber(measurement.dimensionsMm.x, language, t.fallback)} × ${formatNumber(measurement.dimensionsMm.y, language, t.fallback)} × ${formatNumber(
        measurement.dimensionsMm.z,
        language,
        t.fallback,
      )} mm`
    : '--';
  const formattedCenterOfMass = measurement?.centerOfMassMm
    ? `${formatNumber(measurement.centerOfMassMm.x, language, t.fallback, 2)}, ${formatNumber(measurement.centerOfMassMm.y, language, t.fallback, 2)}, ${formatNumber(
        measurement.centerOfMassMm.z,
        language,
        t.fallback,
        2,
      )} mm`
    : '--';
  const lengthDimension = measurement ? `${t.lengthLabel} ${formatNumber(measurement.dimensionsMm.x, language, t.fallback)} mm` : `${t.lengthLabel} --`;
  const widthDimension = measurement ? `${t.widthLabel} ${formatNumber(measurement.dimensionsMm.z, language, t.fallback)} mm` : `${t.widthLabel} --`;
  const heightDimension = measurement ? `${t.heightLabel} ${formatNumber(measurement.dimensionsMm.y, language, t.fallback)} mm` : `${t.heightLabel} --`;
  const depthDimension = measurement ? `${t.depthLabel} ${formatNumber(measurement.dimensionsMm.z, language, t.fallback)} mm` : `${t.depthLabel} --`;
  const shellCount = riskAnalysis ? formatNumber(riskAnalysis.shellCount, language, t.fallback, 0) : '--';
  const overhangValue = riskAnalysis ? `${formatNumber(riskAnalysis.overhangTriangleCount, language, t.fallback, 0)} / ${formatNumber(riskAnalysis.overhangRatio * 100, language, t.fallback, 1)}%` : '--';
  const bottomContactValue = riskAnalysis ? `${formatNumber(riskAnalysis.bottomContactAreaMm2, language, t.fallback, 0)} mm²` : '--';
  const detectedSelfIntersections = riskAnalysis ? formatNumber(riskAnalysis.selfIntersectionCount, language, t.fallback, 0) : '--';
  const foundNonManifoldEdges = riskAnalysis ? formatNumber(riskAnalysis.nonManifoldEdgeCount, language, t.fallback, 0) : '--';
  const foundDegenerateTriangles = riskAnalysis ? formatNumber(riskAnalysis.degenerateTriangleCount, language, t.fallback, 0) : '--';
  const suspectedThinWalls = riskAnalysis ? formatNumber(riskAnalysis.thinWallAreaCount, language, t.fallback, 0) : '--';
  const suspectedSmallHoleSlots = riskAnalysis ? formatNumber(riskAnalysis.smallHoleSlotCount, language, t.fallback, 0) : '--';
  const suspectedSlenderFeatures = riskAnalysis ? formatNumber(riskAnalysis.slenderFeatureCount, language, t.fallback, 0) : '--';
  const possibleEnclosedCavities = riskAnalysis ? formatNumber(riskAnalysis.enclosedCavityCount, language, t.fallback, 0) : '--';
  const hasThinWallRisk = !!riskAnalysis && riskAnalysis.thinWallAreaCount > 0;
  const hasOverhangRisk = !!riskAnalysis && riskAnalysis.overhangRatio > 0.15;
  const hasSmallFeatureRisk = !!riskAnalysis && (riskAnalysis.smallHoleSlotCount > 0 || riskAnalysis.slenderFeatureCount > 0);
  const hasShellRisk = !!riskAnalysis && riskAnalysis.shellCount > 1;
  const isProcessingModel = progressPercent !== null && !error && (statusKey === 'importing' || statusKey === 'parsing' || statusKey === 'measuring');
  const annotation = riskAnalysis?.annotation ?? null;
  const hasOverhangAnnotation = !!annotation && annotation.overhangTriangles.length > 0;
  const hasBottomContactAnnotation = !!annotation && annotation.bottomContactTriangles.length > 0;
  const hasBoundaryAnnotation = !!annotation && annotation.boundaryEdges.length > 0;
  const hasNonManifoldAnnotation = !!annotation && annotation.nonManifoldEdges.length > 0;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="print:hidden">
        <ToolHeader language={language} labels={t} logoSrc="/converter/brand/unionam-logo.png" onLanguageChange={setLanguage} />
      </div>

      <div className="mx-auto grid max-w-[1480px] items-start gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_430px]">
        <section className="grid gap-2 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex h-10 items-center text-xl font-black text-[#0b4f9c]">{t.converterTitle}</div>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div
              className="relative h-[58vh] min-h-[460px] border-b border-slate-200 bg-[linear-gradient(180deg,#f8fafc,#eef4f7)]"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files.item(0);
                if (file) void handleFile(file);
              }}
            >
              {isProcessingModel ? (
                <div className="absolute inset-5 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-cyan-200 bg-white/70 text-center">
                  <Loader2 className="h-12 w-12 animate-spin text-cyan-700" />
                  <span className="mt-4 text-xl font-black text-slate-900">{status}</span>
                  <span className="mt-2 text-4xl font-black text-[#0b4f9c]">{progressPercent}%</span>
                  <div className="mt-4 h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-[#0b4f9c] transition-all" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <span className="mt-3 max-w-md text-sm font-medium leading-6 text-slate-500">{currentFile?.name ?? t.dropSubtitle}</span>
                </div>
              ) : modelObject ? (
                <ThreeModelViewer object={modelObject} color="#cdeef6" labels={t} />
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`absolute inset-5 flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-white/60 text-center transition hover:bg-cyan-50/50 ${
                    error ? 'border-amber-300 hover:border-amber-400' : 'border-slate-300 hover:border-cyan-500'
                  }`}
                >
                  <FileUp className={`h-12 w-12 ${error ? 'text-amber-600' : 'text-cyan-700'}`} />
                  <span className="mt-4 text-xl font-black text-slate-900">{error ? t.parseFailed : t.dropTitle}</span>
                  {error ? (
                    <span className="mt-3 max-w-xl rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">{error}</span>
                  ) : null}
                  <span className="mt-3 max-w-md text-sm font-medium leading-6 text-slate-500">{t.dropSubtitle}</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".stl,.obj,.ply,.glb,.step,.stp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                  event.currentTarget.value = '';
                }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b4f9c] px-3 text-sm font-black text-white shadow-sm transition hover:bg-[#083f7e]"
              >
                <FileUp className="h-4 w-4" />
                {t.selectModel}
              </button>
              <div className="min-w-[220px] flex-1 text-right text-xs font-bold text-slate-500">
                {status}
              </div>
            </div>
          </div>
        </section>

        <aside className="grid gap-2">
          <div className="flex h-10 items-center">
            <div className="inline-flex w-full items-center gap-2 rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-800">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {t.localPrivacy}
            </div>
          </div>
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-[#0b4f9c]">{t.modelInfo}</h2>
              {modelObject ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <FileArchive className="h-4 w-4 text-slate-400" />}
            </div>
            <InfoRow label={t.fileName} value={currentFile?.name ?? '--'} />
            <InfoRow label={t.fileSize} value={formatFileSize(currentFile?.size ?? null)} />
            <InfoRow label={t.sourceFormat} value={currentFile?.format.toUpperCase() ?? '--'} />
            <InfoRow
              label={t.dimensions}
              value={formattedDimensions}
            />
            <InfoRow label={t.volume} value={measurement ? `${formatNumber(measurement.volumeCm3, language, t.fallback, 2)} cm³` : '--'} />
            <InfoRow label={t.surfaceArea} value={measurement ? `${formatNumber(measurement.surfaceAreaMm2, language, t.fallback, 0)} mm²` : '--'} />
            <InfoRow label={t.triangles} value={measurement ? formatNumber(measurement.triangleCount, language, t.fallback, 0) : '--'} />
            <InfoRow label={t.meshes} value={measurement ? formatNumber(measurement.meshCount, language, t.fallback, 0) : '--'} />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-black text-[#0b4f9c]">{t.conversion}</h2>
            <label className="grid gap-1 text-xs font-bold text-slate-500">
              <span>{t.targetFormat}</span>
              <select
                value={targetFormat}
                onChange={(event) => setTargetFormat(event.target.value as MeshModelFormat)}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none focus:border-cyan-600"
              >
                {targetOptions.map((format) => (
                  <option key={format} value={format}>
                    {format.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-xs font-medium leading-5 text-slate-500">{t.cadHint}</p>
            <button
              type="button"
              onClick={() => void handleConvert()}
              disabled={!modelObject || isConverting}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0b4f9c] px-3 text-sm font-black text-white shadow-sm transition hover:bg-[#083f7e] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isConverting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
              {isConverting ? t.converting : t.convert}
            </button>
            {downloadFile ? (
              <a
                href={downloadFile.url}
                download={downloadFile.name}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-100"
              >
                <Download className="h-4 w-4" />
                {t.download}
              </a>
            ) : null}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-black text-[#0b4f9c]">{t.status}</h2>
            <p className="text-sm font-bold leading-6 text-slate-700">{error ?? status}</p>
            <p className="mt-2 text-xs font-medium leading-5 text-slate-500">{t.noUploadNote}</p>
          </section>
        </aside>

        <section className="lg:col-span-2">
          <div className="mb-2 flex h-10 items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-2 text-sm font-black text-[#0b4f9c]">
              <FileText className="h-4 w-4" />
              {t.technicalReport}
            </div>
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={!measurement || isExportingPdf}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b4f9c] px-3 text-sm font-black text-white shadow-sm transition hover:bg-[#083f7e] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isExportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {isExportingPdf ? t.exportingPdf : t.exportPdf}
            </button>
          </div>

          <div
            id="technical-report"
            className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm print:h-[190mm] print:w-[277mm] print:overflow-hidden print:rounded-none print:border-0 print:p-0 print:shadow-none ${
              isExportingPdf ? 'overflow-hidden shadow-none' : ''
            }`}
          >
            <div className="border-b border-slate-200 pb-4 print:pb-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-cyan-700">{t.reportGeneratedLocally}</div>
                  <h2 className="mt-1 text-2xl font-black text-slate-950 print:text-xl">{t.reportDrawingTitle}</h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">{currentFile?.name ?? t.previewPlaceholder}</p>
                </div>
                <div className="grid gap-1 text-right text-xs font-bold text-slate-500">
                  <span>{t.sourceFormat}: {currentFile?.format.toUpperCase() ?? '--'}</span>
                  <span>{t.fileSize}: {formatFileSize(currentFile?.size ?? null)}</span>
                  <span>{t.dimensions}: {formattedDimensions}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px] print:mt-3 print:grid-cols-[1fr_76mm] print:gap-3">
              <section>
                <h3 className="mb-3 text-sm font-black text-[#0b4f9c]">{t.engineeringViews}</h3>
                <div className="grid grid-cols-2 gap-3 print:gap-2">
                  <ModelEngineeringView label={t.frontView} mode="front" object={modelObject} horizontalLabel={lengthDimension} verticalLabel={heightDimension} annotation={annotation} />
                  <ModelEngineeringView label={t.topView} mode="top" object={modelObject} horizontalLabel={lengthDimension} verticalLabel={widthDimension} annotation={annotation} />
                  <ModelEngineeringView label={t.sideView} mode="side" object={modelObject} horizontalLabel={depthDimension} verticalLabel={heightDimension} annotation={annotation} />
                  <ModelEngineeringView label={t.isoView} mode="iso" object={modelObject} horizontalLabel={formattedDimensions} verticalLabel={heightDimension} annotation={annotation} />
                </div>
              </section>

              <aside className="grid content-start gap-3">
                <h3 className="invisible hidden text-sm font-black xl:block print:block" aria-hidden="true">
                  {t.engineeringViews}
                </h3>
                <section className="rounded-md border border-slate-200 bg-white p-3">
                  <h3 className="mb-2 text-sm font-black text-[#0b4f9c]">{t.riskSummary}</h3>
                  <RiskRow label={t.closedCheck} value={riskAnalysis?.isClosed === null || !riskAnalysis ? '--' : riskAnalysis.isClosed ? t.yes : t.no} tone={riskAnalysis?.isClosed ? 'good' : riskAnalysis ? 'warn' : 'neutral'} />
                  <RiskRow label={t.boundaryEdges} value={riskAnalysis ? formatNumber(riskAnalysis.boundaryEdgeCount, language, t.fallback, 0) : '--'} tone={riskAnalysis?.boundaryEdgeCount === 0 ? 'good' : riskAnalysis ? 'warn' : 'neutral'} />
                  <RiskRow label={t.nonManifoldEdges} value={!riskAnalysis ? '--' : riskAnalysis.nonManifoldEdgeCount > 0 ? t.foundCount(foundNonManifoldEdges) : t.noneFound} tone={riskAnalysis?.nonManifoldEdgeCount === 0 ? 'good' : riskAnalysis ? 'warn' : 'neutral'} />
                  <RiskRow label={t.suspectedSelfIntersections} value={!riskAnalysis ? '--' : riskAnalysis.selfIntersectionCount > 0 ? t.suspectedCount(detectedSelfIntersections) : t.noneFound} tone={riskAnalysis?.selfIntersectionCount === 0 ? 'good' : riskAnalysis ? 'warn' : 'neutral'} />
                  <RiskRow label={t.degenerateTriangles} value={!riskAnalysis ? '--' : riskAnalysis.degenerateTriangleCount > 0 ? t.foundCount(foundDegenerateTriangles) : t.noneFound} tone={riskAnalysis?.degenerateTriangleCount === 0 ? 'good' : riskAnalysis ? 'warn' : 'neutral'} />
                  <RiskRow label={t.shellCount} value={shellCount} tone={riskAnalysis?.shellCount === 1 ? 'good' : riskAnalysis ? 'warn' : 'neutral'} />
                  <RiskRow label={t.triangleAbnormal} value={riskAnalysis ? (riskAnalysis.triangleCountAbnormal ? t.abnormal : t.normal) : '--'} tone={riskAnalysis?.triangleCountAbnormal ? 'warn' : riskAnalysis ? 'good' : 'neutral'} />
                  <RiskRow label={t.possibleEnclosedCavity} value={!riskAnalysis ? '--' : riskAnalysis.enclosedCavityCount > 0 ? t.possibleCount(possibleEnclosedCavities) : t.noneFound} tone={riskAnalysis?.enclosedCavityCount === 0 ? 'good' : riskAnalysis ? 'warn' : 'neutral'} />
                  <RiskRow label={t.suspectedThinWall} value={!riskAnalysis ? '--' : riskAnalysis.thinWallAreaCount > 0 ? t.suspectedCount(suspectedThinWalls) : t.noneFound} tone={riskAnalysis?.thinWallAreaCount === 0 ? 'good' : riskAnalysis ? 'warn' : 'neutral'} />
                  <RiskRow label={t.suspectedSmallHoleSlot} value={!riskAnalysis ? '--' : riskAnalysis.smallHoleSlotCount > 0 ? t.suspectedCount(suspectedSmallHoleSlots) : t.noneFound} tone={riskAnalysis?.smallHoleSlotCount === 0 ? 'good' : riskAnalysis ? 'warn' : 'neutral'} />
                  <RiskRow label={t.suspectedSlenderFeature} value={!riskAnalysis ? '--' : riskAnalysis.slenderFeatureCount > 0 ? t.suspectedCount(suspectedSlenderFeatures) : t.noneFound} tone={riskAnalysis?.slenderFeatureCount === 0 ? 'good' : riskAnalysis ? 'warn' : 'neutral'} />
                  <RiskRow label={t.overhangFaces} value={overhangValue} tone={riskAnalysis && riskAnalysis.overhangRatio > 0.15 ? 'warn' : riskAnalysis ? 'good' : 'neutral'} />
                  <RiskRow label={t.bottomContactArea} value={bottomContactValue} />
                </section>

                <section className="rounded-md border border-slate-200 bg-white p-3">
                  <h3 className="mb-2 text-sm font-black text-[#0b4f9c]">{t.viewAssistLegend}</h3>
                  <div className="grid gap-2">
                    <LegendItem color="bg-teal-700" label={t.sizeLineLegend} />
                    {hasOverhangAnnotation ? <LegendItem color="bg-amber-500" label={t.overhangLegend} /> : null}
                    {hasBottomContactAnnotation ? <LegendItem color="bg-cyan-500" label={t.bottomContactLegend} /> : null}
                    {hasBoundaryAnnotation ? <LegendItem color="bg-red-500" label={t.boundaryEdges} /> : null}
                    {hasNonManifoldAnnotation ? <LegendItem color="bg-violet-600" label={t.nonManifoldEdges} /> : null}
                  </div>
                </section>

                <section className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="grid gap-1 text-[11px] font-bold text-slate-600">
                    <div className="flex justify-between gap-3"><span>{t.triangles}</span><span>{measurement ? formatNumber(measurement.triangleCount, language, t.fallback, 0) : '--'}</span></div>
                    <div className="flex justify-between gap-3"><span>{t.meshes}</span><span>{measurement ? formatNumber(measurement.meshCount, language, t.fallback, 0) : '--'}</span></div>
                    <div className="flex justify-between gap-3"><span>{t.volume}</span><span>{measurement ? `${formatNumber(measurement.volumeCm3, language, t.fallback, 2)} cm³` : '--'}</span></div>
                    <div className="flex justify-between gap-3"><span>{t.surfaceArea}</span><span>{measurement ? `${formatNumber(measurement.surfaceAreaMm2, language, t.fallback, 0)} mm²` : '--'}</span></div>
                  </div>
                </section>
              </aside>
            </div>

            <p className="mt-4 flex min-h-9 items-center justify-center rounded-md border border-amber-200 bg-white px-3 py-2 text-center text-xs font-bold leading-5 text-amber-800 print:mt-2 print:py-1">{t.reportNote}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
