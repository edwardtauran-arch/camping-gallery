'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { Loader2, CheckCircle2 } from 'lucide-react';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds === Infinity) return '';
  if (seconds < 60) return `${Math.round(seconds)}d`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}d`;
};

// BroadcastChannel key for sharing scan progress with dashboard
export const SCAN_CHANNEL = 'bg-scan-progress';

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [bgScanJob, setBgScanJob] = useState(null);

  const faceApiLoadingRef = useRef(false);
  const bgScanRunning = useRef(false);
  const bgStopRef = useRef(false);
  const channelRef = useRef(null);
  const bgScanJobRef = useRef(null);

  // Open BroadcastChannel so dashboard can subscribe to progress updates
  useEffect(() => {
    channelRef.current = new BroadcastChannel(SCAN_CHANNEL);
    channelRef.current.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'event-updated') {
        if (bgScanRunning.current && bgScanJobRef.current?.eventId === data.eventId) {
          const activeType = bgScanJobRef.current.scanType;
          const faceOff = data.enableFaceSearch === false;
          const bibOff = data.enableBibSearch === false;

          if ((activeType === 'face' && faceOff) || 
              (activeType === 'bib' && bibOff) ||
              (faceOff && bibOff) ||
              (!activeType && (faceOff || bibOff))) {
            console.log('[BgScan] Toggles updated. Stopping current scan.');
            bgStopRef.current = true;
          }
        }
      }
    };
    return () => channelRef.current?.close();
  }, []);

  // Keep alive session during background scanning
  useEffect(() => {
    const isScanning = bgScanJob && !bgScanJob.done;
    if (!isScanning) return;
    const interval = setInterval(async () => {
      try {
        await fetch('/api/auth');
      } catch (err) {
        console.error('[BgKeepAlive] Failed to ping auth:', err);
      }
    }, 60000); // ping every 1 minute
    return () => clearInterval(interval);
  }, [bgScanJob]);

  const broadcast = useCallback((data) => {
    try { channelRef.current?.postMessage(data); } catch (_) {}
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

  const runBackgroundScan = useCallback(async (event, photoList, scanType = null) => {
    if (bgScanRunning.current) return;
    bgScanRunning.current = true;
    bgStopRef.current = false;

    const faceapi = window.faceapi;
    if (!faceapi || !faceapi.nets.tinyFaceDetector.params) {
      bgScanRunning.current = false;
      return;
    }

    const currentIndexedMap = new Map((event.indexedPhotos || []).map(p => [p.id, p]));
    const toScan = photoList.filter(p => {
      const dbPhoto = currentIndexedMap.get(p.id);
      if (scanType === 'face') {
        return !dbPhoto;
      } else if (scanType === 'bib') {
        return !dbPhoto || !dbPhoto.ocr;
      } else {
        return !dbPhoto || !dbPhoto.ocr;
      }
    });
    if (toScan.length === 0) { bgScanRunning.current = false; return; }



    // Use 608px for high accuracy face detection in both modes (so we always locate the torso correctly)
    const detectorSize = 608;
    const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: detectorSize, scoreThreshold: 0.35 });
    let batch = [];
    let done = 0;
    const scanStartTime = Date.now();

    const startingFaceCount = (event.indexedPhotos || []).length;
    const startingBibCount = (event.indexedPhotos || []).filter(p => p.ocr === true).length;

    const jobBase = { eventId: event._id, eventTitle: event.title, progress: 0, total: toScan.length, done: false, eta: '', scanType, startingFaceCount, startingBibCount };
    setBgScanJob(jobBase);
    bgScanJobRef.current = jobBase;
    broadcast(jobBase);

    for (let i = 0; i < toScan.length; i++) {
      if (bgStopRef.current) break;

      const photo = toScan[i];
      try {
        let faceDescriptors = [];
        let bibs = [];
        const dbPhoto = currentIndexedMap.get(photo.id);
        const existingBibs = dbPhoto?.bibs || [];
        const existingOcr = dbPhoto?.ocr || false;
        let isOcrDone = existingOcr;

        if (scanType === 'bib') {
          // Backend BIB Scan API
          const res = await fetch('/api/admin/scan-bib', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventId: event._id,
              driveFileId: photo.id,
              photoName: photo.name,
              thumbnailLink: photo.thumbnailLink,
              webContentLink: photo.webContentLink,
            }),
          });

          if (!res.ok) {
            throw new Error(`Gagal memproses BIB di backend: ${res.statusText}`);
          }
          const result = await res.json();
          if (!result.success) {
            throw new Error(result.error || 'Gagal memproses BIB di backend');
          }
          bibs = result.data;
          isOcrDone = true;
          faceDescriptors = dbPhoto?.faceDescriptors || [];
        } else {
          // Frontend Face Scan
          const proxyUrl = `/api/proxy-image?id=${photo.id}&sz=w800`;
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
          faceDescriptors = detections.map(d => Array.from(d.descriptor));
          bibs = existingBibs;
          isOcrDone = existingOcr;
        }

        const finalFaceDescriptors = faceDescriptors.length > 0
          ? faceDescriptors
          : (dbPhoto?.faceDescriptors || []);

        batch.push({
          id: photo.id,
          name: photo.name,
          thumbnailLink: photo.thumbnailLink || '',
          webContentLink: photo.webContentLink || '',
          faceDescriptors: finalFaceDescriptors,
          bibs,
          ocr: isOcrDone
        });
      } catch (_) {
        const dbPhoto = currentIndexedMap.get(photo.id);
        batch.push({
          id: photo.id,
          name: photo.name,
          thumbnailLink: photo.thumbnailLink || '',
          webContentLink: photo.webContentLink || '',
          faceDescriptors: dbPhoto?.faceDescriptors || [],
          bibs: dbPhoto?.bibs || [],
          ocr: dbPhoto?.ocr || false
        });
      }

      done++;
      const elapsedMs = Date.now() - scanStartTime;
      const averageMsPerPhoto = elapsedMs / done;
      const remainingPhotosCount = toScan.length - done;
      const remainingMs = remainingPhotosCount * averageMsPerPhoto;
      const etaStr = formatDuration(remainingMs / 1000);

      const update = { eventId: event._id, eventTitle: event.title, progress: done, total: toScan.length, done: false, eta: etaStr };
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
    const doneState = { eventId: event._id, eventTitle: event.title, progress: done, total: toScan.length, done: true, eta: '' };
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
      const needScan = events.filter(ev => {
        const driveCount = ev.drivePhotosCount || 0;
        const faceCount = ev.indexedPhotosCount ?? (ev.indexedPhotos ? ev.indexedPhotos.length : 0);
        const bibCount = ev.bibIndexedCount ?? (ev.indexedPhotos ? ev.indexedPhotos.filter(p => p.ocr === true).length : 0);
        
        const needsFaceScan = (ev.enableFaceSearch !== false) && (driveCount > faceCount);
        const needsBibScan = (ev.enableBibSearch !== false) && (driveCount > bibCount);
        
        return needsFaceScan || needsBibScan;
      });
      if (needScan.length === 0) return;

      const event = needScan[0];
      const photosRes = await fetch(`/api/admin/events?slug=${event.slug}&photos=1`);
      if (!photosRes.ok) return;
      const photosJson = await photosRes.json();
      const photos = photosJson.photos || [];
      if (photos.length > 0) {
        let scanType = null;
        const faceCount = event.indexedPhotosCount ?? (event.indexedPhotos ? event.indexedPhotos.length : 0);
        const bibCount = event.bibIndexedCount ?? (event.indexedPhotos ? event.indexedPhotos.filter(p => p.ocr === true).length : 0);
        const driveCount = event.drivePhotosCount || 0;

        const needsFace = (event.enableFaceSearch !== false) && (driveCount > faceCount);
        const needsBib = (event.enableBibSearch !== false) && (driveCount > bibCount);

        if (needsFace && !needsBib) {
          scanType = 'face';
        } else if (needsBib && !needsFace) {
          scanType = 'bib';
        }

        await runBackgroundScan({ ...event, indexedPhotos: event.indexedPhotos || [] }, photos, scanType);
      }
    } catch (err) {
      console.error('[BgScan] startNextIfNeeded error:', err);
    }
  }, [runBackgroundScan]);

  // Auto-trigger scan once face-api is ready (and NOT on manual scan page)
  useEffect(() => {
    const isOnScanPage = pathname?.includes('/admin/scan/');
    if (isOnScanPage) {
      bgStopRef.current = true;
      setBgScanJob(null);
      return;
    }
    if (faceApiReady && !bgScanRunning.current) {
      startNextIfNeeded();
    }
  }, [faceApiReady, startNextIfNeeded, pathname]);

  // Handle manual background scan triggers from dashboard
  useEffect(() => {
    window.triggerBgScan = (event, type) => {
      bgStopRef.current = true;
      setTimeout(async () => {
        try {
          const photosRes = await fetch(`/api/admin/events?slug=${event.slug}&photos=1`);
          if (!photosRes.ok) return;
          const photosJson = await photosRes.json();
          const photos = photosJson.photos || [];
          if (photos.length > 0) {
            await runBackgroundScan({ ...event, indexedPhotos: event.indexedPhotos || [] }, photos, type);
          }
        } catch (err) {
          console.error('[BgScan Trigger] Error:', err);
        }
      }, 500);
    };
    return () => {
      delete window.triggerBgScan;
    };
  }, [runBackgroundScan]);

  const pct = bgScanJob && bgScanJob.total > 0
    ? Math.round((bgScanJob.progress / bgScanJob.total) * 100)
    : 0;

  return (
    <>
      <Script
        src="/js/face-api.js"
        strategy="afterInteractive"
        onLoad={() => loadFaceApiModels()}
      />


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
              <span className="text-[10px] text-slate-400 whitespace-nowrap">
                {bgScanJob.progress}/{bgScanJob.total}
                {bgScanJob.eta && ` (${bgScanJob.eta})`}
              </span>
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
