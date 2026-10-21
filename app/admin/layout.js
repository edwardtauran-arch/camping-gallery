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
  const queueRef = useRef([]); // Antrian pemindaian: array of { event, type }
  const pathnameRef = useRef(pathname);
  const processNextInQueueRef = useRef(null);

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
      } else if (data.type === 'request-snapshot') {
        // Dashboard just mounted and is asking for current scan state
        if (bgScanJobRef.current) {
          try { channelRef.current?.postMessage({ type: 'snapshot', ...bgScanJobRef.current }); } catch (_) {}
        }
        // Kirim status antrian terkini
        try {
          channelRef.current?.postMessage({
            type: 'queue-updated',
            queue: queueRef.current.map(q => q.event._id)
          });
        } catch (_) {}
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
      // SSD MobileNet v1 — more accurate than TinyFaceDetector for group/outdoor photos
      await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
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
    if (!faceapi || !faceapi.nets.ssdMobilenetv1.params) {
      bgScanRunning.current = false;
      return;
    }

    const currentIndexedMap = new Map((event.indexedPhotos || []).map(p => [p.id, p]));
    const toScan = photoList.filter(p => {
      const dbPhoto = currentIndexedMap.get(p.id);
      if (scanType === 'face') {
        if (!dbPhoto) return true;
        if (typeof dbPhoto.faceScanned === 'boolean') return !dbPhoto.faceScanned;
        return (dbPhoto.faceDescriptors || []).length === 0;
      } else if (scanType === 'bib') {
        return !dbPhoto || !dbPhoto.ocr;
      } else {
        return !dbPhoto || !dbPhoto.ocr;
      }
    });
    if (toScan.length === 0) { bgScanRunning.current = false; return; }

    // SSD MobileNet v1 — minConfidence 0.5 filters false positives, detects small faces better
    const detectorOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 50 });
    let batch = [];
    let done = 0;
    const scanStartTime = Date.now();

    const startingFaceCount = (event.indexedPhotos || []).filter(p => p.faceScanned === true || (p.faceDescriptors || []).length > 0).length;
    const startingBibCount = (event.indexedPhotos || []).filter(p => p.ocr === true).length;

    // Tampilan: pakai total keseluruhan (sama dengan Status Indeks), bukan hanya sisa sesi ini
    const baseCount = scanType === 'bib' ? startingBibCount : startingFaceCount;
    const displayTotal = photoList.length;

    const jobBase = { eventId: event._id, eventTitle: event.title, progress: 0, total: toScan.length, displayProgress: Math.min(baseCount, displayTotal), displayTotal, done: false, eta: '', scanType, startingFaceCount, startingBibCount };
    setBgScanJob(jobBase);
    bgScanJobRef.current = { ...jobBase };
    broadcast(jobBase);
    const markHandoff = () => {
      if (!pathnameRef.current?.includes('/admin/scan/')) {
        window.bgScanHandoff = { eventId: event._id, scanType, ts: Date.now() };
      }
    };
    markHandoff();

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
          faceScanned: scanType === 'face' ? true : (dbPhoto?.faceScanned || false),
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
          faceScanned: scanType === 'face' ? true : (dbPhoto?.faceScanned || false),
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

      const update = { eventId: event._id, eventTitle: event.title, progress: done, total: toScan.length, displayProgress: Math.min(baseCount + done, displayTotal), displayTotal, done: false, eta: etaStr, scanType, startingFaceCount, startingBibCount };
      setBgScanJob(update);
      bgScanJobRef.current = { ...update };
      broadcast(update);
      markHandoff();

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



    // Simpan sisa batch (jika scan dihentikan sebelum mencapai 5 foto)
    if (batch.length > 0) {
      try {
        await fetch('/api/index-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: event._id, photos: batch }),
        });
        broadcast({ type: 'batch-saved', eventId: event._id, count: batch.length });
      } catch (err) {
        console.error('[BgScan] Gagal simpan sisa batch:', err);
      }
      batch = [];
    }

    bgScanRunning.current = false;
    // Scan selesai normal (bukan dihentikan) → tidak ada yang perlu diserahkan
    if (!bgStopRef.current) delete window.bgScanHandoff;
    const doneState = { eventId: event._id, eventTitle: event.title, progress: done, total: toScan.length, done: true, eta: '' };
    if (!pathnameRef.current?.includes('/admin/scan/')) setBgScanJob(doneState);
    broadcast(doneState);

    // Auto-check for next event in queue or needing scan (tidak saat di halaman Monitor)
    setTimeout(() => {
      if (pathnameRef.current?.includes('/admin/scan/')) return;
      if (processNextInQueueRef.current) {
        processNextInQueueRef.current();
      }
    }, 1500);
  }, [broadcast]);

  const startNextIfNeeded = useCallback(async () => {
    if (bgScanRunning.current) return;
    try {
      const res = await fetch('/api/admin/events');
      if (!res.ok) return;
      const json = await res.json();
      const events = json.data || [];
      const needScan = events.filter(ev => {
        // Auto-scan HANYA untuk event baru yang belum punya entri indeks sama sekali.
        // Event lama yang belum lengkap harus dipicu manual (tombol Wajah/BIB/Re-scan).
        if ((ev.indexedEntriesCount ?? 0) > 0) return false;
        const driveCount = ev.drivePhotosCount || 0;
        if (driveCount === 0) return false;
        return (ev.enableFaceSearch !== false) || (ev.enableBibSearch !== false);
      });
      if (needScan.length === 0) return;

      const event = needScan[0];
      const photosRes = await fetch(`/api/admin/events?slug=${event.slug}&photos=1`);
      if (!photosRes.ok) return;
      const photosJson = await photosRes.json();
      const photos = photosJson.photos || [];
      if (photos.length > 0) {
        let scanType = null;
        const faceCount = event.indexedPhotosCount ?? (event.indexedPhotos ? event.indexedPhotos.filter(p => p.faceScanned === true || (p.faceDescriptors || []).length > 0).length : 0);
        const bibCount = event.bibIndexedCount ?? (event.indexedPhotos ? event.indexedPhotos.filter(p => p.ocr === true).length : 0);
        const driveCount = event.drivePhotosCount || 0;

        const needsFace = (event.enableFaceSearch !== false) && (driveCount > faceCount);
        const needsBib = (event.enableBibSearch !== false) && (driveCount > bibCount);

        if (needsFace && !needsBib) {
          scanType = 'face';
        } else if (needsBib && !needsFace) {
          scanType = 'bib';
        }

        // PENTING: daftar event (aggregate) tidak membawa indexedPhotos, jadi pakai event lengkap dari endpoint foto
        const fullEvent = photosJson.event || event;
        await runBackgroundScan({ ...fullEvent, indexedPhotos: fullEvent.indexedPhotos || [] }, photos, scanType);
      }
    } catch (err) {
      console.error('[BgScan] startNextIfNeeded error:', err);
    }
  }, [runBackgroundScan]);

  const processNextInQueue = useCallback(async () => {
    if (bgScanRunning.current) return;

    // Check manual queue first
    if (queueRef.current.length > 0) {
      const next = queueRef.current.shift();
      broadcast({ type: 'queue-updated', queue: queueRef.current.map(q => q.event._id) });
      try {
        const photosRes = await fetch(`/api/admin/events?slug=${next.event.slug}&photos=1`);
        if (!photosRes.ok) {
          setTimeout(() => { if (processNextInQueueRef.current) processNextInQueueRef.current(); }, 1000);
          return;
        }
        const photosJson = await photosRes.json();
        const photos = photosJson.photos || [];
        const freshEvent = photosJson.event || next.event;
        if (photos.length > 0) {
          await runBackgroundScan({ ...freshEvent, indexedPhotos: freshEvent.indexedPhotos || [] }, photos, next.type);
        } else {
          setTimeout(() => { if (processNextInQueueRef.current) processNextInQueueRef.current(); }, 1000);
        }
      } catch (err) {
        console.error('[BgScan Queue] Error:', err);
        setTimeout(() => { if (processNextInQueueRef.current) processNextInQueueRef.current(); }, 1000);
      }
      return;
    }

    // Fallback: check database for any events needing scan
    await startNextIfNeeded();
  }, [runBackgroundScan, startNextIfNeeded, broadcast]);

  useEffect(() => {
    processNextInQueueRef.current = processNextInQueue;
  }, [processNextInQueue]);

  // Auto-trigger scan once face-api is ready (and NOT on manual scan page)
  useEffect(() => {
    window.bgScanIsRunning = () => bgScanRunning.current;
    return () => { delete window.bgScanIsRunning; };
  }, []);

  useEffect(() => {
    pathnameRef.current = pathname;
    const isOnScanPage = pathname?.includes('/admin/scan/');
    if (isOnScanPage) {
      // Serah-terima ke halaman Monitor: catat scan yang sedang berjalan agar Monitor melanjutkannya
      if (bgScanRunning.current && bgScanJobRef.current && !bgScanJobRef.current.done) {
        window.bgScanHandoff = {
          eventId: bgScanJobRef.current.eventId,
          scanType: bgScanJobRef.current.scanType,
          ts: Date.now()
        };
      }
      bgStopRef.current = true;
      setBgScanJob(null);
      return;
    }
    // Keluar dari Monitor: lanjutkan scan Monitor yang masih berjalan ke latar belakang
    if (window.bgScanResume) {
      const resume = window.bgScanResume;
      delete window.bgScanResume;
      if (window.triggerBgScan) window.triggerBgScan(resume.event, resume.type);
    }
    if (faceApiReady && !bgScanRunning.current && processNextInQueueRef.current) {
      processNextInQueueRef.current();
    }
  }, [faceApiReady, pathname]);

  // Handle manual background scan triggers from dashboard (supports queuing multiple events)
  useEffect(() => {
    window.triggerBgScan = (event, type) => {
      // If currently scanning this exact event and type, do not duplicate
      if (bgScanRunning.current && bgScanJobRef.current?.eventId === event._id && bgScanJobRef.current?.scanType === type) {
        return;
      }
      // If not already in queue, add it
      if (!queueRef.current.some(q => q.event._id === event._id && q.type === type)) {
        queueRef.current.push({ event, type });
        broadcast({ type: 'queue-updated', queue: queueRef.current.map(q => q.event._id) });
      }

      // If scanner is idle and models are ready, kick off processing
      if (!bgScanRunning.current && faceApiReady && processNextInQueueRef.current) {
        processNextInQueueRef.current();
      }
    };
    return () => {
      delete window.triggerBgScan;
    };
  }, [faceApiReady, broadcast]);

  const shownTotal = bgScanJob ? (bgScanJob.displayTotal ?? bgScanJob.total) : 0;
  const shownProgress = bgScanJob ? (bgScanJob.displayProgress ?? bgScanJob.progress) : 0;
  const pct = shownTotal > 0
    ? Math.round((shownProgress / shownTotal) * 100)
    : 0;

  const isOnScanPage = pathname?.includes('/admin/scan/');

  return (
    <>
      <Script
        src="/js/face-api.js"
        strategy="afterInteractive"
        onLoad={() => loadFaceApiModels()}
      />


      {children}

      {/* Compact scan progress indicator — hanya tampil di dashboard / halaman selain monitor */}
      {!isOnScanPage && bgScanJob && !bgScanJob.done && (
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
                {shownProgress}/{shownTotal}
                {bgScanJob.eta && ` (${bgScanJob.eta})`}
              </span>
            </div>
          </div>
        </div>
      )}

      {!isOnScanPage && bgScanJob && bgScanJob.done && (
        <div className="fixed bottom-4 right-4 z-[200] flex items-center gap-2 bg-slate-900 border border-emerald-800 rounded-xl px-3 py-2 shadow-xl">
          <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
          <p className="text-[10px] font-bold text-white">Scan Selesai!</p>
        </div>
      )}
    </>
  );
}
