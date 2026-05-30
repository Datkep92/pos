// ========== LỊCH SỬ GIAO DỊCH (ĐỒNG BỘ FIREBASE) ==========
let historyData = [];

async function initHistory() {
    historyData = await DB.getAll('transactions') || [];
    window.historyData = historyData;
    renderHistory();
    console.log(`✅ Đã tải ${historyData.length} giao dịch`);
}

async function addHistory(transaction) {
    const newTrans = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        type: transaction.type,
        amount: transaction.amount,
        paymentMethod: transaction.paymentMethod || 'cash',
        items: transaction.items || [],
        customer: transaction.customer || null,
        tableName: transaction.tableName || null,
        note: transaction.note || ''
    };
    await DB.create('transactions', newTrans);
    historyData.unshift(newTrans);
    if (historyData.length > 500) historyData.pop();
    window.historyData = historyData;
    if (document.getElementById('historyView')?.classList.contains('active')) renderHistory();
}

function renderHistory() {

    historyData = window.historyData || [];

    const container = document.getElementById('historyList');
    if (!container) return;
    const dateFilter = document.getElementById('historyDateFilter')?.value || '';
    const typeFilter = document.getElementById('historyTypeFilter')?.value || 'all';
    let filtered = [...historyData];
    if (dateFilter) filtered = filtered.filter(h => h.date?.slice(0,10) === dateFilter);
    if (typeFilter !== 'all') filtered = filtered.filter(h => h.type === typeFilter);
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 Chưa có giao dịch</div>';
        return;
    }
    container.innerHTML = filtered.map(h => `
        <div class="history-item ${h.type}">
            <div class="history-header-row">
                <span>${new Date(h.date).toLocaleString('vi-VN')}</span>
                <span class="history-amount ${h.type === 'debt_payment' ? 'text-success' : ''}">${h.type === 'debt_payment' ? '+' : '-'}${formatMoney(h.amount)}</span>
            </div>
            <div class="history-header-row">
                <span>${h.type === 'takeaway' ? '🛵 Mang đi' : (h.type === 'dinein' ? '🍽️ Tại chỗ' : '💰 Thanh toán nợ')}</span>
                <span>${h.paymentMethod === 'cash' ? '💰 Tiền mặt' : '💳 Chuyển khoản'}</span>
            </div>
            ${h.tableName ? `<div class="history-detail">📌 ${h.tableName}</div>` : ''}
            ${h.customer ? `<div class="history-detail">👤 ${h.customer.name}</div>` : ''}
            ${h.items?.length ? `<div class="history-detail">📋 ${h.items.map(i => `${i.name} x${i.qty}`).join(', ')}</div>` : ''}
            ${h.note ? `<div class="history-detail">📝 ${h.note}</div>` : ''}
        </div>
    `).join('');
}

function exportHistory() {
    const content = historyData.map(h => `${new Date(h.date).toLocaleString()}\t${h.type}\t${h.amount}\t${h.paymentMethod}`).join('\n');
    const blob = new Blob([content], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `lichsu_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    showToast('✅ Đã xuất lịch sử', 'success');
}

window.historyData = historyData;
window.initHistory = initHistory;
window.renderHistory = renderHistory;
window.addHistory = addHistory;
window.exportHistory = exportHistory;