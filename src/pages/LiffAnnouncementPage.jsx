import React, { useState, useEffect } from 'react';
import { callGAS } from '../utils/api';
import { Megaphone, Save, Eye, EyeOff, LayoutTemplate, Palette, Type, Underline, Highlighter, Paintbrush } from 'lucide-react';

export const renderFormattedContent = (text) => {
  if (!text) return null;

  // Step 1: 將 Markdown 粗體 **文字** 先轉換為 <b>文字</b> 方便統一遞迴解析
  const html = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

  // Step 2: 遞迴解析器，支援任意巢狀組合（如 **<mark>黃底加粗</mark>** 或 <u><red>紅底底線</red></u>）
  const parseNodes = (str, keyPrefix = 'n') => {
    if (!str) return [];
    
    const tagRegex = /<(mark|red|u|b)>([\s\S]*?)<\/\1>/gi;
    const result = [];
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        result.push(str.substring(lastIndex, match.index));
      }

      const tagName = match[1].toLowerCase();
      const innerContent = match[2];
      const innerNodes = parseNodes(innerContent, `${keyPrefix}_${match.index}`);

      if (tagName === 'mark') {
        result.push(
          <mark key={`${keyPrefix}_${match.index}`} className="bg-yellow-400/90 text-slate-900 px-1 py-0.5 rounded font-extrabold mx-0.5 shadow-xs inline-block my-0.5">
            {innerNodes}
          </mark>
        );
      } else if (tagName === 'red') {
        result.push(
          <span key={`${keyPrefix}_${match.index}`} className="bg-red-500/90 text-white px-1.5 py-0.5 rounded font-extrabold mx-0.5 shadow-xs inline-block my-0.5">
            {innerNodes}
          </span>
        );
      } else if (tagName === 'u') {
        result.push(
          <u key={`${keyPrefix}_${match.index}`} className="underline underline-offset-4 decoration-2 decoration-amber-300 font-semibold">
            {innerNodes}
          </u>
        );
      } else if (tagName === 'b') {
        result.push(
          <strong key={`${keyPrefix}_${match.index}`} className="font-extrabold text-white">
            {innerNodes}
          </strong>
        );
      }

      lastIndex = tagRegex.lastIndex;
    }

    if (lastIndex < str.length) {
      result.push(str.substring(lastIndex));
    }

    return result;
  };

  return parseNodes(html);
};


export default function LiffAnnouncementPage({ user, apiUrl }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [themeColor, setThemeColor] = useState('purple'); // purple, blue, dark, emerald, amber, rose, indigo, custom
  const [fontSize, setFontSize] = useState('medium'); // small, medium, large, xlarge
  const [customColors, setCustomColors] = useState({ start: '#6366f1', end: '#a855f7', button: '#6366f1' });
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchAnnouncement();
  }, [apiUrl]);

  const fetchAnnouncement = async () => {
    try {
      setLoading(true);
      const res = await callGAS(apiUrl, 'getLiffAnnouncement', {}, user?.token);
      if (res && !res.error) {
        setEnabled(res.enabled || false);
        setTitle(res.title || '');
        setContent(res.content || '');
        setThemeColor(res.themeColor || 'purple');
        setFontSize(res.fontSize || 'medium');
        if (res.customColors) setCustomColors(res.customColors);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage({ text: '', type: '' });
      const res = await callGAS(apiUrl, 'saveLiffAnnouncement', {
        enabled,
        title,
        content,
        themeColor,
        fontSize,
        customColors
      }, user?.token);

      if (res.error) {
        setMessage({ text: res.error, type: 'error' });
      } else {
        setMessage({ text: '公告儲存成功！', type: 'success' });
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      }
    } catch (err) {
      setMessage({ text: '系統錯誤', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const insertTag = (startTag, endTag) => {
    const textarea = document.getElementById('announcement-content-input');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    const replacement = `${startTag}${selected || '標記內容'}${endTag}`;
    const newContent = content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + startTag.length, start + startTag.length + (selected ? selected.length : 4));
    }, 0);
  };

  const getThemeClasses = () => {
    switch (themeColor) {
      case 'blue': return 'from-blue-600/30 via-sky-600/20 to-cyan-700/30 border-blue-400/40 text-blue-50';
      case 'dark': return 'from-gray-900/90 via-slate-900/90 to-black/95 border-gray-700/60 text-gray-100';
      case 'emerald': return 'from-emerald-700/30 via-teal-600/20 to-green-700/30 border-emerald-400/40 text-emerald-50';
      case 'amber': return 'from-amber-600/30 via-orange-600/20 to-yellow-600/30 border-amber-400/40 text-amber-50';
      case 'rose': return 'from-rose-600/30 via-pink-600/20 to-red-600/30 border-rose-400/40 text-rose-50';
      case 'indigo': return 'from-indigo-700/30 via-blue-600/20 to-purple-800/30 border-indigo-400/40 text-indigo-50';
      case 'custom': return 'border-white/30 text-white';
      case 'purple':
      default: return 'from-purple-700/30 via-fuchsia-600/20 to-pink-700/30 border-purple-400/40 text-purple-50';
    }
  };

  const getButtonClasses = () => {
    switch (themeColor) {
      case 'blue': return 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white';
      case 'dark': return 'bg-white hover:bg-gray-100 text-slate-900';
      case 'emerald': return 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white';
      case 'amber': return 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white';
      case 'rose': return 'bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white';
      case 'indigo': return 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white';
      case 'custom': return 'text-white border border-white/20 shadow-md';
      case 'purple':
      default: return 'bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 text-white';
    }
  };

  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'small': return 'text-xs';
      case 'large': return 'text-base';
      case 'xlarge': return 'text-lg';
      case 'medium':
      default: return 'text-[13.5px]';
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
          <Megaphone className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-wide">商城首頁公告設定</h1>
          <p className="text-[var(--text-tertiary)] text-sm mt-1">設定顧客進入商城時顯示的彈出式公告與排版格式</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 左側：設定表單 */}
        <div className="space-y-6">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-6 space-y-6 shadow-xl shadow-black/20">
            
            {/* 啟用開關 */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
              <div>
                <h3 className="text-[var(--text-primary)] font-bold mb-1 flex items-center gap-2">
                  {enabled ? <Eye className="w-4 h-4 text-green-400" /> : <EyeOff className="w-4 h-4 text-red-400" />}
                  公告狀態
                </h3>
                <p className="text-[var(--text-tertiary)] text-xs">開啟後，所有進入首頁的客人都會看到此公告。</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                <div className="w-14 h-7 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-500"></div>
              </label>
            </div>

            {/* 標題設定 */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2">
                <LayoutTemplate className="w-4 h-4" /> 公告標題
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例如：公休日通知 / 新品上市！"
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
              />
            </div>

            {/* 字體大小選擇 */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2">
                <Type className="w-4 h-4" /> 內文字體大小
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'small', name: '小 (13px)' },
                  { id: 'medium', name: '中 (15px)' },
                  { id: 'large', name: '大 (17px)' },
                  { id: 'xlarge', name: '特大 (19px)' },
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFontSize(item.id)}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      fontSize === item.id
                        ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-500/20'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 內文設定 + 格式工具列 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4" /> 公告內文與格式標記
                </label>
              </div>

              {/* 一鍵格式插入工具列 */}
              <div className="flex flex-wrap items-center gap-2 p-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-t-xl border-b-0">
                <span className="text-xs text-[var(--text-tertiary)] font-bold mr-1">快捷工具列:</span>
                <button
                  type="button"
                  onClick={() => insertTag('<mark>', '</mark>')}
                  className="px-2.5 py-1 bg-yellow-400 text-slate-900 text-xs font-bold rounded-lg hover:bg-yellow-300 transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                  title="反黃高亮關鍵字"
                >
                  <Highlighter className="w-3.5 h-3.5" /> 反黃標記
                </button>
                <button
                  type="button"
                  onClick={() => insertTag('<red>', '</red>')}
                  className="px-2.5 py-1 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                  title="反紅高亮重點"
                >
                  <Highlighter className="w-3.5 h-3.5" /> 反紅標記
                </button>
                <button
                  type="button"
                  onClick={() => insertTag('<u>', '</u>')}
                  className="px-2.5 py-1 bg-slate-700 text-white text-xs font-bold rounded-lg hover:bg-slate-600 transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                  title="加底線"
                >
                  <Underline className="w-3.5 h-3.5" /> 底線
                </button>
                <button
                  type="button"
                  onClick={() => insertTag('**', '**')}
                  className="px-2.5 py-1 bg-slate-700 text-white text-xs font-bold rounded-lg hover:bg-slate-600 transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                  title="粗體字"
                >
                  <b>B</b> 粗體
                </button>
              </div>

              <textarea
                id="announcement-content-input"
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="請輸入公告詳細內容...\n選取文字後點擊上方按鈕可套用黃/紅標記與底線！"
                rows={6}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-b-xl px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors resize-none font-mono text-xs leading-relaxed"
              />
            </div>

            {/* 主題風格與調色盤 */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2">
                <Palette className="w-4 h-4" /> 主題風格與色盤挑選
              </label>
              
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {[
                  { id: 'purple', name: '魅力紫', bg: 'linear-gradient(135deg, #7e22ce, #d946ef)' },
                  { id: 'blue', name: '極速藍', bg: 'linear-gradient(135deg, #2563eb, #06b6d4)' },
                  { id: 'dark', name: '暗夜黑', bg: 'linear-gradient(135deg, #111827, #000000)' },
                  { id: 'emerald', name: '翡翠綠', bg: 'linear-gradient(135deg, #047857, #10b981)' },
                  { id: 'amber', name: '暖陽橘', bg: 'linear-gradient(135deg, #d97706, #f59e0b)' },
                  { id: 'rose', name: '玫瑰粉', bg: 'linear-gradient(135deg, #e11d48, #f43f5e)' },
                  { id: 'indigo', name: '深藍寶石', bg: 'linear-gradient(135deg, #4338ca, #6366f1)' },
                  { id: 'custom', name: '🎨 自訂色盤', bg: 'linear-gradient(135deg, #ec4899, #8b5cf6)' },
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setThemeColor(t.id)}
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all cursor-pointer ${
                      themeColor === t.id ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/30' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full shadow-md border border-white/20" style={{ background: t.bg }} />
                    <span className="text-[10px] font-bold text-[var(--text-tertiary)]">{t.name}</span>
                  </button>
                ))}
              </div>

              {/* 自訂色盤控制項 */}
              {themeColor === 'custom' && (
                <div className="p-4 bg-[var(--bg-tertiary)] border border-purple-500/30 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-400 mb-1">
                    <Paintbrush className="w-4 h-4" /> 自訂專屬漸層與按鈕色彩
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={customColors.start}
                        onChange={e => setCustomColors(prev => ({ ...prev, start: e.target.value }))}
                        className="w-8 h-8 rounded-lg border-0 cursor-pointer"
                      />
                      <span className="text-xs text-[var(--text-secondary)] font-medium">漸層起始色</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={customColors.end}
                        onChange={e => setCustomColors(prev => ({ ...prev, end: e.target.value }))}
                        className="w-8 h-8 rounded-lg border-0 cursor-pointer"
                      />
                      <span className="text-xs text-[var(--text-secondary)] font-medium">漸層結束色</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={customColors.button}
                        onChange={e => setCustomColors(prev => ({ ...prev, button: e.target.value }))}
                        className="w-8 h-8 rounded-lg border-0 cursor-pointer"
                      />
                      <span className="text-xs text-[var(--text-secondary)] font-medium">按鈕主題色</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 儲存按鈕 */}
            <div className="pt-4 border-t border-[var(--border-color)] flex items-center justify-between">
              <div>
                {message.text && (
                  <span className={`text-sm ${message.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                    {message.text}
                  </span>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {saving ? '儲存中...' : '儲存設定'}
              </button>
            </div>
          </div>
        </div>

        {/* 右側：手機預覽 */}
        <div className="flex justify-center items-start lg:sticky lg:top-6">
          <div className="w-[375px] h-[750px] bg-black rounded-[40px] border-[8px] border-gray-800 relative overflow-hidden shadow-2xl flex flex-col items-center justify-center">
            {/* 模擬手機狀態列 */}
            <div className="absolute top-0 w-full h-6 bg-black z-10"></div>
            
            {/* 模擬背景網頁內容 */}
            <div className="absolute inset-0 bg-[#0f0f13] flex flex-col p-4 opacity-50 blur-[2px]">
              <div className="w-full h-40 bg-gray-800 rounded-2xl mb-4"></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="h-48 bg-gray-800 rounded-2xl"></div>
                <div className="h-48 bg-gray-800 rounded-2xl"></div>
                <div className="h-48 bg-gray-800 rounded-2xl"></div>
                <div className="h-48 bg-gray-800 rounded-2xl"></div>
              </div>
            </div>

            {/* 公告預覽實體 */}
            <div className="relative z-20 w-[88%]">
              <div
                className={`backdrop-blur-2xl bg-gradient-to-br border shadow-2xl rounded-3xl p-4 relative overflow-hidden flex flex-col max-h-[520px] ${getThemeClasses()}`}
                style={themeColor === 'custom' ? { background: `linear-gradient(135deg, ${customColors.start}, ${customColors.end})` } : {}}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                
                <div className="relative z-10 text-center flex flex-col space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/15 mx-auto flex items-center justify-center shrink-0 shadow-inner border border-white/20">
                    <Megaphone className="w-5 h-5 text-white drop-shadow-sm" />
                  </div>
                  
                  <h3 className="text-lg font-extrabold tracking-tight text-white drop-shadow-sm shrink-0 px-1">
                    {title || '在此輸入公告標題'}
                  </h3>
                  
                  <div className="w-10 h-0.5 bg-white/30 mx-auto rounded-full shrink-0"></div>
                  
                  <div className={`leading-relaxed text-white/95 font-medium whitespace-pre-wrap text-left bg-black/25 p-3 rounded-2xl border border-white/10 overflow-y-auto max-h-[280px] shadow-inner ${getFontSizeClass()}`}>
                    {renderFormattedContent(content) || '在此輸入公告詳細內容...\n\n支援多行顯示、<mark>反黃標記</mark>、<red>反紅標記</red>及<u>底線</u>。'}
                  </div>

                  <button
                    className={`w-full py-2.5 rounded-xl font-extrabold tracking-wide shadow-lg transition-transform hover:scale-[1.02] active:scale-95 text-xs sm:text-sm shrink-0 mt-1 ${getButtonClasses()}`}
                    style={themeColor === 'custom' ? { backgroundColor: customColors.button } : {}}
                  >
                    我知道了
                  </button>
                </div>
              </div>
            </div>

            {/* 測試模式標籤 */}
            {!enabled && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-red-500/80 text-white text-xs px-3 py-1 rounded-full backdrop-blur z-30 font-bold border border-red-400">
                目前為關閉狀態 (前台不會顯示)
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
