'use client';
import { useState, useRef, useEffect } from 'react';
import { PanelLeftClose, PanelLeftOpen, Plus, Home, MessageSquare, Square, ArrowRight, Settings2, ChevronDown, Moon, LayoutPanelLeft, MonitorSmartphone, Keyboard, EyeOff, X, Check } from 'lucide-react';
import { useTheme } from 'next-themes';
import axios from 'axios';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PersonaGrid } from '@/components/PersonaGrid';
import { DefaultChatView } from '@/components/DefaultChatView';
import { AcademicWritingView } from '@/components/AcademicWritingView';
import { LiteratureReviewView } from '@/components/LiteratureReviewView';
import { UploadModal } from '@/components/UploadModal';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

const SearchBar = ({ 
  query, setQuery, loading, handleSend, isChatActive, 
  handleStop, uploadingDoc, setShowUploadModal,
  selectedPersona, setSelectedPersona,
  isPersonaDropdownOpen, setIsPersonaDropdownOpen,
  uploadedFiles, setUploadedFiles
}: any) => (
  <div className={`w-full max-w-3xl bg-muted border border-border rounded-3xl p-3 flex flex-col transition-all relative ${isChatActive ? 'mt-4' : ''}`}>
    {loading && isChatActive && (
      <div className="absolute -top-12 left-1/2 -translate-x-1/2">
        <button onClick={handleStop} className="flex items-center gap-2 px-4 py-2 bg-card hover:bg-muted border border-border shadow-md text-foreground rounded-full transition-colors text-xs font-medium">
          <Square className="w-3 h-3 fill-current" />
          Stop generating
        </button>
      </div>
    )}

    {uploadedFiles && uploadedFiles.length > 0 && !isChatActive && (
      <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
        {uploadedFiles.map((f: any, i: number) => (
          <div key={i} className="flex items-center gap-2 bg-[#1b1c3a] border border-[#2a2b4a] rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-gray-200">
            <div className="w-5 h-5 rounded bg-[#6d93e8] text-white flex items-center justify-center text-[10px] font-bold shrink-0">DOC</div>
            <span className="truncate max-w-[150px]">{f.name}</span>
            <button onClick={() => setUploadedFiles((prev: any[]) => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-white shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
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
      className="w-full bg-transparent text-foreground px-4 pt-4 pb-2 text-lg outline-none placeholder:text-muted-foreground resize-none overflow-y-auto min-h-[56px]"
      disabled={loading}
    />
    
    <div className="flex items-center justify-between mt-2 px-2 pb-2">
      <div className="flex gap-2">
        <button onClick={() => setShowUploadModal(true)} disabled={uploadingDoc} className={`flex items-center justify-center w-8 h-8 rounded-full border border-border hover:bg-muted transition-colors cursor-pointer ${uploadingDoc ? 'opacity-50 pointer-events-none' : ''}`}>
          {uploadingDoc ? (
            <span className="w-3.5 h-3.5 border-2 border-muted-foreground border-t-foreground rounded-full animate-spin" />
          ) : (
            <Plus className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {/* Persona Dropdown removed as per request */}
      </div>

      <div className="flex items-center gap-3">
        <button 
          onClick={() => {
             if (!loading && query.trim()) handleSend();
          }}
          disabled={loading || !query.trim()}
          className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center transition-colors">
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
  const [uploadedFiles, setUploadedFiles] = useState<{name: string}[]>([]);
  
  // Custom states for specialized views
  const [documentContent, setDocumentContent] = useState('');
  const [structuredPapers, setStructuredPapers] = useState([]);
  const [aiResponse, setAiResponse] = useState('');
  const [generatedSources, setGeneratedSources] = useState<any[]>([]);

  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [selectedPersona, setSelectedPersona] = useState('ACADEMIC WRITING');
  const [isPersonaDropdownOpen, setIsPersonaDropdownOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const { theme, setTheme } = useTheme();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleUrl = () => {
      const pathname = window.location.pathname;
      if (pathname.startsWith('/home/')) {
        const slug = pathname.replace('/home/', '');
        if (slug) {
          const decodedPersona = slug.replace(/-/g, ' ').toUpperCase();
          if (decodedPersona !== selectedPersona || !isChatActive) {
            setSelectedPersona(decodedPersona);
            setMessages([]);
            setCurrentChatId(null);
            setQuery('');
            setIsChatActive(true);
          }
        }
      } else if (pathname === '/' || pathname === '/home') {
        setIsChatActive(false);
      }
    };

    handleUrl(); // Run once on mount

    const handlePopState = () => {
      handleUrl();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleSend = async (textToSubmit?: string, bypassUiUpdate = false) => {
    const text = textToSubmit || query;
    if (!text.trim()) return;
    
    if (!currentChatId) {
      setCurrentChatId(Date.now().toString());
    }

    if (!bypassUiUpdate) {
      setIsChatActive(true);
      setMessages(prev => [...prev, { role: 'user', content: text } as Message]);
      setQuery('');
    }
    
    setLoading(true);
    setAiResponse('');

    abortControllerRef.current = new AbortController();

    try {
      // Create a simplified history array for the backend
      const historyPayload = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'ai',
        content: msg.content
      }));

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text, 
          history: historyPayload,
          persona: selectedPersona 
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      if (!bypassUiUpdate) {
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      }

      let buffer = '';
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'token') {
                assistantMessage += data.content;
                if (!bypassUiUpdate) {
                  setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].content = assistantMessage;
                    return newMessages;
                  });
                } else {
                  setAiResponse(assistantMessage);
                }
              } else if (data.type === 'papers') {
                // Parse structured JSON for literature review
                try {
                  setStructuredPapers(data.content);
                } catch(e) {}
              } else if (data.error) {
                assistantMessage = '⚠️ ' + data.error;
                if (!bypassUiUpdate) {
                  setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].content = assistantMessage;
                    return newMessages;
                  });
                } else {
                  setAiResponse(assistantMessage);
                }
              }
            } catch (e) {
              console.error("Failed to parse SSE", e);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content += "\n\n*Generation stopped by user.*";
            return newMessages;
        });
      } else {
        console.error('Error fetching stream:', error);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };
  const handleGenerateDocument = async (promptData: string) => {
    setLoading(true);
    setDocumentContent('Thinking...');
    setGeneratedSources([]);
    setIsChatActive(true);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/generate-paper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          topic: promptData, 
          persona: selectedPersona 
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      let buffer = '';
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'token') {
                assistantMessage += data.content;
                setDocumentContent(assistantMessage);
              } else if (data.type === 'sources') {
                setGeneratedSources(data.sources || []);
              } else if (data.error) {
                assistantMessage = '⚠️ ' + data.error;
                setDocumentContent(assistantMessage);
              }
            } catch (e) {
              console.error("Failed to parse SSE", e);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error fetching stream:', error);
        setDocumentContent('⚠️ Could not reach the AI service. Please check your connection and try again.');
      }
    } finally {
      setDocumentContent((prev: string) => (prev === 'Thinking...' ? '⚠️ No response was generated. The service may be busy or rate-limited — please wait a moment and try again.' : prev));
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleNewThread = () => {
    window.history.pushState(null, '', '/');
    setIsChatActive(false);
  };

  const loadChat = (id: string) => {
    const chat = chatHistory.find(c => c.id === id);
    if (chat) {
      setMessages(chat.messages);
      setCurrentChatId(id);
      setIsChatActive(true);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleSaveDoc = async (text: string) => {
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/export-docx`, { markdown_text: text }, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Pinnovix_Expert_Output.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to generate Word Document.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingDoc(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      
      if (!isChatActive) {
        setUploadedFiles(prev => [...prev, { name: file.name }]);
      } else if (selectedPersona === 'ACADEMIC WRITING') {
        alert(`Document '${file.name}' successfully uploaded and added to your library!`);
      } else {
        handleSend(`I have uploaded a new document named '${file.name}'. Please analyze its contents.`);
      }
    } catch (error: any) {
      console.error(error);
      const detail = error.response?.data?.detail || error.message || 'Unknown error';
      alert(`Failed to upload and analyze document: ${detail}`);
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  // Academic Writing tools handler
  const handleToolAction = async (actionType: string) => {
    let prompt = "";
    if (!documentContent.trim()) {
      alert("Please write something in the document editor first.");
      return;
    }
    if (actionType === 'claim_confidence') {
      prompt = `Review the following academic text, check its claims, identify missing or weak citations, and suggest references to avoid plagiarism:\n\n"${documentContent}"`;
    } else if (actionType === 'peer_review') {
      prompt = `Act as an expert academic peer reviewer. Critically review the following text for logical consistency, strength of arguments, and academic rigor. Provide constructive feedback:\n\n"${documentContent}"`;
    } else if (actionType === 'proofread') {
      prompt = `Act as an expert proofreader. Identify and correct any grammatical errors, punctuation mistakes, and poor word choices in the following text. Provide the corrected version and briefly list the major changes:\n\n"${documentContent}"`;
    }

    setAiResponse("Analyzing document...");
    // Bypass updating the main chat UI and just use the aiResponse state
    handleSend(prompt, true);
  };

  const handleEvidenceVerification = (text: string) => {
    const prompt = `Critically review the following text, check its claims, identify missing or weak citations, and provide evidence verification with proper insight:\n\n"${text}"`;
    handleSend(prompt);
  };

  const searchBarProps = {
    query, setQuery, loading, handleSend, handleStop, isChatActive,
    handleFileUpload, uploadingDoc, setShowUploadModal,
    selectedPersona, setSelectedPersona,
    isPersonaDropdownOpen, setIsPersonaDropdownOpen,
    uploadedFiles, setUploadedFiles
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground font-sans overflow-hidden">
      
      {/* LEFT SIDEBAR */}
      {isLeftSidebarOpen && (!isChatActive || selectedPersona !== 'ACADEMIC WRITING') && selectedPersona !== 'LITERATURE REVIEW' && (
        <div className="w-[240px] bg-card border-r border-border flex flex-col justify-between shrink-0 hidden md:flex z-10 relative">
          <div className="flex flex-col h-full overflow-hidden w-full">
            <div className="p-4 flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg tracking-wide text-foreground">Pinnovix</span>
                  <div className="w-6 h-6 rounded bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center shadow-lg text-white font-bold text-[10px]">
                    Ai
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsLeftSidebarOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted">
                    <PanelLeftClose className="w-5 h-5" />
                  </button>
                </div>
              </div>

            </div>
            
            <div className="p-4 flex flex-col gap-2 mt-auto border-t border-border">
              <button 
                onClick={() => setIsPreferencesOpen(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                Theme Toggle
              </button>
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors shadow-sm">
                See Pricing
              </button>
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors shadow-sm">
                Login / Sign Up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CENTER WORKSPACE */}
      <div className="flex-1 flex flex-col relative transition-all duration-300">
        
        {!isLeftSidebarOpen && (
          <button 
            onClick={() => setIsLeftSidebarOpen(true)}
            className="absolute top-4 left-4 z-50 p-2 bg-card border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors shadow-md"
            title="Open Sidebar"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        )}
        
        {selectedPersona === 'LITERATURE REVIEW' ? (
          <div className="flex-1 min-h-0 h-full overflow-hidden">
            <LiteratureReviewView messages={messages} onHome={() => { setSelectedPersona('ACADEMIC WRITING'); setIsChatActive(false); window.history.pushState(null, '', '/home'); }} />
          </div>
        ) : !isChatActive ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-start md:justify-center p-6 h-full overflow-y-auto custom-scrollbar">
            <PersonaGrid 
              selectedPersona={selectedPersona} 
              onSelectPersona={setSelectedPersona} 
              onActivate={(id: string) => {
                const urlSlug = id.toLowerCase().replace(/\s+/g, '-');
                window.history.pushState(null, '', `/home/${urlSlug}`); setMessages([]); setDocumentContent(''); setStructuredPapers([]); setAiResponse(''); setCurrentChatId(null); setQuery('');
                setIsChatActive(true);
              }}
            />
            <div className="w-full max-w-3xl mt-4">
              <SearchBar {...searchBarProps} />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full">
            {/* Dynamic View Rendering */}
            <div className="flex-1 overflow-hidden" ref={scrollContainerRef}>
              {selectedPersona === 'ACADEMIC WRITING' ? (
                <AcademicWritingView 
                  documentContent={documentContent}
                  setDocumentContent={setDocumentContent}
                  loading={loading}
                  handleToolAction={handleToolAction}
                  aiResponse={aiResponse}
                  handleGoHome={() => handleNewThread()}
                  handleGenerateDocument={handleGenerateDocument}
                  generatedSources={generatedSources}
                />
              ) : selectedPersona === 'LITERATURE REVIEW' ? (
                <LiteratureReviewView 
                  messages={messages}
                  loading={loading}
                  structuredPapers={structuredPapers}
                />
              ) : (
                <DefaultChatView 
                  messages={messages}
                  loading={loading}
                  handleCopy={handleCopy}
                  handleSaveDoc={handleSaveDoc}
                  selectedPersona={selectedPersona}
                  handleGoHome={() => handleNewThread()}
                  handleEvidenceVerification={handleEvidenceVerification}
                />
              )}
            </div>
            
            {/* Bottom Search Bar (hidden in Academic Writing view because it relies on the sidebar tools) */}
            {selectedPersona !== 'ACADEMIC WRITING' && (
              <div className="w-full shrink-0 pt-2 pb-6 px-4 md:px-8 bg-background border-t border-border flex justify-center">
                <SearchBar {...searchBarProps} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preferences Modal */}
      {isPreferencesOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[500px] bg-[#151515] rounded-xl border border-[#333] shadow-2xl flex flex-col overflow-hidden text-white font-sans">
            {/* Header */}
            <div className="px-6 py-4 flex justify-between items-center border-b border-[#2a2a2a]">
              <h2 className="text-lg font-bold">Preferences</h2>
              <button onClick={() => setIsPreferencesOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Body */}
            <div className="flex flex-col">
              
              {/* Theme */}
              <div className="px-6 py-5 border-b border-[#2a2a2a] flex justify-between items-center">
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-[14px]">Theme</span>
                  <span className="text-[13px] text-gray-400">Select your theme preference.</span>
                </div>
                <div className="relative group">
                  <select 
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="appearance-none bg-[#111] border border-[#444] rounded-lg pl-9 pr-8 py-2 text-[14px] font-medium text-white focus:outline-none focus:border-blue-500 hover:border-gray-400 transition-colors cursor-pointer min-w-[120px]"
                  >
                    <option value="system">System</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                  <Moon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-300" />
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                </div>
              </div>

              {/* Position */}
              <div className="px-6 py-5 border-b border-[#2a2a2a] flex justify-between items-center">
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-[14px]">Position</span>
                  <span className="text-[13px] text-gray-400">Adjust the placement of your dev tools.</span>
                </div>
                <div className="relative">
                  <select className="appearance-none bg-[#111] border border-[#444] rounded-lg pl-4 pr-8 py-2 text-[14px] font-medium text-white hover:border-gray-400 transition-colors cursor-pointer min-w-[140px]">
                    <option>Bottom Left</option>
                    <option>Bottom Right</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                </div>
              </div>

              {/* Size */}
              <div className="px-6 py-5 border-b border-[#2a2a2a] flex justify-between items-center">
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-[14px]">Size</span>
                  <span className="text-[13px] text-gray-400">Adjust the size of your dev tools.</span>
                </div>
                <div className="relative">
                  <select className="appearance-none bg-[#111] border border-[#444] rounded-lg pl-4 pr-8 py-2 text-[14px] font-medium text-white hover:border-gray-400 transition-colors cursor-pointer min-w-[100px]">
                    <option>Small</option>
                    <option>Large</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                </div>
              </div>

              {/* Hide Dev Tools for this session */}
              <div className="px-6 py-5 border-b border-[#2a2a2a] flex justify-between items-center">
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-[14px]">Hide Dev Tools for this session</span>
                  <span className="text-[13px] text-gray-400">Hide Dev Tools until you restart your dev server, or 1 day.</span>
                </div>
                <button className="border border-[#444] bg-[#111] hover:bg-[#2a2a2a] rounded-lg px-4 py-2 flex items-center gap-2 text-[14px] font-medium transition-colors">
                  <EyeOff className="w-4 h-4" /> Hide
                </button>
              </div>

              {/* Hide Dev Tools shortcut */}
              <div className="px-6 py-5 border-b border-[#2a2a2a] flex justify-between items-center">
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-[14px]">Hide Dev Tools shortcut</span>
                  <span className="text-[13px] text-gray-400">Set a custom keyboard shortcut to toggle visibility.</span>
                </div>
                <button className="border border-dashed border-[#444] bg-[#111] hover:border-gray-400 rounded-lg px-4 py-2 text-[14px] font-medium transition-colors text-gray-300">
                  Record Shortcut
                </button>
              </div>

              {/* Disable Dev Tools for this project */}
              <div className="px-6 py-5 bg-[#1a1a1a]">
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-[14px]">Disable Dev Tools for this project</span>
                  <span className="text-[13px] text-gray-400">
                    To disable this UI completely, set <code className="bg-[#333] px-1.5 py-0.5 rounded text-gray-300 font-mono">devIndicators: false</code> in your next.config file.
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      <UploadModal 
        showUploadModal={showUploadModal} 
        setShowUploadModal={setShowUploadModal} 
        handleFileUpload={handleFileUpload} 
        uploadingDoc={uploadingDoc} 
      />
    </div>
  );
}
