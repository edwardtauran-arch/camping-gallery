'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Pencil, PlusCircle, LogOut, Calendar, XCircle, Cpu } from 'lucide-react';

export default function AdminDashboard() {
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ title: '', slug: '', driveFolderId: '', date: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);

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
      description: event.description || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ title: '', slug: '', driveFolderId: '', date: '', description: '' });
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
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">📋 Daftar Kategori Camping Saat Ini</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Memuat data database...</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada kategori camping yang terdaftar.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => {
              const driveCount = event.drivePhotosCount || 0;
              return (
                <div 
                  key={event._id} 
                  className={`bg-white rounded-xl border p-5 flex flex-col justify-between shadow-sm transition-all duration-200 hover:shadow-md ${
                    editingId === event._id ? 'border-amber-400 bg-amber-50/10 ring-1 ring-amber-400' : 'border-slate-200 hover:-translate-y-0.5'
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

                  <div className="flex items-center justify-end gap-2 pt-3 mt-4 border-t border-slate-100">
                    <a
                      href={`/admin/scan/${event.slug}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-600 shadow-sm transition-colors mr-auto"
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
