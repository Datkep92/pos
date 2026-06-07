// history.js - Lịch sử giao dịch
// Tách từ pos.js - ES5, tương thích Android 6, iOS 12

// history.js - Lịch sử giao dịch
// Tách từ pos.js - ES5, tương thích Android 6, iOS 12

// ========== LỊCH SỬ ==========
function renderHistoryByDate(dateObj) {
    var dateStr = dateObj.toISOString().slice(0, 10);
    document.getElementById('historyDate').innerText = formatDateDisplay(dateStr);
    
    var filter = document.getElementById('historyFilter').value;
    
    DB.getTransactionsByDate(dateStr).then(function(transactions) {
        if (filter !== 'all') {
            transactions = transactions.filter(function(t) {
                if (filter === 'dinein') return t.type === 'dinein';
                if (filter === 'takeaway') return t.type === 'takeaway';
                if (filter === 'grab') return t.type === 'grab';
                if (filter === 'cash') return t.paymentMethod === 'cash';
                if (filter === 'transfer') return t.paymentMethod === 'transfer';
                if (filter === 'debt_payment') return t.type === 'debt_payment';
                if (filter === 'cancelled') return t.refunded === true;
                return true;
            });
        }

        // SẮP XẾP: GIAO DỊCH GẦN NHẤT LÊN TRÊN CÙNG
        transactions.sort(function(a, b) {
            var timeA = new Date(a.createdAt || a.date);
            var timeB = new Date(b.createdAt || b.date);
            return timeB - timeA;  // Giảm dần (mới nhất lên đầu)
        });

        var container = document.getElementById('historyList');
        if (!container) return;

        if (transactions.length === 0) {
            container.innerHTML = '<div class="empty-state">📭 Không có giao dịch nào trong ngày</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < transactions.length; i++) {
            var tx = transactions[i];
            var isRefunded = tx.refunded === true;
            
            // Thời gian chi tiết (giờ:phút:giây)
            var txDate = new Date(tx.createdAt || tx.date);
            var time = txDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            // Thông tin vị trí
            var location = '';
            if (tx.tableName) location = '🪑 ' + escapeHtml(tx.tableName);
            else if (tx.type === 'takeaway') location = '🛵 Mang đi';
            else if (tx.type === 'grab') location = '🚕 Grab';
            else location = '🍽️ Tại chỗ';

            // Phân biệt GHI NỢ (mua chịu) vs THANH TOÁN NỢ (trả tiền)
            var isDebtRecord = (tx.type === 'debt_payment' && tx.paymentMethod === 'debt');
            var isDebtPayment = (tx.type === 'debt_payment' && tx.paymentMethod === 'cash');

            // Phương thức thanh toán
            var method = '';
            var methodClass = '';
            if (isRefunded) {
                method = '❌ Đã hủy';
                methodClass = 'refunded-method';
            } else if (isDebtRecord) {
                method = '📝 Ghi nợ';
                methodClass = 'debt-record-method';
            } else if (isDebtPayment) {
                method = '💵 Thanh toán nợ';
                methodClass = 'debt-payment-method';
            } else if (tx.paymentMethod === 'cash') method = '💰 Tiền mặt';
            else if (tx.paymentMethod === 'transfer') method = '💳 Chuyển khoản';
            else if (tx.paymentMethod === 'grab') method = '🚕 Grab';
            else method = '✅ Thành công';

            // Hiển thị tên khách hàng nếu có (cho ghi nợ/thanh toán nợ)
            var customerHtml = '';
            if (tx.customer && tx.customer.name) {
                customerHtml = '<span class="history-customer">👤 ' + escapeHtml(tx.customer.name) + '</span>';
            }

            // Nút hoàn tác (chỉ hiển thị nếu chưa bị hủy)
            var refundBtn = isRefunded ? '' :
                `<button class="btn-refund" onclick="event.stopPropagation(); refundTransaction('${tx.id}')">Hoàn tác</button>`;

            // Số lượng món
            var itemCount = 0;
            if (tx.items && tx.items.length) {
                for (var j = 0; j < tx.items.length; j++) {
                    itemCount += tx.items[j].qty;
                }
            }

            // CSS class riêng cho item
            var itemClass = 'history-item';
            if (isRefunded) itemClass += ' refunded';
            else if (isDebtRecord) itemClass += ' debt-record';
            else if (isDebtPayment) itemClass += ' debt-payment';

            // Dấu +/- cho số tiền
            var amountSign = isRefunded ? '-' : '+';
            var amountClass = 'history-amount';
            if (isRefunded) amountClass += ' refunded-amount';
            else if (isDebtRecord) amountClass += ' debt-record-amount';
            else if (isDebtPayment) amountClass += ' debt-payment-amount';

            html += `
                <div class="${itemClass}" onclick="showTransactionDetail('${tx.id}')">
                    <!-- DÒNG 1: Thời gian + Số món + Phương thức + Khách hàng -->
                    <div class="history-line1">
                        <span class="history-time">${time}</span>
                        <span class="history-location">${location}</span>
                        <span class="history-item-count">📦 ${itemCount} món</span>
                        <span class="history-method ${methodClass}">${method}</span>
                        ${customerHtml}
                    </div>
                    
                    <!-- DÒNG 2: Nút hành động + Số tiền -->
                    <div class="history-line2">
                        <div class="history-actions">
                            ${refundBtn}
                            <span class="history-expand">Chi tiết →</span>
                        </div>
                        <div class="${amountClass}">
                            ${amountSign} ${formatMoney(tx.amount)}
                        </div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    });
}

function showTransactionDetail(transactionId) {
    DB.get('transactions', transactionId).then(function(tx) {
        if (!tx) return;
        
        var dateStr = new Date(tx.date).toLocaleString('vi-VN');
        
        // Phân biệt Ghi nợ (mua chịu) vs Thanh toán nợ (trả tiền)
        var isDebtRecord = (tx.type === 'debt_payment' && tx.paymentMethod === 'debt');
        var isDebtPayment = (tx.type === 'debt_payment' && tx.paymentMethod === 'cash');
        
        var typeName = '';
        if (tx.type === 'dinein') typeName = 'Tại chỗ';
        else if (tx.type === 'takeaway') typeName = 'Mang đi';
        else if (tx.type === 'grab') typeName = 'Grab';
        else if (isDebtRecord) typeName = '📝 Ghi nợ (mua chịu)';
        else if (isDebtPayment) typeName = '💵 Thanh toán nợ (trả tiền)';
        
        var paymentMethodText = '';
        if (tx.paymentMethod === 'cash') paymentMethodText = '💰 Tiền mặt';
        else if (tx.paymentMethod === 'transfer') paymentMethodText = '💳 Chuyển khoản';
        else if (tx.paymentMethod === 'debt') paymentMethodText = '📝 Ghi nợ';
        else if (tx.paymentMethod === 'grab') paymentMethodText = '🚕 Grab';
        
        var itemsHtml = '';
        if (tx.items && tx.items.length) {
            itemsHtml = '<div class="detail-items-title">📦 Danh sách món:</div>';
            for (var i = 0; i < tx.items.length; i++) {
                var item = tx.items[i];
                itemsHtml += '<div class="detail-item-row"><span>' + escapeHtml(item.name) + ' x' + item.qty + '</span><span>' + formatMoney(item.price * item.qty) + '</span></div>';
            }
        } else {
            itemsHtml = '<div class="empty-text">Không có món</div>';
        }
        
        var refundInfo = '';
        if (tx.refunded) {
            refundInfo = '<div class="refund-info">❌ Đã hủy lúc: ' + new Date(tx.refundedAt).toLocaleString('vi-VN') + '<br>📝 Lý do: ' + escapeHtml(tx.refundReason || '') + '</div>';
        }
        
        var html =
            '<div class="detail-section">' +
                '<div class="detail-row"><span>🕒 Thời gian:</span><span>' + dateStr + '</span></div>' +
                '<div class="detail-row"><span>🍽️ Loại:</span><span>' + typeName + '</span></div>' +
                '<div class="detail-row"><span>💳 Thanh toán:</span><span>' + paymentMethodText + '</span></div>' +
                (tx.tableName ? '<div class="detail-row"><span>🪑 Bàn:</span><span>' + escapeHtml(tx.tableName) + '</span></div>' : '') +
                (tx.customer ? '<div class="detail-row"><span>👤 Khách:</span><span>' + escapeHtml(tx.customer.name) + '</span></div>' : '') +
                '<div class="detail-row"><span>💰 Tổng tiền:</span><span class="detail-amount">' + formatMoney(tx.amount) + '</span></div>' +
                (tx.note ? '<div class="detail-row"><span>📝 Ghi chú:</span><span>' + escapeHtml(tx.note) + '</span></div>' : '') +
                refundInfo +
            '</div>' +
            '<div class="detail-section">' + itemsHtml + '</div>' +
            '<div class="form-actions" style="margin-top:12px;">' +
                '<button class="btn-save" onclick="printTransactionDetail(\'' + transactionId + '\')">🖨️ In hóa đơn</button>' +
            '</div>';
        
        document.getElementById('transactionDetailBody').innerHTML = html;
        document.getElementById('transactionDetailModal').style.display = 'flex';
    });
}

function printTransactionDetail(transactionId) {
    DB.get('transactions', transactionId).then(function(tx) {
        if (!tx) return;
        if (typeof printAfterPayment === 'function') {
            printAfterPayment({
                type: tx.type || 'dinein',
                amount: tx.amount || 0,
                paymentMethod: tx.paymentMethod || 'cash',
                items: tx.items || [],
                tableName: tx.tableName || null,
                customer: tx.customer || null,
                createdAt: tx.createdAt || tx.date
            });
        }
    });
}

function refundTransaction(transactionId) {
    // Yêu cầu mật khẩu để hoàn tác
    requirePassword('hoàn tác giao dịch', function() {
        var reason = prompt('📝 Lý do hủy?');
        if (!reason) return;
        DB.get('transactions', transactionId).then(function(trans) {
            if (!trans || trans.refunded) return;
            restoreIngredients(trans.items).then(function() {
                if (trans.type === 'debt_payment' && trans.customer) {
                    addCustomerDebt(trans.customer.id, trans.amount, 'Hoàn tiền - ' + reason);
                }
                trans.refunded = true;
                trans.refundReason = reason;
                trans.refundedAt = Date.now();
                DB.update('transactions', transactionId, trans).then(function() {
                    showToast('✅ Đã hủy giao dịch', 'success');
                    // Cập nhật lại lịch sử và báo cáo
                    if (currentTab === 'history') {
                        renderHistoryByDate(currentHistoryDate);
                    }
                    if (currentTab === 'report') {
                        renderReport(currentReportDate);
                    }
                });
            });
        });
    });
}

function changeHistoryDate(delta) { var nd = new Date(currentHistoryDate); nd.setDate(nd.getDate() + delta); currentHistoryDate = nd; renderHistoryByDate(currentHistoryDate); }

// ========== THÊM GIAO DỊCH ==========
function addHistory(transaction) {
    var newTrans = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        dateKey: new Date().toISOString().slice(0, 10),
        type: transaction.type,
        amount: transaction.amount,
        paymentMethod: transaction.paymentMethod,
        items: transaction.items || [],
        customer: transaction.customer || null,
        tableName: transaction.tableName || null,
        note: transaction.note || '',
        refunded: false
    };
    return DB.create('transactions', newTrans).then(function() {
        // KHÔNG gọi render trực tiếp nữa, để realtime subscription tự cập nhật
    });
}

// Export global
window.refundTransaction = refundTransaction;