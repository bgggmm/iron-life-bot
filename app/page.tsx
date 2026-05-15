"use client";
import { useState, useEffect, useRef } from "react";
import { Message } from "@/types/chat";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);

  // CONTEXTO DE EJEMPLO: Esto es lo que cambiarás para cada cliente
  const businessContext =
    "Gimnasio Iron Life en Cochabamba. Mensualidad 250 Bs. Horario 6am-10pm. Coach incluido.";

  // Auto-scroll inteligente: Sigue el final si carga, o el inicio si llega mensaje largo
  useEffect(() => {
    if (isLoading) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ 
        behavior: "smooth", 
        block: "start" 
      });
    }
  }, [messages, isLoading]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, businessContext }),
      });

      if (!res.ok) throw new Error("Error en la API");

      const botMessage: Message = await res.json();
      setMessages([...newMessages, botMessage]);
    } catch (err) {
      console.error("Error:", err);
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "⚠️ Hubo un pequeño error técnico. Por favor, intenta de nuevo. 😅",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex h-screen w-screen bg-[#040609] justify-center items-center font-sans antialiased overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#1a202c_0%,_#040609_100%)] opacity-40"></div>

      {/* EL "CELULAR" */}
      <div className="relative w-[380px] h-[90vh] bg-[#0d1117] flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.7)] border border-slate-800 rounded-[3rem] overflow-hidden backdrop-blur-sm">
        
        {/* HEADER */}
        <header className="pt-10 pb-4 px-6 border-b border-slate-800 bg-[#0d1117]/90 backdrop-blur-md z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-11 bg-blue-600 rounded-full flex items-center justify-center font-extrabold text-white shadow-lg shadow-blue-500/20 border-2 border-blue-400">
                IL
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d1117]"></span>
              </div>
              <div>
                <h1 className="text-sm font-extrabold text-white tracking-tight">Iron Life Gym</h1>
                <p className="text-[11px] text-green-400 font-medium">Asistente VIP en línea</p>
              </div>
            </div>
            <button className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
          </div>
        </header>

        {/* ÁREA DE MENSAJES */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#080a0f] custom-scrollbar">
          {messages.length === 0 && (
            <div className="text-center pt-10 px-4">
              <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-slate-200">¡Hola! Soy tu asistente de Iron Life.</h2>
              <p className="text-xs text-slate-500 mt-2 max-w-[250px] mx-auto">Pregúntame sobre precios, horarios o cómo empezar hoy mismo. 💪</p>
            </div>
          )}

          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            return (
              <div
                key={i}
                ref={isLast && m.role === "assistant" ? lastMessageRef : null}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in-up ${
                  m.role === "assistant" ? "scroll-mt-24" : ""
                }`}
              >
                <div
                  className={`max-w-[85%] px-4 py-3 rounded-2xl text-[14px] leading-relaxed shadow-md transition-all ${
                    m.role === "user"
                      ? "bg-blue-600 text-white rounded-tr-none font-medium"
                      : "bg-slate-800/60 text-slate-100 rounded-tl-none border border-slate-700/50 backdrop-blur-sm whitespace-pre-wrap"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start animate-fade-in">
              <div className="bg-slate-800/60 border border-slate-700/50 text-slate-400 text-[11px] px-4 py-2 rounded-full rounded-tl-none flex items-center gap-2 backdrop-blur-sm">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse [animation-delay:0.4s]"></span>
                </div>
                Iron Bot está escribiendo
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT AREA */}
        <div className="p-4 bg-[#0d1117] border-t border-slate-800 pb-6 z-10">
          <div className="flex gap-2 bg-[#161b22] p-2 rounded-full border border-slate-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all shadow-inner">
            <input
              className="flex-1 bg-transparent px-4 py-2 outline-none text-sm text-slate-100 placeholder:text-slate-500"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Escribe tu pregunta aquí..."
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-full shadow-lg shadow-blue-600/20 transition-all active:scale-95 disabled:bg-slate-700"
            >
              {isLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}