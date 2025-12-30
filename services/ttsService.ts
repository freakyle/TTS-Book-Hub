
import { PlaybackSettings } from '../types';

export async function generateAudioBlob(
  text: string,
  settings: PlaybackSettings
): Promise<Blob> {
  // 确保 URL 拼接正确，避免双斜杠
  const baseUrl = settings.endpoint.replace(/\/+$/, '');
  const url = `${baseUrl}/v1/audio/speech`;
  
  console.log(`[TTS] 正在请求: ${url}`, { voice: settings.voice, speed: settings.speed });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        // 模仿 PowerShell 中成功的 Headers
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${settings.apiKey}`,
        'Accept': 'audio/mpeg, audio/*, */*'
      },
      body: JSON.stringify({
        model: settings.model,
        input: text,
        voice: settings.voice,
        speed: settings.speed,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorText = await response.text();
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorData.error || errorMessage;
      } catch (e) {
        // 非 JSON 错误响应
      }
      throw new Error(errorMessage);
    }

    const contentType = response.headers.get('Content-Type');
    const rawBlob = await response.blob();

    // 关键修复：强制将 Blob 类型标记为 audio/mpeg
    // 即使服务器没返回正确的 Content-Type，我们也通过包装一层来告知浏览器这是音频
    const audioBlob = new Blob([rawBlob], { type: 'audio/mpeg' });

    if (audioBlob.size < 100) {
      const debugText = await audioBlob.text();
      if (debugText.includes('error') || debugText.includes('{')) {
        throw new Error(`服务器返回了疑似错误信息而非音频: ${debugText}`);
      }
    }

    return audioBlob;
  } catch (err: any) {
    console.error('[TTS] 请求捕获到异常:', err);
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      throw new Error(`网络连接失败。请检查：\n1. Nginx 是否在 80 端口运行\n2. 浏览器控制台(F12)是否存在 CORS 预检(OPTIONS)错误\n3. 尝试将地址改为 http://127.0.0.1`);
    }
    throw err;
  }
}

export async function fetchVoices(settings: PlaybackSettings): Promise<any[]> {
  const baseUrl = settings.endpoint.replace(/\/+$/, '');
  const paths = ['/v1/voices/all', '/v1/voices', '/v1/models'];
  
  for (const path of paths) {
    try {
      const url = `${baseUrl}${path}`;
      const response = await fetch(url, { 
        headers: { 'Authorization': `Bearer ${settings.apiKey}` },
        signal: AbortSignal.timeout(2000) 
      });
      if (response.ok) {
        const data = await response.json();
        const voices = Array.isArray(data) ? data : (data.data && Array.isArray(data.data) ? data.data : []);
        if (voices.length > 0) return voices;
      }
    } catch (e) {
      continue;
    }
  }
  return [];
}
