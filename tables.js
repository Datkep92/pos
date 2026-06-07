// tables.js - Quản lý bàn
// Tách từ pos.js - ES5, tương thích Android 6, iOS 12

// ========== HẰNG SỐ KHÓA BÀN ==========
var TABLE_LOCK_HOURS = 5; // Khóa bàn sau 5h sử dụng
var TABLE_LOCK_MS = TABLE_LOCK_HOURS * 60 * 60 * 1000;
var LOCK_PASSWORD = '28122020';

// ========== KIỂM TRA GIỜ KHÓA TOÀN BỘ ==========
// Sau 17h hàng ngày (giờ Việt Nam UTC+7), toàn bộ bàn hiện có đều bị khóa
var LOCK_HOUR_OF_DAY = 17;

function isPastLockHour() {
    var now = new Date();
    var hourVietnam = (now.getUTCHours() + 7) % 24;
    return hourVietnam >= LOCK_HOUR_OF_DAY;
}

// ========== KIỂM TRA KHÓA BÀN ==========
// Bàn bị khóa nếu: dùng >5h HOẶC đã qua 17h
function isTableLocked(table) {
    if (!table || !table.startTime) return false;
    // Điều kiện 1: Dùng quá 5h
    var elapsed = Date.now() - new Date(table.startTime).getTime();
    if (elapsed >= TABLE_LOCK_MS) return true;
    // Điều kiện 2: Đã qua 17h (khóa toàn bộ bàn hiện có)
    if (isPastLockHour()) return true;
    return false;
}

function getTableLockInfo(table) {
    if (!table || !table.startTime) return null;
    var now = new Date();
    var elapsed = Date.now() - new Date(table.startTime).getTime();
    var hourVietnam = (now.getUTCHours() + 7) % 24;
    
    if (elapsed >= TABLE_LOCK_MS) {
        var hours = Math.floor(elapsed / 3600000);
        var mins = Math.floor((elapsed % 3600000) / 60000);
        return { hours: hours, mins: mins, elapsed: elapsed, reason: 'quá ' + hours + 'h' + mins + 'p' };
    }
    if (hourVietnam >= LOCK_HOUR_OF_DAY) {
        return { hours: 0, mins: 0, elapsed: 0, reason: 'đã qua ' + LOCK_HOUR_OF_DAY + 'h' };
    }
    return null;
}

// ========== YÊU CẦU MẬT KHẨU ==========
function requirePassword(action, callback) {
    var pwd = prompt('🔒 Nhập mật khẩu để ' + action + ':');
    if (pwd === LOCK_PASSWORD) {
        callback();
    } else if (pwd !== null) {
        showToast('❌ Sai mật khẩu!', 'error');
    }
}

// ========== LOG XÓA VÀO FIREBASE ==========
// Lưu log xóa món/xóa bàn vào Firebase collection 'delete_logs'
// Key structure: { id, action, tableId, tableName, item, details, timestamp, deviceId }
// Sau này có thể mở rộng thêm trường dữ liệu
function logDelete(action, details) {
    var logEntry = {
        action: action, // 'delete_item' | 'delete_table'
        timestamp: Date.now(),
        deviceId: localStorage.getItem('device_id') || 'unknown',
        details: details
    };
    // Ghi vào Firebase qua DB.create (lưu local + sync lên Firebase)
    return DB.create('delete_logs', logEntry);
}

// ========== XÓA MÓN TRÊN BÀN ==========
function deleteTableItem(tableId, itemIndex) {
    DB.get('tables', String(tableId)).then(function(table) {
        if (!table || !table.items || !table.items.length) return;
        if (itemIndex < 0 || itemIndex >= table.items.length) return;

        var removedItem = table.items[itemIndex];
        var itemName = removedItem.name;
        var itemQty = removedItem.qty;
        var itemPrice = removedItem.price;

        // Kiểm tra khóa bàn: nếu bàn bị khóa, yêu cầu mật khẩu
        if (isTableLocked(table)) {
            requirePassword('xóa món ' + itemName + ' (bàn đang bị khóa)', function() {
                doDeleteTableItem(table, itemIndex, removedItem);
            });
        } else {
            doDeleteTableItem(table, itemIndex, removedItem);
        }
    });
}

function doDeleteTableItem(table, itemIndex, removedItem) {
    // 1. Hoàn nguyên nguyên liệu
    restoreIngredients([removedItem]).then(function() {
        // 2. Xóa món khỏi mảng items
        table.items.splice(itemIndex, 1);

        // 3. Tính lại tổng tiền
        var newTotal = 0;
        for (var i = 0; i < table.items.length; i++) {
            newTotal += table.items[i].price * table.items[i].qty;
        }
        table.total = newTotal;

        // 4. Cập nhật bàn trong DB
        return DB.update('tables', String(table.id), {
            items: table.items,
            total: newTotal
        });
    }).then(function() {
        // 5. Log vào Firebase delete_logs
        var details = {
            tableId: table.id,
            tableName: table.name,
            item: {
                name: removedItem.name,
                qty: removedItem.qty,
                price: removedItem.price,
                addedTime: removedItem.addedTime
            }
        };
        logDelete('delete_item', details);

        // 6. Cập nhật UI
        showToast('🗑️ Đã xóa ' + removedItem.name + ' x' + removedItem.qty, 'success');
        showTableDetail(table.id);
    });
}

// ========== CHI TIẾT BÀN ==========
function showTableDetail(tableId) {
    currentTableDetailId = tableId;
    DB.get('tables', String(tableId)).then(function(table) {
        if (!table) return;
        var tableName = escapeHtml(table.name);
        var customerName = table.customerName ? ' (' + escapeHtml(table.customerName) + ')' : '';
        var lockInfo = getTableLockInfo(table);
        var lockBadge = lockInfo ? ' <span style="color:#dc2626;font-size:12px;">🔒 ' + lockInfo.reason + '</span>' : '';
        document.getElementById('detailTableName').innerHTML = '🪑 ' + tableName + customerName + lockBadge;

        var itemsHtml = '', totalAmount = 0;
        if (table.items && table.items.length) {
            for (var i = 0; i < table.items.length; i++) {
                var item = table.items[i];
                totalAmount += item.price * item.qty;
                var timeStr = '';
                if (item.addedTime) {
                    var d = new Date(item.addedTime);
                    timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                }
                // Hiển thị tên món, số lượng, giờ (nếu có), giá và nút xóa
                itemsHtml += '<div class="cart-item">' +
                    '<span>' + escapeHtml(item.name) + ' x' + item.qty + (timeStr ? ' 🕒 ' + timeStr : '') + '</span>' +
                    '<span>' + formatMoney(item.price * item.qty) + '</span>' +
                    '<button class="cart-item-delete" onclick="deleteTableItem(\'' + table.id + '\',' + i + ')" title="Xóa món">✖</button>' +
                '</div>';
            }
        } else {
            itemsHtml = '<div class="empty-state">✨ Chưa có món</div>';
        }
        document.getElementById('detailItems').innerHTML = itemsHtml;
        document.getElementById('detailSummary').innerHTML = '<div class="cart-total">Tổng: ' + formatMoney(totalAmount) + '</div>';

        var isLocked = isTableLocked(table);
        
        if (isLocked) {
            // Bàn bị khóa: chỉ hiển thị nút thanh toán + ghi nợ
            var editButtonsHtml =
                '<div class="cart-actions edit-actions" style="opacity:0.5;pointer-events:none;">' +
                    '<button class="cart-action-btn" style="background:#f1f5f9;">➕ Thêm món</button>' +
                    '<button class="cart-action-btn" style="background:#f1f5f9;">🧾 Chia hóa đơn</button>' +
                    '<button class="cart-action-btn" style="background:#f1f5f9;">🔄 Chuyển món</button>' +
                    '<button class="cart-action-btn" style="background:#f1f5f9;">🔗 Gộp bàn</button>' +
                    '<button class="cart-action-btn" style="background:#f1f5f9;" onclick="requirePassword(\'xóa bàn\', function(){ showDeleteTableConfirm(\'' + table.id + '\'); closeModal(\'tableDetailModal\'); })">🗑️ Xóa bàn (🔒)</button>' +
                '</div>' +
                '<div style="text-align:center;color:#dc2626;font-size:12px;margin-bottom:8px;">🔒 ' + lockInfo.reason + ' - Chỉ được thanh toán/ghi nợ</div>';

            var paymentButtonsHtml =
                '<div class="cart-actions payment-actions">' +
                    '<button class="cart-action-btn cash" onclick="showPaymentForTable(\'' + table.id + '\')">💰 Tiền mặt</button>' +
                    '<button class="cart-action-btn transfer" onclick="showPaymentForTable(\'' + table.id + '\')">💳 Chuyển khoản</button>' +
                    '<button class="cart-action-btn debt" onclick="debtAtTable(\'' + table.id + '\'); closeModal(\'tableDetailModal\')">💢 Ghi nợ</button>' +
                '</div>';

            document.getElementById('detailActions').innerHTML = editButtonsHtml + paymentButtonsHtml;
        } else {
            // Bàn bình thường: hiển thị đầy đủ nút
            var editButtonsHtml =
                '<div class="cart-actions edit-actions">' +
                    '<button class="cart-action-btn" style="background:#f1f5f9;" onclick="openAddMenuForTable(\'' + table.id + '\'); closeModal(\'tableDetailModal\')">➕ Thêm món</button>' +
                    '<button class="cart-action-btn" style="background:#f1f5f9;" onclick="showSplitBillModal(\'' + table.id + '\'); closeModal(\'tableDetailModal\')">🧾 Chia hóa đơn</button>' +
                    '<button class="cart-action-btn" style="background:#f1f5f9;" onclick="showTransferItemsModal(\'' + table.id + '\'); closeModal(\'tableDetailModal\')">🔄 Chuyển món</button>' +
                    '<button class="cart-action-btn" style="background:#f1f5f9;" onclick="showMergeTableModal(\'' + table.id + '\'); closeModal(\'tableDetailModal\')">🔗 Gộp bàn</button>' +
                    '<button class="cart-action-btn" style="background:#f1f5f9;" onclick="showDeleteTableConfirm(\'' + table.id + '\'); closeModal(\'tableDetailModal\')">🗑️ Xóa bàn</button>' +
                '</div>';

            var paymentButtonsHtml =
                '<div class="cart-actions payment-actions">' +
                    '<button class="cart-action-btn cash" onclick="showPaymentForTable(\'' + table.id + '\')">💰 Tiền mặt</button>' +
                    '<button class="cart-action-btn transfer" onclick="showPaymentForTable(\'' + table.id + '\')">💳 Chuyển khoản</button>' +
                    '<button class="cart-action-btn debt" onclick="debtAtTable(\'' + table.id + '\'); closeModal(\'tableDetailModal\')">💢 Ghi nợ</button>' +
                '</div>';

            document.getElementById('detailActions').innerHTML = editButtonsHtml + paymentButtonsHtml;
        }
        
        document.getElementById('tableDetailModal').style.display = 'flex';
    });
}

// tables.js - Phần sửa hàm openAddMenuForTable

function openAddMenuForTable(tableId) {
    currentAddToTableId = tableId;
    tempOrder = [];
    selectedCustomer = null;
    // Gọi hàm mở modal order với cấu trúc 3 cột
    openOrderModal();
}

function showPaymentForTable(tableId) {
    pendingPaymentTableId = tableId;
    // Hiển thị tùy chọn in hóa đơn
    var printOption = document.getElementById('paymentPrintOption');
    if (printOption) printOption.style.display = 'block';
    document.getElementById('paymentMethodModal').style.display = 'flex';
}

function paymentAtTable(tableId, method) {
    DB.get('tables', String(tableId)).then(function(table) {
        if (!table || !table.items || !table.items.length) return;
        checkStock(table.items).then(function(ok) {
            if (!ok) return;
            deductIngredients(table.items).then(function() {
                var now = new Date();
                addHistory({ type: 'dinein', amount: table.total, paymentMethod: method, items: table.items, customer: table.customerName ? { name: table.customerName } : null, tableName: table.name, note: '', createdAt: now.toISOString() }).then(function(historyId) {
                    DB.remove('tables', String(tableId)).then(function() {
                        // Realtime subscription sẽ tự động cập nhật tables, history, report
                        if (currentTableDetailId === tableId) closeModal('tableDetailModal');
                        showToast('✅ Thanh toán ' + formatMoney(table.total) + ' thành công', 'success');
                        // In hóa đơn nếu được chọn
                        var printCheck = document.getElementById('printAfterPaymentCheck');
                        if (printCheck && printCheck.checked && typeof printAfterPayment === 'function') {
                            printAfterPayment({
                                type: 'dinein',
                                amount: table.total,
                                paymentMethod: method,
                                items: table.items,
                                tableName: table.name,
                                customer: table.customerName ? { name: table.customerName } : null,
                                createdAt: now.toISOString()
                            });
                        }
                    });
                });
            });
        });
    });
}

function debtAtTable(tableId) {
    DB.get('tables', String(tableId)).then(function(table) {
        if (!table || !table.items || !table.items.length) return;
        showCustomerSelector(function(customer) {
            checkStock(table.items).then(function(ok) {
                if (!ok) return;
                deductIngredients(table.items).then(function() {
                    var now = new Date();
                    addCustomerDebt(customer.id, table.total, 'Mua tai ' + table.name).then(function() {
                        addHistory({ type: 'debt_payment', amount: table.total, paymentMethod: 'debt', items: table.items, customer: { id: customer.id, name: customer.name }, tableName: table.name, note: '', createdAt: now.toISOString() }).then(function() {
                            DB.remove('tables', String(tableId)).then(function() {
                                // Realtime subscription sẽ tự động cập nhật:
                                // - tables (bàn bị xóa)
                                // - customers (nợ mới)
                                // - history (giao dịch mới)
                                // - report (doanh thu thay đổi)
                                if (currentTableDetailId === tableId) closeModal('tableDetailModal');
                                showToast('💰 Đã ghi nợ ' + formatMoney(table.total) + ' cho ' + customer.name, 'success');
                                // In hóa đơn nếu được chọn
                                var printCheck = document.getElementById('printAfterPaymentCheck');
                                if (printCheck && printCheck.checked && typeof printAfterPayment === 'function') {
                                    printAfterPayment({
                                        type: 'debt_payment',
                                        amount: table.total,
                                        paymentMethod: 'debt',
                                        items: table.items,
                                        tableName: table.name,
                                        customer: { id: customer.id, name: customer.name },
                                        createdAt: now.toISOString()
                                    });
                                }
                            });
                        });
                    });
                });
            });
        });
    });
}

function showCustomerSelectorForTable(tableId) {
    showCustomerSelector(function(customer) {
        DB.update('tables', String(tableId), { customerId: customer.id, customerName: customer.name }).then(function() {
            // Realtime subscription sẽ tự động cập nhật tables
            if (currentTableDetailId === tableId) showTableDetail(tableId);
            showToast('✅ Đã gán khách ' + customer.name + ' cho bàn', 'success');
        });
    });
}

// ========== CHIA HÓA ĐƠN ==========
function confirmSplitPaymentWithMethod(method, customer) {
    var tableId = pendingSplitTableId;
    if (!tableId) return;
    
    DB.get('tables', String(tableId)).then(function(table) {
        if (!table) return;
        
        // Lấy các món đã chọn để thanh toán (giống logic cũ)
        var splitItems = [];
        var remainingItems = [];
        for (var i = 0; i < table.items.length; i++) {
            remainingItems.push({
                name: table.items[i].name,
                price: table.items[i].price,
                qty: table.items[i].qty
            });
        }
        
        var rows = document.querySelectorAll('.split-item-row');
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var idx = parseInt(row.getAttribute('data-idx'));
            var input = document.getElementById('split-qty-' + idx);
            var qty = input ? parseInt(input.value) : 0;
            if (qty > 0) {
                var item = remainingItems[idx];
                if (qty > item.qty) qty = item.qty;
                splitItems.push({
                    name: item.name,
                    price: item.price,
                    qty: qty
                });
                item.qty -= qty;
            }
        }
        
        if (splitItems.length === 0) {
            showToast('Chưa chọn món để thanh toán!', 'warning');
            return;
        }
        
        var splitTotal = splitItems.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
        var finalItems = remainingItems.filter(function(i) { return i.qty > 0; });
        var newTotal = finalItems.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
        
        // Trừ nguyên liệu (kiểm tra stock trước)
        checkStock(splitItems).then(function(ok) {
            if (!ok) return;
            deductIngredients(splitItems).then(function() {
                // Nếu là ghi nợ, cần có customer
                if (method === 'debt' && !customer) {
                    showToast('Cần chọn khách hàng để ghi nợ!', 'warning');
                    return;
                }
                
                // Cập nhật bàn: giảm số lượng món đã thanh toán
                DB.update('tables', String(tableId), { items: finalItems, total: newTotal }).then(function() {
                    // Lưu lịch sử giao dịch
                    var historyPromise;
                    if (method === 'debt') {
                        // Ghi nợ: cộng nợ cho khách
                        addCustomerDebt(customer.id, splitTotal, 'Chia hóa đơn tại bàn ' + table.name).then(function() {
                            historyPromise = addHistory({
                                type: 'debt_payment',
                                amount: splitTotal,
                                paymentMethod: 'debt',
                                items: splitItems,
                                customer: { id: customer.id, name: customer.name },
                                tableName: table.name,
                                note: 'Chia hóa đơn'
                            });
                        });
                    } else {
                        historyPromise = addHistory({
                            type: 'dinein',
                            amount: splitTotal,
                            paymentMethod: method,
                            items: splitItems,
                            customer: null,
                            tableName: table.name,
                            note: 'Chia hóa đơn'
                        });
                    }
                    
                    Promise.resolve(historyPromise).then(function() {
                        // Realtime subscription sẽ tự động cập nhật tables, history, report
                        if (currentTableDetailId === tableId) showTableDetail(tableId);
                        closeModal('splitBillModal');
                        showToast('✅ Đã thanh toán phần chia ' + formatMoney(splitTotal) + (method === 'debt' ? ' (ghi nợ)' : ''), 'success');
                    });
                });
            });
        });
    });
}

function showSplitBillModal(tableId) {
    pendingSplitTableId = tableId;
    DB.get('tables', String(tableId)).then(function(table) {
        if (!table || !table.items || !table.items.length) {
            showToast('Không có món để chia!', 'warning');
            return;
        }
        var container = document.getElementById('splitItemsList');
        if (!container) return;
        
        // Tạo danh sách các món với ô nhập số lượng
        var html = '';
        for (var i = 0; i < table.items.length; i++) {
            var item = table.items[i];
            html += '<div class="split-item-row" data-idx="' + i + '" data-price="' + item.price + '" data-max="' + item.qty + '">' +
                '<span>' + escapeHtml(item.name) + '</span>' +
                '<div class="split-qty-control">' +
                    '<button class="split-qty-minus" data-idx="' + i + '">-</button>' +
                    '<input type="number" class="split-qty-input" id="split-qty-' + i + '" value="0" min="0" max="' + item.qty + '" step="1">' +
                    '<button class="split-qty-plus" data-idx="' + i + '">+</button>' +
                    '<span>/ ' + item.qty + '</span>' +
                '</div>' +
                '<span id="split-price-' + i + '" class="split-item-price">0đ</span>' +
            '</div>';
        }
        container.innerHTML = html;
        
        // Gắn sự kiện tăng/giảm số lượng
        attachSplitQtyEvents();
        updateSplitTotal();
        
        // *** THAY ĐỔI KHU VỰC NÚT ***
        var formActions = document.querySelector('#splitBillModal .form-actions');
        if (formActions) {
            formActions.innerHTML = `
                <button class="cart-action-btn cash" id="splitCashBtn">💰 Tiền mặt</button>
                <button class="cart-action-btn transfer" id="splitTransferBtn">💳 Chuyển khoản</button>
                <button class="cart-action-btn debt" id="splitDebtBtn">💢 Ghi nợ</button>
                <button class="btn-cancel" onclick="closeModal('splitBillModal')">Hủy</button>
            `;
            
            // Gắn sự kiện cho các nút mới
            document.getElementById('splitCashBtn').onclick = function() {
                confirmSplitPaymentWithMethod('cash', null);
            };
            document.getElementById('splitTransferBtn').onclick = function() {
                confirmSplitPaymentWithMethod('transfer', null);
            };
            document.getElementById('splitDebtBtn').onclick = function() {
                showCustomerSelector(function(customer) {
                    confirmSplitPaymentWithMethod('debt', customer);
                });
            };
        }
        
        document.getElementById('splitBillModal').style.display = 'flex';
    });
}

function attachSplitQtyEvents() {
    var minusBtns = document.querySelectorAll('.split-qty-minus');
    var plusBtns = document.querySelectorAll('.split-qty-plus');
    for (var i = 0; i < minusBtns.length; i++) {
        minusBtns[i].onclick = (function(btn) {
            return function() {
                var idx = btn.getAttribute('data-idx');
                var input = document.getElementById('split-qty-' + idx);
                if (input) {
                    var val = parseInt(input.value) || 0;
                    if (val > 0) input.value = val - 1;
                    updateSplitTotal();
                }
            };
        })(minusBtns[i]);
    }
    for (var i = 0; i < plusBtns.length; i++) {
        plusBtns[i].onclick = (function(btn) {
            return function() {
                var idx = btn.getAttribute('data-idx');
                var input = document.getElementById('split-qty-' + idx);
                if (input) {
                    var val = parseInt(input.value) || 0;
                    var max = parseInt(input.getAttribute('max')) || 0;
                    if (val < max) input.value = val + 1;
                    updateSplitTotal();
                }
            };
        })(plusBtns[i]);
    }
}

function updateSplitTotal() {
    var total = 0;
    var rows = document.querySelectorAll('.split-item-row');
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var idx = row.getAttribute('data-idx');
        var price = parseInt(row.getAttribute('data-price'));
        var input = document.getElementById('split-qty-' + idx);
        var qty = input ? parseInt(input.value) : 0;
        var itemTotal = price * qty;
        total += itemTotal;
        var priceSpan = document.getElementById('split-price-' + idx);
        if (priceSpan) priceSpan.innerText = formatMoney(itemTotal);
    }
    var totalSpan = document.getElementById('splitTotalAmount');
    if (totalSpan) totalSpan.innerText = formatMoney(total);
}

function confirmSplitPayment() {
    var tableId = pendingSplitTableId;
    if (!tableId) return;
    DB.get('tables', String(tableId)).then(function(table) {
        if (!table) return;
        var splitItems = [];
        var remainingItems = [];
        for (var i = 0; i < table.items.length; i++) {
            remainingItems.push({ name: table.items[i].name, price: table.items[i].price, qty: table.items[i].qty });
        }
        var rows = document.querySelectorAll('.split-item-row');
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var idx = parseInt(row.getAttribute('data-idx'));
            var input = document.getElementById('split-qty-' + idx);
            var qty = input ? parseInt(input.value) : 0;
            if (qty > 0) {
                var item = remainingItems[idx];
                if (qty > item.qty) qty = item.qty;
                splitItems.push({ name: item.name, price: item.price, qty: qty });
                item.qty -= qty;
            }
        }
        if (splitItems.length === 0) { showToast('Chưa chọn món để thanh toán!', 'warning'); return; }
        var splitTotal = splitItems.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
        var finalItems = remainingItems.filter(function(i) { return i.qty > 0; });
        var newTotal = finalItems.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
        DB.update('tables', String(tableId), { items: finalItems, total: newTotal }).then(function() {
            checkStock(splitItems).then(function(ok) {
                if (!ok) return;
                deductIngredients(splitItems).then(function() {
                    addHistory({ type: 'dinein', amount: splitTotal, paymentMethod: 'cash', items: splitItems, customer: null, tableName: table.name, note: 'Chia hóa đơn' }).then(function() {
                        // Realtime subscription sẽ tự động cập nhật tables, history, report
                        if (currentTableDetailId === tableId) showTableDetail(tableId);
                        closeModal('splitBillModal');
                        showToast('✅ Đã thanh toán phần chia ' + formatMoney(splitTotal), 'success');
                    });
                });
            });
        });
    });
}

// ========== CHUYỂN MÓN ==========
function showTransferItemsModal(sourceId) {
    DB.get('tables', String(sourceId)).then(function(table) {
        if (!table || !table.items || !table.items.length) { showToast('Không có món để chuyển!', 'warning'); return; }
        pendingTransferSourceTable = table;
        var container = document.getElementById('transferItemsList');
        if (!container) return;
        var html = '';
        for (var i = 0; i < table.items.length; i++) {
            var item = table.items[i];
            html += '<div class="transfer-item-row" data-idx="' + i + '" data-price="' + item.price + '" data-max="' + item.qty + '">' +
                '<span>' + escapeHtml(item.name) + '</span>' +
                '<div class="transfer-qty-control">' +
                    '<button class="transfer-qty-minus" data-idx="' + i + '">-</button>' +
                    '<input type="number" class="transfer-qty-input" id="transfer-qty-' + i + '" value="0" min="0" max="' + item.qty + '" step="1" style="width:60px;text-align:center;">' +
                    '<button class="transfer-qty-plus" data-idx="' + i + '">+</button>' +
                    '<span>/ ' + item.qty + '</span>' +
                '</div>' +
            '</div>';
        }
        container.innerHTML = html;
        attachTransferQtyEvents();
        var targetInput = document.getElementById('transferTargetTable');
        if (targetInput) targetInput.value = '';
        document.getElementById('transferItemsModal').style.display = 'flex';
    });
}

function attachTransferQtyEvents() {
    var minusBtns = document.querySelectorAll('.transfer-qty-minus');
    var plusBtns = document.querySelectorAll('.transfer-qty-plus');
    for (var i = 0; i < minusBtns.length; i++) {
        minusBtns[i].onclick = (function(btn) {
            return function() {
                var idx = btn.getAttribute('data-idx');
                var input = document.getElementById('transfer-qty-' + idx);
                if (input) {
                    var val = parseInt(input.value) || 0;
                    if (val > 0) input.value = val - 1;
                }
            };
        })(minusBtns[i]);
    }
    for (var i = 0; i < plusBtns.length; i++) {
        plusBtns[i].onclick = (function(btn) {
            return function() {
                var idx = btn.getAttribute('data-idx');
                var input = document.getElementById('transfer-qty-' + idx);
                if (input) {
                    var val = parseInt(input.value) || 0;
                    var max = parseInt(input.getAttribute('max')) || 0;
                    if (val < max) input.value = val + 1;
                }
            };
        })(plusBtns[i]);
    }
}

function confirmTransferItems() {
    if (!pendingTransferSourceTable) return;
    var selectedItems = [];
    var remainingItems = [];
    for (var i = 0; i < pendingTransferSourceTable.items.length; i++) {
        remainingItems.push({ name: pendingTransferSourceTable.items[i].name, price: pendingTransferSourceTable.items[i].price, qty: pendingTransferSourceTable.items[i].qty });
    }
    var rows = document.querySelectorAll('.transfer-item-row');
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var idx = parseInt(row.getAttribute('data-idx'));
        var input = document.getElementById('transfer-qty-' + idx);
        var qty = input ? parseInt(input.value) : 0;
        if (qty > 0) {
            var item = remainingItems[idx];
            if (qty > item.qty) qty = item.qty;
            selectedItems.push({ name: item.name, price: item.price, qty: qty });
            item.qty -= qty;
        }
    }
    if (selectedItems.length === 0) { showToast('Chưa chọn món để chuyển!', 'warning'); return; }
    var targetName = document.getElementById('transferTargetTable').value.trim();
    if (!targetName) { showToast('Nhập tên bàn đích!', 'warning'); return; }
    DB.getAll('tables').then(function(allTables) {
        var targetTable = null;
        for (var i = 0; i < allTables.length; i++) {
            if (allTables[i].name === targetName) { targetTable = allTables[i]; break; }
        }
        var createNew = false;
        if (!targetTable) {
            createNew = true;
            var maxNum = 0;
            for (var i = 0; i < allTables.length; i++) {
                var match = allTables[i].name.match(/Ban (\d+)/);
                if (match && parseInt(match[1]) > maxNum) maxNum = parseInt(match[1]);
            }
            var newNumber = maxNum + 1;
            if (newNumber > 99) { showToast('Đã đạt giới hạn 99 bàn!', 'warning'); return; }
            var newId = Date.now().toString();
            var now = new Date();
            targetTable = {
                id: newId, name: targetName, status: 'occupied',
                time: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                startTime: now.toISOString(),
                items: [], total: 0, customerId: null, customerName: null
            };
        }
        var targetItems = targetTable.items || [];
        for (var i = 0; i < selectedItems.length; i++) {
            var sel = selectedItems[i];
            var found = false;
            for (var j = 0; j < targetItems.length; j++) {
                if (targetItems[j].name === sel.name) {
                    targetItems[j].qty += sel.qty;
                    found = true;
                    break;
                }
            }
            if (!found) targetItems.push({ name: sel.name, price: sel.price, qty: sel.qty, addedTime: new Date().toISOString() });
        }
        var newTargetTotal = targetItems.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
        var finalSourceItems = remainingItems.filter(function(i) { return i.qty > 0; });
        var newSourceTotal = finalSourceItems.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
        var promise = createNew ? DB.create('tables', targetTable, targetTable.id) : Promise.resolve();
        promise.then(function() {
            return DB.update('tables', targetTable.id, { items: targetItems, total: newTargetTotal });
        }).then(function() {
            return DB.update('tables', pendingTransferSourceTable.id, { items: finalSourceItems, total: newSourceTotal });
        }).then(function() {
            // Realtime subscription sẽ tự động cập nhật tables
            if (currentTableDetailId === pendingTransferSourceTable.id) showTableDetail(pendingTransferSourceTable.id);
            closeModal('transferItemsModal');
            var totalQty = 0;
            for (var i = 0; i < selectedItems.length; i++) totalQty += selectedItems[i].qty;
            showToast('Đã chuyển ' + totalQty + ' món sang ' + targetName, 'success');
        });
    });
}

// ========== GỘP BÀN ==========
function showMergeTableModal(sourceId) {
    pendingMergeSourceId = sourceId;
    DB.get('tables', String(sourceId)).then(function(source) {
        if (!source || !source.items || !source.items.length) { showToast('Bàn nguồn không có món!', 'warning'); return; }
        DB.getAll('tables').then(function(allTables) {
            var targets = allTables.filter(function(t) { return t.id !== sourceId && (t.items && t.items.length) && t.total > 0; });
            if (targets.length === 0) { showToast('Không có bàn nào để gộp!', 'warning'); return; }
            var container = document.getElementById('mergeTablesList');
            if (!container) return;
            var html = '';
            for (var i = 0; i < targets.length; i++) {
                var t = targets[i];
                html += '<div class="merge-table-item" data-id="' + t.id + '"><strong>' + escapeHtml(t.name) + '</strong> - ' + (t.customerName || 'chưa có khách') + ' - ' + formatMoney(t.total) + '</div>';
            }
            container.innerHTML = html;
            var items = document.querySelectorAll('.merge-table-item');
            for (var i = 0; i < items.length; i++) {
                items[i].onclick = (function(item) {
                    return function() {
                        var targetId = item.getAttribute('data-id');
                        mergeTables(sourceId, targetId);
                        closeModal('mergeTableModal');
                    };
                })(items[i]);
            }
            document.getElementById('mergeTableModal').style.display = 'flex';
        });
    });
}

function mergeTables(sourceId, targetId) {
    Promise.all([DB.get('tables', String(sourceId)), DB.get('tables', String(targetId))]).then(function(results) {
        var source = results[0];
        var target = results[1];
        if (!source || !target) return;
        var targetItems = target.items || [];
        for (var i = 0; i < source.items.length; i++) {
            var srcItem = source.items[i];
            var found = false;
            for (var j = 0; j < targetItems.length; j++) {
                if (targetItems[j].name === srcItem.name) {
                    targetItems[j].qty += srcItem.qty;
                    found = true;
                    break;
                }
            }
            if (!found) targetItems.push({ name: srcItem.name, price: srcItem.price, qty: srcItem.qty, addedTime: srcItem.addedTime });
        }
        var newTotal = targetItems.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
        DB.update('tables', targetId, { items: targetItems, total: newTotal }).then(function() {
            return DB.remove('tables', String(sourceId));
        }).then(function() {
            // Realtime subscription sẽ tự động cập nhật tables
            if (currentTableDetailId === sourceId || currentTableDetailId === targetId) showTableDetail(targetId);
            showToast('✅ Đã gộp bàn ' + source.name + ' vào ' + target.name, 'success');
        });
    });
}

// Export global
window.showTableDetail = showTableDetail;
window.openAddMenuForTable = openAddMenuForTable;
window.showPaymentForTable = showPaymentForTable;
window.showCustomerSelectorForTable = showCustomerSelectorForTable;
window.showSplitBillModal = showSplitBillModal;
window.showTransferItemsModal = showTransferItemsModal;
window.showMergeTableModal = showMergeTableModal;
window.confirmSplitPayment = confirmSplitPayment;
window.confirmTransferItems = confirmTransferItems;
window.deleteTableItem = deleteTableItem;
window.logDelete = logDelete;
