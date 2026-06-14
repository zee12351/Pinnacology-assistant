import React, { useState, useEffect } from 'react';
import { Plus, MessageSquare, Clock, CheckCircle, ChevronRight, ChevronUp, Upload, X, Search, Check, Star, Users, ListChecks, Play, SlidersHorizontal, ChevronsRight, ChevronsLeft, Type, Home, Settings2, Download, ThumbsUp, ThumbsDown, Info, ChevronDown, GraduationCap, FlaskConical, Feather, CheckCircle2, ChevronLeft, RotateCcw, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import mermaid from 'mermaid';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { Mark, mergeAttributes } from '@tiptap/core';
import axios from 'axios';
import { UploadModal } from './UploadModal';

// Initialize Mermaid
mermaid.initialize({ startOnLoad: false, theme: 'dark' });

const CitationMark = Mark.create({
  name: 'citation',
  addOptions() { return { HTMLAttributes: { class: 'text-[#464eb8] cursor-pointer hover:underline', 'data-citation': 'true' } } },
  parseHTML() { return [{ tag: 'span[data-citation]' }] },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0] },
});

export function AcademicWritingView({ documentContent, setDocumentContent, loading, handleToolAction, aiResponse, handleFileUpload, uploadingDoc, handleGoHome, handleGenerateDocument }: any) {
  
  // State for chat history
  const [chatHistory, setChatHistory] = useState<any[]>([
    { id: 1, title: 'New Project', date: 'Today', content: '', isEditing: false }
  ]);
  const [activeChatId, setActiveChatId] = useState(1);
  const [selectedChats, setSelectedChats] = useState<number[]>([]);
  const [promptExpanded, setPromptExpanded] = useState(true);
  const [promptInput, setPromptInput] = useState('');
  
  // Editor State
  const [isEditing, setIsEditing] = useState(false);
  const [editInput, setEditInput] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTab, setUploadTab] = useState('Upload PDFs');
  const [activeReviewTab, setActiveReviewTab] = useState<string | null>(null);
  const [citationPopup, setCitationPopup] = useState({ visible: false, x: 0, y: 0, text: '' });
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewData, setReviewData] = useState<any>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [importedFileName, setImportedFileName] = useState('');
  const [localUploadingDoc, setLocalUploadingDoc] = useState(false);

  const [zoteroId, setZoteroId] = useState('');
  const [zoteroKey, setZoteroKey] = useState('');
  const [mendeleyToken, setMendeleyToken] = useState('');
  const [fetchId, setFetchId] = useState('');
  const [isFetchingLibrary, setIsFetchingLibrary] = useState(false);

  const handleZoteroSync = async () => {
    setIsFetchingLibrary(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/library/zotero`, {
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/library/mendeley`, {
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/library/fetch-id`, {
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

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.getAttribute('data-citation') === 'true' || target.closest('[data-citation="true"]')) {
      const el = target.getAttribute('data-citation') === 'true' ? target : target.closest('[data-citation="true"]') as HTMLElement;
      const rect = el.getBoundingClientRect();
      // Calculate position relative to the scrollable container or absolute window
      setCitationPopup({
        visible: true,
        x: rect.left,
        y: rect.bottom + window.scrollY,
        text: el.innerText
      });
    } else {
      setCitationPopup(prev => prev.visible ? { ...prev, visible: false } : prev);
    }
  };

  const handleEditRequest = async () => {
    if (!editInput.trim()) return;
    const instruction = editInput;
    setEditInput('');
    
    // Add a loading indicator locally
    const originalContent = editor?.getHTML() || '';
    if (editor) {
      editor.commands.setContent(originalContent + '<p><em>AI is writing...</em></p>', { emitUpdate: false });
    }

    const prompt = `Context of the current document:
${editor?.getText() || documentContent}

Instruction: ${instruction}

MANDATORY: Generate ONLY the new text to be appended or inserted based on the instruction. Do not rewrite the existing context. Do not include pleasantries. Output cleanly formatted Markdown.`;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: prompt, 
          agent_type: "review",
          use_rag: false,
          persona: "DOCUMENT ANALYST"
        })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let newContent = '';

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
                newContent += data.content;
                if (editor) {
                  // Import marked dynamically or use it if available
                  // Wait, marked is imported at the top of the file!
                  const htmlFragment = marked.parse(newContent);
                  editor.commands.setContent(originalContent + htmlFragment, { emitUpdate: false });
                }
              }
            } catch (e) {}
          }
        }
      }
    } catch(e) {
      console.error("Failed to stream edit", e);
      if (editor) editor.commands.setContent(originalContent, { emitUpdate: false });
    }
  };

  const handleDocumentImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLocalUploadingDoc(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Parse the document text
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/parse-document`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const text = response.data.text;
      
      // Also upload it to the library so the AI can reference it
      axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(e => console.error("Library upload failed", e));
      
      // Store in editor state but don't jump to editor yet
      setDocumentContent(text);
      if (editor) {
        editor.commands.setContent(marked.parse(text), { emitUpdate: false });
      }
      
      setImportedFileName(file.name);
    } catch (error: any) {
      console.error(error);
      const detail = error.response?.data?.detail || error.message || 'Unknown error';
      alert(`Failed to import document: ${detail}`);
    } finally {
      setLocalUploadingDoc(false);
      e.target.value = '';
    }
  };

  const fetchReview = async (prompt: string, fallback: any) => {
    setIsReviewing(true);
    setReviewData(null);
    setExpandedSection(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: prompt, 
          agent_type: "review",
          use_rag: false,
          persona: "ACADEMIC WRITING"
        })
      });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullJson = '';
      let buffer = '';
      if (reader) {
        while (true) {
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
                 if (data.type === 'token') fullJson += data.content;
               } catch(e) {}
            }
          }
        }
      }
      const jsonMatch = fullJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
         try {
           setReviewData(JSON.parse(jsonMatch[0]));
         } catch(parseErr) {
           console.warn("Failed to parse JSON from LLM:", parseErr, fullJson);
           setReviewData(fallback);
         }
      } else {
         console.warn("No JSON found in LLM response:", fullJson);
         setReviewData(fallback);
      }
    } catch (e) {
      console.warn("Network or stream error in fetchReview:", e);
      setReviewData(fallback);
    } finally {
      setIsReviewing(false);
    }
  };

  const handleClaimConfidence = () => {
    setActiveReviewTab('claim');
    fetchReview(`Review the following text for claims. Return ONLY a valid JSON object. Do not use markdown formatting. Format must be exactly:
{
  "type": "claim",
  "summary": "Brief summary of the claims found.",
  "misrepresented": ["Claim 1", "Claim 2"],
  "contradicted": ["Claim 1"],
  "unsupported": ["Claim 1"],
  "weaklySupported": ["Sentence 1 lacking citation"],
  "overstated": ["Claim 1"],
  "unverifiable": ["Claim 1"]
}
Text to review: "${editor?.getText() || documentContent}"`, {
      type: 'claim',
      summary: "Review completed, but no specific claims could be extracted.",
      misrepresented: [],
      contradicted: [],
      unsupported: [],
      weaklySupported: [],
      overstated: [],
      unverifiable: []
    });
  };

  const handlePeerReview = () => {
    setActiveReviewTab('peer');
    fetchReview(`Review the following text. Return ONLY a valid JSON object. Do not use markdown formatting. Format must be exactly:
{
  "type": "peer",
  "overall": "Brief 2-3 sentence overall assessment.",
  "strengths": ["Strength 1", "Strength 2"],
  "weaknesses": ["Weakness 1", "Weakness 2"]
}
Text to review: "${editor?.getText() || documentContent}"`, {
      type: 'peer',
      overall: "Review completed, but couldn't parse the exact strengths and weaknesses.",
      strengths: [],
      weaknesses: []
    });
  };

  const handleToneOfVoice = () => {
    setActiveReviewTab('tone');
    fetchReview(`Review the following text for tone. Return ONLY a valid JSON object. Do not use markdown formatting. Format must be exactly:
{
  "type": "tone",
  "suggestions": ["Suggestion 1", "Suggestion 2"]
}
Text to review: "${editor?.getText() || documentContent}"`, {
      type: 'tone',
      suggestions: []
    });
  };

  const handleProofread = () => {
    setActiveReviewTab('proofread');
    fetchReview(`Proofread the following text for grammar. Return ONLY a valid JSON object. Do not use markdown formatting. Format must be exactly:
{
  "type": "proofread",
  "issues": ["Issue 1 found", "Issue 2 found"]
}
Text to review: "${editor?.getText() || documentContent}"`, {
      type: 'proofread',
      issues: []
    });
  };

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('academic_projects_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          setChatHistory(parsed);
          setActiveChatId(parsed[0].id);
          if (parsed[0].content) {
            setDocumentContent(parsed[0].content);
          }
          if (parsed[0].isEditing) setIsEditing(true);
        }
      } catch (e) {
        console.error("Failed to load academic history", e);
      }
    }
  }, []);

  // Save to local storage when content changes
  useEffect(() => {
    setChatHistory(prev => {
      const updated = prev.map(chat => 
        chat.id === activeChatId ? { ...chat, content: documentContent, isEditing } : chat
      );
      // Only save if it's different to avoid infinite loops, but since we are mapping, let's just save.
      // Wait, we can't save on every render if we don't need to, but this is triggered by deps.
      localStorage.setItem('academic_projects_history', JSON.stringify(updated));
      return updated;
    });
  }, [documentContent, activeChatId, isEditing]);

  const [editorClickPos, setEditorClickPos] = useState({ x: 0, y: 0, text: '', visible: false });

  // Tiptap Editor Initialization
  const editor = useEditor({
    extensions: [
      StarterKit, 
      CitationMark, 
      Image.configure({ inline: true, HTMLAttributes: { class: 'rounded-lg my-4 max-w-full shadow-md object-contain max-h-[400px] mx-auto' } })
    ],
    content: documentContent || '<h2 class="text-3xl font-bold mb-4">Quantum Computing with Artificial Intelligence</h2><p class="mb-4">The convergence of artificial intelligence and quantum computing represents a paradigm shift in computational science. Quantum machine learning algorithms can solve problems that lie beyond the reach of classical computers <span data-citation="true">(Pineda et al., 2025)</span>.</p>',
    onUpdate: ({ editor }) => {
      setDocumentContent(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[500px] text-[15px] leading-relaxed',
      },
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement;
        if (target.getAttribute('data-citation') === 'true' || target.closest('[data-citation="true"]')) {
          const el = target.getAttribute('data-citation') === 'true' ? target : target.closest('[data-citation="true"]') as HTMLElement;
          const rect = el.getBoundingClientRect();
          setEditorClickPos({
            visible: true,
            x: rect.left,
            y: rect.bottom + window.scrollY,
            text: el.innerText
          });
          return true; // prevent default
        }
        setEditorClickPos(prev => prev.visible ? { ...prev, visible: false } : prev);
        return false;
      }
    },
  });

  useEffect(() => {
    if (editorClickPos.visible) {
      setCitationPopup(editorClickPos);
    } else {
      setCitationPopup(prev => prev.visible ? { ...prev, visible: false } : prev);
    }
  }, [editorClickPos]);

  // Sync external changes (like live streaming) to the editor
  useEffect(() => {
    if (editor && documentContent) {
      try {
        let htmlContent = documentContent;
        if (documentContent === 'Thinking...') {
          htmlContent = '<p class="text-gray-400 italic">Thinking...</p>';
        } else {
          htmlContent = marked.parse(documentContent, { breaks: true, gfm: true }) as string;
        }
        if (editor.getHTML() !== htmlContent) {
          editor.commands.setContent(htmlContent, { emitUpdate: false });
        }
      } catch (e) {
        console.error("Markdown parse error", e);
      }
    }
  }, [documentContent, editor]);

  // Render Mermaid graphs dynamically
  useEffect(() => {
    if (!editor || isEditing) return;
    const renderMermaid = async () => {
      try {
        // Tiptap places code blocks in pre > code. Find all language-mermaid elements
        const codeBlocks = document.querySelectorAll('.ProseMirror pre code.language-mermaid');
        for (let i = 0; i < codeBlocks.length; i++) {
          const block = codeBlocks[i];
          const pre = block.parentElement;
          if (pre && block.textContent && !pre.hasAttribute('data-mermaid-processed')) {
            const id = `mermaid-${Date.now()}-${i}`;
            pre.setAttribute('data-mermaid-processed', 'true');
            const { svg } = await mermaid.render(id, block.textContent);
            // Replace the pre element with a beautiful div containing the SVG
            const div = document.createElement('div');
            div.className = 'my-6 p-4 bg-[#1e1e1e] border border-[#333] rounded-xl flex justify-center shadow-lg';
            div.innerHTML = svg;
            pre.parentNode?.replaceChild(div, pre);
          }
        }
      } catch (e) {
        console.error("Mermaid rendering failed", e);
      }
    };
    
    // Slight delay to ensure DOM is updated by Tiptap
    const timeout = setTimeout(renderMermaid, 500);
    return () => clearTimeout(timeout);
  }, [documentContent, isEditing, editor?.getHTML()]);

  const [citationExpanded, setCitationExpanded] = useState(false);
  
  // Settings states
  const [publishYear, setPublishYear] = useState('All');
  const [customPublishYear, setCustomPublishYear] = useState('');
  const [impactFactor, setImpactFactor] = useState('All');
  const [externalSources, setExternalSources] = useState(true);
  const [pageNumbers, setPageNumbers] = useState(true);
  const [citationStyle, setCitationStyle] = useState('APA (7th ed.)');
  const [librarySources, setLibrarySources] = useState(true);
  const [limitCollection, setLimitCollection] = useState('All Sources');
  const [citedBy, setCitedBy] = useState('All');
  const [showClaimConfidenceSettings, setShowClaimConfidenceSettings] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  
  // Headings states
  const [headingsExpanded, setHeadingsExpanded] = useState(false);
  const [headingsOption, setHeadingsOption] = useState('Standard headings (IMRaD)');
  
  // Download state
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);

  const handleDownload = async (format: 'docx' | 'txt' | 'html' | 'pdf') => {
    setDownloadMenuOpen(false);
    
    if (format === 'pdf') {
      window.print();
      return;
    }
    
    if (format === 'docx') {
      try {
        const turndownService = new TurndownService();
        const markdown = turndownService.turndown(editor?.getHTML() || '');
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/export-docx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown_text: markdown })
        });
        
        if (!response.ok) throw new Error('Failed to generate DOCX');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName || 'Research_Paper'}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Download failed", error);
        alert("Failed to download DOCX.");
      }
      return;
    }

    let contentToDownload = '';
    let mimeType = '';
    let extension = '';

    if (format === 'txt') {
      contentToDownload = editor?.getText() || '';
      mimeType = 'text/plain';
      extension = 'txt';
    } else if (format === 'html') {
      contentToDownload = editor?.getHTML() || '';
      mimeType = 'text/html';
      extension = 'html';
    }

    const blob = new Blob([contentToDownload], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName || 'Research_Paper'}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePromptNext = () => {
    setPromptExpanded(false);
    setCitationExpanded(true);
  };

  const handleCitationNext = () => {
    setCitationExpanded(false);
    setHeadingsExpanded(true);
  };

  // Citation Modal states
  const [showCitationModal, setShowCitationModal] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState('Accident Analysis and Prevention');
  const [selectedLocale, setSelectedLocale] = useState('Default (Style\'s locale)');
  const [previewMode, setPreviewMode] = useState<'Bibliography' | 'In-text'>('Bibliography');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Settings & User Dropup States
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const activeChat = chatHistory.find(c => c.id === activeChatId);
  const projectName = activeChat ? activeChat.title : '';

  const handleProjectNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setChatHistory(prev => prev.map(chat => 
      chat.id === activeChatId ? { ...chat, title: newName } : chat
    ));
  };

  const onStartWriting = () => {
    setIsEditing(true);
    
    // Construct the prompt string from the settings
    const prompt = `Topic/Prompt: ${promptInput || 'Please write an academic paper.'}
Project Name: ${projectName || 'Untitled'}
Publish Year Constraints: ${publishYear === 'Custom' ? customPublishYear || 'Not specified' : publishYear}
Impact Factor: ${impactFactor}
Citation Style: ${citationStyle}
Include External Web Sources: ${externalSources ? 'Yes' : 'No'}
Show Page Numbers: ${pageNumbers ? 'Yes' : 'No'}
Headings Preference: ${headingsOption}
MANDATORY: You MUST include realistic scholarly inline citations at the end of every claim or paragraph using the requested citation style!`;

    if (handleGenerateDocument) {
      handleGenerateDocument(prompt);
    }
  };

  return (
    <div className="flex w-full h-full bg-[#111111] text-gray-200 font-sans overflow-hidden">
      
      {/* 1. LEFT SECTION */}
      <div className="w-[260px] bg-[#2d2d2d] border-r border-[#3d3d3d] flex flex-col shrink-0 h-full">
        <div className="p-4 flex flex-col gap-4 h-full">
          
          <div className="flex flex-col gap-2">
            {/* Home Button */}
            <button 
              onClick={handleGoHome}
              className="flex items-center gap-2 w-full hover:bg-[#3d3d3d] text-gray-300 hover:text-white px-4 py-3 rounded-lg text-[14px] font-semibold transition-colors"
            >
              <Home className="w-4 h-4" />
              Home
            </button>

            {/* New Chat Button */}
            <button 
              onClick={() => {
                const newId = chatHistory.length > 0 ? Math.max(...chatHistory.map((c: any) => c.id)) + 1 : 1;
                const newChat = { id: newId, title: 'New Project', date: 'Today', content: '', isEditing: false };
                setChatHistory([newChat, ...chatHistory]);
                setActiveChatId(newId);
                setIsEditing(false);
                setDocumentContent('');
                setPromptInput('');
                setPromptExpanded(true);
                setCitationExpanded(false);
                setHeadingsExpanded(false);
                if (editor) {
                  editor.commands.setContent('<p class="text-gray-400">Start writing or type / for commands</p>', { emitUpdate: false });
                }
                setPromptInput('');
              }}
              className="flex items-center gap-2 w-full bg-[#3d3d3d] hover:bg-[#4d4d4d] text-gray-200 px-4 py-3 rounded-lg text-[14px] font-semibold transition-colors border border-[#444] hover:border-[#555]"
            >
              <Plus className="w-4 h-4" />
              New chat
            </button>

            {/* Clear Chat Button */}
            <button 
              onClick={() => {
                if (selectedChats.length > 0) {
                  const updatedHistory = chatHistory.filter((c: any) => !selectedChats.includes(c.id));
                  setChatHistory(updatedHistory);
                  setSelectedChats([]);
                  if (activeChatId && selectedChats.includes(activeChatId)) {
                    if (updatedHistory.length > 0) {
                      setActiveChatId(updatedHistory[0].id);
                      setDocumentContent(updatedHistory[0].content || '');
                    } else {
                      handleGoHome();
                    }
                  }
                } else {
                  if (confirm("Are you sure you want to clear all chats?")) {
                    setChatHistory([]);
                    setSelectedChats([]);
                    handleGoHome();
                  }
                }
              }}
              className="flex items-center gap-2 w-full hover:bg-[#3d3d3d] text-gray-400 hover:text-red-400 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              {selectedChats.length > 0 ? `Delete ${selectedChats.length} selected` : 'Clear all chats'}
            </button>
          </div>

          {/* Chat History Section */}
          <div className="flex flex-col gap-2 mt-4 flex-1 overflow-y-auto custom-scrollbar">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Chat History</h3>
            
            <div className="flex flex-col gap-1">
              {chatHistory.map((chat: any) => (
                <div 
                  key={chat.id} 
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setDocumentContent(chat.content || '');
                    setIsEditing(chat.isEditing || false);
                    if (editor) {
                      editor.commands.setContent(chat.content || '<p class="text-gray-400">Start writing or type / for commands</p>', { emitUpdate: false });
                    }
                  }}
                  className={`flex items-center justify-between gap-3 w-full text-left px-2 py-2.5 rounded-lg transition-colors group cursor-pointer ${activeChatId === chat.id ? 'bg-[#3d3d3d]' : 'hover:bg-[#3d3d3d]'}`}
                >
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <input 
                      type="checkbox" 
                      checked={selectedChats.includes(chat.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        if (e.target.checked) {
                          setSelectedChats([...selectedChats, chat.id]);
                        } else {
                          setSelectedChats(selectedChats.filter(id => id !== chat.id));
                        }
                      }}
                      className="w-3.5 h-3.5 shrink-0 rounded border-gray-500 bg-transparent accent-[#5b5fff] cursor-pointer"
                    />
                    <MessageSquare className={`w-4 h-4 shrink-0 ${activeChatId === chat.id ? 'text-gray-200' : 'text-gray-400 group-hover:text-gray-300'}`} />
                    <div className="flex flex-col overflow-hidden">
                      <span className={`text-sm truncate ${activeChatId === chat.id ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>{chat.title || 'Untitled'}</span>
                      <span className="text-[10px] text-gray-400">{chat.date}</span>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      const updatedHistory = chatHistory.filter((c: any) => c.id !== chat.id);
                      setChatHistory(updatedHistory);
                      if (activeChatId === chat.id) {
                        if (updatedHistory.length > 0) {
                          setActiveChatId(updatedHistory[0].id);
                          setDocumentContent(updatedHistory[0].content || '');
                        } else {
                          handleGoHome();
                        }
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-[#555] rounded-md transition-all text-gray-400 hover:text-red-400"
                    title="Delete Chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* User Profile Section */}
          <div className="pt-4 mt-auto mb-[60px] relative">
            
            {/* Dropup Menu */}
            {userMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-full bg-[#111] border border-[#222] rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.5)] overflow-hidden z-50 py-1">
                <div className="flex flex-col">
                  
                  <div className="px-4 py-2.5 flex items-center justify-between group cursor-pointer hover:bg-[#1a1a1a]">
                    <span className="text-[13px] font-medium text-gray-200">Route</span>
                    <span className="text-[13px] text-gray-500">Static</span>
                  </div>
                  
                  <div className="px-4 py-2.5 flex items-center justify-between group cursor-pointer hover:bg-[#1a1a1a]">
                    <span className="text-[13px] font-medium text-gray-200">Bundler</span>
                    <span className="text-[13px] text-gray-500">Turbopack</span>
                  </div>
                  
                  <div className="px-4 py-2.5 flex items-center justify-between group cursor-pointer hover:bg-[#1a1a1a]">
                    <span className="text-[13px] font-medium text-gray-200">Route Info</span>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                  
                  <div className="h-[1px] bg-[#222] my-1"></div>
                  
                  <div className="px-4 py-2.5 flex items-center justify-between group cursor-pointer hover:bg-[#1a1a1a]">
                    <span className="text-[13px] font-medium text-[#7fa3ff]">Preferences</span>
                    <Settings2 className="w-4 h-4 text-gray-500" />
                  </div>

                </div>
              </div>
            )}

            <div 
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center justify-between w-full bg-[#464eb8] hover:bg-[#5259c9] px-4 py-3.5 rounded-xl transition-colors cursor-pointer shadow-sm group"
            >
              <span className="text-[15px] font-bold text-white font-serif tracking-wide ml-1">Zeeshan</span>
              <ChevronUp className={`w-4 h-4 text-white/80 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>

        </div>
      </div>

      {/* 2. MIDDLE SECTION */}
      <div className="flex-1 bg-[#161616] flex flex-col border-r border-[#2a2a2a] relative">
        
        {/* Top Toolbar */}
        <div className="flex flex-col border-b border-[#2a2a2a] bg-[#161616]">
          {/* Header Row */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a2a]">
            <div className="text-[14px] text-gray-400 font-medium truncate w-32">{projectName || 'Untitled'}</div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors text-[13px] font-bold">
                <Users className="w-4 h-4" /> Share
              </button>
              <button className="bg-[#5b5fff] hover:bg-[#6b6fff] text-white px-3 py-1.5 rounded flex items-center gap-2 text-[13px] font-bold transition-colors">
                <Star className="w-3.5 h-3.5" /> See Pricing
              </button>
              <button onClick={() => setShowClaimConfidenceSettings(true)} className="text-gray-400 hover:text-white transition-colors">
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              {!isRightPanelOpen && (
                <div className="border-l border-[#333] pl-3 ml-1 flex items-center">
                  <button onClick={() => setIsRightPanelOpen(true)} className="flex items-center gap-1.5 text-white font-bold hover:text-gray-300 transition-colors text-[14px]">
                    <ChevronsLeft className="w-4 h-4" /> Review
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Format Toolbar Row */}
          <div className="flex items-center px-4 py-2 gap-4 text-gray-400 text-[13px]">
             <div className="flex items-center gap-3 border-r border-[#333] pr-4">
                <span>↩</span>
                <span>↪</span>
                <span className="flex items-center gap-1"><Type className="w-3 h-3" /> Text</span>
             </div>
             <div className="flex items-center gap-3 border-r border-[#333] pr-4">
                <b className="font-serif">B</b>
                <i className="font-serif">I</i>
                <u className="font-serif">U</u>
                <s className="font-serif">S</s>
                <span>{'<>'}</span>
                <span>x²</span>
                <span>x₂</span>
             </div>
             <div className="flex items-center gap-3 border-r border-[#333] pr-4">
                <span>🔗</span>
                <span>🖊️</span>
             </div>
             <div className="flex items-center gap-3 border-r border-[#333] pr-4 relative">
                <button onClick={() => setDownloadMenuOpen(!downloadMenuOpen)} className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer text-[#6d93e8] font-bold">
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                {downloadMenuOpen && (
                  <div className="absolute top-full left-0 mt-2 w-40 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-lg overflow-hidden z-50 flex flex-col">
                    <button onClick={() => handleDownload('docx')} className="w-full text-left px-4 py-2 hover:bg-[#222] transition-colors text-white font-medium text-[13px] border-b border-[#333]">Word (.docx)</button>
                    <button onClick={() => handleDownload('pdf')} className="w-full text-left px-4 py-2 hover:bg-[#222] transition-colors text-white font-medium text-[13px] border-b border-[#333]">PDF (.pdf)</button>
                    <button onClick={() => handleDownload('txt')} className="w-full text-left px-4 py-2 hover:bg-[#222] transition-colors text-white font-medium text-[13px] border-b border-[#333]">Plain Text (.txt)</button>
                    <button onClick={() => handleDownload('html')} className="w-full text-left px-4 py-2 hover:bg-[#222] transition-colors text-white font-medium text-[13px]">HTML (.html)</button>
                  </div>
                )}
             </div>
             <div className="flex items-center gap-3 border-r border-[#333] pr-4">
                <span>@ Cite</span>
             </div>
             <div className="flex items-center gap-3 border-r border-[#333] pr-4">
                <span>🖼️</span>
                <span>📊</span>
                <span>[x]</span>
                <span>∑</span>
             </div>
             <div className="flex items-center gap-2 ml-auto">
                <Check className="w-3 h-3" />
                <span className="text-gray-300 font-bold">Autocomplete</span>
                <div className="w-8 h-4 bg-[#5b5fff] rounded-full relative">
                   <div className="w-3 h-3 bg-white rounded-full absolute right-0.5 top-0.5"></div>
                </div>
             </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          {!isEditing ? (
            <div className="w-full max-w-3xl mx-auto mt-10 px-10 flex flex-col gap-4 pb-20">
              
              {/* Section 1: Project Name */}
              <input 
                type="text" 
                value={projectName}
                onChange={handleProjectNameChange}
                placeholder="Untitled" 
                className="w-full text-3xl font-bold bg-transparent border-none outline-none text-gray-100 placeholder:text-gray-400 mb-6 font-sans"
              />

              {/* Section 2: Fill Document Prompt */}
              <div className={`rounded-xl border border-[#2a2a2a] overflow-hidden transition-all duration-300 bg-[#161616]`}>
                {promptExpanded ? (
                  <>
                    <div className="px-4 py-3 flex items-center justify-between cursor-pointer" onClick={() => setPromptExpanded(false)}>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border-2 border-[#333]" />
                        <span className="text-[14px] font-bold text-gray-200">Fill document prompt</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 rotate-90" />
                    </div>
                    
                    <div className="px-4 pb-4 flex flex-col">
                      <textarea 
                        value={promptInput}
                        onChange={(e) => setPromptInput(e.target.value)}
                        placeholder="E.g., A research paper on the effects of climate change on marine biodiversity"
                        className="w-full h-[88px] bg-transparent border border-[#333] rounded-lg outline-none resize-none text-[14px] text-gray-300 placeholder:text-gray-500 p-3 focus:border-[#444]"
                      />
                      
                      <div className="mt-3 text-[13px] text-gray-200 font-bold">
                        Weak prompt: <span className="text-gray-400 font-normal">Add more context for higher quality generations</span>
                      </div>
                      
                      <div className="flex items-center justify-center gap-4 my-4 relative">
                        <div className="absolute left-0 right-0 h-[1px] bg-[#2a2a2a]"></div>
                        <span className="text-[12px] text-gray-400 bg-[#161616] px-3 relative z-10">or also</span>
                      </div>
                      
                      <label className="rounded-lg bg-[#222] border border-[#2a2a2a] hover:bg-[#2a2a2a] transition-colors cursor-pointer flex items-center justify-between p-3 relative">
                        <input type="file" accept=".docx,.pdf,.md,.txt" onChange={handleDocumentImport} disabled={uploadingDoc || localUploadingDoc} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded bg-[#2b579a] flex items-center justify-center text-white font-bold text-[11px]">W</div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[13px] font-bold text-gray-200">{uploadingDoc || localUploadingDoc ? 'Uploading...' : 'Import from Word (.docx)'}</span>
                            <span className="text-[12px] text-gray-400">Import your work and improve it with AI</span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      </label>

                      {importedFileName && (
                        <div className="mt-3 p-3 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                            <span className="text-[13px] text-gray-200">{importedFileName}</span>
                          </div>
                          <button onClick={() => { setImportedFileName(''); setDocumentContent(''); }} className="text-gray-500 hover:text-red-400">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-4">
                        <button onClick={handlePromptNext} className="text-[14px] text-gray-300 font-bold hover:text-white transition-colors">Skip</button>
                        <button onClick={handlePromptNext} className="bg-[#464eb8] hover:bg-[#5259c9] text-white px-5 py-2 rounded-lg text-[13px] font-bold transition-colors shadow-sm">Next</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div onClick={() => setPromptExpanded(true)} className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1a] transition-colors">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-4 h-4 text-[#10b981]" />
                      <span className="text-[14px] font-bold text-gray-200">Fill document prompt</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                )}
              </div>

              {/* Section 3: Citation Settings */}
              <div className={`rounded-xl border border-[#2a2a2a] overflow-hidden transition-all duration-300 bg-[#161616]`}>
                {citationExpanded ? (
                  <>
                    <div className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1a] transition-colors" onClick={() => setCitationExpanded(false)}>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border-2 border-[#333]" />
                        <span className="text-[14px] font-bold text-gray-200">Citation settings</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 rotate-90" />
                    </div>
                    <div className="p-4 flex flex-col gap-6 border-t border-[#2a2a2a]">
                      
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-bold text-white">Publish year</span>
                        <div className="flex gap-1 items-center">
                          <button onClick={() => setPublishYear('All')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${publishYear === 'All' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>All</button>
                          <button onClick={() => setPublishYear('Last 5 years')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${publishYear === 'Last 5 years' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>Last 5 years</button>
                          <button onClick={() => setPublishYear('Custom')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${publishYear === 'Custom' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>Custom</button>
                          {publishYear === 'Custom' && (
                            <input 
                              type="text" 
                              value={customPublishYear}
                              onChange={(e) => setCustomPublishYear(e.target.value)}
                              placeholder="e.g. 2010-2020" 
                              className="ml-2 px-3 py-1.5 bg-[#1a1a1a] text-white rounded-md border border-[#333] outline-none text-[13px] w-28 placeholder:text-gray-500 transition-colors focus:border-[#464eb8]" 
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-bold text-white">Impact Factor</span>
                        <div className="flex gap-1">
                          <button onClick={() => setImpactFactor('All')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${impactFactor === 'All' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>All</button>
                          <button onClick={() => setImpactFactor('0.25+')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${impactFactor === '0.25+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>0.25+</button>
                          <button onClick={() => setImpactFactor('3+')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${impactFactor === '3+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>3+</button>
                          <button onClick={() => setImpactFactor('10+')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${impactFactor === '10+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>10+</button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-[14px] font-bold text-white">Consider external sources</span>
                          <span className="text-[13px] text-gray-500">Jenni will consider sources from the web</span>
                        </div>
                        <div onClick={() => setExternalSources(!externalSources)} className={`w-[42px] h-[24px] rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${externalSources ? 'bg-[#5b5fff]' : 'bg-[#3d3d3d]'}`}>
                          <div className={`w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${externalSources ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-[14px] font-bold text-white">Consider library sources</span>
                          <span className="text-[13px] text-gray-500">Upload PDFs to chat with, cite from or provide context to AI</span>
                        </div>
                        <button onClick={() => setShowUploadModal(true)} className="px-3 py-1.5 border border-[#444] rounded-lg text-[13px] font-bold text-gray-200 flex items-center gap-2 hover:bg-[#2d2d2d] transition-colors cursor-pointer bg-transparent">
                          <Upload className="w-3.5 h-3.5" /> Add sources
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-[14px] font-bold text-white">Limit to a collection</span>
                          <span className="text-[13px] text-gray-500">Jenni will focus on sources from this collection</span>
                        </div>
                        <div className="px-4 py-2.5 border border-[#444] rounded-lg text-[14px] font-bold text-gray-400 flex items-center justify-between gap-4 w-[240px] bg-[#1a1a1a] cursor-pointer">
                          <span>All Sources</span>
                          <ChevronRight className="w-4 h-4 rotate-90 text-gray-500" />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-bold text-white">Citation Style</span>
                        <div onClick={() => setShowCitationModal(true)} className="px-4 py-2.5 border border-[#444] rounded-lg text-[14px] font-bold text-gray-200 flex items-center justify-between gap-4 w-[300px] bg-[#1a1a1a] cursor-pointer hover:bg-[#222] transition-colors">
                          <span className="truncate">{citationStyle}</span>
                          <ChevronRight className="w-4 h-4 rotate-90 text-gray-500 shrink-0" />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-bold text-white">Show page number in citations</span>
                        <div onClick={() => setPageNumbers(!pageNumbers)} className={`w-[42px] h-[24px] rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${pageNumbers ? 'bg-[#5b5fff]' : 'bg-[#3d3d3d]'}`}>
                          <div className={`w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${pageNumbers ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                        </div>
                      </div>

                      <div className="flex justify-end mt-4">
                         <button onClick={handleCitationNext} className="bg-[#464eb8] hover:bg-[#5259c9] text-white px-6 py-2.5 rounded-lg text-[15px] font-bold transition-colors shadow-sm">Next</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div onClick={() => setCitationExpanded(true)} className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1a] transition-colors">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-4 h-4 text-[#10b981]" />
                      <span className="text-[14px] font-bold text-gray-200">Citation settings</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                )}
              </div>

              {/* Section 4: Generate Headings */}
              <div className={`rounded-xl border border-[#2a2a2a] overflow-hidden transition-all duration-300 bg-[#161616]`}>
                {headingsExpanded ? (
                  <>
                    <div className="px-4 py-3 flex items-center justify-between cursor-pointer" onClick={() => setHeadingsExpanded(false)}>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border-2 border-[#333]" />
                        <span className="text-[14px] font-bold text-gray-200">Generate Headings</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 rotate-90" />
                    </div>
                    
                    <div className="p-4 flex flex-col gap-3 border-t border-[#2a2a2a]">
                      <span className="text-[14px] font-bold text-gray-200 mb-2">Generate outline</span>
                      
                      {/* Option 1 */}
                      <div 
                        onClick={() => setHeadingsOption('Standard headings (IMRaD)')}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors flex items-start gap-4 ${headingsOption === 'Standard headings (IMRaD)' ? 'bg-[#1b1c3a] border-[#5b5fff]' : 'bg-[#1a1a1a] border-[#2a2a2a] hover:bg-[#222]'}`}
                      >
                        <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center ${headingsOption === 'Standard headings (IMRaD)' ? 'border-[#5b5fff]' : 'border-[#444]'}`}>
                          {headingsOption === 'Standard headings (IMRaD)' && <div className="w-2 h-2 bg-[#5b5fff] rounded-full" />}
                        </div>
                        <div className="w-8 h-10 bg-white rounded flex flex-col gap-1.5 items-center justify-center px-1">
                           <div className="w-full h-0.5 bg-gray-300"></div>
                           <div className="w-full h-0.5 bg-gray-300"></div>
                           <div className="w-full h-0.5 bg-gray-300"></div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[14px] font-bold text-white">Standard headings (IMRaD)</span>
                          <span className="text-[13px] text-gray-400">Add standard headings (Introduction, Methods, Results etc.)</span>
                        </div>
                      </div>

                      {/* Option 2 */}
                      <div 
                        onClick={() => setHeadingsOption('Smart headings')}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors flex items-start gap-4 ${headingsOption === 'Smart headings' ? 'bg-[#1b1c3a] border-[#5b5fff]' : 'bg-[#1a1a1a] border-[#2a2a2a] hover:bg-[#222]'}`}
                      >
                        <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center ${headingsOption === 'Smart headings' ? 'border-[#5b5fff]' : 'border-[#444]'}`}>
                          {headingsOption === 'Smart headings' && <div className="w-2 h-2 bg-[#5b5fff] rounded-full" />}
                        </div>
                        <div className="w-8 h-10 bg-white rounded flex flex-col gap-1.5 items-center justify-center px-1 relative">
                           <Star className="w-3 h-3 text-[#5b5fff] absolute -top-2 -right-2 fill-[#5b5fff]" />
                           <div className="w-full h-0.5 bg-gray-300"></div>
                           <div className="w-full h-0.5 bg-gray-300"></div>
                           <div className="w-full h-0.5 bg-gray-300"></div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[14px] font-bold text-white">Smart headings</span>
                          <span className="text-[13px] text-gray-400">AI will generate headings based on your document prompt</span>
                        </div>
                      </div>

                      {/* Option 3 */}
                      <div 
                        onClick={() => setHeadingsOption('No headings')}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors flex items-start gap-4 ${headingsOption === 'No headings' ? 'bg-[#1b1c3a] border-[#5b5fff]' : 'bg-[#1a1a1a] border-[#2a2a2a] hover:bg-[#222]'}`}
                      >
                        <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center ${headingsOption === 'No headings' ? 'border-[#5b5fff]' : 'border-[#444]'}`}>
                          {headingsOption === 'No headings' && <div className="w-2 h-2 bg-[#5b5fff] rounded-full" />}
                        </div>
                        <div className="w-8 h-10 bg-white rounded flex flex-col gap-1.5 items-center justify-center px-1">
                           <div className="w-full h-0.5 bg-gray-300"></div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[14px] font-bold text-white">No headings</span>
                          <span className="text-[13px] text-gray-400">Start with a blank document</span>
                        </div>
                      </div>

                      <div className="flex justify-end mt-4">
                         <button onClick={onStartWriting} className="bg-[#5b5fff] hover:bg-[#6b6fff] text-white px-6 py-2.5 rounded-lg text-[15px] font-bold transition-colors shadow-sm">Start Writing</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div onClick={() => setHeadingsExpanded(true)} className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1a] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border-2 border-[#333]" />
                      <span className="text-[14px] font-bold text-gray-200">Generate Headings</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                )}
              </div>
              <div className="flex justify-center mt-2">
                <button onClick={onStartWriting} className="text-[14px] font-bold text-gray-400 hover:text-white transition-colors">Skip and start writing</button>
              </div>

              {/* Section 4: Explore Grid */}
              <div className="mt-4 flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-gray-300">Explore</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#222] p-4 flex flex-col gap-2 hover:bg-[#2a2a2a] transition-colors cursor-pointer border border-[#2a2a2a]">
                     <MessageSquare className="w-5 h-5 text-gray-300" />
                     <h4 className="text-[14px] font-bold text-gray-200">Chat with AI</h4>
                     <p className="text-[12px] text-gray-500 leading-relaxed">Discover papers, brainstorm ideas or write a draft</p>
                  </div>
                  <label className="rounded-xl bg-[#222] p-4 flex flex-col gap-2 hover:bg-[#2a2a2a] transition-colors cursor-pointer border border-[#2a2a2a] relative">
                     <input type="file" accept=".docx,.pdf,.md,.txt" onChange={handleDocumentImport} disabled={uploadingDoc} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                     <Upload className="w-5 h-5 text-gray-300" />
                     <h4 className="text-[14px] font-bold text-gray-200">Upload Sources</h4>
                     <p className="text-[12px] text-gray-500 leading-relaxed">Upload PDFs to chat with, cite from or provide context to AI</p>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full min-h-full p-10 bg-white text-black pb-32 relative print-area" onClick={handleEditorClick}>
              <input 
                type="text" 
                value={projectName}
                onChange={handleProjectNameChange}
                placeholder="Untitled Document" 
                className="w-full max-w-4xl mx-auto block text-4xl font-bold bg-transparent border-none outline-none text-black placeholder:text-gray-300 mb-8 font-sans"
              />
              <div className="max-w-4xl mx-auto">
                <EditorContent editor={editor} />
              </div>
              
              {/* Citation Popup */}
              {citationPopup.visible && (
                <div 
                  className="absolute z-50 bg-[#252525] border border-[#333] rounded-xl shadow-2xl w-[450px] flex flex-col overflow-hidden"
                  style={{ top: Math.min(citationPopup.y, window.innerHeight - 300), left: citationPopup.x }}
                  onClick={(e) => e.stopPropagation()}
                >
                   <div className="px-4 py-3 border-b border-[#333] flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-400 text-[12px] font-bold tracking-wide uppercase">
                        Article
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="bg-[#333] rounded px-2 py-0.5 text-gray-300 text-[11px] font-bold">CITED BY 7</div>
                        <div className="bg-[#333] rounded px-2 py-0.5 text-gray-300 text-[11px] font-bold">IF 6.61</div>
                      </div>
                   </div>
                   <div className="p-4 flex flex-col gap-2">
                      <h3 className="text-[15px] font-bold text-white leading-snug">
                        Integrating artificial intelligence and quantum computing: A systematic literature review of features and applications
                      </h3>
                      <p className="text-[13px] text-gray-400">Pineda, Valencia-Arias, Giraldo, Ochoa</p>
                      <p className="text-[13px] text-[#10b981]">International Journal of Cognitive Computing in Engineering <span className="text-gray-500">• 2025</span></p>
                      
                      <div className="mt-2 bg-[#333]/50 rounded-lg p-3 text-[13px] text-gray-300 leading-relaxed border-l-2 border-[#5b5fff]">
                        • Novel synthesis of 30+ studies detailing the state-of-the-art in the integration of AI and QC, highlighting quantum machine learning, optimization techniques,... <span className="text-white font-bold cursor-pointer hover:underline">See more</span>
                      </div>
                      
                      <div className="mt-2 flex items-center gap-1 text-[13px] font-bold text-gray-300 hover:text-white cursor-pointer w-fit">
                        <ChevronUp className="w-4 h-4 rotate-45" /> View
                      </div>
                   </div>
                   <div className="px-4 py-3 bg-[#1e1e1e] border-t border-[#333] flex justify-between items-center">
                     <div className="flex gap-2">
                       <button className="bg-[#5b5fff] hover:bg-[#6b6fff] text-white px-4 py-1.5 rounded-lg text-[13px] font-bold flex items-center gap-2 transition-colors">
                         Accept <ChevronRight className="w-3.5 h-3.5" />
                       </button>
                       <button className="border border-[#444] hover:bg-[#2a2a2a] text-white px-4 py-1.5 rounded-lg text-[13px] font-bold flex items-center gap-2 transition-colors">
                         <Sparkles className="w-3.5 h-3.5" /> Refine suggestion
                       </button>
                     </div>
                     <div className="flex gap-2 text-gray-400">
                       <ThumbsUp className="w-4 h-4 cursor-pointer hover:text-white" />
                       <ThumbsDown className="w-4 h-4 cursor-pointer hover:text-white" />
                     </div>
                   </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Edit Bar */}
        {isEditing && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-[#1e1e1e] border border-[#333] rounded-2xl shadow-2xl p-2 flex items-center gap-3 z-50">
             <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center shadow-lg text-white font-bold text-xs shrink-0 ml-1">
               Ai
             </div>
             <input 
               type="text" 
               value={editInput}
               onChange={(e) => setEditInput(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && handleEditRequest()}
               disabled={loading}
               placeholder="Ask AI to write, edit, or summarize..." 
               className="flex-1 bg-transparent border-none outline-none text-gray-200 text-[14px] placeholder:text-gray-500 py-2"
             />
             <button 
               onClick={handleEditRequest}
               disabled={loading || !editInput.trim()}
               className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center transition-colors shrink-0 mr-1"
             >
               <ChevronRight className="w-4 h-4 text-white" />
             </button>
          </div>
        )}
      </div>


      {/* 3. RIGHT SECTION: Review Panel */}
      {isRightPanelOpen && (
        <div className="w-[340px] bg-[#1a1a1a] border-l border-[#2a2a2a] flex flex-col shrink-0 h-full transition-all duration-300">
        
        {/* Header */}
        <div className="px-5 py-5 flex items-center gap-3 border-b border-[#2a2a2a]">
          {activeReviewTab ? (
             <button onClick={() => setActiveReviewTab(null)} className="text-gray-400 hover:text-white transition-colors">
               <ChevronLeft className="w-5 h-5" />
             </button>
          ) : (
             <button onClick={() => setIsRightPanelOpen(false)} className="text-gray-400 hover:text-white transition-colors">
               <ChevronsRight className="w-5 h-5" />
             </button>
          )}
          <span className="font-bold text-white text-[15px]">
            {activeReviewTab === 'claim' ? 'Claim confidence' :
             activeReviewTab === 'analysis' ? 'Document Analysis' : 
             activeReviewTab === 'tone' ? 'Tone of Voice' : 
             activeReviewTab === 'proofread' ? 'Proofread' : 'Review'}
          </span>
          {activeReviewTab && (
             <div className="ml-auto flex items-center gap-2">
               {activeReviewTab === 'claim' && <button onClick={() => setShowClaimConfidenceSettings(true)} className="text-gray-400 hover:text-white"><SlidersHorizontal className="w-4 h-4" /></button>}
               <button onClick={() => {
                 setActiveReviewTab(null);
               }} className="w-6 h-6 border border-[#333] rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2a2a2a]">
                 <RotateCcw className="w-3.5 h-3.5" />
               </button>
             </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
           {!activeReviewTab && (
              <>
                 {/* Card 1: Claim confidence */}
                 <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5 flex flex-col gap-3">
                   <div className="w-8 h-8 rounded-full bg-[#1b1c3a] flex items-center justify-center mb-1">
                     <Star className="w-4 h-4 text-[#7d84ff]" />
                   </div>
                   <h3 className="text-[15px] font-bold text-white">Claim confidence</h3>
                   <p className="text-[13px] text-gray-400 leading-relaxed">
                     Checks your writing, finds missing or weak citations, and adds references to help you avoid academic plagiarism
                   </p>
                   <div className="flex items-center gap-3 mt-2">
                     <button onClick={handleClaimConfidence} disabled={loading} className="flex items-center gap-2 border border-[#333] rounded-lg px-3 py-1.5 hover:bg-[#2a2a2a] transition-colors disabled:opacity-50">
                        <Play className="w-3.5 h-3.5 text-gray-300" />
                        <span className="text-[13px] font-bold text-white">Run review</span>
                     </button>
                     <button onClick={() => setShowClaimConfidenceSettings(true)} className="text-gray-400 hover:text-white transition-colors">
                       <SlidersHorizontal className="w-4 h-4" />
                     </button>
                   </div>
                 </div>

                 {/* Card 2: Document Analysis */}
                 <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5 flex flex-col gap-3">
                   <div className="w-8 h-8 rounded-full bg-[#1b1c3a] flex items-center justify-center mb-1">
                     <Users className="w-4 h-4 text-[#7d84ff]" />
                   </div>
                   <h3 className="text-[15px] font-bold text-white">Document Analysis</h3>
                   <p className="text-[13px] text-gray-400 leading-relaxed">
                     Get comprehensive analysis and actionable recommendations to improve your document's quality.
                   </p>
                   <div className="flex items-center gap-3 mt-2">
                     <button onClick={() => setActiveReviewTab('analysis')} disabled={loading} className="flex items-center gap-2 border border-[#333] rounded-lg px-3 py-1.5 hover:bg-[#2a2a2a] transition-colors disabled:opacity-50">
                        <Play className="w-3.5 h-3.5 text-gray-300" />
                        <span className="text-[13px] font-bold text-white">Run review</span>
                     </button>
                   </div>
                 </div>

                 {/* Card 3: Tone of Voice */}
                 <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5 flex flex-col gap-3">
                   <div className="w-8 h-8 rounded-full bg-[#1b1c3a] flex items-center justify-center mb-1">
                     <MessageSquare className="w-4 h-4 text-[#7d84ff]" />
                   </div>
                   <h3 className="text-[15px] font-bold text-white">Tone of Voice</h3>
                   <p className="text-[13px] text-gray-400 leading-relaxed">
                     Match your document's tone to a preset style or a paper from your library.
                   </p>
                   <div className="flex items-center gap-3 mt-2">
                     <button onClick={handleToneOfVoice} disabled={loading} className="flex items-center gap-2 border border-[#333] rounded-lg px-3 py-1.5 hover:bg-[#2a2a2a] transition-colors disabled:opacity-50">
                        <Play className="w-3.5 h-3.5 text-gray-300" />
                        <span className="text-[13px] font-bold text-white">Run review</span>
                     </button>
                     <button onClick={() => setActiveReviewTab('tone')} className="text-gray-400 hover:text-white transition-colors">
                       <SlidersHorizontal className="w-4 h-4" />
                     </button>
                   </div>
                 </div>

                 {/* Card 4: Proofread */}
                 <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5 flex flex-col gap-3">
                   <div className="w-8 h-8 rounded-full bg-[#1b1c3a] flex items-center justify-center mb-1">
                     <ListChecks className="w-4 h-4 text-[#7d84ff]" />
                   </div>
                   <h3 className="text-[15px] font-bold text-white">Proofread</h3>
                   <p className="text-[13px] text-gray-400 leading-relaxed">
                     Identify grammar, punctuation, word choice, and other writing issues in your document.
                   </p>
                   <div className="flex items-center gap-3 mt-2">
                     <button onClick={handleProofread} disabled={loading} className="flex items-center gap-2 border border-[#333] rounded-lg px-3 py-1.5 hover:bg-[#2a2a2a] transition-colors disabled:opacity-50">
                        <Play className="w-3.5 h-3.5 text-gray-300" />
                        <span className="text-[13px] font-bold text-white">Run review</span>
                     </button>
                   </div>
                 </div>
              </>
           )}

           {activeReviewTab === 'claim' && (
              <div className="flex flex-col gap-4">
                {isReviewing ? (
                   <div className="flex items-center gap-2 text-gray-400 mb-4">
                     <Loader2 className="w-4 h-4 animate-spin" />
                     <span className="text-[14px]">Thinking for 5 seconds</span>
                   </div>
                ) : reviewData?.type === 'claim' ? (
                   <>
                     <div className="flex items-center justify-between mb-2">
                       <h3 className="text-[18px] font-bold text-white">Results</h3>
                       <div className="flex gap-2 text-gray-400">
                         <ThumbsUp className="w-4 h-4 cursor-pointer hover:text-white" />
                         <ThumbsDown className="w-4 h-4 cursor-pointer hover:text-white" />
                       </div>
                     </div>
                     <p className="text-[14px] text-gray-200 mb-4 leading-relaxed">
                       {reviewData.summary}
                     </p>
                     <button className="w-full py-2.5 bg-[#5b5fff] hover:bg-[#6b6fff] rounded-lg text-white font-bold flex items-center justify-center gap-2 mb-6">
                       <Play className="w-4 h-4" /> Review Changes
                     </button>
                     
                     <div className="text-[13px] font-bold text-gray-500 mb-2">Detailed breakdown</div>
                     
                     <div className="flex flex-col gap-2">
                       <div className="flex items-center justify-between bg-[#292a4a] border border-[#3b3c6a] rounded-lg px-4 py-3 cursor-pointer">
                         <span className="text-[14px] font-bold text-[#7d84ff]">All suggestions</span>
                         <span className="text-[14px] font-bold text-[#7d84ff]">
                           {['misrepresented', 'contradicted', 'unsupported', 'weaklySupported', 'overstated', 'unverifiable'].reduce((acc, key) => acc + (reviewData?.[key]?.length || 0), 0)}
                         </span>
                       </div>
                       {[
                         {label: 'Misrepresented', key: 'misrepresented'},
                         {label: 'Contradicted', key: 'contradicted'},
                         {label: 'Unsupported', key: 'unsupported'},
                         {label: 'Weakly supported', key: 'weaklySupported'},
                         {label: 'Overstated', key: 'overstated'},
                         {label: 'Unverifiable', key: 'unverifiable'},
                       ].map(item => {
                         const items = reviewData?.[item.key] || [];
                         const hasItems = items.length > 0;
                         return (
                         <div key={item.label} className="flex flex-col">
                           <div 
                             onClick={() => hasItems && setExpandedSection(expandedSection === item.label ? null : item.label)} 
                             className={`flex items-center justify-between bg-[#151515] border border-[#2a2a2a] rounded-lg px-4 py-3 ${hasItems ? 'cursor-pointer hover:bg-[#1a1a1a]' : ''}`}
                           >
                             <div className="flex items-center gap-2">
                               <span className="text-[14px] font-bold text-white">{item.label}</span>
                               <Info className="w-3.5 h-3.5 text-gray-500" />
                             </div>
                             {!hasItems ? (
                               <div className="w-4 h-4 rounded-full border border-[#10b981] flex items-center justify-center">
                                 <Check className="w-2.5 h-2.5 text-[#10b981]" />
                               </div>
                             ) : (
                               <span className="text-[14px] font-bold text-white">{items.length}</span>
                             )}
                           </div>
                           {hasItems && expandedSection === item.label && (
                             <div className="bg-[#1a1a1a] border border-[#2a2a2a] border-t-0 rounded-b-lg px-4 py-3 -mt-1 text-[13px] text-gray-300">
                               {items.map((text: string, idx: number) => (
                                 <div key={idx} className="flex gap-2">
                                   <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                                   <p>{text}</p>
                                 </div>
                               ))}
                             </div>
                           )}
                         </div>
                       )})}
                     </div>
                   </>
                ) : null}
              </div>
           )}

           {activeReviewTab === 'analysis' && (
              <div className="flex flex-col gap-4">
                 <p className="text-[15px] text-white font-bold leading-relaxed">
                   Run a comprehensive AI analysis of this document to identify weaknesses, assess claims, and get recommendations for improvement.
                 </p>
                 <div className="bg-[#151515] border border-[#2a2a2a] rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#222] flex items-center justify-center">
                        <Star className="w-4 h-4 text-gray-300" />
                      </div>
                      <span className="text-[14px] font-bold text-gray-200">Detailed Analysis & Recommendations</span>
                    </div>
                 </div>

                 {isReviewing ? (
                   <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-[#5b5fff]" />
                      <span className="text-sm font-bold text-gray-400">Analyzing document...</span>
                   </div>
                 ) : reviewData ? (
                   <>
                      {['Analysis Overview', 'Recommendations', 'Weaknesses', 'Strengths'].map((item) => (
                        <div key={item} className="bg-[#151515] border border-[#2a2a2a] rounded-xl overflow-hidden mb-2">
                          <div 
                            className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1a] transition-colors"
                            onClick={() => setExpandedSection(expandedSection === item ? null : item)}
                          >
                            <span className="text-[14px] font-bold text-gray-300">{item}</span>
                            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSection === item ? 'rotate-180' : ''}`} />
                          </div>
                          {expandedSection === item && (
                            <div className="py-2 px-1 text-[13px] text-gray-400 flex flex-col gap-2">
                              {(item === 'Weaknesses' ? reviewData.weaknesses : item === 'Strengths' ? reviewData.strengths : item === 'Recommendations' ? reviewData.recommendations : [reviewData.overview]).map((str: string, i: number) => (
                                <div key={i} className="flex items-start gap-2">
                                  <div className="w-1 h-1 bg-gray-500 rounded-full mt-1.5 shrink-0" />
                                  <span>{str}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                   </>
                ) : (
                   <button onClick={() => {
                     const prompt = `Here is a research paper/document:
${editor?.getText() || documentContent}

MANDATORY: Return a JSON data object analyzing this document. Do not output anything else.
Required JSON structure:
{
  "overview": "A brief overall assessment of the document's quality and arguments.",
  "weaknesses": ["list of structural, logical, or evidentiary weaknesses"],
  "strengths": ["list of positive aspects and strong points"],
  "recommendations": ["list of actionable recommendations to improve the document"]
}`;
                     fetchReview(prompt, { overview: "Could not generate overview.", weaknesses: ["Insufficient data"], strengths: ["Clear topic"], recommendations: ["Add more evidence"] });
                   }} className="w-full py-2.5 bg-[#5b5fff] hover:bg-[#6b6fff] rounded-lg text-white font-bold flex items-center justify-center gap-2 mb-6">
                      <Play className="w-4 h-4" /> Run Document Analysis
                   </button>
                )}
              </div>
           )}

           {activeReviewTab === 'tone' && (
              <div className="flex flex-col gap-4">
                 <p className="text-[15px] text-white font-bold leading-relaxed mb-4">
                   Choose a style preset or select a paper from your library to match your writing's tone.
                 </p>
                 
                 <div className="text-[11px] font-bold text-gray-500 tracking-wider mb-2">STYLE PRESETS</div>
                 <div className="flex flex-col gap-2 mb-6">
                    <div className="bg-[#2a2a2a] border border-[#444] rounded-xl p-4 flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-[#333] flex items-center justify-center">
                          <GraduationCap className="w-5 h-5 text-gray-300" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[15px] font-bold text-white">Formal Academic</span>
                          <span className="text-[13px] text-gray-400">Past tense, hedged claims, impersonal voice...</span>
                        </div>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="bg-[#151515] border border-[#2a2a2a] rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-[#444]">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-[#222] flex items-center justify-center">
                          <FlaskConical className="w-5 h-5 text-gray-300" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[15px] font-bold text-white">Concise Scientific</span>
                          <span className="text-[13px] text-gray-400">Active voice, short sentences, minimal hedging, S...</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-[#151515] border border-[#2a2a2a] rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-[#444]">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-[#222] flex items-center justify-center">
                          <Feather className="w-5 h-5 text-gray-300" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[15px] font-bold text-white">Clear & Natural</span>
                          <span className="text-[13px] text-gray-400">Plain vocabulary, active voice, conversational, ac...</span>
                        </div>
                      </div>
                    </div>
                 </div>

                 <div className="text-[11px] font-bold text-gray-500 tracking-wider mb-2">MATCH A PAPER</div>
                 <div className="border border-dashed border-[#333] rounded-xl p-6 flex flex-col items-center justify-center text-center bg-[#151515] hover:bg-[#1a1a1a] cursor-pointer transition-colors mb-6">
                    <Upload className="w-6 h-6 text-gray-500 mb-3" />
                    <h3 className="text-[15px] font-bold text-white mb-1">No PDFs in your library</h3>
                    <p className="text-[13px] text-gray-400">Upload a PDF to your library to use as a tone reference.</p>
                 </div>

                 <button onClick={handleToneOfVoice} disabled={isReviewing} className="w-full py-2.5 bg-[#151515] border border-[#333] hover:bg-[#2a2a2a] rounded-lg text-gray-300 font-bold flex items-center justify-center transition-colors disabled:opacity-50 mt-2">
                   <div className="flex items-center gap-2">
                     <Play className="w-4 h-4 text-gray-400" /> Run review
                   </div>
                   <span className="bg-[#292a4a] text-[#7d84ff] text-[10px] px-1.5 py-0.5 rounded uppercase font-black ml-3 tracking-wider">Upgrade</span>
                 </button>

                 {isReviewing && (
                   <div className="flex flex-col gap-2 mt-4 text-gray-400">
                     <Loader2 className="w-4 h-4 animate-spin mb-2" />
                     <span className="text-[14px]">Analyzing tone...</span>
                   </div>
                 )}
                 {reviewData?.type === 'tone' && (
                   <div className="mt-4 flex flex-col gap-2">
                     <h3 className="text-[15px] font-bold text-white">Suggestions:</h3>
                     <ul className="list-disc pl-5 text-[13px] text-gray-300 flex flex-col gap-2">
                       {reviewData.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                     </ul>
                     <button className="mt-4 w-full py-2 bg-[#5b5fff] hover:bg-[#6b6fff] rounded-lg text-white font-bold flex items-center justify-center gap-2 transition-colors">
                       Review Changes
                     </button>
                   </div>
                 )}
              </div>
           )}

           {activeReviewTab === 'proofread' && (
              <div className="flex flex-col gap-4">
                {isReviewing ? (
                   <div className="flex items-center gap-2 text-gray-400 mb-4">
                     <Loader2 className="w-4 h-4 animate-spin" />
                     <span className="text-[14px]">Identifying grammar issues...</span>
                   </div>
                ) : reviewData?.type === 'proofread' ? (
                   <>
                     <div className="flex items-center justify-between mb-2">
                       <h3 className="text-[18px] font-bold text-white">Results</h3>
                     </div>
                     <ul className="list-disc pl-5 text-[14px] text-gray-200 mb-4 leading-relaxed flex flex-col gap-2">
                       {reviewData.issues.map((i: string, idx: number) => <li key={idx}>{i}</li>)}
                     </ul>
                     <button className="w-full py-2.5 bg-[#5b5fff] hover:bg-[#6b6fff] rounded-lg text-white font-bold flex items-center justify-center gap-2 mb-6">
                       <Play className="w-4 h-4" /> Review Changes
                     </button>
                   </>
                ) : (
                   <>
                     <p className="text-[14px] text-gray-200 mb-4 leading-relaxed">
                       Identify grammar, punctuation, word choice, and other writing issues in your document.
                     </p>
                     <button onClick={handleProofread} className="w-full py-2.5 bg-[#5b5fff] hover:bg-[#6b6fff] rounded-lg text-white font-bold flex items-center justify-center gap-2 mb-6">
                       <Play className="w-4 h-4" /> Run Proofread
                     </button>
                   </>
                )}
              </div>
           )}

        </div>
      </div>
      )}

      {/* Citation Style Modal */}
      {showCitationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[850px] bg-[#151515] rounded-xl border border-[#333] shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-[#2a2a2a] flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Citation Style</h2>
              <button onClick={() => setShowCitationModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 flex flex-col gap-6">
              <p className="text-[15px] text-gray-400 leading-relaxed">
                Pick a format and a locale. The locale changes page abbreviations, author joins, and "et al." conventions to match your reader's expectations.
              </p>
              
              {/* Search */}
              <div className="relative">
                <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search 2600+ styles" 
                  className="w-full bg-[#111111] border border-[#2a2a2a] rounded-lg pl-12 pr-4 py-3 text-[15px] text-gray-200 focus:outline-none focus:border-[#444] transition-colors" 
                />
              </div>

              {/* 2 Columns */}
              <div className="flex gap-6 h-[280px]">
                {/* Left Col: Styles */}
                <div className="flex-1 flex flex-col min-w-0">
                  <h3 className="text-[11px] font-bold text-gray-500 mb-3 tracking-wider uppercase">ALL STYLES</h3>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-1">
                    {[
                      'AMR', 
                      'Accident Analysis and Prevention', 
                      'ACI Materials Journal', 
                      'ACM SIG Proceedings ("et al." for 15+ authors)',
                      'ACM SIG Proceedings ("et al." for 3+ authors)',
                      'CHI Extended Abstract Format',
                      'ACM SIGCHI Proceedings (2016)',
                      'ACM SIGGRAPH',
                      'APA (7th ed.)',
                      'MLA (9th ed.)',
                      'Chicago Manual of Style (17th ed.)',
                      'Harvard',
                      'IEEE',
                      'Vancouver',
                      'AMA (11th ed.)'
                    ].filter(s => s.toLowerCase().includes(searchQuery.toLowerCase())).map((style) => (
                      <div 
                        key={style}
                        onClick={() => setSelectedStyle(style)}
                        className={`px-4 py-3 rounded-lg text-[15px] cursor-pointer transition-colors ${selectedStyle === style ? 'bg-[#2a2a2a] text-white font-bold' : 'text-gray-300 hover:bg-[#222]'}`}
                      >
                        {style}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="w-[1px] bg-[#2a2a2a] my-2" />

                {/* Right Col: Locales */}
                <div className="w-[320px] flex flex-col shrink-0">
                  <h3 className="text-[11px] font-bold text-gray-500 mb-3 tracking-wider uppercase">LOCALIZED FOR</h3>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-1">
                    {[
                      { name: "Default (Style's locale)", code: 'es-ES' },
                      { name: 'Afrikaans (South Africa)', code: 'af-ZA' },
                      { name: 'American English', code: 'en-US' },
                      { name: 'Arabic', code: 'ar' },
                      { name: 'Armenian (Armenia)', code: 'hy-AM' },
                      { name: 'Austrian German', code: 'de-AT' },
                      { name: 'bal (Pakistan)', code: 'bal-PK' },
                      { name: 'Basque', code: 'eu' }
                    ].map((locale) => (
                      <div 
                        key={locale.name}
                        onClick={() => setSelectedLocale(locale.name)}
                        className={`px-3 py-2.5 rounded-lg text-[15px] cursor-pointer flex items-center justify-between transition-colors ${selectedLocale === locale.name ? 'bg-[#2a2a2a] text-white' : 'text-gray-300 hover:bg-[#222]'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold w-6 text-center ${selectedLocale === locale.name ? 'text-white' : 'text-gray-500'}`}>{locale.code.split('-')[0].toUpperCase()}</span>
                          <span className={selectedLocale === locale.name ? 'font-bold' : ''}>{locale.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-[#333] text-[#888] text-[11px]">{locale.code}</span>
                          {selectedLocale === locale.name && <Check className="w-4 h-4 text-white" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="flex flex-col gap-3 mt-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-[11px] font-bold text-gray-500 tracking-wider uppercase">PREVIEW</h3>
                  <div className="flex bg-[#111111] rounded-full p-1 border border-[#2a2a2a]">
                    <button 
                      onClick={() => setPreviewMode('Bibliography')}
                      className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${previewMode === 'Bibliography' ? 'bg-[#333] text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                      Bibliography
                    </button>
                    <button 
                      onClick={() => setPreviewMode('In-text')}
                      className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${previewMode === 'In-text' ? 'bg-[#333] text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                      In-text
                    </button>
                  </div>
                </div>
                <div className="bg-[#222] border border-[#2a2a2a] rounded-xl p-5 text-[15px] text-gray-200 leading-relaxed min-h-[100px]">
                  {previewMode === 'Bibliography' ? 
                    <span>JOHNSON, Emily R., CHEN, Wei, PATEL, Ananya. The impact of artificial intelligence on modern research methodologies. En <i className="text-gray-300">Journal of Computational Science</i> [en línea]. 2024, vol. 42, n° 3, pp. 112-128. DOI: 10.1234/jcs.2024.0042</span>
                    :
                    <span>(Johnson et al., 2024)</span>
                  }
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-between items-center bg-[#111111]">
              <div className="text-[14px] text-gray-400">
                Selected style: <strong className="text-white">{selectedStyle}</strong>, localised for <strong className="text-white">{selectedLocale}</strong>
              </div>
              <button 
                onClick={() => { 
                  setCitationStyle(selectedStyle); 
                  setShowCitationModal(false); 
                }} 
                className="bg-[#5b5fff] hover:bg-[#6b6fff] text-white px-8 py-2.5 rounded-lg text-[15px] font-bold transition-colors"
              >
                Done
              </button>
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

      {/* Claim Confidence Settings Modal */}
      {showClaimConfidenceSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[600px] bg-[#161616] border border-[#333] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-5 border-b border-[#2a2a2a] flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Claim confidence settings</h2>
              <button onClick={() => setShowClaimConfidenceSettings(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="bg-[#1b1c3a] border border-[#3b3c6a] rounded-lg px-4 py-3 flex items-start gap-3">
                <Info className="w-5 h-5 text-[#6d93e8] mt-0.5 shrink-0" />
                <span className="text-[14px] text-[#6d93e8]">Changes here will also affect your document citation settings</span>
              </div>
              
              <div className="flex flex-col gap-5">
                <span className="text-[12px] font-bold text-gray-500 tracking-wider">SOURCES</span>
                
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-bold text-white">Consider external sources</span>
                    <span className="text-[13px] text-gray-400">Jenni will consider sources from the web</span>
                  </div>
                  <div onClick={() => setExternalSources(!externalSources)} className={`w-11 h-6 rounded-full flex items-center px-1 cursor-pointer transition-colors ${externalSources ? 'bg-[#5b5fff]' : 'bg-[#3d3d3d]'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${externalSources ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-bold text-white">Consider library sources</span>
                    <span className="text-[13px] text-gray-400">Jenni will consider sources from your library</span>
                  </div>
                  <div onClick={() => setLibrarySources(!librarySources)} className={`w-11 h-6 rounded-full flex items-center px-1 cursor-pointer transition-colors ${librarySources ? 'bg-[#5b5fff]' : 'bg-[#3d3d3d]'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${librarySources ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-bold text-white">Limit to a collection</span>
                    <span className="text-[13px] text-gray-400">Jenni will focus on sources from this collection</span>
                  </div>
                  <div className="px-4 py-2.5 border border-[#333] rounded-lg text-[14px] font-bold text-gray-400 flex items-center justify-between gap-4 w-[240px] bg-[#1a1a1a] cursor-pointer hover:border-[#444]">
                    <span>{limitCollection}</span>
                    <ChevronRight className="w-4 h-4 rotate-90 text-gray-500" />
                  </div>
                </div>
              </div>

              <div className="h-[1px] bg-[#2a2a2a] w-full my-1"></div>
              
              <div className="flex flex-col gap-5">
                <span className="text-[12px] font-bold text-gray-500 tracking-wider">CITATION FILTERS</span>
                
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold text-white">Publish year</span>
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setPublishYear('All')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${publishYear === 'All' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>All</button>
                    <button onClick={() => setPublishYear('Last 5 years')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${publishYear === 'Last 5 years' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>Last 5 years</button>
                    <button onClick={() => setPublishYear('Custom')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${publishYear === 'Custom' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>Custom</button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold text-white">Impact Factor</span>
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setImpactFactor('All')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${impactFactor === 'All' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>All</button>
                    <button onClick={() => setImpactFactor('0.25+')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${impactFactor === '0.25+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>0.25+</button>
                    <button onClick={() => setImpactFactor('3+')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${impactFactor === '3+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>3+</button>
                    <button onClick={() => setImpactFactor('10+')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${impactFactor === '10+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>10+</button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold text-white">Cited by</span>
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setCitedBy('All')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${citedBy === 'All' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>All</button>
                    <button onClick={() => setCitedBy('5+')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${citedBy === '5+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>5+</button>
                    <button onClick={() => setCitedBy('20+')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${citedBy === '20+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>20+</button>
                    <button onClick={() => setCitedBy('50+')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${citedBy === '50+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>50+</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#2a2a2a] flex items-center justify-end gap-3">
              <button onClick={() => setShowClaimConfidenceSettings(false)} className="px-5 py-2.5 rounded-lg border border-[#444] text-white hover:bg-[#222] transition-colors font-bold text-[14px]">Cancel</button>
              <button onClick={() => { setShowClaimConfidenceSettings(false); handleClaimConfidence(); }} className="bg-[#5b5fff] hover:bg-[#6b6fff] text-white px-5 py-2.5 rounded-lg font-bold text-[14px] transition-colors shadow-sm">Run review</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
