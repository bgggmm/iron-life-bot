export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequestBody {
  messages: Message[];
  businessContext: string;
}