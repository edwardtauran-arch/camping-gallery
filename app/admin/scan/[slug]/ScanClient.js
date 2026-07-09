'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Script from 'next/script';
import { Play, Pause, RefreshCw, CheckCircle, AlertCircle, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds === Infinity) return '';
  if (seconds < 60) return `${Math.round(seconds)}d`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}d`;
};

export default function ScanClient({ event, initialPhotos }) {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Memuat library Face-API...');
  const [eta, setEta] = useState('');

  // Scanned photo IDs from database
  const [indexedPhotos, setIndexedPhotos] = useState(event.indexedPhotos || []);

  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scanResults, setScanResults] = useState([]);

  const stopRef = useRef(false);
  const loadingRef = useRef(false);
  const currentIndexRef = useRef(0);

  // Keep alive session during scanning
  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(async () => {
      try {
        await fetch('/api/auth');
      } catch (err) {
        console.error('[KeepAlive] Failed to ping auth:', err);
      }
    }, 60000); // ping every 1 minute
    return () => clearInterval(interval);
  }, [isScanning]);

  // Derived: which photos still need scanning (recalculated from live indexedPhotos state)
  const indexedIds = new Set(indexedPhotos.map(p => p.id));
  const unscannedPhotos = initialPhotos.filter(p => !indexedIds.has(p.id));

  const totalPhotos = initialPhotos.length;
  const alreadyIndexed = indexedPhotos.length;
  const percentIndexed = totalPhotos > 0 ? Math.round((alreadyIndexed / totalPhotos) * 100) : 0;
  const isComplete = unscannedPhotos.length === 0 && totalPhotos > 0;

  // On mount, check if faceapi is already loaded globally by layout
  useEffect(() => {
    if (typeof window !== 'undefined' && window.faceapi) {
      setScriptLoaded(true);
    }
  }, []);

  // Load models once script is ready
  useEffect(() => {
    if (scriptLoaded && !modelsLoaded && !loadingRef.current) {
      loadModels();
    }
  }, [scriptLoaded, modelsLoaded]);

  const loadModels = async () => {
    if (loadingRef.current || modelsLoaded) return;
    loadingRef.current = true;
    try {
      setStatusMessage('Memuat model AI (Tiny Face Detector + Face Recognition)...');
      const faceapi = window.faceapi;

      await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
      await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
      await faceapi.nets.faceRecognitionNet.loadFromUri('/models');

      setModelsLoaded(true);

      // Auto-start scan if there are unscanned photos
      if (initialPhotos.filter(p => !(new Set((event.indexedPhotos || []).map(x => x.id))).has(p.id)).length > 0) {
        setStatusMessage('✅ Model siap. Memulai pemindaian otomatis...');
        setTimeout(() => startScan(), 800);
      } else {
        setStatusMessage('✅ Seluruh foto telah terindeks. Siap untuk scan ulang jika diperlukan.');
      }
    } catch (error) {
      console.error('Gagal memuat model:', error);
      setStatusMessage('❌ Gagal memuat model AI: ' + error.message);
      loadingRef.current = false;
    }
  };

  const startScan = useCallback(async () => {
    const faceapi = window.faceapi;
    if (!faceapi || !faceapi.nets.tinyFaceDetector.params) return;

    setIsScanning(true);
    stopRef.current = false;
    setEta('');

    const scanStartTime = Date.now();
    let processedThisSession = 0;

    // Use live unscanned list at call time
    const currentIndexedIds = new Set((event.indexedPhotos || []).map(p => p.id));
    const sessionIndexed = [];

    const toScan = initialPhotos.filter(p => !currentIndexedIds.has(p.id));

    const detectorOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 608,       // 160, 224, 320, 416, 608 — higher = more accurate, slower
      scoreThreshold: 0.35, // lower = catch more faces (default 0.5)
    });

    let batch = [];
    let processedCount = 0;

    for (let i = currentIndexRef.current; i < toScan.length; i++) {
      if (stopRef.current) {
        setStatusMessage('⏸️ Pemindaian dijeda. Klik "Lanjutkan Scan" untuk melanjutkan.');
        setIsScanning(false);
        setEta('');
        return;
      }

      const photo = toScan[i];
      processedCount = i + 1;
      setCurrentIndex(processedCount);

      setStatusMessage(`📷 Memindai (${processedCount}/${toScan.length}): ${photo.name}...`);

      try {
        const proxyUrl = `/api/proxy-image?id=${photo.id}&sz=w400`;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = proxyUrl;

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('Gagal memuat gambar dari Drive proxy'));
        });

        const detections = await faceapi
          .detectAllFaces(img, detectorOptions)
          .withFaceLandmarks()
          .withFaceDescriptors();

        const faceDescriptors = detections.map(d => Array.from(d.descriptor));

        const indexedPhoto = {
          id: photo.id,
          name: photo.name,
          thumbnailLink: photo.thumbnailLink,
          webContentLink: photo.webContentLink,
          faceDescriptors,
        };

        batch.push(indexedPhoto);
        sessionIndexed.push(indexedPhoto);
        setIndexedPhotos(prev => [...prev, indexedPhoto]);

        setScanResults(prev => [
          {
            id: photo.id,
            name: photo.name,
            facesCount: faceDescriptors.length,
            status: 'success',
          },
          ...prev.slice(0, 29),
        ]);

        // Save batch every 5 photos or at end
        if (batch.length >= 5 || i === toScan.length - 1) {
          const res = await fetch('/api/index-photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: event._id, photos: batch }),
          });
          if (!res.ok) throw new Error('Gagal menyimpan hasil scan ke database');
          batch = [];
        }

        currentIndexRef.current = i + 1;
      } catch (err) {
        console.error(`Gagal scan ${photo.name}:`, err);
        setScanResults(prev => [
          {
            id: photo.id,
            name: photo.name,
            facesCount: 0,
            status: 'failed',
            error: err.message,
          },
          ...prev.slice(0, 29),
        ]);
      }

      // Hitung ETA setelah memproses tiap gambar
      processedThisSession++;
      const elapsedMs = Date.now() - scanStartTime;
      const averageMsPerPhoto = elapsedMs / processedThisSession;
      const remainingPhotosCount = toScan.length - processedCount;
      const remainingMs = remainingPhotosCount * averageMsPerPhoto;
      setEta(formatDuration(remainingMs / 1000));
    }

    if (!stopRef.current) {
      setIsScanning(false);
      currentIndexRef.current = 0;
      setEta('');
      setStatusMessage('🎉 Selesai! Seluruh foto berhasil dipindai dan disimpan.');
    }
  }, [event._id, initialPhotos]);

  const handleStartScan = () => {
    startScan();
  };

  const handlePauseScan = () => {
    stopRef.current = true;
    setIsScanning(false);
    setEta('');
  };

  const handleResetIndex = async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus seluruh indeks wajah untuk event ini? Anda harus melakukan scan dari awal lagi.')) return;
    setStatusMessage('Mereset indeks wajah di database...');
    try {
      const res = await fetch('/api/index-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event._id, photos: [], reset: true }),
      });
      if (res.ok) {
        setIndexedPhotos([]);
        currentIndexRef.current = 0;
        setScanResults([]);
        setStatusMessage('🗑️ Indeks direset. Pemindaian akan dimulai ulang otomatis...');
        setTimeout(() => startScan(), 800);
      } else {
        alert('Gagal mereset indeks wajah.');
      }
    } catch (err) {
      console.error(err);
      alert('Error saat mereset indeks.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Script
        src="/js/face-api.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />

      {/* Control Panel */}
      <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6 self-start">
        <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-3">
          📊 Status Indeks Wajah
        </h3>

        <div className="space-y-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500 font-medium">Total Foto di Drive:</span>
            <span className="font-bold text-slate-800">{totalPhotos} Foto</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500 font-medium">Telah Dipindai (DB):</span>
            <span className="font-bold text-emerald-600">{alreadyIndexed} Foto</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500 font-medium">Belum Dipindai:</span>
            <span className="font-bold text-amber-600">{unscannedPhotos.length} Foto</span>
          </div>
          {isScanning && eta && (
            <div className="flex justify-between items-center text-sm bg-blue-50/50 border border-blue-100 rounded-lg px-2.5 py-1.5 mt-1 transition-all duration-300">
              <span className="text-blue-700 font-medium">Estimasi Waktu:</span>
              <span className="font-bold text-blue-800 animate-pulse">{eta} tersisa</span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-semibold">Progres Pemindaian</span>
            <span className="font-bold text-slate-700">{percentIndexed}%</span>
          </div>
          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full transition-all duration-500 ease-out"
              style={{ width: `${percentIndexed}%` }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 space-y-3">
          {isScanning ? (
            <button
              onClick={handlePauseScan}
              className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <Pause size={16} /> Jeda Pemindaian
            </button>
          ) : (
            <button
              onClick={handleStartScan}
              disabled={!modelsLoaded || isComplete}
              className={`w-full py-2.5 px-4 font-bold text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors ${
                !modelsLoaded || isComplete
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 shadow-none'
                  : 'bg-emerald-700 hover:bg-emerald-600 text-white'
              }`}
            >
              <Play size={16} /> {currentIndexRef.current > 0 ? 'Lanjutkan Scan' : 'Mulai Scan Foto'}
            </button>
          )}

          <button
            onClick={handleResetIndex}
            className="w-full py-2 px-4 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs sm:text-sm rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCw size={14} /> Reset &amp; Scan Ulang
          </button>
        </div>

        {/* Live scanning status box */}
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5">
          <p className="text-xs text-slate-500 font-medium font-mono truncate">{statusMessage}</p>
        </div>

        {/* Technical Config */}
        <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 space-y-1">
          <div className="font-semibold text-slate-500 flex items-center gap-1">⚙️ Konfigurasi Model AI</div>
          <div>Detektor: Tiny Face Detector</div>
          <div>Input Size: 608px (Akurasi Tinggi)</div>
          <div>Score Threshold: 0.35 (Sensitif)</div>
          <div>Descriptor: 128-D Face Recognition Net</div>
        </div>
      </div>

      {/* Activity Log */}
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col min-h-[400px]">
        <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
          🖥️ Aktivitas Pemindaian Wajah
        </h3>

        {scanResults.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center text-slate-400 py-12">
            <ImageIcon size={48} className="text-slate-200 mb-3 animate-pulse" />
            <p className="text-sm font-semibold text-slate-500">Menunggu pemindaian dimulai...</p>
            <p className="text-xs text-slate-400 mt-1">Pemindaian akan mulai otomatis setelah model AI siap.</p>
          </div>
        ) : (
          <div className="flex-grow overflow-y-auto space-y-2 max-h-[500px] pr-1">
            {scanResults.map((res, index) => (
              <div
                key={res.id + '-' + index}
                className={`p-3 rounded-lg border text-xs flex justify-between items-center transition-all ${
                  res.status === 'success'
                    ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800'
                    : 'bg-red-50/50 border-red-100 text-red-800'
                }`}
              >
                <div className="min-w-0 flex-grow pr-4">
                  <div className="font-semibold truncate">{res.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-mono">ID: {res.id}</div>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  {res.status === 'success' ? (
                    <>
                      <span className="font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px]">
                        👤 {res.facesCount} Wajah
                      </span>
                      <CheckCircle size={14} className="text-emerald-600" />
                    </>
                  ) : (
                    <>
                      <span className="font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-[10px]" title={res.error}>
                        Gagal
                      </span>
                      <AlertCircle size={14} className="text-red-600" />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
