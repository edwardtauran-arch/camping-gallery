'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Pencil, PlusCircle, LogOut, Calendar, XCircle, Cpu, Eye, EyeOff, Search, Grid, List } from 'lucide-react';

export default function AdminDashboard() {
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ title: '', slug: '', driveFolderId: '', date: '', description: '', hidden: false });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

  const filteredEvents = events.filter(event => 
    event.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (event.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/admin/events');
      const json = await res.json();
      if (json.success) {
        setEvents(json.data);
      }
    } catch (err) {
      console.error("Gagal memuat data event:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const slugify = (text) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') 
      .replace(/\s+/g, '-')         
      .replace(/-+/g, '-');         
  };

  const handleTitleChange = (e) => {
    const titleValue = e.target.value;
    setForm({
      ...form,
      title: titleValue,
      slug: editingId ? form.slug : slugify(titleValue)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = '/api/admin/events';
    const method = editingId ? 'PUT' : 'POST';
    const payload = editingId ? { id: editingId, ...form } : form;

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert(editingId ? '✅ Data Event Berhasil Diperbarui!' : '✅ Event Camping Baru Berhasil Ditambahkan!');
      cancelEdit();
      fetchEvents();
    } else {
      alert('❌ Gagal memproses data.');
    }
  };

  const startEdit = (event) => {
    setEditingId(event._id);
    const formattedDate = event.date ? new Date(event.date).toISOString().split('T')[0] : '';
    setForm({
      title: event.title,
      slug: event.slug,
      driveFolderId: event.driveFolderId,
      date: formattedDate,
      description: event.description || '',
      hidden: event.hidden || false
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ title: '', slug: '', driveFolderId: '', date: '', description: '', hidden: false });
  };

  const handleDelete = async (id) => {
    if (!confirm('Apakah kamu yakin ingin menghapus kategori event camping ini beserta galeri fotonya?')) return;
    
    const res = await fetch('/api/admin/events', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });

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

    // Update local state instantly (optimistic UI update)
    setEvents(prevEvents =>
      prevEvents.map(event =>
        event._id === id ? { ...event, hidden: !event.hidden } : event
      )
    );

    try {
      const res = await fetch('/api/admin/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchEvents();
      } else {
        throw new Error('Gagal mengupdate visibilitas');
      }
    } catch (err) {
      // Revert if request failed
      setEvents(prevEvents =>
        prevEvents.map(event =>
          event._id === id ? { ...event, hidden: currentHidden } : event
        )
      );
      alert('❌ Gagal mengubah visibilitas.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Navbar */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">🛠️ Panel Kontrol Admin</h1>
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-red-600 font-semibold hover:underline">
          <LogOut size={14} /> Keluar Admin
        </button>
      </div>

      {/* Form Tambah / Edit */}
      <div className={`p-6 rounded-xl border shadow-sm max-w-2xl transition-colors duration-200 ${editingId ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-slate-200'}`}>
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <PlusCircle size={18} className={editingId ? "text-amber-600" : "text-emerald-600"} /> 
          {editingId ? 'Ubah Informasi Event Camping' : 'Tambah Event Camping Baru'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Event Camping</label>
              <input type="text" value={form.title} onChange={handleTitleChange} className="w-full px-3 py-2 border rounded-lg text-sm focus:border-emerald-600 focus:outline-none" placeholder="Contoh: Camping JC Camporee" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">URL Slug (Terkunci Otomatis)</label>
              {/* UPDATE: Menambahkan atribut disabled dan styling abu-abu terlarang */}
              <input 
                type="text" 
                value={form.slug} 
                disabled 
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-400 font-mono text-xs cursor-not-allowed focus:outline-none" 
                placeholder="Terisi otomatis..." 
                required 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ID Folder Google Drive</label>
              <input type="text" value={form.driveFolderId} onChange={(e) => setForm({...form, driveFolderId: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:border-emerald-600 focus:outline-none" placeholder="Masukkan Kode Folder ID dari Google Drive" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Kegiatan</label>
              <input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:border-emerald-600 focus:outline-none" required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Deskripsi Singkat Acara</label>
            <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:border-emerald-600 focus:outline-none" rows="2" placeholder="Tuliskan info keseruan di sini..."></textarea>
          </div>

          {/* Visibility Switch */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 w-fit">
            <span className="text-xs font-semibold text-slate-700">Status Visibilitas:</span>
            <button
              type="button"
              onClick={() => setForm({ ...form, hidden: !form.hidden })}
              className="flex items-center gap-2 group focus:outline-none"
            >
              {/* Switch track */}
              <div className={`relative w-10 h-[22px] rounded-full transition-colors duration-300 ${
                form.hidden ? 'bg-slate-300' : 'bg-emerald-500'
              }`}>
                {/* Switch knob */}
                <div className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
                  form.hidden ? 'left-[3px]' : 'left-[21px]'
                }`} />
              </div>
              <span className={`text-[11px] font-semibold transition-colors ${
                form.hidden ? 'text-slate-500 font-normal' : 'text-emerald-700 font-bold'
              }`}>
                {form.hidden ? 'Sembunyikan dari Publik' : 'Tampilkan di Publik'}
              </span>
            </button>
          </div>

          <div className="flex gap-3">
            <button type="submit" className={`font-medium text-sm py-2 px-6 rounded-lg shadow transition-colors text-white ${editingId ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-700 hover:bg-emerald-600'}`}>
              {editingId ? 'Perbarui Data Event' : 'Simpan & Aktifkan Galeri foto'}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEdit} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium text-sm py-2 px-4 rounded-lg flex items-center gap-1.5 transition-colors">
                <XCircle size={16} /> Batal Edit
              </button>
            )}
          </div>
        </form>
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
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600"
                >
                  X
                </button>
              )}
            </div>

            {/* View Mode Toggle Buttons */}
            <div className="flex border border-slate-200 rounded-lg overflow-hidden self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-2 flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title="Tampilan Grid"
              >
                <Grid size={14} />
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-2 flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                  viewMode === 'list'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title="Tampilan List/Tabel"
              >
                <List size={14} />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 py-4">Memuat data database...</p>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
            <p className="text-sm text-slate-500 font-medium">Tidak ada kategori camping yang cocok dengan pencarian Anda.</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View Mode */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((event) => {
              const driveCount = event.drivePhotosCount || 0;
              return (
                <div 
                  key={event._id} 
                  className={`rounded-xl border p-5 flex flex-col justify-between shadow-sm transition-all duration-200 hover:shadow-md ${
                    event.hidden
                      ? 'bg-slate-50/80 border-slate-200 opacity-70'
                      : editingId === event._id 
                        ? 'bg-amber-50/10 border-amber-400 ring-1 ring-amber-400' 
                        : 'bg-white border-slate-200 hover:-translate-y-0.5'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug line-clamp-2">{event.title}</h3>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap border ${
                        driveCount > 0 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        {driveCount} di Drive
                      </span>
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
                        {event.indexedPhotos && event.indexedPhotos.length > 0 ? (
                          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                            ✅ Terindeks ({event.indexedPhotos.length}/{driveCount})
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
                            ⚠️ Belum Terindeks Wajah
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 mt-4 border-t border-slate-100">
                    {/* Toggle visibility - static read-only grey switch */}
                    <div
                      className="flex items-center gap-2 select-none cursor-default"
                      title={event.hidden ? 'Status: Tersembunyi (Ubah lewat form Edit)' : 'Status: Tampil (Ubah lewat form Edit)'}
                    >
                      {/* Switch track */}
                      <div className="relative w-10 h-[22px] rounded-full bg-slate-200">
                        {/* Switch knob */}
                        <div className={`absolute top-[3px] w-4 h-4 rounded-full bg-slate-400 transition-all duration-300 ${
                          event.hidden ? 'left-[3px]' : 'left-[21px]'
                        }`} />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400">
                        {event.hidden ? 'Tersembunyi' : 'Tampil'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`/admin/scan/${event.slug}`}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-600 shadow-sm transition-colors"
                        title="Scan Wajah AI"
                      >
                        <Cpu size={12} /> Scan Wajah
                      </a>
                      <button 
                        onClick={() => startEdit(event)} 
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          editingId === event._id 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-slate-50 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                        }`}
                        title="Ubah Data Event"
                      >
                        <Pencil size={14} /> Ubah
                      </button>
                      <button 
                        onClick={() => handleDelete(event._id)} 
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                        title="Hapus Kategori"
                      >
                        <Trash2 size={14} /> Hapus
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View Mode (Table format) */
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
                  return (
                    <tr
                      key={event._id}
                      className={`hover:bg-slate-50/55 transition-colors ${
                        event.hidden ? 'opacity-70 bg-slate-50/40' : ''
                      } ${editingId === event._id ? 'bg-amber-50/20' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{event.title}</div>
                        <div className="text-slate-500 text-xs mt-0.5 line-clamp-1 max-w-sm">{event.description || 'Tidak ada deskripsi.'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-medium">
                        {new Date(event.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`font-bold px-2 py-0.5 rounded border text-[11px] ${
                          driveCount > 0 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          {driveCount} Foto
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {event.indexedPhotos && event.indexedPhotos.length > 0 ? (
                          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                            ✅ Terindeks ({event.indexedPhotos.length})
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                            ⚠️ Belum Scan
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {/* Toggle visibility - static read-only grey switch */}
                        <div
                          className="flex items-center gap-2 select-none cursor-default"
                          title={event.hidden ? 'Status: Tersembunyi (Ubah lewat form Edit)' : 'Status: Tampil (Ubah lewat form Edit)'}
                        >
                          <div className="relative w-10 h-[22px] rounded-full bg-slate-200">
                            <div className={`absolute top-[3px] w-4 h-4 rounded-full bg-slate-400 transition-all duration-300 ${
                              event.hidden ? 'left-[3px]' : 'left-[21px]'
                            }`} />
                          </div>
                          <span className="text-[11px] font-semibold text-slate-400">
                            {event.hidden ? 'Sembunyi' : 'Tampil'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/admin/scan/${event.slug}`}
                            className="inline-flex items-center gap-1 bg-emerald-700 text-white hover:bg-emerald-600 font-semibold px-2 py-1 rounded text-xs transition-colors"
                          >
                            <Cpu size={12} /> Scan
                          </a>
                          <button
                            onClick={() => startEdit(event)}
                            className="bg-slate-100 hover:bg-amber-100 hover:text-amber-800 text-slate-600 px-2 py-1 rounded text-xs font-semibold transition-colors"
                          >
                            Ubah
                          </button>
                          <button
                            onClick={() => handleDelete(event._id)}
                            className="bg-slate-100 hover:bg-red-100 hover:text-red-700 text-slate-600 px-2 py-1 rounded text-xs font-semibold transition-colors"
                          >
                            Hapus
                          </button>
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
    </div>
  );
}
