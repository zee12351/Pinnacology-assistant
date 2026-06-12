import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Copy, Save, ShieldCheck, Bot, ChevronDown, ArrowLeft } from 'lucide-react';

export function DefaultChatView({ messages, loading, handleCopy, handleSaveDoc, selectedPersona, handleGoHome, handleEvidenceVerification }: any) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 flex items-center justify-start px-4 py-3 bg-background/80 backdrop-blur-md border-b border-border gap-2">
        <button onClick={handleGoHome} className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground mr-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button className="flex items-center gap-2 text-foreground font-semibold hover:bg-muted px-3 py-1.5 rounded-lg transition-colors">
          <span className="text-lg">{selectedPersona || 'Agent'}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <div className="max-w-3xl mx-auto flex flex-col min-h-full pb-8">
          
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center flex-1 h-full text-center text-muted-foreground min-h-[50vh]">
              <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-blue-500" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">How can I help with {selectedPersona}?</h2>
              <p className="text-sm">I'm ready to assist you with specialized tasks.</p>
            </div>
          )}

          {messages.map((m: any, idx: number) => (
            <div key={idx} className={`mb-8 flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              
              <div className="flex items-start gap-4 max-w-full w-full">
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-1 shadow-md">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                )}
                
                <div className={`flex flex-col w-full ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`${
                    m.role === 'user' 
                      ? 'bg-muted text-foreground rounded-3xl px-6 py-3 max-w-[85%]' 
                      : 'bg-transparent text-foreground w-full px-2 py-1'
                  }`}>
                    
                    <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-[#1a1a1a] prose-pre:border prose-pre:border-border max-w-none break-words overflow-x-hidden custom-scrollbar">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                    
                    {m.role === 'assistant' && m.content !== '*Generation stopped by user.*' && m.content.trim().length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border">
                        <button onClick={() => handleCopy(m.content)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors text-xs text-muted-foreground font-medium">
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </button>
                        <button onClick={() => handleSaveDoc(m.content)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 transition-colors text-xs font-medium">
                          <Save className="w-3.5 h-3.5" />
                          Save as Word
                        </button>
                        <button onClick={() => alert("Turnitin API Connection Pending")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 transition-colors text-xs font-medium ml-auto">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Check Plagiarism
                        </button>
                        <button onClick={() => handleEvidenceVerification(m.content)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 transition-colors text-xs font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Verify Evidence
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {loading && (
            <div className="mb-8 flex flex-col items-start w-full">
              <div className="flex items-start gap-4 max-w-full w-full">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-1 shadow-md">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="bg-transparent text-foreground px-2 py-3 w-full">
                  <span className="flex gap-1.5 mt-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
