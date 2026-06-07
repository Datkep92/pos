// print.js - In hóa đơn nhiệt
// Hỗ trợ 4 chế độ:
//   1. In qua trình duyệt (window.print) - nếu máy in đã cài trên Android
//   2. In qua TCP (gửi ESC/POS trực tiếp đến IP:9100) - cho máy in mạng
//   3. In qua Sunmi Built-in Print Service (localhost:8001) - cho máy Sunmi
//   4. In qua Bluetooth (Web Bluetooth API) - cho máy in Bluetooth
//   Tự động dò tìm máy in trong mạng LAN

var PRINT_MODE = 'browser'; // 'browser', 'tcp', 'sunmi', hoặc 'bluetooth'
var PRINTER_IP = '';
var PRINTER_PORT = 9100;
var SUNMI_SERVICE_URL = 'http://localhost:8001';
var _scanning = false;
var _btDevice = null; // Bluetooth device đã kết nối
var _btService = null; // Bluetooth service đã kết nối

// ========== LẤY IP CỦA THIẾT BỊ ==========
function getLocalIP(callback) {
    try {
        var RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
        if (!RTCPeerConnection) { callback(null); return; }
        
        var pc = new RTCPeerConnection({ iceServers: [] });
        var found = false;
        
        pc.createDataChannel('');
        pc.createOffer().then(function(offer) {
            return pc.setLocalDescription(offer);
        }).catch(function(){});
        
        pc.onicecandidate = function(e) {
            if (!e || !e.candidate || found) return;
            var candidate = e.candidate.candidate;
            var match = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
            if (match) {
                var ip = match[0];
                // Bỏ qua loopback, link-local, multicast
                if (ip.indexOf('127.') === 0 || ip.indexOf('169.254.') === 0 || ip.indexOf('0.') === 0) return;
                found = true;
                callback(ip);
                setTimeout(function() { pc.close(); }, 100);
            }
        };
        
        setTimeout(function() {
            if (!found) { pc.close(); callback(null); }
        }, 3000);
    } catch(e) {
        callback(null);
    }
}

// ========== DÒ TÌM MÁY IN TRONG MẠNG LAN ==========
function scanPrinters(callback) {
    if (_scanning) { showToast('🔄 Đang quét... vui lòng đợi', 'info'); return; }
    _scanning = true;
    
    showToast('🔄 Đang dò tìm máy in trong mạng LAN...', 'info');
    
    getLocalIP(function(localIP) {
        if (!localIP) {
            showToast('⚠️ Không thể xác định IP thiết bị. Vui lòng nhập IP thủ công.', 'warning');
            _scanning = false;
            if (callback) callback([]);
            return;
        }
        
        // Lấy subnet (VD: 192.168.1)
        var parts = localIP.split('.');
        var subnet = parts[0] + '.' + parts[1] + '.' + parts[2];
        
        showToast('🔄 IP thiết bị: ' + localIP + ', đang quét ' + subnet + '.1-254...', 'info');
        
        var found = [];
        var completed = 0;
        var total = 254;
        var timeout = 2000; // 2s mỗi IP
        
        for (var i = 1; i <= total; i++) {
            (function(ip) {
                var testIP = subnet + '.' + ip;
                var ws = new WebSocket('ws://' + testIP + ':' + PRINTER_PORT);
                var timer = setTimeout(function() {
                    try { ws.close(); } catch(e) {}
                    checkDone();
                }, timeout);
                
                ws.onopen = function() {
                    clearTimeout(timer);
                    found.push(testIP);
                    try { ws.close(); } catch(e) {}
                    checkDone();
                };
                ws.onerror = function() {
                    clearTimeout(timer);
                    checkDone();
                };
                
                function checkDone() {
                    completed++;
                    if (completed >= total) {
                        _scanning = false;
                        if (found.length > 0) {
                            showToast('✅ Tìm thấy ' + found.length + ' máy in!', 'success');
                        } else {
                            showToast('⚠️ Không tìm thấy máy in nào. Kiểm tra kết nối mạng.', 'warning');
                        }
                        if (callback) callback(found);
                    }
                }
            })(i);
        }
    });
}

// ========== HIỂN THỊ DANH SÁCH MÁY IN TÌM ĐƯỢC ==========
function showPrinterList(printers) {
    var container = document.getElementById('printerScanResult');
    if (!container) return;
    
    if (printers.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:8px;color:#94a3b8;font-size:12px;">' +
            '⚠️ Không tìm thấy máy in nào.<br>' +
            '<span style="font-size:11px;cursor:pointer;color:#f97316;" onclick="scanPrinters(showPrinterList)">🔄 Quét lại</span>' +
            '</div>';
        return;
    }
    
    var html = '<div style="font-size:11px;color:#475569;margin-bottom:4px;">✅ Máy in tìm thấy:</div>';
    for (var i = 0; i < printers.length; i++) {
        var ip = printers[i];
        var isActive = (PRINTER_IP === ip);
        html += '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;margin:2px 0;border-radius:6px;background:' +
            (isActive ? '#fef3c7' : '#f8fafc') + ';cursor:pointer;" onclick="selectPrinter(\'' + ip + '\')">' +
            '<span>🖨️</span>' +
            '<span style="flex:1;font-size:12px;font-weight:' + (isActive ? '600' : '400') + ';">' + ip + '</span>' +
            (isActive ? '<span style="font-size:10px;color:#f97316;font-weight:600;">✓ ĐANG DÙNG</span>' : '<span style="font-size:10px;color:#3b82f6;">Chọn</span>') +
            '</div>';
    }
    html += '<div style="text-align:center;margin-top:4px;">' +
        '<span style="font-size:10px;color:#94a3b8;cursor:pointer;" onclick="scanPrinters(showPrinterList)">🔄 Quét lại</span>' +
        '</div>';
    container.innerHTML = html;
}

// ========== CHỌN MÁY IN ==========
function selectPrinter(ip) {
    PRINTER_IP = ip;
    try { localStorage.setItem('printerIP', ip); } catch(e) {}
    showToast('✅ Đã chọn máy in: ' + ip, 'success');
    // Cập nhật UI
    var display = document.getElementById('selectedPrinterDisplay');
    if (display) display.textContent = '🖨️ ' + ip;
    // Cập nhật danh sách
    scanPrinters(showPrinterList);
}

// ========== NHẬP IP THỦ CÔNG ==========
function setPrinterIP(ip) {
    if (!ip) {
        ip = prompt('Nhập địa chỉ IP của máy in:', PRINTER_IP || '192.168.1.');
        if (!ip) return;
    }
    PRINTER_IP = ip;
    try { localStorage.setItem('printerIP', ip); } catch(e) {}
    showToast('✅ Đã đặt IP máy in: ' + ip, 'success');
    var display = document.getElementById('selectedPrinterDisplay');
    if (display) display.textContent = '🖨️ ' + ip;
}

// ========== CHỌN CHẾ ĐỘ IN ==========
function setPrintMode(mode) {
    PRINT_MODE = mode;
    // Cập nhật UI
    var btnBrowser = document.getElementById('printModeBrowser');
    var btnTcp = document.getElementById('printModeTcp');
    var btnSunmi = document.getElementById('printModeSunmi');
    var btnBt = document.getElementById('printModeBluetooth');
    if (btnBrowser) btnBrowser.className = mode === 'browser' ? 'print-mode-btn active' : 'print-mode-btn';
    if (btnTcp) btnTcp.className = mode === 'tcp' ? 'print-mode-btn active' : 'print-mode-btn';
    if (btnSunmi) btnSunmi.className = mode === 'sunmi' ? 'print-mode-btn active' : 'print-mode-btn';
    if (btnBt) btnBt.className = mode === 'bluetooth' ? 'print-mode-btn active' : 'print-mode-btn';
    // Hiện/ẩn phần cài đặt
    var tcpSettings = document.getElementById('tcpSettings');
    if (tcpSettings) tcpSettings.style.display = mode === 'tcp' ? 'block' : 'none';
    var sunmiSettings = document.getElementById('sunmiSettings');
    if (sunmiSettings) sunmiSettings.style.display = mode === 'sunmi' ? 'block' : 'none';
    var btSettings = document.getElementById('btSettings');
    if (btSettings) btSettings.style.display = mode === 'bluetooth' ? 'block' : 'none';
    // Nếu chuyển sang TCP và chưa có IP, tự động dò tìm
    if (mode === 'tcp' && !PRINTER_IP) {
        setTimeout(function() { scanPrinters(showPrinterList); }, 300);
    }
    // Nếu chuyển sang Sunmi, tự động kiểm tra service
    if (mode === 'sunmi') {
        setTimeout(function() { testSunmiService(); }, 300);
    }
    // Lưu vào localStorage
    try { localStorage.setItem('printMode', mode); } catch(e) {}
}

function loadPrintMode() {
    try {
        var saved = localStorage.getItem('printMode');
        if (saved) PRINT_MODE = saved;
        var savedIP = localStorage.getItem('printerIP');
        if (savedIP) PRINTER_IP = savedIP;
    } catch(e) {}
    // Cập nhật UI sau khi DOM load
    if (document.readyState === 'complete') {
        setPrintMode(PRINT_MODE);
        updatePrinterDisplay();
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            setPrintMode(PRINT_MODE);
            updatePrinterDisplay();
        });
    }
}

function updatePrinterDisplay() {
    var display = document.getElementById('selectedPrinterDisplay');
    if (display) {
        display.textContent = PRINTER_IP ? '🖨️ ' + PRINTER_IP : '🖨️ Chưa chọn máy in';
    }
}

// ========== TẠO NỘI DUNG HÓA ĐƠN HTML (cho chế độ browser) ==========
function buildReceiptHTML(data) {
    var methodText = '';
    switch (data.paymentMethod) {
        case 'cash': methodText = 'Tiền mặt'; break;
        case 'transfer': methodText = 'Chuyển khoản'; break;
        case 'debt': methodText = 'Ghi nợ'; break;
        case 'grab': methodText = 'Grab'; break;
        default: methodText = data.paymentMethod || '';
    }

    var now = data.createdAt ? new Date(data.createdAt) : new Date();
    var dateStr = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    var itemsHtml = '';
    if (data.items && data.items.length) {
        for (var i = 0; i < data.items.length; i++) {
            var item = data.items[i];
            var name = item.name || '';
            var qty = item.qty || 1;
            var price = item.price || 0;
            var total = price * qty;
            itemsHtml += '<tr><td style="padding:3px 0;">' + escapeHtml(name) + ' x' + qty + '</td><td style="padding:3px 0;text-align:right;">' + formatMoney(total) + '</td></tr>';
        }
    }

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Hóa đơn</title>' +
        '<style>' +
            '@page { margin: 0; size: 80mm auto; }' +
            'body { font-family: monospace; font-size: 12px; width: 72mm; margin: 0 auto; padding: 6px 4px; color: #000; }' +
            '.center { text-align: center; }' +
            '.bold { font-weight: bold; }' +
            '.big { font-size: 16px; }' +
            '.line { border-top: 1px dashed #000; margin: 5px 0; }' +
            'table { width: 100%; border-collapse: collapse; }' +
            '.total { font-size: 14px; font-weight: bold; text-align: center; margin: 6px 0; }' +
            '@media print { body { width: 72mm; } }' +
        '</style></head><body>' +
        '<div class="center big bold">' + (data.shopName || 'POS CAFE') + '</div>' +
        '<div class="center">HÓA ĐƠN THANH TOÁN</div>' +
        '<div class="line"></div>';

    if (data.tableName) {
        html += '<div>Bàn: ' + escapeHtml(data.tableName) + '</div>';
    }
    if (data.customerName) {
        html += '<div>Khách: ' + escapeHtml(data.customerName) + '</div>';
    }
    html += '<div>Ngày: ' + dateStr + '</div>' +
        '<div class="line"></div>' +
        '<table>' + itemsHtml + '</table>' +
        '<div class="line"></div>' +
        '<div class="total">TỔNG: ' + formatMoney(data.total || 0) + '</div>' +
        '<div class="center">PTTT: ' + methodText + '</div>' +
        '<div class="line"></div>' +
        '<div class="center">Cảm ơn quý khách!</div>' +
        '<div class="center">Hẹn gặp lại!</div>' +
        '</body></html>';

    return html;
}

// ========== IN QUA TRÌNH DUYỆT (window.print) ==========
function printViaBrowser(data) {
    var html = buildReceiptHTML(data);

    var iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    return new Promise(function(resolve) {
        setTimeout(function() {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch(e) {
                console.warn('Print error:', e);
            }
            setTimeout(function() {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                resolve(true);
            }, 1000);
        }, 500);
    });
}

// ========== TẠO NỘI DUNG HÓA ĐƠN ESC/POS (cho chế độ TCP) ==========
function buildReceiptESC(data) {
    var lines = [];
    
    // Initialize
    lines.push('\x1B\x40');
    // Center align
    lines.push('\x1B\x61\x01');
    // Double height + bold
    lines.push('\x1B\x21\x30');
    lines.push(data.shopName || 'POS CAFE');
    // Normal
    lines.push('\x1B\x21\x00');
    lines.push('');
    lines.push('HÓA ĐƠN THANH TOÁN');
    lines.push('');
    // Left align
    lines.push('\x1B\x61\x00');
    lines.push('================================');
    
    if (data.tableName) {
        lines.push('Ban: ' + data.tableName);
    }
    if (data.customerName) {
        lines.push('Khach: ' + data.customerName);
    }
    
    var now = data.createdAt ? new Date(data.createdAt) : new Date();
    var dateStr = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    lines.push('Ngay: ' + dateStr);
    lines.push('================================');
    lines.push('MON');
    lines.push('--------------------------------');
    
    if (data.items && data.items.length) {
        for (var i = 0; i < data.items.length; i++) {
            var item = data.items[i];
            var name = item.name || '';
            var qty = item.qty || 1;
            var price = item.price || 0;
            var total = price * qty;
            var line = name + ' x' + qty;
            var priceStr = formatMoney(total);
            var spaces = 32 - line.length - priceStr.length;
            if (spaces < 1) spaces = 1;
            for (var s = 0; s < spaces; s++) line += ' ';
            line += priceStr;
            lines.push(line);
        }
    }
    
    lines.push('================================');
    // Center + bold
    lines.push('\x1B\x61\x01');
    lines.push('\x1B\x21\x10');
    lines.push('TONG: ' + formatMoney(data.total || 0));
    lines.push('\x1B\x21\x00');
    
    var methodText = '';
    switch (data.paymentMethod) {
        case 'cash': methodText = 'Tien mat'; break;
        case 'transfer': methodText = 'Chuyen khoan'; break;
        case 'debt': methodText = 'Ghi no'; break;
        case 'grab': methodText = 'Grab'; break;
        default: methodText = data.paymentMethod || '';
    }
    lines.push('PTTT: ' + methodText);
    
    lines.push('');
    lines.push('Cam on quy khach!');
    lines.push('Hen gap lai!');
    lines.push('');
    lines.push('');
    lines.push('');
    lines.push('\x1B\x61\x00');
    // Cut paper
    lines.push('\x1D\x56\x00');
    
    return lines;
}

function escLinesToBytes(lines) {
    var bytes = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        for (var c = 0; c < line.length; c++) {
            bytes.push(line.charCodeAt(c));
        }
        // Thêm LF cho text, không thêm cho ESC/POS commands
        if (line.indexOf('\x1B') !== 0 && line.indexOf('\x1D') !== 0) {
            bytes.push(0x0A);
        }
    }
    return bytes;
}

// ========== IN QUA TCP (GỬI TRỰC TIẾP ĐẾN IP:PORT) ==========
function printViaTCP(data) {
    if (!PRINTER_IP) {
        showToast('⚠️ Chưa chọn máy in. Vào phần "In TCP" để dò tìm.', 'warning');
        return Promise.reject(new Error('No printer selected'));
    }
    
    var escLines = buildReceiptESC(data);
    var bytes = escLinesToBytes(escLines);
    
    return new Promise(function(resolve, reject) {
        // Thử gửi qua HTTP trực tiếp đến IP:9100
        var url = 'http://' + PRINTER_IP + ':' + PRINTER_PORT + '/';
        
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.timeout = 5000;
        
        // Gửi dữ liệu nhị phân
        var blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
        
        xhr.onload = function() {
            console.log('TCP print response:', xhr.status);
            resolve(true);
        };
        xhr.onerror = function() {
            console.warn('TCP print failed (HTTP), trying raw socket...');
            // Nếu HTTP không được, thử WebSocket
            printViaWebSocket(bytes).then(resolve).catch(function(err) {
                reject(err);
            });
        };
        xhr.ontimeout = function() {
            reject(new Error('Timeout'));
        };
        
        try {
            xhr.send(blob);
        } catch(e) {
            reject(e);
        }
    });
}

// ========== IN QUA WEBSOCKET (KẾT NỐI TCP QUA WEBSOCKET) ==========
function printViaWebSocket(bytes) {
    return new Promise(function(resolve, reject) {
        try {
            var ws = new WebSocket('ws://' + PRINTER_IP + ':' + PRINTER_PORT);
            ws.binaryType = 'arraybuffer';
            
            ws.onopen = function() {
                ws.send(new Uint8Array(bytes).buffer);
                setTimeout(function() {
                    ws.close();
                    resolve(true);
                }, 500);
            };
            ws.onerror = function(err) {
                reject(new Error('WebSocket connection failed'));
            };
            ws.ontimeout = function() {
                reject(new Error('WebSocket timeout'));
            };
        } catch(e) {
            reject(e);
        }
    });
}

// ========== IN QUA SUNMI BUILT-IN PRINT SERVICE (localhost:8001) ==========
// Sunmi T1-G có service HTTP chạy ở port 8001, nhận lệnh ESC/POS
function printViaSunmi(data) {
    var escLines = buildReceiptESC(data);
    var bytes = escLinesToBytes(escLines);
    
    return new Promise(function(resolve, reject) {
        // Cách 1: Gửi JSON theo format Sunmi Built-in Print Service
        // Format: {"data": "base64_encoded_esc_pos_data"}
        var base64Data = '';
        try {
            var binary = '';
            for (var i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            base64Data = btoa(binary);
        } catch(e) {
            reject(new Error('Base64 encode failed: ' + e.message));
            return;
        }
        
        var payload = JSON.stringify({
            data: base64Data
        });
        
        var xhr = new XMLHttpRequest();
        xhr.open('POST', SUNMI_SERVICE_URL + '/print', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.timeout = 10000;
        
        xhr.onload = function() {
            console.log('Sunmi print response:', xhr.status, xhr.responseText);
            if (xhr.status === 200) {
                resolve(true);
            } else {
                // Thử cách 2: gửi trực tiếp binary
                sendSunmiBinary(bytes).then(resolve).catch(reject);
            }
        };
        xhr.onerror = function() {
            // Thử cách 2: gửi trực tiếp binary
            sendSunmiBinary(bytes).then(resolve).catch(reject);
        };
        xhr.ontimeout = function() {
            reject(new Error('Sunmi service timeout'));
        };
        
        try {
            xhr.send(payload);
        } catch(e) {
            reject(e);
        }
    });
}

// Gửi binary trực tiếp đến Sunmi service
function sendSunmiBinary(bytes) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', SUNMI_SERVICE_URL + '/print', true);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.timeout = 10000;
        
        xhr.onload = function() {
            if (xhr.status === 200) {
                resolve(true);
            } else {
                reject(new Error('Sunmi binary failed: ' + xhr.status));
            }
        };
        xhr.onerror = function() {
            reject(new Error('Sunmi service not available'));
        };
        
        try {
            xhr.send(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }));
        } catch(e) {
            reject(e);
        }
    });
}

// ========== KIỂM TRA SUNMI PRINT SERVICE ==========
function testSunmiService() {
    showToast('🔄 Đang kiểm tra Sunmi Print Service...', 'info');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', SUNMI_SERVICE_URL, true);
    xhr.timeout = 3000;
    
    xhr.onload = function() {
        showToast('✅ Sunmi Print Service hoạt động! (HTTP ' + xhr.status + ')', 'success');
        var display = document.getElementById('sunmiStatus');
        if (display) {
            display.innerHTML = '<span style="color:#10b981;font-weight:600;">✅ Sunmi Print Service: ONLINE</span>';
        }
    };
    xhr.onerror = function() {
        showToast('⚠️ Sunmi Print Service không phản hồi tại ' + SUNMI_SERVICE_URL, 'warning');
        var display = document.getElementById('sunmiStatus');
        if (display) {
            display.innerHTML = '<span style="color:#ef4444;font-weight:600;">❌ Sunmi Print Service: OFFLINE</span>' +
                '<div style="font-size:10px;color:#94a3b8;margin-top:2px;">Thử mở http://localhost:8001 trên tab mới</div>';
        }
    };
    xhr.ontimeout = function() {
        showToast('⏱️ Sunmi Print Service timeout', 'warning');
        var display = document.getElementById('sunmiStatus');
        if (display) {
            display.innerHTML = '<span style="color:#ef4444;font-weight:600;">⏱️ Sunmi Print Service: TIMEOUT</span>';
        }
    };
    xhr.send();
}

// ========== IN QUA BLUETOOTH (WEB BLUETOOTH API) ==========
function connectBluetoothPrinter() {
    return new Promise(function(resolve, reject) {
        // Kiểm tra Web Bluetooth API
        if (!navigator.bluetooth) {
            reject(new Error('Web Bluetooth không được hỗ trợ trên trình duyệt này'));
            return;
        }
        
        showToast('🔄 Đang tìm máy in Bluetooth...', 'info');
        
        navigator.bluetooth.requestDevice({
            // Filter: tìm thiết bị có tên chứa "InnerPrinter" hoặc "Printer"
            filters: [
                { namePrefix: 'Inner' },
                { namePrefix: 'Printer' },
                { namePrefix: 'POS' },
                { namePrefix: 'Sunmi' }
            ],
            // Hoặc tìm tất cả thiết bị có service in ấn
            optionalServices: [
                '000018f0-0000-1000-8000-00805f9b34fb', // Standard printer service
                '00001812-0000-1000-8000-00805f9b34fb'  // Human Interface Device
            ]
        }).then(function(device) {
            _btDevice = device;
            showToast('✅ Đã kết nối: ' + (device.name || 'Unknown'), 'success');
            
            // Lưu device info
            try {
                localStorage.setItem('btPrinterName', device.name || '');
            } catch(e) {}
            
            var display = document.getElementById('btStatus');
            if (display) {
                display.innerHTML = '<span style="color:#10b981;font-weight:600;">✅ ' + escapeHtml(device.name || 'Unknown') + '</span>';
            }
            
            // Ngắt kết nối khi tab đóng
            device.addEventListener('gattserverdisconnected', function() {
                _btDevice = null;
                _btService = null;
                var d = document.getElementById('btStatus');
                if (d) d.innerHTML = '<span style="color:#94a3b8;">❌ Đã ngắt kết nối</span>';
            });
            
            resolve(device);
        }).catch(function(err) {
            showToast('⚠️ Lỗi Bluetooth: ' + err.message, 'warning');
            reject(err);
        });
    });
}

function printViaBluetooth(data) {
    var escLines = buildReceiptESC(data);
    var bytes = escLinesToBytes(escLines);
    
    return new Promise(function(resolve, reject) {
        if (!_btDevice) {
            // Chưa kết nối, yêu cầu kết nối trước
            connectBluetoothPrinter().then(function(device) {
                // Kết nối GATT server
                return device.gatt.connect();
            }).then(function(server) {
                // Tìm service in ấn
                return server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
            }).then(function(service) {
                _btService = service;
                // Tìm characteristic để ghi dữ liệu
                return service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
            }).then(function(characteristic) {
                // Ghi dữ liệu ESC/POS
                return characteristic.writeValue(new Uint8Array(bytes));
            }).then(function() {
                showToast('🖨️ Đã in qua Bluetooth', 'success');
                resolve(true);
            }).catch(function(err) {
                reject(err);
            });
        } else {
            // Đã kết nối, gửi trực tiếp
            if (_btDevice.gatt.connected) {
                _btDevice.gatt.connect().then(function(server) {
                    return server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
                }).then(function(service) {
                    return service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
                }).then(function(characteristic) {
                    return characteristic.writeValue(new Uint8Array(bytes));
                }).then(function() {
                    showToast('🖨️ Đã in qua Bluetooth', 'success');
                    resolve(true);
                }).catch(function(err) {
                    reject(err);
                });
            } else {
                reject(new Error('Bluetooth disconnected'));
            }
        }
    });
}

function disconnectBluetooth() {
    if (_btDevice && _btDevice.gatt.connected) {
        _btDevice.gatt.disconnect();
        _btDevice = null;
        _btService = null;
        showToast('✅ Đã ngắt kết nối Bluetooth', 'info');
        var display = document.getElementById('btStatus');
        if (display) display.innerHTML = '<span style="color:#94a3b8;">Chưa kết nối</span>';
    }
}

// ========== IN HÓA ĐƠN (TỰ ĐỘNG CHỌN CHẾ ĐỘ) ==========
function printReceipt(data) {
    if (PRINT_MODE === 'tcp') {
        return printViaTCP(data).then(function() {
            showToast('🖨️ Đã in hóa đơn qua mạng', 'success');
            return true;
        }).catch(function(err) {
            console.warn('TCP print failed:', err.message);
            showToast('⚠️ In TCP thất bại, thử in qua trình duyệt', 'warning');
            // Fallback sang browser
            return printViaBrowser(data).then(function() {
                showToast('🖨️ Đã in hóa đơn', 'success');
                return true;
            });
        });
    } else if (PRINT_MODE === 'sunmi') {
        return printViaSunmi(data).then(function() {
            showToast('🖨️ Đã in hóa đơn qua Sunmi', 'success');
            return true;
        }).catch(function(err) {
            console.warn('Sunmi print failed:', err.message);
            showToast('⚠️ In Sunmi thất bại, thử in qua trình duyệt', 'warning');
            // Fallback sang browser
            return printViaBrowser(data).then(function() {
                showToast('🖨️ Đã in hóa đơn', 'success');
                return true;
            });
        });
    } else if (PRINT_MODE === 'bluetooth') {
        return printViaBluetooth(data).then(function() {
            showToast('🖨️ Đã in hóa đơn qua Bluetooth', 'success');
            return true;
        }).catch(function(err) {
            console.warn('Bluetooth print failed:', err.message);
            showToast('⚠️ In Bluetooth thất bại, thử in qua trình duyệt', 'warning');
            // Fallback sang browser
            return printViaBrowser(data).then(function() {
                showToast('🖨️ Đã in hóa đơn', 'success');
                return true;
            });
        });
    } else {
        return printViaBrowser(data).then(function() {
            showToast('🖨️ Đã in hóa đơn', 'success');
            return true;
        });
    }
}

// ========== HÀM TIỆN ÍCH: IN SAU KHI THANH TOÁN ==========
function printAfterPayment(paymentData) {
    var printData = {
        shopName: 'POS CAFE',
        tableName: paymentData.tableName || null,
        customerName: paymentData.customer ? (paymentData.customer.name || null) : null,
        items: paymentData.items || [],
        total: paymentData.amount || 0,
        paymentMethod: paymentData.paymentMethod || 'cash',
        createdAt: paymentData.createdAt || new Date().toISOString()
    };

    printReceipt(printData);
}

// ========== KIỂM TRA KẾT NỐI TCP ==========
function testTCPConnection() {
    if (!PRINTER_IP) {
        showToast('⚠️ Chưa chọn máy in. Hãy dò tìm trước.', 'warning');
        return;
    }
    showToast('🔄 Đang kiểm tra kết nối máy in ' + PRINTER_IP + '...', 'info');
    var url = 'http://' + PRINTER_IP + ':' + PRINTER_PORT + '/';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 3000;
    xhr.onload = function() {
        showToast('✅ Kết nối TCP thành công (HTTP status: ' + xhr.status + ')', 'success');
    };
    xhr.onerror = function() {
        // Thử WebSocket
        try {
            var ws = new WebSocket('ws://' + PRINTER_IP + ':' + PRINTER_PORT);
            ws.onopen = function() {
                showToast('✅ Kết nối WebSocket thành công đến ' + PRINTER_IP, 'success');
                ws.close();
            };
            ws.onerror = function() {
                showToast('⚠️ Không thể kết nối đến ' + PRINTER_IP + ':' + PRINTER_PORT + '.', 'warning');
            };
        } catch(e) {
            showToast('❌ Lỗi kết nối: ' + e.message, 'error');
        }
    };
    xhr.ontimeout = function() {
        showToast('⏱️ Timeout kết nối đến ' + PRINTER_IP + ':' + PRINTER_PORT, 'warning');
    };
    xhr.send();
}

// Khởi tạo chế độ in
loadPrintMode();

// Export global
window.printReceipt = printReceipt;
window.printAfterPayment = printAfterPayment;
window.setPrintMode = setPrintMode;
window.testTCPConnection = testTCPConnection;
window.testSunmiService = testSunmiService;
window.connectBluetoothPrinter = connectBluetoothPrinter;
window.disconnectBluetooth = disconnectBluetooth;
window.scanPrinters = scanPrinters;
window.showPrinterList = showPrinterList;
window.selectPrinter = selectPrinter;
window.setPrinterIP = setPrinterIP;
