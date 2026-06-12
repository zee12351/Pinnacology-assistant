import React, { useState } from 'react';
import { Upload, X, ChevronRight, Loader2, Search } from 'lucide-react';

export function UploadModal({ showUploadModal, setShowUploadModal, handleFileUpload, uploadingDoc }: any) {
  const [uploadTab, setUploadTab] = useState('Upload PDFs');
  const [zoteroId, setZoteroId] = useState('');
  const [zoteroKey, setZoteroKey] = useState('');
  const [mendeleyToken, setMendeleyToken] = useState('');
  const [fetchId, setFetchId] = useState('');
  const [isFetchingLibrary, setIsFetchingLibrary] = useState(false);

  const handleZoteroSync = async () => {
    setIsFetchingLibrary(true);
    try {
      const res = await fetch('http://localhost:8000/library/zotero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: zoteroId, api_key: zoteroKey })
      });
      if(res.ok) alert("Zotero library synced successfully!");
      else alert("Failed to sync Zotero.");
    } catch (e) {
      alert("Error connecting to backend.");
    } finally {
      setIsFetchingLibrary(false);
    }
  };

  const handleMendeleySync = async () => {
    setIsFetchingLibrary(true);
    try {
      const res = await fetch('http://localhost:8000/library/mendeley', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: mendeleyToken })
      });
      if(res.ok) alert("Mendeley library synced successfully!");
      else alert("Failed to sync Mendeley.");
    } catch (e) {
      alert("Error connecting to backend.");
    } finally {
      setIsFetchingLibrary(false);
    }
  };

  const handleFetchId = async () => {
    if(!fetchId) return;
    setIsFetchingLibrary(true);
    try {
      const res = await fetch('http://localhost:8000/library/fetch-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper_id: fetchId })
      });
      if(res.ok) alert("Document fetched and added to library!");
      else alert("Failed to fetch document. Invalid ID.");
    } catch (e) {
      alert("Error connecting to backend.");
    } finally {
      setIsFetchingLibrary(false);
      setFetchId('');
    }
  };

  if (!showUploadModal) return null;

  return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[850px] min-h-[600px] bg-[#151515] rounded-xl border border-[#333] shadow-2xl flex flex-col overflow-hidden relative">
            {/* Header / Tabs */}
            <div className="px-2 pt-2 border-b border-[#2a2a2a] flex items-center gap-1 relative">
              <div className="px-4 py-3 font-bold text-white text-[15px] mr-4">Upload to Library</div>
              
              <button onClick={() => setUploadTab('Upload PDFs')} className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg transition-colors text-[14px] font-bold ${uploadTab === 'Upload PDFs' ? 'bg-[#222] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'}`}>
                <Upload className="w-4 h-4" /> Upload PDFs
              </button>
              
              <button onClick={() => setUploadTab('Zotero')} className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg transition-colors text-[14px] font-bold ${uploadTab === 'Zotero' ? 'bg-[#222] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'}`}>
                <div className="w-4 h-4 rounded-sm bg-red-500 text-white flex items-center justify-center text-[10px]">Z</div> Zotero
              </button>

              <button onClick={() => setUploadTab('Mendeley')} className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg transition-colors text-[14px] font-bold ${uploadTab === 'Mendeley' ? 'bg-[#222] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'}`}>
                <div className="w-4 h-4 rounded-sm bg-[#9b0000] text-white flex items-center justify-center text-[10px] font-serif">M</div> Mendeley
              </button>

              <button onClick={() => setUploadTab('Paste ID')} className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg transition-colors text-[14px] font-bold ${uploadTab === 'Paste ID' ? 'bg-[#222] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'}`}>
                <span className="text-lg leading-none mt-[-2px]">#</span> Paste ID
              </button>

              <button onClick={() => setShowUploadModal(false)} className="absolute right-4 top-4 text-gray-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 bg-[#111111] p-6 flex flex-col">
               {uploadTab === 'Upload PDFs' && (
                 <div className="flex flex-col h-full">
                   <div className="flex items-center gap-2 mb-8">
                     <span className="text-[13px] text-gray-400">Select collection:</span>
                     <div className="px-3 py-1.5 border border-[#333] rounded-lg bg-[#1a1a1a] flex items-center gap-2 text-[13px] font-bold text-gray-200 cursor-pointer">
                       <div className="w-3.5 h-3.5 flex flex-col gap-[2px]">
                         <div className="w-full h-[1px] bg-gray-400"></div>
                         <div className="w-full h-[1px] bg-gray-400"></div>
                         <div className="w-[60%] h-[1px] bg-gray-400"></div>
                       </div>
                       All Sources
                       <ChevronRight className="w-3.5 h-3.5 rotate-90 text-gray-500" />
                     </div>
                   </div>

                   <label className="flex-1 border-2 border-dashed border-[#2a2a2a] rounded-xl flex flex-col items-center justify-center bg-[#151515] hover:bg-[#1a1a1a] transition-colors cursor-pointer group">
                      <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => { handleFileUpload(e); setShowUploadModal(false); }} disabled={uploadingDoc} />
                      <div className="w-10 h-10 mb-4 rounded-full bg-[#1b1c3a] flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Upload className="w-5 h-5 text-[#6d93e8]" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">Upload up to 100 PDFs</h3>
                      <p className="text-gray-400 text-sm">Drag and drop or click to browse</p>
                      <p className="text-gray-500 text-[12px] mt-4">Max 25MB and 150 pages per PDF</p>
                   </label>
                 </div>
               )}

               {uploadTab === 'Zotero' && (
                 <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-lg relative">
                       <span className="text-4xl font-black text-red-500">Z</span>
                       <div className="absolute inset-0 bg-gradient-to-tr from-orange-400/20 to-transparent rounded-2xl"></div>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Connect Zotero Account</h2>
                    <p className="text-gray-400 text-[14px] mb-6">Import PDFs and metadata from Zotero to use in Pinnovix.</p>
                    
                    <input type="text" value={zoteroId} onChange={e => setZoteroId(e.target.value)} placeholder="Zotero User ID" className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-white text-[14px] outline-none focus:border-[#5b5fff] transition-colors mb-3" />
                    <input type="password" value={zoteroKey} onChange={e => setZoteroKey(e.target.value)} placeholder="Zotero API Key" className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-white text-[14px] outline-none focus:border-[#5b5fff] transition-colors mb-6" />

                    <button onClick={handleZoteroSync} disabled={isFetchingLibrary || !zoteroId || !zoteroKey} className="w-full bg-[#5b5fff] hover:bg-[#6b6fff] disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-[15px] transition-colors shadow-sm flex items-center justify-center gap-2">
                      {isFetchingLibrary ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Connect Zotero
                    </button>
                 </div>
               )}

               {uploadTab === 'Mendeley' && (
                 <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                    <div className="w-16 h-16 bg-[#9b0000] rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                       <span className="text-4xl font-black text-white font-serif">M</span>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Connect Mendeley Account</h2>
                    <p className="text-gray-400 text-[14px] mb-6">Import PDFs and metadata from Mendeley to use in Pinnovix.</p>

                    <input type="password" value={mendeleyToken} onChange={e => setMendeleyToken(e.target.value)} placeholder="Elsevier/Mendeley Access Token" className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-white text-[14px] outline-none focus:border-[#5b5fff] transition-colors mb-6" />

                    <button onClick={handleMendeleySync} disabled={isFetchingLibrary || !mendeleyToken} className="w-full bg-[#5b5fff] hover:bg-[#6b6fff] disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-[15px] transition-colors shadow-sm flex items-center justify-center gap-2">
                      {isFetchingLibrary ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Connect Mendeley
                    </button>
                 </div>
               )}

               {uploadTab === 'Paste ID' && (
                 <div className="flex-1 flex flex-col">
                   <div className="flex items-center gap-2 mb-6">
                     <span className="text-[13px] text-gray-400">Select collection:</span>
                     <div className="px-3 py-1.5 border border-[#333] rounded-lg bg-[#1a1a1a] flex items-center gap-2 text-[13px] font-bold text-gray-200 cursor-pointer">
                       <div className="w-3.5 h-3.5 flex flex-col gap-[2px]">
                         <div className="w-full h-[1px] bg-gray-400"></div>
                         <div className="w-full h-[1px] bg-gray-400"></div>
                         <div className="w-[60%] h-[1px] bg-gray-400"></div>
                       </div>
                       All Sources
                       <ChevronRight className="w-3.5 h-3.5 rotate-90 text-gray-500" />
                     </div>
                   </div>

                   <h3 className="text-[14px] font-bold text-white mb-2">Fetch metadata by DOI, PMID, arXiv URL, or ISBN</h3>
                   <div className="flex gap-2 mb-8 relative">
                     <input type="text" value={fetchId} onChange={e => setFetchId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleFetchId()} className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white text-[14px] outline-none focus:border-[#5b5fff] transition-colors" placeholder="e.g. 10.1038/s41522-018-0073-2" disabled={isFetchingLibrary} />
                     <button onClick={handleFetchId} disabled={isFetchingLibrary} className="w-[52px] h-[46px] rounded-lg bg-[#293b6e] flex items-center justify-center hover:bg-[#344a8a] disabled:opacity-50 transition-colors shrink-0">
                       {isFetchingLibrary ? <Loader2 className="w-5 h-5 text-[#6d93e8] animate-spin" /> : <Search className="w-5 h-5 text-[#6d93e8]" />}
                     </button>
                   </div>

                   <h3 className="text-[14px] font-bold text-white mb-4">Try one of these examples:</h3>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="bg-[#151515] border border-[#2a2a2a] rounded-xl p-4 flex flex-col hover:border-[#444] cursor-pointer transition-colors">
                        <span className="text-[15px] font-bold text-white">DOI</span>
                        <span className="text-[12px] text-gray-500 mb-3">Digital Object Identifier</span>
                        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-center text-gray-300 text-[13px]">
                          10.1038/s41522-018-0073-2
                        </div>
                     </div>
                     <div className="bg-[#151515] border border-[#2a2a2a] rounded-xl p-4 flex flex-col hover:border-[#444] cursor-pointer transition-colors">
                        <span className="text-[15px] font-bold text-white">PMID</span>
                        <span className="text-[12px] text-gray-500 mb-3">PubMed identifier</span>
                        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-center text-gray-300 text-[13px]">
                          34234088
                        </div>
                     </div>
                     <div className="bg-[#151515] border border-[#2a2a2a] rounded-xl p-4 flex flex-col hover:border-[#444] cursor-pointer transition-colors">
                        <span className="text-[15px] font-bold text-white">arXiv</span>
                        <span className="text-[12px] text-gray-500 mb-3">arXiv preprint URL</span>
                        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-center text-gray-300 text-[13px] truncate">
                          https://arxiv.org/abs/2306.01643
                        </div>
                     </div>
                     <div className="bg-[#151515] border border-[#2a2a2a] rounded-xl p-4 flex flex-col hover:border-[#444] cursor-pointer transition-colors">
                        <span className="text-[15px] font-bold text-white">ISBN</span>
                        <span className="text-[12px] text-gray-500 mb-3">International Standard Book Number</span>
                        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-center text-gray-300 text-[13px]">
                          0374533555
                        </div>
                     </div>
                   </div>

                 </div>
               )}
            </div>
          </div>
        </div>
  );
}
