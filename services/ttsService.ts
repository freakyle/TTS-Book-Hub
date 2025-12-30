
import { PlaybackSettings } from '../types';

export async function generateAudioBlob(
  text: string,
  settings: PlaybackSettings
): Promise<Blob> {
  // 确保 URL 拼接正确，移除用户可能多输入的尾部斜杠
  const baseUrl = settings.endpoint.trim().replace(/\/+$/, '');
  const url = `${baseUrl}/v1/audio/speech`;
  
  console.log(`[TTS] Requesting: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
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
      const errorText = await response.text();
      let msg = `API 错误 (${response.status})`;
      try {
        const errJson = JSON.parse(errorText);
        msg = errJson.error?.message || errJson.error || msg;
      } catch(e) {}
      throw new Error(msg);
    }

    return await response.blob();
  } catch (err: any) {
    console.error('[TTS] Fetch Exception:', err);
    
    // 特殊处理 Failed to fetch
    if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
      const isHttpsPage = window.location.protocol === 'https:';
      const isHttpApi = settings.endpoint.toLowerCase().startsWith('http:');
      
      if (isHttpsPage && isHttpApi) {
        throw new Error("浏览器安全拦截：HTTPS 页面无法访问 HTTP 的 API 接口。请将 API 地址改为 HTTPS 或更换访问环境。");
      }
      throw new Error("无法连接到 TTS 服务器，请检查 API 地址是否正确且服务已开启。");
    }
    throw err;
  }
}

export async function fetchVoices(settings: PlaybackSettings): Promise<any[]> {
  const baseUrl = settings.endpoint.trim().replace(/\/+$/, '');
  const paths = ['/v1/voices/all', '/v1/voices', '/v1/models'];
  
  for (const path of paths) {
    try {
      const response = await fetch(`${baseUrl}${path}`, { 
        headers: { 'Authorization': `Bearer ${settings.apiKey}` },
        signal: AbortSignal.timeout(3000) 
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
