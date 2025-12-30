
export function splitTextIntoChunks(text: string, maxLength: number = 3000): string[] {
  if (!text) return [];

  // 1. 预处理：标准化换行符，移除过多的空白字符
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
  
  // 2. 初步尝试按原有换行符拆分
  const rawParagraphs = normalizedText.split(/\n+/);
  const resultChunks: string[] = [];

  // 定义“理想段落长度”
  // 理想长度用于在没有分段的文本中创造自然的视觉段落
  const IDEAL_LENGTH = 100; 

  for (let para of rawParagraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    // 如果段落长度在合理范围内，直接添加
    if (trimmedPara.length <= IDEAL_LENGTH) {
      resultChunks.push(trimmedPara);
      continue;
    }

    // 如果段落过长（例如用户粘贴了没分段的长文本），进行智能拆分
    let currentPos = 0;
    while (currentPos < trimmedPara.length) {
      // 提取从当前位置开始的一段候选项
      let endPos = currentPos + IDEAL_LENGTH;
      
      // 如果剩余部分已经不足理想长度，全部计入
      if (endPos >= trimmedPara.length) {
        resultChunks.push(trimmedPara.substring(currentPos));
        break;
      }

      // 在理想长度附近寻找合适的断句标点 (。！？!?)
      let splitPos = -1;
      const lookahead = trimmedPara.substring(currentPos, Math.min(currentPos + maxLength, trimmedPara.length));
      
      // 优先级1：句末标点
      const sentenceEndRegex = /[。！？!?]/g;
      let match;
      let lastGoodSentenceEnd = -1;
      
      // 在[IDEAL_LENGTH * 0.4, IDEAL_LENGTH * 1.4]范围内寻找最合适的断句点
      while ((match = sentenceEndRegex.exec(lookahead)) !== null) {
        const pos = match.index;
        if (pos >= IDEAL_LENGTH * 0.4 && pos <= IDEAL_LENGTH * 1.4) {
          lastGoodSentenceEnd = pos;
        }
        // 如果已经超过了硬限制 maxLength，必须强行截断
        if (pos > maxLength - 10) break;
      }

      if (lastGoodSentenceEnd !== -1) {
        splitPos = currentPos + lastGoodSentenceEnd + 1;
      } else {
        // 优先级2：如果没有句末标点，寻找次级标点 (，；,;)
        const commaRegex = /[，；,;]/g;
        let lastGoodComma = -1;
        while ((match = commaRegex.exec(lookahead)) !== null) {
          const pos = match.index;
          if (pos >= IDEAL_LENGTH * 0.5 && pos <= IDEAL_LENGTH * 1.5) {
            lastGoodComma = pos;
          }
          if (pos > maxLength - 10) break;
        }
        
        if (lastGoodComma !== -1) {
          splitPos = currentPos + lastGoodComma + 1;
        } else {
          // 优先级3：如果没有标点，在理想长度处强行截断
          splitPos = currentPos + IDEAL_LENGTH;
        }
      }

      // 确保 splitPos 不会超出硬限制
      if (splitPos - currentPos > maxLength) {
        splitPos = currentPos + maxLength;
      }

      resultChunks.push(trimmedPara.substring(currentPos, splitPos).trim());
      currentPos = splitPos;
    }
  }

  // 过滤掉可能产生的空片段
  return resultChunks.filter(chunk => chunk.length > 0);
}
