import { useEffect, useRef, useState } from "react";
import api, { API } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { Upload, FileText, Trash2, Download, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

const humanSize = (n) => {
  if (!n) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
};

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef();

  const load = async () => {
    const r = await api.get("/documents");
    setDocs(r.data);
  };
  useEffect(() => { load(); }, []);

  const onFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        await api.post("/documents/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      toast.success(`Uploaded ${files.length} file(s)`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    await api.delete(`/documents/${id}`);
    toast.success("Deleted"); load();
  };

  const url = (d) => `${API}/documents/${d.id}/download?auth=${encodeURIComponent(localStorage.getItem("sf_token") || "")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Bills & Documents</h1>
        <p className="text-slate-400 mt-1 text-sm">Save every bill, invoice and receipt for future reference.</p>
      </div>

      <div
        onDrop={(e) => { e.preventDefault(); onFiles(Array.from(e.dataTransfer.files)); }}
        onDragOver={(e) => e.preventDefault()}
        className="bg-white rounded-xl border-2 border-dashed border-slate-300 hover:border-[#ea580c] p-8 text-center transition-colors"
      >
        <input ref={inputRef} type="file" data-testid="upload-input" hidden multiple
          accept="application/pdf,image/*"
          onChange={(e) => onFiles(Array.from(e.target.files))} />
        <div className="w-14 h-14 mx-auto rounded-md bg-[#ea580c]/10 flex items-center justify-center mb-3">
          {uploading ? <Loader2 className="w-6 h-6 text-[#ea580c] animate-spin" /> : <Upload className="w-6 h-6 text-[#ea580c]" />}
        </div>
        <div className="font-display font-bold text-slate-900 text-lg">Drop PDFs, receipts or photos here</div>
        <div className="text-slate-500 text-sm mt-1">or</div>
        <button data-testid="upload-btn" onClick={() => inputRef.current?.click()} disabled={uploading}
          className="mt-3 px-5 py-2 rounded-md bg-[#ea580c] hover:bg-[#c2410c] text-white font-semibold text-sm active:scale-95 transition-transform disabled:opacity-60">
          Choose files
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="text-left py-3 px-4">File</th>
                <th className="text-left">Type</th>
                <th className="text-left">Uploaded</th>
                <th className="text-right">Size</th>
                <th className="text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-slate-400">No documents saved yet.</td></tr>
              ) : docs.map((d, i) => (
                <tr key={d.id} data-testid={`doc-row-${d.id}`} className={`border-t border-slate-100 ${i % 2 ? "bg-slate-50/50" : ""}`}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-red-100 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-red-600" />
                      </div>
                      <span className="font-semibold text-slate-900">{d.original_filename}</span>
                    </div>
                  </td>
                  <td className="text-slate-600">{d.content_type}</td>
                  <td className="text-slate-600">{fmtDateTime(d.created_at)}</td>
                  <td className="text-right text-slate-700 font-medium">{humanSize(d.size)}</td>
                  <td className="pr-4 whitespace-nowrap text-right">
                    <a href={url(d)} target="_blank" rel="noreferrer" data-testid={`view-${d.id}`} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-slate-100 text-slate-700 text-xs font-semibold">
                      <Eye className="w-4 h-4" /> View
                    </a>
                    <a href={url(d)} download={d.original_filename} data-testid={`download-${d.id}`} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-slate-100 text-slate-700 text-xs font-semibold">
                      <Download className="w-4 h-4" />
                    </a>
                    <button onClick={() => del(d.id)} data-testid={`delete-doc-${d.id}`} className="inline-flex items-center px-2 py-1.5 rounded-md hover:bg-red-50">
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
