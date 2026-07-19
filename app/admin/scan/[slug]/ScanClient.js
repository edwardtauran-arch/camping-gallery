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
  const hasFaceEnabled = event.enableFaceSearch !== false;
  const hasBibEnabled = event.enableBibSearch !== false;

  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Memuat library Face-API...');
  const [eta, setEta] = useState('');

  // Scanned photo IDs from database
  const [indexedPhotos, setIndexedPhotos] = useState(event.indexedPhotos || []);

  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [activeScanType, setActiveScanType] = useState(null); // 'face' | 'bib' | null
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

  const totalPhotos = initialPhotos.length;

  // Derived: Face index stats
  const unscannedFacePhotos = initialPhotos.filter(p => {
    const dbPhoto = indexedPhotos.find(ip => ip.id === p.id);
    return !dbPhoto;
  });
  const faceIndexedCount = initialPhotos.filter(p => indexedPhotos.some(ip => ip.id === p.id)).length;
  const percentFaceIndexed = totalPhotos > 0 ? Math.round((faceIndexedCount / totalPhotos) * 100) : 0;

  // Derived: BIB index stats
  const unscannedBibPhotos = initialPhotos.filter(p => {
    const dbPhoto = indexedPhotos.find(ip => ip.id === p.id);
    return !dbPhoto || !dbPhoto.ocr;
  });
  const bibIndexedCount = initialPhotos.filter(p => {
    const dbPhoto = indexedPhotos.find(ip => ip.id === p.id);
    return dbPhoto && dbPhoto.ocr === true;
  }).length;
  const percentBibIndexed = totalPhotos > 0 ? Math.round((bibIndexedCount / totalPhotos) * 100) : 0;
  const isComplete = unscannedBibPhotos.length === 0 && totalPhotos > 0;

  // On mount, check if faceapi is already loaded globally by layout
  useEffect(() => {
    if (typeof window !== 'undefined' && window.faceapi) {
      setScriptLoaded(true);
    }
  }, []);

  // Load models once script is ready
  useEffect(() => {
    if (!hasFaceEnabled) {
      setModelsLoaded(true);
      
      const hasUnscannedBib = hasBibEnabled && initialPhotos.some(p => {
        const dbPhoto = (event.indexedPhotos || []).find(x => x.id === p.id);
        return !dbPhoto || !dbPhoto.ocr;
      });

      if (hasUnscannedBib) {
        setStatusMessage('✅ Memulai pemindaian BIB otomatis...');
        setTimeout(() => { setActiveScanType('bib'); startScan('bib'); }, 800);
      } else {
        setStatusMessage('✅ Seluruh foto telah terindeks. Siap untuk scan ulang jika diperlukan.');
      }
      return;
    }

    if (scriptLoaded && !modelsLoaded && !loadingRef.current) {
      loadModels();
    }
  }, [scriptLoaded, modelsLoaded, hasFaceEnabled, hasBibEnabled]);

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

      // Auto-start scan if there are unscanned photos (missing face index or BIB index)
      const hasFaceEnabled = event.enableFaceSearch !== false;
      const hasBibEnabled = event.enableBibSearch !== false;

      const hasUnscannedFace = hasFaceEnabled && initialPhotos.some(p => {
        const dbPhoto = (event.indexedPhotos || []).find(x => x.id === p.id);
        return !dbPhoto;
      });
      const hasUnscannedBib = hasBibEnabled && initialPhotos.some(p => {
        const dbPhoto = (event.indexedPhotos || []).find(x => x.id === p.id);
        return !dbPhoto || !dbPhoto.ocr;
      });

      if (hasUnscannedFace) {
        setStatusMessage('✅ Model siap. Memulai pemindaian Wajah otomatis...');
        setTimeout(() => { setActiveScanType('face'); startScan('face'); }, 800);
      } else if (hasUnscannedBib) {
        setStatusMessage('✅ Model siap. Memulai pembaruan indeks BIB otomatis...');
        setTimeout(() => { setActiveScanType('bib'); startScan('bib'); }, 800);
      } else {
        setStatusMessage('✅ Seluruh foto telah terindeks. Siap untuk scan ulang jika diperlukan.');
      }
    } catch (error) {
      console.error('Gagal memuat model:', error);
      setStatusMessage('❌ Gagal memuat model AI: ' + error.message);
      loadingRef.current = false;
    }
  };

  const startScan = useCallback(async (type) => {
    const faceapi = window.faceapi;
    if (type === 'face' && (!faceapi || !faceapi.nets.tinyFaceDetector.params)) {
      return;
    }

    setIsScanning(true);
    stopRef.current = false;
    setEta('');

    const scanStartTime = Date.now();
    let processedThisSession = 0;

    // Use live unscanned list at call time
    const currentIndexedMap = new Map((event.indexedPhotos || []).map(p => [p.id, p]));
    const sessionIndexed = [];

    const toScan = initialPhotos.filter(p => {
      const dbPhoto = currentIndexedMap.get(p.id);
      if (type === 'face') {
        return !dbPhoto;
      } else {
        return !dbPhoto || !dbPhoto.ocr;
      }
    });

    const totalIndexedBefore = initialPhotos.length - toScan.length;

    const detectorSize = 608;
    const detectorOptions = type === 'face' ? new faceapi.TinyFaceDetectorOptions({
      inputSize: detectorSize,
      scoreThreshold: 0.35,
    }) : null;

    const CONCURRENCY = type === 'bib' ? 5 : 1;
    let batchToSave = [];
    let processedCount = 0;

    for (let i = currentIndexRef.current; i < toScan.length; i += CONCURRENCY) {
      if (stopRef.current) {
        setStatusMessage('⏸️ Pemindaian dijeda. Klik "Lanjutkan Scan" untuk melanjutkan.');
        setIsScanning(false);
        setEta('');
        return;
      }

      const currentChunk = toScan.slice(i, i + CONCURRENCY);
      const startAbsolute = totalIndexedBefore + i + 1;
      const endAbsolute = totalIndexedBefore + i + currentChunk.length;
      
      setStatusMessage(`📷 [Scan ${type === 'face' ? 'Wajah' : 'BIB'}] Memproses Batch (${startAbsolute}-${endAbsolute}/${totalPhotos})...`);

      const chunkResults = await Promise.all(currentChunk.map(async (photo) => {
        try {
          let faceDescriptors = [];
          let bibs = [];
          const dbPhoto = currentIndexedMap.get(photo.id);
          const existingBibs = dbPhoto?.bibs || [];
          const existingOcr = dbPhoto?.ocr || false;
          let isOcrDone = existingOcr;

          if (type === 'bib') {
            let attempt = 0;
            let success = false;
            let lastError = null;

            while (attempt < 5 && !success) {
              if (stopRef.current) throw new Error('Dibatalkan pengguna');
              
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

              if (res.status === 429) {
                attempt++;
                lastError = new Error('Terlalu banyak request. API Google menolak.');
                // Exponential backoff dengan jitter: 15s, 30s, 60s
                const baseDelay = 15000 * Math.pow(2, attempt - 1);
                const jitter = Math.random() * 5000; 
                const delayMs = baseDelay + jitter;
                
                setStatusMessage(`⏳ Limit API Google tercapai. Menunggu ${Math.round(delayMs/1000)} detik sebelum mengulang ${photo.name}...`);
                await new Promise(r => setTimeout(r, delayMs));
                continue;
              }

              if (!res.ok) throw new Error(`Gagal memproses BIB di backend: ${res.statusText}`);
              const result = await res.json();
              if (!result.success) throw new Error(result.error || 'Gagal memproses BIB di backend');
              
              bibs = result.data;
              isOcrDone = true;
              faceDescriptors = dbPhoto?.faceDescriptors || [];
              success = true;
            }

            if (!success) throw lastError || new Error('Gagal scan setelah beberapa percobaan.');
          } else {
            const proxyUrl = `/api/proxy-image?id=${photo.id}&sz=w800`;
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
            faceDescriptors = detections.map(d => Array.from(d.descriptor));
            bibs = existingBibs;
            isOcrDone = existingOcr;
          }

          return {
            success: true,
            photo,
            indexedPhoto: {
              id: photo.id,
              name: photo.name,
              thumbnailLink: photo.thumbnailLink,
              webContentLink: photo.webContentLink,
              faceDescriptors,
              bibs,
              ocr: isOcrDone,
            },
            facesCount: type === 'face' ? faceDescriptors.length : (dbPhoto?.faceDescriptors?.length || 0),
          };
        } catch (err) {
          return { success: false, photo, error: err.message };
        }
      }));

      // Process chunk results
      const newScanResults = [];
      const successfulPhotos = [];

      for (const res of chunkResults) {
        if (res.success) {
          batchToSave.push(res.indexedPhoto);
          sessionIndexed.push(res.indexedPhoto);
          successfulPhotos.push(res.indexedPhoto);
          newScanResults.push({
            id: res.photo.id,
            name: res.photo.name,
            facesCount: res.facesCount,
            bibsCount: res.indexedPhoto.bibs.length,
            bibsList: res.indexedPhoto.bibs,
            status: 'success',
          });
        } else {
          newScanResults.push({
            id: res.photo.id,
            name: res.photo.name,
            facesCount: 0,
            status: 'failed',
            error: res.error,
          });
        }
      }

      setIndexedPhotos(prev => {
        const updated = [...prev];
        for (const photo of successfulPhotos) {
          const idx = updated.findIndex(x => x.id === photo.id);
          if (idx > -1) {
            updated[idx] = photo;
          } else {
            updated.push(photo);
          }
        }
        return updated;
      });

      setScanResults(prev => [...newScanResults.reverse(), ...prev].slice(0, 30));

      processedCount += currentChunk.length;
      currentIndexRef.current = i + currentChunk.length;
      setCurrentIndex(processedCount);

      // Save batch to database
      if (batchToSave.length >= 5 || i + CONCURRENCY >= toScan.length) {
        try {
          const res = await fetch('/api/index-photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: event._id, photos: batchToSave }),
          });
          if (!res.ok) console.error('Gagal menyimpan hasil scan ke database');
        } finally {
          batchToSave = [];
        }
      }

      // Calculate ETA
      processedThisSession += currentChunk.length;
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
      setStatusMessage(`🎉 Selesai! Seluruh pemindaian ${type === 'face' ? 'Wajah' : 'BIB'} berhasil diproses.`);
      setActiveScanType(null);
    }


  }, [event._id, initialPhotos]);

  const handleStartScan = (type) => {
    setActiveScanType(type);
    startScan(type);
  };

  const handlePauseScan = () => {
    stopRef.current = true;
    setIsScanning(false);
    setEta('');
    setActiveScanType(null);
  };

  const handleResetFaceIndex = async () => {
    if (typeof window === 'undefined') return;
    const ok = window.confirm('Apakah Anda yakin ingin menghapus data indeks wajah untuk event ini? (Data BIB akan tetap aman.)');
    if (!ok) return;
    
    setStatusMessage('Mereset indeks wajah di database...');
    console.log('[ScanClient] Resetting face indexes...');
    try {
      const res = await fetch('/api/index-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event._id, resetFace: true }),
      });
      if (res.ok) {
        // Reset local state: clear faceDescriptors for all photos
        setIndexedPhotos(prev => prev.map(p => ({ ...p, faceDescriptors: [] })));
        currentIndexRef.current = 0;
        setScanResults([]);
        setStatusMessage('🔄 Indeks wajah direset. Klik Scan Wajah AI untuk proses ulang.');
      } else {
        const text = await res.text();
        console.error('[ScanClient] Reset face failed:', text);
        alert('Gagal mereset indeks wajah: ' + text);
      }
    } catch (err) {
      console.error('[ScanClient] Reset face error:', err);
      alert('Error saat mereset indeks wajah: ' + err.message);
    }
  };

  const handleResetBibIndex = async () => {
    if (typeof window === 'undefined') return;
    const ok = window.confirm('Reset semua data BIB? (Face descriptors aman, hanya BIB yang dihapus dan bisa scan ulang.)');
    if (!ok) return;

    setStatusMessage('Mereset data BIB di database...');
    console.log('[ScanClient] Resetting BIB indexes for event:', event._id);
    try {
      const res = await fetch('/api/index-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event._id, resetBib: true }),
      });
      if (res.ok) {
        // Reset local state: mark all photos as ocr=false
        setIndexedPhotos(prev => prev.map(p => ({ ...p, ocr: false, bibs: [] })));
        currentIndexRef.current = 0;
        setScanResults([]);
        setStatusMessage('🔄 Indeks BIB direset. Klik Scan Nomor BIB untuk proses ulang dengan algoritma baru.');
      } else {
        const text = await res.text();
        console.error('[ScanClient] Reset BIB failed:', text);
        alert('Gagal mereset indeks BIB: ' + text);
      }
    } catch (err) {
      console.error('[ScanClient] Reset BIB error:', err);
      alert('Error saat mereset indeks BIB: ' + err.message);
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
          📊 Status Indeks Galeri
        </h3>

        <div className="space-y-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500 font-medium">Total Foto di Drive:</span>
            <span className="font-bold text-slate-800">{totalPhotos} Foto</span>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-3">
            {/* Face Stats */}
            {hasFaceEnabled && (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold flex items-center gap-1">👤 Indeks Wajah ({faceIndexedCount}/{totalPhotos})</span>
                  <span className="font-bold text-slate-700">{percentFaceIndexed}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full transition-all duration-500 ease-out"
                    style={{ width: `${percentFaceIndexed}%` }}
                  />
                </div>
              </div>
            )}

            {/* BIB Stats */}
            {hasBibEnabled && (
              <div className="space-y-1 pt-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold flex items-center gap-1">🔢 Indeks BIB ({bibIndexedCount}/{totalPhotos})</span>
                  <span className="font-bold text-slate-700">{percentBibIndexed}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full transition-all duration-500 ease-out"
                    style={{ width: `${percentBibIndexed}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {isScanning && eta && (
            <div className="flex justify-between items-center text-sm bg-blue-50/50 border border-blue-100 rounded-lg px-2.5 py-1.5 mt-1 transition-all duration-300">
              <span className="text-blue-700 font-medium">Estimasi Waktu:</span>
              <span className="font-bold text-blue-800 animate-pulse">{eta} tersisa</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="pt-2 space-y-3">
          {isScanning ? (
            <button
              onClick={handlePauseScan}
              className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors animate-pulse"
            >
              <Pause size={16} /> Jeda Scan ({activeScanType === 'face' ? 'Wajah' : 'BIB'})
            </button>
          ) : (
            <div className="flex flex-col gap-2.5">
              {hasFaceEnabled && (
                <button
                  onClick={() => handleStartScan('face')}
                  disabled={!modelsLoaded || unscannedFacePhotos.length === 0}
                  className={`w-full py-2.5 px-4 font-bold text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors ${
                    !modelsLoaded || unscannedFacePhotos.length === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                      : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                  }`}
                >
                  <Play size={16} /> Scan Wajah AI ({unscannedFacePhotos.length} foto)
                </button>
              )}

              {hasBibEnabled && (
                <button
                  onClick={() => handleStartScan('bib')}
                  disabled={!modelsLoaded || unscannedBibPhotos.length === 0}
                  className={`w-full py-2.5 px-4 font-bold text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors ${
                    !modelsLoaded || unscannedBibPhotos.length === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                      : 'bg-indigo-700 hover:bg-indigo-600 text-white'
                  }`}
                >
                  <Play size={16} /> Scan Nomor BIB ({unscannedBibPhotos.length} foto)
                </button>
              )}
            </div>
          )}

          {/* Reset BIB only button */}
          {hasBibEnabled && (
            <button
              onClick={handleResetBibIndex}
              disabled={isScanning}
              className="w-full py-2 px-4 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-600 font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={13} /> Reset Indeks BIB Saja
            </button>
          )}
 
          {/* Reset Face only button */}
          {hasFaceEnabled && (
            <button
              onClick={handleResetFaceIndex}
              disabled={isScanning}
              className="w-full py-2 px-4 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs sm:text-sm rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw size={14} /> Reset Indeks Wajah Saja
            </button>
          )}
        </div>

        {/* Live scanning status box */}
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5">
          <p className="text-xs text-slate-500 font-medium font-mono truncate">{statusMessage}</p>
        </div>

        {/* Technical Config */}
        <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 space-y-1">
          <div className="font-semibold text-slate-500 flex items-center gap-1">⚙️ Konfigurasi Model AI</div>
          {hasFaceEnabled && <div>Detektor: Tiny Face Detector (Input 608px)</div>}
          {hasFaceEnabled && <div>Pengenalan Wajah: 128-D Face Recognition</div>}
          {hasBibEnabled && <div>Deteksi BIB: Google Gemini Flash-Lite API</div>}
          <div>Resolusi: {hasBibEnabled ? 'BIB: 1600px' : ''} {hasFaceEnabled && hasBibEnabled ? ' | ' : ''} {hasFaceEnabled ? 'Wajah: 800px' : ''}</div>
        </div>
      </div>

      {/* Activity Log */}
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col min-h-[400px]">
        <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
          🖥️ Log Aktivitas Pemindaian
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
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {hasFaceEnabled && (
                        <span className="font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px]">
                          👤 {res.facesCount} Wajah
                        </span>
                      )}
                      {res.bibsList && res.bibsList.length > 0 && (
                        <span className="font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-[10px]">
                          🔢 BIB: {res.bibsList.join(', ')}
                        </span>
                      )}
                      <CheckCircle size={14} className="text-emerald-600" />
                    </div>
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
