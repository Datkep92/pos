// esp32_audit.js - Hệ thống kiểm soát két tiền (Cash Drawer Audit)
// ES5, tương thích Android 6, iOS 12
// QUY TRÌNH: Session-based, 1 session = mở → đóng, chứa 1 hoặc nhiều transaction
// POS chủ động tìm session mở, gắn transaction, kiểm tra thời gian, gửi cảnh báo qua queue
//
// IMPORTANT: Dùng _sessionCache để lưu transaction local, tránh phụ thuộc sync Firebase
// Khi attachTransactionToSession thành công → lưu vào _sessionCache
// Khi _evaluateSession chạy → đọc từ _sessionCache, không cần đọc lại Firebase
//
// Tất cả thời gian đều là Unix timestamp (ms) từ ESP32 (NTP) hoặc POSApp (Date.now())
//
// QUAN TRỌNG: Ghi đè handleCashPayment đã được định nghĩa trong pos.html
// để xử lý các pending payments trước đó
window.handleCashPayment = function(amount, invoiceId, retryCount) {
    console.log('[AUDIT] handleCashPayment called amount=' + amount + ' invoiceId=' + (invoiceId || 'auto'));
    // Nếu esp32_audit.js chưa init xong, retry sau
    if (!window._auditReady) {
        console.log('[AUDIT] Module chưa sẵn sàng, queue lại:', amount);
        setTimeout(function() {
            window.handleCashPayment(amount, invoiceId, retryCount);
        }, 1000);
        return;
    }
    return window._handleCashPaymentImpl(amount, invoiceId, retryCount);
};

(function() {
    // Đánh dấu module chưa sẵn sàng
    window._auditReady = false;
    // Cache local lưu transactionIds của session đang mở
    // key: sessionId, value: { transactionIds: [...], firstTransactionTime: timestamp, openTime: timestamp }
    var _sessionCache = {};

    // Lấy shopId hiện tại
    function _getShopId() {
        return localStorage.getItem('current_shop_id') || 'shop_default';
    }

    // Lấy tên thu ngân hiện tại từ session
    function _getCurrentCashier() {
        var session = localStorage.getItem('pos_session');
        if (session) {
            try {
                var user = JSON.parse(session);
                return user.displayName || user.username || user.email || 'Nhân viên';
            } catch(e) {}
        }
        return 'Nhân viên';
    }

    // Tạo mã hóa đơn tự động
    function _generateInvoiceId() {
        var now = new Date();
        var dateStr = ('0' + now.getDate()).slice(-2) +
                      ('0' + (now.getMonth() + 1)).slice(-2);
        var timeStr = ('0' + now.getHours()).slice(-2) +
                      ('0' + now.getMinutes()).slice(-2) +
                      ('0' + now.getSeconds()).slice(-2);
        return 'HD' + dateStr + timeStr;
    }

    // Format số tiền
    function _formatMoney(amount) {
        if (!amount) return '0đ';
        var s = String(amount);
        var res = '';
        for (var i = s.length - 1, j = 0; i >= 0; i--, j++) {
            if (j > 0 && j % 3 === 0) res = '.' + res;
            res = s[i] + res;
        }
        return res + 'đ';
    }

    // Gửi thông báo Telegram qua Firebase queue (ESP32 sẽ đọc)
    function _queueTelegram(message) {
        var shopId = _getShopId();
        var ref = firebase.database().ref(shopId + '/drawer_telegram_queue');
        console.log('[AUDIT] Queue Telegram:', message.substring(0, 80) + '...');
        ref.push({
            message: message,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            source: 'pos'
        }).then(function(newRef) {
            console.log('[AUDIT] Queue push thành công, key:', newRef.key);
        }).catch(function(err) {
            console.error('[AUDIT] Lỗi gửi queue:', err);
        });
    }

    // ========== API PUBLIC ==========

    /**
     * Tìm session đang mở gần nhất (status = 'opened')
     * @returns {Promise<object|null>}
     */
    window.findLatestOpenSession = function() {
        var shopId = _getShopId();
        var ref = firebase.database().ref(shopId + '/drawer_sessions');
        // Lấy 10 session gần nhất có status = 'opened'
        return ref.orderByChild('status').equalTo('opened').limitToLast(10).once('value').then(function(snapshot) {
            var sessions = snapshot.val();
            if (!sessions) return null;
            var latest = null;
            var latestTime = 0;
            for (var key in sessions) {
                var s = sessions[key];
                if (s.openTime && s.openTime > latestTime) {
                    latest = s;
                    latest.sessionId = key;
                    latestTime = s.openTime;
                }
            }
            return latest;
        }).catch(function(err) {
            console.error('[AUDIT] Lỗi tìm session mở:', err);
            return null;
        });
    };

    /**
     * Gắn transaction vào session (nếu session còn mở và thời gian hợp lệ)
     * @param {string} sessionId
     * @param {object} tx - { invoiceId, amount, cashier }
     * @returns {Promise<{success: boolean, warning: string|null}>}
     */
    window.attachTransactionToSession = function(sessionId, tx) {
        if (!sessionId) return Promise.resolve({success: false, warning: null});
        var shopId = _getShopId();
        var sessionRef = firebase.database().ref(shopId + '/drawer_sessions/' + sessionId);
        return sessionRef.once('value').then(function(snapshot) {
            var session = snapshot.val();
            if (!session) return {success: false, warning: null};
            // Kiểm tra cả status và closeTime: nếu có closeTime là session đã đóng
            if (session.status !== 'opened' || session.closeTime) {
                return {success: false, warning: 'Session đã đóng'};
            }
            var now = Date.now();
            // Tất cả thời gian đều là Unix timestamp (ms) - có thể so sánh trực tiếp
            var elapsed = 0;
            var warning = null;
            if (session.openTime) {
                elapsed = (now - session.openTime) / 1000;
            }
            if (elapsed > 60) {
                warning = 'Chậm thanh toán: mở két ' + Math.floor(elapsed) + ' giây trước mới giao dịch';
            }
            // Thêm transaction vào mảng
            var transactions = session.transactionIds || [];
            transactions.push({
                invoiceId: tx.invoiceId,
                amount: tx.amount,
                cashier: tx.cashier,
                timestamp: now
            });
            var updates = {
                transactionIds: transactions,
                lastTransactionTime: now
            };
            if (!session.firstTransactionTime) {
                updates.firstTransactionTime = now;
            }
            return sessionRef.update(updates).then(function() {
                // === LƯU VÀO CACHE LOCAL ===
                if (!_sessionCache[sessionId]) {
                    _sessionCache[sessionId] = {
                        transactionIds: [],
                        firstTransactionTime: session.firstTransactionTime || now,
                        openTime: session.openTime
                    };
                }
                _sessionCache[sessionId].transactionIds.push({
                    invoiceId: tx.invoiceId,
                    amount: tx.amount,
                    cashier: tx.cashier,
                    timestamp: now
                });
                console.log('[AUDIT] Cache updated, txCount:', _sessionCache[sessionId].transactionIds.length);
                
                return {
                    success: true,
                    warning: warning,
                    transactionCount: transactions.length,
                    elapsedSeconds: elapsed
                };
            });
        }).catch(function(err) {
            console.error('[AUDIT] Lỗi gắn transaction:', err);
            return {success: false, warning: null};
        });
    };

    // Hàm retry nội bộ cho handleCashPayment
    function _retryHandleCashPayment(amount, invoiceId, cashier, retryCount) {
        if (retryCount < 5) {
            console.log('[AUDIT] Chưa thấy session mở, thử lại lần', (retryCount + 1));
            return new Promise(function(resolve) {
                setTimeout(function() {
                    resolve(window.handleCashPayment(amount, invoiceId, retryCount + 1));
                }, 2000);
            });
        }
        // Hết retry, tạo session ảo + cảnh báo
        console.warn('[AUDIT] 🔴 Két không mở sau 5 lần retry, tạo session ảo');
        _createVirtualSession(invoiceId, amount, cashier, 'két không mở');
        // CHỈ gửi cảnh báo đỏ, KHÔNG gửi "hợp lệ" vì két không mở
        var warnMsg = '🔴 Cảnh báo: Két không mở khi thanh toán tiền mặt!\nHóa đơn: ' + invoiceId + ' - ' + _formatMoney(amount) + '\nThu ngân: ' + cashier;
        _queueTelegram(warnMsg);
        return;
    }

    // Tạo session ảo (fallback khi không tìm thấy session mở)
    // KHÔNG gửi message "hợp lệ" vì két thực tế không mở
    function _createVirtualSession(invoiceId, amount, cashier, reason) {
        var now = Date.now();
        var virtualSessionId = 'virt_' + now;
        _sessionCache[virtualSessionId] = {
            transactionIds: [{
                invoiceId: invoiceId,
                amount: amount,
                cashier: cashier,
                timestamp: now
            }],
            firstTransactionTime: now,
            openTime: now
        };
        console.log('[AUDIT] Giao dịch session ảo:', invoiceId);
    }

    /**
     * XỬ LÝ CHÍNH – Gọi khi thanh toán tiền mặt
     * Có cơ chế retry: nếu chưa thấy session mở, chờ 2s và thử lại (tối đa 5 lần = 10s)
     * Nếu không tìm thấy session mở nhưng có session vừa đóng (trong 5s) → tạo session ảo ngay
     * @param {number} amount - Số tiền
     * @param {string} [invoiceId] - Mã hóa đơn (tự sinh nếu không có)
     * @param {number} [retryCount] - Số lần thử lại (nội bộ)
     * @returns {Promise}
     */
    window._handleCashPaymentImpl = function(amount, invoiceId, retryCount) {
        if (!amount || amount <= 0) return Promise.resolve();
        invoiceId = invoiceId || _generateInvoiceId();
        var cashier = _getCurrentCashier();
        retryCount = retryCount || 0;
        
        console.log('[AUDIT] Xử lý thanh toán TM:', invoiceId, amount, '(retry:', retryCount + ')');
        
        return window.findLatestOpenSession().then(function(session) {
            if (!session) {
                // Lần đầu không thấy session mở → kiểm tra session vừa đóng
                if (retryCount === 0) {
                    var shopId = _getShopId();
                    return firebase.database().ref(shopId + '/drawer_sessions')
                        .orderByChild('closeTime').limitToLast(1).once('value').then(function(snap) {
                            var vals = snap.val();
                            var recentSession = null;
                            var recentTime = 0;
                            for (var k in vals) {
                                var s = vals[k];
                                if (s.closeTime && s.closeTime > recentTime) {
                                    recentSession = s;
                                    recentSession.sessionId = k;
                                    recentTime = s.closeTime;
                                }
                            }
                            var now = Date.now();
                            // Nếu session vừa đóng trong 5 giây trước → tạo session ảo + cảnh báo
                            if (recentSession && recentSession.closeTime && (now - recentSession.closeTime) < 5000) {
                                console.log('[AUDIT] Session vừa đóng, tạo session ảo:', recentSession.sessionId);
                                _createVirtualSession(invoiceId, amount, cashier, 'đóng nhanh');
                                // Gửi cảnh báo vì két đã đóng trước khi POS gắn giao dịch
                                var warnMsg = '🔴 Két đóng quá nhanh trước khi gắn giao dịch!\nHóa đơn: ' + invoiceId + ' - ' + _formatMoney(amount) + '\nThu ngân: ' + cashier;
                                _queueTelegram(warnMsg);
                                return;
                            }
                            // Không có session vừa đóng → retry bình thường
                            return _retryHandleCashPayment(amount, invoiceId, cashier, retryCount);
                        });
                }
                return _retryHandleCashPayment(amount, invoiceId, cashier, retryCount);
            }
            
            // Kiểm tra session có dấu hiệu bất thường:
            // Nếu session đã có >= 5 transaction và lastTransactionTime > 60s
            // => ESP32 không đóng két, đây là session cũ
            var txList = session.transactionIds || [];
            var now = Date.now();
            var lastTxTime = session.lastTransactionTime || 0;
            var sessionAge = now - lastTxTime;
            
            if (txList.length >= 5 && lastTxTime > 0 && sessionAge > 60000) {
                console.warn('[AUDIT] Session cũ bất thường (>=5tx, >60s):', session.sessionId);
                var shopId = _getShopId();
                firebase.database().ref(shopId + '/drawer_sessions/' + session.sessionId).update({
                    status: 'auto_closed',
                    note: 'auto_closed_by_pos_after_60s'
                }).catch(function(err) {
                    console.error('[AUDIT] Lỗi đóng session cũ:', err);
                });
                
                var warnMsg = '🔴 Két không đóng sau giao dịch!\nSession: ' + session.sessionId + '\nCó ' + txList.length + ' giao dịch';
                _queueTelegram(warnMsg);
                
                _createVirtualSession(invoiceId, amount, cashier, null);
                return;
            }
            
            return window.attachTransactionToSession(session.sessionId, {
                invoiceId: invoiceId,
                amount: amount,
                cashier: cashier
            }).then(function(result) {
                if (!result.success) {
                    var msg = '🔴 Lỗi gắn giao dịch vào session\nHóa đơn: ' + invoiceId + '\nSession: ' + session.sessionId;
                    _queueTelegram(msg);
                    return;
                }
                // Giao dịch đầu tiên trong session: báo "🟢 Giao dịch hợp lệ"
                // Giao dịch thứ 2+ trong cùng session: báo "🟡 Cảnh báo: giao dịch liên tiếp"
                if (result.transactionCount === 1) {
                    var msg = '🟢 Giao dịch hợp lệ\nHóa đơn: ' + invoiceId + ' - ' + _formatMoney(amount) + '\nThu ngân: ' + cashier;
                    if (result.warning) {
                        msg = '🟡 ' + result.warning + '\n' + msg;
                    }
                    _queueTelegram(msg);
                } else {
                    var msg = '🟡 Cảnh báo: Giao dịch thứ ' + result.transactionCount + ' trong 1 lần mở két\nHóa đơn: ' + invoiceId + ' - ' + _formatMoney(amount) + '\nThu ngân: ' + cashier;
                    _queueTelegram(msg);
                }
                console.log('[AUDIT] Giao dịch hợp lệ, txCount:', result.transactionCount);
            });
        }).catch(function(err) {
            console.error('[AUDIT] Lỗi xử lý thanh toán TM:', err);
        });
    };

    // ========== ĐÁNH GIÁ SESSION SAU KHI ĐÓNG ==========
    // Ưu tiên đọc dữ liệu từ _sessionCache (đã được lưu khi attachTransactionToSession)
    // Nếu chưa có cache, đọc openTime từ Firebase (chỉ 1 lần, không retry)
    // KHÔNG đọc transactionIds từ Firebase để tránh vấn đề IndexedDB chưa sync
    function _evaluateSession(sessionId, session, retryCount) {
        if (!session.closeTime) return;
        retryCount = retryCount || 0;
        
        // === ĐỌC TỪ CACHE LOCAL ===
        var cached = _sessionCache[sessionId];
        var txCount = cached ? cached.transactionIds.length : 0;
        var firstTxTime = cached ? cached.firstTransactionTime : null;
        var openTime = cached ? cached.openTime : null;
        var closeTime = session.closeTime;
        
        // Nếu chưa có cache, thử đọc openTime từ Firebase (chỉ 1 lần)
        if (!openTime) {
            var shopId = _getShopId();
            var sessionRef = firebase.database().ref(shopId + '/drawer_sessions/' + sessionId + '/openTime');
            sessionRef.once('value').then(function(snapshot) {
                var ot = snapshot.val();
                if (ot) {
                    session.openTime = ot;
                }
                _doEvaluate(sessionId, session, cached, txCount, firstTxTime, ot || 0, closeTime, retryCount);
            }).catch(function() {
                _doEvaluate(sessionId, session, cached, txCount, firstTxTime, 0, closeTime, retryCount);
            });
            return;
        }
        
        _doEvaluate(sessionId, session, cached, txCount, firstTxTime, openTime, closeTime, retryCount);
    }
    
    function _doEvaluate(sessionId, session, cached, txCount, firstTxTime, openTime, closeTime, retryCount) {
        // Tất cả thời gian đều là Unix timestamp (ms) - có thể so sánh trực tiếp
        var hasValidOpenTime = openTime && openTime > 100000000000; // Unix timestamp > năm 1973
        var duration = hasValidOpenTime ? (closeTime - openTime) / 1000 : 0;
        
        console.log('[AUDIT] Đánh giá session:', sessionId, 'txCount:', txCount, 'duration:', Math.floor(duration) + 's');
        
        // Nếu chưa có transaction trong cache và còn lượt retry, chờ thêm
        if (txCount === 0 && retryCount < 10) {
            console.log('[AUDIT] Cache chưa có transaction, retry lần', (retryCount + 1));
            setTimeout(function() {
                _evaluateSession(sessionId, session, retryCount + 1);
            }, 2000);
            return;
        }
        
        var alerts = [];
        
        if (hasValidOpenTime && duration > 30) {
            alerts.push('🟠 Mở két quá ' + Math.floor(duration) + ' giây');
        }
        if (firstTxTime && hasValidOpenTime) {
            var firstDelay = (firstTxTime - openTime) / 1000;
            if (firstDelay > 60) {
                alerts.push('🟡 Chậm thanh toán: ' + Math.floor(firstDelay) + ' giây sau khi mở');
            }
        } else {
            if (txCount === 0) {
                alerts.push('🔴 Mở két nhưng KHÔNG có giao dịch nào');
            }
        }
        // Chỉ cảnh báo "nhiều giao dịch" khi đóng két, không báo ở mỗi giao dịch lẻ
        // để tránh trùng lặp thông báo
        if (txCount > 1) {
            alerts.push('🟡 Có ' + txCount + ' giao dịch trong 1 lần mở');
        }
        if (alerts.length) {
            var msg = '⚠️ SESSION ' + sessionId + ' kết thúc với bất thường:\n' + alerts.join('\n');
            _queueTelegram(msg);
        }
        
        // Dọn cache sau khi đánh giá xong
        delete _sessionCache[sessionId];
    }

    // Lắng nghe sự kiện session được cập nhật (đóng)
    // Chỉ evaluate 1 lần cho mỗi sessionId (tránh child_changed fire nhiều lần)
    var _evaluatedSessions = {};
    function _listenSessionClosure() {
        var shopId = _getShopId();
        var ref = firebase.database().ref(shopId + '/drawer_sessions');
        ref.on('child_changed', function(snapshot) {
            var session = snapshot.val();
            var sessionId = snapshot.key;
            if (session && session.status === 'closed' && session.closeTime) {
                // Chỉ evaluate nếu chưa từng evaluate session này
                if (_evaluatedSessions[sessionId]) {
                    console.log('[AUDIT] Bỏ qua evaluate đã xử lý:', sessionId);
                    return;
                }
                _evaluatedSessions[sessionId] = true;
                _evaluateSession(sessionId, session, 0);
            }
        });
    }

    // Khởi tạo listener (gọi một lần)
    setTimeout(_listenSessionClosure, 1000);

    // Đánh dấu module đã sẵn sàng
    window._auditReady = true;
    
    // Xử lý các pending payments từ trước khi esp32_audit.js load
    var pending = window._pendingCashPayments || [];
    window._pendingCashPayments = []; // Xóa queue sau khi lấy
    if (pending.length > 0) {
        console.log('[AUDIT] Xử lý ' + pending.length + ' pending payment(s) từ queue');
        pending.forEach(function(p) {
            window._handleCashPaymentImpl(p.amount, p.invoiceId, 0);
        });
    }
    
    console.log('[AUDIT] ESP32 Audit module loaded (NTP, _sessionCache)');
})();
