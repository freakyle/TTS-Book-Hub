
export interface Voice {
  id: string;
  name: string;
  language?: string;
}

export interface PlaybackSettings {
  voice: string;
  speed: number;
  model: string;
  apiKey: string;
  endpoint: string;
  uiLanguage: 'zh' | 'en';
}

export interface Chapter {
  id: string;
  sequence: string; // 章节序数，如 "第一章" 或 "1"
  title: string;
  content: string;
  createdAt: number;
}

export interface Book {
  id: string;
  name: string;
  chapters: Chapter[];
  lastReadChapterId?: string;
  lastReadChunkIndex?: number;
  completedChapterIds?: string[];
}

export interface TextChunk {
  index: number;
  content: string;
  audioBlob?: Blob;
}
