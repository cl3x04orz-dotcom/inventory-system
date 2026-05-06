import React, { useState, useEffect } from 'react';
import { Lock, User, ArrowRight } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function LoginPage({ onLogin, apiUrl }) {
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);

    // [New] 初始化時讀取記住的使用者名稱
    useEffect(() => {
        const savedUser = localStorage.getItem('rememberedUsername');
        if (savedUser) {
            setUsername(savedUser);
            setRememberMe(true);
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const action = isRegister ? 'register' : 'login';
            const result = await callGAS(apiUrl, action, { username, password });
            console.log('Login API Result:', result);

            if (isRegister) {
                alert('註冊成功！請等待管理員審核，或直接嘗試登入 (若是首位用戶)。');
                setIsRegister(false);
            } else {
                // [New] 登入成功後處理記住帳號邏輯
                if (rememberMe) {
                    localStorage.setItem('rememberedUsername', username);
                } else {
                    localStorage.removeItem('rememberedUsername');
                }
                onLogin(result);
            }
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-slate-50">
            <div className="bg-white border border-slate-200 p-8 w-full max-w-md rounded-2xl shadow-2xl">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-6">
                        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo" className="h-20 w-auto object-contain brightness-0 dark:brightness-100" />
                    </div>
                    <p className="text-slate-500 font-medium">
                        {isRegister ? '建立您的帳戶' : '請登入系統以開始使用'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4">
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            <input
                                required
                                type="text"
                                placeholder="使用者名稱"
                                className="input-field pl-10 bg-slate-50 border-slate-200 focus:bg-white transition-all text-slate-900 placeholder:text-slate-400"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                            />
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            <input
                                required
                                type="password"
                                placeholder="密碼"
                                className="input-field pl-10 bg-slate-50 border-slate-200 focus:bg-white transition-all text-slate-900 placeholder:text-slate-400"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {!isRegister && (
                        <div className="flex items-center justify-between px-1">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        className="peer hidden"
                                        checked={rememberMe}
                                        onChange={e => setRememberMe(e.target.checked)}
                                    />
                                    <div className="w-4 h-4 border border-slate-300 rounded-sm bg-white peer-checked:bg-blue-500 peer-checked:border-blue-500 transition-all duration-200"></div>
                                    <svg className="absolute w-3 h-3 text-white left-[2px] top-[2px] opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                        <path d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <span className="text-xs font-medium text-slate-400 group-hover:text-slate-600 transition-colors">記住帳號</span>
                            </label>
                            {/* 預留一個右側平衡空間，或是未來放忘記密碼 */}
                            <span className="text-[10px] text-slate-300 select-none">Secure Session</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full flex justify-center items-center gap-2 py-3.5 text-base font-bold shadow-lg shadow-blue-200"
                    >
                        {loading ? '處理中...' : (isRegister ? '註冊' : '登入')} <ArrowRight size={18} />
                    </button>
                </form>

                <div className="mt-8 text-center text-sm text-slate-400">
                    <button onClick={() => setIsRegister(!isRegister)} className="hover:text-blue-500 transition-colors">
                        {isRegister ? '已有帳號？登入' : '沒有帳號？註冊'}
                    </button>
                </div>
            </div>
        </div>
    );
}
