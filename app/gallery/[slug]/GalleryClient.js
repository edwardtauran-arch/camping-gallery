'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, ChevronLeft, ChevronRight, Camera, Upload, User, Sparkles, AlertCircle, SlidersHorizontal, EyeOff } from 'lucide-react';
import Script from 'next/script';
import Link from 'next/link';

// Threshold labels
const THRESHOLD_LABELS = {
  0.35: { label: 'Sangat Ketat', desc: 'Hanya wajah yang sangat mirip', color: 'text-blue-600' },
  0.45: { label: 'Ketat', desc: 'Mirip & yakin', color: 'text-indigo-600' },
  0.55: { label: 'Sedang', desc: 'Keseimbangan akurasi & cakupan', color: 'text-emerald-600' },
  0.65: { label: 'Longgar', desc: 'Tangkap lebih banyak foto', color: 'text-amber-600' },
  0.75: { label: 'Sangat Longgar', desc: 'Tangkap semua yang mungkin cocok', color: 'text-orange-600' },
};

function getThresholdInfo(val) {
  const keys = Object.keys(THRESHOLD_LABELS).map(Number).sort((a, b) => a - b);
  let closest = keys[0];
  for (const k of keys) {
    if (Math.abs(k - val) < Math.abs(closest - val)) closest = k;
  }
  return THRESHOLD_LABELS[closest] || THRESHOLD_LABELS[0.55];
}

export default function GalleryClient({ photos, event, isPrivate = false }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // Private mode UI block
  if (isPrivate) {
    return (
      <div className="relative mt-4">
        {/* Blurred dummy skeleton grid to simulate the page content */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4 filter blur-md select-none pointer-events-none opacity-40">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="aspect-square bg-slate-200 rounded-lg border border-slate-200" />
          ))}
        </div>

        {/* Persistent Modal Overlay with no close button */}
        <div className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-100 animate-pulse">
              <EyeOff size={32} />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-extrabold text-slate-800 text-lg">Foto Tidak Tersedia</h3>
              <p className="text-slate-500 text-xs leading-relaxed">
                Galeri foto ini telah disembunyikan oleh administrator dan tidak dapat diakses oleh publik.
              </p>
            </div>
            <div className="pt-2">
              <Link href="/" className="inline-block bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition-colors shadow">
                Kembali ke Beranda
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [photosPerPage, setPhotosPerPage] = useState(20);

  // Face Recognition State
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [faceapiError, setFaceapiError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [faceMatching, setFaceMatching] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Threshold state (Euclidean distance — lower = stricter)
  const [threshold, setThreshold] = useState(0.55);

  // Stored user descriptor for re-matching when threshold changes
  const [userDescriptor, setUserDescriptor] = useState(null);
  const [allScores, setAllScores] = useState({}); // id -> minDistance

  // Search results filter
  const [matchedPhotoIds, setMatchedPhotoIds] = useState(null);
  const [matchingScores, setMatchingScores] = useState({});

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [stream, setStream] = useState(null);
  const modelsLoadedRef = useRef(false);

  // Re-apply matching when threshold changes
  useEffect(() => {
    if (userDescriptor && Object.keys(allScores).length > 0) {
      applyThreshold(allScores, threshold);
    }
  }, [threshold]);

  // Pagination reset
  useEffect(() => {
    setCurrentPage(1);
  }, [photos.length, photosPerPage, matchedPhotoIds]);

  // Camera cleanup
  useEffect(() => {
    if (!searchModalOpen) {
      stopCamera();
      setFaceapiError('');
    }
  }, [searchModalOpen]);

  // Apply threshold filtering using cached scores
  const applyThreshold = (scores, thresh) => {
    const matches = [];
    const filteredScores = {};
    for (const [id, dist] of Object.entries(scores)) {
      if (dist < thresh) {
        matches.push(id);
        filteredScores[id] = dist;
      }
    }
    if (matches.length === 0) {
      setFaceapiError(`Tidak ditemukan foto yang cocok pada tingkat kecocokan ini. Coba geser ke tingkat "Longgar".`);
      setMatchedPhotoIds(new Set());
      setMatchingScores({});
    } else {
      setFaceapiError('');
      setMatchedPhotoIds(new Set(matches));
      setMatchingScores(filteredScores);
    }
  };

  // Filter & sort
  const filteredPhotos = matchedPhotoIds
    ? photos
        .filter(p => matchedPhotoIds.has(p.id))
        .sort((a, b) => (allScores[a.id] ?? 1.0) - (allScores[b.id] ?? 1.0))
    : photos;

  const indexOfLastPhoto = currentPage * photosPerPage;
  const indexOfFirstPhoto = indexOfLastPhoto - photosPerPage;
  const currentPhotos = filteredPhotos.slice(indexOfFirstPhoto, indexOfLastPhoto);
  const totalPages = Math.ceil(filteredPhotos.length / photosPerPage);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Truncated pagination: 1 2 3 ... last
  const getPageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [];
    // Always show first page
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    // Pages around current
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    // Always show last page
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  };

  // Camera
  const startCamera = async () => {
    try {
      setCameraActive(true);
      setFaceapiError('');
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch (err) {
      setFaceapiError('Gagal mengakses kamera. Silakan pilih metode Unggah Foto.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const v = videoRef.current;
      const c = canvasRef.current;
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext('2d');
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(v, 0, 0);
      const dataUrl = c.toDataURL('image/jpeg', 0.92);
      stopCamera();
      processFaceMatching(dataUrl);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => processFaceMatching(ev.target?.result);
    reader.readAsDataURL(file);
  };

  // Load models helper
  const ensureModelsLoaded = async (faceapi) => {
    if (modelsLoadedRef.current) return;
    setStatusMessage('Memuat model AI...');
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
    modelsLoadedRef.current = true;
  };

  // Main matching logic
  const processFaceMatching = async (dataUrl) => {
    setFaceMatching(true);
    setFaceapiError('');
    setMatchedPhotoIds(null);
    setMatchingScores({});
    setAllScores({});
    setUserDescriptor(null);

    try {
      const faceapi = window.faceapi;
      if (!faceapi) throw new Error('Library Face-API belum siap. Coba lagi dalam beberapa detik.');

      await ensureModelsLoaded(faceapi);
      setStatusMessage('Mendeteksi wajah Anda...');

      const img = new Image();
      img.src = dataUrl;
      await new Promise(res => { img.onload = res; });

      // Use multiple detections to find the largest/most confident face
      const detections = await faceapi
        .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.2, // very low — catch even partially visible faces in selfies
        }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (!detections || detections.length === 0) {
        throw new Error('Wajah tidak terdeteksi. Pastikan wajah terlihat jelas, pencahayaan cukup, dan foto tidak buram.');
      }

      // Pick the most confident detection (largest bounding box area)
      const best = detections.reduce((prev, curr) => {
        const areaP = prev.detection.box.width * prev.detection.box.height;
        const areaC = curr.detection.box.width * curr.detection.box.height;
        return areaC > areaP ? curr : prev;
      });

      const descriptor = best.descriptor;
      setUserDescriptor(descriptor);
      setStatusMessage(`Mencocokkan dengan ${(event?.indexedPhotos || []).length} foto terindeks...`);

      // Compute scores for ALL indexed photos
      const scores = {};
      for (const photo of (event?.indexedPhotos || [])) {
        if (!photo.faceDescriptors || photo.faceDescriptors.length === 0) continue;
        let minDist = Infinity;
        for (const desc of photo.faceDescriptors) {
          const d = faceapi.euclideanDistance(descriptor, new Float32Array(desc));
          if (d < minDist) minDist = d;
        }
        scores[photo.id] = minDist;
      }

      setAllScores(scores);
      applyThreshold(scores, threshold);
      setSearchModalOpen(false);
    } catch (err) {
      console.error(err);
      setFaceapiError(err.message || 'Terjadi kesalahan saat memproses gambar.');
    } finally {
      setFaceMatching(false);
      setStatusMessage('');
    }
  };

  const handleClearSearch = () => {
    setMatchedPhotoIds(null);
    setMatchingScores({});
    setAllScores({});
    setUserDescriptor(null);
    setCurrentPage(1);
  };

  const handleDownloadAll = () => {
    if (filteredPhotos.length === 0) return;
    if (confirm(`Unduh ${filteredPhotos.length} foto hasil pencarian wajah? Browser akan mengunduh satu per satu.`)) {
      filteredPhotos.forEach((photo, idx) => {
        setTimeout(() => {
          const a = document.createElement('a');
          a.href = photo.webContentLink;
          a.target = '_blank';
          a.download = photo.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, idx * 700);
      });
    }
  };

  const thresholdInfo = getThresholdInfo(threshold);
  const hasIndexedPhotos = event?.indexedPhotos && event.indexedPhotos.length > 0;

  return (
    <div className="space-y-6">
      <Script src="/js/face-api.js" strategy="lazyOnload" />

      {/* ── Threshold Control Bar (visible after search) ── */}
      {userDescriptor && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-sm space-y-2 sm:space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700">
              <SlidersHorizontal size={14} className="text-emerald-600 flex-shrink-0" />
              Tingkat Kecocokan Wajah
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-slate-100 ${thresholdInfo.color}`}>
                {thresholdInfo.label}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-400 hidden sm:inline">{thresholdInfo.desc}</span>
            </div>
          </div>

          {/* Slider */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-[10px] sm:text-xs text-slate-400 w-8 sm:w-10 text-right">Ketat</span>
            <input
              type="range"
              min={0.30}
              max={0.80}
              step={0.01}
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="flex-grow accent-emerald-600 cursor-pointer h-2"
            />
            <span className="text-[10px] sm:text-xs text-slate-400 w-10 sm:w-12">Longgar</span>
          </div>

          {/* Tick marks */}
          <div className="hidden sm:flex justify-between text-[9px] text-slate-300 font-semibold px-12">
            {Object.entries(THRESHOLD_LABELS).sort((a,b)=>a[0]-b[0]).map(([k, v]) => (
              <span
                key={k}
                className={`cursor-pointer ${Math.abs(parseFloat(k) - threshold) < 0.04 ? thresholdInfo.color + ' font-extrabold' : ''}`}
                onClick={() => setThreshold(parseFloat(k))}
              >
                {v.label.split(' ')[v.label.split(' ').length - 1]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Result Banner ── */}
      {matchedPhotoIds && (
        <div className={`border rounded-xl p-3 sm:p-4 flex flex-col gap-3 shadow-sm ${
          filteredPhotos.length > 0
            ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-400/40'
            : 'bg-amber-50/60 border-amber-200'
        }`}>
          <div className="flex items-start sm:items-center gap-2">
            <Sparkles size={16} className={`flex-shrink-0 mt-0.5 sm:mt-0 ${filteredPhotos.length > 0 ? 'text-emerald-700 animate-pulse' : 'text-amber-500'}`} />
            <div className={`text-xs sm:text-sm font-semibold ${filteredPhotos.length > 0 ? 'text-emerald-800' : 'text-amber-700'}`}>
              {filteredPhotos.length > 0
                ? <>Menemukan <span className="font-extrabold">{filteredPhotos.length}</span> foto cocok — geser slider untuk mengubah sensitivitas.</>
                : <>Tidak ditemukan foto. Coba geser slider ke arah <strong>Longgar</strong>.</>
              }
            </div>
          </div>
          <div className="flex gap-2">
            {filteredPhotos.length > 0 && (
              <button
                onClick={handleDownloadAll}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] sm:text-xs font-bold px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg shadow transition-colors"
              >
                <Download size={14} /> Unduh Semua
              </button>
            )}
            <button
              onClick={handleClearSearch}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] sm:text-xs font-bold px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg transition-colors"
            >
              Batal Cari
            </button>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3">
        {/* Row 1: Info + Search button */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="text-xs sm:text-sm text-slate-500">
            Menampilkan{' '}
            <span className="font-semibold text-slate-800">
              {filteredPhotos.length === 0 ? 0 : indexOfFirstPhoto + 1}–{Math.min(indexOfLastPhoto, filteredPhotos.length)}
            </span>{' '}
            dari <span className="font-semibold text-slate-800">{filteredPhotos.length}</span> foto
            {matchedPhotoIds && <span className="ml-1.5 text-[10px] sm:text-xs text-emerald-600 font-semibold">(difilter wajah)</span>}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {hasIndexedPhotos ? (
              <button
                onClick={() => setSearchModalOpen(true)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-3 sm:px-4 py-2 rounded-lg shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] text-[11px] sm:text-xs"
              >
                🔍 {userDescriptor ? 'Cari Ulang' : 'Cari Foto Saya (AI)'}
              </button>
            ) : (
              <div className="text-[10px] sm:text-[11px] text-slate-400 font-semibold bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg">
                ℹ️ Pencarian Wajah Belum Siap
              </div>
            )}

            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm text-[11px] sm:text-xs">
              <span className="hidden sm:inline">Tampilkan:</span>
              <select
                value={photosPerPage}
                onChange={(e) => { setPhotosPerPage(parseInt(e.target.value)); setCurrentPage(1); }}
                className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value={20}>20 Foto</option>
                <option value={30}>30 Foto</option>
                <option value={50}>50 Foto</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Photo Grid ── */}
      {filteredPhotos.length === 0 && matchedPhotoIds ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-xl flex flex-col items-center justify-center">
          <User size={40} className="text-slate-300 stroke-1 mb-2" />
          <p className="text-slate-500 font-medium text-sm">Tidak ada foto yang cocok pada tingkat kecocokan ini.</p>
          <p className="text-xs text-slate-400 mt-1">Coba geser slider ke arah "Longgar".</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
          {currentPhotos.map((photo) => {
            const dist = allScores[photo.id];
            const isMatch = matchedPhotoIds?.has(photo.id);
            // Score: map distance 0→100%, threshold→50%, beyond=excluded
            const scorePercent = isMatch && dist != null
              ? Math.min(99, Math.round(100 - (dist / threshold) * 50))
              : null;

            const badgeColor =
              scorePercent >= 85 ? 'bg-emerald-600/90' :
              scorePercent >= 70 ? 'bg-teal-600/90' :
              'bg-amber-500/90';

            return (
              <div
                key={photo.id}
                onClick={() => setSelectedPhoto(photo)}
                className={`group relative aspect-square bg-slate-200 rounded-lg overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 ${
                  isMatch ? 'border-2 border-emerald-400' : 'border border-slate-200'
                }`}
              >
                <img
                  src={`/api/proxy-image?id=${photo.id}&sz=w400`}
                  alt={photo.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />

                {isMatch && scorePercent !== null && (
                  <div className={`absolute top-1.5 left-1.5 ${badgeColor} text-white font-bold text-[9px] px-1.5 py-0.5 rounded-md shadow backdrop-blur-sm`}>
                    ✨ {scorePercent}%
                  </div>
                )}

                <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                  <span className="text-[10px] text-white bg-slate-900/60 px-2 py-0.5 rounded truncate w-full">{photo.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination (truncated) ── */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-1 sm:gap-2 pt-6 sm:pt-8 flex-wrap">
          <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}
            className="p-1.5 sm:p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors">
            <ChevronLeft size={14} className="sm:w-4 sm:h-4" />
          </button>
          {getPageNumbers().map((pageNum, idx) => (
            pageNum === '...' ? (
              <span key={`ellipsis-${idx}`} className="px-1.5 sm:px-2 text-xs sm:text-sm text-slate-400 font-medium select-none">…</span>
            ) : (
              <button key={pageNum} onClick={() => handlePageChange(pageNum)}
                className={`min-w-[32px] sm:min-w-[36px] px-2 sm:px-3.5 py-1 sm:py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
                  currentPage === pageNum ? 'bg-slate-900 text-white shadow' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}>
                {pageNum}
              </button>
            )
          ))}
          <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}
            className="p-1.5 sm:p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors">
            <ChevronRight size={14} className="sm:w-4 sm:h-4" />
          </button>
        </div>
      )}

      {/* ── Lightbox ── */}
      {selectedPhoto && (
        <div className="fixed inset-0 bg-slate-950/90 z-[100] flex flex-col items-center p-2 sm:p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setSelectedPhoto(null); }}>
          <div className="w-full flex justify-between items-center text-white py-2 max-w-6xl">
            <p className="text-[11px] sm:text-sm font-medium truncate max-w-[50%] sm:max-w-[60%]">{selectedPhoto.name}</p>
            <div className="flex items-center gap-2 sm:gap-3">
              <a href={selectedPhoto.webContentLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 sm:gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[10px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg shadow">
                <Download size={12} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Unduh File Asli</span><span className="sm:hidden">Unduh</span>
              </a>
              <button onClick={() => setSelectedPhoto(null)} className="text-slate-300 hover:text-white p-1"><X size={20} /></button>
            </div>
          </div>
          <div className="flex-grow flex items-center justify-center w-full my-2 sm:my-4">
            <img src={`/api/proxy-image?id=${selectedPhoto.id}&sz=w1200`} alt={selectedPhoto.name}
              className="max-w-full max-h-[85vh] sm:max-h-[80vh] object-contain rounded shadow-2xl" />
          </div>
        </div>
      )}

      {/* ── Search Modal ── */}
      {searchModalOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col">

            {/* Header */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm sm:text-base">
                <Sparkles size={16} className="text-emerald-600" />
                Cari Foto Berdasarkan Wajah
              </h3>
              <button onClick={() => setSearchModalOpen(false)} disabled={faceMatching}
                className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 flex-grow flex flex-col justify-center">
              {faceapiError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 flex items-start gap-2.5 text-xs">
                  <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <span>{faceapiError}</span>
                </div>
              )}

              {/* Camera view */}
              {cameraActive && (
                <div className="relative aspect-[4/3] bg-slate-950 rounded-xl overflow-hidden shadow border border-slate-800">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
                    <button onClick={capturePhoto}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 px-5 rounded-full shadow-lg flex items-center gap-1.5 transition-all hover:scale-105">
                      <Camera size={14} /> Ambil Foto
                    </button>
                    <button onClick={stopCamera}
                      className="bg-slate-900/80 hover:bg-slate-800 text-white text-xs font-bold py-2.5 px-4 rounded-full shadow-lg">
                      Batal
                    </button>
                  </div>
                </div>
              )}

              <canvas ref={canvasRef} className="hidden" />

              {/* Choice state */}
              {!cameraActive && !faceMatching && (
                <div className="space-y-4">
                  <p className="text-slate-500 text-xs text-center leading-relaxed">
                    Unggah foto selfie atau gunakan kamera untuk mencari foto Anda di galeri ini.
                    <br />
                    <span className="text-slate-400">Tips: Pastikan wajah terlihat jelas dan pencahayaan baik.</span>
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={startCamera}
                      className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/20 rounded-2xl transition-all group">
                      <div className="w-11 h-11 rounded-full bg-slate-50 group-hover:bg-emerald-100 flex items-center justify-center text-slate-400 group-hover:text-emerald-700 transition-colors mb-2 border border-slate-100">
                        <Camera size={20} />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Ambil Selfie</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">via Kamera</span>
                    </button>

                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/20 rounded-2xl transition-all group">
                      <div className="w-11 h-11 rounded-full bg-slate-50 group-hover:bg-emerald-100 flex items-center justify-center text-slate-400 group-hover:text-emerald-700 transition-colors mb-2 border border-slate-100">
                        <Upload size={20} />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Unggah File</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">JPG / PNG</span>
                    </button>
                  </div>

                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                </div>
              )}

              {/* Loading state */}
              {faceMatching && (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <div className="relative flex items-center justify-center">
                    <div className="w-14 h-14 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
                    <Sparkles size={18} className="absolute text-emerald-600 animate-pulse" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-bold text-slate-800">Memproses Wajah...</p>
                    <p className="text-xs text-slate-400 font-medium">{statusMessage}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setSearchModalOpen(false)} disabled={faceMatching}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs px-4 py-2 rounded-lg transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
