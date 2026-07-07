'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Pencil, PlusCircle, LogOut, Calendar, XCircle, Cpu, Eye, EyeOff, Search, Grid, List, RefreshCw, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';

export default function AdminDashboard() {
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ title: '', slug: '', driveFolderId: '', date: '', description: '', hidden: false });
  const [editForm, setEditForm] = useState({ title: '', slug: '', driveFolderId: '', date: '', description: '', hidden: false });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('list');

  // Receive scan progress from admin layout via BroadcastChannel
  const [bgScanJob, setBgScanJob] = useState(null);
  const [realtimeCounts, setRealtimeCounts] = useState({});
  const scanStartsRef = useRef({});
  const eventsRef = useRef(events);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    const channel = new BroadcastChannel('bg-scan-progress');
    channel.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'batch-saved') {
        fetchEvents();
      } else {
        setBgScanJob(data);

        if (data.eventId && data.progress !== undefined) {
          // Initialize starting DB count if not present
          if (scanStartsRef.current[data.eventId] === undefined) {
            const eventObj = eventsRef.current.find(ev => ev._id === data.eventId);
            scanStartsRef.current[data.eventId] = eventObj?.indexedPhotos ? eventObj.indexedPhotos.length : 0;
          }
          
          const currentCount = scanStartsRef.current[data.eventId] + data.progress;
          setRealtimeCounts(prev => ({
            ...prev,
            [data.eventId]: currentCount
          }));
        }

        if (data.done) {
          delete scanStartsRef.current[data.eventId];
          setRealtimeCounts(prev => {
            const copy = { ...prev };
            delete copy[data.eventId];
            return copy;
          });
          fetchEvents();
        }
      }
    };
    return () => channel.close();
  }, []);

  const filteredEvents = events.filter(event =>
    event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (event.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/admin/events');
      const json = await res.json();
      if (json.success) setEvents(json.data);
    } catch (err) {
      console.error("Gagal memuat data event:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvents(); }, []);

  const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

  const handleTitleChange = (e) => setForm({ ...form, title: e.target.value, slug: slugify(e.target.value) });
  const handleEditTitleChange = (e) => setEditForm({ ...editForm, title: e.target.value, slug: slugify(e.target.value) });

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    if (res.ok) {
      setForm({ title: '', slug: '', driveFolderId: '', date: '', description: '', hidden: false });
      setIsAddModalOpen(false);
      await fetchEvents();
    } else {
      alert('❌ Gagal menambahkan event.');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/admin/events', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, ...editForm })
    });
    if (res.ok) {
      alert('✅ Data Event Berhasil Diperbarui!');
      cancelEdit();
      fetchEvents();
    } else {
      alert('❌ Gagal memperbarui data.');
    }
  };

  const startEdit = (event) => {
    setEditingId(event._id);
    const formattedDate = event.date ? new Date(event.date).toISOString().split('T')[0] : '';
    setEditForm({ title: event.title, slug: event.slug, driveFolderId: event.driveFolderId, date: formattedDate, description: event.description || '', hidden: event.hidden || false });
    setIsEditModalOpen(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsEditModalOpen(false);
    setEditForm({ title: '', slug: '', driveFolderId: '', date: '', description: '', hidden: false });
  };

  const handleDelete = async (id) => {
    if (!confirm('Apakah kamu yakin ingin menghapus kategori event camping ini beserta galeri fotonya?')) return;
    const res = await fetch('/api/admin/events', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (res.ok) {
      alert('🗑️ Event berhasil dihapus!');
      if (editingId === id) cancelEdit();
      fetchEvents();
    } else {
      alert('❌ Gagal menghapus event.');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/admin');
  };

  const handleToggleVisibility = async (id, currentHidden) => {
    const action = currentHidden ? 'menampilkan' : 'menyembunyikan';
    if (!confirm(`Apakah Anda yakin ingin ${action} event camping ini dari halaman publik?`)) return;
    setEvents(prev => prev.map(ev => ev._id === id ? { ...ev, hidden: !ev.hidden } : ev));
    try {
      const res = await fetch('/api/admin/events', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (res.ok) { fetchEvents(); } else { throw new Error(); }
    } catch {
      setEvents(prev => prev.map(ev => ev._id === id ? { ...ev, hidden: currentHidden } : ev));
      alert('❌ Gagal mengubah visibilitas.');
    }
  };

  const handleSyncPhotosCount = async (id) => {
    setSyncingId(id);
    try {
      const res = await fetch('/api/admin/events', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'sync' }) });
      const json = await res.json();
      if (json.success) {
        setEvents(prev => prev.map(ev => ev._id === id ? { ...ev, drivePhotosCount: json.data.drivePhotosCount } : ev));
        alert('🔄 Sinkronisasi berhasil!');
      } else { alert('❌ Gagal sinkronisasi.'); }
    } catch { alert('❌ Terjadi kesalahan.'); }
    finally { setSyncingId(null); }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Top Navbar */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-wrap gap-3">
        <h1 className="text-lg sm:text-xl font-bold text-slate-900">🛠️ Panel Kontrol Admin</h1>
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm py-2 px-3 sm:px-4 rounded-lg shadow transition-colors"
          >
            <PlusCircle size={14} />
            <span className="hidden sm:inline">Tambah Event Baru</span>
          </button>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-red-600 font-semibold hover:underline">
            <LogOut size={14} />
            <span className="hidden sm:inline">Keluar Admin</span>
          </button>
        </div>
      </div>

      {/* List Daftar Camping */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">📋 Daftar Kategori Camping</h2>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            {/* Search Bar */}
            <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kategori camping..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-600 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600">✕</button>
              )}
            </div>
            {/* View Mode Toggle */}
            <div className="flex border border-slate-200 rounded-lg overflow-hidden self-end sm:self-auto">
              <button type="button" onClick={() => setViewMode('grid')} className={`p-2 flex items-center gap-1.5 text-xs font-semibold transition-colors ${viewMode === 'grid' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`} title="Tampilan Grid">
                <Grid size={14} /><span className="hidden sm:inline">Grid</span>
              </button>
              <button type="button" onClick={() => setViewMode('list')} className={`p-2 flex items-center gap-1.5 text-xs font-semibold transition-colors ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`} title="Tampilan List">
                <List size={14} /><span className="hidden sm:inline">List</span>
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 py-4">Memuat data database...</p>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
            <p className="text-sm text-slate-500 font-medium">Tidak ada kategori camping yang cocok.</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((event) => {
              const driveCount = event.drivePhotosCount || 0;
              const currentIndexedCount = realtimeCounts[event._id] !== undefined
                ? realtimeCounts[event._id]
                : (event.indexedPhotos ? event.indexedPhotos.length : 0);
              const isScanning = bgScanJob && bgScanJob.eventId === event._id && !bgScanJob.done;
              const scanDone = bgScanJob && bgScanJob.eventId === event._id && bgScanJob.done;
              return (
                <div key={event._id} className="rounded-xl border p-5 flex flex-col justify-between shadow-sm transition-all duration-200 hover:shadow-md bg-white border-slate-200 hover:-translate-y-0.5">
                  <div className={`space-y-3 transition-opacity ${event.hidden ? 'opacity-60' : ''}`}>
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug line-clamp-2">{event.title}</h3>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap border ${driveCount > 0 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                          {driveCount} di Drive
                        </span>
                        <button type="button" onClick={() => handleSyncPhotosCount(event._id)} disabled={syncingId === event._id} className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 transition-all" title="Sinkronkan jumlah foto">
                          <RefreshCw size={11} className={syncingId === event._id ? 'animate-spin text-blue-600' : ''} />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2">{event.description || 'Tidak ada deskripsi.'}</p>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={12} className="text-slate-400" />
                        <span>{new Date(event.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-400">Slug:</span>
                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono text-[10px] truncate max-w-[120px]" title={event.slug}>{event.slug}</code>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-400">Folder ID:</span>
                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono text-[10px] truncate max-w-[120px]" title={event.driveFolderId}>{event.driveFolderId}</code>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-400">Status AI:</span>
                        {currentIndexedCount > 0 ? (
                          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                            ✅ Terindeks ({currentIndexedCount}/{driveCount})
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">⚠️ Belum Terindeks</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Inline scan progress — no close button */}
                  {(isScanning || scanDone) && (
                    <div className="mt-3 rounded-xl bg-slate-900 px-3 py-2.5 border border-slate-700">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {scanDone
                          ? <CheckCircle2 size={13} className="text-emerald-400" />
                          : <Loader2 size={13} className="text-amber-400 animate-spin" />}
                        <span className="text-[11px] font-bold text-white">
                          {scanDone ? 'Scan Selesai!' : 'Scanning Latar Belakang...'}
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all duration-500"
                          style={{
                            width: bgScanJob.total > 0 ? `${Math.round((bgScanJob.progress / bgScanJob.total) * 100)}%` : '0%',
                            background: scanDone ? '#34d399' : 'linear-gradient(90deg, #f59e0b, #ef4444)'
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-slate-400">{bgScanJob.progress} / {bgScanJob.total} foto</span>
                        <span className="text-[10px] text-slate-400">
                          {bgScanJob.total > 0 ? Math.round((bgScanJob.progress / bgScanJob.total) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Button bar — icon-only on small, text on larger screens */}
                  <div className="flex items-center justify-between gap-2 pt-3 mt-4 border-t border-slate-100">
                    {/* Visibility switch (read-only) */}
                    <div className="flex items-center gap-1.5 select-none cursor-default" title={event.hidden ? 'Tersembunyi' : 'Tampil'}>
                      <div className="relative w-8 h-[18px] rounded-full bg-slate-200 flex-shrink-0">
                        <div className={`absolute top-[2px] w-3 h-3 rounded-full bg-slate-400 transition-all duration-300 ${event.hidden ? 'left-[2px]' : 'left-[18px]'}`} />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 hidden xl:inline">
                        {event.hidden ? 'Sembunyi' : 'Tampil'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <a href={`/gallery/${event.slug}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center p-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 hover:text-slate-800 transition-all"
                        title="Buka Halaman Galeri">
                        <ExternalLink size={15} className="flex-shrink-0" />
                      </a>
                      <a href={`/admin/scan/${event.slug}`}
                        className="flex items-center justify-center p-2 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-600 shadow-sm transition-all"
                        title="Scan Wajah AI">
                        <Cpu size={15} className="flex-shrink-0" />
                      </a>
                      <button onClick={() => startEdit(event)}
                        className="flex items-center justify-center p-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 hover:text-amber-700 transition-all"
                        title="Ubah Data Event">
                        <Pencil size={15} className="flex-shrink-0" />
                      </button>
                      <button onClick={() => handleDelete(event._id)}
                        className="flex items-center justify-center p-2 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 hover:text-blue-700 transition-all"
                        title="Hapus Kategori">
                        <Trash2 size={15} className="flex-shrink-0" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="px-6 py-4">Event / Kategori</th>
                  <th className="px-6 py-4">Tanggal</th>
                  <th className="px-6 py-4">Google Drive</th>
                  <th className="px-6 py-4">Status AI</th>
                  <th className="px-6 py-4">Visibilitas</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredEvents.map((event) => {
                  const driveCount = event.drivePhotosCount || 0;
                  const currentIndexedCount = realtimeCounts[event._id] !== undefined
                    ? realtimeCounts[event._id]
                    : (event.indexedPhotos ? event.indexedPhotos.length : 0);
                  return (
                    <tr key={event._id} className={`hover:bg-slate-50/55 transition-colors ${editingId === event._id ? 'bg-amber-50/20' : ''}`}>
                      <td className={`px-6 py-4 transition-opacity ${event.hidden ? 'opacity-55' : ''}`}>
                        <div className="font-bold text-slate-900">{event.title}</div>
                        <div className="text-slate-500 text-xs mt-0.5 line-clamp-1 max-w-sm">{event.description || 'Tidak ada deskripsi.'}</div>
                        {bgScanJob && bgScanJob.eventId === event._id && !bgScanJob.done && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <Loader2 size={10} className="text-amber-500 animate-spin" />
                            <span className="text-[10px] text-amber-600 font-semibold">
                              Scanning {bgScanJob.progress}/{bgScanJob.total}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-slate-600 font-medium transition-opacity ${event.hidden ? 'opacity-55' : ''}`}>
                        {new Date(event.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap transition-opacity ${event.hidden ? 'opacity-55' : ''}`}>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold px-2 py-0.5 rounded border text-[11px] ${driveCount > 0 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{driveCount} Foto</span>
                          <button type="button" onClick={() => handleSyncPhotosCount(event._id)} disabled={syncingId === event._id} className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 transition-all" title="Sinkronkan">
                            <RefreshCw size={11} className={syncingId === event._id ? 'animate-spin text-blue-600' : ''} />
                          </button>
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap transition-opacity ${event.hidden ? 'opacity-55' : ''}`}>
                        {currentIndexedCount > 0 ? (
                          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">✅ Terindeks ({currentIndexedCount})</span>
                        ) : (
                          <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">⚠️ Belum Scan</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 select-none cursor-default" title={event.hidden ? 'Tersembunyi' : 'Tampil'}>
                          <div className="relative w-10 h-[22px] rounded-full bg-slate-200">
                            <div className={`absolute top-[3px] w-4 h-4 rounded-full bg-slate-400 transition-all duration-300 ${event.hidden ? 'left-[3px]' : 'left-[21px]'}`} />
                          </div>
                          <span className="text-[11px] font-semibold text-slate-400">{event.hidden ? 'Sembunyi' : 'Tampil'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <a href={`/gallery/${event.slug}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center justify-center p-1.5 bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 hover:text-slate-800 rounded text-xs transition-colors"
                            title="Buka galeri publik"><ExternalLink size={12} /></a>
                          <a href={`/admin/scan/${event.slug}`}
                            className="inline-flex items-center justify-center p-1.5 bg-emerald-700 text-white hover:bg-emerald-600 rounded text-xs transition-colors"
                            title="Scan Wajah"><Cpu size={12} /></a>
                          <button onClick={() => startEdit(event)}
                            className="inline-flex items-center justify-center p-1.5 bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 hover:text-amber-700 rounded text-xs transition-colors"
                            title="Ubah"><Pencil size={12} /></button>
                          <button onClick={() => handleDelete(event._id)}
                            className="inline-flex items-center justify-center p-1.5 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 hover:text-blue-700 rounded text-xs transition-colors"
                            title="Hapus"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <Pencil size={16} className="text-amber-600 animate-pulse" /> Ubah Informasi Event Camping
              </h3>
              <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"><XCircle size={20} /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Event Camping</label>
                  <input type="text" value={editForm.title} onChange={handleEditTitleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-amber-500 focus:outline-none" placeholder="Contoh: Camping JC Camporee" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">URL Slug (Terkunci Otomatis)</label>
                  <input type="text" value={editForm.slug} disabled className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-400 font-mono text-xs cursor-not-allowed focus:outline-none" required />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ID Folder Google Drive</label>
                  <input type="text" value={editForm.driveFolderId} onChange={(e) => setEditForm({...editForm, driveFolderId: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-amber-500 focus:outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Kegiatan</label>
                  <input type="date" value={editForm.date} onChange={(e) => setEditForm({...editForm, date: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-amber-500 focus:outline-none" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Singkat Acara</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-amber-500 focus:outline-none" rows="3" placeholder="Tuliskan info keseruan di sini..." />
              </div>
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 w-fit">
                <span className="text-xs font-semibold text-slate-700">Status Visibilitas:</span>
                <button type="button" onClick={() => setEditForm({ ...editForm, hidden: !editForm.hidden })} className="flex items-center gap-2 group focus:outline-none">
                  <div className={`relative w-10 h-[22px] rounded-full transition-colors duration-300 ${editForm.hidden ? 'bg-slate-300' : 'bg-emerald-500'}`}>
                    <div className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${editForm.hidden ? 'left-[3px]' : 'left-[21px]'}`} />
                  </div>
                  <span className={`text-[11px] font-semibold transition-colors ${editForm.hidden ? 'text-slate-500' : 'text-emerald-700 font-bold'}`}>
                    {editForm.hidden ? 'Sembunyikan dari Publik' : 'Tampilkan di Publik'}
                  </span>
                </button>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={cancelEdit} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs sm:text-sm py-2 px-4 rounded-lg flex items-center gap-1.5 transition-colors"><XCircle size={16} /> Batal</button>
                <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs sm:text-sm py-2 px-5 rounded-lg shadow transition-colors">Perbarui Data Event</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tambah Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <PlusCircle size={16} className="text-emerald-600 animate-pulse" /> Tambah Event Camping Baru
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"><XCircle size={20} /></button>
            </div>
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Event Camping</label>
                  <input type="text" value={form.title} onChange={handleTitleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-600 focus:outline-none" placeholder="Contoh: Camping JC Camporee" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">URL Slug (Terkunci Otomatis)</label>
                  <input type="text" value={form.slug} disabled className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-400 font-mono text-xs cursor-not-allowed focus:outline-none" required />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ID Folder Google Drive</label>
                  <input type="text" value={form.driveFolderId} onChange={(e) => setForm({...form, driveFolderId: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-600 focus:outline-none" placeholder="Masukkan Kode Folder ID" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Kegiatan</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-600 focus:outline-none" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Singkat Acara</label>
                <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-600 focus:outline-none" rows="3" placeholder="Tuliskan info keseruan di sini..." />
              </div>
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 w-fit">
                <span className="text-xs font-semibold text-slate-700">Status Visibilitas:</span>
                <button type="button" onClick={() => setForm({ ...form, hidden: !form.hidden })} className="flex items-center gap-2 group focus:outline-none">
                  <div className={`relative w-10 h-[22px] rounded-full transition-colors duration-300 ${form.hidden ? 'bg-slate-300' : 'bg-emerald-500'}`}>
                    <div className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${form.hidden ? 'left-[3px]' : 'left-[21px]'}`} />
                  </div>
                  <span className={`text-[11px] font-semibold transition-colors ${form.hidden ? 'text-slate-500' : 'text-emerald-700 font-bold'}`}>
                    {form.hidden ? 'Sembunyikan dari Publik' : 'Tampilkan di Publik'}
                  </span>
                </button>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs sm:text-sm py-2 px-4 rounded-lg flex items-center gap-1.5 transition-colors"><XCircle size={16} /> Batal</button>
                <button type="submit" className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm py-2 px-5 rounded-lg shadow transition-colors">Simpan &amp; Aktifkan Galeri</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
