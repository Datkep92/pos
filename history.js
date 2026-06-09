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
                if (filter === 'credit') return t.type === 'credit';
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
            
            // Thông tin vị trí + thời gian khách ngồi
            var location = '';
            var tableTimeBadge = '';
            if (tx.tableName) {
                var displayLabel = (tx.customer && tx.customer.name) ? tx.customer.name : tx.tableName;
                location = '🪑 ' + escapeHtml(displayLabel);
                if (tx.tableTime) {
                    tableTimeBadge = '<span class="history-table-time">⏱ ' + escapeHtml(tx.tableTime) + '</span>';
                }
            } else if (tx.type === 'takeaway') location = '🛵 Mang đi';
            else if (tx.type === 'grab') location = '🚕 Grab';
            else location = '🍽️ Tại chỗ';

            // Phân biệt GHI NỢ (mua chịu) vs THANH TOÁN NỢ (trả tiền)
            var isDebtRecord = (tx.type === 'debt_payment' && tx.paymentMethod === 'debt');
            var isDebtPayment = (tx.type === 'debt_payment' && tx.paymentMethod === 'cash');
            var isCredit = (tx.type === 'credit');

            // Phương thức thanh toán
            var method = '';
            var methodClass = '';
            if (isRefunded) {
                method = '❌ Đã hủy';
                methodClass = 'refunded-method';
            } else if (isCredit) {
                method = '💰 Tiền dư';
                methodClass = 'credit-method';
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
            else if (isCredit) itemClass += ' credit-item';
            else if (isDebtRecord) itemClass += ' debt-record';
            else if (isDebtPayment) itemClass += ' debt-payment';

            // Dấu +/- cho số tiền
            var amountSign = isRefunded ? '-' : (isDebtRecord ? '📝' : (isCredit ? '+' : '+'));
            var amountClass = 'history-amount';
            if (isRefunded) amountClass += ' refunded-amount';
            else if (isCredit) amountClass += ' credit-amount';
            else if (isDebtRecord) amountClass += ' debt-record-amount';
            else if (isDebtPayment) amountClass += ' debt-payment-amount';

            html += `
                <div class="${itemClass}" onclick="showTransactionDetail('${tx.id}')">
                    <!-- DÒNG 1: Thời gian + Số món + Phương thức + Khách hàng -->
                    <div class="history-line1">
                        <span class="history-time">${time}</span>
                        <span class="history-location">${location}</span>
                        ${tableTimeBadge}
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
        
        // YÊU CẦU 2: Hiển thị thời gian gốc và thời gian hoàn tác
        var dateStr = new Date(tx.date).toLocaleString('vi-VN');
        var originalTimeStr = '';
        var currentTimeStr = '';
        
        if (tx.refunded && tx.originalCreatedAt) {
            originalTimeStr = new Date(tx.originalCreatedAt).toLocaleString('vi-VN');
            currentTimeStr = new Date(tx.createdAt).toLocaleString('vi-VN');
        }
        
        // Phân biệt Ghi nợ (mua chịu) vs Thanh toán nợ (trả tiền)
        var isDebtRecord = (tx.type === 'debt_payment' && tx.paymentMethod === 'debt');
        var isDebtPayment = (tx.type === 'debt_payment' && tx.paymentMethod === 'cash');
        var isCredit = (tx.type === 'credit');
        
        var typeName = '';
        if (tx.type === 'dinein') typeName = 'Tại chỗ';
        else if (tx.type === 'takeaway') typeName = 'Mang đi';
        else if (tx.type === 'grab') typeName = 'Grab';
        else if (isCredit) typeName = '💰 Tiền dư (trả trước)';
        else if (isDebtRecord) typeName = '📝 Ghi nợ (mua chịu)';
        else if (isDebtPayment) typeName = '💵 Thanh toán nợ (trả tiền)';
        
        var paymentMethodText = '';
        if (tx.paymentMethod === 'cash') paymentMethodText = '💰 Tiền mặt';
        else if (tx.paymentMethod === 'transfer') paymentMethodText = '💳 Chuyển khoản';
        else if (tx.paymentMethod === 'debt') paymentMethodText = '📝 Ghi nợ';
        else if (tx.paymentMethod === 'grab') paymentMethodText = '🚕 Grab';
        else if (tx.paymentMethod === 'credit') paymentMethodText = '💰 Tiền dư';
        
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
        
        // Xây dựng dòng thời gian
        var timeHtml = '';
        if (tx.refunded && tx.originalCreatedAt) {
            timeHtml =
                '<div class="detail-row"><span>🕒 Thời gian gốc:</span><span>' + originalTimeStr + '</span></div>' +
                '<div class="detail-row"><span>🔄 Thời gian hoàn tác:</span><span>' + currentTimeStr + '</span></div>';
        } else {
            timeHtml = '<div class="detail-row"><span>🕒 Thời gian:</span><span>' + dateStr + '</span></div>';
        }
        
        // Hàm render HTML hoàn chỉnh (dùng callback sau khi lấy thông tin bàn)
        function renderDetail(tableTimeHtml) {
            var infoHtml =
                timeHtml +
                '<div class="detail-row"><span>🍽️ Loại:</span><span>' + typeName + '</span></div>' +
                '<div class="detail-row"><span>💳 Thanh toán:</span><span>' + paymentMethodText + '</span></div>' +
                (tx.tableName ? '<div class="detail-row"><span>🪑 Bàn:</span><span>' + escapeHtml(tx.customer && tx.customer.name ? tx.customer.name : tx.tableName) + '</span></div>' : '') +
                tableTimeHtml +
                '<div class="detail-row"><span>💰 Tổng tiền:</span><span class="detail-amount">' + formatMoney(tx.amount) + '</span></div>' +
                (tx.note ? '<div class="detail-row"><span>📝 Ghi chú:</span><span>' + escapeHtml(tx.note) + '</span></div>' : '') +
                refundInfo;
            
            var html =
                '<div class="detail-section">' + infoHtml + '</div>' +
                '<div class="detail-section">' + itemsHtml + '</div>' +
                '<div class="form-actions" style="margin-top:12px;">' +
                    '<button class="btn-save" onclick="printTransactionDetail(\'' + transactionId + '\')">🖨️ In hóa đơn</button>' +
                '</div>';
            
            document.getElementById('transactionDetailBody').innerHTML = html;
            document.getElementById('transactionDetailModal').style.display = 'flex';
        }
        
        // YÊU CẦU 1: Lấy thông tin thời gian hoạt động của bàn
        if (tx.tableId) {
            DB.get('tables', String(tx.tableId)).then(function(table) {
                var tableTimeHtml = '';
                if (table && table.startTime) {
                    var startTime = new Date(table.startTime);
                    var endTime = table.endTime ? new Date(table.endTime) : new Date(tx.createdAt || tx.date);
                    var startStr = startTime.toLocaleString('vi-VN');
                    var endStr = endTime.toLocaleString('vi-VN');
                    
                    // Tính thời gian hoạt động
                    var elapsed = endTime.getTime() - startTime.getTime();
                    var hours = Math.floor(elapsed / 3600000);
                    var mins = Math.floor((elapsed % 3600000) / 60000);
                    var durationStr = hours + 'h' + (mins > 0 ? mins + 'p' : '');
                    
                    tableTimeHtml =
                        '<div class="detail-row"><span>🕐 Bàn mở lúc:</span><span>' + startStr + '</span></div>' +
                        '<div class="detail-row"><span>🕐 Bàn đóng lúc:</span><span>' + endStr + '</span></div>' +
                        '<div class="detail-row"><span>⏱ Thời gian hoạt động:</span><span>' + durationStr + '</span></div>';
                }
                renderDetail(tableTimeHtml);
            });
        } else {
            renderDetail('');
        }
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

// ========== LÝ DO HỦY MẪU ==========
var REFUND_REASONS = [
    'Nhầm món',
    'Nhầm PTTT',
    'Nhầm khách',
    'Khác'
];

function showRefundReasonModal(callback) {
    var modal = document.getElementById('refundReasonModal');
    if (!modal) {
        // Tạo modal nếu chưa có
        modal = document.createElement('div');
        modal.id = 'refundReasonModal';
        modal.className = 'modal';
        modal.innerHTML =
            '<div class="modal-content" style="max-width:400px;">' +
                '<div class="modal-header">📝 Lý do hủy</div>' +
                '<div id="refundReasonList" style="padding:16px;display:flex;flex-direction:column;gap:8px;"></div>' +
                '<div id="refundReasonOther" style="padding:0 16px 16px;display:none;">' +
                    '<input type="text" id="refundReasonOtherInput" class="form-input" placeholder="Nhập lý do khác..." style="width:100%;">' +
                '</div>' +
                '<div class="form-actions" style="padding:0 16px 16px;">' +
                    '<button class="btn-cancel" onclick="closeModal(\'refundReasonModal\')">Hủy</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
    }
    
    var list = document.getElementById('refundReasonList');
    var otherDiv = document.getElementById('refundReasonOther');
    var otherInput = document.getElementById('refundReasonOtherInput');
    if (otherInput) otherInput.value = '';
    if (otherDiv) otherDiv.style.display = 'none';
    
    var html = '';
    for (var i = 0; i < REFUND_REASONS.length; i++) {
        (function(reason) {
            html += '<button class="btn-save" data-reason="' + reason + '" style="width:100%;text-align:center;">' + reason + '</button>';
        })(REFUND_REASONS[i]);
    }
    list.innerHTML = html;
    
    // Gắn sự kiện cho các nút
    var btns = list.querySelectorAll('.btn-save');
    for (var i = 0; i < btns.length; i++) {
        (function(btn) {
            btn.onclick = function() {
                var reason = btn.getAttribute('data-reason');
                if (reason === 'Khác') {
                    var otherDiv = document.getElementById('refundReasonOther');
                    var otherInput = document.getElementById('refundReasonOtherInput');
                    if (otherDiv) otherDiv.style.display = 'block';
                    if (otherInput) {
                        otherInput.focus();
                        otherInput.onkeydown = function(e) {
                            if (e.key === 'Enter' && otherInput.value.trim()) {
                                closeModal('refundReasonModal');
                                callback(otherInput.value.trim());
                            }
                        };
                        // Nút xác nhận cho "Khác"
                        var confirmBtn = document.getElementById('refundReasonOtherConfirm');
                        if (!confirmBtn) {
                            confirmBtn = document.createElement('button');
                            confirmBtn.id = 'refundReasonOtherConfirm';
                            confirmBtn.className = 'btn-save';
                            confirmBtn.innerText = 'Xác nhận';
                            confirmBtn.style.marginTop = '8px';
                            otherDiv.appendChild(confirmBtn);
                        }
                        confirmBtn.onclick = function() {
                            if (otherInput.value.trim()) {
                                closeModal('refundReasonModal');
                                callback(otherInput.value.trim());
                            }
                        };
                    }
                } else {
                    closeModal('refundReasonModal');
                    callback(reason);
                }
            };
        })(btns[i]);
    }
    
    modal.style.display = 'flex';
}

function refundTransaction(transactionId) {
    // Kiểm tra xem giao dịch có thuộc ngày hôm nay không
    var todayStr = new Date().toISOString().slice(0, 10);
    
    DB.get('transactions', transactionId).then(function(trans) {
        if (!trans || trans.refunded) return;
        
        // YÊU CẦU 1: Chặn hoàn tác giao dịch ngày trước đó
        var transDate = trans.dateKey || trans.date.slice(0, 10);
        if (transDate !== todayStr) {
            showToast('❌ Không thể hoàn tác giao dịch của ngày trước đó', 'error');
            return;
        }
        
        // YÊU CẦU 2: Tất cả giao dịch thanh toán (dinein có tableId) đều phải nhập mật khẩu
        if (trans.tableId) {
            return DB.get('tables', String(trans.tableId)).then(function(table) {
                // Bàn đã thanh toán -> luôn yêu cầu mật khẩu để hoàn tác
                return proceedRefund(trans, true);
            });
        } else {
            // Không có tableId (takeaway, grab, debt) -> không cần mật khẩu
            return proceedRefund(trans, false);
        }
    });
}

function proceedRefund(trans, needPassword) {
    var transactionId = trans.id;
    function doRefund() {
        showRefundReasonModal(function(reason) {
            if (!reason) return;
            restoreIngredients(trans.items).then(function() {
                if (trans.type === 'debt_payment' && trans.customer) {
                    if (trans.paymentMethod === 'debt') {
                        // GHI NỢ: hoàn tác = trừ nợ (vì lúc ghi nợ đã cộng nợ)
                        var c = null;
                        for (var i = 0; i < customers.length; i++) {
                            if (customers[i].id === trans.customer.id) { c = customers[i]; break; }
                        }
                        if (c) {
                            c.totalDebt = Math.max(0, (c.totalDebt || 0) - trans.amount);
                            c.debtHistory = c.debtHistory || [];
                            c.debtHistory.unshift({ id: Date.now(), date: new Date().toISOString(), amount: -trans.amount, note: 'Hoàn tác ghi nợ - ' + reason, status: 'cancelled' });
                            DB.update('customers', c.id, { totalDebt: c.totalDebt, debtHistory: c.debtHistory }).then(function() {
                                return DB.getAll('customers').then(function(newCusts) { customers = newCusts; });
                            });
                        }
                    } else {
                        // THANH TOÁN NỢ: hoàn tác = cộng lại nợ (vì lúc thanh toán đã trừ nợ)
                        addCustomerDebt(trans.customer.id, trans.amount, 'Hoàn tiền - ' + reason);
                    }
                }
                
                // YÊU CẦU 2: Lưu thời gian gốc trước khi cập nhật createdAt
                if (!trans.originalCreatedAt) {
                    trans.originalCreatedAt = trans.createdAt;
                }
                trans.createdAt = new Date().toISOString(); // Cập nhật để nổi lên đầu sort
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
    }
    
    if (needPassword) {
        requirePassword('hoàn tác giao dịch thanh toán', doRefund);
    } else {
        doRefund();
    }
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
        tableId: transaction.tableId || null, // Lưu tableId để kiểm tra khoá khi hoàn tác
        note: transaction.note || '',
        refunded: false,
        tableTime: transaction.tableTime || '' // Thời gian khách ngồi (vd: "2h15p")
    };
    return DB.create('transactions', newTrans).then(function() {
        // KHÔNG gọi render trực tiếp nữa, để realtime subscription tự cập nhật
    });
}

// Export global
window.refundTransaction = refundTransaction;