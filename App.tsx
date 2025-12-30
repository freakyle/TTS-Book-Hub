
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
  const [viewMode, setViewMode] = useState<ViewMode>('library');
  const [settings, setSettings] = useState<PlaybackSettings>(() => {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = TRANSLATIONS[settings.uiLanguage];

  const [library, setLibrary] = useState<Book[]>(() => {
    const saved = localStorage.getItem(LIBRARY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const currentBook = library.find(b => b.id === selectedBookId);

  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [tempBookName, setTempBookName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [isManageMode, setIsManageMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [isConfirmingBatchDelete, setIsConfirmingBatchDelete] = useState(false);

  const [isReading, setIsReading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [chunks, setChunks] = useState<string[]>([]);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedAudio = useRef<Map<number, string>>(new Map());
  const playbackIdRef = useRef<number>(0);
  const activeChunkRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoPlayRef = useRef(false);

  // 初始化音频播放器
  useEffect(() => {
    const audio = new Audio();
    audio.onplay = () => setIsReading(true);
    audio.onpause = () => setIsReading(false);
    
    audio.onerror = () => {
      const currentSrc = audio.src;
      if (currentSrc && currentSrc.length > 10) {
        setError(settings.uiLanguage === 'zh' ? "音频加载失败，请检查 API 或网络环境" : "Audio failed to load");
      }
      setIsReading(false);
      setIsLoading(false);
    };
    
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [settings.uiLanguage]);

  // 处理一段播放结束，进入下一段
  const handleNext = useCallback(() => {
    setCurrentChunkIndex(prev => {
      const next = prev + 1;
      if (next < chunks.length) {
        playChunk(next);
        return next;
      }
      setIsReading(false);
      return prev;
    });
  }, [chunks]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.onended = handleNext;
  }, [handleNext]);

  useEffect(() => {
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
  }, [library]);

  const stopReading = useCallback(() => {
    playbackIdRef.current++; 
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setIsReading(false);
    setIsLoading(false);
    preloadedAudio.current.forEach(url => URL.revokeObjectURL(url));
    preloadedAudio.current.clear();
  }, []);

  const updateProgress = useCallback((bookId: string, chapterId: string, chunkIndex: number, isLastChunk: boolean) => {
    setLibrary(prev => prev.map(book => {
      if (book.id === bookId) {
        const completedIds = new Set(book.completedChapterIds || []);
        if (isLastChunk) completedIds.add(chapterId);
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
    if (index < 0 || index >= chunks.length || !audioRef.current) {
      stopReading();
      return;
    }

    const currentPlaybackId = ++playbackIdRef.current;
    
    setCurrentChunkIndex(index);
    setError(null);
    setIsLoading(true);

    if (selectedBookId && currentChapter?.id) {
      updateProgress(selectedBookId, currentChapter.id, index, index === chunks.length - 1);
    }

    const textToSpeak = chunks[index];

    // --- 核心修复：纯符号片段拦截 ---
    // 正则解释：不包含任何字母、数字或中文字符
    const isUnspeakable = !/[\p{L}\p{N}\u4e00-\u9fa5]/u.test(textToSpeak || '');
    if (isUnspeakable) {
      setIsLoading(false);
      setIsReading(true); // 视觉上维持播放状态
      // 模拟 800ms 的停顿（留白感），然后自动进入下一段
      setTimeout(() => {
        if (currentPlaybackId === playbackIdRef.current) {
          handleNext();
        }
      }, 800);
      return;
    }
    // ----------------------------

    try {
      let audioUrl = preloadedAudio.current.get(index);
      if (!audioUrl) {
        if (!textToSpeak?.trim()) {
          if (currentPlaybackId === playbackIdRef.current) setIsLoading(false);
          return;
        }
        const blob = await generateAudioBlob(textToSpeak, settings);
        if (currentPlaybackId !== playbackIdRef.current) return;
        audioUrl = URL.createObjectURL(blob);
        preloadedAudio.current.set(index, audioUrl);
      }

      if (currentPlaybackId !== playbackIdRef.current) return;

      audioRef.current.pause();
      audioRef.current.src = audioUrl;
      
      try {
        await audioRef.current.play();
        if (currentPlaybackId === playbackIdRef.current) setIsLoading(false);
      } catch (playErr: any) {
        if (playErr.name !== 'AbortError' && currentPlaybackId === playbackIdRef.current) {
          throw playErr;
        }
      }

      // 预加载逻辑也需要避开纯符号片段
      [index + 1, index + 2].forEach(nextIdx => {
        if (nextIdx < chunks.length && !preloadedAudio.current.has(nextIdx)) {
          const nextText = chunks[nextIdx];
          const nextIsUnspeakable = !/[\p{L}\p{N}\u4e00-\u9fa5]/u.test(nextText || '');
          if (!nextIsUnspeakable) {
            generateAudioBlob(nextText, settings)
              .then(blob => preloadedAudio.current.set(nextIdx, URL.createObjectURL(blob)))
              .catch(() => {});
          }
        }
      });
    } catch (err: any) {
      if (currentPlaybackId === playbackIdRef.current) {
        setError(err.message || "播放失败");
        setIsReading(false);
        setIsLoading(false);
      }
    }
  }, [chunks, settings, stopReading, selectedBookId, updateProgress, handleNext]);

  useEffect(() => {
    if (shouldAutoPlayRef.current && chunks.length > 0) {
      shouldAutoPlayRef.current = false;
      playChunk(currentChunkIndex); 
    }
  }, [chunks, playChunk, currentChunkIndex]);

  useEffect(() => {
    if (viewMode === 'reader' && activeChunkRef.current) {
      activeChunkRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentChunkIndex, viewMode]);

  const [currentChapter, setCurrentChapter] = useState<Partial<Chapter>>({
    sequence: '', title: '', content: ''
  });

  const handleBack = () => {
    if (viewMode === 'reader' || viewMode === 'editor') setViewMode('book_detail');
    else if (viewMode === 'book_detail') { setViewMode('library'); setSelectedBookId(null); setIsManageMode(false); }
  };

  const handleCreateBook = () => {
    if (newBookName.trim()) {
      setLibrary(prev => [...prev, { id: Date.now().toString(), name: newBookName.trim(), chapters: [] }]);
      setNewBookName('');
    }
    setIsCreatingBook(false);
  };

  const executeDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLibrary(prev => prev.filter(b => b.id !== id));
    if (selectedBookId === id) { stopReading(); setViewMode('library'); setSelectedBookId(null); }
    setConfirmDeleteId(null);
  };

  const handleBatchDelete = () => {
    if (selectedBookIds.length === 0) return;
    
    const idsToRemove = [...selectedBookIds];
    setLibrary(prev => prev.filter(book => !idsToRemove.includes(book.id)));
    
    if (selectedBookId && idsToRemove.includes(selectedBookId)) {
      stopReading();
      setSelectedBookId(null);
      setViewMode('library');
    }
    
    setSelectedBookIds([]);
    setIsConfirmingBatchDelete(false);
    setIsManageMode(false);
  };

  const handleBatchExport = () => {
    if (selectedBookIds.length === 0) return;
    const booksToExport = library.filter(b => selectedBookIds.includes(b.id));
    const dataStr = JSON.stringify(booksToExport, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `moxiang_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
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
            booksToSave.push({ ...item, id: Date.now().toString() + Math.random().toString(36).substr(2, 5) });
          }
        });
        if (booksToSave.length > 0) {
          setLibrary(prev => [...prev, ...booksToSave]);
          alert(t.importSuccess.replace('{count}', booksToSave.length.toString()));
        }
      } catch (err) { setError(t.importFailed); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const selectChapterToRead = (book: Book, chapter: Chapter) => {
    stopReading(); 
    setSelectedBookId(book.id);
    setCurrentChapter(chapter);
    const isSameChapter = book.lastReadChapterId === chapter.id;
    const resumeIndex = isSameChapter ? (book.lastReadChunkIndex || 0) : 0;
    setCurrentChunkIndex(resumeIndex); 
    const newChunks = splitTextIntoChunks(chapter.content);
    setChunks(newChunks); 
    shouldAutoPlayRef.current = true; 
    setViewMode('reader');
  };

  const getBookProgressText = (book: Book) => {
    if (!book.lastReadChapterId) return t.notStarted;
    const chapter = book.chapters.find(c => c.id === book.lastReadChapterId);
    if (!chapter) return t.notStarted;
    return t.readProgress.replace('{text}', `${chapter.sequence} ${chapter.title}`);
  };

  return (
    <div className="h-screen flex flex-col paper-texture bg-[#f4ecd8] overflow-hidden text-[#4a3f35]">
      <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".json" className="hidden" />

      <header className="flex-none px-6 py-4 flex items-center justify-between border-b-2 border-[#d1c2a4]/50 z-20 bg-[#f4ecd8]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button onClick={viewMode === 'library' ? undefined : handleBack} className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-all ${viewMode === 'library' ? 'bg-[#8e7b68] text-[#f4ecd8]' : 'bg-white/60 text-[#8e7b68]'}`}>
            {viewMode === 'library' ? <Icons.Library /> : <Icons.ChevronLeft />}
          </button>
          <div className="flex flex-col">
            <h1 className="text-2xl md:text-3xl font-normal cursor-pointer" style={{ fontFamily: settings.uiLanguage === 'zh' ? "'Ma Shan Zheng', cursive" : "inherit" }} onClick={() => { setViewMode('library'); setSelectedBookId(null); setIsManageMode(false); }}>{t.appName}</h1>
            {viewMode === 'reader' && currentBook && (
              <span className="text-[10px] font-bold opacity-60 uppercase tracking-tighter -mt-1">{currentBook.name} · {currentChapter.sequence}</span>
            )}
          </div>
        </div>
        <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-black/5 rounded-full"><Icons.Settings /></button>
      </header>

      <main className={`flex-1 relative overflow-hidden ${chunks.length > 0 ? 'mb-24' : ''}`}>
        {viewMode === 'library' && (
          <div className="absolute inset-0 p-8 overflow-y-auto custom-scrollbar animate-fadeIn">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Icons.Book /> {isManageMode ? `${t.manageMode} (${t.selected} ${selectedBookIds.length})` : t.library}
              </h2>
              <div className="flex flex-wrap gap-2">
                {isManageMode ? (
                  <>
                    {isConfirmingBatchDelete ? (
                      <div className="flex items-center gap-2 bg-red-50 border-2 border-red-200 p-1 px-2 rounded-lg animate-fadeIn">
                        <span className="text-xs font-bold text-red-700 mr-2">{t.deleteBatchConfirm.replace('{count}', selectedBookIds.length.toString())}</span>
                        <button onClick={handleBatchDelete} className="bg-red-600 text-white text-xs px-3 py-1.5 rounded-md font-bold shadow-sm">{t.confirm}</button>
                        <button onClick={() => setIsConfirmingBatchDelete(false)} className="text-gray-500 text-xs px-2 py-1.5 font-bold">{t.cancel}</button>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => setSelectedBookIds(selectedBookIds.length === library.length ? [] : library.map(b => b.id))} className="text-sm font-bold px-3 py-2 border-2 border-[#8e7b68] rounded-lg">
                          {selectedBookIds.length === library.length ? t.deselectAll : t.selectAll}
                        </button>
                        <button 
                          onClick={handleBatchExport} 
                          disabled={selectedBookIds.length === 0}
                          className="text-sm font-bold px-4 py-2 bg-white/60 border-2 border-[#8e7b68] rounded-lg flex items-center gap-2 disabled:opacity-30 disabled:grayscale transition-all"
                        >
                          <Icons.Upload /> {t.batchExport}
                        </button>
                        <button 
                          onClick={() => setIsConfirmingBatchDelete(true)} 
                          disabled={selectedBookIds.length === 0}
                          className="text-sm font-bold px-4 py-2 bg-red-50/60 text-red-700 border-2 border-red-200 rounded-lg flex items-center gap-2 disabled:opacity-30 disabled:grayscale transition-all"
                        >
                          <Icons.Trash /> {t.batchDelete}
                        </button>
                        <button onClick={() => { setIsManageMode(false); setSelectedBookIds([]); }} className="text-sm font-bold px-4 py-2 bg-[#8e7b68] text-[#f4ecd8] rounded-lg">
                          {t.exitManage}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <button onClick={() => fileInputRef.current?.click()} className="text-sm font-bold px-4 py-2 border-2 border-[#8e7b68] rounded-lg flex items-center gap-2"><Icons.Download /> {t.importBook}</button>
                    <button onClick={() => setIsManageMode(true)} className="text-sm font-bold px-4 py-2 border-2 border-[#8e7b68] rounded-lg flex items-center gap-2"><Icons.Edit /> {t.manageBooks}</button>
                    <button onClick={() => setIsCreatingBook(true)} className="bg-[#8e7b68] text-[#f4ecd8] px-4 py-2 rounded-lg font-bold flex items-center gap-2"><Icons.Plus /> {t.addBook}</button>
                  </>
                )}
              </div>
            </div>

            {isCreatingBook && (
              <div className="mb-8 flex gap-2 animate-fadeIn bg-white/40 p-4 rounded-xl border-2 border-[#8e7b68]">
                <input autoFocus type="text" value={newBookName} onChange={(e) => setNewBookName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateBook()} placeholder={t.inputBookName} className="flex-1 px-3 py-2 bg-white/60 border-2 border-[#d1c2a4] rounded-lg outline-none focus:border-[#8e7b68]" />
                <button onClick={handleCreateBook} className="bg-[#8e7b68] text-[#f4ecd8] px-6 py-2 rounded-lg font-bold">{t.confirm}</button>
                <button onClick={() => setIsCreatingBook(false)} className="px-4 py-2 text-[#8e7b68] font-bold">{t.cancel}</button>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {library.map(book => {
                const isSelected = selectedBookIds.includes(book.id);
                return (
                  <div 
                    key={book.id} 
                    onClick={() => {
                      if (isManageMode) {
                        setSelectedBookIds(prev => 
                          prev.includes(book.id) ? prev.filter(id => id !== book.id) : [...prev, book.id]
                        );
                      } else { 
                        setSelectedBookId(book.id); 
                        setViewMode('book_detail'); 
                      }
                    }} 
                    className={`aspect-[3/4] border-2 rounded-xl p-6 transition-all cursor-pointer relative flex flex-col group shadow-sm ${
                      isSelected ? 'bg-[#8e7b68]/20 border-[#8e7b68] ring-4 ring-[#8e7b68]/10' : 'bg-white/40 border-[#d1c2a4] hover:shadow-xl hover:border-[#8e7b68]/40'
                    }`}
                  >
                     {isManageMode && (
                       <div className={`absolute top-3 left-3 w-6 h-6 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-[#8e7b68] border-[#8e7b68]' : 'bg-white border-[#d1c2a4]'}`}>
                         {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                       </div>
                     )}

                     {!isManageMode && (
                      <div className="absolute top-3 right-3 flex flex-col gap-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); setEditingBookId(book.id); setTempBookName(book.name); }} className="p-2 bg-white/90 text-[#8e7b68] rounded-full shadow-sm hover:bg-[#8e7b68] hover:text-white"><Icons.Edit /></button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(book.id); }} className="p-2 bg-white/90 text-red-600 rounded-full shadow-sm hover:bg-red-600 hover:text-white"><Icons.Trash /></button>
                      </div>
                    )}

                    <div className="mt-4 flex-1">
                      {editingBookId === book.id ? (
                        <input autoFocus value={tempBookName} onClick={e => e.stopPropagation()} onChange={e => setTempBookName(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setLibrary(l => l.map(b => b.id === book.id ? {...b, name: tempBookName} : b)), setEditingBookId(null))} onBlur={() => setEditingBookId(null)} className="w-full bg-white border-2 border-[#8e7b68] p-1 font-bold rounded outline-none" />
                      ) : (
                        <>
                          <h3 className="text-xl font-bold break-words leading-tight mb-2">{book.name}</h3>
                          <p className="text-[10px] text-[#8e7b68] font-bold opacity-70 line-clamp-2 leading-tight">
                            {getBookProgressText(book)}
                          </p>
                        </>
                      )}
                    </div>

                    {confirmDeleteId === book.id && (
                      <div className="absolute inset-0 bg-red-600/95 text-white flex flex-col items-center justify-center p-4 z-40 rounded-xl animate-fadeIn">
                        <p className="text-sm font-bold mb-4 text-center">确定删除书籍？</p>
                        <div className="flex gap-4">
                          <button onClick={e => executeDelete(book.id, e)} className="bg-white text-red-600 px-4 py-1 rounded font-bold shadow-lg">确定</button>
                          <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }} className="text-white underline font-bold">取消</button>
                        </div>
                      </div>
                    )}
                    <p className="mt-auto text-xs font-bold opacity-40 uppercase tracking-widest">{t.chaptersCount.replace('{count}', book.chapters.length.toString())}</p>
                  </div>
                );
              })}
              
              {library.length === 0 && !isCreatingBook && (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-[#8e7b68]/40 italic">
                  <Icons.Book />
                  <p className="mt-4">{t.noBooks}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === 'book_detail' && currentBook && (
          <div className="absolute inset-0 p-8 overflow-y-auto custom-scrollbar animate-fadeIn">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={handleBack} className="p-2 hover:bg-black/5 rounded-full"><Icons.ChevronLeft /></button>
              <h2 className="text-2xl font-bold">{currentBook.name}</h2>
              <button onClick={() => {
                setSelectedBookId(currentBook.id);
                setCurrentChapter({ sequence: `第${currentBook.chapters.length + 1}章`, title: '', content: '' });
                setViewMode('editor');
              }} className="bg-[#8e7b68] text-[#f4ecd8] px-4 py-2 rounded-full text-sm font-bold ml-auto shadow-md hover:scale-105 transition-transform flex items-center gap-2"><Icons.Plus /> {t.addNewChapter}</button>
            </div>
            <div className="space-y-4">
              {currentBook.chapters.length === 0 ? (
                <div className="h-40 flex items-center justify-center border-2 border-dashed border-[#d1c2a4] rounded-2xl opacity-40 italic">{t.noChapters}</div>
              ) : (
                currentBook.chapters.map(ch => {
                  const isCompleted = (currentBook.completedChapterIds || []).includes(ch.id);
                  const isCurrent = currentBook.lastReadChapterId === ch.id;
                  return (
                    <div key={ch.id} onClick={() => selectChapterToRead(currentBook, ch)} className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all shadow-sm ${isCurrent ? 'bg-[#8e7b68] text-[#f4ecd8] border-[#8e7b68]' : 'bg-white/60 border-transparent hover:border-[#d1c2a4]'}`}>
                      <span className="w-16 font-mono font-bold opacity-70">{ch.sequence}</span>
                      <span className="flex-1 font-bold text-lg">{ch.title}</span>
                      <div className="flex items-center gap-3">
                        {isCompleted && <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${isCurrent ? 'bg-white/20 text-white' : 'bg-[#8e7b68]/10 text-[#8e7b68]'}`}>{t.completed}</span>}
                        <button onClick={e => { e.stopPropagation(); setCurrentChapter(ch); setViewMode('editor'); }} className="p-2 hover:bg-black/5 rounded-full"><Icons.Edit /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {viewMode === 'editor' && (
          <div className="absolute inset-0 p-8 flex flex-col animate-fadeIn">
             <div className="flex items-center justify-between mb-4">
               <h2 className="text-xl font-bold">{currentChapter.id ? t.editChapter : t.addChapter}</h2>
               <button onClick={handleBack} className="text-sm font-bold underline opacity-60 hover:opacity-100">{t.backToCatalog}</button>
            </div>
            <div className="flex gap-4 mb-4">
              <input type="text" placeholder={t.seqPlaceholder} value={currentChapter.sequence} onChange={e => setCurrentChapter({...currentChapter, sequence: e.target.value})} className="w-32 p-3 bg-white/40 border-2 border-[#d1c2a4] rounded-lg focus:border-[#8e7b68] outline-none" />
              <input type="text" placeholder={t.titlePlaceholder} value={currentChapter.title} onChange={e => setCurrentChapter({...currentChapter, title: e.target.value})} className="flex-1 p-3 bg-white/40 border-2 border-[#d1c2a4] rounded-lg focus:border-[#8e7b68] outline-none" />
            </div>
            <textarea value={currentChapter.content} onChange={e => setCurrentChapter({...currentChapter, content: e.target.value})} className="flex-1 p-8 bg-white/40 border-2 border-[#d1c2a4] rounded-xl outline-none text-xl leading-relaxed resize-none custom-scrollbar" placeholder={t.contentPlaceholder} />
            <div className="mt-6 flex gap-4">
              <button onClick={() => { 
                if (!currentChapter.content?.trim()) return;
                const chapterToSave: Chapter = {
                  id: (currentChapter.id || Date.now().toString()) as string,
                  sequence: currentChapter.sequence || '新章节',
                  title: currentChapter.title || '无标题',
                  content: currentChapter.content || '',
                  createdAt: currentChapter.createdAt || Date.now()
                };
                setLibrary(prev => prev.map(book => {
                  if (book.id === selectedBookId) {
                    const exists = book.chapters.find(c => c.id === chapterToSave.id);
                    const newChapters = exists ? book.chapters.map(c => c.id === chapterToSave.id ? chapterToSave : c) : [...book.chapters, chapterToSave];
                    return { ...book, chapters: newChapters };
                  }
                  return book;
                }));
                setViewMode('book_detail'); 
              }} className="flex-1 bg-white/40 text-[#8e7b68] border-2 border-[#8e7b68] py-4 rounded-xl font-bold hover:bg-[#8e7b68] hover:text-[#f4ecd8] transition-all">{t.saveOnly}</button>
              <button onClick={() => {
                if (!currentChapter.content?.trim()) return;
                const chapterToSave: Chapter = {
                  id: (currentChapter.id || Date.now().toString()) as string,
                  sequence: currentChapter.sequence || '新章节',
                  title: currentChapter.title || '无标题',
                  content: currentChapter.content || '',
                  createdAt: currentChapter.createdAt || Date.now()
                };
                setLibrary(prev => prev.map(book => {
                  if (book.id === selectedBookId) {
                    const exists = book.chapters.find(c => c.id === chapterToSave.id);
                    const newChapters = exists ? book.chapters.map(c => c.id === chapterToSave.id ? chapterToSave : c) : [...book.chapters, chapterToSave];
                    return { ...book, chapters: newChapters };
                  }
                  return book;
                }));
                selectChapterToRead(currentBook!, chapterToSave);
              }} className="flex-[2] bg-[#8e7b68] text-[#f4ecd8] py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#7d6e5d] shadow-lg"><Icons.Play /> {t.saveAndRead}</button>
            </div>
          </div>
        )}

        {viewMode === 'reader' && (
          <div className="absolute inset-0 flex flex-col animate-fadeIn">
            {/* 阅读进度顶部栏 */}
            <div className="absolute top-0 left-0 right-0 h-10 bg-[#f4ecd8]/60 backdrop-blur-sm flex items-center px-8 border-b border-[#d1c2a4]/30 z-10">
               <span className="text-[10px] font-bold opacity-40 uppercase tracking-[0.2em]">
                 {currentBook?.name} · {currentChapter?.sequence} ({Math.round(((currentChunkIndex + 1) / chunks.length) * 100)}%)
               </span>
            </div>

            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar relative px-8 md:px-24 pt-10">
              <div className="h-[40vh]" />
              {chunks.map((chunk, idx) => {
                const isActive = idx === currentChunkIndex;
                return (
                  <div 
                    key={idx} 
                    ref={isActive ? activeChunkRef : null} 
                    className={`relative mb-12 text-2xl md:text-3xl leading-loose transition-all p-6 rounded-2xl cursor-pointer ${
                      isActive 
                        ? 'text-[#2c2c2c] font-bold opacity-100 scale-105 bg-white/20 ring-1 ring-black/5 shadow-sm underline decoration-4 decoration-[#8e7b68]/40 underline-offset-8' 
                        : 'text-[#7d6e5d] opacity-20 blur-[1px] hover:blur-0 hover:opacity-40'
                    }`} 
                    onClick={() => playChunk(idx)}
                  >
                    {chunk}
                  </div>
                );
              })}
              <div className="h-[40vh]" />
            </div>
          </div>
        )}
      </main>

      {chunks.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl bg-[#8e7b68] text-[#f4ecd8] p-4 rounded-2xl shadow-2xl flex items-center justify-between z-40 transition-all ring-4 ring-[#f4ecd8]/80">
          <div className="flex items-center gap-4">
            <button onClick={(e) => { e.stopPropagation(); playChunk(currentChunkIndex - 1); }} disabled={currentChunkIndex === 0} className="p-2 disabled:opacity-20"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6L18 18V6z"/></svg></button>
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (!audioRef.current) return;
                if (isReading) audioRef.current.pause();
                else audioRef.current.play().catch(err => {
                  if (err.name !== 'AbortError') console.error("Play error:", err);
                });
              }} 
              className="w-12 h-12 bg-[#f4ecd8] text-[#8e7b68] rounded-full flex items-center justify-center hover:scale-110 shadow-lg transition-transform"
            >
              {isLoading ? <div className="w-6 h-6 border-2 border-[#8e7b68] border-t-transparent rounded-full animate-spin"></div> : (isReading ? <Icons.Pause /> : <Icons.Play />)}
            </button>
            <button onClick={(e) => { e.stopPropagation(); playChunk(currentChunkIndex + 1); }} disabled={currentChunkIndex === chunks.length - 1} className="p-2 disabled:opacity-20"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
          </div>
          <div className="flex-1 px-4 flex flex-col items-center">
            <div className="text-[10px] font-bold opacity-60 mb-1">{currentChunkIndex + 1} / {chunks.length} ({Math.round(((currentChunkIndex + 1) / chunks.length) * 100)}%)</div>
            <div className="w-full h-1 bg-white/20 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-white transition-all duration-300" style={{ width: `${((currentChunkIndex + 1) / chunks.length) * 100}%` }}></div>
            </div>
          </div>
          <button onClick={() => viewMode !== 'reader' && setViewMode('reader')} className={`p-2 rounded-full transition-all ${viewMode === 'reader' ? 'bg-white/20 scale-110 shadow-inner' : 'hover:bg-white/10'}`}><Icons.Book /></button>
        </div>
      )}

      {error && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl flex flex-col items-center gap-1 z-50 animate-bounce max-w-[80vw]">
          <div className="flex items-center gap-3 w-full">
            <span className="text-sm font-bold flex-1">{error}</span>
            <button onClick={() => setError(null)} className="font-black p-1 hover:bg-white/20 rounded text-xl">&times;</button>
          </div>
        </div>
      )}

      {showSettings && <SettingsModal settings={settings} onSave={(s) => { setSettings(s); localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s)); setShowSettings(false); }} onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export default App;
