import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import axios from 'axios';
import ReactMarkdown from 'hreact-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const newMessages = [...messages, { role: 'user', content: input } as Message];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/chat`, {
        message: input,
        agent_type: 'research',
        use_rag: true
      });

      const responseText = response.data.response;
      setMessages([...newMessages, { role: 'assistant', content: responseText }]);
      
      // Dispatch event to insert into the center RichTextEditor
      window.dispatchEvent(new CustomEvent('insert-ai-text', { detail: responseText }));
      
    } catch (error) {
      console.error(error);
      setMessages([...newMessages, { role: 'assistant', content: 'Error communicating with the research agent.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="h-full flex flex-col shadow-lg border-white/10 bg-white/5 backdrop-blur-md">
      <CardHeader className="border-b border-white/10">
        <CardTitle className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Pinnacology Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-4 min-h-0">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-4 min-h-0 space-y-6 flex flex-col scroll-smooth">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 my-auto">
              <p>Hello! I am your Pinnacology Assistant.</p>
              <p>Ask me a question or upload a document to get started.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-2xl p-4 ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white/5 border border-white/10 text-gray-200'}`}>
                <div className="prose prose-invert max-w-none text-sm">
                  <ReactMarkdown>
                    {m.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start w-full">
              <div className="bg-white/5 border border-white/10 text-gray-200 rounded-2xl p-4 max-w-[90%]">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-white/10 flex gap-2 shrink-0">
          <Input 
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask about a topic or paper..."
            className="flex-1 bg-black/20 border-white/10 focus-visible:ring-blue-500"
          />
          <Button onClick={sendMessage} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
