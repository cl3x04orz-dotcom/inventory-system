import React, { useState, useEffect } from 'react';
import { callGAS } from '../utils/api';
import { Megaphone, Save, Eye, EyeOff, LayoutTemplate, Palette, Type, Underline, Highlighter, Paintbrush, Palette as ColorIcon, CheckSquare } from 'lucide-react';

export const renderFormattedContent = (text) => {
  if (!text) return null;

  // Step 1: 將 Markdown 粗體 **文字** 轉為 <b>文字</b>
  const html = text.replace(/\*\*([\s\S]*?)\*\*/g, '<b>$1</b>');

  // Step 2: 使用瀏覽器原生 DOMParser 進行 100% 精準的 HTML 標籤層驗證與 nested 解析
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const container = doc.body.firstChild;

    const convertNodeToReact = (node, index) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        const children = Array.from(node.childNodes).map((child, i) => convertNodeToReact(child, i));

        if (tagName === 'mark') {
          return (
            <mark key={index} className="bg-yellow-400/90 text-slate-900 px-1 py-0.5 rounded font-extrabold mx-0.5 shadow-xs inline-block my-0.5">
              {children}
            </mark>
          );
        }
        if (tagName === 'red') {
          return (
            <span key={index} className="bg-red-500/90 text-white px-1.5 py-0.5 rounded font-extrabold mx-0.5 shadow-xs inline-block my-0.5">
              {children}
            </span>
          );
        }
        if (tagName === 'u') {
          return (
            <u key={index} className="underline underline-offset-4 decoration-2 decoration-amber-300 font-semibold">
              {children}
            </u>
          );
        }
        if (tagName === 'b' || tagName === 'strong') {
          return (
            <strong key={index} className="font-extrabold text-white">
              {children}
            </strong>
          );
        }
        if (tagName === 'color') {
          const hex = node.getAttribute('hex') || '#ffeb3b';
          return (
            <span key={index} style={{ color: hex }} className="font-bold">
              {children}
            </span>
          );
        }
        return <span key={index}>{children}</span>;
      }
      return null;
    };

    return Array.from(container.childNodes).map((child, i) => convertNodeToReact(child, i));
  } catch (err) {
    return text;
  }
};

export default function LiffAnnouncementPage({ user, apiUrl }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [themeColor, setThemeColor] = useState('purple');
  const [fontSize, setFontSize] = useState('medium');
  const [customColors, setCustomColors] = useState({ start: '#6366f1', end: '#a855f7', button: '#6366f1' });
  const [buttonTextColor, setButtonTextColor] = useState('white'); // white, black
  const [titleTextColor, setTitleTextColor] = useState('white'); // white, black
  const [pickerTextColor, setPickerTextColor] = useState('#ffeb3b');
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
        setButtonTextColor(res.buttonTextColor || 'white');
        setTitleTextColor(res.titleTextColor || 'white');
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
        customColors,
        buttonTextColor,
        titleTextColor
      }, user?.token);

      if (res && res.error) {
        setMessage({ text: res.error, type: 'error' });
      } else {
        setMessage({ text: '公告儲存成功！', type: 'success' });
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      }
    } catch (err) {
      console.error('saveLiffAnnouncement error:', err);
      setMessage({ text: err?.message || '儲存失敗，請再試一次', type: 'error' });
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

  const insertColorTag = (hex) => {
    insertTag(`<color hex="${hex}">`, '</color>');
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
    const textColorClass = buttonTextColor === 'black' ? 'text-slate-950 font-black' : 'text-white font-extrabold';
    switch (themeColor) {
      case 'blue': return `bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 ${textColorClass}`;
      case 'dark': return `bg-white hover:bg-gray-100 ${buttonTextColor === 'black' ? 'text-slate-950' : 'text-slate-900'}`;
      case 'emerald': return `bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 ${textColorClass}`;
      case 'amber': return `bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 ${textColorClass}`;
      case 'rose': return `bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 ${textColorClass}`;
      case 'indigo': return `bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 ${textColorClass}`;
      case 'custom': return `${textColorClass} border border-white/20 shadow-md`;
      case 'purple':
      default: return `bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 ${textColorClass}`;
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
          <p className="text-[var(--text-tertiary)] text-sm mt-1">設定顧客進入商城時顯示的彈出式公告、文字色彩與格式排版</p>
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
                <p className="text-[var(--text-tertiary)] text-xs">開啟後，所有進入首頁的客人在預設情況下都會看到此公告。</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                <div className="w-14 h-7 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-500"></div>
              </label>
            </div>

            {/* 標題設定 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4" /> 公告標題
                </label>
                <div className="flex items-center gap-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-color)] p-1 rounded-lg">
                  <span className="text-[10px] text-[var(--text-tertiary)] font-bold px-1">標題字色:</span>
                  <button
                    type="button"
                    onClick={() => setTitleTextColor('white')}
                    className={`px-2 py-0.5 text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer transition-colors ${
                      titleTextColor === 'white' ? 'bg-purple-600 text-white shadow-xs' : 'text-[var(--text-tertiary)] hover:text-white'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-white border border-gray-400 inline-block"></span> ⚪ 白
                  </button>
                  <button
                    type="button"
                    onClick={() => setTitleTextColor('black')}
                    className={`px-2 py-0.5 text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer transition-colors ${
                      titleTextColor === 'black' ? 'bg-purple-600 text-white shadow-xs' : 'text-[var(--text-tertiary)] hover:text-white'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-black border border-gray-600 inline-block"></span> ⚫ 黑
                  </button>
                </div>
              </div>
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
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${fontSize === item.id
                      ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-500/20'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--bg-hover)]'
                      }`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 內文設定 + 格式與文字顏色工具列 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4" /> 公告內文與格式標記
                </label>
              </div>

              {/* 一鍵格式與字體顏色插入工具列 */}
              <div className="flex flex-col gap-2 p-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-t-xl border-b-0">
                {/* 格式按鈕列 */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--text-tertiary)] font-bold mr-1">畫筆與格式:</span>
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

                {/* 常用文字顏色按鈕列 */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border-color)]">
                  <span className="text-xs text-[var(--text-tertiary)] font-bold mr-1">指定字體顏色:</span>
                  {[
                    { name: '鮮黃', hex: '#ffeb3b', bg: '#ffeb3b', text: '#000' },
                    { name: '亮綠', hex: '#4caf50', bg: '#4caf50', text: '#fff' },
                    { name: '水藍', hex: '#00bcd4', bg: '#00bcd4', text: '#fff' },
                    { name: '亮粉', hex: '#ff4081', bg: '#ff4081', text: '#fff' },
                    { name: '亮橘', hex: '#ff9800', bg: '#ff9800', text: '#fff' },
                  ].map(c => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => insertColorTag(c.hex)}
                      className="px-2 py-0.5 text-xs font-bold rounded-md shadow-xs transition-transform active:scale-95 cursor-pointer"
                      style={{ backgroundColor: c.bg, color: c.text }}
                    >
                      {c.name}
                    </button>
                  ))}

                  {/* 自訂文字顏色選擇器 */}
                  <div className="flex items-center gap-1 ml-auto">
                    <input
                      type="color"
                      value={pickerTextColor}
                      onChange={e => setPickerTextColor(e.target.value)}
                      className="w-6 h-6 rounded border-0 cursor-pointer p-0 bg-transparent"
                      title="挑選自訂文字顏色"
                    />
                    <button
                      type="button"
                      onClick={() => insertColorTag(pickerTextColor)}
                      className="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-md cursor-pointer"
                    >
                      套用此色
                    </button>
                  </div>
                </div>
              </div>

              <textarea
                id="announcement-content-input"
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="請輸入公告詳細內容...\n選取文字後點擊上方工具列可套用**粗體**、<mark>反黃</mark>、<red>反紅</red>、<u>底線</u>及<color hex='#ffeb3b'>自訂文字顏色</color>！"
                rows={6}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-b-xl px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors resize-none font-mono text-xs leading-relaxed"
              />
            </div>

            {/* 按鈕文字顏色選擇 */}
            <div className="space-y-2 p-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl">
              <label className="block text-xs font-bold text-[var(--text-secondary)] flex items-center justify-between">
                <span>🔘 彈窗底端按鈕的「文字顏色」:</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">可自由切換白字或黑字以配襯背景</span>
              </label>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setButtonTextColor('white')}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border flex items-center justify-center gap-2 cursor-pointer ${buttonTextColor === 'white'
                    ? 'bg-slate-800 text-white border-purple-500 ring-2 ring-purple-500/30'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)]'
                    }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-white border border-gray-300 inline-block"></span>
                  ⚪ 白色文字 (White)
                </button>
                <button
                  type="button"
                  onClick={() => setButtonTextColor('black')}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border flex items-center justify-center gap-2 cursor-pointer ${buttonTextColor === 'black'
                    ? 'bg-slate-800 text-white border-purple-500 ring-2 ring-purple-500/30'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)]'
                    }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-black border border-gray-600 inline-block"></span>
                  ⚫ 黑色文字 (Black)
                </button>
              </div>
            </div>

            {/* 主題風格與調色盤 */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2">
                <Palette className="w-4 h-4" /> 主題風格與背景色盤挑選
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
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all cursor-pointer ${themeColor === t.id ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/30' : 'border-transparent opacity-70 hover:opacity-100'
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
                    <Paintbrush className="w-4 h-4" /> 自訂專屬背景漸層與按鈕色彩
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
                      <span className="text-xs text-[var(--text-secondary)] font-medium">按鈕背景色</span>
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

                  <h3 className={`text-lg font-extrabold tracking-tight drop-shadow-sm shrink-0 px-1 ${
                    titleTextColor === 'black' ? 'text-slate-950 font-black' : 'text-white'
                  }`}>
                    {title || '在此輸入公告標題'}
                  </h3>

                  <div className="w-10 h-0.5 bg-white/30 mx-auto rounded-full shrink-0"></div>

                  <div className={`leading-relaxed text-white/95 font-medium whitespace-pre-wrap text-left bg-black/25 p-3 rounded-2xl border border-white/10 overflow-y-auto max-h-[280px] shadow-inner ${getFontSizeClass()}`}>
                    {renderFormattedContent(content) || '在此輸入公告詳細內容...\n\n支援多行顯示、<mark>反黃標記</mark>、<red>反紅標記</red>、<u>底線</u>及<color hex="#ffeb3b">自訂文字顏色</color>。'}
                  </div>

                  {/* 模擬底部按鈕與今日不再提示選項 (按鈕在上、勾選在下) */}
                  <div className="flex flex-col items-center space-y-2 pt-1">
                    <button
                      className={`w-full py-2.5 rounded-xl font-extrabold tracking-wide shadow-lg transition-transform hover:scale-[1.02] active:scale-95 text-xs sm:text-sm shrink-0 ${getButtonClasses()}`}
                      style={themeColor === 'custom' ? {
                        backgroundColor: customColors.button,
                        color: buttonTextColor === 'black' ? '#0f172a' : '#ffffff'
                      } : {}}
                    >
                      我知道了
                    </button>

                    <label className="inline-flex items-center justify-center gap-1.5 cursor-pointer text-[11.5px] font-medium text-white/80 select-none pt-0.5 pb-0.5">
                      <input type="checkbox" readOnly checked={false} className="w-3.5 h-3.5 rounded border-white/30 bg-black/20 text-purple-500 accent-purple-500" />
                      <span>今日不再提示</span>
                    </label>
                  </div>
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
