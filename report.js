// ========== BÁO CÁO DOANH THU (TÍNH TOÁN TỪ TRANSACTIONS) ==========
let reportData = null;

async function initReport() {
    // Không cần lưu riêng, chỉ để đồng bộ
    await renderReport();
}

async function renderReport() {
    const container = document.getElementById('reportContent');
    if (!container) return;
    
    // Lấy tất cả transactions (đã được đồng bộ real-time)
    const transactions = await DB.getAll('transactions');
    const today = new Date().toISOString().slice(0,10);
    
    // Tính báo cáo hôm nay
    const todayTransactions = transactions.filter(t => t.date?.slice(0,10) === today);
    const takeaway = { count: 0, total: 0, cash: 0, transfer: 0 };
    const dinein = { count: 0, total: 0, cash: 0, transfer: 0 };
    
    for (const tx of todayTransactions) {
        const type = tx.type;
        if (type === 'takeaway') {
            takeaway.count++;
            takeaway.total += tx.amount;
            if (tx.paymentMethod === 'cash') takeaway.cash += tx.amount;
            else if (tx.paymentMethod === 'transfer') takeaway.transfer += tx.amount;
        } else if (type === 'dinein') {
            dinein.count++;
            dinein.total += tx.amount;
            if (tx.paymentMethod === 'cash') dinein.cash += tx.amount;
            else if (tx.paymentMethod === 'transfer') dinein.transfer += tx.amount;
        }
    }
    
    const totalCash = takeaway.cash + dinein.cash;
    const totalTransfer = takeaway.transfer + dinein.transfer;
    const totalOrders = takeaway.count + dinein.count;
    const totalRevenue = takeaway.total + dinein.total;
    
    // Tính 7 ngày gần nhất
    const last7Days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0,10);
        const dayTx = transactions.filter(t => t.date?.slice(0,10) === dateStr);
        const dayTakeaway = dayTx.filter(t => t.type === 'takeaway').reduce((sum, t) => sum + t.amount, 0);
        const dayDinein = dayTx.filter(t => t.type === 'dinein').reduce((sum, t) => sum + t.amount, 0);
        last7Days.push({ date: dateStr, takeaway: dayTakeaway, dinein: dayDinein, total: dayTakeaway + dayDinein });
    }
    
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon">🛵</div><div class="stat-info"><div class="stat-label">Mang đi</div><div class="stat-value">${takeaway.count}</div><div class="stat-amount">${formatMoney(takeaway.total)}</div></div></div>
            <div class="stat-card"><div class="stat-icon">🍽️</div><div class="stat-info"><div class="stat-label">Tại chỗ</div><div class="stat-value">${dinein.count}</div><div class="stat-amount">${formatMoney(dinein.total)}</div></div></div>
            <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-info"><div class="stat-label">Tiền mặt</div><div class="stat-amount">${formatMoney(totalCash)}</div></div></div>
            <div class="stat-card"><div class="stat-icon">💳</div><div class="stat-info"><div class="stat-label">Chuyển khoản</div><div class="stat-amount">${formatMoney(totalTransfer)}</div></div></div>
        </div>
        <div class="summary-card">
            <div class="summary-title">📅 Hôm nay - ${new Date(today).toLocaleDateString('vi-VN')}</div>
            <div class="summary-row"><span>Tổng đơn:</span><span class="summary-highlight">${totalOrders}</span></div>
            <div class="summary-row"><span>Doanh thu:</span><span class="summary-highlight">${formatMoney(totalRevenue)}</span></div>
            <div class="summary-divider"></div>
            <div class="summary-row small"><span>🛵 Mang đi: ${takeaway.count} đơn</span><span>${formatMoney(takeaway.total)}</span></div>
            <div class="summary-row small"><span>🍽️ Tại chỗ: ${dinein.count} đơn</span><span>${formatMoney(dinein.total)}</span></div>
            <div class="summary-row small"><span>💰 Tiền mặt</span><span>${formatMoney(totalCash)}</span></div>
            <div class="summary-row small"><span>💳 Chuyển khoản</span><span>${formatMoney(totalTransfer)}</span></div>
        </div>
        <div class="history-title">📊 7 ngày gần nhất</div>
        <div class="history-list">
            ${last7Days.map(day => `
                <div class="history-item">
                    <div class="history-date">${formatDateShort(day.date)}</div>
                    <div class="history-stats"><span>📦 Tổng: ${formatMoney(day.total)}</span></div>
                    <div class="history-breakdown"><span>🛵 ${formatMoney(day.takeaway)}</span><span>🍽️ ${formatMoney(day.dinein)}</span></div>
                </div>
            `).join('')}
        </div>
        <button class="export-btn" onclick="exportReportFromTransactions()">📎 Xuất báo cáo</button>
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

async function exportReportFromTransactions() {
    const transactions = await DB.getAll('transactions');
    const today = new Date().toISOString().slice(0,10);
    const todayTx = transactions.filter(t => t.date?.slice(0,10) === today);
    const takeawayTotal = todayTx.filter(t => t.type === 'takeaway').reduce((s,t)=>s+t.amount,0);
    const dineinTotal = todayTx.filter(t => t.type === 'dinein').reduce((s,t)=>s+t.amount,0);
    const content = `Báo cáo ngày ${today}\nMang đi: ${formatMoney(takeawayTotal)}\nTại chỗ: ${formatMoney(dineinTotal)}\nTổng: ${formatMoney(takeawayTotal+dineinTotal)}`;
    const blob = new Blob([content], {type:'text/plain'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `baocao_${today}.txt`;
    link.click();
    showToast('Đã xuất báo cáo', 'success');
}

// Xuất global
window.initReport = initReport;
window.renderReport = renderReport;
window.exportReport = exportReportFromTransactions;