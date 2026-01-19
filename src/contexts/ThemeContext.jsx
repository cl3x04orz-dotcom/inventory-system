import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({
    theme: 'light',
    actualTheme: 'light',
    setTheme: () => { },
    autoSchedule: { lightStart: '06:00', darkStart: '18:00', enabled: false },
    setAutoSchedule: () => { },
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
    const [theme, setThemeState] = useState(() => {
        return localStorage.getItem('theme') || 'light';
    });

    const [autoSchedule, setAutoScheduleState] = useState(() => {
        const saved = localStorage.getItem('themeSchedule');
        return saved ? JSON.parse(saved) : {
            lightStart: '06:00',
            darkStart: '18:00',
            enabled: false
        };
    });

    const [actualTheme, setActualTheme] = useState('light');

    // 計算當前應該使用的主題
    const calculateActualTheme = () => {
        if (theme === 'auto' && autoSchedule.enabled) {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            const lightStart = autoSchedule.lightStart;
            const darkStart = autoSchedule.darkStart;

            // 判斷當前時間應該使用哪個主題
            if (currentTime >= lightStart && currentTime < darkStart) {
                return 'light';
            } else {
                return 'dark';
            }
        }
        return theme === 'auto' ? 'light' : theme;
    };

    // 設定主題
    const setTheme = (newTheme) => {
        setThemeState(newTheme);
        localStorage.setItem('theme', newTheme);
    };

    // 設定自動排程
    const setAutoSchedule = (schedule) => {
        setAutoScheduleState(schedule);
        localStorage.setItem('themeSchedule', JSON.stringify(schedule));
    };

    // 監聽主題變化並應用到 DOM
    useEffect(() => {
        const computed = calculateActualTheme();
        setActualTheme(computed);
        document.documentElement.setAttribute('data-theme', computed);
    }, [theme, autoSchedule]);

    // 每分鐘檢查一次是否需要切換主題 (僅在 auto 模式下)
    useEffect(() => {
        if (theme !== 'auto' || !autoSchedule.enabled) return;

        const interval = setInterval(() => {
            const computed = calculateActualTheme();
            if (computed !== actualTheme) {
                setActualTheme(computed);
                document.documentElement.setAttribute('data-theme', computed);
            }
        }, 60000); // 每分鐘檢查一次

        return () => clearInterval(interval);
    }, [theme, autoSchedule, actualTheme]);

    return (
        <ThemeContext.Provider value={{
            theme,
            actualTheme,
            setTheme,
            autoSchedule,
            setAutoSchedule
        }}>
            {children}
        </ThemeContext.Provider>
    );
};

export default ThemeContext;
