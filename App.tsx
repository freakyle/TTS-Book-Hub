
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlaybackSettings, Book, Chapter } from './types';
import { DEFAULT_SETTINGS, Icons } from './constants';
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

  // 藏书阁数据
  const [library, setLibrary] = useState<Book[]>(() => {
    const saved = localStorage.getItem(LIBRARY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  
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

    // 记录进度
    if (selectedBookId && currentChapter.id) {
      updateProgress(selectedBookId, currentChapter.id, index, index === chunks.length - 1);
    }

    try {
      let audioUrl = preloadedAudio.current.get(index);
      if (!audioUrl) {
        const textToSpeak = chunks[index];
        if (!textToSpeak) throw new Error("文本内容为空");
        
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
      setError(err.message || "生成失败");
      setIsReading(false);
      setIsLoading(false);
    }
  }, [chunks, settings, stopReading, selectedBookId, currentChapter.id, updateProgress]);

  useEffect(() => {
    if (shouldAutoPlayRef.current && chunks.length > 0) {
      shouldAutoPlayRef.current = false;
      playChunk(currentChunkIndex); // 从当前保存的索引开始播放
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

  const deleteBook = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (window.confirm("确定要删除这本书及其所有章节吗？")) {
      setLibrary(prev => prev.filter(b => b.id !== id));
      if (selectedBookId === id) setViewMode('library');
    }
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
    const fileName = booksToExport.length === 1 
      ? `${booksToExport[0].name}.moxiang.json` 
      : `墨香藏书_批量导出_${new Date().toLocaleDateString()}.json`;
    
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
    if (window.confirm(`确定删除选中的 ${selectedBookIds.size} 本书吗？此操作不可撤销。`)) {
      setLibrary(prev => prev.filter(b => !selectedBookIds.has(b.id)));
      setSelectedBookIds(new Set());
      setIsManageMode(false);
    }
  };

  const startNewChapter = (bookId: string) => {
    const book = library.find(b => b.id === bookId);
    setSelectedBookId(bookId);
    setCurrentChapter({
      sequence: `第${(book?.chapters.length || 0) + 1}章`,
      title: '',
      content: ''
    });
    setViewMode('editor');
  };

  // 统一保存逻辑
  const saveChapterData = () => {
    if (!currentChapter.content?.trim()) return null;
    
    const chapterToSave: Chapter = {
      id: (currentChapter.id || Date.now().toString()) as string,
      sequence: currentChapter.sequence || '未知章节',
      title: currentChapter.title || '无标题',
      content: currentChapter.content || '',
      createdAt: Date.now()
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
    
    // 如果是上次阅读的章节，恢复阅读进度
    const isSameChapter = book.lastReadChapterId === chapter.id;
    const resumeIndex = isSameChapter ? (book.lastReadChunkIndex || 0) : 0;
    
    setCurrentChunkIndex(resumeIndex); 
    
    const newChunks = splitTextIntoChunks(chapter.content);
    shouldAutoPlayRef.current = true; 
    setChunks(newChunks); 
    setViewMode('reader');
  };

  const deleteChapter = (bookId: string, chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (window.confirm("确定删除该章节？")) {
      setLibrary(prev => prev.map(b => b.id === bookId ? { ...b, chapters: b.chapters.filter(c => c.id !== chapterId) } : b));
      if (currentChapter?.id === chapterId) {
        stopReading();
        setChunks([]);
      }
    }
  };

  const exportBook = (book: Book, e: React.MouseEvent) => {
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

        if (booksToSave.length === 0) throw new Error("无效的书卷文件格式");
        
        setLibrary(prev => [...prev, ...booksToSave]);
        alert(`成功导入 ${booksToSave.length} 本书籍！`);
      } catch (err) {
        setError("导入失败：文件格式不正确或为空");
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
              style={{ fontFamily: "'Ma Shan Zheng', cursive" }}
              onClick={() => { setViewMode('library'); setSelectedBookId(null); setIsManageMode(false); }}
            >
              墨香听书
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
                title="查看目录"
              >
                <Icons.Book />
              </button>
              <button 
                onClick={() => setViewMode('editor')} 
                className="p-2 hover:bg-black/5 rounded-full transition-colors" 
                title="编辑章节"
              >
                <Icons.Edit />
              </button>
            </>
          )}
          <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-black/5 rounded-full transition-colors" title="阅读设置"><Icons.Settings /></button>
        </div>
      </header>

      <main className={`flex-1 relative overflow-hidden ${chunks.length > 0 ? 'mb-24' : ''}`}>
        {viewMode === 'library' && (
          <div className="absolute inset-0 p-8 overflow-y-auto custom-scrollbar animate-fadeIn">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Icons.Book /> {isManageMode ? `批量管理 (已选 ${selectedBookIds.size})` : '我的藏书阁'}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {isManageMode ? (
                  <>
                    <button 
                      onClick={selectAllBooks}
                      className="text-xs font-bold text-[#8e7b68] hover:bg-[#8e7b68]/10 px-3 py-2 rounded-lg transition-colors border border-[#8e7b68]/20"
                    >
                      {selectedBookIds.size === library.length ? '取消全选' : '全部选中'}
                    </button>
                    <button 
                      onClick={batchExport}
                      disabled={selectedBookIds.size === 0}
                      className="bg-[#8e7b68] text-[#f4ecd8] px-4 py-2 rounded-lg shadow-md disabled:opacity-40 flex items-center gap-2 transition-all active:scale-95 text-sm font-bold"
                    >
                      <Icons.Upload /> 批量导出
                    </button>
                    <button 
                      onClick={batchDelete}
                      disabled={selectedBookIds.size === 0}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg shadow-md disabled:opacity-40 flex items-center gap-2 transition-all active:scale-95 text-sm font-bold"
                    >
                      <Icons.Trash /> 批量删除
                    </button>
                    <button 
                      onClick={() => { setIsManageMode(false); setSelectedBookIds(new Set()); }}
                      className="text-[#8e7b68] text-sm px-4 py-2 border-2 border-[#8e7b68] rounded-lg font-bold hover:bg-[#8e7b68] hover:text-[#f4ecd8] transition-all"
                    >
                      退出管理
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-white/40 text-[#8e7b68] border-2 border-[#8e7b68] px-4 py-2 rounded-lg shadow-sm hover:bg-[#8e7b68] hover:text-[#f4ecd8] flex items-center gap-2 transition-all active:scale-95 text-sm font-bold"
                    >
                      <Icons.Download /> 导入书卷
                    </button>
                    <button 
                      onClick={() => setIsManageMode(true)}
                      className="bg-white/40 text-[#8e7b68] border-2 border-[#8e7b68] px-4 py-2 rounded-lg shadow-sm hover:bg-[#8e7b68] hover:text-[#f4ecd8] flex items-center gap-2 transition-all active:scale-95 text-sm font-bold"
                    >
                      <Icons.Edit /> 管理藏书
                    </button>
                    {!isCreatingBook ? (
                      <button 
                        onClick={() => setIsCreatingBook(true)}
                        className="bg-[#8e7b68] text-[#f4ecd8] px-4 py-2 rounded-lg shadow-md hover:bg-[#7d6e5d] flex items-center gap-2 transition-all active:scale-95 text-sm font-bold"
                      >
                        <Icons.Plus /> 新增书籍
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 animate-fadeIn">
                        <input 
                          autoFocus
                          type="text"
                          value={newBookName}
                          onChange={(e) => setNewBookName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateBook()}
                          placeholder="输入书名..."
                          className="px-3 py-2 bg-white/60 border-2 border-[#8e7b68] rounded-lg outline-none text-sm w-40"
                        />
                        <button onClick={handleCreateBook} className="bg-[#8e7b68] text-[#f4ecd8] px-3 py-2 rounded-lg text-sm font-bold">确定</button>
                        <button onClick={() => setIsCreatingBook(false)} className="text-[#8e7b68] text-sm px-2">取消</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            
            {library.length === 0 ? (
              <div className="h-64 border-2 border-dashed border-[#d1c2a4] rounded-2xl flex flex-col items-center justify-center opacity-40">
                <Icons.Book />
                <p className="mt-2">阁内尚无藏书，请添加或导入第一本小说</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pb-8">
                {library.map(book => {
                  const lastChapter = book.chapters.find(c => c.id === book.lastReadChapterId);
                  const progressText = lastChapter ? `${lastChapter.sequence}` : '尚未开始';
                  
                  return (
                    <div 
                      key={book.id}
                      onClick={() => isManageMode ? toggleBookSelection(book.id) : (setSelectedBookId(book.id), setViewMode('book_detail'))}
                      className={`aspect-[3/4] border-2 rounded-xl p-6 shadow-md hover:shadow-xl transition-all cursor-pointer group relative flex flex-col justify-between overflow-hidden ${
                        selectedBookIds.has(book.id) ? 'bg-[#8e7b68]/15 border-[#8e7b68] ring-4 ring-[#8e7b68]/20' : 'bg-white/40 border-[#d1c2a4]'
                      }`}
                    >
                      {isManageMode && (
                        <div className="absolute top-4 left-4 z-40">
                           <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                             selectedBookIds.has(book.id) ? 'bg-[#8e7b68] border-[#8e7b68] scale-110' : 'bg-white border-[#d1c2a4]'
                           }`}>
                             {selectedBookIds.has(book.id) && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                           </div>
                        </div>
                      )}

                      {!isManageMode && (
                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                          <button 
                            type="button"
                            className="p-2 hover:bg-[#8e7b68]/10 rounded-full transition-colors text-[#8e7b68]" 
                            title="导出此书" 
                            onClick={(e) => exportBook(book, e)}
                          >
                            <Icons.Upload />
                          </button>
                          <button 
                            type="button"
                            className="p-2 hover:bg-red-100 text-red-600 rounded-full transition-colors" 
                            title="删除" 
                            onClick={(e) => deleteBook(book.id, e)}
                          >
                            <Icons.Trash />
                          </button>
                        </div>
                      )}
                      <div className="w-1.5 h-full absolute left-0 top-0 bg-[#8e7b68] rounded-l-xl"></div>
                      <div className="mt-4">
                        <h3 className={`text-xl font-bold break-words leading-tight transition-all ${isManageMode ? 'ml-8' : ''}`}>{book.name}</h3>
                        {book.lastReadChapterId && (
                           <div className="mt-2 text-[10px] font-bold text-[#8e7b68] opacity-70 flex items-center gap-1">
                             <span className="w-2 h-2 rounded-full bg-[#8e7b68] animate-pulse"></span>
                             续读: {progressText}
                           </div>
                        )}
                      </div>
                      <div className="mt-auto">
                        <p className="text-xs opacity-60 font-medium">共 {book.chapters.length} 章节</p>
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
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <button onClick={handleBack} className="p-2 hover:bg-black/5 rounded-full transition-colors"><Icons.ChevronLeft /></button>
                <h2 className="text-2xl font-bold">{currentBook.name}</h2>
              </div>
              <button 
                onClick={(e) => exportBook(currentBook, e)}
                className="text-xs font-bold border border-[#8e7b68] text-[#8e7b68] px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-[#8e7b68] hover:text-[#f4ecd8] transition-all"
              >
                <Icons.Upload /> 导出此书卷文件
              </button>
            </div>

            <div className="bg-white/30 border border-[#d1c2a4] rounded-2xl p-6 shadow-inner">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#d1c2a4]/50">
                <span className="text-sm font-bold opacity-60 uppercase tracking-widest">章节目录</span>
                <button onClick={() => startNewChapter(currentBook.id)} className="text-[#8e7b68] text-sm font-bold flex items-center gap-1 hover:bg-[#8e7b68]/10 px-3 py-1 rounded-full transition-colors">
                  <Icons.Plus /> 添加新章节
                </button>
              </div>
              
              <div className="space-y-2 pb-8">
                {currentBook.chapters.length === 0 ? (
                  <p className="py-12 text-center opacity-40 italic">暂无章节内容</p>
                ) : (
                  currentBook.chapters.slice().sort((a,b) => a.createdAt - b.createdAt).map(ch => {
                    const isLastRead = currentBook.lastReadChapterId === ch.id;
                    const isCompleted = currentBook.completedChapterIds?.includes(ch.id);

                    return (
                      <div 
                        key={ch.id}
                        onClick={() => selectChapterToRead(currentBook, ch)}
                        className={`group flex items-center justify-between p-4 rounded-xl transition-all cursor-pointer border shadow-sm ${
                          isLastRead
                          ? 'bg-[#8e7b68] text-[#f4ecd8] border-[#8e7b68]' 
                          : 'bg-white/40 hover:bg-[#8e7b68] hover:text-[#f4ecd8] border-transparent hover:border-[#8e7b68]'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <span className={`text-xs px-2 py-0.5 rounded font-mono ${isLastRead ? 'bg-white/20' : 'bg-black/5 group-hover:bg-white/20'}`}>
                            {ch.sequence}
                          </span>
                          <span className="font-bold">{ch.title}</span>
                          {isCompleted && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${isLastRead ? 'border-white/40 text-white/60' : 'border-[#8e7b68]/40 text-[#8e7b68]/60 group-hover:text-white/60 group-hover:border-white/40'}`}>
                              已读完
                            </span>
                          )}
                          {isLastRead && !isCompleted && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 animate-pulse">
                              正在阅读
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-white/20 rounded-full text-inherit z-30" 
                            onClick={(e) => deleteChapter(currentBook.id, ch.id, e)}
                          >
                            <Icons.Trash />
                          </button>
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
                <Icons.Edit /> {currentChapter.id ? '编辑章节' : '新增章节'} - {currentBook?.name}
               </h2>
               <button onClick={handleBack} className="text-sm opacity-60 hover:opacity-100 font-bold underline">返回目录</button>
            </div>
            
            <div className="flex gap-4 mb-4">
              <input 
                type="text"
                placeholder="序数"
                value={currentChapter.sequence}
                onChange={(e) => setCurrentChapter({...currentChapter, sequence: e.target.value})}
                className="w-32 p-3 bg-white/40 border-2 border-[#d1c2a4] rounded-lg outline-none focus:ring-2 focus:ring-[#8e7b68] transition-all"
              />
              <input 
                type="text"
                placeholder="章节标题"
                value={currentChapter.title}
                onChange={(e) => setCurrentChapter({...currentChapter, title: e.target.value})}
                className="flex-1 p-3 bg-white/40 border-2 border-[#d1c2a4] rounded-lg outline-none focus:ring-2 focus:ring-[#8e7b68] transition-all"
              />
            </div>

            <textarea
              value={currentChapter.content}
              onChange={(e) => setCurrentChapter({...currentChapter, content: e.target.value})}
              className="flex-1 p-8 bg-white/40 border-2 border-[#d1c2a4] rounded-xl shadow-inner outline-none text-xl leading-relaxed custom-scrollbar resize-none placeholder:text-[#c1b294] transition-all focus:bg-white/60"
              placeholder="请输入正文内容..."
            />
            
            <div className="mt-6 flex flex-col sm:flex-row gap-4">
              <button 
                onClick={handleSaveOnly}
                className="flex-1 bg-white/40 text-[#8e7b68] border-2 border-[#8e7b68] py-4 px-8 rounded-xl shadow-md hover:bg-[#8e7b68] hover:text-[#f4ecd8] transition-all active:scale-95 font-bold text-lg flex items-center justify-center gap-2"
              >
                仅保存并返回
              </button>
              <button 
                onClick={handleSaveAndRead}
                className="flex-[2] bg-[#8e7b68] text-[#f4ecd8] py-4 px-8 rounded-xl shadow-lg hover:bg-[#7d6e5d] transition-all active:scale-95 font-bold text-xl flex items-center justify-center gap-2"
              >
                <Icons.Play /> 保存并开始听书
              </button>
            </div>
          </div>
        )}

        {viewMode === 'reader' && (
          <div className="absolute inset-0 flex flex-col animate-fadeIn">
            <div 
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto custom-scrollbar relative px-8 md:px-24 select-none"
            >
              <div className="h-[40vh]" />
              {chunks.map((chunk, idx) => (
                <div 
                  key={idx} 
                  ref={idx === currentChunkIndex ? activeChunkRef : null}
                  className={`mb-12 text-2xl md:text-3xl leading-loose transition-all duration-700 cursor-pointer p-6 rounded-2xl text-left whitespace-pre-wrap relative group/chunk ${
                    idx === currentChunkIndex 
                      ? 'text-[#2c2c2c] font-bold opacity-100 scale-105 filter drop-shadow-sm bg-white/10' 
                      : 'text-[#7d6e5d] opacity-20 blur-[1px] hover:opacity-40 hover:blur-0 scale-95'
                  }`}
                  onClick={() => playChunk(idx)}
                >
                  {/* 书签标记 */}
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
        <div 
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl bg-[#8e7b68] text-[#f4ecd8] p-4 rounded-2xl shadow-2xl flex items-center justify-between z-40 ring-4 ring-[#f4ecd8]/50 transition-all transform animate-in slide-in-from-bottom-8 ${
            viewMode !== 'reader' ? 'cursor-pointer hover:bg-[#7d6e5d]' : ''
          }`}
          onClick={() => viewMode !== 'reader' && setViewMode('reader')}
        >
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={(e) => { e.stopPropagation(); playChunk(currentChunkIndex - 1); }} 
              disabled={currentChunkIndex === 0} 
              className="p-2 disabled:opacity-20 hover:bg-white/10 rounded-full transition-colors"
            >
              <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6L18 18V6z"/></svg>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); isReading ? audioRef.current?.pause() : audioRef.current?.play(); }} 
              className="w-10 h-10 md:w-12 md:h-12 bg-[#f4ecd8] text-[#8e7b68] rounded-full flex items-center justify-center hover:scale-110 shadow-lg transition-transform shrink-0"
            >
              {isLoading ? (
                <div className="w-5 h-5 md:w-6 md:h-6 border-2 border-[#8e7b68] border-t-transparent rounded-full animate-spin"></div>
              ) : (
                isReading ? <Icons.Pause /> : <Icons.Play />
              )}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); playChunk(currentChunkIndex + 1); }} 
              disabled={currentChunkIndex === chunks.length - 1} 
              className="p-2 disabled:opacity-20 hover:bg-white/10 rounded-full transition-colors"
            >
              <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>

          <div className="flex-1 px-4 flex flex-col items-center overflow-hidden">
            <div className="text-[10px] font-bold opacity-60 font-mono tracking-widest mb-1">{currentChunkIndex + 1} / {chunks.length}</div>
            {viewMode !== 'reader' && (
              <div className="text-xs font-bold truncate max-w-full italic opacity-90">
                {currentChapter.sequence && `${currentChapter.sequence} · `}{currentChapter.title || '正在阅读...'}
              </div>
            )}
            <div className="w-full h-1 bg-white/20 rounded-full mt-1 overflow-hidden">
              <div 
                className="h-full bg-white transition-all duration-300" 
                style={{ width: `${((currentChunkIndex + 1) / chunks.length) * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end shrink-0">
            <span className="bg-black/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{settings.voice.split('-').pop()?.replace('Neural','')}</span>
            <span className="text-[10px] opacity-60 uppercase font-bold tracking-tighter">{settings.speed}x 语速</span>
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
        <SettingsModal 
          settings={settings} 
          onSave={(s) => { setSettings(s); localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s)); setShowSettings(false); }} 
          onClose={() => setShowSettings(false)} 
        />
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
