
import React, { useState, useEffect } from 'react';
import { PlaybackSettings } from '../types';
import { COMMON_VOICES, TRANSLATIONS } from '../constants';
import { fetchVoices } from '../services/ttsService';

interface SettingsModalProps {
  settings: PlaybackSettings;
  onSave: (settings: PlaybackSettings) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onSave, onClose }) => {
  const [localSettings, setLocalSettings] = useState<PlaybackSettings>({ ...settings });
  const [availableVoices, setAvailableVoices] = useState<any[]>(COMMON_VOICES);
  
  const t = TRANSLATIONS[localSettings.uiLanguage];

  useEffect(() => {
    async function loadVoices() {
      const voices = await fetchVoices(localSettings);
      if (voices && voices.length > 0) {
        setAvailableVoices(voices.map(v => ({ id: v.ShortName || v.id, name: v.FriendlyName || v.name })));
      }
    }
    loadVoices();
  }, [localSettings.endpoint]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-[#f4ecd8] w-full max-w-md p-8 rounded-lg shadow-2xl border border-[#d1c2a4] paper-texture">
        <h2 className="text-2xl font-bold mb-6 text-[#4a3f35] border-b-2 border-[#d1c2a4] pb-2">{t.settings}</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#7d6e5d] mb-1">{t.uiLanguage}</label>
            <select 
              value={localSettings.uiLanguage}
              onChange={(e) => setLocalSettings({...localSettings, uiLanguage: e.target.value as 'zh' | 'en'})}
              className="w-full px-4 py-2 bg-white/50 border border-[#d1c2a4] rounded focus:ring-2 focus:ring-[#8e7b68] outline-none appearance-none"
            >
              <option value="zh">简体中文</option>
              <option value="en">English</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#7d6e5d] mb-1">{t.apiEndpoint}</label>
            <input 
              type="text" 
              value={localSettings.endpoint}
              onChange={(e) => setLocalSettings({...localSettings, endpoint: e.target.value})}
              className="w-full px-4 py-2 bg-white/50 border border-[#d1c2a4] rounded focus:ring-2 focus:ring-[#8e7b68] outline-none"
              placeholder="http://localhost:5050"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#7d6e5d] mb-1">{t.apiKey}</label>
            <input 
              type="password" 
              value={localSettings.apiKey}
              onChange={(e) => setLocalSettings({...localSettings, apiKey: e.target.value})}
              className="w-full px-4 py-2 bg-white/50 border border-[#d1c2a4] rounded focus:ring-2 focus:ring-[#8e7b68] outline-none"
              placeholder="your_api_key"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#7d6e5d] mb-1">{t.voiceSelection}</label>
            <select 
              value={localSettings.voice}
              onChange={(e) => setLocalSettings({...localSettings, voice: e.target.value})}
              className="w-full px-4 py-2 bg-white/50 border border-[#d1c2a4] rounded focus:ring-2 focus:ring-[#8e7b68] outline-none appearance-none"
            >
              {availableVoices.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#7d6e5d] mb-1">{t.speed}: {localSettings.speed}x</label>
            <input 
              type="range" 
              min="0.5" 
              max="2.5" 
              step="0.1"
              value={localSettings.speed}
              onChange={(e) => setLocalSettings({...localSettings, speed: parseFloat(e.target.value)})}
              className="w-full h-2 bg-[#d1c2a4] rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        <div className="mt-8 flex gap-4">
          <button 
            onClick={() => onSave(localSettings)}
            className="flex-1 bg-[#8e7b68] text-white py-2 rounded shadow-md hover:bg-[#7d6e5d] transition-colors"
          >
            {t.saveConfig}
          </button>
          <button 
            onClick={onClose}
            className="flex-1 bg-[#d1c2a4] text-[#4a3f35] py-2 rounded shadow-md hover:bg-[#c1b294] transition-colors"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
