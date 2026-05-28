'use client';

import { CheckCircle2, Download, FileArchive, FileUp, Loader2, ShieldCheck } from 'lucide-react';
import { ToolHeader } from '@unionam/shared-ui';
import { useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { ThreeModelViewer } from '@/components/model-viewer/three-model-viewer';
import { convertModel } from '@/lib/converter/convert-model';
import { useLanguage } from '@/lib/i18n/use-language';
import { measureModel } from '@/lib/model/model-measure';
import { parseModelBuffer } from '@/lib/model/parse-model';
import { getModelFormat, isCadModelFormat, meshModelFormats, type MeshModelFormat, type ModelFormat, type ModelMeasurement } from '@/lib/model/model-types';

type StatusKey = 'initial' | 'importing' | 'parsing' | 'measuring' | 'completed' | 'converting' | 'readyToDownload' | 'parseFailed' | 'convertFailed';

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

export default function HomePage() {
  const { language, setLanguage, t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const downloadUrlRef = useRef<string | null>(null);
  const [currentFile, setCurrentFile] = useState<{ name: string; size: number; format: ModelFormat } | null>(null);
  const [modelObject, setModelObject] = useState<THREE.Object3D | null>(null);
  const [measurement, setMeasurement] = useState<ModelMeasurement | null>(null);
  const [targetFormat, setTargetFormat] = useState<MeshModelFormat>('stl');
  const [statusKey, setStatusKey] = useState<StatusKey>('initial');
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [downloadFile, setDownloadFile] = useState<{ name: string; url: string } | null>(null);

  const targetOptions = useMemo(() => {
    if (!currentFile || isCadModelFormat(currentFile.format)) return meshModelFormats;
    return meshModelFormats.filter((format) => format !== currentFile.format);
  }, [currentFile]);

  const status = useMemo(() => {
    if (statusKey === 'importing' && progressPercent !== null) return t.importingWithPercent(progressPercent);
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
    setProgressPercent(1);
    setStatusKey('importing');
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
      setModelObject(object);
      setMeasurement(measured);
      setProgressPercent(100);
      setStatusKey('completed');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.modelParseFailed);
      setProgressPercent(null);
      setStatusKey('parseFailed');
      setModelObject(null);
      setMeasurement(null);
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

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <ToolHeader language={language} labels={t} logoSrc="/converter/brand/unionam-logo.png" onLanguageChange={setLanguage} />

      <div className="mx-auto grid max-w-[1480px] items-start gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_430px]">
        <section className="grid gap-2">
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
              {modelObject ? (
                <ThreeModelViewer object={modelObject} color="#cdeef6" labels={t} />
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-5 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white/60 text-center transition hover:border-cyan-500 hover:bg-cyan-50/50"
                >
                  <FileUp className="h-12 w-12 text-cyan-700" />
                  <span className="mt-4 text-xl font-black text-slate-900">{t.dropTitle}</span>
                  <span className="mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">{t.dropSubtitle}</span>
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
                {progressPercent !== null ? `${status} · ${progressPercent}%` : status}
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
              value={
                measurement
                  ? `${formatNumber(measurement.dimensionsMm.x, language, t.fallback)} × ${formatNumber(measurement.dimensionsMm.y, language, t.fallback)} × ${formatNumber(
                      measurement.dimensionsMm.z,
                      language,
                      t.fallback,
                    )} mm`
                  : '--'
              }
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
      </div>
    </main>
  );
}
