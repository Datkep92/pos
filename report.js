// ========== BÁO CÁO ==========
let reportData = {
    today: {
        date: new Date().toISOString().slice(0,10),
        takeaway: { count: 0, total: 0, cash: 0, transfer: 0 },
        dinein: { count: 0, total: 0, cash: 0, transfer: 0 }
    },
    history: []
};

function initReport() {
    const saved = localStorage.getItem('pos_report');
    if (saved) {
        reportData = JSON.parse(saved);
        const today = new Date().toISOString().slice(0,10);
        if (reportData.today.date !== today) {
            reportData.history.unshift({ ...reportData.today });
            if (reportData.history.length > 30) reportData.history.pop();
            reportData.today = {
                date: today,
                takeaway: { count: 0, total: 0, cash: 0, transfer: 0 },
                dinein: { count: 0, total: 0, cash: 0, transfer: 0 }
            };
            saveReport();
        }
    } else {
        saveReport();
    }
    renderReport();
}

function saveReport() {
    localStorage.setItem('pos_report', JSON.stringify(reportData));
}

function addTransaction(type, amount, paymentMethod) {
    if (!reportData.today) initReport();
    const target = reportData.today[type];
    target.count++;
    target.total += amount;
    if (paymentMethod === 'cash') {
        target.cash += amount;
    } else if (paymentMethod === 'transfer') {
        target.transfer += amount;
    }
    saveReport();
    if (document.getElementById('reportView').classList.contains('active')) renderReport();
}

function renderReport() {
    const container = document.getElementById('reportContent');
    if (!container) return;
    
    const today = reportData.today;
    const weekly = [today, ...reportData.history.slice(0, 6)];
    const totalTakeaway = today.takeaway.total;
    const totalDinein = today.dinein.total;
    const totalCash = today.takeaway.cash + today.dinein.cash;
    const totalTransfer = today.takeaway.transfer + today.dinein.transfer;
    const totalOrders = today.takeaway.count + today.dinein.count;
    
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon">🛵</div><div class="stat-info"><div class="stat-label">Mang đi</div><div class="stat-value">${today.takeaway.count}</div><div class="stat-amount">${formatMoney(today.takeaway.total)}</div></div></div>
            <div class="stat-card"><div class="stat-icon">🍽️</div><div class="stat-info"><div class="stat-label">Tại chỗ</div><div class="stat-value">${today.dinein.count}</div><div class="stat-amount">${formatMoney(today.dinein.total)}</div></div></div>
            <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-info"><div class="stat-label">Tiền mặt</div><div class="stat-amount">${formatMoney(totalCash)}</div></div></div>
            <div class="stat-card"><div class="stat-icon">💳</div><div class="stat-info"><div class="stat-label">Chuyển khoản</div><div class="stat-amount">${formatMoney(totalTransfer)}</div></div></div>
        </div>
        <div class="summary-card">
            <div class="summary-title">📅 Hôm nay - ${new Date(today.date).toLocaleDateString('vi-VN')}</div>
            <div class="summary-row"><span>Tổng đơn:</span><span class="summary-highlight">${totalOrders}</span></div>
            <div class="summary-row"><span>Doanh thu:</span><span class="summary-highlight">${formatMoney(totalTakeaway + totalDinein)}</span></div>
            <div class="summary-divider"></div>
            <div class="summary-row small"><span>🛵 Mang đi: ${today.takeaway.count} đơn</span><span>${formatMoney(today.takeaway.total)}</span></div>
            <div class="summary-row small"><span>🍽️ Tại chỗ: ${today.dinein.count} đơn</span><span>${formatMoney(today.dinein.total)}</span></div>
        </div>
        <div class="history-title">📊 7 ngày gần nhất</div>
        <div class="history-list">
            ${weekly.map(day => {
                const total = day.takeaway.total + day.dinein.total;
                const orders = day.takeaway.count + day.dinein.count;
                return `
                    <div class="history-item">
                        <div class="history-date">${formatDateShort(day.date)}</div>
                        <div class="history-stats"><span>📦 ${orders} đơn</span><span class="history-amount">${formatMoney(total)}</span></div>
                        <div class="history-breakdown"><span>🛵 ${day.takeaway.count}</span><span>🍽️ ${day.dinein.count}</span><span>💰 ${formatMoney(day.takeaway.cash + day.dinein.cash)}</span><span>💳 ${formatMoney(day.takeaway.transfer + day.dinein.transfer)}</span></div>
                    </div>
                `;
            }).join('')}
        </div>
        <button class="export-btn" onclick="exportReport()">📎 Xuất báo cáo</button>
    `;
}

function formatDateShort(dateStr) {
    const d = new Date(dateStr);
    const today = new Date().toISOString().slice(0,10);
    if (dateStr === today) return 'Hôm nay';
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === yesterday.toISOString().slice(0,10)) return 'Hôm qua';
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function exportReport() {
    const today = reportData.today;
    const content = `BÁO CÁO POS NGÀY ${today.date}\n====================\nMang đi: ${today.takeaway.count} đơn - ${formatMoney(today.takeaway.total)}\nTại chỗ: ${today.dinein.count} đơn - ${formatMoney(today.dinein.total)}\nTiền mặt: ${formatMoney(today.takeaway.cash + today.dinein.cash)}\nChuyển khoản: ${formatMoney(today.takeaway.transfer + today.dinein.transfer)}\nTổng doanh thu: ${formatMoney(today.takeaway.total + today.dinein.total)}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `baocao_${today.date}.txt`;
    link.click();
    alert('✅ Đã xuất báo cáo!');
}

window.reportData = reportData;
window.renderReport = renderReport;
window.addTransaction = addTransaction;
window.exportReport = exportReport;