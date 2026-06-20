// ========== sync-to-firebase.js - Đồng bộ 1 lần từ IndexedDB lên Firebase ==========
// File này sẽ xóa sau khi dùng 1 lần
(function() {
    'use strict';

    var firebaseConfig = {
        apiKey: "AIzaSyCQFIzj8m3kpsE_x354xxJ8MTAuRG9eCx4",
        authDomain: "posmilano.firebaseapp.com",
        projectId: "posmilano",
        databaseURL: "https://posmilano-default-rtdb.firebaseio.com",
        storageBucket: "posmilano.firebasestorage.app",
        messagingSenderId: "34185947554",
        appId: "1:34185947554:web:925f29864d3b17b8d46afb",
        measurementId: "G-J3MX8EL1C8"
    };

    // Danh sách object stores trong IndexedDB (giống db.js)
    var ALL_STORES = [
        'tables', 'customers', 'menu', 'menu_categories',
        'ingredients', 'transactions', 'reports', 'sync_queue', 'staffs',
        'cost_categories', 'cost_transactions', 'cost_transactions_admin',
        'admin_cost_categories', 'daily_balances',
        'inventory_transactions', 'manager_cash_pickups',
        'ingredient_transactions', 'notifications',
        'info',
        'messages'
    ];

    // Các store BỎ QUA (ko đồng bộ)
    var SKIP_STORES = ['sync_queue'];

    var DB_NAME = 'pos_data';
    var DB_VERSION = 18;

    var logEl = null;
    var btnEl = null;
    var statusEl = null;

    function initUI() {
        logEl = document.getElementById('syncLog');
        btnEl = document.getElementById('syncBtn');
        statusEl = document.getElementById('syncStatus');
    }

    function log(msg, isError) {
        if (!logEl) return;
        var div = document.createElement('div');
        div.className = 'log-line' + (isError ? ' log-error' : '');
        div.textContent = msg;
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight;
        console.log(msg);
    }

    function setStatus(text, isError) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = 'sync-status' + (isError ? ' status-error' : '');
    }

    function setButtonEnabled(enabled) {
        if (!btnEl) return;
        btnEl.disabled = !enabled;
        btnEl.textContent = enabled ? '🚀 BẮT ĐẦU ĐỒNG BỘ' : '⏳ ĐANG ĐỒNG BỘ...';
    }

    // Mở IndexedDB
    function openDB() {
        return new Promise(function(resolve, reject) {
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = function(e) {
                reject(new Error('Không thể mở IndexedDB: ' + e.target.error));
            };
            request.onsuccess = function(e) {
                resolve(e.target.result);
            };
            request.onupgradeneeded = function(e) {
                // Chỉ mở, không tạo mới
                var db = e.target.result;
                log('DB version: ' + e.oldVersion + ' -> ' + e.newVersion);
            };
        });
    }

    // Đọc tất cả items từ 1 object store
    function readAllFromStore(db, storeName) {
        return new Promise(function(resolve, reject) {
            try {
                if (!db.objectStoreNames.contains(storeName)) {
                    resolve([]);
                    return;
                }
                var tx = db.transaction([storeName], 'readonly');
                var store = tx.objectStore(storeName);
                var req = store.getAll();
                req.onsuccess = function() {
                    resolve(req.result || []);
                };
                req.onerror = function() {
                    reject(new Error('Lỗi đọc store ' + storeName + ': ' + req.error));
                };
            } catch (err) {
                reject(new Error('Lỗi truy cập store ' + storeName + ': ' + err.message));
            }
        });
    }

    // Helper: tính dateKey theo local time (+7) - copy từ db.js
    function toLocalDateKey(value) {
        if (!value) return '';
        var d;
        if (typeof value === 'string') {
            if (value.length >= 10 && value[4] === '-' && value[7] === '-') return value.slice(0, 10);
            var parsed = Date.parse(value);
            if (isNaN(parsed)) return '';
            d = new Date(parsed);
        } else if (typeof value === 'number') {
            d = new Date(value);
        } else {
            return '';
        }
        var y = d.getFullYear();
        var m = ('0' + (d.getMonth() + 1)).slice(-2);
        var day = ('0' + d.getDate()).slice(-2);
        return y + '-' + m + '-' + day;
    }

    // FIX: Tính lại dateKey/dateTypeKey theo local time trước khi đồng bộ
    // Dữ liệu cũ trong IndexedDB có thể có dateKey sai (do dùng UTC trước đây)
    function normalizeTransactionForSync(data) {
        if (!data || typeof data !== 'object') return data;
        var norm = {};
        for (var k in data) if (data.hasOwnProperty(k)) norm[k] = data[k];
        // Tính lại dateKey từ createdAt/date theo local time
        var dateKey = toLocalDateKey(norm.date || norm.createdAt || norm.updatedAt);
        norm.dateKey = dateKey;
        norm.type = norm.type || 'unknown';
        norm.dateTypeKey = dateKey + '|' + norm.type;
        return norm;
    }

    // Ghi dữ liệu lên Firebase
    function syncToFirebase(shopId, storeName, items) {
        if (!items || items.length === 0) {
            log('  ⏭ ' + storeName + ': không có dữ liệu');
            return Promise.resolve(0);
        }

        var db = firebase.database();
        var count = 0;

        if (storeName === 'info') {
            // Collection 'info' - gộp tất cả items thành 1 object, ghi vào /{shopId}/info
            var infoData = {};
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                for (var k in item) {
                    if (item.hasOwnProperty(k) && k !== 'id') {
                        infoData[k] = item[k];
                    }
                }
            }
            // Đảm bảo có id
            infoData.id = 'shop_config';

            return db.ref(shopId + '/info').set(infoData).then(function() {
                log('  ✅ info: 1 object (' + Object.keys(infoData).length + ' keys)');
                return 1;
            }).catch(function(err) {
                log('  ❌ info: ' + err.message, true);
                throw err;
            });
        } else {
            // Các collection khác - ghi từng item vào /{shopId}/{collection}/{item.id}
            var chain = Promise.resolve();
            var errors = [];

            for (var i = 0; i < items.length; i++) {
                (function(itemData) {
                    chain = chain.then(function() {
                        var id = itemData.id;
                        if (!id) {
                            log('  ⚠️ ' + storeName + ': item bỏ qua do thiếu id', true);
                            return Promise.resolve();
                        }
                        // FIX: Tính lại dateKey cho transactions theo local time
                        var cleanData = (storeName === 'transactions')
                            ? normalizeTransactionForSync(itemData)
                            : (function() {
                                var c = {};
                                for (var k in itemData) {
                                    if (itemData.hasOwnProperty(k)) c[k] = itemData[k];
                                }
                                return c;
                            })();
                        return db.ref(shopId + '/' + storeName + '/' + id).set(cleanData).then(function() {
                            count++;
                        }).catch(function(err) {
                            errors.push({ id: id, err: err.message });
                            log('  ⚠️ ' + storeName + '/' + id + ': ' + err.message, true);
                        });
                    });
                })(items[i]);
            }

            return chain.then(function() {
                if (errors.length > 0) {
                    log('  ⚠️ ' + storeName + ': ' + count + '/' + items.length + ' items synced (' + errors.length + ' lỗi)');
                } else {
                    log('  ✅ ' + storeName + ': ' + count + '/' + items.length + ' items');
                }
                return count;
            });
        }
    }

    // Hàm đồng bộ chính
    function startSync() {
        if (!btnEl) initUI();

        setButtonEnabled(false);
        logEl.innerHTML = ''; // Xóa log cũ
        setStatus('🔄 Đang khởi tạo...');

        var shopId = localStorage.getItem('current_shop_id') || 'shop_default';
        log('🔍 Shop ID: ' + shopId);
        log('🔍 DB Name: ' + DB_NAME);
        log('');

        // Khởi tạo Firebase nếu chưa có
        if (!firebase.apps.length) {
            try {
                firebase.initializeApp(firebaseConfig);
                log('✅ Firebase initialized');
            } catch (err) {
                log('❌ Firebase init error: ' + err.message, true);
                setStatus('❌ Lỗi khởi tạo Firebase', true);
                setButtonEnabled(true);
                return;
            }
        } else {
            log('✅ Firebase already initialized');
        }

        var db = firebase.database();
        log('');

        // Mở IndexedDB
        openDB().then(function(indexedDB) {
            log('✅ IndexedDB opened: ' + DB_NAME);
            log('');

            var totalItems = 0;
            var totalStores = 0;
            var chain = Promise.resolve();

            // Lặp qua từng store
            for (var s = 0; s < ALL_STORES.length; s++) {
                var storeName = ALL_STORES[s];

                // Bỏ qua các store không cần đồng bộ
                if (SKIP_STORES.indexOf(storeName) !== -1) {
                    chain = chain.then(function(name) {
                        return function() {
                            log('  ⏭ ' + name + ': bỏ qua');
                        };
                    }(storeName));
                    continue;
                }

                chain = chain.then(function(name) {
                    return function() {
                        setStatus('🔄 Đang đồng bộ ' + name + '...');
                        return readAllFromStore(indexedDB, name).then(function(items) {
                            return syncToFirebase(shopId, name, items).then(function(count) {
                                totalItems += count;
                                if (count > 0) totalStores++;
                            });
                        });
                    };
                }(storeName));
            }

            return chain.then(function() {
                // Đóng IndexedDB
                indexedDB.close();
                log('');
                log('========================================');
                log('🎉 ĐỒNG BỘ HOÀN TẤT!');
                log('📊 Tổng: ' + totalItems + ' items từ ' + totalStores + ' collections');
                log('========================================');
                log('');
                log('💡 Bạn có thể đóng tab này.');
                log('💡 Sau đó xóa file sync-to-firebase.js để dọn dẹp.');
                setStatus('✅ Hoàn tất! ' + totalItems + ' items đã đồng bộ.');
                setButtonEnabled(true);
            }).catch(function(err) {
                log('');
                log('❌ LỖI: ' + err.message, true);
                setStatus('❌ Đồng bộ thất bại: ' + err.message, true);
                setButtonEnabled(true);
            });
        }).catch(function(err) {
            log('❌ Lỗi mở IndexedDB: ' + err.message, true);
            setStatus('❌ Lỗi mở IndexedDB', true);
            setButtonEnabled(true);
        });
    }

    // Expose ra global
    window.startSync = startSync;
    window.initSyncUI = initUI;

})();
