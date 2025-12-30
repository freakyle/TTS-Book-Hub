
export function splitTextIntoChunks(text: string, maxLength: number = 3000): string[] {
  // 1. 首先按照换行符拆分原始段落，保留空行产生的间距感（可选，这里我们过滤掉纯空白行但保留段落感）
  const paragraphs = text.split(/\n/);
  const chunks: string[] = [];

  for (let para of paragraphs) {
    const trimmedPara = para.trim();
    
    // 如果是空行，我们视情况处理。为了听书体验，通常忽略纯空行，
    // 但如果希望视觉上保留，可以添加一个特殊的占位。这里选择保留有内容的段落。
    if (trimmedPara.length === 0) continue;

    // 2. 如果单段文字没有超过最大限制，直接作为一个分片
    if (trimmedPara.length <= maxLength) {
      chunks.push(trimmedPara);
    } else {
      // 3. 如果单段文字过长（例如长难句或无标点长段），按标点符号进行二次拆分
      let currentSubChunk = "";
      // 匹配中英文常用句末标点
      const sentences = trimmedPara.match(/[^。！？；!?;]+[。！？；!?;]?/g) || [trimmedPara];
      
      for (const sentence of sentences) {
        if ((currentSubChunk.length + sentence.length) > maxLength) {
          if (currentSubChunk) chunks.push(currentSubChunk);
          currentSubChunk = sentence;
        } else {
          currentSubChunk += sentence;
        }
      }
      if (currentSubChunk) chunks.push(currentSubChunk);
    }
  }

  return chunks;
}
