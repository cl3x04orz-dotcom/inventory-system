import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, X, Check, Search, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, RotateCcw } from 'lucide-react';

export default function ProductSortModal({ isOpen, onClose, products = [], onSaveSortOrder, isSaving }) {
    const [itemList, setItemList] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) {
            setItemList(Array.from(products));
            setSearchTerm('');
        }
    }, [isOpen, products]);

    if (!isOpen) return null;

    const handleDragEnd = (result) => {
        if (!result.destination) return;
        const items = Array.from(itemList);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        setItemList(items);
    };

    const handleMove = (index, action) => {
        const next = Array.from(itemList);
        if (action === 'top') {
            if (index === 0) return;
            const [target] = next.splice(index, 1);
            next.unshift(target);
        } else if (action === 'up') {
            if (index === 0) return;
            const temp = next[index];
            next[index] = next[index - 1];
            next[index - 1] = temp;
        } else if (action === 'down') {
            if (index === next.length - 1) return;
            const temp = next[index];
            next[index] = next[index + 1];
            next[index + 1] = temp;
        } else if (action === 'bottom') {
            if (index === next.length - 1) return;
            const [target] = next.splice(index, 1);
            next.push(target);
        }
        setItemList(next);
    };

    const handleSave = () => {
        const productIds = itemList.map(item => item.id || item.productId);
        onSaveSortOrder(productIds);
    };

    const filteredList = itemList.filter(item => 
        (item.name || item.productName || '').toLowerCase().includes(searchTerm.toLowerCase().trim())
    );

    const isSearching = searchTerm.trim().length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-secondary)]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold">
                            📦
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-[var(--text-primary)]">調整商品顯示順序</h3>
                            <p className="text-xs text-[var(--text-tertiary)]">拖曳 ⠿ 把手或點擊按鈕可調整順序，將同步至銷售登錄列表</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="p-2 rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Search Bar & Counter */}
                <div className="p-4 border-b border-[var(--border-primary)] bg-[var(--bg-primary)] flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                        <input
                            type="text"
                            placeholder="搜尋商品名稱..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl focus:outline-none focus:border-indigo-500 text-[var(--text-primary)]"
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                            >
                                清除
                            </button>
                        )}
                    </div>
                    <div className="text-xs font-bold text-[var(--text-secondary)] px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                        共 {itemList.length} 項商品 {isSearching && `(搜尋結果: ${filteredList.length} 項)`}
                    </div>
                </div>

                {/* Body - Drag and Drop List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {isSearching ? (
                        <div className="space-y-2">
                            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2.5 rounded-xl font-bold">
                                💡 搜尋模式下僅提供搜尋預覽。若要拖曳調整順序，請先清除搜尋關鍵字。
                            </p>
                            {filteredList.map((item) => {
                                const realIndex = itemList.findIndex(p => (p.id || p.productId) === (item.id || item.productId));
                                return (
                                    <div 
                                        key={item.id || item.productId}
                                        className="p-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl flex items-center justify-between text-sm"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="w-8 text-center text-xs font-mono font-bold text-[var(--text-tertiary)]">
                                                #{realIndex + 1}
                                            </span>
                                            <span className="font-bold text-[var(--text-primary)]">
                                                {item.name || item.productName}
                                            </span>
                                        </div>
                                        <span className="text-xs font-bold text-[var(--text-tertiary)]">
                                            庫存: {item.stock || 0}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <DragDropContext onDragEnd={handleDragEnd}>
                            <Droppable droppableId="sortable-product-list">
                                {(provided) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className="space-y-2"
                                    >
                                        {itemList.map((item, index) => (
                                            <Draggable 
                                                key={String(item.id || item.productId)} 
                                                draggableId={String(item.id || item.productId)} 
                                                index={index}
                                            >
                                                {(dragProvided, dragSnapshot) => (
                                                    <div
                                                        ref={dragProvided.innerRef}
                                                        {...dragProvided.draggableProps}
                                                        className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                                                            dragSnapshot.isDragging
                                                                ? 'bg-indigo-500/15 border-indigo-500 shadow-xl ring-2 ring-indigo-500/30 scale-[1.01] z-50'
                                                                : 'bg-[var(--bg-secondary)] border-[var(--border-primary)] hover:border-indigo-400 dark:hover:border-indigo-500/50'
                                                        }`}
                                                    >
                                                        {/* Left Drag Handle & Info */}
                                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                                            <div
                                                                {...dragProvided.dragHandleProps}
                                                                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-indigo-500 hover:bg-indigo-500/10 cursor-grab active:cursor-grabbing transition-colors shrink-0"
                                                                title="按住拖曳排序"
                                                            >
                                                                <GripVertical size={20} />
                                                            </div>
                                                            <span className="w-8 text-center text-xs font-mono font-bold text-[var(--text-tertiary)] shrink-0">
                                                                #{index + 1}
                                                            </span>
                                                            <div className="truncate flex-1">
                                                                <span className="font-bold text-[var(--text-primary)] text-sm md:text-base">
                                                                    {item.name || item.productName}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Right Actions & Stock Badge */}
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <span className="text-xs font-bold text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-2.5 py-1 rounded-lg border border-[var(--border-primary)] mr-1">
                                                                庫存: {item.stock || 0}
                                                            </span>

                                                            {/* Quick Move Buttons */}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleMove(index, 'top')}
                                                                disabled={index === 0}
                                                                title="移至頂部"
                                                                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                                            >
                                                                <ChevronsUp size={16} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleMove(index, 'up')}
                                                                disabled={index === 0}
                                                                title="上移"
                                                                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                                            >
                                                                <ArrowUp size={16} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleMove(index, 'down')}
                                                                disabled={index === itemList.length - 1}
                                                                title="下移"
                                                                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                                            >
                                                                <ArrowDown size={16} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleMove(index, 'bottom')}
                                                                disabled={index === itemList.length - 1}
                                                                title="移至底部"
                                                                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                                            >
                                                                <ChevronsDown size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={() => setItemList(Array.from(products))}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors px-3 py-2"
                    >
                        <RotateCcw size={14} />
                        重置順序
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSaving}
                            className="px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-primary)] transition-all"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-xl shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
                        >
                            {isSaving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>儲存中...</span>
                                </>
                            ) : (
                                <>
                                    <Check size={16} />
                                    <span>儲存順序</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
