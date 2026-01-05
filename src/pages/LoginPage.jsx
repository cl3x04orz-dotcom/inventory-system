import React, { useState } from 'react';
import { Lock, User, ArrowRight } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function LoginPage({ onLogin, apiUrl }) {
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const action = isRegister ? 'register' : 'login';
            const result = await callGAS(apiUrl, action, { username, password });

            if (isRegister) {
                alert('註冊成功！請等待管理員審核，或直接嘗試登入 (若是首位用戶)。');
                setIsRegister(false);
            } else {
                onLogin(result); // result should be user object with token
            }
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center p-4">
            <div className="glass-panel p-8 w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
                        INVENTORY OS
                    </h1>
                    <p className="text-slate-500">
                        {isRegister ? '建立您的帳戶' : '登入系統'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                            <input
                                required
                                type="text"
                                placeholder="使用者名稱"
                                className="input-field pl-10"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                            <input
                                required
                                type="password"
                                placeholder="密碼"
                                className="input-field pl-10"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full flex justify-center items-center gap-2 py-3"
                    >
                        {loading ? '處理中...' : (isRegister ? '註冊' : '登入')} <ArrowRight size={18} />
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-slate-500">
                    <button onClick={() => setIsRegister(!isRegister)} className="hover:text-blue-400 transition-colors">
                        {isRegister ? '已有帳號？登入' : '沒有帳號？註冊'}
                    </button>
                </div>
            </div>
        </div>
    );
}
