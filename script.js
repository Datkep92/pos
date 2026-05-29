// ========== DỮ LIỆU BÀN ==========
// Dữ liệu bàn mẫu (có startTime)
let tables = [
    { id: 1, name: "Bàn 01", status: "occupied", time: "14:20", startTime: new Date(Date.now() - 45 * 60000).toISOString(), items: [{ name: "CF sữa", price: 30000, qty: 2 }], total: 60000, debt: 0, customerId: null },
    { id: 2, name: "Bàn 02", status: "occupied", time: "14:25", startTime: new Date(Date.now() - 40 * 60000).toISOString(), items: [{ name: "Trà chanh", price: 20000, qty: 1 }], total: 20000, debt: 0, customerId: null },
    { id: 3, name: "Bàn 03", status: "empty", time: "--:--", startTime: null, items: [], total: 0, debt: 0, customerId: null },
    { id: 4, name: "Bàn 04", status: "debt", time: "14:10", startTime: new Date(Date.now() - 55 * 60000).toISOString(), items: [{ name: "Sting", price: 12000, qty: 2 }], total: 24000, debt: 24000, customerId: null },
    { id: 5, name: "Bàn 05", status: "empty", time: "--:--", startTime: null, items: [], total: 0, debt: 0, customerId: null },
    { id: 6, name: "Bàn 06", status: "empty", time: "--:--", startTime: null, items: [], total: 0, debt: 0, customerId: null },
    { id: 7, name: "Bàn 07", status: "empty", time: "--:--", startTime: null, items: [], total: 0, debt: 0, customerId: null },
    { id: 8, name: "Bàn 08", status: "occupied", time: "14:28", startTime: new Date(Date.now() - 37 * 60000).toISOString(), items: [{ name: "CF sữa đá", price: 30000, qty: 2 }], total: 60000, debt: 0, customerId: null }
];

let currentContext = null;
let tempOrder = [];
let pendingPayment = { tableId: null, amount: null, type: null };
let currentSelectedCustomer = null;
// ========== TOAST NOTIFICATION ==========
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    switch (type) {
        case 'success':
            icon = '✅';
            break;
        case 'error':
            icon = '❌';
            break;
        case 'warning':
            icon = '⚠️';
            break;
        default:
            icon = 'ℹ️';
    }
    
    toast.innerHTML = `${icon} ${message}`;
    container.appendChild(toast);
    
    // Tự động xóa sau 2.5 giây
    setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 2500);
}
// ========== UTILS ==========
function formatMoney(amount) {
    return amount.toLocaleString('vi-VN') + 'đ';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// ========== RENDER BÀN (CẬP NHẬT - ẨN NÚT TRẢ SAU KHI ĐÃ GÁN KHÁCH) ==========
function renderTables() {
    const grid = document.getElementById('tablesGrid');
    if (!grid) return;
    
    grid.innerHTML = tables.map(table => {
        const statusClass = table.status === 'empty' ? 'empty' : (table.status === 'debt' ? 'debt' : 'occupied');
        const itemCount = table.items.reduce((sum, i) => sum + i.qty, 0);
        
        // Lấy tên khách hàng nếu có
        let customerName = '';
        let hasCustomer = false;
        if (table.customerId && window.customers) {
            const c = window.customers.find(c => c.id === table.customerId);
            customerName = c ? c.name : '';
            hasCustomer = !!c;
        }
        
        // Tính thời gian ngồi
        let timeDisplay = table.time;
        if (table.status === 'occupied' && table.startTime) {
            const start = new Date(table.startTime);
            const now = new Date();
            const diffMs = now - start;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffMinutes = diffMins % 60;
            
            if (diffHours > 0) {
                timeDisplay = `${diffHours}h${diffMinutes}p`;
            } else {
                timeDisplay = `${diffMins}p`;
            }
        }
        
        // QUYẾT ĐỊNH HIỂN THỊ NÚT "TRẢ SAU" 💢
        // Chỉ hiển thị khi BÀN CHƯA GÁN KHÁCH HÀNG
        const showDebtButton = !hasCustomer && table.items.length > 0;
        
        return `
            <div class="table-card ${statusClass}" onclick="showTableDetail(${table.id})">
                <div class="table-top-row">
                    <div class="table-name-section">
                        <span class="table-name">🪑 ${table.name}</span>
                        <button class="btn-assign-customer" onclick="event.stopPropagation(); showCustomerSelectorForTable(${table.id})" title="Gán tên khách hàng">+</button>
                    </div>
                    <span class="table-time">⏱️ ${timeDisplay}</span>
                </div>
                ${customerName ? `<div class="table-customer-name">👤 ${customerName}</div>` : ''}
                <div class="table-stats">
                    <div class="table-item-count">📦 <span>${itemCount}</span> món</div>
                    <div class="table-total">${formatMoney(table.total)}</div>
                    ${table.debt > 0 && !hasCustomer ? `<div class="debt-badge-mini">🔴 Nợ ${formatMoney(table.debt)}</div>` : ''}
                </div>
                <div class="table-icons">
                    <div class="table-icon-btn" onclick="event.stopPropagation(); openAddMenuForTable(${table.id})">
                        <span class="icon icon-add">➕</span>
                    </div>
                    <div class="table-icon-btn" onclick="event.stopPropagation(); showPaymentMethod('dinein', ${table.id}, ${table.total})">
                        <span class="icon icon-pay">💸</span>
                    </div>
                    ${showDebtButton ? `
                        <div class="table-icon-btn" onclick="event.stopPropagation(); debtTable(${table.id})">
                            <span class="icon icon-debt">💢</span>
                        </div>
                    ` : `
                        <div class="table-icon-btn disabled" style="opacity:0.3; cursor:not-allowed;">
                            <span class="icon icon-debt">💢</span>
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
    
    const diningCount = document.getElementById('diningCount');
    const debtCount = document.getElementById('debtCount');
    if (diningCount) diningCount.innerText = tables.filter(t => t.status === 'occupied').length;
    if (debtCount) debtCount.innerText = tables.filter(t => t.status === 'debt').length;
}

// ========== HIỂN THỊ MODAL THANH TOÁN (MỚI) ==========
function showPaymentMethod(type, tableId, amount) {
    if (!amount || amount <= 0) {
        showToast('Không có món để thanh toán!', 'warning');
        return;
    }
    
    // Lấy thông tin đơn hàng
    let items = [];
    let tableName = '';
    let startTime = null;
    
    if (type === 'dinein') {
        const table = tables.find(t => t.id === tableId);
        if (table) {
            items = [...table.items];
            tableName = table.name;
            startTime = table.startTime;
        }
    } else if (type === 'takeaway') {
        items = [...tempOrder];
        tableName = 'Mang đi';
    }
    
    // Tính thời gian ngồi (nếu có)
    let sittingTime = '';
    if (startTime) {
        const start = new Date(startTime);
        const now = new Date();
        const diffMs = now - start;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffMinutes = diffMins % 60;
        
        if (diffHours > 0) {
            sittingTime = `${diffHours} giờ ${diffMinutes} phút`;
        } else {
            sittingTime = `${diffMins} phút`;
        }
    }
    
    // Render nội dung modal
    const modalBody = document.getElementById('paymentModalBody');
    modalBody.innerHTML = `
        <div class="payment-info-section">
            <div class="payment-info-row">
                <span class="payment-info-label">📌 Bàn</span>
                <span class="payment-info-value">${tableName}</span>
            </div>
            <div class="payment-info-row">
                <span class="payment-info-label">⏱️ Thời gian</span>
                <span class="payment-info-value">${new Date().toLocaleString('vi-VN')}</span>
            </div>
            ${sittingTime ? `
            <div class="payment-info-row">
                <span class="payment-info-label">🕑 Thời gian ngồi</span>
                <span class="payment-info-value">${sittingTime}</span>
            </div>
            ` : ''}
        </div>
        
        <div class="payment-items-title" style="font-weight:600; margin-bottom:8px;">📋 Danh sách món</div>
        <div class="payment-items-list">
            ${items.map(item => `
                <div class="payment-item-row">
                    <span class="payment-item-name">${item.name} x${item.qty}</span>
                    <span class="payment-item-price">${formatMoney(item.price * item.qty)}</span>
                </div>
            `).join('')}
        </div>
        
        <div class="payment-info-section">
            <div class="payment-info-row">
                <span class="payment-info-label">💰 Tổng tiền</span>
                <span class="payment-info-value total">${formatMoney(amount)}</span>
            </div>
        </div>
        
        <div class="payment-methods">
            <button class="payment-method-btn cash" onclick="processPaymentWithMethod('${type}', ${tableId}, ${amount}, 'cash')">
                <span class="payment-method-icon">💰</span>
                <span>Tiền mặt</span>
            </button>
            <button class="payment-method-btn transfer" onclick="processPaymentWithMethod('${type}', ${tableId}, ${amount}, 'transfer')">
                <span class="payment-method-icon">💳</span>
                <span>Chuyển khoản</span>
            </button>
        </div>
    `;
    
    // Lưu thông tin để xử lý
    window.pendingPayment = { type, tableId, amount };
    
    // Hiển thị modal
    document.getElementById('paymentModal').style.display = 'flex';
}
// ========== XỬ LÝ THANH TOÁN (DÙNG TOAST) ==========
function processPaymentWithMethod(type, tableId, amount, paymentMethod) {
    if (!amount || amount <= 0) {
        showToast('Không có món để thanh toán!', 'warning');
        document.getElementById('paymentModal').style.display = 'none';
        return;
    }
    
    // Đóng modal
    document.getElementById('paymentModal').style.display = 'none';
    
    // Hiển thị toast xác nhận
    showToast(`Đang xử lý thanh toán ${formatMoney(amount)}...`, 'info');
    
    // Giả lập xử lý (có thể thay bằng setTimeout nếu cần)
    setTimeout(() => {
        // Ghi nhận vào báo cáo
        if (typeof addTransaction === 'function') {
            addTransaction(type === 'takeaway' ? 'takeaway' : 'dinein', amount, paymentMethod);
        }
        
        // Ghi lịch sử
        if (typeof addHistory === 'function') {
            let items = [];
            if (type === 'dinein') {
                const table = tables.find(t => t.id === tableId);
                items = table ? [...table.items] : [];
            } else if (type === 'takeaway') {
                items = [...tempOrder];
            }
            
            addHistory({
                type: type === 'takeaway' ? 'takeaway' : 'dinein',
                amount: amount,
                paymentMethod: paymentMethod,
                items: items,
                customer: currentSelectedCustomer,
                tableName: type === 'dinein' ? tables.find(t => t.id === tableId)?.name : 'Mang đi'
            });
        }
        
        // Trừ nguyên liệu
        if (typeof deductIngredients === 'function') {
            let items = [];
            if (type === 'dinein') {
                const table = tables.find(t => t.id === tableId);
                items = table ? [...table.items] : [];
            } else if (type === 'takeaway') {
                items = [...tempOrder];
            }
            deductIngredients(items);
        }
        
        // Xử lý xóa bàn (nếu là tại chỗ)
        if (type === 'dinein') {
            const table = tables.find(t => t.id === tableId);
            if (table && table.customerId && typeof updateCustomerDebt === 'function') {
                updateCustomerDebt(table.customerId, amount, 'pay_debt', `Thanh toán tại bàn ${table.name}`);
            }
            tables = tables.filter(t => t.id !== tableId);
            tables.forEach((table, index) => {
                table.id = index + 1;
                table.name = `Bàn ${(index + 1).toString().padStart(2, '0')}`;
            });
            renderTables();
        }
        
        // Xóa giỏ hàng tạm nếu là mang đi
        if (type === 'takeaway') {
            tempOrder = [];
            currentSelectedCustomer = null;
        }
        
        // Hiển thị toast thành công
        showToast(`✅ Thanh toán thành công ${formatMoney(amount)} bằng ${paymentMethod === 'cash' ? 'tiền mặt' : 'chuyển khoản'}!`, 'success');
        
        // Refresh các tab
        if (document.getElementById('reportView')?.classList.contains('active') && typeof renderReport === 'function') renderReport();
        if (document.getElementById('customersView')?.classList.contains('active') && typeof renderCustomerList === 'function') renderCustomerList();
        if (document.getElementById('ingredientsView')?.classList.contains('active') && typeof renderIngredients === 'function') renderIngredients();
        if (document.getElementById('historyView')?.classList.contains('active') && typeof renderHistory === 'function') renderHistory();
        
        // Đóng modal chi tiết bàn nếu đang mở
        document.getElementById('tableDetailModal').style.display = 'none';
        
        // Nếu in tự động được bật
        if (localStorage.getItem('settingAutoPrint') === 'true') {
            const invoiceData = {
                items: type === 'dinein' ? tables.find(t => t.id === tableId)?.items || [] : tempOrder,
                total: amount,
                paid: amount,
                change: 0
            };
            if (typeof printInvoice === 'function') printInvoice(invoiceData);
        }
    }, 500);
}
// ========== XỬ LÝ THANH TOÁN ==========
function processPayment(paymentMethod) {
    const { type, tableId, amount } = pendingPayment;
    if (!amount || amount <= 0) {
        alert('Không có món để thanh toán!');
        pendingPayment = {};
        document.getElementById('paymentMethodModal').style.display = 'none';
        return;
    }
    
    if (confirm(`✅ Thanh toán ${formatMoney(amount)} bằng ${paymentMethod === 'cash' ? 'TIỀN MẶT' : 'CHUYỂN KHOẢN'}?`)) {
        // Ghi nhận báo cáo
        if (typeof addTransaction === 'function') {
            addTransaction(type === 'takeaway' ? 'takeaway' : 'dinein', amount, paymentMethod);
        }
        // Ghi lịch sử
        if (typeof addHistory === 'function') {
            addHistory({
                type: type === 'takeaway' ? 'takeaway' : 'dinein',
                amount: amount,
                paymentMethod: paymentMethod,
                items: type === 'dinein' ? (tables.find(t => t.id === tableId)?.items || []) : tempOrder,
                customer: currentSelectedCustomer,
                tableName: type === 'dinein' ? tables.find(t => t.id === tableId)?.name : 'Mang đi'
            });
        }
        
        // Xử lý xóa bàn
        if (type === 'dinein') {
            const table = tables.find(t => t.id === tableId);
            if (table && table.customerId && typeof updateCustomerDebt === 'function') {
                updateCustomerDebt(table.customerId, amount, 'pay_debt', `Thanh toán tại bàn ${table.name}`);
            }
            tables = tables.filter(t => t.id !== tableId);
            tables.forEach((table, index) => {
                table.id = index + 1;
                table.name = `Bàn ${(index + 1).toString().padStart(2, '0')}`;
            });
            renderTables();
            document.getElementById('tableDetailModal').style.display = 'none';
        }
        
        // Trừ nguyên liệu
        if (typeof deductIngredients === 'function') {
            const items = type === 'dinein' ? (tables.find(t => t.id === tableId)?.items || []) : tempOrder;
            deductIngredients(items);
        }
        
        alert('✅ Thanh toán thành công!');
        pendingPayment = {};
        document.getElementById('paymentMethodModal').style.display = 'none';
        
        // Refresh các tab
        if (document.getElementById('reportView').classList.contains('active') && typeof renderReport === 'function') renderReport();
        if (document.getElementById('customersView').classList.contains('active') && typeof renderCustomerList === 'function') renderCustomerList();
        if (document.getElementById('ingredientsView').classList.contains('active') && typeof renderIngredients === 'function') renderIngredients();
        if (document.getElementById('historyView').classList.contains('active') && typeof renderHistory === 'function') renderHistory();
    }
}

document.getElementById('paymentCashBtn')?.addEventListener('click', () => processPayment('cash'));
document.getElementById('paymentTransferBtn')?.addEventListener('click', () => processPayment('transfer'));

// ========== TRẢ SAU - BẮT BUỘC NHẬP TÊN HOẶC CHỌN KHÁCH ==========
function debtTable(tableId) {
    const table = tables.find(t => t.id === tableId);
    if (!table || table.items.length === 0) {
        showToast('Không có món để ghi nợ!', 'warning');
        return;
    }
    
    // Kiểm tra nếu bàn đã có khách
    if (table.customerId) {
        showToast('Bàn đã gán khách hàng, hãy dùng quản lý khách hàng để theo dõi nợ!', 'info');
        return;
    }
    
    const total = table.total;
    const orderDetail = table.items.map(i => `${i.name} x${i.qty}`).join(', ');
    const note = `Mua tại ${table.name} - ${orderDetail}`;
    
    // Lưu thông tin để xử lý sau khi chọn khách
    window.pendingDebtTable = {
        tableId: tableId,
        total: total,
        note: note,
        items: [...table.items]
    };
    
    // Mở modal chọn/ tạo khách hàng (bắt buộc)
    openDebtCustomerSelector();
}

// ========== MỞ MODAL CHỌN/TẠO KHÁCH CHO GHI NỢ ==========
function openDebtCustomerSelector() {
    const container = document.getElementById('debtCustomerSelectorList');
    if (!container) return;
    
    // Lấy danh sách khách hàng (chỉ hiển thị khách có thông tin đầy đủ)
    const validCustomers = (window.customers || []).filter(c => c.name && c.name !== 'Khách lẻ');
    
    container.innerHTML = `
        <div class="debt-selector-header">
            <div class="selector-tabs">
                <div class="selector-tab active" onclick="toggleDebtSelectorTab('select')">📋 Chọn khách hàng</div>
                <div class="selector-tab" onclick="toggleDebtSelectorTab('new')">➕ Tạo khách mới</div>
            </div>
        </div>
        
        <div id="debtSelectTab" class="debt-selector-tab active">
            <div class="customer-search-mini">
                <input type="text" id="debtCustomerSearch" placeholder="🔍 Tìm kiếm khách hàng..." oninput="filterDebtCustomerList()">
            </div>
            <div id="debtCustomerList" class="debt-customer-list">
                ${validCustomers.length === 0 ? '<div class="empty-state">Chưa có khách hàng nào. Hãy tạo mới!</div>' : 
                    validCustomers.map(c => `
                        <div class="debt-customer-item" onclick="selectDebtCustomer(${c.id})">
                            <div class="debt-customer-avatar">${c.name.charAt(0).toUpperCase()}</div>
                            <div class="debt-customer-info">
                                <div class="debt-customer-name">${c.name}</div>
                                <div class="debt-customer-contact">📞 ${c.phone || 'Chưa có số'}</div>
                                <div class="debt-customer-debt">💰 Nợ: ${formatMoney(c.totalDebt || 0)}</div>
                            </div>
                        </div>
                    `).join('')
                }
            </div>
        </div>
        
        <div id="debtNewTab" class="debt-selector-tab">
            <div class="form-group">
                <label>Tên khách hàng <span style="color:#dc2626;">*</span></label>
                <input type="text" id="newDebtCustomerName" class="form-input" placeholder="Nhập tên khách hàng">
            </div>
            <div class="form-group">
                <label>Số điện thoại <span style="color:#dc2626;">*</span></label>
                <input type="tel" id="newDebtCustomerPhone" class="form-input" placeholder="Nhập số điện thoại">
            </div>
            <div class="form-group">
                <label>Địa chỉ</label>
                <input type="text" id="newDebtCustomerAddress" class="form-input" placeholder="Nhập địa chỉ (nếu có)">
            </div>
            <button class="btn-create-debt-customer" onclick="createAndProcessDebt()">✅ Tạo khách và ghi nợ</button>
        </div>
    `;
    
    document.getElementById('debtCustomerModal').style.display = 'flex';
}

function toggleDebtSelectorTab(tab) {
    const selectTab = document.getElementById('debtSelectTab');
    const newTab = document.getElementById('debtNewTab');
    const tabs = document.querySelectorAll('.selector-tab');
    
    tabs.forEach(t => t.classList.remove('active'));
    
    if (tab === 'select') {
        selectTab.classList.add('active');
        tabs[0].classList.add('active');
    } else {
        newTab.classList.add('active');
        tabs[1].classList.add('active');
    }
}

function filterDebtCustomerList() {
    const keyword = document.getElementById('debtCustomerSearch')?.value.toLowerCase() || '';
    const items = document.querySelectorAll('#debtCustomerList .debt-customer-item');
    items.forEach(item => {
        const name = item.querySelector('.debt-customer-name')?.innerText.toLowerCase() || '';
        const phone = item.querySelector('.debt-customer-contact')?.innerText || '';
        item.style.display = (name.includes(keyword) || phone.includes(keyword)) ? 'flex' : 'none';
    });
}

function selectDebtCustomer(customerId) {
    const customer = window.customers?.find(c => c.id === customerId);
    if (!customer) return;
    
    if (!window.pendingDebtTable) {
        showToast('Không có thông tin đơn hàng!', 'error');
        return;
    }
    
    const { tableId, total, note } = window.pendingDebtTable;
    
    if (confirm(`Xác nhận ghi nợ ${formatMoney(total)} cho khách hàng ${customer.name}?`)) {
        if (typeof addCustomerDebt === 'function') {
            addCustomerDebt(customer.id, total, note);
            
            // Gán khách hàng cho bàn và xóa bàn
            const table = tables.find(t => t.id === tableId);
            if (table) {
                table.customerId = customer.id;
            }
            
            // Xóa bàn khỏi giao diện
            tables = tables.filter(t => t.id !== tableId);
            tables.forEach((t, index) => {
                t.id = index + 1;
                t.name = `Bàn ${(index + 1).toString().padStart(2, '0')}`;
            });
            renderTables();
            
            showToast(`💰 Đã ghi nợ ${formatMoney(total)} cho ${customer.name}`, 'success');
            
            // Đóng modal
            document.getElementById('debtCustomerModal').style.display = 'none';
            document.getElementById('tableDetailModal').style.display = 'none';
            
            // Refresh danh sách nợ
            if (typeof renderDebtList === 'function') renderDebtList();
            if (typeof renderCustomerList === 'function') renderCustomerList();
            
            // Xóa pending
            window.pendingDebtTable = null;
        }
    }
}

function createAndProcessDebt() {
    const name = document.getElementById('newDebtCustomerName')?.value.trim();
    const phone = document.getElementById('newDebtCustomerPhone')?.value.trim();
    const address = document.getElementById('newDebtCustomerAddress')?.value.trim();
    
    // Kiểm tra bắt buộc
    if (!name) {
        showToast('Vui lòng nhập tên khách hàng!', 'warning');
        return;
    }
    
    if (!phone) {
        showToast('Vui lòng nhập số điện thoại!', 'warning');
        return;
    }
    
    if (!window.pendingDebtTable) {
        showToast('Không có thông tin đơn hàng!', 'error');
        return;
    }
    
    const { tableId, total, note } = window.pendingDebtTable;
    
    // Tạo khách hàng mới
    let customer = window.customers?.find(c => c.phone === phone);
    if (!customer && typeof addCustomer === 'function') {
        customer = addCustomer(name, phone, address);
    } else if (customer) {
        // Cập nhật thông tin nếu cần
        customer.name = name;
        customer.address = address || customer.address;
        if (typeof saveCustomers === 'function') saveCustomers();
    }
    
    if (customer && typeof addCustomerDebt === 'function') {
        addCustomerDebt(customer.id, total, note);
        
        // Xóa bàn khỏi giao diện
        tables = tables.filter(t => t.id !== tableId);
        tables.forEach((t, index) => {
            t.id = index + 1;
            t.name = `Bàn ${(index + 1).toString().padStart(2, '0')}`;
        });
        renderTables();
        
        showToast(`💰 Đã tạo khách và ghi nợ ${formatMoney(total)} cho ${customer.name}`, 'success');
        
        // Đóng modal
        document.getElementById('debtCustomerModal').style.display = 'none';
        document.getElementById('tableDetailModal').style.display = 'none';
        
        // Refresh danh sách nợ
        if (typeof renderDebtList === 'function') renderDebtList();
        if (typeof renderCustomerList === 'function') renderCustomerList();
        
        // Xóa pending
        window.pendingDebtTable = null;
    }
}

// ========== THÊM MÓN ==========
function openAddMenuForTable(tableId) {
    currentContext = { type: 'addToTable', tableId: tableId };
    tempOrder = [];
    renderOrderMenuForModal('');
    renderTempCartOrder();
    document.getElementById('orderModalTitle').innerHTML = `➕ Thêm món - ${getTableName(tableId)}`;
    document.getElementById('customerSelectRow').style.display = 'none';
    document.getElementById('orderModal').style.display = 'flex';
}

function showTableDetail(tableId) {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;
    
    document.getElementById('detailTableName').innerHTML = `🪑 ${table.name}`;
    document.getElementById('detailTime').innerText = table.time;
    document.getElementById('detailTotal').innerHTML = formatMoney(table.total);
    
    const itemsContainer = document.getElementById('detailItemsList');
    if (table.items.length === 0) {
        itemsContainer.innerHTML = '<div style="color:#adb5bd; text-align:center; padding:20px;">✨ Chưa có món nào</div>';
    } else {
        itemsContainer.innerHTML = table.items.map(item => `
            <div class="detail-item-row">
                <span>${item.name} x${item.qty}</span>
                <span style="font-weight:600;">${formatMoney(item.price * item.qty)}</span>
            </div>
        `).join('');
    }
    
    currentContext = { type: 'detailView', tableId: table.id };
    document.getElementById('tableDetailModal').style.display = 'flex';
}

document.getElementById('detailAddBtn')?.addEventListener('click', () => {
    if (currentContext?.tableId) {
        document.getElementById('tableDetailModal').style.display = 'none';
        openAddMenuForTable(currentContext.tableId);
    }
});

document.getElementById('detailPayBtn')?.addEventListener('click', () => {
    if (currentContext?.tableId) {
        const table = tables.find(t => t.id === currentContext.tableId);
        if (table && table.total > 0) {
            document.getElementById('tableDetailModal').style.display = 'none';
            showPaymentMethod('dinein', currentContext.tableId, table.total);
        } else {
            showToast('Không có món để thanh toán!', 'warning');
        }
    }
});

document.getElementById('detailDebtBtn')?.addEventListener('click', () => {
    if (currentContext?.tableId) {
        debtTable(currentContext.tableId);
        document.getElementById('tableDetailModal').style.display = 'none';
    }
});

document.getElementById('floatTakeawayBtn')?.addEventListener('click', () => {
    if (typeof openTakeawayModal === 'function') {
        openTakeawayModal();
    } else {
        // Fallback nếu chưa load menu.js
        currentContext = { type: 'takeaway' };
        currentSelectedCustomer = null;
        tempOrder = [];
        document.getElementById('orderModalTitle').innerHTML = '🛵 Bán mang đi';
        document.getElementById('customerSelectRow').style.display = 'flex';
        document.getElementById('selectedCustomerDisplay').innerHTML = '👤 Chọn khách hàng (không bắt buộc)';
        document.getElementById('clearCustomerBtn').style.display = 'none';
        document.getElementById('orderModal').style.display = 'flex';
    }
});

document.getElementById('floatNewtableBtn')?.addEventListener('click', () => {
    const emptyTable = tables.find(t => t.status === 'empty');
    if (!emptyTable) {
        showToast('Hiện không còn bàn trống!', 'warning');
        return;
    }
    if (typeof openNewTableModal === 'function') {
        openNewTableModal(emptyTable.id, emptyTable.name);
    } else {
        // Fallback
        currentContext = { type: 'newtable', tableId: emptyTable.id };
        currentSelectedCustomer = null;
        tempOrder = [];
        document.getElementById('orderModalTitle').innerHTML = `🍽️ Tạo đơn - ${emptyTable.name}`;
        document.getElementById('customerSelectRow').style.display = 'flex';
        document.getElementById('selectedCustomerDisplay').innerHTML = '👤 Chọn khách hàng (gán tên bàn)';
        document.getElementById('clearCustomerBtn').style.display = 'none';
        document.getElementById('orderModal').style.display = 'flex';
    }
});

// ========== CHỌN KHÁCH HÀNG ==========
function showCustomerSelectorForOrder() {
    if (typeof showCustomerSelector === 'function') {
        showCustomerSelector((customer) => {
            currentSelectedCustomer = customer;
            document.getElementById('selectedCustomerDisplay').innerHTML = `👤 ${customer.name} ${customer.debt > 0 ? `(nợ ${formatMoney(customer.debt)})` : ''}`;
            document.getElementById('clearCustomerBtn').style.display = 'inline-block';
        });
    }
}
// ========== GÁN TÊN KHÁCH HÀNG CHO BÀN ==========
function showCustomerSelectorForTable(tableId) {
    if (typeof showCustomerSelector === 'function') {
        showCustomerSelector((customer) => {
            const table = tables.find(t => t.id === tableId);
            if (table) {
                table.customerId = customer.id;
                table.name = customer.name;  // Đổi tên bàn thành tên khách
                if (table.status === 'empty') {
                    table.status = 'occupied';
                    table.startTime = new Date().toISOString();
                    table.time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                }
                renderTables();
                alert(`✅ Đã gán khách hàng "${customer.name}" cho bàn`);
            }
        });
    } else {
        alert('Chức năng khách hàng chưa được tải!');
    }
}
function clearSelectedCustomer() {
    currentSelectedCustomer = null;
    document.getElementById('selectedCustomerDisplay').innerHTML = '👤 Chọn khách hàng (không bắt buộc)';
    document.getElementById('clearCustomerBtn').style.display = 'none';
}

// ========== MENU TRONG MODAL ==========
function renderOrderMenuForModal(searchTerm = '') {
    const container = document.getElementById('menuGridOrder');
    if (!window.menuItems) return;
    
    let items = window.menuItems;
    if (searchTerm) {
        items = items.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    
    container.innerHTML = items.map(item => `
        <div class="menu-item-simple" onclick="addToTempOrder('${item.name}', ${item.price})">
            ${item.name}<br>
            <span style="font-size:10px;">${formatMoney(item.price)}</span>
            <span style="font-size:9px; color:#6c757d;">${item.ingredients?.length || 0} nguyên liệu</span>
        </div>
    `).join('');
    
    // Render categories
    const catContainer = document.getElementById('orderCategories');
    if (catContainer && window.menuCategories) {
        catContainer.innerHTML = `
            <div class="category-chip active" data-cat="all" onclick="filterOrderMenu('all')">Tất cả</div>
            ${window.menuCategories.map(c => `<div class="category-chip" data-cat="${c.id}" onclick="filterOrderMenu(${c.id})">${c.name}</div>`).join('')}
        `;
    }
}

function filterOrderMenu(categoryId) {
    const container = document.getElementById('menuGridOrder');
    let items = window.menuItems;
    if (categoryId !== 'all') {
        items = items.filter(i => i.categoryId === categoryId);
    }
    container.innerHTML = items.map(item => `
        <div class="menu-item-simple" onclick="addToTempOrder('${item.name}', ${item.price})">
            ${item.name}<br>
            <span style="font-size:10px;">${formatMoney(item.price)}</span>
        </div>
    `).join('');
    
    document.querySelectorAll('#orderCategories .category-chip').forEach(chip => {
        chip.classList.remove('active');
        if ((categoryId === 'all' && chip.getAttribute('data-cat') === 'all') ||
            (chip.getAttribute('data-cat') == categoryId)) {
            chip.classList.add('active');
        }
    });
}

function addToTempOrder(name, price) {
    const existing = tempOrder.find(i => i.name === name);
    if (existing) {
        existing.qty++;
    } else {
        tempOrder.push({ name, price, qty: 1 });
    }
    renderTempCartOrder();
}

function renderTempCartOrder() {
    const container = document.getElementById('tempCartOrderItems');
    const totalSpan = document.getElementById('tempCartOrderTotal');
    
    if (tempOrder.length === 0) {
        container.innerHTML = 'Chưa có món';
        totalSpan.innerText = '0';
        return;
    }
    
    let total = 0;
    container.innerHTML = tempOrder.map(item => {
        const itemTotal = item.price * item.qty;
        total += itemTotal;
        return `
            <div class="temp-cart-item">
                <span>${item.name} x${item.qty}</span>
                <span>${formatMoney(itemTotal)} <button style="background:#dc2626; color:white; border:none; border-radius:20px; padding:2px 8px;" onclick="removeFromTempOrder('${item.name}')">X</button></span>
            </div>
        `;
    }).join('');
    totalSpan.innerText = total.toLocaleString('vi-VN');
}

function removeFromTempOrder(name) {
    tempOrder = tempOrder.filter(i => i.name !== name);
    renderTempCartOrder();
}

// XÁC NHẬN ĐƠN
document.getElementById('confirmOrderBtn')?.addEventListener('click', () => {
    if (tempOrder.length === 0) {
        alert('Vui lòng chọn món!');
        return;
    }
    
    const total = tempOrder.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const orderDetail = tempOrder.map(i => `${i.name} x${i.qty}`).join(', ');
    
    // Thay thế phần alert bằng showToast và gọi modal thanh toán
if (currentContext?.type === 'takeaway') {
    const total = tempOrder.reduce((sum, i) => sum + (i.price * i.qty), 0);
    if (total > 0) {
        document.getElementById('orderModal').style.display = 'none';
        showPaymentMethod('takeaway', null, total);
    } else {
        showToast('Vui lòng chọn món!', 'warning');
    }
}
    // Trong phần xác nhận đơn (confirmOrderBtn) - TẠO BÀN MỚI
else if (currentContext?.type === 'newtable' && currentContext.tableId) {
    const table = tables.find(t => t.id === currentContext.tableId);
    if (table) {
        tempOrder.forEach(newItem => {
            const existing = table.items.find(i => i.name === newItem.name);
            if (existing) existing.qty += newItem.qty;
            else table.items.push({ ...newItem });
        });
        table.total = table.items.reduce((sum, i) => sum + (i.price * i.qty), 0);
        table.status = 'occupied';
        
        // QUAN TRỌNG: Lưu thời gian bắt đầu ngồi
        const now = new Date();
        table.startTime = now.toISOString();
        table.time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        
        // Gán khách hàng nếu có
        if (currentSelectedCustomer) {
            table.customerId = currentSelectedCustomer.id;
            table.name = currentSelectedCustomer.name; // Đổi tên bàn thành tên khách
            if (typeof updateCustomerDebt === 'function') {
                updateCustomerDebt(currentSelectedCustomer.id, total, 'add_debt', `Tạo bàn mới - ${orderDetail}`);
            }
        }
        
        renderTables();
        alert(`✅ Đã tạo đơn tại ${table.name}`);
    }
    document.getElementById('orderModal').style.display = 'none';
    tempOrder = [];
    currentSelectedCustomer = null;
}
    // Trong phần xác nhận đơn (confirmOrderBtn) - THÊM MÓN VÀO BÀN
else if (currentContext?.type === 'addToTable' && currentContext.tableId) {
    const table = tables.find(t => t.id === currentContext.tableId);
    if (table) {
        tempOrder.forEach(newItem => {
            const existing = table.items.find(i => i.name === newItem.name);
            if (existing) existing.qty += newItem.qty;
            else table.items.push({ ...newItem });
        });
        table.total = table.items.reduce((sum, i) => sum + (i.price * i.qty), 0);
        
        // Nếu bàn đang trống -> chuyển thành occupied và set startTime
        if (table.status === 'empty') {
            table.status = 'occupied';
            const now = new Date();
            table.startTime = now.toISOString();
            table.time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }
        
        if (table.customerId && typeof updateCustomerDebt === 'function') {
            updateCustomerDebt(table.customerId, total, 'add_debt', `Thêm món tại bàn - ${orderDetail}`);
        }
        
        renderTables();
        alert(`✅ Đã thêm món vào ${table.name}`);
    }
    document.getElementById('orderModal').style.display = 'none';
    tempOrder = [];
}
});
// ========== CẬP NHẬT THỜI GIAN NGỒI REAL-TIME ==========
function startRealtimeTimer() {
    setInterval(() => {
        // Chỉ cập nhật nếu đang ở tab bàn
        const activeTab = document.querySelector('.tab-content.active')?.id;
        if (activeTab === 'tablesView') {
            renderTables(); // Re-render để cập nhật thời gian
        }
    }, 60000); // Cập nhật mỗi phút
}

// Gọi hàm này sau khi khởi tạo
startRealtimeTimer();
function processPaymentForOrder(type, total) {
    if (typeof addTransaction === 'function') {
        addTransaction(type, total, 'cash');
    }
    if (typeof addHistory === 'function') {
        addHistory({
            type: type,
            amount: total,
            paymentMethod: 'cash',
            items: tempOrder,
            customer: currentSelectedCustomer,
            tableName: type === 'takeaway' ? 'Mang đi' : 'Bàn mới'
        });
    }
    // Trừ nguyên liệu
    if (typeof deductIngredients === 'function') {
        deductIngredients(tempOrder);
    }
    alert(`✅ Thanh toán ${type === 'takeaway' ? 'mang đi' : 'tại chỗ'}: ${formatMoney(total)}`);
    if (document.getElementById('ingredientsView').classList.contains('active') && typeof renderIngredients === 'function') {
        renderIngredients();
    }
}

document.getElementById('menuSearchInput2')?.addEventListener('input', (e) => {
    renderOrderMenuForModal(e.target.value);
});

// ========== ĐÓNG MODAL ==========
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        tempOrder = [];
        pendingPayment = {};
        currentSelectedCustomer = null;
    });
});

window.onclick = (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
        tempOrder = [];
        pendingPayment = {};
        currentSelectedCustomer = null;
    }
};

// ========== THỜI GIAN ==========
function updateTime() {
    const now = new Date();
    document.getElementById('currentTime').innerText = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateTime, 1000);
updateTime();

// ========== SWITCH MAIN TAB ==========
document.querySelectorAll('.main-tab, .bottom-nav-item').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        document.querySelectorAll('.main-tab, .bottom-nav-item').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabId}View`).classList.add('active');
        
        // Refresh data khi chuyển tab
        if (tabId === 'menu' && typeof renderMenuManager === 'function') renderMenuManager();
        if (tabId === 'ingredients' && typeof renderIngredients === 'function') renderIngredients();
        if (tabId === 'customers' && typeof renderCustomerList === 'function') renderCustomerList();
        if (tabId === 'report' && typeof renderReport === 'function') renderReport();
        if (tabId === 'history' && typeof renderHistory === 'function') renderHistory();
        if (tabId === 'settings' && typeof loadSettings === 'function') loadSettings();
    });
});

// ========== SUB TAB BÀN ==========
document.querySelectorAll('.sub-tab').forEach(subtab => {
    subtab.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
        subtab.classList.add('active');
        const type = subtab.getAttribute('data-subtab');
        if (type === 'debt') {
            const debtTables = tables.filter(t => t.status === 'debt');
            const grid = document.getElementById('tablesGrid');
            if (grid) {
                grid.innerHTML = debtTables.map(table => renderTableCardSimple(table)).join('');
            }
        } else {
            renderTables();
        }
    });
});

function renderTableCardSimple(table) {
    const statusClass = table.status === 'empty' ? 'empty' : (table.status === 'debt' ? 'debt' : 'occupied');
    const itemCount = table.items.reduce((sum, i) => sum + i.qty, 0);
    return `
        <div class="table-card ${statusClass}" onclick="showTableDetail(${table.id})">
            <div class="table-top">
                <span class="table-name">🪑 ${table.name}</span>
                <span class="table-time">⏱️ ${table.time}</span>
            </div>
            <div class="table-stats">
                <div class="table-item-count">📦 <span>${itemCount}</span> món</div>
                <div class="table-total">${formatMoney(table.total)}</div>
                ${table.debt > 0 ? `<div class="debt-badge-mini">🔴 Nợ ${formatMoney(table.debt)}</div>` : ''}
            </div>
            <div class="table-icons">
                <div class="table-icon-btn" onclick="event.stopPropagation(); openAddMenuForTable(${table.id})"><span class="icon">➕</span><span>Thêm</span></div>

<div class="table-icon-btn" onclick="event.stopPropagation(); showPaymentMethod('dinein', ${table.id}, ${table.total})">
    <span class="icon icon-pay">💸</span>
</div>                <div class="table-icon-btn" onclick="event.stopPropagation(); debtTable(${table.id})"><span class="icon">💢</span><span>Nợ</span></div>
            </div>
        </div>
    `;
}
function getTableNameById(tableId) {
    const table = tables.find(t => t.id === tableId);
    return table ? table.name : `Bàn ${tableId}`;
}
window.getTableNameById = getTableNameById;
function getTableName(tableId) {
    const t = tables.find(t => t.id === tableId);
    return t ? t.name : 'Bàn';
}

// ========== CÀI ĐẶT ==========
function loadSettings() {
    const autoPrint = localStorage.getItem('settingAutoPrint') === 'true';
    const afterPay = localStorage.getItem('settingAfterPay') !== 'false';
    const showCustomer = localStorage.getItem('settingShowCustomer') === 'true';
    const minStock = localStorage.getItem('settingMinStock') || '10';
    
    document.getElementById('settingAutoPrint').checked = autoPrint;
    document.getElementById('settingAfterPay').checked = afterPay;
    document.getElementById('settingShowCustomer').checked = showCustomer;
    document.getElementById('settingMinStock').value = minStock;
}

function saveSettings() {
    localStorage.setItem('settingAutoPrint', document.getElementById('settingAutoPrint').checked);
    localStorage.setItem('settingAfterPay', document.getElementById('settingAfterPay').checked);
    localStorage.setItem('settingShowCustomer', document.getElementById('settingShowCustomer').checked);
    localStorage.setItem('settingMinStock', document.getElementById('settingMinStock').value);
    alert('✅ Đã lưu cài đặt!');
}

function resetAllData() {
    if (confirm('⚠️ CẢNH BÁO: Hành động này sẽ xóa TOÀN BỘ dữ liệu (bàn, menu, nguyên liệu, khách hàng, lịch sử, báo cáo).\nBạn có chắc chắn?')) {
        localStorage.clear();
        alert('Đã reset toàn bộ dữ liệu. Vui lòng tải lại trang!');
        location.reload();
    }
}

function exportAllData() {
    const data = {
        tables: tables,
        customers: window.customers || [],
        menuItems: window.menuItems || [],
        menuCategories: window.menuCategories || [],
        ingredients: window.ingredients || [],
        reportData: window.reportData || {},
        history: window.historyData || []
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pos_backup_${new Date().toISOString().slice(0,19)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    alert('✅ Đã xuất dữ liệu!');
}

function importAllData(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.tables) window.tables = data.tables;
            if (data.customers) window.customers = data.customers;
            if (data.menuItems) window.menuItems = data.menuItems;
            if (data.menuCategories) window.menuCategories = data.menuCategories;
            if (data.ingredients) window.ingredients = data.ingredients;
            if (data.reportData) localStorage.setItem('pos_report', JSON.stringify(data.reportData));
            if (data.history) localStorage.setItem('pos_history', JSON.stringify(data.history));
            localStorage.setItem('pos_customers', JSON.stringify(data.customers));
            localStorage.setItem('pos_menu', JSON.stringify({ categories: data.menuCategories, items: data.menuItems }));
            localStorage.setItem('pos_ingredients', JSON.stringify(data.ingredients));
            alert('✅ Nhập dữ liệu thành công! Vui lòng tải lại trang.');
            location.reload();
        } catch (err) {
            alert('Lỗi: File không hợp lệ!');
        }
    };
    reader.readAsText(file);
}

// KHỞI TẠO
renderTables();
if (typeof initMenu === 'function') initMenu();
if (typeof initIngredients === 'function') initIngredients();
if (typeof initCustomers === 'function') initCustomers();
if (typeof initReport === 'function') initReport();
if (typeof initHistory === 'function') initHistory();
loadSettings();