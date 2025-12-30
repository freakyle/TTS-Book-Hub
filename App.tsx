
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlaybackSettings, Book, Chapter } from './types';
import { DEFAULT_SETTINGS, Icons, TRANSLATIONS } from './constants';
import { splitTextIntoChunks } from './utils/textUtils';
import { generateAudioBlob } from './services/ttsService';
import SettingsModal from './components/SettingsModal';

const SETTINGS_STORAGE_KEY = 'moxiang_settings_v3';
const LIBRARY_STORAGE_KEY = 'moxiang_library_v1';

type ViewMode = 'library' | 'book_detail' | 'editor' | 'reader';

const App: React.FC = () => {
  // 基础状态
  const [viewMode, setViewMode] = useState<ViewMode>('library');
  const [settings, setSettings] = useState<PlaybackSettings>(() => {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = TRANSLATIONS[settings.uiLanguage];

  // 藏书阁数据
  const [library, setLibrary] = useState<Book[]>(() => {
    const saved = localStorage.getItem(LIBRARY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  
  // 交互中间状态：重命名和删除确认
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [tempBookName, setTempBookName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 批量管理状态
  const [isManageMode, setIsManageMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());

  // 当前编辑/阅读的章节
  const [currentChapter, setCurrentChapter] = useState<Partial<Chapter>>({
    sequence: '',
    title: '',
    content: ''
  });

  // 阅读器专用状态
  const [isReading, setIsReading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [chunks, setChunks] = useState<string[]>([]);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedAudio = useRef<Map<number, string>>(new Map());
  const activeChunkRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoPlayRef = useRef(false);

  // 持久化 Library
  useEffect(() => {
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
  }, [library]);

  const stopReading = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = ""; 
      audioRef.current.load();
    }
    setIsReading(false);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    preloadedAudio.current.clear();
  }, [settings]);

  // 更新阅读进度的函数
  const updateProgress = useCallback((bookId: string, chapterId: string, chunkIndex: number, isLastChunk: boolean) => {
    setLibrary(prev => prev.map(book => {
      if (book.id === bookId) {
        const completedIds = new Set(book.completedChapterIds || []);
        if (isLastChunk) {
          completedIds.add(chapterId);
        }
        return {
          ...book,
          lastReadChapterId: chapterId,
          lastReadChunkIndex: chunkIndex,
          completedChapterIds: Array.from(completedIds)
        };
      }
      return book;
    }));
  }, []);

  const playChunk = useCallback(async (index: number) => {
    if (index < 0 || index >= chunks.length) {
      stopReading();
      return;
    }

    setCurrentChunkIndex(index);
    setError(null);
    setIsLoading(true);

    if (selectedBookId && currentChapter.id) {
      updateProgress(selectedBookId, currentChapter.id, index, index === chunks.length - 1);
    }

    try {
      let audioUrl = preloadedAudio.current.get(index);
      if (!audioUrl) {
        const textToSpeak = chunks[index];
        if (!textToSpeak) throw new Error(settings.uiLanguage === 'zh' ? "文本内容为空" : "Text is empty");
        
        const blob = await generateAudioBlob(textToSpeak, settings);
        audioUrl = URL.createObjectURL(blob);
        preloadedAudio.current.set(index, audioUrl);
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = audioUrl;
        
        await audioRef.current.play();
        setIsReading(true);
        setIsLoading(false);

        [index + 1, index + 2].forEach(nextIdx => {
          if (nextIdx < chunks.length && !preloadedAudio.current.has(nextIdx)) {
            generateAudioBlob(chunks[nextIdx], settings).then(blob => {
              preloadedAudio.current.set(nextIdx, URL.createObjectURL(blob));
            }).catch(() => {});
          }
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || (settings.uiLanguage === 'zh' ? "生成失败" : "Generation failed"));
      setIsReading(false);
      setIsLoading(false);
    }
  }, [chunks, settings, stopReading, selectedBookId, currentChapter.id, updateProgress]);

  useEffect(() => {
    if (shouldAutoPlayRef.current && chunks.length > 0) {
      shouldAutoPlayRef.current = false;
      playChunk(currentChunkIndex); 
    }
  }, [chunks, playChunk, currentChunkIndex]);

  useEffect(() => {
    const audio = new Audio();
    audio.onended = () => {
      setCurrentChunkIndex(prev => {
        const next = prev + 1;
        playChunk(next);
        return next;
      });
    };
    audioRef.current = audio;
    return () => stopReading();
  }, [playChunk, stopReading]);

  useEffect(() => {
    if (viewMode === 'reader' && activeChunkRef.current) {
      activeChunkRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentChunkIndex, viewMode]);

  const handleBack = () => {
    if (viewMode === 'reader' || viewMode === 'editor') {
      setViewMode('book_detail');
    } else if (viewMode === 'book_detail') {
      setViewMode('library');
      setSelectedBookId(null);
      setEditingBookId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleCreateBook = () => {
    if (!newBookName.trim()) {
      setIsCreatingBook(false);
      return;
    }
    const newBook: Book = {
      id: Date.now().toString(),
      name: newBookName.trim(),
      chapters: []
    };
    setLibrary(prev => [...prev, newBook]);
    setNewBookName('');
    setIsCreatingBook(false);
  };

  // 重命名：开始编辑
  const startEditing = (book: Book, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBookId(book.id);
    setTempBookName(book.name);
    setConfirmDeleteId(null);
  };

  // 重命名：执行保存
  const saveRename = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tempBookName.trim()) {
      setLibrary(prev => prev.map(b => b.id === id ? { ...b, name: tempBookName.trim() } : b));
    }
    setEditingBookId(null);
  };

  // 删除：触发确认状态
  const triggerDeleteConfirm = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(id);
    setEditingBookId(null);
  };

  // 删除：执行物理删除
  const executeDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLibrary(prev => prev.filter(b => b.id !== id));
    if (selectedBookId === id) {
      stopReading();
      setViewMode('library');
      setSelectedBookId(null);
    }
    setConfirmDeleteId(null);
  };

  const cancelAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBookId(null);
    setConfirmDeleteId(null);
  };

  const toggleBookSelection = (id: string) => {
    setSelectedBookIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllBooks = () => {
    if (selectedBookIds.size === library.length) {
      setSelectedBookIds(new Set());
    } else {
      setSelectedBookIds(new Set(library.map(b => b.id)));
    }
  };

  const batchExport = () => {
    const booksToExport = library.filter(b => selectedBookIds.has(b.id));
    if (booksToExport.length === 0) return;
    
    const data = booksToExport.length === 1 ? booksToExport[0] : booksToExport;
    const dateStr = new Date().toLocaleDateString();
    const fileName = booksToExport.length === 1 
      ? `${booksToExport[0].name}.moxiang.json` 
      : `Export_${dateStr}.json`;
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    setIsManageMode(false);
    setSelectedBookIds(new Set());
  };

  const batchDelete = () => {
    if (window.confirm(t.deleteBatchConfirm.replace('{count}', selectedBookIds.size.toString()))) {
      setLibrary(prev => prev.filter(b => !selectedBookIds.has(b.id)));
      if (selectedBookId && selectedBookIds.has(selectedBookId)) {
        stopReading();
        setViewMode('library');
        setSelectedBookId(null);
      }
      setSelectedBookIds(new Set());
      setIsManageMode(false);
    }
  };

  const startNewChapter = (bookId: string) => {
    const book = library.find(b => b.id === bookId);
    setSelectedBookId(bookId);
    const defaultSeq = settings.uiLanguage === 'zh' ? `第${(book?.chapters.length || 0) + 1}章` : `Chapter ${(book?.chapters.length || 0) + 1}`;
    setCurrentChapter({
      sequence: defaultSeq,
      title: '',
      content: ''
    });
    setViewMode('editor');
  };

  const openChapterEditor = (chapter: Chapter, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentChapter(chapter);
    setViewMode('editor');
  };

  const saveChapterData = () => {
    if (!currentChapter.content?.trim()) return null;
    
    const chapterToSave: Chapter = {
      id: (currentChapter.id || Date.now().toString()) as string,
      sequence: currentChapter.sequence || (settings.uiLanguage === 'zh' ? '未知' : 'Unknown'),
      title: currentChapter.title || (settings.uiLanguage === 'zh' ? '无标题' : 'Untitled'),
      content: currentChapter.content || '',
      createdAt: currentChapter.createdAt || Date.now()
    };

    setLibrary(prev => prev.map(book => {
      if (book.id === selectedBookId) {
        const exists = book.chapters.find(c => c.id === chapterToSave.id);
        const newChapters = exists 
          ? book.chapters.map(c => c.id === chapterToSave.id ? chapterToSave : c)
          : [...book.chapters, chapterToSave];
        return { ...book, chapters: newChapters, lastReadChapterId: chapterToSave.id };
      }
      return book;
    }));

    return chapterToSave;
  };

  const handleSaveOnly = () => {
    const saved = saveChapterData();
    if (saved) {
      setViewMode('book_detail');
    }
  };

  const handleSaveAndRead = () => {
    const saved = saveChapterData();
    if (!saved) return;

    stopReading();
    preloadedAudio.current.clear();
    setCurrentChunkIndex(0);
    const newChunks = splitTextIntoChunks(saved.content);
    shouldAutoPlayRef.current = true; 
    setChunks(newChunks); 
    setViewMode('reader');
  };

  const selectChapterToRead = (book: Book, chapter: Chapter) => {
    stopReading(); 
    preloadedAudio.current.clear(); 
    setSelectedBookId(book.id);
    setCurrentChapter(chapter);
    
    const isSameChapter = book.lastReadChapterId === chapter.id;
    const resumeIndex = isSameChapter ? (book.lastReadChunkIndex || 0) : 0;
    
    setCurrentChunkIndex(resumeIndex); 
    
    const newChunks = splitTextIntoChunks(chapter.content);
    shouldAutoPlayRef.current = true; 
    setChunks(newChunks); 
    setViewMode('reader');
  };

  const deleteChapter = (bookId: string, chapterId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm(t.deleteChapterConfirm)) {
      setLibrary(prev => prev.map(b => b.id === bookId ? { ...b, chapters: b.chapters.filter(c => c.id !== chapterId) } : b));
      if (currentChapter?.id === chapterId) {
        stopReading();
        setChunks([]);
      }
    }
  };

  const exportBook = (book: Book, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const data = JSON.stringify(book, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book.name}.moxiang.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawData = JSON.parse(event.target?.result as string);
        const importedItems = Array.isArray(rawData) ? rawData : [rawData];
        
        const booksToSave: Book[] = [];
        importedItems.forEach(item => {
          if (item.name && Array.isArray(item.chapters)) {
            const newId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            booksToSave.push({ ...item, id: newId });
          }
        });

        if (booksToSave.length === 0) throw new Error("Format error");
        
        setLibrary(prev => [...prev, ...booksToSave]);
        alert(t.importSuccess.replace('{count}', booksToSave.length.toString()));
      } catch (err) {
        setError(t.importFailed);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const currentBook = library.find(b => b.id === selectedBookId);

  return (
    <div className="h-screen flex flex-col paper-texture bg-[#f4ecd8] overflow-hidden text-[#4a3f35]">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImportFile} 
        accept=".json" 
        className="hidden" 
      />

      <header className="flex-none px-6 py-4 flex items-center justify-between border-b-2 border-[#d1c2a4]/50 z-20 bg-[#f4ecd8]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button 
            onClick={viewMode === 'library' ? undefined : handleBack}
            className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-all ${
              viewMode === 'library' 
                ? 'bg-[#8e7b68] text-[#f4ecd8] cursor-default' 
                : 'bg-white/60 text-[#8e7b68] hover:bg-[#8e7b68] hover:text-[#f4ecd8] active:scale-90'
            }`}
          >
            {viewMode === 'library' ? <Icons.Library /> : <Icons.ChevronLeft />}
          </button>
          <div>
            <h1 
              className="text-3xl font-normal tracking-tight cursor-pointer hover:opacity-80 transition-opacity" 
              style={{ fontFamily: settings.uiLanguage === 'zh' ? "'Ma Shan Zheng', cursive" : "inherit" }}
              onClick={() => { setViewMode('library'); setSelectedBookId(null); setIsManageMode(false); }}
            >
              {t.appName}
            </h1>
            {currentBook && (
               <p className="text-[10px] uppercase tracking-widest opacity-60 font-bold -mt-1 truncate max-w-[150px]">
                {currentBook.name} {currentChapter?.sequence ? `· ${currentChapter.sequence}` : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {viewMode === 'reader' && (
            <>
              <button 
                onClick={() => setViewMode('book_detail')} 
                className="p-2 hover:bg-black/5 rounded-full transition-colors" 
                title={t.chaptersList}
              >
                <Icons.Book />
              </button>
              <button 
                onClick={() => setViewMode('editor')} 
                className="p-2 hover:bg-black/5 rounded-full transition-colors" 
                title={t.editChapter}
              >
                <Icons.Edit />
              </button>
            </>
          )}
          <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-black/5 rounded-full transition-colors" title={t.settings}><Icons.Settings /></button>
        </div>
      </header>

      <main className={`flex-1 relative overflow-hidden ${chunks.length > 0 ? 'mb-24' : ''}`}>
        {viewMode === 'library' && (
          <div className="absolute inset-0 p-8 overflow-y-auto custom-scrollbar animate-fadeIn">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Icons.Book /> {isManageMode ? `${t.manageMode} (${t.selected} ${selectedBookIds.size})` : t.library}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {isManageMode ? (
                  <>
                    <button onClick={selectAllBooks} className="text-xs font-bold text-[#8e7b68] hover:bg-[#8e7b68]/10 px-3 py-2 rounded-lg transition-colors border border-[#8e7b68]/20">
                      {selectedBookIds.size === library.length ? t.deselectAll : t.selectAll}
                    </button>
                    <button onClick={batchExport} disabled={selectedBookIds.size === 0} className="bg-[#8e7b68] text-[#f4ecd8] px-4 py-2 rounded-lg shadow-md disabled:opacity-40 flex items-center gap-2 transition-all active:scale-95 text-sm font-bold">
                      <Icons.Upload /> {t.batchExport}
                    </button>
                    <button onClick={batchDelete} disabled={selectedBookIds.size === 0} className="bg-red-600 text-white px-4 py-2 rounded-lg shadow-md disabled:opacity-40 flex items-center gap-2 transition-all active:scale-95 text-sm font-bold">
                      <Icons.Trash /> {t.batchDelete}
                    </button>
                    <button onClick={() => { setIsManageMode(false); setSelectedBookIds(new Set()); }} className="text-[#8e7b68] text-sm px-4 py-2 border-2 border-[#8e7b68] rounded-lg font-bold hover:bg-[#8e7b68] hover:text-[#f4ecd8] transition-all">
                      {t.exitManage}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => fileInputRef.current?.click()} className="bg-white/40 text-[#8e7b68] border-2 border-[#8e7b68] px-4 py-2 rounded-lg shadow-sm hover:bg-[#8e7b68] hover:text-[#f4ecd8] flex items-center gap-2 transition-all active:scale-95 text-sm font-bold">
                      <Icons.Download /> {t.importBook}
                    </button>
                    <button onClick={() => setIsManageMode(true)} className="bg-white/40 text-[#8e7b68] border-2 border-[#8e7b68] px-4 py-2 rounded-lg shadow-sm hover:bg-[#8e7b68] hover:text-[#f4ecd8] flex items-center gap-2 transition-all active:scale-95 text-sm font-bold">
                      <Icons.Edit /> {t.manageBooks}
                    </button>
                    {!isCreatingBook ? (
                      <button onClick={() => setIsCreatingBook(true)} className="bg-[#8e7b68] text-[#f4ecd8] px-4 py-2 rounded-lg shadow-md hover:bg-[#7d6e5d] flex items-center gap-2 transition-all active:scale-95 text-sm font-bold">
                        <Icons.Plus /> {t.addBook}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 animate-fadeIn">
                        <input autoFocus type="text" value={newBookName} onChange={(e) => setNewBookName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateBook()} placeholder={t.inputBookName} className="px-3 py-2 bg-white/60 border-2 border-[#8e7b68] rounded-lg outline-none text-sm w-40" />
                        <button onClick={handleCreateBook} className="bg-[#8e7b68] text-[#f4ecd8] px-3 py-2 rounded-lg text-sm font-bold">{t.confirm}</button>
                        <button onClick={() => setIsCreatingBook(false)} className="text-[#8e7b68] text-sm px-2">{t.cancel}</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            
            {library.length === 0 ? (
              <div className="h-64 border-2 border-dashed border-[#d1c2a4] rounded-2xl flex flex-col items-center justify-center opacity-40">
                <Icons.Book />
                <p className="mt-2">{t.noBooks}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pb-8">
                {library.map(book => {
                  const lastChapter = book.chapters.find(c => c.id === book.lastReadChapterId);
                  const progressText = lastChapter ? `${lastChapter.sequence}` : t.notStarted;
                  const isEditing = editingBookId === book.id;
                  const isDeleting = confirmDeleteId === book.id;
                  
                  return (
                    <div 
                      key={book.id}
                      onClick={() => {
                        if (isManageMode) toggleBookSelection(book.id);
                        else if (!isEditing && !isDeleting) {
                          setSelectedBookId(book.id);
                          setViewMode('book_detail');
                        }
                      }}
                      className={`aspect-[3/4] border-2 rounded-xl p-6 shadow-md transition-all group relative flex flex-col justify-between overflow-hidden cursor-pointer ${
                        selectedBookIds.has(book.id) ? 'bg-[#8e7b68]/15 border-[#8e7b68] ring-4 ring-[#8e7b68]/20' : 'bg-white/40 border-[#d1c2a4] hover:shadow-xl'
                      }`}
                    >
                      {/* 操作控制区域 */}
                      {!isManageMode && (
                        <div className="absolute top-3 right-3 flex flex-col gap-2 z-30">
                          {isEditing ? (
                            <div className="flex flex-col gap-1">
                               <button onClick={(e) => saveRename(book.id, e)} className="p-2 bg-green-500 text-white rounded-full shadow-md hover:scale-110"><Icons.Plus /></button>
                               <button onClick={cancelAction} className="p-2 bg-gray-400 text-white rounded-full shadow-md hover:scale-110">✕</button>
                            </div>
                          ) : isDeleting ? (
                            <div className="flex flex-col gap-1 items-center">
                               <p className="text-[10px] font-bold text-red-600 bg-white/80 px-1 rounded">确认?</p>
                               <button onClick={(e) => executeDelete(book.id, e)} className="p-2 bg-red-600 text-white rounded-full shadow-lg scale-125 hover:bg-red-700 animate-pulse"><Icons.Trash /></button>
                               <button onClick={cancelAction} className="p-1 mt-1 text-[#8e7b68] text-[10px] font-bold underline">取消</button>
                            </div>
                          ) : (
                            <>
                              <button onClick={(e) => startEditing(book, e)} className="p-2 bg-white/90 text-[#8e7b68] rounded-full shadow-sm hover:bg-[#8e7b68] hover:text-white transition-all"><Icons.Edit /></button>
                              <button onClick={(e) => triggerDeleteConfirm(book.id, e)} className="p-2 bg-white/90 text-red-600 rounded-full shadow-sm hover:bg-red-600 hover:text-white transition-all"><Icons.Trash /></button>
                            </>
                          )}
                        </div>
                      )}

                      {isManageMode && (
                        <div className="absolute top-4 left-4 z-20 pointer-events-none">
                           <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                             selectedBookIds.has(book.id) ? 'bg-[#8e7b68] border-[#8e7b68] scale-110 shadow-lg' : 'bg-white border-[#d1c2a4]'
                           }`}>
                             {selectedBookIds.has(book.id) && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                           </div>
                        </div>
                      )}

                      <div className="w-1.5 h-full absolute left-0 top-0 bg-[#8e7b68] rounded-l-xl opacity-80 pointer-events-none"></div>
                      
                      <div className="mt-4 relative z-10">
                        {isEditing ? (
                          <input 
                            autoFocus
                            type="text" 
                            className="w-full bg-white border-2 border-[#8e7b68] p-1 rounded font-bold text-lg outline-none"
                            value={tempBookName}
                            onChange={(e) => setTempBookName(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <h3 className={`text-xl font-bold break-words leading-tight transition-all pr-8 ${isManageMode ? 'ml-8' : ''}`}>{book.name}</h3>
                        )}
                        {book.lastReadChapterId && (
                           <div className="mt-2 text-[10px] font-bold text-[#8e7b68] opacity-70 flex items-center gap-1">
                             <span className="w-2 h-2 rounded-full bg-[#8e7b68] animate-pulse"></span>
                             {t.readProgress.replace('{text}', progressText)}
                           </div>
                        )}
                      </div>

                      <div className="mt-auto relative z-0 pointer-events-none">
                        <p className="text-xs opacity-60 font-medium">{t.chaptersCount.replace('{count}', book.chapters.length.toString())}</p>
                        <div className="w-full h-1 bg-[#d1c2a4]/30 mt-2 rounded-full overflow-hidden">
                          <div className="h-full bg-[#8e7b68] opacity-40" style={{ width: book.chapters.length > 0 ? `${(book.completedChapterIds?.length || 0) / book.chapters.length * 100}%` : '0%' }}></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {viewMode === 'book_detail' && currentBook && (
          <div className="absolute inset-0 p-8 overflow-y-auto custom-scrollbar animate-fadeIn">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <div className="flex items-center gap-4">
                <button onClick={handleBack} className="p-2 hover:bg-black/5 rounded-full transition-colors"><Icons.ChevronLeft /></button>
                <div className="flex items-center gap-3">
                  {editingBookId === currentBook.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        autoFocus
                        type="text" 
                        className="bg-white border-2 border-[#8e7b68] p-2 rounded-xl font-bold text-2xl outline-none"
                        value={tempBookName}
                        onChange={(e) => setTempBookName(e.target.value)}
                      />
                      <button onClick={(e) => saveRename(currentBook.id, e)} className="bg-green-500 text-white p-2 rounded-xl"><Icons.Plus /></button>
                      <button onClick={cancelAction} className="bg-gray-400 text-white p-2 rounded-xl">✕</button>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-2xl font-bold text-[#4a3f35]">{currentBook.name}</h2>
                      <div className="flex gap-2">
                        <button onClick={(e) => startEditing(currentBook, e)} className="p-2 text-[#8e7b68] hover:bg-[#8e7b68]/10 rounded-lg"><Icons.Edit /></button>
                        <button onClick={(e) => triggerDeleteConfirm(currentBook.id, e)} className={`p-2 transition-all rounded-lg ${confirmDeleteId === currentBook.id ? 'bg-red-600 text-white scale-110 shadow-lg' : 'text-red-600 hover:bg-red-50'}`}>
                          {confirmDeleteId === currentBook.id ? <span onClick={(e) => executeDelete(currentBook.id, e)} className="text-sm font-bold">点此确认删除</span> : <Icons.Trash />}
                        </button>
                        {confirmDeleteId === currentBook.id && <button onClick={cancelAction} className="text-xs underline text-[#8e7b68]">返回</button>}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <button onClick={(e) => exportBook(currentBook, e)} className="text-xs font-bold border-2 border-[#8e7b68] text-[#8e7b68] px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-[#8e7b68] hover:text-[#f4ecd8] transition-all shadow-md active:scale-95">
                <Icons.Upload /> {t.exportBook}
              </button>
            </div>

            <div className="bg-white/30 border border-[#d1c2a4] rounded-2xl p-6 shadow-inner">
              <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#d1c2a4]/50">
                <span className="text-sm font-bold opacity-60 uppercase tracking-widest">{t.chaptersList}</span>
                <button type="button" onClick={() => startNewChapter(currentBook.id)} className="bg-[#8e7b68] text-[#f4ecd8] text-sm font-bold flex items-center gap-2 hover:bg-[#7d6e5d] px-5 py-2 rounded-full transition-all shadow-md active:scale-95">
                  <Icons.Plus /> {t.addNewChapter}
                </button>
              </div>
              
              <div className="space-y-4 pb-8">
                {currentBook.chapters.length === 0 ? (
                  <p className="py-16 text-center opacity-40 italic text-lg">{t.noChapters}</p>
                ) : (
                  currentBook.chapters.slice().sort((a,b) => a.createdAt - b.createdAt).map(ch => {
                    const isLastRead = currentBook.lastReadChapterId === ch.id;
                    const isCompleted = currentBook.completedChapterIds?.includes(ch.id);

                    return (
                      <div 
                        key={ch.id}
                        onClick={() => selectChapterToRead(currentBook, ch)}
                        className={`group flex items-stretch p-1.5 rounded-2xl transition-all border-2 shadow-sm overflow-hidden cursor-pointer ${
                          isLastRead ? 'bg-[#8e7b68] text-[#f4ecd8] border-[#8e7b68]' : 'bg-white/60 hover:bg-white/90 border-transparent hover:border-[#8e7b68]/20'
                        }`}
                      >
                        <div className="flex-1 flex items-center gap-5 py-3 px-5 relative z-0 pointer-events-none">
                          <span className={`text-xs px-2.5 py-1 rounded-lg font-mono shrink-0 font-bold ${isLastRead ? 'bg-white/20' : 'bg-[#8e7b68]/10 text-[#8e7b68]'}`}>
                            {ch.sequence}
                          </span>
                          <span className="font-bold flex-1 truncate text-lg tracking-wide">{ch.title}</span>
                          {isCompleted && <span className={`text-[10px] px-2.5 py-1 rounded-full border-2 shrink-0 font-bold ${isLastRead ? 'border-white/30 text-white/60' : 'border-[#8e7b68]/20 text-[#8e7b68]/50'}`}>{t.completed}</span>}
                          {isLastRead && !isCompleted && <span className="text-[10px] px-3 py-1 rounded-full bg-white/30 animate-pulse shrink-0 font-bold uppercase tracking-widest">{t.reading}</span>}
                        </div>

                        <div className="flex items-center gap-2 px-4 border-l-2 border-black/5 bg-black/5 group-hover:bg-black/10 transition-colors relative z-20">
                          <button onClick={(e) => openChapterEditor(ch, e)} className={`p-2.5 rounded-full transition-all hover:scale-110 active:scale-90 shadow-md ${isLastRead ? 'text-[#f4ecd8] bg-white/20 hover:bg-white/30' : 'text-[#8e7b68] bg-white hover:bg-[#8e7b68] hover:text-white'}`}><Icons.Edit /></button>
                          <button onClick={(e) => deleteChapter(currentBook.id, ch.id, e)} className={`p-2.5 rounded-full transition-all hover:scale-110 active:scale-90 shadow-md ${isLastRead ? 'text-red-100 bg-red-900/40 hover:bg-red-900/60' : 'text-red-600 bg-white hover:bg-red-600 hover:text-white'}`}><Icons.Trash /></button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'editor' && (
          <div className="absolute inset-0 p-8 flex flex-col animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-xl font-bold flex items-center gap-2">
                <Icons.Edit /> {currentChapter.id ? t.editChapter : t.addChapter} - {currentBook?.name}
               </h2>
               <button onClick={handleBack} className="text-sm opacity-60 hover:opacity-100 font-bold underline">{t.backToCatalog}</button>
            </div>
            
            <div className="flex gap-4 mb-4">
              <input type="text" placeholder={t.seqPlaceholder} value={currentChapter.sequence} onChange={(e) => setCurrentChapter({...currentChapter, sequence: e.target.value})} className="w-32 p-3 bg-white/40 border-2 border-[#d1c2a4] rounded-lg outline-none focus:ring-2 focus:ring-[#8e7b68] transition-all" />
              <input type="text" placeholder={t.titlePlaceholder} value={currentChapter.title} onChange={(e) => setCurrentChapter({...currentChapter, title: e.target.value})} className="flex-1 p-3 bg-white/40 border-2 border-[#d1c2a4] rounded-lg outline-none focus:ring-2 focus:ring-[#8e7b68] transition-all" />
            </div>

            <textarea value={currentChapter.content} onChange={(e) => setCurrentChapter({...currentChapter, content: e.target.value})} className="flex-1 p-8 bg-white/40 border-2 border-[#d1c2a4] rounded-xl shadow-inner outline-none text-xl leading-relaxed custom-scrollbar resize-none placeholder:text-[#c1b294] transition-all focus:bg-white/60" placeholder={t.contentPlaceholder} />
            
            <div className="mt-6 flex flex-col sm:flex-row gap-4">
              <button onClick={handleSaveOnly} className="flex-1 bg-white/40 text-[#8e7b68] border-2 border-[#8e7b68] py-4 px-8 rounded-xl shadow-md hover:bg-[#8e7b68] hover:text-[#f4ecd8] transition-all active:scale-95 font-bold text-lg flex items-center justify-center gap-2">{t.saveOnly}</button>
              <button onClick={handleSaveAndRead} className="flex-[2] bg-[#8e7b68] text-[#f4ecd8] py-4 px-8 rounded-xl shadow-lg hover:bg-[#7d6e5d] transition-all active:scale-95 font-bold text-xl flex items-center justify-center gap-2"><Icons.Play /> {t.saveAndRead}</button>
            </div>
          </div>
        )}

        {viewMode === 'reader' && (
          <div className="absolute inset-0 flex flex-col animate-fadeIn">
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar relative px-8 md:px-24 select-none">
              <div className="h-[40vh]" />
              {chunks.map((chunk, idx) => (
                <div key={idx} ref={idx === currentChunkIndex ? activeChunkRef : null} className={`mb-12 text-2xl md:text-3xl leading-loose transition-all duration-700 cursor-pointer p-6 rounded-2xl text-left whitespace-pre-wrap relative group/chunk ${idx === currentChunkIndex ? 'text-[#2c2c2c] font-bold opacity-100 scale-105 filter drop-shadow-sm bg-white/10' : 'text-[#7d6e5d] opacity-20 blur-[1px] hover:opacity-40 hover:blur-0 scale-95'}`} onClick={() => playChunk(idx)}>
                  {idx === currentChunkIndex && (
                    <div className="absolute -left-6 top-1/2 -translate-y-1/2 text-[#8e7b68] animate-in slide-in-from-left-4 fade-in">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
                    </div>
                  )}
                  {chunk}
                </div>
              ))}
              <div className="h-[40vh]" />
            </div>
          </div>
        )}
      </main>

      {chunks.length > 0 && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl bg-[#8e7b68] text-[#f4ecd8] p-4 rounded-2xl shadow-2xl flex items-center justify-between z-40 ring-4 ring-[#f4ecd8]/50 transition-all transform animate-in slide-in-from-bottom-8 ${viewMode !== 'reader' ? 'cursor-pointer hover:bg-[#7d6e5d]' : ''}`} onClick={() => viewMode !== 'reader' && setViewMode('reader')}>
          <div className="flex items-center gap-2 md:gap-4">
            <button onClick={(e) => { e.stopPropagation(); playChunk(currentChunkIndex - 1); }} disabled={currentChunkIndex === 0} className="p-2 disabled:opacity-20 hover:bg-white/10 rounded-full transition-colors"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6L18 18V6z"/></svg></button>
            <button onClick={(e) => { e.stopPropagation(); isReading ? audioRef.current?.pause() : audioRef.current?.play(); }} className="w-10 h-10 md:w-12 md:h-12 bg-[#f4ecd8] text-[#8e7b68] rounded-full flex items-center justify-center hover:scale-110 shadow-lg transition-transform shrink-0">
              {isLoading ? <div className="w-5 h-5 md:w-6 md:h-6 border-2 border-[#8e7b68] border-t-transparent rounded-full animate-spin"></div> : (isReading ? <Icons.Pause /> : <Icons.Play />)}
            </button>
            <button onClick={(e) => { e.stopPropagation(); playChunk(currentChunkIndex + 1); }} disabled={currentChunkIndex === chunks.length - 1} className="p-2 disabled:opacity-20 hover:bg-white/10 rounded-full transition-colors"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
          </div>
          <div className="flex-1 px-4 flex flex-col items-center overflow-hidden">
            <div className="text-[10px] font-bold opacity-60 font-mono tracking-widest mb-1">{currentChunkIndex + 1} / {chunks.length}</div>
            {viewMode !== 'reader' && <div className="text-xs font-bold truncate max-w-full italic opacity-90">{currentChapter.sequence && `${currentChapter.sequence} · `}{currentChapter.title || t.reading}</div>}
            <div className="w-full h-1 bg-white/20 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-white transition-all duration-300" style={{ width: `${((currentChunkIndex + 1) / chunks.length) * 100}%` }}></div>
            </div>
          </div>
          <div className="hidden sm:flex flex-col items-end shrink-0">
            <span className="bg-black/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{settings.voice.split('-').pop()?.replace('Neural','')}</span>
            <span className="text-[10px] opacity-60 uppercase font-bold tracking-tighter">{settings.speed}x {t.speed}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 z-50 animate-bounce">
          <span className="text-sm font-bold">{error}</span>
          <button onClick={() => setError(null)} className="font-black p-1 hover:bg-white/20 rounded">&times;</button>
        </div>
      )}

      {showSettings && (
        <SettingsModal settings={settings} onSave={(s) => { setSettings(s); localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s)); setShowSettings(false); }} onClose={() => setShowSettings(false)} />
      )}

      <style>{`
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(142, 123, 104, 0.3); border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
