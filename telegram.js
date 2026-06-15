// telegram.js - Gửi thông báo qua Telegram Queue (Firebase)
// ESP32 sẽ đọc queue và gửi thực tế, không gửi trực tiếp từ trình duyệt
(function() {
    // Lấy shopId hiện tại
    function _getShopId() {
        return localStorage.getItem('current_shop_id') || 'shop_default';
    }

    // Hàm gửi tin nhắn vào queue Firebase (thay vì gửi trực tiếp)
    window.queueTelegramMessage = function(message) {
        if (!message) return Promise.resolve();
        var shopId = _getShopId();
        var ref = firebase.database().ref(shopId + '/drawer_telegram_queue');
        return ref.push({
            message: message,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            source: 'pos'
        }).catch(function(err) {
            console.error('[Telegram] Lỗi gửi queue:', err);
        });
    };

    // ========== CÁC HÀM ĐỊNH DẠNG (GIỮ NGUYÊN) ==========
    function _tgTime() {
        return new Date().toLocaleString("vi-VN", {
            hour: "2-digit", minute: "2-digit",
            day: "2-digit", month: "2-digit"
        });
    }

    function _tgType(transaction) {
        if (transaction.type === "dinein") return "🍽️ Tại chỗ";
        if (transaction.type === "takeaway") return "🛵 Mang đi";
        if (transaction.type === "grab") return "🚕 Grab";
        if (transaction.type === "debt_payment") return "💵 Trả nợ";
        if (transaction.type === "draft") return "📋 Nháp";
        if (transaction.type === "cancelled") return "❌ Hủy";
        return "💳 Giao dịch";
    }

    function _tgMethod(transaction) {
        if (transaction.paymentMethod === "cash") return "💰 Tiền mặt";
        if (transaction.paymentMethod === "transfer") return "💳 Chuyển khoản";
        if (transaction.paymentMethod === "debt") return "💢 Ghi nợ";
        if (transaction.paymentMethod === "grab") return "🚕 Grab";
        return "";
    }

    function _tgLocation(transaction) {
        if (transaction.tableName) return "🪑 " + transaction.tableName;
        if (transaction.type === "takeaway") return "🛵 Mang đi";
        if (transaction.type === "grab") return "🚕 Grab";
        return "🍽️ Tại chỗ";
    }

    function _tgCustomer(transaction) {
        if (transaction.customer && transaction.customer.name) return "👤 " + transaction.customer.name;
        return "";
    }

    function _tgItemCount(transaction) {
        if (!transaction.items || !transaction.items.length) return 0;
        var count = 0;
        for (var i = 0; i < transaction.items.length; i++) count += transaction.items[i].qty;
        return count;
    }

    function formatMoney(amount) {
        if (!amount && amount !== 0) return '0đ';
        var s = String(amount);
        var res = '';
        for (var i = s.length - 1, j = 0; i >= 0; i--, j++) {
            if (j > 0 && j % 3 === 0) res = '.' + res;
            res = s[i] + res;
        }
        return res + 'đ';
    }

    // Định dạng giao dịch
    window.formatTelegramTransaction = function(transaction) {
        if (!transaction) return "";
        var timeStr = _tgTime();
        var typeStr = _tgType(transaction);
        var methodStr = _tgMethod(transaction);
        var locationStr = _tgLocation(transaction);
        var customerStr = _tgCustomer(transaction);
        var itemCount = _tgItemCount(transaction);
        var amountStr = formatMoney(transaction.amount);
        var msg = "<b>🛒 ĐƠN MỚI +" + amountStr + "</b>\n";
        msg += "────────────────\n";
        msg += "🕐 " + timeStr + "\n";
        msg += typeStr + "\n";
        msg += locationStr + "\n";
        if (customerStr) msg += customerStr + "\n";
        msg += "📦 " + itemCount + " món\n";
        if (methodStr) msg += methodStr + "\n";
        msg += "💰 <b>" + amountStr + "</b>\n";
        return msg;
    };

    window.formatTelegramExpense = function(expenseData) {
        if (!expenseData) return "";
        var typeIcon = expenseData.type === "ingredient" ? "🧂" : "📦";
        var typeName = expenseData.type === "ingredient" ? "Nguyên liệu" : "Hao phí";
        var fundIcon = expenseData.fundSource === "pos_cash" ? "🏦" : "👔";
        var fundName = expenseData.fundSource === "pos_cash" ? "Két POS" : "QL Thanh toán";
        var msg = "<b>📊 CHI PHÍ</b>\n";
        msg += "────────────────\n";
        msg += "🕐 " + _tgTime() + "\n";
        msg += typeIcon + " " + typeName + "\n";
        msg += "📝 " + (expenseData.categoryName || expenseData.name || "") + "\n";
        msg += fundIcon + " " + fundName + "\n";
        msg += "💰 <b>" + formatMoney(expenseData.amount) + "</b>\n";
        return msg;
    };

    window.formatTelegramCustom = function(message) {
        var msg = "<b>📢 THÔNG BÁO</b>\n";
        msg += "────────────────\n";
        msg += "🕐 " + _tgTime() + "\n";
        msg += message + "\n";
        return msg;
    };

    window.formatTelegramRefund = function(transaction, reason, needPassword) {
        if (!transaction) return "";
        var timeStr = _tgTime();
        var typeStr = _tgType(transaction);
        var methodStr = _tgMethod(transaction);
        var locationStr = _tgLocation(transaction);
        var customerStr = _tgCustomer(transaction);
        var itemCount = _tgItemCount(transaction);
        var amountStr = formatMoney(transaction.amount);
        var lockIcon = needPassword ? "🔒" : "🔓";
        var lockText = needPassword ? "Có mật khẩu" : "Không mật khẩu";
        var msg = "<b>❌ HOÀN TÁC -" + amountStr + "</b>\n";
        msg += "────────────────\n";
        msg += "🕐 " + timeStr + "\n";
        msg += typeStr + "\n";
        msg += locationStr + "\n";
        if (customerStr) msg += customerStr + "\n";
        msg += "📦 " + itemCount + " món\n";
        if (methodStr) msg += methodStr + "\n";
        msg += "💰 <b>" + amountStr + "</b>\n";
        msg += "📝 Lý do: " + reason + "\n";
        msg += lockIcon + " " + lockText + "\n";
        return msg;
    };

    // ========== CÁC HÀM GỬI NHANH (QUA QUEUE) ==========
    window.notifyTelegramTransaction = function(transaction) {
        var msg = window.formatTelegramTransaction(transaction);
        if (msg) window.queueTelegramMessage(msg);
    };

    window.notifyTelegramExpense = function(expenseData) {
        var msg = window.formatTelegramExpense(expenseData);
        if (msg) window.queueTelegramMessage(msg);
    };

    window.notifyTelegramCustom = function(message) {
        var msg = window.formatTelegramCustom(message);
        if (msg) window.queueTelegramMessage(msg);
    };

    window.notifyTelegramRefund = function(transaction, reason, needPassword) {
        var msg = window.formatTelegramRefund(transaction, reason, needPassword);
        if (msg) window.queueTelegramMessage(msg);
    };

    console.log('[Telegram] Module loaded (queue mode)');
})();