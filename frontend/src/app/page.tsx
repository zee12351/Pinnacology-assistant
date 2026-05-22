'use client';
import { useState, useRef, useEffect } from 'react';
import { PanelLeftClose, Plus, Home, BookOpen, Search, ArrowRight, Settings2, Sparkles, LayoutTemplate, Zap, HelpCircle, Copy, Save, Square, MessageSquare, Paperclip, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

// Extracted outside to prevent remounting / focus-loss bugs
const SearchBar = ({ 
  query, setQuery, loading, handleSend, isChatActive, 
  corpusActive, setCorpusActive, 
  deepActive, setDeepActive, 
  filterActive, setFilterActive,
  handleStop,
  handleFileUpload,
  uploadingDoc
}: any) => (
  <div className={`w-full max-w-3xl bg-[#222222] border border-white/10 rounded-2xl p-2 flex flex-col shadow-2xl transition-all hover:border-white/20 focus-within:border-white/30 relative ${isChatActive ? 'mt-4' : ''}`}>
    
    {/* Floating Stop Button when loading */}
    {loading && isChatActive && (
      <div className="absolute -top-12 left-1/2 -translate-x-1/2">
        <button onClick={handleStop} className="flex items-center gap-2 px-4 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-white/10 shadow-lg text-gray-300 rounded-full transition-colors text-xs font-medium">
          <Square className="w-3 h-3 fill-current" />
          Stop generating
        </button>
      </div>
    )}

    <textarea 
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!loading && query.trim()) handleSend();
        }
      }}
      placeholder="Ask the research..."
      rows={Math.min(8, Math.max(1, query.split('\n').length))}
      className="w-full bg-transparent text-white px-4 pt-4 pb-2 text-lg outline-none placeholder:text-gray-500 resize-none overflow-y-auto min-h-[56px]"
      className="w-full bg-transparent text-white px-4 pt-4 pb-2 text-lg outline-none placeholder:text-gray-500 resize-none overflow-y-auto min-h-[56px]"
      disabled={loading}
    />
    
    <div className="flex items-center justify-between mt-2 px-2 pb-2">
      <div className="flex gap-2">
        <label className={`flex items-center justify-center w-8 h-8 rounded-full border border-white/10 hover:bg-white/5 transition-colors cursor-pointer ${uploadingDoc ? 'opacity-50 pointer-events-none' : ''}`}>
          <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={uploadingDoc} />
          {uploadingDoc ? (
            <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <Plus className="w-4 h-4 text-gray-300" />
          )}
        </label>
        <button 
          onClick={() => setCorpusActive(!corpusActive)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors text-xs font-medium ${corpusActive ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-white/10 hover:bg-white/5 text-gray-300'}`}>
          <Plus className="w-3.5 h-3.5" />
          Corpus <span className="text-[10px]">▼</span>
        </button>
        <button 
          onClick={() => setDeepActive(!deepActive)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed transition-colors text-xs font-medium ${deepActive ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'border-gray-500 hover:bg-white/5 text-gray-400'}`}>
          <Sparkles className="w-3.5 h-3.5" />
          Deep +
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button 
          onClick={() => setFilterActive(!filterActive)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors text-xs font-medium ${filterActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-gray-300'}`}>
          <Settings2 className="w-3.5 h-3.5" />
          Filter
        </button>
        <button 
          onClick={() => {
             if (!loading && query.trim()) handleSend();
          }}
          disabled={loading || !query.trim()}
          className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500 flex items-center justify-center transition-colors">
          <ArrowRight className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  </div>
);

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isChatActive, setIsChatActive] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  
  // History State
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // Toggles for UI mockup buttons
  const [corpusActive, setCorpusActive] = useState(false);
  const [deepActive, setDeepActive] = useState(false);
  const [filterActive, setFilterActive] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('pinnacology_history');
    if (saved) {
      try {
        setChatHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history");
      }
    }
  }, []);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, isChatActive]);

  // Sync current chat to history
  useEffect(() => {
    if (currentChatId && messages.length > 0) {
      setChatHistory(prev => {
        const existing = prev.find(c => c.id === currentChatId);
        let updated;
        if (existing) {
          updated = prev.map(c => c.id === currentChatId ? { ...c, messages } : c);
        } else {
          updated = [{ id: currentChatId, title: messages[0].content.substring(0, 30) + '...', messages }, ...prev];
        }
        localStorage.setItem('pinnacology_history', JSON.stringify(updated));
        return updated;
      });
    }
  }, [messages, currentChatId]);

  const handleSend = async (textToSubmit?: string) => {
    const text = textToSubmit || query;
    if (!text.trim()) return;
    
    // Assign new ID if this is a fresh chat
    if (!currentChatId) {
      setCurrentChatId(Date.now().toString());
    }

    setIsChatActive(true);
    const newMessages = [...messages, { role: 'user', content: text } as Message];
    setMessages(newMessages);
    setQuery('');
    setLoading(true);

    // Setup abort controller
    abortControllerRef.current = new AbortController();

    try {
      const response = await axios.post('http://localhost:8000/api/chat', {
        message: text,
        agent_type: 'research',
        use_rag: true
      }, {
        signal: abortControllerRef.current.signal
      });
      setMessages([...newMessages, { role: 'assistant', content: response.data.response }]);
    } catch (error: any) {
      if (axios.isCancel(error)) {
        console.log('Request canceled', error.message);
      } else {
        console.error(error);
        setMessages([...newMessages, { role: 'assistant', content: 'Error communicating with the research agent. Ensure the backend is running and you have not exceeded your API quota.' }]);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
      setMessages(prev => [...prev, { role: 'assistant', content: '*Generation stopped by user.*' }]);
    }
  };

  const handleNewThread = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setMessages([]);
    setQuery('');
    setIsChatActive(false);
    setCurrentChatId(null);
  };

  const loadChat = (id: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const chat = chatHistory.find(c => c.id === id);
    if (chat) {
      setCurrentChatId(id);
      setMessages(chat.messages);
      setIsChatActive(true);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleSaveDoc = (text: string) => {
    const content = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Pinnacology Output</title></head>
      <body>${text.replace(/\n/g, '<br/>')}</body>
      </html>
    `;
    const blob = new Blob([content], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Pinnacology_Output.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingDoc(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post('http://localhost:8000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert(`Successfully uploaded and analyzed ${file.name}`);
    } catch (error) {
      console.error(error);
      alert('Failed to upload PDF. Check backend logs.');
    } finally {
      setUploadingDoc(false);
      e.target.value = ''; // Reset input
    }
  };

  const searchBarProps = {
    query, setQuery, loading, handleSend, handleStop, isChatActive,
    corpusActive, setCorpusActive,
    deepActive, setDeepActive,
    filterActive, setFilterActive,
    handleFileUpload, uploadingDoc
  };

  return (
    <div className="flex h-screen w-full bg-[#121212] text-white font-sans overflow-hidden">
      
      {/* LEFT SIDEBAR */}
      <div className="w-[280px] bg-[#1a1a1a] border-r border-white/5 flex flex-col justify-between shrink-0 hidden md:flex">
        
        <div className="flex flex-col h-full overflow-hidden">
          <div className="p-4 flex flex-col gap-6">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center shadow-lg">
                <BookOpen className="text-white w-4 h-4" />
              </div>
              <button className="text-gray-400 hover:text-white transition-colors">
                <PanelLeftClose className="w-5 h-5" />
              </button>
            </div>

            {/* New Thread */}
            <button onClick={handleNewThread} className="flex items-center gap-3 text-sm font-medium w-full hover:bg-white/5 p-2 rounded-lg transition-colors">
              <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0 shadow-lg">
                <Plus className="w-4 h-4 text-white" />
              </div>
              New Thread
            </button>

            {/* Navigation */}
            <nav className="flex flex-col gap-1">
              <button onClick={handleNewThread} className="flex items-center gap-3 text-sm font-medium w-full hover:bg-white/5 p-2 rounded-lg transition-colors">
                <Home className="w-5 h-5 text-gray-400" />
                Home
              </button>
            </nav>
          </div>

          {/* Chat History Section */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {chatHistory.length > 0 && (
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2 pt-4">Recent Chats</h3>
                {chatHistory.map(chat => (
                  <button 
                    key={chat.id} 
                    onClick={() => loadChat(chat.id)}
                    className={`flex items-center gap-3 text-sm text-left w-full p-2 rounded-lg transition-colors ${currentChatId === chat.id ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                  >
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span className="truncate flex-1">{chat.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Auth Buttons */}
        <div className="p-4 flex flex-col gap-3 shrink-0 border-t border-white/5">
          <button className="w-full py-2.5 rounded-full border border-white/10 hover:bg-white/5 transition-colors text-sm font-medium">
            Sign in
          </button>
          <button className="w-full py-2.5 rounded-full bg-blue-500 hover:bg-blue-600 transition-colors text-sm font-medium shadow-lg">
            Sign up
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col relative h-full w-full">
        
        {/* Top Right Header */}
        {!isChatActive && (
          <div className="absolute top-4 right-6 z-10 hidden md:block">
            <button className="px-5 py-2 rounded-full bg-blue-500 hover:bg-blue-600 transition-colors text-sm font-medium shadow-lg">
              Sign up
            </button>
          </div>
        )}

        {/* CHAT/SEARCH CONTAINER */}
        <div className="flex-1 flex flex-col w-full max-w-4xl mx-auto px-4 md:px-8 overflow-hidden h-full">
          
          {!isChatActive ? (
            // ==========================================
            // LANDING PAGE VIEW
            // ==========================================
            <div className="flex-1 flex flex-col items-center justify-center w-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center shadow-lg">
                  <BookOpen className="text-white w-4 h-4" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Pinnacology Assistant</h1>
              </div>
              
              <h2 className="text-3xl md:text-4xl font-bold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Research starts here</h2>

              <SearchBar {...searchBarProps} />


            </div>
          ) : (
            // ==========================================
            // CHAT VIEW
            // ==========================================
            <div className="flex-1 flex flex-col min-h-0 w-full pt-8 pb-4">
              
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5 shrink-0">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center shadow-sm">
                  <BookOpen className="text-white w-3 h-3" />
                </div>
                <h1 className="text-lg font-bold tracking-tight text-gray-300">Pinnacology Assistant</h1>
              </div>

              {/* Chat Messages */}
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 space-y-8 pr-2 pb-4 scroll-smooth">
                {messages.map((m, i) => (
                  <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-5 shadow-sm ${m.role === 'user' ? 'bg-[#2A2A2A] text-white' : 'bg-transparent text-gray-200'}`}>
                      {m.role === 'assistant' && (
                        <div className="flex items-center gap-2 mb-3">
                           <div className="w-5 h-5 rounded bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center shrink-0">
                            <BookOpen className="text-white w-2.5 h-2.5" />
                          </div>
                          <span className="font-semibold text-sm">Pinnacology</span>
                        </div>
                      )}
                      <div className="prose prose-invert max-w-none text-base leading-relaxed">
                        <ReactMarkdown>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                      
                      {m.role === 'assistant' && m.content !== '*Generation stopped by user.*' && (
                        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-white/5">
                          <button onClick={() => handleCopy(m.content)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-xs text-gray-300">
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </button>
                          <button onClick={() => handleSaveDoc(m.content)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors text-xs font-medium">
                            <Save className="w-3.5 h-3.5" />
                            Save as Word
                          </button>
                          <button onClick={() => alert("Turnitin API Connection Pending")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors text-xs font-medium ml-auto">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Check Plagiarism (Turnitin)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {loading && (
                  <div className="flex justify-start w-full">
                    <div className="bg-transparent text-gray-200 rounded-2xl p-5 max-w-[85%]">
                      <div className="flex items-center gap-2 mb-3">
                         <div className="w-5 h-5 rounded bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center shrink-0">
                          <BookOpen className="text-white w-2.5 h-2.5" />
                        </div>
                        <span className="font-semibold text-sm">Pinnacology</span>
                      </div>
                      <span className="flex gap-1.5 mt-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Fixed Input at Bottom */}
              <div className="w-full shrink-0 pt-2">
                <SearchBar {...searchBarProps} />
              </div>
            </div>
          )}
          
        </div>

        {/* Footer (Only in landing view) */}
        {!isChatActive && (
          <div className="w-full flex items-center justify-between p-6 mt-auto">
            <div className="flex-1 flex justify-center">
              <p className="text-sm font-medium text-gray-400">The new standard for academic research</p>
            </div>
            <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors absolute right-6">
              <HelpCircle className="w-4 h-4 text-gray-300" />
            </button>
          </div>
        )}

      </div>

    </div>
  );
}
