'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Script from 'next/script';
import { Play, Pause, RefreshCw, CheckCircle, AlertCircle, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';

export default function ScanClient({ event, initialPhotos }) {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Memuat library Face-API...');

  // Scanned photo IDs from database
  const [indexedPhotos, setIndexedPhotos] = useState(event.indexedPhotos || []);

  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scanResults, setScanResults] = useState([]);

  const stopRef = useRef(false);
  const loadingRef = useRef(false);
  const currentIndexRef = useRef(0);

  // Derived: which photos still need scanning (recalculated from live indexedPhotos state)
  const indexedIds = new Set(indexedPhotos.map(p => p.id));
  const unscannedPhotos = initialPhotos.filter(p => !indexedIds.has(p.id));

  const totalPhotos = initialPhotos.length;
  const alreadyIndexed = indexedPhotos.length;
  const percentIndexed = totalPhotos > 0 ? Math.round((alreadyIndexed / totalPhotos) * 100) : 0;
  const isComplete = unscannedPhotos.length === 0 && totalPhotos > 0;

  // Load models once script is ready
  useEffect(() => {
    if (scriptLoaded && !modelsLoaded && !loadingRef.current) {
      loadModels();
    }
  }, [scriptLoaded]);

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

    // Use live unscanned list at call time
    const currentIndexedIds = new Set((event.indexedPhotos || []).map(p => p.id));
    // We use a ref-tracked version of already-indexed to accumulate during session
    const sessionIndexed = [];

    const toScan = initialPhotos.filter(p => !currentIndexedIds.has(p.id));

    // Options: larger inputSize = more accurate face detection
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
        return;
      }

      const photo = toScan[i];
      processedCount = i + 1;

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
          setIndexedPhotos(prev => [...prev, ...batch]);
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
    }

    if (!stopRef.current) {
      setIsScanning(false);
      currentIndexRef.current = 0;
      setStatusMessage('🎉 Selesai! Seluruh foto berhasil dipindai dan disimpan.');
    }
  }, [event._id, initialPhotos]);

  const handleStartScan = () => {
    startScan();
  };

  const handlePauseScan = () => {
    stopRef.current = true;
    setIsScanning(false);
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
        strategy="lazyOnload"
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
        <div className="space-y-3 pt-2">
          {isScanning ? (
            <button
              onClick={handlePauseScan}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Pause size={18} /> Jeda Pemindaian
            </button>
          ) : (
            <button
              onClick={handleStartScan}
              disabled={!modelsLoaded || unscannedPhotos.length === 0}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer disabled:cursor-not-allowed"
            >
              <Play size={18} />
              {isComplete ? 'Semua Sudah Terindeks' : currentIndexRef.current > 0 ? 'Lanjutkan Scan' : 'Mulai Scan Foto'}
            </button>
          )}

          {alreadyIndexed > 0 && !isScanning && (
            <button
              onClick={handleResetIndex}
              className="w-full bg-white border border-red-200 text-red-600 hover:bg-red-50 font-semibold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
            >
              <RefreshCw size={14} /> Reset &amp; Scan Ulang
            </button>
          )}
        </div>

        {/* Status Log */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs font-mono text-slate-600 min-h-[64px] flex items-start">
          <span className="leading-relaxed">{statusMessage}</span>
        </div>

        {/* Model Info */}
        <div className="border-t border-slate-100 pt-3 space-y-1 text-[11px] text-slate-400">
          <p className="font-semibold text-slate-500">⚙️ Konfigurasi Model AI</p>
          <p>Detektor: Tiny Face Detector</p>
          <p>Input Size: 608px (Akurasi Tinggi)</p>
          <p>Score Threshold: 0.35 (Sensitif)</p>
          <p>Descriptor: 128-D Face Recognition Net</p>
        </div>
      </div>

      {/* Scan Monitor */}
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col min-h-[500px]">
        <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-3 mb-4">
          🖥️ Aktivitas Pemindaian Wajah
        </h3>

        {scanResults.length === 0 ? (
          <div className="flex-grow flex flex-col justify-center items-center text-slate-400 py-12">
            <ImageIcon size={48} className="stroke-1 mb-3 text-slate-300" />
            {modelsLoaded && unscannedPhotos.length === 0 ? (
              <>
                <p className="text-sm font-medium text-emerald-600">✅ Semua foto telah terindeks.</p>
                <p className="text-xs text-slate-400 mt-1">Gunakan Reset untuk memindai ulang semua foto.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Menunggu pemindaian dimulai...</p>
                <p className="text-xs text-slate-400 mt-1">Pemindaian akan mulai otomatis setelah model AI siap.</p>
              </>
            )}
          </div>
        ) : (
          <div className="flex-grow overflow-y-auto max-h-[540px] pr-2 space-y-2">
            {scanResults.map((result, idx) => (
              <div
                key={`${result.id}-${idx}`}
                className={`flex justify-between items-center p-3 rounded-lg border text-sm transition-all ${
                  idx === 0
                    ? 'bg-emerald-50/50 border-emerald-200 ring-1 ring-emerald-200'
                    : 'bg-slate-50/50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 truncate max-w-[65%]">
                  <div className="w-10 h-10 rounded-lg bg-slate-200 border border-slate-300 overflow-hidden flex-shrink-0">
                    <img
                      src={`/api/proxy-image?id=${result.id}&sz=w80`}
                      alt="preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="font-mono text-xs text-slate-700 truncate font-medium" title={result.name}>
                    {result.name}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {result.status === 'success' ? (
                    <>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                        result.facesCount > 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {result.facesCount > 0 ? `${result.facesCount} Wajah` : 'Tanpa Wajah'}
                      </span>
                      <CheckCircle size={15} className="text-emerald-500" />
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-1 rounded-full" title={result.error}>
                        Gagal
                      </span>
                      <AlertCircle size={15} className="text-red-500" />
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
