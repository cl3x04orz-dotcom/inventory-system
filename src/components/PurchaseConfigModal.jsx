import React, { useState, useEffect } from 'react';
import { callGAS } from '../utils/api';
import { X, Search } from 'lucide-react';

export default function PurchaseConfigModal({ isOpen, onClose, apiUrl, token, vendorProductMap = {} }) {
    const [activeTab, setActiveTab] = useState('vendors'); // 'vendors' | 'products'
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedVendorFilter, setSelectedVendorFilter] = useState(''); // [New] 篩選商品的廠商
    const [vendors, setVendors] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submittingId, setSubmittingId] = useState(null); // id of row being updated

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const vData = await callGAS(apiUrl, 'getVendors', {}, token);
            if (Array.isArray(vData)) {
                setVendors(vData);
            }
            const pData = await callGAS(apiUrl, 'getProducts', {}, token);
            if (Array.isArray(pData)) {
                setProducts(pData);
            }
        } catch (e) {
            console.error("Failed to load configs", e);
            alert("載入設定失敗: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleVendor = async (vendorName, currentStatus) => {
        setSubmittingId(vendorName);
        try {
            await callGAS(apiUrl, 'updateVendorStatus', { vendorName, isActive: !currentStatus }, token);
            setVendors(prev => prev.map(v => 
                v.vendorName === vendorName ? { ...v, isActive: !currentStatus } : v
            ));
        } catch (e) {
            alert("更新廠商狀態失敗: " + e.message);
        } finally {
            setSubmittingId(null);
        }
    };

    const handleToggleProduct = async (prod, currentStatus) => {
        setSubmittingId(prod.id);
        try {
            await callGAS(apiUrl, 'updateProductPurchasable', { productId: prod.id, isPurchasable: !currentStatus }, token);
            setProducts(prev => prev.map(p => 
                p.id === prod.id ? { ...p, isPurchasable: !currentStatus } : p
            ));
        } catch (e) {
            alert("更新商品狀態失敗: " + e.message);
        } finally {
            setSubmittingId(null);
        }
    };

    const handleMoveVendor = async (filteredIdx, direction) => {
        if (direction === 'up' && filteredIdx === 0) return;
        if (direction === 'down' && filteredIdx === filteredVendors.length - 1) return;

        const swapFilteredIdx = direction === 'up' ? filteredIdx - 1 : filteredIdx + 1;

        const vendorA = filteredVendors[filteredIdx];
        const vendorB = filteredVendors[swapFilteredIdx];

        const realIdxA = vendors.findIndex(v => v.vendorName === vendorA.vendorName);
        const realIdxB = vendors.findIndex(v => v.vendorName === vendorB.vendorName);

        if (realIdxA === -1 || realIdxB === -1) return;

        const newVendors = [...vendors];
        newVendors[realIdxA] = vendorB;
        newVendors[realIdxB] = vendorA;

        setVendors(newVendors);

        try {
            const vendorNames = newVendors.map(v => v.vendorName);
            await callGAS(apiUrl, 'updateVendorSortOrder', { vendorNames }, token);
        } catch (e) {
            console.error("Failed to update vendor sort order", e);
        }
    };

    const handleMoveProduct = async (filteredIdx, direction) => {
        if (direction === 'up' && filteredIdx === 0) return;
        if (direction === 'down' && filteredIdx === filteredProducts.length - 1) return;

        const swapFilteredIdx = direction === 'up' ? filteredIdx - 1 : filteredIdx + 1;

        const prodA = filteredProducts[filteredIdx];
        const prodB = filteredProducts[swapFilteredIdx];

        const realIdxA = products.findIndex(p => p.id === prodA.id);
        const realIdxB = products.findIndex(p => p.id === prodB.id);

        if (realIdxA === -1 || realIdxB === -1) return;

        const newProducts = [...products];
        newProducts[realIdxA] = prodB;
        newProducts[realIdxB] = prodA;

        setProducts(newProducts);

        try {
            const productIds = newProducts.map(p => p.id);
            await callGAS(apiUrl, 'updateProductSortOrder', { productIds }, token);
        } catch (e) {
            console.error("Failed to update product sort order", e);
        }
    };

    const handleUpdatePaymentMethod = async (vendorName, method) => {
        try {
            await callGAS(apiUrl, 'saveVendorDefault', { vendor: vendorName, method }, token);
            setVendors(prev => prev.map(v => 
                v.vendorName === vendorName ? { ...v, paymentMethod: method } : v
            ));
        } catch (e) {
            alert("更新預設支付方式失敗: " + e.message);
        }
    };

    if (!isOpen) return null;

    const filteredVendors = vendors.filter(v => 
        (v.vendorName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredProducts = products.filter(p => {
        const matchesQuery = (p.name || '').toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesQuery) return false;

        if (selectedVendorFilter) {
            const allowed = vendorProductMap[selectedVendorFilter] || [];
            return allowed.includes(p.name);
        }
        return true;
    });

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all duration-300">
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border-primary)]">
                    <h3 className="text-lg font-black text-[var(--text-primary)]">
                        ⚙️ 進貨作業後台設定
                    </h3>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 hover:bg-[var(--bg-secondary)] rounded-lg text-[var(--text-secondary)] transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-6 pt-3 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/30">
                    <button
                        onClick={() => { setActiveTab('vendors'); setSearchQuery(''); }}
                        className={`px-4 py-2.5 font-bold text-xs border-b-2 transition-all ${
                            activeTab === 'vendors'
                                ? 'border-emerald-500 text-emerald-600'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        🏢 合作廠商 ({vendors.length})
                    </button>
                    <button
                        onClick={() => { setActiveTab('products'); setSearchQuery(''); }}
                        className={`px-4 py-2.5 font-bold text-xs border-b-2 transition-all ${
                            activeTab === 'products'
                                ? 'border-emerald-500 text-emerald-600'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        📦 進貨品項 ({products.length})
                    </button>
                </div>

                {/* Search Bar */}
                <div className="p-4 border-b border-[var(--border-primary)] flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder={activeTab === 'vendors' ? "搜尋廠商名稱..." : "搜尋品項名稱..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg pl-9 pr-4 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-emerald-500 focus:bg-[var(--bg-secondary)] transition-all font-mono"
                        />
                    </div>

                    {activeTab === 'products' && (
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">廠商篩選:</span>
                            <select
                                value={selectedVendorFilter}
                                onChange={(e) => setSelectedVendorFilter(e.target.value)}
                                className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg px-2.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-emerald-500 font-bold transition-all"
                            >
                                <option value="">所有廠商</option>
                                {vendors.map(v => (
                                    <option key={v.vendorName} value={v.vendorName}>{v.vendorName}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Content List */}
                <div className="overflow-y-auto max-h-[50vh] p-4 space-y-2">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-3">
                            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs text-[var(--text-secondary)]">載入最新名單中...</p>
                        </div>
                    ) : activeTab === 'vendors' ? (
                        filteredVendors.length === 0 ? (
                            <p className="text-center py-8 text-xs text-gray-400">查無廠商資料</p>
                        ) : (
                            filteredVendors.map((v, filteredIdx) => {
                                return (
                                    <div 
                                        key={v.vendorName}
                                        className="flex items-center justify-between p-3.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded-xl transition-all"
                                    >
                                        <div className="flex-1">
                                            <div className="font-bold text-sm text-[var(--text-primary)]">{v.vendorName}</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-gray-400">預設付款:</span>
                                                <select
                                                    value={v.paymentMethod || 'CASH'}
                                                    onChange={(e) => handleUpdatePaymentMethod(v.vendorName, e.target.value)}
                                                    className="text-[10px] bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded px-1.5 py-0.5 text-[var(--text-secondary)] outline-none focus:border-emerald-500 font-bold transition-all"
                                                >
                                                    <option value="CASH">現金</option>
                                                    <option value="CREDIT">賒帳</option>
                                                </select>
                                            </div>
                                        </div>

                                        {searchQuery === '' && (
                                            <div className="flex gap-1.5 mr-6 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveVendor(filteredIdx, 'up')}
                                                    disabled={filteredIdx === 0}
                                                    className={`w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--border-primary)] transition-all bg-[var(--bg-primary)] ${
                                                        filteredIdx === 0 
                                                            ? 'opacity-30 cursor-not-allowed text-gray-300' 
                                                            : 'hover:bg-slate-100 hover:border-slate-300 active:scale-90 text-[10px]'
                                                    }`}
                                                >
                                                    ▲
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveVendor(filteredIdx, 'down')}
                                                    disabled={filteredIdx === filteredVendors.length - 1}
                                                    className={`w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--border-primary)] transition-all bg-[var(--bg-primary)] ${
                                                        filteredIdx === filteredVendors.length - 1 
                                                            ? 'opacity-30 cursor-not-allowed text-gray-300' 
                                                            : 'hover:bg-slate-100 hover:border-slate-300 active:scale-90 text-[10px]'
                                                    }`}
                                                >
                                                    ▼
                                                </button>
                                            </div>
                                        )}

                                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                            <input
                                                type="checkbox"
                                                checked={v.isActive}
                                                disabled={submittingId === v.vendorName}
                                                onChange={() => handleToggleVendor(v.vendorName, v.isActive)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-10 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                            <span className="ml-2.5 text-xs font-bold w-12 text-right">
                                                {v.isActive ? (
                                                    <span className="text-emerald-600">合作中</span>
                                                ) : (
                                                    <span className="text-gray-400">已停用</span>
                                                )}
                                            </span>
                                        </label>
                                    </div>
                                );
                            })
                        )
                    ) : (
                        filteredProducts.length === 0 ? (
                            <p className="text-center py-8 text-xs text-gray-400">查無商品資料</p>
                        ) : (
                            filteredProducts.map((p, filteredIdx) => {
                                return (
                                    <div 
                                        key={p.id}
                                        className="flex items-center justify-between p-3.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded-xl transition-all"
                                    >
                                        <div className="flex-1">
                                            <div className="font-bold text-sm text-[var(--text-primary)]">{p.name}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">單價: {p.price} 元 | 庫存: {p.stock}</div>
                                        </div>

                                        {searchQuery === '' && (
                                            <div className="flex gap-1.5 mr-6 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveProduct(filteredIdx, 'up')}
                                                    disabled={filteredIdx === 0}
                                                    className={`w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--border-primary)] transition-all bg-[var(--bg-primary)] ${
                                                        filteredIdx === 0 
                                                            ? 'opacity-30 cursor-not-allowed text-gray-300' 
                                                            : 'hover:bg-slate-100 hover:border-slate-300 active:scale-90 text-[10px]'
                                                    }`}
                                                >
                                                    ▲
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveProduct(filteredIdx, 'down')}
                                                    disabled={filteredIdx === filteredProducts.length - 1}
                                                    className={`w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--border-primary)] transition-all bg-[var(--bg-primary)] ${
                                                        filteredIdx === filteredProducts.length - 1 
                                                            ? 'opacity-30 cursor-not-allowed text-gray-300' 
                                                            : 'hover:bg-slate-100 hover:border-slate-300 active:scale-90 text-[10px]'
                                                    }`}
                                                >
                                                    ▼
                                                </button>
                                            </div>
                                        )}

                                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                            <input
                                                type="checkbox"
                                                checked={p.isPurchasable !== false}
                                                disabled={submittingId === p.id}
                                                onChange={() => handleToggleProduct(p, p.isPurchasable !== false)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-10 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                            <span className="ml-2.5 text-xs font-bold w-12 text-right">
                                                {p.isPurchasable !== false ? (
                                                    <span className="text-emerald-600">販售中</span>
                                                ) : (
                                                    <span className="text-gray-400">已停售</span>
                                                )}
                                            </span>
                                        </label>
                                    </div>
                                );
                            })
                        )
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/20 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 bg-slate-900 hover:bg-black active:scale-95 text-white font-bold rounded-xl text-xs transition-all shadow-md"
                    >
                        關閉設定
                    </button>
                </div>
            </div>
        </div>
    );
}
