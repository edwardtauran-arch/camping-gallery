'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Script from 'next/script';
import { Loader2, CheckCircle2, Brain } from 'lucide-react';

// BroadcastChannel key for sharing scan progress with dashboard
export const SCAN_CHANNEL = 'bg-scan-progress';

export default function AdminLayout({ children }) {
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [bgScanJob, setBgScanJob] = useState(null);
  const [hasUnindexed, setHasUnindexed] = useState(false);

  const faceApiLoadingRef = useRef(false);
  const bgScanRunning = useRef(false);
  const bgStopRef = useRef(false);
  const channelRef = useRef(null);

  // Open BroadcastChannel so dashboard can subscribe to progress updates
  useEffect(() => {
    channelRef.current = new BroadcastChannel(SCAN_CHANNEL);
    return () => channelRef.current?.close();
  }, []);

  const broadcast = useCallback((data) => {
    try { channelRef.current?.postMessage(data); } catch (_) {}
  }, []);

  // Check if any events need scanning (runs once on mount)
  useEffect(() => {
    async function checkNeedScan() {
      try {
        const res = await fetch('/api/admin/events');
        if (!res.ok) return;
        const json = await res.json();
        const events = json.data || [];
        const needs = events.some(ev =>
          (ev.drivePhotosCount || 0) > (ev.indexedPhotos || []).length
        );
        setHasUnindexed(needs);
      } catch (_) {}
    }
    checkNeedScan();
  }, []);

  const loadFaceApiModels = useCallback(async () => {
    if (faceApiLoadingRef.current || faceApiReady) return;
    faceApiLoadingRef.current = true;
    try {
      const faceapi = window.faceapi;
      if (!faceapi) return;
      await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
      await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
      await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
      setFaceApiReady(true);
    } catch (err) {
      console.error('[BgScan] Gagal load model:', err);
      faceApiLoadingRef.current = false;
    }
  }, [faceApiReady]);

  const runBackgroundScan = useCallback(async (event, photoList) => {
    if (bgScanRunning.current) return;
    bgScanRunning.current = true;
    bgStopRef.current = false;

    const faceapi = window.faceapi;
    if (!faceapi || !faceapi.nets.tinyFaceDetector.params) {
      bgScanRunning.current = false;
      return;
    }

    const alreadyIndexedIds = new Set((event.indexedPhotos || []).map(p => p.id));
    const toScan = photoList.filter(p => !alreadyIndexedIds.has(p.id));
    if (toScan.length === 0) { bgScanRunning.current = false; return; }

    const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 });
    let batch = [];
    let done = 0;

    const jobBase = { eventId: event._id, eventTitle: event.title, progress: 0, total: toScan.length, done: false };
    setBgScanJob(jobBase);
    broadcast(jobBase);

    for (let i = 0; i < toScan.length; i++) {
      if (bgStopRef.current) break;

      const photo = toScan[i];
      try {
        const proxyUrl = `/api/proxy-image?id=${photo.id}&sz=w400`;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = proxyUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('Load failed'));
        });

        const detections = await faceapi
          .detectAllFaces(img, detectorOptions)
          .withFaceLandmarks()
          .withFaceDescriptors();

        const faceDescriptors = detections.map(d => Array.from(d.descriptor));
        batch.push({ id: photo.id, name: photo.name, thumbnailLink: photo.thumbnailLink, webContentLink: photo.webContentLink, faceDescriptors });
      } catch (_) {
        batch.push({ id: photo.id, name: photo.name, thumbnailLink: photo.thumbnailLink || '', webContentLink: photo.webContentLink || '', faceDescriptors: [] });
      }

      done++;
      const update = { eventId: event._id, eventTitle: event.title, progress: done, total: toScan.length, done: false };
      setBgScanJob(update);
      broadcast(update);

      // Save every 5 photos or at end
      if (batch.length >= 5 || i === toScan.length - 1) {
        try {
          await fetch('/api/index-photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: event._id, photos: batch }),
          });
          broadcast({ type: 'batch-saved', eventId: event._id, count: batch.length });
        } catch (err) {
          console.error('[BgScan] Gagal simpan batch:', err);
        }
        batch = [];
      }
    }

    bgScanRunning.current = false;
    const doneState = { eventId: event._id, eventTitle: event.title, progress: done, total: toScan.length, done: true };
    setBgScanJob(doneState);
    broadcast(doneState);

    // Auto-check for next event needing scan
    setTimeout(() => startNextIfNeeded(), 2000);
  }, [broadcast]);

  const startNextIfNeeded = useCallback(async () => {
    if (bgScanRunning.current) return;
    try {
      const res = await fetch('/api/admin/events');
      if (!res.ok) return;
      const json = await res.json();
      const events = json.data || [];
      const needScan = events.filter(ev =>
        (ev.drivePhotosCount || 0) > (ev.indexedPhotos || []).length
      );
      if (needScan.length === 0) { setHasUnindexed(false); return; }

      const event = needScan[0];
      const photosRes = await fetch(`/api/admin/events?slug=${event.slug}&photos=1`);
      if (!photosRes.ok) return;
      const photosJson = await photosRes.json();
      const photos = photosJson.photos || [];
      if (photos.length > 0) {
        await runBackgroundScan({ ...event, indexedPhotos: event.indexedPhotos || [] }, photos);
      }
    } catch (err) {
      console.error('[BgScan] startNextIfNeeded error:', err);
    }
  }, [runBackgroundScan]);

  // Auto-trigger scan once face-api is ready
  useEffect(() => {
    if (faceApiReady && !bgScanRunning.current) {
      startNextIfNeeded();
    }
  }, [faceApiReady, startNextIfNeeded]);

  const pct = bgScanJob && bgScanJob.total > 0
    ? Math.round((bgScanJob.progress / bgScanJob.total) * 100)
    : 0;

  return (
    <>
      {/* Face-API Script — lazy load only when unindexed events exist */}
      {hasUnindexed && (
        <Script
          src="/js/face-api.js"
          strategy="lazyOnload"
          onLoad={() => loadFaceApiModels()}
        />
      )}

      {children}

      {/* Compact scan progress indicator — always visible on any admin page */}
      {bgScanJob && !bgScanJob.done && (
        <div className="fixed bottom-4 right-4 z-[200] flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 shadow-xl">
          <Loader2 size={13} className="text-amber-400 animate-spin flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-white truncate max-w-[160px]">{bgScanJob.eventTitle}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-20 bg-slate-700 rounded-full h-1">
                <div
                  className="h-1 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #f59e0b, #ef4444)' }}
                />
              </div>
              <span className="text-[10px] text-slate-400 whitespace-nowrap">{bgScanJob.progress}/{bgScanJob.total}</span>
            </div>
          </div>
        </div>
      )}

      {bgScanJob && bgScanJob.done && (
        <div className="fixed bottom-4 right-4 z-[200] flex items-center gap-2 bg-slate-900 border border-emerald-800 rounded-xl px-3 py-2 shadow-xl">
          <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
          <p className="text-[10px] font-bold text-white">Scan Selesai!</p>
        </div>
      )}
    </>
  );
}
