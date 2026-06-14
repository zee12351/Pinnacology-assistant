import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UploadCloud, CheckCircle } from 'lucide-react';
import axios from 'axios';

export function DocumentUpload() {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<string[]>([]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setUploading(true);
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setFiles([...files, file.name]);
    } catch (error) {
      console.error(error);
      alert("Upload failed. Ensure backend is running and ChromaDB is ready.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="h-full flex flex-col shadow-lg border-white/10 bg-white/5 backdrop-blur-md">
      <CardHeader className="border-b border-white/10">
        <CardTitle className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
          Knowledge Base
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex-1 overflow-auto flex flex-col">
        <label className="border-2 border-dashed border-gray-600 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-500/10 transition-colors group">
          <UploadCloud className="w-10 h-10 text-gray-400 group-hover:text-emerald-500 mb-2 transition-colors" />
          <span className="text-sm font-medium text-gray-300 group-hover:text-emerald-400 transition-colors">
            {uploading ? 'Processing...' : 'Upload PDF Document'}
          </span>
          <span className="text-xs text-gray-500 mt-1">Drag and drop or click to browse</span>
          <input type="file" className="hidden" accept=".pdf" onChange={handleUpload} disabled={uploading} />
        </label>
        
        {files.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Processed Papers</h4>
            <div className="space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-black/40 p-3 rounded-lg border border-white/5">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="truncate text-gray-300">{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
