'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Save, BookOpen, Quote } from 'lucide-react';
import { useState, useEffect } from 'react';
import axios from 'axios';

export function RichTextEditor() {
  const [loading, setLoading] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing your academic paper here...',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[500px] text-gray-200',
      },
    },
  });

  useEffect(() => {
    const handleInsert = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (editor && customEvent.detail) {
        editor.commands.insertContent(`\n\n**Research Assistant:**\n${customEvent.detail}\n\n`);
      }
    };
    
    window.addEventListener('insert-ai-text', handleInsert);
    return () => window.removeEventListener('insert-ai-text', handleInsert);
  }, [editor]);

  const handleAiAction = async (action: 'improve' | 'summarize' | 'cite') => {
    if (!editor) return;
    setLoading(true);
    
    // Get current text or selection
    const text = editor.state.selection.empty ? editor.getText() : editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
    
    if (!text) {
      alert("Please write or select some text first.");
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post(`\${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/chat`, {
        message: `Please ${action} the following text:\n\n${text}`,
        agent_type: action === 'cite' ? 'citation' : 'writing',
        use_rag: false
      });

      // Insert response below the text
      editor.commands.insertContent(`\n\n**AI Suggestion (${action}):**\n${response.data.response}\n\n`);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!editor) return;
    // Export as HTML but save as .doc so Microsoft Word opens it perfectly
    const content = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Research Document</title></head>
      <body>${editor.getHTML()}</body>
      </html>
    `;
    const blob = new Blob([content], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Research_Document.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="h-full flex flex-col shadow-lg border-white/10 bg-[#0a0a0a]">
      <CardHeader className="border-b border-white/10 flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-500 bg-clip-text text-transparent flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-violet-400" />
          Research Document
        </CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleAiAction('improve')} disabled={loading} className="border-violet-500/30 hover:bg-violet-500/10 text-violet-300">
            <Sparkles className="w-4 h-4 mr-2" /> Improve
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAiAction('cite')} disabled={loading} className="border-blue-500/30 hover:bg-blue-500/10 text-blue-300">
            <Quote className="w-4 h-4 mr-2" /> Generate Citation
          </Button>
          <Button variant="default" size="sm" onClick={handleSave} className="bg-white text-black hover:bg-gray-200">
            <Save className="w-4 h-4 mr-2" /> Save
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-auto bg-transparent">
        <Tabs defaultValue="editor" className="h-full flex flex-col">
          <div className="px-4 pt-2">
            <TabsList className="bg-black/40 border border-white/10">
              <TabsTrigger value="editor">Editor</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="editor" className="flex-1 p-6 m-0 border-none outline-none">
            <EditorContent editor={editor} className="h-full" />
          </TabsContent>
          <TabsContent value="preview" className="flex-1 p-6 m-0 text-gray-300">
            Preview mode coming soon.
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
