// [Comment removed - encoding error]
(function() {
    // Polyfill CustomEvent
    if (typeof window.CustomEvent !== "function") {
        window.CustomEvent = function(event, params) {
            params = params || { bubbles: false, cancelable: false, detail: undefined };
            var evt = document.createEvent('CustomEvent');
            evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
            return evt;
        };
        window.CustomEvent.prototype = window.Event.prototype;
    }

    // ========== MASTER-SLAVE FIREBASE CONFIG ==========
    // [Comment removed - encoding error]
    var MASTER_CONFIG = {
        apiKey: "AIzaSyCQFIzj8m3kpsE_x354xxJ8MTAuRG9eCx4",
        authDomain: "posmilano.firebaseapp.com",
        projectId: "posmilano",
        databaseURL: "https://posmilano-default-rtdb.firebaseio.com",
        storageBucket: "posmilano.firebasestorage.app",
        messagingSenderId: "34185947554",
        appId: "1:34185947554:web:925f29864d3b17b8d46afb",
        measurementId: "G-J3MX8EL1C8"
    };
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    var masterApp, masterDb, auth;
    try {
        // Th? t?o DEFAULT app tru?c
        firebase.initializeApp(MASTER_CONFIG);
        masterApp = firebase.app(); // DEFAULT app
        masterDb = masterApp.database();
        auth = firebase.auth();
    } catch(e) {
        // [Comment removed - encoding error]
        masterApp = firebase.app();
        masterDb = masterApp.database();
        auth = firebase.auth();
    }
    
    // [Comment removed - encoding error]
    var slaveApp = null;
    var slaveDb = null;
    var slaveConfig = null;
    
    // [Comment removed - encoding error]
    var db = masterDb;
    
    // [Comment removed - encoding error]
    var MASTER_ONLY_COLLECTIONS = {
        staffs: true,
        shop_registry: true,
        firebase_config: true,
        master_admins: true
    };
    
    // [Comment removed - encoding error]
    function _getDb(collection) {
        if (MASTER_ONLY_COLLECTIONS[collection]) return masterDb;
        return slaveDb || masterDb; // [Comment removed - encoding error]
    }
    
    // Helper: kh?i t?o/h?y Slave Firebase App
    function _initSlaveApp(shopId, fbConfig) {
        var appName = 'slave_' + shopId;
        
        // [Comment removed - encoding error]
        var chain = Promise.resolve();
        
        // [Comment removed - encoding error]
        if (slaveApp) {
            chain = chain.then(function() {
                var _oldApp = slaveApp;
                slaveApp = null;
                slaveDb = null;
                slaveConfig = null;
                try {
                    return _oldApp.delete();
                } catch(e) {
                    return Promise.resolve();
                }
            });
        }
        
        // [Comment removed - encoding error]
        chain = chain.then(function() {
            try {
                var existing = firebase.app(appName);
                if (existing) {
                    try { return existing.delete(); } catch(e) { return Promise.resolve(); }
                }
            } catch(e) {
                // App chua t?n t?i
            }
            return Promise.resolve();
        });
        
        // Bu?c 3: Kh?i t?o Slave App m?i
        chain = chain.then(function() {
            try {
                slaveApp = firebase.initializeApp(fbConfig, appName);
                slaveDb = slaveApp.database();
                slaveConfig = fbConfig;
            } catch(e) {
                console.error('[db.js] L?i kh?i t?o Slave Firebase:', e);
                throw e;
            }
        });
        
        return chain;
    }
    
    // Helper: hu? t?t c? Firebase listeners
    function _destroyAllListeners() {
        for (var collection in listeners) {
            if (listeners.hasOwnProperty(collection)) {
                var ref = _getDb(collection).ref(CURRENT_SHOP_ID + '/' + collection);
                var colListeners = listeners[collection];
                for (var i = 0; i < colListeners.length; i++) {
                    var l = colListeners[i];
                    if (l.value) ref.off('value', l.value);
                    if (l.child_added) ref.off('child_added', l.child_added);
                    if (l.child_changed) ref.off('child_changed', l.child_changed);
                    if (l.child_removed) ref.off('child_removed', l.child_removed);
                }
            }
        }
        listeners = {};
    }
    
    // [Comment removed - encoding error]
    var CONFIG_HASH_KEY = 'pos_firebase_config_hash';
    function _getConfigHash(fbConfig) {
        if (!fbConfig) return 'master';
        return fbConfig.databaseURL || fbConfig.apiKey || 'custom';
    }

    // Helper: di chuy?n d? li?u t? Master DB sang Slave DB khi d?i Firebase config
    // [Comment removed - encoding error]
        // Helper: di chuy?n d? li?u t? Master DB sang Slave DB khi d?i Firebase config
    // [Comment removed - encoding error]
    function _migrateData(shopId, oldDb, newDb) {
        var collections = [];
        for (var c in MASTER_COLLECTIONS) {
            if (MASTER_COLLECTIONS.hasOwnProperty(c) && !MASTER_ONLY_COLLECTIONS[c]) {
                collections.push(c);
            }
        }
        for (var c in DATE_BASED_COLLECTIONS) {
            if (DATE_BASED_COLLECTIONS.hasOwnProperty(c)) {
                collections.push(c);
            }
        }
        // [Comment removed - encoding error]
        collections.push('messages');
        collections.push('admin_cost_categories');
        collections.push('cost_transactions_admin');

        var migratedCount = 0;

        // [Comment removed - encoding error]
        // [Comment removed - encoding error]
        var promises = collections.map(function(collection) {
            return oldDb.ref(shopId + '/' + collection).once('value').then(function(snapshot) {
                if (!snapshot.exists()) return;
                var data = snapshot.val();
                var updates = {};
                for (var key in data) {
                    if (data.hasOwnProperty(key)) {
                        updates[key] = data[key];
                    }
                }
                if (Object.keys(updates).length > 0) {
                    return newDb.ref(shopId + '/' + collection).update(updates).then(function() {
                        migratedCount++;
                        console.log('  ?? Migrated', collection, ':', Object.keys(updates).length, 'items');
                    });
                }
            }).catch(function(err) {
                console.warn('  ?? Migration warning for', collection, ':', err.message);
            });
        });

        return Promise.all(promises).then(function() {
            console.log('? Migration completed:', migratedCount, 'collections migrated');
            return migratedCount;
        });
    }// Constants
    var STORE_NAME = 'pos_data';
    
    // Biến lưu thông tin user hiện tại
    var currentUser = null;
    // Đọc session từ localStorage nếu có
    var savedSession = localStorage.getItem('pos_session');
    if (savedSession) {
        try { currentUser = JSON.parse(savedSession); } catch(e) { localStorage.removeItem('pos_session'); }
    }
    
    // Đọc shopId từ localStorage, mặc định 'shop_default' nếu chưa có
    // FIX: Nếu current_shop_id không có trong localStorage (do xóa browser DB)
    // nhưng pos_session vẫn còn, khôi phục shopId từ session
    var CURRENT_SHOP_ID = localStorage.getItem('current_shop_id');
    if (!CURRENT_SHOP_ID) {
        if (currentUser && currentUser.shopId) {
            CURRENT_SHOP_ID = currentUser.shopId;
            localStorage.setItem('current_shop_id', CURRENT_SHOP_ID);
        } else {
            CURRENT_SHOP_ID = 'shop_default';
        }
    }
    // [Comment removed - encoding error]
    var _slaveInitPromise = null;
    // [Comment removed - encoding error]
    // Khi F5/reload, session du?c restore t? localStorage nhung slaveApp/slaveDb = null
    // [Comment removed - encoding error]
    if (currentUser && currentUser.hasCustomConfig && currentUser.shopId && currentUser.shopId !== 'master') {
        var _shopId = currentUser.shopId;
        // FIX: Đọc firebaseConfig từ shop_registry (nơi Admin Master lưu)
        // [Comment removed - encoding error]
        _slaveInitPromise = masterDb.ref('shop_registry/' + currentUser.shopCode).once('value').then(function(registrySnap) {
            var registryData = registrySnap.val() || {};
            var fbConfig = registryData.firebaseConfig || null;
            
            // [Comment removed - encoding error]
            if (!fbConfig) {
                return masterDb.ref('firebase_config/' + _shopId).once('value').then(function(configSnapshot) {
                    return configSnapshot.val() || null;
                });
            }
            return fbConfig;
        }).then(function(fbConfig) {
            if (fbConfig) {
                console.log('[db.js] Khoi phuc Slave Firebase cho', _shopId);
                return _initSlaveApp(_shopId, fbConfig).then(function() {
                    var newHash = _getConfigHash(fbConfig);
                    localStorage.setItem(CONFIG_HASH_KEY, newHash);
                    console.log('[db.js] Da khoi phuc Slave Firebase:', fbConfig.databaseURL);
                });
            } else {
                console.warn('[db.js] User co hasCustomConfig=true nhung khong tim thay firebaseConfig cho', _shopId);
                // [Comment removed - encoding error]
                currentUser.hasCustomConfig = false;
                localStorage.setItem('pos_session', JSON.stringify(currentUser));
            }
        }).catch(function(err) {
            console.error('[db.js] Loi khoi phuc Slave Firebase:', err);
        });
    }
    
    var CURRENT_DEVICE_ID = localStorage.getItem('device_id') || ('device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
    localStorage.setItem('device_id', CURRENT_DEVICE_ID);

    var localDB = null;
    var dbReady = null;
    var syncQueue = [];
    var isOnline = navigator.onLine;
    var listeners = {};
    
    // ========== SYNC META ==========
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    var SYNC_META_STORE = 'sync_meta';
    var syncMetaCache = {}; // memory cache cho sync_meta
    
    // [Comment removed - encoding error]
    var THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    
    // [Comment removed - encoding error]
    var DATE_BASED_COLLECTIONS = {
        transactions: true,
        daily_balances: true,
        cost_transactions: true,
        inventory_transactions: true,
        ingredient_transactions: true,
        manager_cash_pickups: true,
        employee_attendance: true,
        employee_salaries: true,
        delete_logs: true,
        drawer_sessions: true,
        notifications: true
    };
    
    // [Comment removed - encoding error]
    var MASTER_COLLECTIONS = {
        tables: true,
        customers: true,
        menu: true,
        menu_categories: true,
        ingredients: true,
        staffs: true,
        cost_categories: true,
        info: true,
        messages: true
    };
    
    // OPTIMIZE: Debounce processSyncQueue - tránh gọi sync sau mỗi DB.update riêng lẻ
    var _syncTimer = null;
    var _syncPending = false;
    function _debouncedProcessSyncQueue() {
        if (_syncPending) return;
        _syncPending = true;
        if (_syncTimer) clearTimeout(_syncTimer);
        _syncTimer = setTimeout(function() {
            _syncTimer = null;
            _syncPending = false;
            processSyncQueue();
        }, 100);
    }
    
    // OPTIMIZE: Memory cache layer - tránh đọc IndexedDB liên tục
    var memoryCache = {};
    var cacheVersion = {};
    
    // FIX: Local callbacks - notify UI ngay sau khi ghi local, không chờ Firebase
    var _localCallbacks = {};
    
    // NÂNG CẤP: Event Bus - Reactive Layer Giai đoạn 1
    // Cho phép UI subscribe vào các sự kiện cụ thể thay vì nhận toàn bộ collection
    // Event types: 'collection:added', 'collection:changed', 'collection:removed'
    // Ví dụ: 'tables:added', 'tables:changed', 'tables:removed'
    var _eventBus = {};
    
    // Đăng ký listener cho một event type
    function _on(eventType, callback) {
        if (!_eventBus[eventType]) _eventBus[eventType] = [];
        _eventBus[eventType].push(callback);
        return function() {
            _off(eventType, callback);
        };
    }
    
    // Hủy đăng ký listener
    function _off(eventType, callback) {
        var cbs = _eventBus[eventType];
        if (!cbs) return;
        for (var i = cbs.length - 1; i >= 0; i--) {
            if (cbs[i] === callback) {
                cbs.splice(i, 1);
            }
        }
    }
    
    // Phát sự kiện - gọi tất cả listeners đã đăng ký
    function _emit(eventType, data) {
        var cbs = _eventBus[eventType];
        if (cbs) {
            for (var i = 0; i < cbs.length; i++) {
                try { cbs[i](data); } catch(e) { console.error('[EventBus] Lỗi handler ' + eventType + ':', e); }
            }
        }
        // Wildcard listener: 'collection:*' nhận tất cả events của collection đó
        var parts = eventType.split(':');
        if (parts.length === 2) {
            var wildcard = parts[0] + ':*';
            var wildcardCbs = _eventBus[wildcard];
            if (wildcardCbs) {
                for (var i = 0; i < wildcardCbs.length; i++) {
                    try { wildcardCbs[i]({ type: parts[1], collection: parts[0], data: data }); } catch(e) { console.error('[EventBus] Lỗi wildcard handler ' + wildcard + ':', e); }
                }
            }
        }
    }
    
    // OPTIMIZE: Cơ chế suppress realtime notifications khi batch operations
    // Khi _suppressRealtime > 0, _notifyLocal sẽ không gọi callbacks
    // Dùng cho thanh toán, nhập hàng loạt, etc.
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    var _componentRegistry = {};  // { collection: [ { id, selector, renderFn, lastData } ] }
    var _componentIdCounter = 0;

    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    //   - function(oldData, newData): return true n?u c?n render l?i
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    function _renderOn(collection, selector, renderFn) {
        if (!_componentRegistry[collection]) {
            _componentRegistry[collection] = [];
        }
        var id = ++_componentIdCounter;
        var entry = {
            id: id,
            selector: typeof selector === 'function' ? selector : null,
            renderFn: renderFn,
            lastData: null
        };
        _componentRegistry[collection].push(entry);
        // G?i render ngay l?p t?c v?i d? li?u hi?n t?i
        if (memoryCache[collection]) {
            var data = [];
            for (var key in memoryCache[collection]) {
                if (memoryCache[collection].hasOwnProperty(key)) {
                    data.push(memoryCache[collection][key]);
                }
            }
            entry.lastData = data;
            try { renderFn(data); } catch(e) { console.error('[ComponentRegistry] L?i render l?n d?u:', e); }
        }
        // [Comment removed - encoding error]
        return function() {
            var entries = _componentRegistry[collection];
            if (!entries) return;
            for (var i = entries.length - 1; i >= 0; i--) {
                if (entries[i].id === id) {
                    entries.splice(i, 1);
                    break;
                }
            }
        };
    }

    // [Comment removed - encoding error]
    function _notifyComponents(collection, changeInfo) {
        var entries = _componentRegistry[collection];
        if (!entries || entries.length === 0) return;
        var newData = null;
        if (memoryCache[collection]) {
            newData = [];
            for (var key in memoryCache[collection]) {
                if (memoryCache[collection].hasOwnProperty(key)) {
                    newData.push(memoryCache[collection][key]);
                }
            }
        }
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var shouldRender = true;
            if (entry.selector) {
                try {
                    shouldRender = entry.selector(entry.lastData, newData, changeInfo);
                } catch(e) {
                    console.error('[ComponentRegistry] L?i selector:', e);
                    shouldRender = true;
                }
            }
            if (shouldRender) {
                entry.lastData = newData;
                try { entry.renderFn(newData, changeInfo); } catch(e) {
                    console.error('[ComponentRegistry] L?i render:', e);
                }
            }
        }
    }

    var _suppressRealtime = 0;
    var _pendingNotifyCollections = {};

    // Helper: toDateKey - dùng giờ địa phương (getFullYear/getMonth/getDate) thay vì UTC
    function toDateKey(value) {
        if (!value) return '';
        if (typeof value === 'string') {
            // [Comment removed - encoding error]
            if (value.indexOf('T') >= 0 || value.indexOf('Z') >= 0 || value.indexOf('+') >= 0) {
                var parsed = Date.parse(value);
                if (!isNaN(parsed)) {
                    var d = new Date(parsed);
                    var y = d.getFullYear();
                    var m = ('0' + (d.getMonth() + 1)).slice(-2);
                    var day = ('0' + d.getDate()).slice(-2);
                    return y + '-' + m + '-' + day;
                }
            }
            // [Comment removed - encoding error]
            if (value.length >= 10 && value[4] === '-' && value[7] === '-') return value.slice(0, 10);
            var parsed = Date.parse(value);
            if (!isNaN(parsed)) {
                var d = new Date(parsed);
                var y = d.getFullYear();
                var m = ('0' + (d.getMonth() + 1)).slice(-2);
                var day = ('0' + d.getDate()).slice(-2);
                return y + '-' + m + '-' + day;
            }
            return '';
        }
        if (typeof value === 'number') {
            var d = new Date(value);
            var y = d.getFullYear();
            var m = ('0' + (d.getMonth() + 1)).slice(-2);
            var day = ('0' + d.getDate()).slice(-2);
            return y + '-' + m + '-' + day;
        }
        return '';
    }

    function normalizeIndexedFields(collection, data) {
        if (!data || typeof data !== 'object') return data;
        if (collection !== 'transactions') return data;
        var norm = {};
        for (var k in data) if (data.hasOwnProperty(k)) norm[k] = data[k];
        var dateKey = toDateKey(norm.date || norm.createdAt || norm.updatedAt);
        norm.dateKey = dateKey;
        norm.type = norm.type || 'unknown';
        norm.dateTypeKey = dateKey + '|' + norm.type;
        return norm;
    }

    // FIX: Notify local subscribers ngay lập tức từ memoryCache
    // OPTIMIZE: Callback nhận full data array (tương thích ngược)
    // Ngoài ra, changeInfo được lưu vào _lastChangeInfo để UI có thể dùng nếu cần
    var _lastChangeInfo = {};
    function _notifyLocal(collection, changeInfo) {
        // OPTIMIZE: Nếu đang suppress, ghi nhận collection cần notify sau
        if (_suppressRealtime > 0) {
            _pendingNotifyCollections[collection] = true;
            return;
        }
        // NÂNG CẤP: Phát sự kiện Event Bus trước, sau đó mới gọi callbacks cũ
        // Đảm bảo UI nhận được changeInfo chi tiết
        if (changeInfo && changeInfo.type) {
            var eventType = collection + ':' + changeInfo.type;
            _emit(eventType, {
                collection: collection,
                type: changeInfo.type,
                item: changeInfo.item || null,
                timestamp: Date.now()
            });
        }
        
        // [Comment removed - encoding error]
        _notifyComponents(collection, changeInfo);
        
        var cbs = _localCallbacks[collection];
        if (!cbs || cbs.length === 0) return;
        var data = [];
        if (memoryCache[collection]) {
            for (var key in memoryCache[collection]) {
                if (memoryCache[collection].hasOwnProperty(key)) {
                    data.push(memoryCache[collection][key]);
                }
            }
        }
        // Lưu changeInfo để UI có thể tra cứu sau (tương thích ngược)
        if (changeInfo) {
            _lastChangeInfo[collection] = changeInfo;
        }
        // Gọi callback với full data array (giữ nguyên tương thích ngược)
        for (var i = 0; i < cbs.length; i++) {
            try { cbs[i](data); } catch(e) { console.error('Local callback error:', e); }
        }
    }
    
    // OPTIMIZE: Bật/tắt suppress realtime notifications
    // Dùng cho batch operations (thanh toán, nhập hàng loạt)
    function _setSuppressRealtime(suppress) {
        if (suppress) {
            _suppressRealtime++;
        } else {
            _suppressRealtime--;
            if (_suppressRealtime <= 0) {
                _suppressRealtime = 0;
                // Flush tất cả các collection đang pending
                var collections = Object.keys(_pendingNotifyCollections);
                _pendingNotifyCollections = {};
                for (var i = 0; i < collections.length; i++) {
                    _notifyLocal(collections[i]);
                }
            }
        }
    }

    // IndexedDB operations
    function saveToLocal(collection, data, changeType) {
        // [Comment removed - encoding error]
        var ready = dbReady || Promise.resolve();
        return ready.then(function() {
            if (!localDB) throw new Error('DB not ready');
            if (!localDB.objectStoreNames.contains(collection)) throw new Error('Store ' + collection + ' not found');
            // Cập nhật memory cache ngay lập tức (dùng normalized data để có dateKey, dateTypeKey)
            if (!memoryCache[collection]) memoryCache[collection] = {};
            var isNew = !memoryCache[collection][data.id];
            memoryCache[collection][data.id] = normalizeIndexedFields(collection, data);
            cacheVersion[collection] = (cacheVersion[collection] || 0) + 1;
            // FIX: Notify local subscribers ngay, không chờ Firebase
            // OPTIMIZE: Truyền thông tin item thay đổi để UI không cần xử lý toàn bộ
            var type = changeType || (isNew ? 'added' : 'changed');
            _notifyLocal(collection, { type: type, item: data, collection: collection });
            return new Promise(function(resolve, reject) {
                var tx = localDB.transaction([collection], 'readwrite');
                var store = tx.objectStore(collection);
                var req = store.put(normalizeIndexedFields(collection, data));
                req.onsuccess = function() { resolve(data); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function loadFromLocal(collection, id) {
        // [Comment removed - encoding error]
        var ready = dbReady || Promise.resolve();
        return ready.then(function() {
            if (!localDB) return id !== undefined ? null : [];
            if (!localDB.objectStoreNames.contains(collection)) return id !== undefined ? null : [];
            
            // OPTIMIZE: Memory cache - tránh đọc IndexedDB liên tục
            if (id !== undefined && id !== null) {
                if (memoryCache[collection] && memoryCache[collection][id] !== undefined) {
                    return memoryCache[collection][id];
                }
            } else {
                if (memoryCache[collection]) {
                    var cachedArr = [];
                    for (var key in memoryCache[collection]) {
                        if (memoryCache[collection].hasOwnProperty(key)) {
                            cachedArr.push(memoryCache[collection][key]);
                        }
                    }
                    if (cachedArr.length > 0) return cachedArr;
                }
            }
            
            return new Promise(function(resolve, reject) {
                var tx = localDB.transaction([collection], 'readonly');
                var store = tx.objectStore(collection);
                if (id !== undefined && id !== null) {
                    var req = store.get(String(id));
                    req.onsuccess = function() {
                        var result = req.result || null;
                        if (result) {
                            if (!memoryCache[collection]) memoryCache[collection] = {};
                            memoryCache[collection][result.id] = result;
                        }
                        resolve(result);
                    };
                    req.onerror = function() { reject(req.error); };
                } else {
                    var req = store.getAll();
                    req.onsuccess = function() {
                        var results = req.result || [];
                        if (!memoryCache[collection]) memoryCache[collection] = {};
                        for (var i = 0; i < results.length; i++) {
                            memoryCache[collection][results[i].id] = results[i];
                        }
                        resolve(results);
                    };
                    req.onerror = function() { reject(req.error); };
                }
            });
        });
    }

    function deleteFromLocal(collection, id) {
        // [Comment removed - encoding error]
        var ready = dbReady || Promise.resolve();
        return ready.then(function() {
            if (!localDB) return;
            if (!localDB.objectStoreNames.contains(collection)) return;
            // Xóa khỏi memory cache ngay
            if (memoryCache[collection]) {
                delete memoryCache[collection][id];
                cacheVersion[collection] = (cacheVersion[collection] || 0) + 1;
            }
            // FIX: Notify local subscribers ngay, không chờ Firebase
            // OPTIMIZE: Truyền thông tin item bị xóa
            _notifyLocal(collection, { type: 'removed', item: { id: id }, collection: collection });
            return new Promise(function(resolve, reject) {
                var tx = localDB.transaction([collection], 'readwrite');
                var store = tx.objectStore(collection);
                var req = store.delete(String(id));
                req.onsuccess = function() { resolve(); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    // Sync Queue (simplified)
    function addToSyncQueue(action, collection, data, targetId) {
        var existing = syncQueue.filter(function(q) { return q.targetId === targetId && q.action === action && q.status === 'pending'; })[0];
        if (existing) return existing.id;
        var item = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            action: action,
            collection: collection,
            data: data,
            targetId: targetId,
            deviceId: CURRENT_DEVICE_ID,
            timestamp: Date.now(),
            retryCount: 0,
            status: 'pending',
            lastError: null,   // Luu l?i g?n nh?t d? debug
            dirtyAt: Date.now() // [Comment removed - encoding error]
        };
        syncQueue.push(item);
        saveToLocal('sync_queue', item);
        // [Comment removed - encoding error]
        _markDirty(collection);
        if (isOnline) processSyncQueue();
        return item.id;
    }
    
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    var _dirtyCollections = {};
    function _markDirty(collection) {
        _dirtyCollections[collection] = true;
        try {
            localStorage.setItem('dirty_collections_' + CURRENT_SHOP_ID, JSON.stringify(Object.keys(_dirtyCollections)));
        } catch (e) {}
    }
    function _clearDirty(collection) {
        delete _dirtyCollections[collection];
        try {
            var remaining = Object.keys(_dirtyCollections);
            if (remaining.length > 0) {
                localStorage.setItem('dirty_collections_' + CURRENT_SHOP_ID, JSON.stringify(remaining));
            } else {
                localStorage.removeItem('dirty_collections_' + CURRENT_SHOP_ID);
            }
        } catch (e) {}
    }
    // [Comment removed - encoding error]
    function _restoreDirtyFlags() {
        try {
            var stored = localStorage.getItem('dirty_collections_' + CURRENT_SHOP_ID);
            if (stored) {
                var arr = JSON.parse(stored);
                for (var i = 0; i < arr.length; i++) {
                    _dirtyCollections[arr[i]] = true;
                }
            }
        } catch (e) {}
    }

    function processSyncQueue() {
        if (!isOnline) return Promise.resolve();
        var pending = syncQueue.filter(function(q) { return q.status === 'pending'; });
        if (pending.length === 0) return Promise.resolve();
        
        // OPTIMIZE: Batch các items cùng collection thành 1 Firebase update
        // Gom các pending items theo collection để batch
        var batches = {};
        for (var i = 0; i < pending.length; i++) {
            var item = pending[i];
            var key = item.collection + '|' + item.action;
            if (!batches[key]) batches[key] = [];
            batches[key].push(item);
        }
        
        var chain = Promise.resolve();
        var batchKeys = Object.keys(batches);
        
        for (var b = 0; b < batchKeys.length; b++) {
            chain = chain.then((function(batchItems) {
                return function() {
                    if (batchItems.length === 1) {
                        // Chỉ 1 item - sync bình thường
                        var item = batchItems[0];
                        return syncToFirebase(item).then(function() {
                            return _markItemSynced(item);
                        }).catch(function(err) {
                            return _handleSyncError(item, err);
                        });
                    } else {
                        // Nhiều items cùng collection - batch thành 1 Firebase update
                        return _batchSyncToFirebase(batchItems).then(function() {
                            var chain2 = Promise.resolve();
                            for (var j = 0; j < batchItems.length; j++) {
                                chain2 = chain2.then((function(item) {
                                    return function() { return _markItemSynced(item); };
                                })(batchItems[j]));
                            }
                            return chain2;
                        }).catch(function(err) {
                            // Fallback: sync từng cái nếu batch fail
                            var chain3 = Promise.resolve();
                            for (var j = 0; j < batchItems.length; j++) {
                                chain3 = chain3.then((function(item) {
                                    return function() {
                                        return syncToFirebase(item).then(function() {
                                            return _markItemSynced(item);
                                        }).catch(function(err2) {
                                            return _handleSyncError(item, err2);
                                        });
                                    };
                                })(batchItems[j]));
                            }
                            return chain3;
                        });
                    }
                };
            })(batches[batchKeys[b]]));
        }
        
        return chain;
    }
    
    // OPTIMIZE: Batch sync nhiều items cùng collection lên Firebase trong 1 lần
    // Dùng _getDb để chọn Master/Slave tùy theo collection
    function _batchSyncToFirebase(items) {
        if (items.length === 0) return Promise.resolve();
        var collection = items[0].collection;
        var action = items[0].action;
        var ref = _getDb(collection).ref(CURRENT_SHOP_ID + '/' + collection);
        var batchData = {};
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var syncData = {};
            for (var k in item.data) if (item.data.hasOwnProperty(k)) syncData[k] = item.data[k];
            syncData._syncedAt = firebase.database.ServerValue.TIMESTAMP;
            syncData._syncedBy = item.deviceId;
            syncData._version = (item.data._version || 1);
            if (action === 'delete') {
                batchData[item.targetId] = null;
            } else {
                batchData[item.targetId] = syncData;
            }
        }
        return ref.update(batchData);
    }
    
    function _markItemSynced(item) {
        item.status = 'synced';
        return saveToLocal('sync_queue', item).then(function() {
            return deleteFromLocal('sync_queue', item.id);
        }).then(function() {
            var idx = syncQueue.findIndex(function(q) { return q.id === item.id; });
            if (idx !== -1) syncQueue.splice(idx, 1);
            console.log('✅ Synced:', item.action, item.collection, item.targetId);
            // [Comment removed - encoding error]
            var hasPending = syncQueue.some(function(q) { return q.collection === item.collection && q.status === 'pending'; });
            if (!hasPending) {
                _clearDirty(item.collection);
            }
        });
    }
    
    // [Comment removed - encoding error]
    function _handleSyncError(item, err) {
        item.retryCount = (item.retryCount || 0) + 1;
        item.lastError = err.message || String(err);
        var MAX_RETRY = 5;
        if (item.retryCount < MAX_RETRY) {
            item.status = 'pending';
            // [Comment removed - encoding error]
            return saveToLocal('sync_queue', item).then(function() {
                var delay = Math.min(2000 * Math.pow(2, item.retryCount - 1), 30000); // exponential backoff, max 30s
                console.warn('  Retry', item.retryCount, 'for', item.collection, item.targetId, 'in', delay + 'ms');
                return new Promise(function(r) { setTimeout(r, delay); });
            }).then(function() {
                // [Comment removed - encoding error]
                // d? t?n d?ng batch mechanism
                return processSyncQueue();
            });
        } else {
            item.status = 'failed';
            console.error('Sync failed after ' + MAX_RETRY + ' retries:', item.action, item.collection, item.targetId, 'Error:', item.lastError);
            return saveToLocal('sync_queue', item);
        }
    }

    function syncToFirebase(item) {
        var ref = _getDb(item.collection).ref(CURRENT_SHOP_ID + '/' + item.collection + '/' + item.targetId);
        var syncData = {};
        for (var k in item.data) if (item.data.hasOwnProperty(k)) syncData[k] = item.data[k];
        syncData._syncedAt = firebase.database.ServerValue.TIMESTAMP;
        syncData._syncedBy = item.deviceId;
        syncData._version = (item.data._version || 1);
        if (item.action === 'create' || item.action === 'update') return ref.update(syncData);
        if (item.action === 'delete') return ref.remove();
        return Promise.resolve();
    }

    // CRUD Public
    function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }

    // FIX: Tạo idempotency key cho transaction để chống trùng khi đồng bộ offline
    // Kết hợp: deviceId + timestamp (giây) + tableId + amount
    function _generateIdempotencyKey(collection, data) {
        if (collection !== 'transactions') return null;
        // Dùng tableId + amount + paymentMethod + timestamp (độ phân giải giây)
        var ts = Math.floor(Date.now() / 1000);
        var tableKey = data.tableId || data.tableName || 'unknown';
        var amt = Math.round(data.amount || 0);
        var method = data.paymentMethod || 'unknown';
        return CURRENT_DEVICE_ID + '|' + ts + '|' + tableKey + '|' + amt + '|' + method;
    }

    // FIX: Kiểm tra transaction trùng trong memory cache trước khi tạo
    function _isDuplicateTransaction(data) {
        if (!data.tableId && !data.tableName) {
            return false;
        }
        var tableKey = data.tableId || data.tableName;
        var amt = Math.round(data.amount || 0);
        var method = data.paymentMethod || '';
        var txCache = memoryCache.transactions;
        if (!txCache) {
            return false;
        }
        for (var key in txCache) {
            if (!txCache.hasOwnProperty(key)) continue;
            var tx = txCache[key];
            if (tx.refunded) continue;
            var txTableKey = tx.tableId || tx.tableName;
            if (txTableKey === tableKey && Math.round(tx.amount || 0) === amt && tx.paymentMethod === method) {
                // Kiểm tra thời gian - nếu trong vòng 30 giây thì coi là trùng
                var txTime = tx.createdAt || 0;
                var dataTime = data.createdAt || Date.now();
                if (Math.abs(txTime - dataTime) < 30000) {
                    return true;
                }
            }
        }
        return false;
    }

    function create(collection, data, customId) {
        // FIX: Chống trùng transaction - kiểm tra trước khi tạo
        if (collection === 'transactions' && _isDuplicateTransaction(data)) {
            console.warn('⚠️ Duplicate transaction detected, skipping:', data.tableName, data.amount);
            return Promise.resolve(null);
        }
        var id = customId || data.id || generateId();
        var newData = { id: id };
        for (var k in data) if (data.hasOwnProperty(k) && k !== 'id') newData[k] = data[k];
        newData.createdAt = Date.now();
        newData.createdBy = CURRENT_DEVICE_ID;
        newData.updatedAt = Date.now();
        newData._version = 1;
        // FIX: Lưu idempotency key để kiểm tra khi nhận Firebase event
        if (collection === 'transactions') {
            newData._idempotencyKey = _generateIdempotencyKey(collection, data);
        }
        return saveToLocal(collection, newData).then(function() {
            addToSyncQueue('create', collection, newData, id);
            // OPTIMIZE: Debounce sync - gom nhiều operations vào 1 lần sync
            if (isOnline) _debouncedProcessSyncQueue();
            return Promise.resolve();
        }).then(function() { return newData; });
    }

    function update(collection, id, data) {
        return loadFromLocal(collection, String(id)).then(function(old) {
            if (!old) throw new Error('Not found');
            var updated = {};
            for (var k in old) if (old.hasOwnProperty(k)) updated[k] = old[k];
            for (var k in data) if (data.hasOwnProperty(k)) updated[k] = data[k];
            updated.updatedAt = Date.now();
            updated.updatedBy = CURRENT_DEVICE_ID;
            updated._version = (old._version || 0) + 1;
            return saveToLocal(collection, updated).then(function() {
                addToSyncQueue('update', collection, updated, String(id));
                // OPTIMIZE: Debounce sync - gom nhiều operations vào 1 lần sync
                if (isOnline) _debouncedProcessSyncQueue();
                return Promise.resolve();
            }).then(function() { return updated; });
        });
    }

    // Batch update sortOrder - ghi vào IndexedDB + Firebase 1 lần duy nhất, ko qua sync queue
    // @param {string} collection - Tên collection ('menu' hoặc 'menu_categories'), mặc định 'menu'
    function batchUpdateSortOrder(items, collection) {
        collection = collection || 'menu';
        return dbReady.then(function() {
            if (!localDB) throw new Error('DB not ready');
            var tx = localDB.transaction([collection], 'readwrite');
            var store = tx.objectStore(collection);
            var now = Date.now();
            
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                // Cập nhật memory cache - CHỈ sửa sortOrder, giữ nguyên các field khác
                if (!memoryCache[collection]) memoryCache[collection] = {};
                if (memoryCache[collection][item.id]) {
                    memoryCache[collection][item.id].sortOrder = item.sortOrder;
                }
                // Ghi vào IndexedDB - CHỈ cập nhật sortOrder, ko ghi đè toàn bộ
                // Dùng store.put với toàn bộ data cũ + sortOrder mới
                var fullData = memoryCache[collection][item.id];
                if (fullData) {
                    fullData.sortOrder = item.sortOrder;
                    fullData.updatedAt = now;
                    store.put(normalizeIndexedFields(collection, fullData));
                }
            }
            
            return new Promise(function(resolve, reject) {
                tx.oncomplete = function() {
                    // Sync 1 batch lên Firebase - CHỈ ghi đúng field sortOrder, ko tạo node lạ
                    if (isOnline && CURRENT_SHOP_ID) {
                        var updates = {};
                        var firebasePath = (collection === 'menu_categories') ? 'menu_categories' : 'menu';
                        for (var i = 0; i < items.length; i++) {
                            var key = CURRENT_SHOP_ID + '/' + firebasePath + '/' + items[i].id + '/sortOrder';
                            updates[key] = items[i].sortOrder;
                        }
                        masterDb.ref().update(updates).catch(function(err) {
                            console.error('Lỗi batch sync sortOrder cho ' + collection + ':', err);
                        });
                    }
                    _notifyLocal(collection);
                    resolve();
                };
                tx.onerror = function() { reject(tx.error); };
            });
        });
    }

    function remove(collection, id) {
        return deleteFromLocal(collection, String(id)).then(function() {
            addToSyncQueue('delete', collection, { id: id }, String(id));
            // OPTIMIZE: Debounce sync - gom nhiều operations vào 1 lần sync
            if (isOnline) _debouncedProcessSyncQueue();
            return Promise.resolve();
        }).then(function() { return true; });
    }

    function get(collection, id) {
        if (id !== undefined) return loadFromLocal(collection, String(id));
        return loadFromLocal(collection);
    }

    function getAll(collection) {
        return loadFromLocal(collection).then(function(data) { return data || []; });
    }

    // FIX: Tự động sửa dateKey cho dữ liệu cũ bị sai do UTC vs Local time (+7)
    // Kiểm tra nếu dateKey không khớp với createdAt (tính theo local time), thì cập nhật lại
    function _fixDateKeyIfNeeded(tx) {
        if (!tx || !tx.id) return tx;
        var correctKey = toDateKey(tx.createdAt || tx.date || tx.updatedAt);
        if (correctKey && tx.dateKey !== correctKey) {
            
            tx.dateKey = correctKey;
            tx.dateTypeKey = correctKey + '|' + (tx.type || 'unknown');
            // Cập nhật trong memoryCache và IndexedDB
            if (memoryCache.transactions) {
                memoryCache.transactions[tx.id] = tx;
            }
            // Ghi đè vào IndexedDB (fire & forget)
            if (localDB) {
                try {
                    var writeTx = localDB.transaction(['transactions'], 'readwrite');
                    var store = writeTx.objectStore('transactions');
                    store.put(tx);
                } catch(e) {
                    console.warn('Không thể ghi fix dateKey vào IndexedDB:', e.message);
                }
            }
        }
        return tx;
    }

    function getTransactionsByDate(dateKey, options) {
        options = options || {};
        var type = options.type || 'all';
        return dbReady.then(function() {
            if (!localDB || !localDB.objectStoreNames.contains('transactions')) return [];
            
            // [Comment removed - encoding error]
            var localPromise;
            if (memoryCache.transactions) {
                var allTx = [];
                for (var key in memoryCache.transactions) {
                    if (memoryCache.transactions.hasOwnProperty(key)) {
                        allTx.push(memoryCache.transactions[key]);
                    }
                }
                for (var i = 0; i < allTx.length; i++) {
                    _fixDateKeyIfNeeded(allTx[i]);
                }
                var filtered = allTx.filter(function(t) { return t.dateKey === dateKey; });
                if (type !== 'all') filtered = filtered.filter(function(t) { return t.type === type; });
                localPromise = Promise.resolve(filtered);
            } else {
                localPromise = new Promise(function(resolve, reject) {
                    var tx = localDB.transaction(['transactions'], 'readonly');
                    var store = tx.objectStore('transactions');
                    var req;
                    if (type !== 'all' && store.indexNames.contains('dateTypeKey')) {
                        req = store.index('dateTypeKey').getAll(dateKey + '|' + type);
                    } else if (store.indexNames.contains('dateKey')) {
                        req = store.index('dateKey').getAll(dateKey);
                    } else {
                        req = store.getAll();
                    }
                    req.onsuccess = function() {
                        var rows = req.result || [];
                        if (!store.indexNames.contains('dateKey')) {
                            rows = rows.filter(function(r) { return toDateKey(r.date) === dateKey; });
                            if (type !== 'all') rows = rows.filter(function(r) { return r.type === type; });
                        }
                        for (var i = 0; i < rows.length; i++) {
                            _fixDateKeyIfNeeded(rows[i]);
                        }
                        if (!memoryCache.transactions) memoryCache.transactions = {};
                        for (var i = 0; i < rows.length; i++) {
                            memoryCache.transactions[rows[i].id] = rows[i];
                        }
                        resolve(rows);
                    };
                    req.onerror = function() { reject(req.error); };
                });
            }
            
            // [Comment removed - encoding error]
            return localPromise.then(function(localData) {
                if (localData && localData.length > 0) {
                    return localData; // [Comment removed - encoding error]
                }
                
                // [Comment removed - encoding error]
                if (!isOnline) return [];
                
                console.log('?? Auto-fetching transactions for date:', dateKey);
                return syncCollectionByDate('transactions', dateKey).then(function(fetched) {
                    if (type !== 'all' && fetched) {
                        fetched = fetched.filter(function(t) { return t.type === type; });
                    }
                    return fetched || [];
                });
            });
        });
    }

    // [Comment removed - encoding error]
    var _fetchingRange = null;
    
    function getTransactionsByDateRange(startDateKey, endDateKey, options) {
        options = options || {};
        var type = options.type || 'all';
        
        // [Comment removed - encoding error]
        if (_fetchingRange) {
            return _fetchingRange.then(function() {
                // [Comment removed - encoding error]
                return _doGetTransactionsByDateRange(startDateKey, endDateKey, type);
            });
        }
        
        var promise = _doGetTransactionsByDateRange(startDateKey, endDateKey, type);
        _fetchingRange = promise;
        return promise.then(function(result) {
            _fetchingRange = null;
            return result;
        }).catch(function(err) {
            _fetchingRange = null;
            throw err;
        });
    }
    
    function _doGetTransactionsByDateRange(startDateKey, endDateKey, type) {
        return dbReady.then(function() {
            if (!localDB || !localDB.objectStoreNames.contains('transactions')) return [];
            
            // [Comment removed - encoding error]
            var localPromise;
            if (memoryCache.transactions) {
                var allTx = [];
                for (var key in memoryCache.transactions) {
                    if (memoryCache.transactions.hasOwnProperty(key)) {
                        allTx.push(memoryCache.transactions[key]);
                    }
                }
                for (var i = 0; i < allTx.length; i++) {
                    _fixDateKeyIfNeeded(allTx[i]);
                }
                var filtered = allTx.filter(function(t) {
                    return t.dateKey >= startDateKey && t.dateKey <= endDateKey;
                });
                if (type !== 'all') filtered = filtered.filter(function(t) { return t.type === type; });
                localPromise = Promise.resolve(filtered);
            } else {
                localPromise = new Promise(function(resolve, reject) {
                    var tx = localDB.transaction(['transactions'], 'readonly');
                    var store = tx.objectStore('transactions');
                    var req;
                    if (store.indexNames.contains('dateKey')) {
                        req = store.index('dateKey').getAll();
                    } else {
                        req = store.getAll();
                    }
                    req.onsuccess = function() {
                        var rows = req.result || [];
                        for (var i = 0; i < rows.length; i++) {
                            _fixDateKeyIfNeeded(rows[i]);
                        }
                        var filtered = rows.filter(function(r) {
                            var dk = toDateKey(r.date);
                            return dk >= startDateKey && dk <= endDateKey;
                        });
                        if (type !== 'all') filtered = filtered.filter(function(r) { return r.type === type; });
                        if (!memoryCache.transactions) memoryCache.transactions = {};
                        for (var i = 0; i < rows.length; i++) {
                            memoryCache.transactions[rows[i].id] = rows[i];
                        }
                        resolve(filtered);
                    };
                    req.onerror = function() { reject(req.error); };
                });
            }
            
            // [Comment removed - encoding error]
            // [Comment removed - encoding error]
            return localPromise.then(function(localData) {
                // [Comment removed - encoding error]
                var localDateKeys = {};
                for (var i = 0; i < localData.length; i++) {
                    if (localData[i].dateKey) {
                        localDateKeys[localData[i].dateKey] = true;
                    }
                }
                
                // [Comment removed - encoding error]
                return getSyncMeta('transactions').then(function(meta) {
                    var fetchedDateKeys = (meta && meta.dateKeys) || [];
                    for (var i = 0; i < fetchedDateKeys.length; i++) {
                        localDateKeys[fetchedDateKeys[i]] = true;
                    }
                    
                    // [Comment removed - encoding error]
                    var allDateKeys = getDateKeysBetween(startDateKey, endDateKey);
                    var missingDateKeys = [];
                    for (var i = 0; i < allDateKeys.length; i++) {
                        if (!localDateKeys[allDateKeys[i]]) {
                            missingDateKeys.push(allDateKeys[i]);
                        }
                    }
                    
                    if (missingDateKeys.length === 0 || !isOnline) {
                        return localData; // [Comment removed - encoding error]
                    }
                    
                    // [Comment removed - encoding error]
                    console.log('?? Auto-fetching missing dates:', missingDateKeys.length, 'days');
                    
                    var chain = Promise.resolve();
                    for (var i = 0; i < missingDateKeys.length; i++) {
                        chain = chain.then((function(dateKey) {
                            return function() {
                                return syncCollectionByDate('transactions', dateKey);
                            };
                        })(missingDateKeys[i]));
                    }
                    
                    return chain.then(function() {
                        // [Comment removed - encoding error]
                        return loadFromLocal('transactions').then(function(allData) {
                            var result = [];
                            for (var i = 0; i < allData.length; i++) {
                                var dk = allData[i].dateKey;
                                if (dk >= startDateKey && dk <= endDateKey) {
                                    if (type === 'all' || allData[i].type === type) {
                                        result.push(allData[i]);
                                    }
                                }
                            }
                            return result;
                        });
                    });
                });
            });
        });
    }

   function subscribeToCollection(collection, callback, options) {
    // FIX: Đăng ký local callback để UI nhận notify ngay sau ghi local
    if (callback) {
        if (!_localCallbacks[collection]) _localCallbacks[collection] = [];
        _localCallbacks[collection].push(callback);
    }
    
    // OPTIMIZE: Hỗ trợ query options (limitToLast, orderByChild) để giảm dung lượng download
    // Ví dụ: { limitToLast: 200, orderByChild: 'createdAt' } chỉ lấy 200 item mới nhất
    // Dùng _getDb để chọn Master/Slave tùy theo collection
    var ref = _getDb(collection).ref(CURRENT_SHOP_ID + '/' + collection);
    if (options && options.orderByChild) {
        var queryRef = ref.orderByChild(options.orderByChild);
        if (options.limitToLast) {
            queryRef = queryRef.limitToLast(options.limitToLast);
        }
        ref = queryRef;
    } else if (options && options.limitToLast) {
        ref = ref.limitToLast(options.limitToLast);
    }
    
    // FIX: Collection 'info' là special - chỉ có 1 item config duy nhất (shop_config)
    // Dùng on('value') thay vì child_* để nhận toàn bộ object, tránh bị tách thành nhiều item riêng lẻ
    if (collection === 'info') {
        var updateScheduledInfo = false;
        var emitUpdateInfo = function() {
            if (updateScheduledInfo) return;
            updateScheduledInfo = true;
            setTimeout(function() {
                updateScheduledInfo = false;
                loadFromLocal(collection).then(function(localData) {
                    if (callback) callback(localData);
                    var evt = document.createEvent('CustomEvent');
                    evt.initCustomEvent('db_update', true, true, { detail: { collection: collection, data: localData } });
                    window.dispatchEvent(evt);
                });
            }, 200);
        };
        var onValue = function(snapshot) {
            if (!snapshot.exists()) return;
            var src = snapshot.val() || {};
            // Gộp toàn bộ object thành 1 item với id='shop_config'
            var item = { id: 'shop_config' };
            for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
            saveToLocal(collection, item).then(emitUpdateInfo);
        };
        ref.on('value', onValue);
        if (!listeners[collection]) listeners[collection] = [];
        listeners[collection].push({ value: onValue });
        return function() {
            ref.off('value', onValue);
        };
    }
    
    // P0: Tất cả collections đều dùng child_* events thay vì on('value')
    // transactions/reports đã dùng child_* từ trước, giờ mở rộng cho tất cả
    var updateScheduled = false;
    var emitUpdate = function() {
        if (updateScheduled) return;
        updateScheduled = true;
        setTimeout(function() {
            updateScheduled = false;
            loadFromLocal(collection).then(function(localData) {
                // FIX: Firebase callback - gọi sau local callback, tránh trùng
                if (callback) callback(localData);
                var evt = document.createEvent('CustomEvent');
                evt.initCustomEvent('db_update', true, true, { detail: { collection: collection, data: localData } });
                window.dispatchEvent(evt);
            });
        }, 200);
    };
    var onAdded = function(snapshot) {
        if (!snapshot.exists()) return;
        var key = snapshot.key;
        var src = snapshot.val() || {};
        var item = { id: key };
        for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
        
        // [Comment removed - encoding error]
        // [Comment removed - encoding error]
        if (collection !== 'tables') {
            var localItem = memoryCache[collection] ? memoryCache[collection][key] : null;
            if (localItem && (localItem._version || 0) >= (item._version || 0)) {
                return;
            }
        }
        
        // FIX: Chống trùng transaction từ Firebase realtime
        // Nếu transaction này đã tồn tại trong local (do chính máy này tạo khi offline),
        // thì không ghi đè - giữ nguyên bản local (có _idempotencyKey và _version đầy đủ)
        if (collection === 'transactions' && memoryCache.transactions && memoryCache.transactions[key]) {
            var localTx = memoryCache.transactions[key];
            // Nếu local có _version >= 1 và _syncedAt chưa có, nghĩa là local chưa sync
            // Giữ nguyên bản local, không ghi đè bằng Firebase data
            if (localTx._version >= 1 && !localTx._syncedAt) {
                console.log('?? Skip Firebase overwrite for pending local transaction:', key);
                return;
            }
        }
        
        // FIX: Kiểm tra idempotency - nếu transaction từ máy khác có cùng table+amount+method
        // trong khoảng thời gian ngắn, kiểm tra xem có phải trùng không
        if (collection === 'transactions' && item.tableId && item.amount) {
            var txCache = memoryCache.transactions;
            if (txCache) {
                for (var ck in txCache) {
                    if (!txCache.hasOwnProperty(ck) || ck === key) continue;
                    var existing = txCache[ck];
                    if (existing.refunded) continue;
                    var sameTable = (existing.tableId === item.tableId) || (existing.tableName === item.tableName);
                    var sameAmount = Math.round(existing.amount || 0) === Math.round(item.amount || 0);
                    var sameMethod = existing.paymentMethod === item.paymentMethod;
                    if (sameTable && sameAmount && sameMethod) {
                        var timeDiff = Math.abs((existing.createdAt || 0) - (item.createdAt || 0));
                        if (timeDiff < 30000 && timeDiff > 0) {
                            // Transaction từ máy khác trùng với local - đánh dấu refunded để ẩn
                            console.warn('?? Detected duplicate transaction from another device:', key, 'duplicates', ck);
                            item.refunded = true;
                            item.note = (item.note || '') + ' [Tự động đánh dấu trùng lặp]';
                            break;
                        }
                    }
                }
            }
        }
        
        saveToLocal(collection, item).then(emitUpdate);
    };
    var onChanged = function(snapshot) {
        if (!snapshot.exists()) return;
        var key = snapshot.key;
        var src = snapshot.val() || {};
        var item = { id: key };
        for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
        
        // FIX: Ch? skip _version check cho transactions
        // [Comment removed - encoding error]
        if (collection !== 'tables') {
            var localItem = memoryCache[collection] ? memoryCache[collection][key] : null;
            if (localItem && (localItem._version || 0) >= (item._version || 0)) {
                return;
            }
        }
        
        saveToLocal(collection, item).then(emitUpdate);
    };
    var onRemoved = function(snapshot) {
        var key = snapshot.key;
        deleteFromLocal(collection, key).then(emitUpdate);
    };
    ref.on('child_added', onAdded);
    ref.on('child_changed', onChanged);
    ref.on('child_removed', onRemoved);
    if (!listeners[collection]) listeners[collection] = [];
    listeners[collection].push({ added: onAdded, changed: onChanged, removed: onRemoved });
    return function() {
        ref.off('child_added', onAdded);
        ref.off('child_changed', onChanged);
        ref.off('child_removed', onRemoved);
    };
}

    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    var _pollingTimers = {};
    function subscribeWithPolling(collection, callback, intervalSeconds) {
        intervalSeconds = intervalSeconds || 60; // [Comment removed - encoding error]
        // [Comment removed - encoding error]
        if (callback) {
            if (!_localCallbacks[collection]) _localCallbacks[collection] = [];
            _localCallbacks[collection].push(callback);
        }
        
        // [Comment removed - encoding error]
        // [Comment removed - encoding error]
        // [Comment removed - encoding error]
        if (_pollingTimers[collection]) {
            if (callback) {
                if (memoryCache[collection]) {
                    var data = [];
                    for (var key in memoryCache[collection]) {
                        if (memoryCache[collection].hasOwnProperty(key)) {
                            data.push(memoryCache[collection][key]);
                        }
                    }
                    if (data.length > 0) {
                        try { callback(data); } catch(e) { console.error('Polling callback error:', e); }
                    } else {
                        // [Comment removed - encoding error]
                        // [Comment removed - encoding error]
                        console.log('? Polling ' + collection + ': memoryCache empty, registering callback for later');
                        if (!_localCallbacks[collection]) _localCallbacks[collection] = [];
                        _localCallbacks[collection].push(callback);
                    }
                } else {
                    // [Comment removed - encoding error]
                    console.log('? Polling ' + collection + ': memoryCache not ready, registering callback for later');
                    if (!_localCallbacks[collection]) _localCallbacks[collection] = [];
                    _localCallbacks[collection].push(callback);
                }
            }
            return function() {
                clearInterval(_pollingTimers[collection]);
                delete _pollingTimers[collection];
            };
        }
        
        // Dùng _getDb để chọn Master/Slave tùy theo collection
        var ref = _getDb(collection).ref(CURRENT_SHOP_ID + '/' + collection);
        
        // [Comment removed - encoding error]
        getSyncMeta(collection).then(function(meta) {
            if (meta && meta.maxVersion > 0) {
                // [Comment removed - encoding error]
                deltaSync(collection);
            } else {
                // [Comment removed - encoding error]
                ref.once('value', function(snapshot) {
                    if (!snapshot.exists()) return;
                    var remote = snapshot.val() || {};
                    var count = 0;
                    var maxVersion = 0;
                    for (var key in remote) {
                        if (remote.hasOwnProperty(key)) {
                            var src = remote[key];
                            var item = { id: key };
                            for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
                            if (item._version === undefined) item._version = 1;
                            if (item._version > maxVersion) maxVersion = item._version;
                            saveToLocal(collection, item, 'added');
                            count++;
                        }
                    }
                    saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: maxVersion, dateKeys: [] });
                    console.log('?? Polling loaded ' + collection + ': ' + count + ' items');
                });
            }
        });
        
        // [Comment removed - encoding error]
        _pollingTimers[collection] = setInterval(function() {
            if (!isOnline) return;
            
            getSyncMeta(collection).then(function(meta) {
                var localMaxVersion = (meta && meta.maxVersion) || 0;
                var queryRef = ref.orderByChild('_version').startAt(localMaxVersion + 1);
                
                queryRef.once('value', function(snapshot) {
                    if (!snapshot.exists()) return;
                    var remote = snapshot.val() || {};
                    var count = 0;
                    var newMaxVersion = localMaxVersion;
                    
                    for (var key in remote) {
                        if (remote.hasOwnProperty(key)) {
                            var src = remote[key];
                            var item = { id: key };
                            for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
                            if (item._version === undefined) item._version = 1;
                            if (item._version > newMaxVersion) newMaxVersion = item._version;
                            
                            var localItem = memoryCache[collection] ? memoryCache[collection][key] : null;
                            saveToLocal(collection, item, localItem ? 'changed' : 'added');
                            count++;
                        }
                    }
                    
                    if (count > 0) {
                        saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: newMaxVersion, dateKeys: (meta && meta.dateKeys) || [] });
                        console.log('?? Polling delta ' + collection + ': ' + count + ' new items');
                    }
                });
            });
            
            // [Comment removed - encoding error]
            // [Comment removed - encoding error]
            _cleanupDeletedIds(collection);
        }, intervalSeconds * 1000);
        
        return function() {
            clearInterval(_pollingTimers[collection]);
            delete _pollingTimers[collection];
        };
    }
    
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    var _quickSyncTimer = null;
    function _quickSync() {
        if (_quickSyncTimer) clearTimeout(_quickSyncTimer);
        _quickSyncTimer = setTimeout(function() {
            _quickSyncTimer = null;
            if (!isOnline) return;
            console.log('?? Quick sync on resume...');
            // FIX: Chi goi smartSync() 1 lan (khong tham so = sync tat ca)
            // Truoc day goi trong vong lap N lan, gay N lan sync trung lap
            smartSync();
        }, 500);
    }
    
    // Network listener
    function initNetwork() {
        window.addEventListener('online', function() {
            isOnline = true;
            showToast('Da ket noi mang', 'success');
            processSyncQueue();
            // FIX: Chi goi smartSync() 1 lan (khong tham so = sync tat ca)
            // Truoc day goi trong vong lap N lan, gay N lan sync trung lap
            smartSync();
        });
        window.addEventListener('offline', function() {
            isOnline = false;
            showToast('?? M?t k?t n?i', 'warning');
        });
        
        // QUICK SYNC: Khi tab resume (visibilitychange + focus)
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
                _quickSync();
            }
        });
        window.addEventListener('focus', function() {
            _quickSync();
        });
        
        isOnline = navigator.onLine;
        
        // FIX: Theo doi Firebase connection state thuc te
        // .info/connected cho biet SDK co ket noi duoc den Firebase server hay khong
        // Tranh truong hop navigator.onLine = true nhung Firebase bi mat ket noi
        _monitorFirebaseConnection();
    }
    
    // FIX: Theo doi Firebase connection state
    var _firebaseConnected = false;
    function _monitorFirebaseConnection() {
        try {
            var connectedRef = masterDb.ref('.info/connected');
            connectedRef.on('value', function(snapshot) {
                var wasConnected = _firebaseConnected;
                _firebaseConnected = snapshot.val() === true;
                if (_firebaseConnected && !wasConnected) {
                    // Vua ket noi lai Firebase - can sync lai du lieu
                    console.log('?? Firebase reconnected - syncing data...');
                    if (isOnline) {
                        smartSync();
                    }
                } else if (!_firebaseConnected && wasConnected) {
                    console.warn('?? Firebase disconnected - will auto-sync when reconnected');
                }
            });
        } catch(e) {
            console.warn('?? Could not monitor Firebase connection:', e);
        }
    }

    // ========== SYNC META OPERATIONS ==========
    
    // Key prefix cho localStorage
    var LS_SYNC_META_PREFIX = 'sync_meta_';
    
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    function getSyncMeta(collection) {
        if (syncMetaCache[collection]) {
            return Promise.resolve(syncMetaCache[collection]);
        }
        // [Comment removed - encoding error]
        try {
            var lsKey = LS_SYNC_META_PREFIX + CURRENT_SHOP_ID + '_' + collection;
            var stored = localStorage.getItem(lsKey);
            if (stored) {
                var meta = JSON.parse(stored);
                if (meta && meta.lastSyncAt) {
                    syncMetaCache[collection] = meta;
                    return Promise.resolve(meta);
                }
            }
        } catch (e) {
            // [Comment removed - encoding error]
        }
        // [Comment removed - encoding error]
        if (!dbReady) {
            return Promise.resolve(null);
        }
        return dbReady.then(function() {
            if (!localDB || !localDB.objectStoreNames.contains(SYNC_META_STORE)) {
                return null;
            }
            return new Promise(function(resolve, reject) {
                var tx = localDB.transaction([SYNC_META_STORE], 'readonly');
                var store = tx.objectStore(SYNC_META_STORE);
                var req = store.get(collection);
                req.onsuccess = function() {
                    var meta = req.result || null;
                    if (meta) {
                        syncMetaCache[collection] = meta;
                        // [Comment removed - encoding error]
                        try {
                            var lsKey = LS_SYNC_META_PREFIX + CURRENT_SHOP_ID + '_' + collection;
                            localStorage.setItem(lsKey, JSON.stringify(meta));
                        } catch (e) {}
                    }
                    resolve(meta);
                };
                req.onerror = function() { reject(req.error); };
            });
        });
    }
    
    // [Comment removed - encoding error]
    function saveSyncMeta(collection, meta) {
        syncMetaCache[collection] = meta;
        // [Comment removed - encoding error]
        try {
            var lsKey = LS_SYNC_META_PREFIX + CURRENT_SHOP_ID + '_' + collection;
            localStorage.setItem(lsKey, JSON.stringify({
                id: collection,
                lastSyncAt: meta.lastSyncAt,
                maxVersion: meta.maxVersion,
                dateKeys: meta.dateKeys || []
            }));
        } catch (e) {
            // [Comment removed - encoding error]
        }
        // [Comment removed - encoding error]
        if (!dbReady) return Promise.resolve();
        return dbReady.then(function() {
            if (!localDB || !localDB.objectStoreNames.contains(SYNC_META_STORE)) return;
            return new Promise(function(resolve, reject) {
                var tx = localDB.transaction([SYNC_META_STORE], 'readwrite');
                var store = tx.objectStore(SYNC_META_STORE);
                store.put({ id: collection, lastSyncAt: meta.lastSyncAt, maxVersion: meta.maxVersion, dateKeys: meta.dateKeys || [] });
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { resolve(); }; // [Comment removed - encoding error]
            });
        });
    }
    
    // L?y maxVersion c?a 1 collection t? Firebase _meta node
    function getMaxVersionFromFirebase(collection) {
        if (!isOnline) return Promise.resolve(0);
        // [Comment removed - encoding error]
        return _getDb(collection).ref(CURRENT_SHOP_ID + '/_meta/' + collection + '/maxVersion').once('value').then(function(snapshot) {
            return snapshot.val() || 0;
        }).catch(function() { return 0; });
    }
    
    // [Comment removed - encoding error]
    function updateMetaOnFirebase(collection, maxVersion) {
        if (!isOnline) return Promise.resolve();
        // [Comment removed - encoding error]
        return _getDb(collection).ref(CURRENT_SHOP_ID + '/_meta/' + collection).update({
            maxVersion: maxVersion,
            lastUpdatedAt: firebase.database.ServerValue.TIMESTAMP
        }).catch(function(err) {
            console.warn('?? Could not update _meta for', collection, err);
        });
    }
    
    // ========== SMART SYNC ==========
    
    // [Comment removed - encoding error]
    var _syncPromise = null;
    
    // [Comment removed - encoding error]
    function whenSyncComplete() {
        if (_syncPromise) return _syncPromise;
        return Promise.resolve();
    }
    
    // FIX: smartSync nhan tham so collection de chi sync 1 collection cu the
    // Khi duoc goi tu heartbeat, BroadcastChannel, hoac _quickSync
    // Neu khong co tham so, sync tat ca collections (nhu cu)
    function smartSync(collection) {
        if (!isOnline) {
            _syncPromise = Promise.resolve();
            return _syncPromise;
        }
        
        // FIX: Neu co tham so collection cu the, chi sync collection do
        // Su dung _syncSingleCollection thay vi syncCollection (inner function)
        // de tranh ReferenceError: syncResults is not defined
        if (collection) {
            console.log('?? Smart sync for single collection:', collection);
            _syncPromise = _syncSingleCollection(collection).then(function() {
                console.log('? Smart sync completed for:', collection);
                return { full: [], delta: [collection], skipped: [] };
            });
            return _syncPromise;
        }
        
        console.log('?? Smart sync started for all collections...');
        
        var masterKeys = Object.keys(MASTER_COLLECTIONS);
        var dateKeys = Object.keys(DATE_BASED_COLLECTIONS);
        
        var syncResults = { full: [], delta: [], skipped: [] };
        
        function syncCollection(collection) {
            if (collection === 'tables') {
                syncResults.full.push(collection);
                return fullSync(collection);
            }
            
            return getSyncMeta(collection).then(function(meta) {
                var isLocalEmpty = !memoryCache[collection] || Object.keys(memoryCache[collection]).length === 0;
                
                if (!meta || isLocalEmpty) {
                    if (isLocalEmpty) {
                        return loadFromLocal(collection).then(function(localData) {
                            var hasLocalData = localData && (Array.isArray(localData) ? localData.length > 0 : Object.keys(localData).length > 0);
                            if (hasLocalData) {
                                if (!memoryCache[collection]) memoryCache[collection] = {};
                                for (var i = 0; i < localData.length; i++) {
                                    memoryCache[collection][localData[i].id] = localData[i];
                                }
                                if (meta) {
                                    syncResults.delta.push(collection);
                                    return deltaSync(collection);
                                }
                            }
                            syncResults.full.push(collection);
                            return fullSync(collection);
                        });
                    }
                    syncResults.full.push(collection);
                    return fullSync(collection);
                }
                
                var now = Date.now();
                var timeSinceLastSync = now - (meta.lastSyncAt || 0);
                
                if (timeSinceLastSync > THIRTY_DAYS_MS) {
                    syncResults.full.push(collection);
                    return fullSync(collection);
                }
                
                syncResults.delta.push(collection);
                return deltaSync(collection);
            });
        }
        
        // OPTIMIZE: Ch?y master collections SONG SONG d? gi?m th?i gian
        var masterPromises = [];
        for (var m = 0; m < masterKeys.length; m++) {
            (function(collection) {
                masterPromises.push(syncCollection(collection));
            })(masterKeys[m]);
        }
        
        // Date-based collections cung ch?y song song
        var datePromises = [];
        for (var d = 0; d < dateKeys.length; d++) {
            (function(collection) {
                datePromises.push(syncCollection(collection));
            })(dateKeys[d]);
        }
        
        _syncPromise = Promise.all(masterPromises.concat(datePromises)).then(function() {
            console.log('? Smart sync completed. Full:', syncResults.full.length, 'Delta:', syncResults.delta.length, 'Skipped:', syncResults.skipped.length);
            return syncResults;
        });
        return _syncPromise;
    }
    
    // FIX: Ham rieng de sync 1 collection, khong phu thuoc vao syncResults
    // Tra ve Promise, khong can ket qua chi tiet
    function _syncSingleCollection(collection) {
        if (collection === 'tables') {
            return fullSync(collection);
        }
        return getSyncMeta(collection).then(function(meta) {
            var isLocalEmpty = !memoryCache[collection] || Object.keys(memoryCache[collection]).length === 0;
            if (!meta || isLocalEmpty) {
                if (isLocalEmpty) {
                    return loadFromLocal(collection).then(function(localData) {
                        var hasLocalData = localData && (Array.isArray(localData) ? localData.length > 0 : Object.keys(localData).length > 0);
                        if (hasLocalData) {
                            if (!memoryCache[collection]) memoryCache[collection] = {};
                            for (var i = 0; i < localData.length; i++) {
                                memoryCache[collection][localData[i].id] = localData[i];
                            }
                            if (meta) {
                                return deltaSync(collection);
                            }
                        }
                        return fullSync(collection);
                    });
                }
                return fullSync(collection);
            }
            var now = Date.now();
            var timeSinceLastSync = now - (meta.lastSyncAt || 0);
            if (timeSinceLastSync > THIRTY_DAYS_MS) {
                return fullSync(collection);
            }
            return deltaSync(collection);
        });
    }
    // - Master collections: t?i t?t c?
    // [Comment removed - encoding error]
    function fullSync(collection) {
        if (!isOnline) return Promise.resolve();
        
        // FIX: Ki?m tra collection h?p l? (master ho?c date-based)
        var isDateBased = DATE_BASED_COLLECTIONS[collection];
        var isMaster = MASTER_COLLECTIONS[collection];
        if (!isMaster && !isDateBased) {
            console.warn('  ?? Unknown collection, skipping fullSync:', collection);
            return Promise.resolve();
        }
        
        return new Promise(function(resolve, reject) {
            // Dùng _getDb để chọn Master/Slave tùy theo collection
            var ref = _getDb(collection).ref(CURRENT_SHOP_ID + '/' + collection);
            
            // [Comment removed - encoding error]
            if (isDateBased) {
                var thirtyDaysAgo = Date.now() - THIRTY_DAYS_MS;
                ref = ref.orderByChild('createdAt').startAt(thirtyDaysAgo);
            }
            
            ref.once('value', function(snapshot) {
                if (!snapshot.exists()) {
                    // Ghi sync_meta v?i maxVersion = 0
                    saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: 0, dateKeys: [] });
                    resolve();
                    return;
                }
                
                var remote = snapshot.val() || {};
                var count = 0;
                var maxVersion = 0;
                var dateKeys = [];
                
                // [Comment removed - encoding error]
                // [Comment removed - encoding error]
                _setSuppressRealtime(true);
                
                // [Comment removed - encoding error]
                if (isMaster && memoryCache[collection]) {
                    memoryCache[collection] = {};
                }
                
                // [Comment removed - encoding error]
                // [Comment removed - encoding error]
                // [Comment removed - encoding error]
                // [Comment removed - encoding error]
                var preClear = Promise.resolve();
                if (isMaster) {
                    preClear = new Promise(function(clearResolve) {
                        var tx = localDB.transaction([collection], 'readwrite');
                        var store = tx.objectStore(collection);
                        var req = store.clear();
                        req.onsuccess = function() { clearResolve(); };
                        req.onerror = function() { clearResolve(); };
                    });
                }
                
                // [Comment removed - encoding error]
                if (collection === 'info') {
                    var infoItem = { id: 'shop_config' };
                    for (var pk in remote) {
                        if (remote.hasOwnProperty(pk)) {
                            infoItem[pk] = remote[pk];
                        }
                    }
                    if (infoItem._version === undefined) infoItem._version = 1;
                    saveToLocal(collection, infoItem).then(function() {
                        saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: infoItem._version || 1, dateKeys: [] });
                        // [Comment removed - encoding error]
                        _setSuppressRealtime(false);
                        _emit(collection + ':synced', { collection: collection, count: 1, timestamp: Date.now() });
                        console.log('  ?? Full synced info: 1 item');
                        resolve();
                    });
                    return;
                }
                
                // [Comment removed - encoding error]
                var saveChain = preClear;
                for (var key in remote) {
                    if (remote.hasOwnProperty(key)) {
                        (function(itemKey) {
                            saveChain = saveChain.then(function() {
                                var src = remote[itemKey];
                                var item = { id: itemKey };
                                for (var p in src) {
                                    if (src.hasOwnProperty(p)) {
                                        item[p] = src[p];
                                    }
                                }
                                if (item._version === undefined) item._version = 1;
                                if (item._version > maxVersion) maxVersion = item._version;
                                
                                // Thu th?p dateKeys cho date-based collections
                                if (isDateBased && item.dateKey && dateKeys.indexOf(item.dateKey) < 0) {
                                    dateKeys.push(item.dateKey);
                                }
                                
                                count++;
                                return saveToLocal(collection, item);
                            });
                        })(key);
                    }
                }
                
                return saveChain.then(function() {
                    // Ghi sync_meta
                    saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: maxVersion, dateKeys: dateKeys });
                    // [Comment removed - encoding error]
                    updateMetaOnFirebase(collection, maxVersion);
                    // [Comment removed - encoding error]
                    _setSuppressRealtime(false);
                    _emit(collection + ':synced', { collection: collection, count: count, timestamp: Date.now() });
                    resolve();
                }).catch(function(err) {
                    console.error('  ? Error full syncing ' + collection + ': ', err);
                    _setSuppressRealtime(false);
                    resolve();
                });
            }, function(err) {
                console.error('  ? Firebase read error for ' + collection + ': ', err);
                _setSuppressRealtime(false);
                resolve();
            });
        });
    }
    
    // [Comment removed - encoding error]
    function deltaSync(collection) {
        if (!isOnline) return Promise.resolve();
        
        return getSyncMeta(collection).then(function(meta) {
            var localMaxVersion = (meta && meta.maxVersion) || 0;
            
            return new Promise(function(resolve, reject) {
                // [Comment removed - encoding error]
                // [Comment removed - encoding error]
                var ref = _getDb(collection).ref(CURRENT_SHOP_ID + '/' + collection);
                var queryRef = ref.orderByChild('_version').startAt(localMaxVersion + 1);
                
                queryRef.once('value', function(snapshot) {
                    var remote = snapshot.exists() ? (snapshot.val() || {}) : {};
                    var count = 0;
                    var newMaxVersion = localMaxVersion;
                    var dateKeys = (meta && meta.dateKeys) || [];
                    var isDateBased = DATE_BASED_COLLECTIONS[collection];
                    
                    // [Comment removed - encoding error]
                    if (collection === 'info') {
                        var infoItem = { id: 'shop_config' };
                        for (var pk in remote) {
                            if (remote.hasOwnProperty(pk)) {
                                infoItem[pk] = remote[pk];
                            }
                        }
                        if (infoItem._version === undefined) infoItem._version = 1;
                        saveToLocal(collection, infoItem).then(function() {
                            saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: infoItem._version || 1, dateKeys: [] });
                            resolve();
                        });
                        return;
                    }
                    
                    var saveChain = Promise.resolve();
                    for (var key in remote) {
                        if (remote.hasOwnProperty(key)) {
                            (function(itemKey) {
                                saveChain = saveChain.then(function() {
                                    var src = remote[itemKey];
                                    var item = { id: itemKey };
                                    for (var p in src) {
                                        if (src.hasOwnProperty(p)) {
                                            item[p] = src[p];
                                        }
                                    }
                                    if (item._version === undefined) item._version = 1;
                                    if (item._version > newMaxVersion) newMaxVersion = item._version;
                                    
                                    // Thu th?p dateKeys
                                    if (isDateBased && item.dateKey && dateKeys.indexOf(item.dateKey) < 0) {
                                        dateKeys.push(item.dateKey);
                                    }
                                    
                                    count++;
                                    return saveToLocal(collection, item);
                                });
                            })(key);
                        }
                    }
                    
                    return saveChain.then(function() {
                        // [Comment removed - encoding error]
                        // [Comment removed - encoding error]
                        return _cleanupDeletedIds(collection).then(function() {
                            saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: newMaxVersion, dateKeys: dateKeys });
                            updateMetaOnFirebase(collection, newMaxVersion);
                            resolve();
                        });
                    }).catch(function(err) {
                        console.error('  ? Error delta syncing ' + collection + ': ', err);
                        resolve();
                    });
                }, function(err) {
                    console.error('  ? Firebase query error for ' + collection + ': ', err);
                    resolve();
                });
            });
        });
    }
    
    // Chi?n lu?c cleanup d? li?u dã xóa: ch? ch?y trên các collection nh?
    // (tables, customers, menu, menu_categories, ingredients)
    // Các collection l?n nhu transactions, cost_transactions không c?n cleanup
    // vì realtime Firebase listener dã xu? lý child_removed
    var _SMALL_MASTER_COLLECTIONS = {
        tables: true, customers: true, menu: true, menu_categories: true, ingredients: true
    };
    function _cleanupDeletedIds(collection) {
        // Ch? cleanup cho small master collections
        if (!_SMALL_MASTER_COLLECTIONS[collection]) return Promise.resolve();
        if (!isOnline) return Promise.resolve();
        
        var loadMemory = Promise.resolve();
        if (!memoryCache[collection]) {
            loadMemory = loadFromLocal(collection).then(function(data) {
                if (data) {
                    memoryCache[collection] = data;
                }
            });
        }
        
        return loadMemory.then(function() {
            if (!memoryCache[collection]) return;
            
            var localIds = Object.keys(memoryCache[collection]);
            if (localIds.length === 0) return;
            
            var ref = _getDb(collection).ref(CURRENT_SHOP_ID + '/' + collection);
            
            return ref.once('value').then(function(snapshot) {
                var remoteData = snapshot.val() || {};
                var remoteIds = Object.keys(remoteData);
                
                var deletedIds = [];
                for (var i = 0; i < localIds.length; i++) {
                    if (remoteIds.indexOf(localIds[i]) === -1) {
                        deletedIds.push(localIds[i]);
                    }
                }
                
                if (deletedIds.length === 0) return;
                
                console.log('[Cleanup] Phát hi?n', deletedIds.length, 'items dã b? xóa kh?i', collection);
                
                var deleteChain = Promise.resolve();
                for (var d = 0; d < deletedIds.length; d++) {
                    (function(delId) {
                        deleteChain = deleteChain.then(function() {
                            return deleteFromLocal(collection, delId);
                        });
                    })(deletedIds[d]);
                }
                return deleteChain;
            }).catch(function(err) {
                console.warn('[Cleanup] L?i khi ki?m tra', collection, ':', err.message);
            });
        });
    }
    
    // SNAPSHOT RECONCILE: K?t h?p _cleanupDeletedIds() + fullSync() cho master collections
    // Gi?i quy?t tri?t d? v?n d?: d? li?u local l?ch v?i Firebase do:
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    function reconcileSnapshot(collection) {
        if (!isOnline) return Promise.resolve();
        var isMaster = MASTER_COLLECTIONS[collection];
        if (!isMaster) {
            // [Comment removed - encoding error]
            return Promise.resolve();
        }
        console.log('?? Reconcile snapshot for:', collection);
        // [Comment removed - encoding error]
        return _cleanupDeletedIds(collection).then(function() {
            // [Comment removed - encoding error]
            // [Comment removed - encoding error]
            return saveSyncMeta(collection, { lastSyncAt: 0, maxVersion: 0, dateKeys: [] });
        }).then(function() {
            // [Comment removed - encoding error]
            return fullSync(collection);
        });
    }
    
    // [Comment removed - encoding error]
    var _fetchingDateKeys = {};
    
    // [Comment removed - encoding error]
    function syncCollectionByDate(collection, dateKey) {
        if (!isOnline) return Promise.resolve([]);
        
        // [Comment removed - encoding error]
        var fetchKey = collection + '|' + dateKey;
        if (_fetchingDateKeys[fetchKey]) {
            return _fetchingDateKeys[fetchKey];
        }
        
        var promise = _doSyncCollectionByDate(collection, dateKey);
        _fetchingDateKeys[fetchKey] = promise;
        
        // [Comment removed - encoding error]
        return promise.then(function(result) {
            delete _fetchingDateKeys[fetchKey];
            return result;
        }).catch(function(err) {
            delete _fetchingDateKeys[fetchKey];
            throw err;
        });
    }
    
    function _doSyncCollectionByDate(collection, dateKey) {
        return getSyncMeta(collection).then(function(meta) {
            var dateKeys = (meta && meta.dateKeys) || [];
            
            // [Comment removed - encoding error]
            if (dateKeys.indexOf(dateKey) >= 0) {
                // Nhung v?n d?c t? local d? tr? v?
                return loadFromLocal(collection).then(function(data) {
                    var filtered = [];
                    for (var i = 0; i < data.length; i++) {
                        if (data[i].dateKey === dateKey) filtered.push(data[i]);
                    }
                    return filtered;
                });
            }
            
            // [Comment removed - encoding error]
            console.log('  ?? Fetching', collection, 'for date:', dateKey);
            
            return new Promise(function(resolve, reject) {
                // [Comment removed - encoding error]
                var ref = _getDb(collection).ref(CURRENT_SHOP_ID + '/' + collection);
                ref.orderByChild('dateKey').equalTo(dateKey).once('value', function(snapshot) {
                    if (!snapshot.exists()) {
                        // [Comment removed - encoding error]
                        // [Comment removed - encoding error]
                        if (dateKeys.indexOf(dateKey) < 0) {
                            dateKeys.push(dateKey);
                        }
                        saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: (meta && meta.maxVersion) || 0, dateKeys: dateKeys });
                        console.log('  ?? Fetched', collection, 'for', dateKey, ': 0 items (no data)');
                        resolve([]);
                        return;
                    }
                    
                    var remote = snapshot.val() || {};
                    var items = [];
                    var maxVersion = (meta && meta.maxVersion) || 0;
                    
                    var saveChain = Promise.resolve();
                    for (var key in remote) {
                        if (remote.hasOwnProperty(key)) {
                            (function(itemKey) {
                                saveChain = saveChain.then(function() {
                                    var src = remote[itemKey];
                                    var item = { id: itemKey };
                                    for (var p in src) {
                                        if (src.hasOwnProperty(p)) {
                                            item[p] = src[p];
                                        }
                                    }
                                    if (item._version === undefined) item._version = 1;
                                    if (item._version > maxVersion) maxVersion = item._version;
                                    items.push(item);
                                    return saveToLocal(collection, item);
                                });
                            })(key);
                        }
                    }
                    
                    return saveChain.then(function() {
                        // C?p nh?t dateKeys
                        if (dateKeys.indexOf(dateKey) < 0) {
                            dateKeys.push(dateKey);
                        }
                        saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: maxVersion, dateKeys: dateKeys });
                        updateMetaOnFirebase(collection, maxVersion);
                        console.log('  ?? Fetched', collection, 'for', dateKey, ':', items.length, 'items');
                        resolve(items);
                    }).catch(function(err) {
                        console.error('  ? Error fetching', collection, 'by date:', err);
                        resolve([]);
                    });
                }, function(err) {
                    console.error('  ? Firebase query error:', err);
                    resolve([]);
                });
            });
        });
    }
    
    // [Comment removed - encoding error]
    function getDateKeysBetween(startDateKey, endDateKey) {
        var keys = [];
        var start = new Date(startDateKey + 'T00:00:00');
        var end = new Date(endDateKey + 'T00:00:00');
        var current = new Date(start);
        while (current <= end) {
            var y = current.getFullYear();
            var m = ('0' + (current.getMonth() + 1)).slice(-2);
            var d = ('0' + current.getDate()).slice(-2);
            keys.push(y + '-' + m + '-' + d);
            current.setDate(current.getDate() + 1);
        }
        return keys;
    }

    // Init IndexedDB
    function initLocalDB() {
        if (dbReady) return dbReady;
        dbReady = new Promise(function(resolve, reject) {
            var request = indexedDB.open(STORE_NAME, 19);
            request.onerror = function(e) { reject(e.target.error); };
            request.onsuccess = function(e) {
                localDB = e.target.result;
                loadSyncQueue();
                resolve(localDB);
            };
            request.onupgradeneeded = function(e) {
                var db = e.target.result;
                var stores = [
    'tables', 'customers', 'menu', 'menu_categories',
    'ingredients', 'transactions', 'reports', 'sync_queue', 'staffs',
    'cost_categories', 'cost_transactions', 'cost_transactions_admin',
    'admin_cost_categories', 'daily_balances',
    'inventory_transactions', 'manager_cash_pickups',
    'ingredient_transactions', 'notifications',
    'info',
    'messages',
    'delete_logs',
    'sync_meta'
];
                for (var i = 0; i < stores.length; i++) {
                    if (!db.objectStoreNames.contains(stores[i])) {
                        db.createObjectStore(stores[i], { keyPath: 'id' });
                        console.log('Created store:', stores[i]);
                    }
                }
                // FIX: Kiểm tra transaction tồn tại trước khi tạo index
                // Tránh lỗi khi database vừa được tạo mới (sau khi xóa)
                try {
                    var tx = e.target.transaction;
                    
                    // FIX: Xóa dữ liệu cũ trong info store (các item lẻ từ child_* events)
                    // Sau khi chuyển sang on('value'), chỉ cần 1 item shop_config duy nhất
                    if (e.oldVersion < 17 && tx && tx.objectStoreNames.contains('info')) {
                        var infoStore = tx.objectStore('info');
                        infoStore.clear();
                        console.log('Cleared old info store data for version 17 migration');
                    }
                    
                    if (tx && tx.objectStoreNames.contains('transactions')) {
                        var txStore = tx.objectStore('transactions');
                        if (!txStore.indexNames.contains('dateKey')) txStore.createIndex('dateKey', 'dateKey', { unique: false });
                        if (!txStore.indexNames.contains('type')) txStore.createIndex('type', 'type', { unique: false });
                        if (!txStore.indexNames.contains('dateTypeKey')) txStore.createIndex('dateTypeKey', 'dateTypeKey', { unique: false });
                    }
                } catch(ex) {
                    console.warn('Could not create indexes:', ex);
                }
            };
        });
        return dbReady;
    }

    function loadSyncQueue() {
        if (!localDB) return;
        var tx = localDB.transaction(['sync_queue'], 'readonly');
        var store = tx.objectStore('sync_queue');
        var req = store.getAll();
        req.onsuccess = function() { syncQueue = req.result || []; };
    }

    // Seed dữ liệu cho POS mặc định (shop_default) nếu chưa có shop_registry
    // LUÔN ghi vào Master DB
    function seedDefaultShop() {
        return masterDb.ref('shop_registry/123123').once('value').then(function(snapshot) {
            if (snapshot.exists()) return; // Đã có rồi, không cần seed
            
            console.log('🌱 Seeding default shop data...');
            var staffId = 'staff_admin_' + Date.now().toString(36);
            var updates = {};
            
            // Tạo shop_registry cho mã 123123 -> shop_default
            updates['shop_registry/123123'] = {
                shopId: 'shop_default',
                shopName: 'He Thong Ban Hang',
                shopCode: '123123',
                createdAt: Date.now(),
                status: 'active'
            };
            
            // Tạo staff admin cho shop_default
            updates['shop_default/staffs/' + staffId] = {
                id: staffId,
                username: 'admin123123',
                password: '123123',
                displayName: 'Admin',
                role: 'admin',
                createdAt: Date.now(),
                createdBy: 'system'
            };
            
            updates['shop_default/info'] = {
                id: 'shop_config',
                name: 'He Thong Ban Hang',
                code: '123123',
                createdAt: Date.now(),
                // Telegram config
                telegramBotToken: '8813111415:AAHjX0-vXMM0dVgVqDSSZNbHtiQ2wiVsFrc',
                telegramChatId: '6372876364',
                telegramShiftCloseToken: '',
                telegramWarningToken: '',
                telegramExpenseToken: '',
                // Lock password cho hoàn tác
                lockPassword: '28122020',
                // Khung giờ khóa toàn bộ bàn
                lockStartHour: 22,
                lockEndHour: 5,
                lockEndMinute: 30,
                // Thời gian ngồi tối đa trước khi khóa bàn (giờ)
                tableLockHours: 5
            };
            
            return masterDb.ref().update(updates).then(function() {
                console.log('✅ Default shop seeded: mã 123123, user admin123123, pass 123123');
            });
        }).catch(function(err) {
            console.error('Seed error:', err);
        });
    }

    // Tự động tạo config fields cho shop hiện tại nếu chưa có
    // Dùng _getDb để chọn Master/Slave tùy theo collection
    function ensureShopConfig() {
        // Đảm bảo các config fields tồn tại trong /info
        return _getDb('info').ref(CURRENT_SHOP_ID + '/info').once('value').then(function(snapshot) {
            var info = snapshot.val() || {};
            var needsUpdate = false;
            var defaults = {
                id: 'shop_config',
                telegramBotToken: '8813111415:AAHjX0-vXMM0dVgVqDSSZNbHtiQ2wiVsFrc',
                telegramChatId: '6372876364',
                telegramShiftCloseToken: '',
                telegramWarningToken: '',
                telegramExpenseToken: '',
                lockPassword: '28122020',
                lockStartHour: 22,
                lockEndHour: 5,
                lockEndMinute: 30,
                tableLockHours: 5
            };
            var updates = {};
            for (var key in defaults) {
                if (defaults.hasOwnProperty(key)) {
                    if (info[key] === undefined || info[key] === null) {
                        updates[key] = defaults[key];
                        needsUpdate = true;
                    }
                }
            }
            if (needsUpdate) {
                console.log('⚙️ Adding missing config fields to shop info...');
                return _getDb('info').ref(CURRENT_SHOP_ID + '/info').update(updates).then(function() {
                    console.log('✅ Shop config fields created');
                });
            }
        }).catch(function(err) {
            console.error('⚠️ ensureShopConfig error:', err);
        });
    }

    
    // ========== ENSURE COLLECTION ==========
    // Kiểm tra nếu collection trống trong local thì force sync từ Firebase
    // Dùng khi component cần đảm bảo dữ liệu đã được load trước khi render
    function ensureCollection(collection) {
        if (!isOnline) return Promise.resolve([]);
        return loadFromLocal(collection).then(function(localData) {
            if (localData && Object.keys(localData).length > 0) {
                // Đã có dữ liệu, trả về dạng array
                var arr = [];
                for (var k in localData) {
                    if (localData.hasOwnProperty(k)) arr.push(localData[k]);
                }
                return arr;
            }
            // Local trống, cần sync từ Firebase
            console.log('  📦 Local empty for', collection, '- syncing from Firebase...');
            return getSyncMeta(collection).then(function(meta) {
                if (!meta) {
                    return fullSync(collection).then(function() {
                        return loadFromLocal(collection).then(function(data) {
                            var arr = [];
                            for (var k in data) {
                                if (data.hasOwnProperty(k)) arr.push(data[k]);
                            }
                            return arr;
                        });
                    });
                }
                return deltaSync(collection).then(function() {
                    return loadFromLocal(collection).then(function(data) {
                        var arr = [];
                        for (var k in data) {
                            if (data.hasOwnProperty(k)) arr.push(data[k]);
                        }
                        return arr;
                    });
                });
            });
        });
    }
// ========== FORCE SYNC TỪ FIREBASE ==========
    // Dùng khi phát hiện IndexedDB bị xóa (local rỗng) - force tải lại từ Firebase
    function forceSyncFromFirebase() {
        if (!isOnline) {
            console.warn('⚠️ Offline, cannot force sync from Firebase');
            return Promise.reject(new Error('Offline'));
        }
        // [Comment removed - encoding error]
        // [Comment removed - encoding error]
        var collections = [
            'tables', 'customers', 'menu', 'menu_categories',
            'ingredients', 'transactions',
            'cost_categories', 'cost_transactions',
            'daily_balances',
            'inventory_transactions', 'manager_cash_pickups',
            'ingredient_transactions', 'notifications',
            'info',
            'messages'
        ];
        
        console.log('🔄 Force syncing all collections from Firebase...');
        
        // Xóa sync_meta cache để fullSync chạy lại từ đầu
        syncMetaCache = {};
        
        var chain = Promise.resolve();
        for (var c = 0; c < collections.length; c++) {
            chain = chain.then((function(collection) {
                return function() {
                    // Xóa local cache trước khi fullSync
                    if (memoryCache[collection]) {
                        memoryCache[collection] = {};
                    }
                    return fullSync(collection);
                };
            })(collections[c]));
        }
        
        // Lưu promise để các component có thể đợi force sync hoàn thành
        _syncPromise = chain.then(function() {
            console.log('✅ Force sync completed');
        });
        return _syncPromise;
    }

    // Init Database
    function initDatabase() {
        // [Comment removed - encoding error]
        _restoreDirtyFlags();
        // [Comment removed - encoding error]
        // [Comment removed - encoding error]
        // [Comment removed - encoding error]
        var slaveReady = _slaveInitPromise || Promise.resolve();
        return slaveReady.then(function() {
            return initLocalDB();
        }).then(function() {
            initNetwork();
            if (isOnline) return smartSync();
            return Promise.resolve();
        }).then(function() {
            // Seed dữ liệu mặc định nếu chưa có
            return seedDefaultShop();
        }).then(function() {
            // Tự động tạo config fields cho shop hiện tại nếu chưa có
            return ensureShopConfig();
        }).then(function() {
            // Subscribe các collections cần thiết cho POS
            // tables, customers, menu, menu_categories, transactions, notifications
            // Bỏ: ingredients, cost_categories, cost_transactions, cost_transactions_admin,
            //      admin_cost_categories, reports
            // OPTIMIZE: transactions dùng limitToLast(200) để chỉ lấy 200 giao dịch gần nhất
            // Giảm dung lượng download từ hàng ngàn item xuống 200 item
            subscribeToCollection('tables');
            // FIX: Cleanup deleted IDs ngay sau khi subscribe tables
            // [Comment removed - encoding error]
            // tru?c khi loadData() d?c tables
            // [Comment removed - encoding error]
            // [Comment removed - encoding error]
            _cleanupDeletedIds('tables').then(function() {
                subscribeToCollection('customers');
                // Transactions subscribe binh thuong, khong limitToLast
                // Safari iOS miss child_removed la loi trinh duyet, bo qua
                subscribeToCollection('transactions');
                subscribeToCollection('notifications');
                subscribeToCollection('info');
                subscribeToCollection('daily_balances');
                // FIX: Thêm subscribe cho cost_categories và cost_transactions
                // để loadExpenseData() và managerApplyFilter() có dữ liệu
                subscribeToCollection('cost_categories');
                subscribeToCollection('cost_transactions');
                // REALTIME OPTIMIZATION: Chuyen menu, menu_categories, ingredients, messages
                // tu polling (60s) sang realtime Firebase listeners
                // Giup da thiet bi thay thay doi ngay lap tuc thay vi cho 60s
                subscribeToCollection('menu');
                subscribeToCollection('menu_categories');
                subscribeToCollection('ingredients');
                subscribeToCollection('messages');
                // REALTIME OPTIMIZATION: Khoi tao BroadcastChannel va Heartbeat
                _initBroadcastChannel();
                // FIX: Khoi tao lastSyncTimestamps cho cac collection da subscribe
                // de heartbeat khong bao sai staffs, admin_logs, etc.
                var subscribedCollections = [
                    'tables', 'customers', 'transactions', 'notifications', 'info',
                    'daily_balances', 'cost_categories', 'cost_transactions',
                    'menu', 'menu_categories', 'ingredients', 'messages'
                ];
                var now = Date.now();
                for (var _si = 0; _si < subscribedCollections.length; _si++) {
                    _lastSyncTimestamps[subscribedCollections[_si]] = now;
                }
                _initHeartbeat();
                console.log('✅ Database ready, device:', CURRENT_DEVICE_ID);
                return { isOnline: isOnline, deviceId: CURRENT_DEVICE_ID };
            });
        });
    }

    // Helper showToast (dùng chung)
    function showToast(msg, type) {
        var container = document.getElementById('toastContainer');
        if (!container) { console.log(msg); return; }
        var toast = document.createElement('div');
        toast.className = 'toast ' + (type || 'info');
        toast.innerText = msg;
        container.appendChild(toast);
        setTimeout(function() { toast.remove(); }, 2500);
    }

        // ========== REALTIME OPTIMIZATION: BroadcastChannel cho Cross-Tab Sync ==========
    // Cho phep cac tab tren cung thiet bi giao tiep truc tiep voi nhau
    // Khi Tab A thay doi du lieu -> broadcast message -> Tab B cap nhat UI ngay lap tuc
    // Ma khong can cho Firebase realtime listener fire
    var _broadcastChannel = null;
    var _broadcastSupported = (typeof BroadcastChannel !== 'undefined');
    
    // Khoi tao BroadcastChannel
    function _initBroadcastChannel() {
        if (!_broadcastSupported) {
            // Fallback: dung storage event cho cac trinh duyet cu
            window.addEventListener('storage', function(e) {
                if (e.key && e.key.indexOf('pos_broadcast_') === 0) {
                    try {
                        var msg = JSON.parse(e.newValue);
                        _handleBroadcastMessage(msg);
                    } catch(ex) {}
                }
            });
            return;
        }
        try {
            _broadcastChannel = new BroadcastChannel('pos_realtime_' + CURRENT_SHOP_ID);
            _broadcastChannel.onmessage = function(event) {
                _handleBroadcastMessage(event.data);
            };
        } catch(e) {
            console.warn('BroadcastChannel not supported, using storage fallback');
            _broadcastSupported = false;
        }
    }
    
    // Gui thong diep qua BroadcastChannel
    function _broadcastChange(collection, type, itemId) {
        var msg = {
            collection: collection,
            type: type,
            itemId: itemId,
            shopId: CURRENT_SHOP_ID,
            deviceId: CURRENT_DEVICE_ID,
            timestamp: Date.now()
        };
        if (_broadcastSupported && _broadcastChannel) {
            try {
                _broadcastChannel.postMessage(msg);
            } catch(e) {}
        }
        // Fallback: dung localStorage de trigger storage event
        try {
            var key = 'pos_broadcast_' + Date.now();
            localStorage.setItem(key, JSON.stringify(msg));
            // Xoa ngay de tranh day localStorage
            setTimeout(function() { localStorage.removeItem(key); }, 100);
        } catch(e) {}
    }
    
    // Xu ly thong diep nhan duoc
    function _handleBroadcastMessage(msg) {
        if (!msg || !msg.collection || msg.deviceId === CURRENT_DEVICE_ID) return;
        // Chi xu ly neu cung shop
        if (msg.shopId !== CURRENT_SHOP_ID) return;
        
        console.log('[Broadcast] Nhan thong diep tu tab khac:', msg.collection, msg.type);
        
        // Kich hoat smartSync cho collection do de cap nhat du lieu
        if (isOnline) {
            smartSync(msg.collection);
        }
    }
    
    // Goi _initBroadcastChannel ngay sau khi khoi tao
    // (se duoc goi tu initDatabase)
    // ========== REALTIME OPTIMIZATION: Heartbeat & Connection Indicator ==========
    // Muc dich: Phat hien stale collections de tu dong smartSync
    // Indicator chi hien thi trang thai online/offline, khong bao sai khi ko co du lieu thay doi
    var _lastSyncTimestamps = {};
    var _heartbeatInterval = null;
    var _lastHeartbeatTime = 0;
    
    // Cap nhat lastSyncTimestamp cho collection
    function _updateLastSyncTime(collection) {
        _lastSyncTimestamps[collection] = Date.now();
        _updateSyncIndicator();
    }
    
    // Khoi tao heartbeat timer
    function _initHeartbeat() {
        if (_heartbeatInterval) clearInterval(_heartbeatInterval);
        _lastHeartbeatTime = Date.now();
        _heartbeatInterval = setInterval(function() {
            var now = Date.now();
            var staleCollections = [];
            for (var col in _lastSyncTimestamps) {
                if (_lastSyncTimestamps.hasOwnProperty(col)) {
                    var elapsed = now - _lastSyncTimestamps[col];
                    // Neu qua 120s khong co sync, danh dau la stale
                    // Tang len 120s de tranh bao sai khi khong co du lieu thay doi
                    if (elapsed > 120000 && isOnline) {
                        staleCollections.push(col);
                    }
                }
            }
            if (staleCollections.length > 0 && isOnline) {
                // Tu dong smartSync cho cac collection bi stale (khong warning)
                // Goi smartSync() khong tham so de chay bulk sync tat ca collections
                // Tranh goi tung collection rieng le gay spam log va cham
                smartSync();
            }
            // Cap nhat indicator: online = xanh, offline = do
            _lastHeartbeatTime = now;
            _updateSyncIndicator();
        }, 30000); // Kiem tra moi 30s
    }
    
    // Cap nhat sync indicator tren UI - doi mau ten nhan vien theo trang thai online/offline
    function _updateSyncIndicator() {
        var staffEl = document.getElementById('staffName');
        if (!staffEl) return;
        if (!isOnline) {
            staffEl.className = 'staff-name staff-offline';
            return;
        }
        staffEl.className = 'staff-name staff-online';
    }
    

    // Patch _notifyLocal de cap nhat lastSyncTime va broadcast sang tab khac
    var _origNotifyLocal = _notifyLocal;
    _notifyLocal = function(collection, changeInfo) {
        _updateLastSyncTime(collection);
        // REALTIME OPTIMIZATION: Broadcast thay doi sang cac tab khac tren cung thiet bi
        if (changeInfo && changeInfo.type) {
            _broadcastChange(collection, changeInfo.type, changeInfo.id || null);
        }
        return _origNotifyLocal(collection, changeInfo);
    };
// ========== AUTH METHODS ==========
    
    // Xóa toàn bộ dữ liệu local (IndexedDB + localStorage + memory cache) khi chuyển POS
    function clearLocalData() {
        // FIX: Huy tat ca Firebase listeners de tranh memory leak va double callback
        _destroyAllListeners();
        
        // FIX: Xoa local callbacks, event bus, component registry
        _localCallbacks = {};
        _eventBus = {};
        _componentRegistry = {};
        _lastSyncTimestamps = {};
        _pendingNotifyCollections = {};
        
        // Xóa memory cache
        memoryCache = {};
        cacheVersion = {};
        syncMetaCache = {};
        
        // Xóa sync_meta trong localStorage
        try {
            var lsPrefix = LS_SYNC_META_PREFIX + CURRENT_SHOP_ID + '_';
            var keysToRemove = [];
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf(lsPrefix) === 0) {
                    keysToRemove.push(key);
                }
            }
            for (var i = 0; i < keysToRemove.length; i++) {
                localStorage.removeItem(keysToRemove[i]);
            }
        } catch (e) {}
        
        // Xóa tất cả object stores trong IndexedDB
        if (!localDB) return Promise.resolve();
        
        var storeNames = [];
        for (var i = 0; i < localDB.objectStoreNames.length; i++) {
            storeNames.push(localDB.objectStoreNames[i]);
        }
        var promises = [];
        for (var i = 0; i < storeNames.length; i++) {
            var name = storeNames[i];
            if (name === 'sync_queue') continue; // Giữ lại sync queue
            promises.push(new Promise(function(resolve, reject) {
                var tx = localDB.transaction([name], 'readwrite');
                var store = tx.objectStore(name);
                var req = store.clear();
                req.onsuccess = function() { resolve(); };
                req.onerror = function() { reject(req.error); };
            }));
        }
        return Promise.all(promises).then(function() {
            console.log('🗑️ Cleared all local data for shop switch');
        });
    }
    
    // [Comment removed - encoding error]
    function setShopId(shopId) {
        if (!shopId) return;
        CURRENT_SHOP_ID = shopId;
        localStorage.setItem('current_shop_id', shopId);
        console.log('🔄 Switched to shop:', shopId);
    }
    
    // Lấy shopId hiện tại
    function getShopId() {
        return CURRENT_SHOP_ID;
    }
    
    // FIX: Hàm helper set currentUser và lưu session, dùng chung cho cả 3 branch của login()
    // Tránh bug login() trả về undefined ở branch có firebase_config riêng
    function _setCurrentUserAndSession(foundStaff, shopId, shopCode, shopInfo, hasCustomConfig) {
        currentUser = {
            id: foundStaff.id,
            username: foundStaff.username,
            displayName: foundStaff.displayName || foundStaff.username,
            role: foundStaff.role || 'staff',
            shopId: shopId,
            shopCode: shopCode,
            shopName: shopInfo.shopName || '',
            hasCustomConfig: hasCustomConfig
        };
        localStorage.setItem('pos_session', JSON.stringify(currentUser));
        setShopId(shopId);
        return currentUser;
    }
    
    // Đăng nhập: kiểm tra shopCode -> lấy shopId -> verify staff credentials
    // Hỗ trợ: master_admin (shopCode='master'), POS có firebase_config riêng, migration tự động
        function login(shopCode, username, password) {
        if (!shopCode || !username || !password) {
            return Promise.reject(new Error('Vui long nhap day du thong tin'));
        }

        // ===== TRU?NG H?P 1: Master Admin login =====
        if (shopCode === 'master') {
            return masterDb.ref('master_admins').once('value').then(function(snapshot) {
                var admins = snapshot.val() || {};
                var foundAdmin = null;
                for (var key in admins) {
                    if (admins.hasOwnProperty(key)) {
                        var a = admins[key];
                        if (a.username === username && a.password === password) {
                            foundAdmin = a;
                            foundAdmin.id = key;
                            break;
                        }
                    }
                }
                if (!foundAdmin) {
                    throw new Error('Sai ten dang nhap hoac mat khau Master Admin');
                }
                // [Comment removed - encoding error]
                currentUser = {
                    id: foundAdmin.id,
                    username: foundAdmin.username,
                    displayName: foundAdmin.displayName || foundAdmin.username,
                    role: 'master_admin',
                    shopId: 'master',
                    shopCode: 'master',
                    shopName: 'Master Admin'
                };
                localStorage.setItem('pos_session', JSON.stringify(currentUser));
                setShopId('master');
                // [Comment removed - encoding error]
                if (slaveApp) {
                    try { slaveApp.delete(); } catch(e) {}
                    slaveApp = null;
                    slaveDb = null;
                    slaveConfig = null;
                }
                return currentUser;
            });
        }

        // [Comment removed - encoding error]
        // [Comment removed - encoding error]
        return masterDb.ref('shop_registry/' + shopCode).once('value').then(function(snapshot) {
            if (!snapshot.exists()) {
                throw new Error('Ma POS khong ton tai');
            }
            var shopInfo = snapshot.val();
            var shopId = shopInfo.shopId;

            // [Comment removed - encoding error]
            if (shopInfo.status === 'locked') {
                throw new Error('POS nay da bi khoa. Vui long lien he Admin Master.');
            }
            if (shopInfo.status === 'deleted') {
                throw new Error('POS nay da bi xoa. Vui long lien he Admin Master.');
            }

            // [Comment removed - encoding error]
            var fbConfig = shopInfo.firebaseConfig || null;
            // [Comment removed - encoding error]
            var _fbConfigFallback = null;
            if (!fbConfig) {
                _fbConfigFallback = masterDb.ref('firebase_config/' + shopId).once('value').then(function(configSnapshot) {
                    fbConfig = configSnapshot.val() || null;
                });
            } else {
                _fbConfigFallback = Promise.resolve();
            }

            return _fbConfigFallback.then(function() {
                // [Comment removed - encoding error]
                return masterDb.ref(shopId + '/staffs').once('value').then(function(staffSnapshot) {
                    var staffs = staffSnapshot.val() || {};
                    var foundStaff = null;
                    for (var key in staffs) {
                        if (staffs.hasOwnProperty(key)) {
                            var s = staffs[key];
                            if (s.username === username && s.password === password) {
                                foundStaff = s;
                                foundStaff.id = key;
                                break;
                            }
                        }
                    }
                    if (!foundStaff) {
                        throw new Error('Sai ten dang nhap hoac mat khau');
                    }

                    // [Comment removed - encoding error]
                    var oldShopId = localStorage.getItem('current_shop_id');
                    var isSwitchingShop = oldShopId && oldShopId !== shopId;
                    
                    if (isSwitchingShop) {
                        console.log('Phat hien chuyen POS tu', oldShopId, '->', shopId, 'dang clear cache cu...');
                        // Clear memory cache ngay l?p t?c
                        memoryCache = {};
                        cacheVersion = {};
                        syncMetaCache = {};
                        // [Comment removed - encoding error]
                        try {
                            var oldLsPrefix = LS_SYNC_META_PREFIX + oldShopId + '_';
                            var keysToRemove = [];
                            for (var i = 0; i < localStorage.length; i++) {
                                var key = localStorage.key(i);
                                if (key && key.indexOf(oldLsPrefix) === 0) {
                                    keysToRemove.push(key);
                                }
                            }
                            for (var i = 0; i < keysToRemove.length; i++) {
                                localStorage.removeItem(keysToRemove[i]);
                            }
                        } catch (e) {}
                    }

                    var hasCustomConfig = !!fbConfig;
                    _setCurrentUserAndSession(foundStaff, shopId, shopCode, shopInfo, hasCustomConfig);

                    // [Comment removed - encoding error]
                    // [Comment removed - encoding error]
                    var _slaveInitPromiseForLogin = null;
                    
                    if (fbConfig) {
                        // [Comment removed - encoding error]
                        var oldConfigHash = localStorage.getItem(CONFIG_HASH_KEY);
                        var newConfigHash = _getConfigHash(fbConfig);

                        _slaveInitPromiseForLogin = _initSlaveApp(shopId, fbConfig).then(function() {
                            // [Comment removed - encoding error]
                            if (oldConfigHash && oldConfigHash !== 'master' && oldConfigHash !== newConfigHash) {
                                console.log('Phat hien thay doi Firebase config, chuan bi migration...');
                                return _migrateData(shopId, masterDb, slaveDb).then(function() {
                                    localStorage.setItem(CONFIG_HASH_KEY, newConfigHash);
                                    console.log('Migration hoan tat cho', shopId);
                                });
                            } else {
                                localStorage.setItem(CONFIG_HASH_KEY, newConfigHash);
                            }
                        }).catch(function(err) {
                            console.error('?? L?i init Slave:', err);
                        });
                    } else {
                        // [Comment removed - encoding error]
                        localStorage.setItem(CONFIG_HASH_KEY, 'master');
                        // H?y Slave n?u dang t?n t?i
                        if (slaveApp) {
                            try { slaveApp.delete(); } catch(e) {}
                            slaveApp = null;
                            slaveDb = null;
                            slaveConfig = null;
                        }
                        _slaveInitPromiseForLogin = Promise.resolve();
                    }

                    // [Comment removed - encoding error]
                    // [Comment removed - encoding error]
                    if (isSwitchingShop) {
                        // [Comment removed - encoding error]
                        // [Comment removed - encoding error]
                        return (_slaveInitPromiseForLogin || Promise.resolve()).then(function() {
                            if (!localDB) return currentUser;
                            var storeNames = [];
                            for (var i = 0; i < localDB.objectStoreNames.length; i++) {
                                storeNames.push(localDB.objectStoreNames[i]);
                            }
                            var promises = [];
                            for (var i = 0; i < storeNames.length; i++) {
                                var name = storeNames[i];
                                if (name === 'sync_queue') continue;
                                promises.push(new Promise(function(resolve, reject) {
                                    var tx = localDB.transaction([name], 'readwrite');
                                    var store = tx.objectStore(name);
                                    var req = store.clear();
                                    req.onsuccess = function() { resolve(); };
                                    req.onerror = function() { reject(req.error); };
                                }));
                            }
                            return Promise.all(promises).then(function() {
                                console.log('??? Cleared IndexedDB data for shop switch to', shopId);
                                return currentUser;
                            });
                        });
                    }

                    // [Comment removed - encoding error]
                    return currentUser;
                });
            });
        });
    }function registerShop(shopName, shopCode, adminUser, adminPass, firebaseConfig) {
        if (!shopName || !shopCode || !adminUser || !adminPass) {
            return Promise.reject(new Error('Vui lòng nhập đầy đủ thông tin'));
        }
        if (shopCode.length < 3) {
            return Promise.reject(new Error('Mã POS phải có ít nhất 3 ký tự'));
        }
        if (adminPass.length < 4) {
            return Promise.reject(new Error('Mật khẩu phải có ít nhất 4 ký tự'));
        }
        
        console.log('🔄 registerShop() - Đăng ký POS mới:', { shopName: shopName, shopCode: shopCode, adminUser: adminUser, hasCustomConfig: !!firebaseConfig });
        
        // Kiểm tra shopCode đã tồn tại chưa (LUÔN ở Master)
        return masterDb.ref('shop_registry/' + shopCode).once('value').then(function(snapshot) {
            if (snapshot.exists()) {
                throw new Error('Mã POS này đã được đăng ký');
            }
            
            // Tạo shopId
            var shopId = 'shop_' + shopCode.toLowerCase();
            
            // Tạo staff admin
            var staffId = 'staff_' + Date.now().toString(36);
            var staffData = {
                id: staffId,
                username: adminUser,
                password: adminPass,
                displayName: adminUser,
                role: 'admin',
                createdAt: Date.now(),
                createdBy: 'system'
            };
            
            // Tạo shop_registry entry
            var registryData = {
                shopId: shopId,
                shopName: shopName,
                shopCode: shopCode,
                createdAt: Date.now(),
                status: 'active',
                hasCustomConfig: !!firebaseConfig,
                firebaseConfig: firebaseConfig || null
            };
            
            // Batch write: shop_registry + shop data + staff (LUÔN ở Master)
            var updates = {};
            updates['shop_registry/' + shopCode] = registryData;
            updates[shopId + '/staffs/' + staffId] = staffData;
            updates[shopId + '/info'] = {
                id: 'shop_config',
                name: shopName,
                code: shopCode,
                createdAt: Date.now()
            };
            
            // [Comment removed - encoding error]
            var _slaveInitPromise = null;
            if (firebaseConfig) {
                _slaveInitPromise = _initSlaveApp(shopId, firebaseConfig).then(function() {
                    return slaveDb.ref(shopId + '/staffs/' + staffId).set(staffData);
                });
            }
            return masterDb.ref().update(updates).then(function() {
                console.log('✅ registerShop() - POS đã được tạo:', { shopId: shopId, shopCode: shopCode });
                // Xóa dữ liệu local cũ trước khi chuyển POS mới
                return clearLocalData();
            }).then(function() {
                if (_slaveInitPromise) return _slaveInitPromise;
            }).then(function() {
                // Tự động đăng nhập sau khi đăng ký
                currentUser = {
                    id: staffId,
                    username: adminUser,
                    displayName: adminUser,
                    role: 'admin',
                    shopId: shopId,
                    shopCode: shopCode,
                    shopName: shopName,
                    hasCustomConfig: !!firebaseConfig
                };
                localStorage.setItem('pos_session', JSON.stringify(currentUser));
                setShopId(shopId);
                return currentUser;
            });
        });
    }
    
    // Tạo nhân viên mới (chỉ admin)
    function createStaff(staffData) {
        if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'master_admin')) {
            return Promise.reject(new Error('Chỉ admin mới có thể tạo nhân viên'));
        }
        if (!staffData.username || !staffData.password) {
            return Promise.reject(new Error('Vui lòng nhập tên đăng nhập và mật khẩu'));
        }
        
        var staffId = 'staff_' + Date.now().toString(36);
        var data = {
            id: staffId,
            username: staffData.username,
            password: staffData.password,
            displayName: staffData.displayName || staffData.username,
            role: staffData.role || 'staff',
            createdAt: Date.now(),
            createdBy: currentUser.id
        };
        
        // Staff ghi vào Master (luôn) và Slave (nếu có custom config)
        var ref = masterDb.ref(CURRENT_SHOP_ID + '/staffs/' + staffId);
        return ref.set(data).then(function() {
            // Nếu có custom Firebase config, ghi staff vào Slave Firebase
            if (slaveDb && slaveConfig) {
                return slaveDb.ref(CURRENT_SHOP_ID + '/staffs/' + staffId).set(data);
            }
        }).then(function() {
            // Lưu vào IndexedDB local
            return saveToLocal('staffs', data);
        }).then(function() {
            return data;
        });
    }
    
    // Lấy danh sách nhân viên
    function getStaffs() {
        // Ưu tiên đọc từ local cache trước
        return getAll('staffs').then(function(localStaffs) {
            // Nếu có local cache, trả về ngay
            if (localStaffs && localStaffs.length > 0) {
                // [Comment removed - encoding error]
                var _staffRef = masterDb.ref(CURRENT_SHOP_ID + '/staffs');
                _staffRef.once('value').then(function(snapshot) {
                    var data = snapshot.val() || {};
                    for (var key in data) {
                        if (data.hasOwnProperty(key)) {
                            var item = data[key];
                            item.id = key;
                            saveToLocal('staffs', item);
                        }
                    }
                }).catch(function() {
                    // Lỗi Firebase, bỏ qua
                });
                return localStaffs;
            }
            // Không có local cache, fetch từ Firebase (Slave nếu có, Master nếu không)
            var _staffRef = masterDb.ref(CURRENT_SHOP_ID + '/staffs');
            return _staffRef.once('value').then(function(snapshot) {
                var data = snapshot.val() || {};
                var list = [];
                for (var key in data) {
                    if (data.hasOwnProperty(key)) {
                        var item = data[key];
                        item.id = key;
                        list.push(item);
                    }
                }
                // Cập nhật local cache
                for (var i = 0; i < list.length; i++) {
                    saveToLocal('staffs', list[i]);
                }
                return list;
            }).catch(function() {
                // Fallback: đọc từ local
                return getAll('staffs');
            });
        });
    }
    
    // Đăng xuất
    function logout() {
        currentUser = null;
        localStorage.removeItem('pos_session');
        localStorage.removeItem(CONFIG_HASH_KEY);
        // Reset về shop mặc định
        CURRENT_SHOP_ID = 'shop_default';
        localStorage.setItem('current_shop_id', 'shop_default');
        // Hủy Slave App nếu có
        if (slaveApp) {
            try { slaveApp.delete(); } catch(e) {}
            slaveApp = null;
            slaveDb = null;
            slaveConfig = null;
        }
        console.log('👋 Logged out');
    }
    
    // Lấy thông tin user hiện tại
    function getCurrentUser() {
        return currentUser;
    }
    
    // Kiểm tra đã đăng nhập chưa
    function isLoggedIn() {
        return currentUser !== null;
    }
    
    // Kiểm tra có phải admin không (bao gồm master_admin)
    function isAdmin() {
        return currentUser && (currentUser.role === 'admin' || currentUser.role === 'master_admin');
    }

    // Đọc shop config trực tiếp từ Firebase (dùng _getDb để chọn Master/Slave)
    function getShopConfig() {
        return dbReady.then(function() {
            if (!isOnline) return Promise.resolve({});
            return _getDb('info').ref(CURRENT_SHOP_ID + '/info').once('value').then(function(snapshot) {
                return snapshot.val() || {};
            }).catch(function() {
                return {};
            });
        });
    }

    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    function getMemoryCache(collection) {
        if (memoryCache[collection]) {
            var arr = [];
            for (var key in memoryCache[collection]) {
                if (memoryCache[collection].hasOwnProperty(key)) {
                    arr.push(memoryCache[collection][key]);
                }
            }
            return arr.length > 0 ? arr : null;
        }
        return null;
    }

    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    function getAllShops() {
        return masterDb.ref('shop_registry').once('value').then(function(snapshot) {
            var registry = snapshot.val() || {};
            var shopCodes = Object.keys(registry);
            var promises = shopCodes.map(function(code) {
                return _getShopStaff(code, registry[code]);
            });
            return Promise.all(promises).then(function(shops) {
                // S?p x?p theo th?i gian t?o m?i nh?t
                shops.sort(function(a, b) { return b.createdAt - a.createdAt; });
                return shops;
            });
        });
    }
    
    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    function _getShopStaff(code, info) {
        return _readStaffFromMaster(code, info);
    }
    
    // Helper: d?c staff t? Master Firebase
    function _readStaffFromMaster(code, info) {
        return masterDb.ref(info.shopId + '/staffs').once('value').then(function(staffSnap) {
            var staffs = staffSnap.val() || {};
            var adminStaff = null;
            for (var key in staffs) {
                if (staffs.hasOwnProperty(key)) {
                    var s = staffs[key];
                    if (s.role === 'admin') {
                        adminStaff = s;
                        adminStaff.id = key;
                        break;
                    }
                }
            }
            return {
                shopCode: code,
                shopId: info.shopId,
                shopName: info.shopName || '',
                status: info.status || 'active',
                createdAt: info.createdAt || 0,
                hasCustomConfig: !!info.hasCustomConfig,
                adminUsername: adminStaff ? adminStaff.username : '',
                adminPassword: adminStaff ? adminStaff.password : ''
            };
        }).catch(function() {
            return {
                shopCode: code,
                shopId: info.shopId,
                shopName: info.shopName || '',
                status: info.status || 'active',
                createdAt: info.createdAt || 0,
                hasCustomConfig: !!info.hasCustomConfig,
                adminUsername: '',
                adminPassword: ''
            };
        });
    }
    // [Comment removed - encoding error]
    function updateShopStatus(shopCode, newStatus) {
        return masterDb.ref('shop_registry/' + shopCode + '/status').set(newStatus).then(function() {
            return { success: true, shopCode: shopCode, status: newStatus };
        });
    }

    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    function updateShopAdmin(shopCode, shopId, newUsername, newPassword) {
        return _updateAdminInMaster(shopId, newUsername, newPassword).then(function() {
            return { success: true, shopCode: shopCode };
        });
    }
    
    // [Comment removed - encoding error]
    function _updateAdminInMaster(shopId, newUsername, newPassword) {
        return masterDb.ref(shopId + '/staffs').once('value').then(function(snapshot) {
            var staffs = snapshot.val() || {};
            var adminId = null;
            for (var key in staffs) {
                if (staffs.hasOwnProperty(key)) {
                    var s = staffs[key];
                    if (s.role === 'admin') {
                        adminId = key;
                        break;
                    }
                }
            }
            if (!adminId) {
                throw new Error('Khong tim thay tai khoan admin cua POS nay');
            }
            
            var updates = {};
            if (newUsername) updates[shopId + '/staffs/' + adminId + '/username'] = newUsername;
            if (newPassword) updates[shopId + '/staffs/' + adminId + '/password'] = newPassword;
            return masterDb.ref().update(updates);
        });
    }

    // [Comment removed - encoding error]
    // [Comment removed - encoding error]
    function changePassword(shopId, staffId, newPassword) {
        if (!currentUser) {
            return Promise.reject(new Error('Chua dang nh?p'));
        }
        if (currentUser.role !== 'admin' && currentUser.role !== 'master_admin') {
            return Promise.reject(new Error('Chi admin moi co the doi mat khau'));
        }
        if (!newPassword || newPassword.length < 4) {
            return Promise.reject(new Error('Mat khau moi phai co it nhat 4 ky tu'));
        }
        
        console.log('changePassword() - Doi mat khau cho staff:', { shopId: shopId, staffId: staffId });
        
        // [Comment removed - encoding error]
        var masterUpdates = {};
        masterUpdates[shopId + '/staffs/' + staffId + '/password'] = newPassword;
        
        return masterDb.ref().update(masterUpdates).then(function() {
            // [Comment removed - encoding error]
            if (slaveDb && slaveConfig) {
                return slaveDb.ref(shopId + '/staffs/' + staffId + '/password').set(newPassword);
            }
        }).then(function() {
            // C?p nh?t currentUser trong memory
            if (currentUser) {
                currentUser.password = newPassword;
            }
            // C?p nh?t session trong localStorage
            var session = localStorage.getItem('pos_session');
            if (session) {
                try {
                    var sessionData = JSON.parse(session);
                    sessionData.password = newPassword;
                    localStorage.setItem('pos_session', JSON.stringify(sessionData));
                } catch(e) {}
            }
            console.log('changePassword() - Da doi mat khau thanh cong');
            return { success: true };
        });
    }

    // [Comment removed - encoding error]
    function createMasterAdmin(username, password, displayName) {
        if (!username || !password) {
            return Promise.reject(new Error('Vui long nhap ten dang nhap va mat khau'));
        }
        if (password.length < 4) {
            return Promise.reject(new Error('Mat khau phai co it nhat 4 ky tu'));
        }
        
        console.log('?? createMasterAdmin() - T?o master admin m?i:', { username: username });
        
        var adminId = 'master_' + Date.now().toString(36);
        var adminData = {
            id: adminId,
            username: username,
            password: password,
            displayName: displayName || username,
            role: 'master_admin',
            createdAt: Date.now(),
            createdBy: currentUser ? currentUser.id : 'system'
        };
        
        return masterDb.ref('master_admins/' + adminId).set(adminData).then(function() {
            console.log('createMasterAdmin() - Da tao master admin:', { adminId: adminId, username: username });
            return adminData;
        });
    }

    // Export
    window.DB = {
        init: initDatabase,
        create: create,
        update: update,
        remove: remove,
        get: get,
        getAll: getAll,
        getTransactionsByDate: getTransactionsByDate,
        getTransactionsByDateRange: getTransactionsByDateRange,
        subscribe: subscribeToCollection,
        subscribeWithPolling: subscribeWithPolling,
        // NANG CAP: Event Bus API - Reactive Layer Giai doan 1
        on: function(eventType, callback) { return _on(eventType, callback); },
        off: function(eventType, callback) { _off(eventType, callback); },
        isOnline: function() { return isOnline; },
        getDeviceId: function() { return CURRENT_DEVICE_ID; },
        processSyncQueue: processSyncQueue,
        getSyncQueue: function() { return syncQueue; },
        // OPTIMIZE: Suppress realtime notifications cho batch operations
        suppressRealtime: function() { _setSuppressRealtime(true); },
        flushRealtime: function() { _setSuppressRealtime(false); },
        // OPTIMIZE: getMemoryCache - d?c tr?c ti?p t? memory cache
        getMemoryCache: getMemoryCache,
        // Auth methods
        setShopId: setShopId,
        getShopId: getShopId,
        login: login,
        registerShop: registerShop,
        createStaff: createStaff,
        getStaffs: getStaffs,
        logout: logout,
        getCurrentUser: getCurrentUser,
        isLoggedIn: isLoggedIn,
        isAdmin: isAdmin,
        clearLocalData: clearLocalData,
        forceSyncFromFirebase: forceSyncFromFirebase,
        ensureCollection: ensureCollection,
        whenSyncComplete: whenSyncComplete,
        batchUpdateSortOrder: batchUpdateSortOrder,
        getShopConfig: getShopConfig,
        // [Comment removed - encoding error]
        reconcileSnapshot: reconcileSnapshot,
        // [Comment removed - encoding error]
        getDirtyCollections: function() { return Object.keys(_dirtyCollections); },
        // [Comment removed - encoding error]
        // [Comment removed - encoding error]
        // selector: function(oldData, newData, changeInfo) => true n?u c?n render l?i
        // [Comment removed - encoding error]
        renderOn: function(collection, selector, renderFn) {
            return _renderOn(collection, selector, renderFn);
        },
        // [Comment removed - encoding error]
        getMasterDb: function() { return masterDb; },
        // [Comment removed - encoding error]
        getSlaveDb: function() { return slaveDb; },
        // [Comment removed - encoding error]
        getAllShops: getAllShops,
        // [Comment removed - encoding error]
        updateShopStatus: updateShopStatus,
        // MASTER ADMIN: C?p nh?t username/password admin c?a POS
        updateShopAdmin: updateShopAdmin,
        // [Comment removed - encoding error]
        createMasterAdmin: createMasterAdmin,
        // [Comment removed - encoding error]
        changePassword: changePassword
    };
})();












