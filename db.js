(function() {
    // Polyfill CustomEvent
    if (typeof window.CustomEvent !== "function") {
        function CustomEvent(event, params) {
            params = params || { bubbles: false, cancelable: false, detail: null };
            var evt = document.createEvent('CustomEvent');
            evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
            return evt;
        }
        window.CustomEvent = CustomEvent;
    }

    // Firebase Config
    var firebaseConfig = {
        apiKey: "AIzaSyCs4EWdrYMZy1fTKGBFvVjrIiW0VTWIP5Y",
  authDomain: "pos259.firebaseapp.com",
  projectId: "pos259",
        databaseURL: "https://pos259-default-rtdb.firebaseio.com",
        storageBucket: "pos259.firebasestorage.app",
  messagingSenderId: "4958283987",
  appId: "1:4958283987:web:ae456726fd89c4b0d70c26",
  measurementId: "G-2J911QJ5HQ"
    };
    firebase.initializeApp(firebaseConfig);
    var db = firebase.database();
    var auth = firebase.auth();

    // ========== MULTI-TENANT SUPPORT ==========
    var _secondaryApp = null;
    var _secondaryDb = null;
    
    // Lấy database reference hiện tại (secondary nếu có, fallback về default)
    function _getDb() {
        return _secondaryDb || db;
    }
    
    // Override firebase.database() để tất cả các module khác (employees.js, settings.js, v.v.)
    // tự động dùng đúng database (custom nếu có, default nếu không)
    // Lưu hàm gốc và tất cả static properties TRƯỚC khi override
    var _origFirebaseDatabase = firebase.database.bind(firebase);
    // Lưu ServerValue và các static properties khác từ hàm gốc
    var _origServerValue = firebase.database.ServerValue;
    // Override
    firebase.database = function() {
        return _getDb();
    };
    // Gán lại ServerValue và các static properties
    firebase.database.ServerValue = _origServerValue;
    
    // Khởi tạo với Firebase config riêng cho POS
    function initWithCustomConfig(customConfig) {
        // Dọn dẹp secondary app cũ nếu có
        if (_secondaryApp) {
            try {
                _secondaryApp.delete();
            } catch(e) {
                console.warn('⚠️ Could not delete secondary Firebase app:', e.message);
            }
            _secondaryApp = null;
            _secondaryDb = null;
        }
        
        if (!customConfig || !customConfig.databaseURL) {
            console.log('ℹ️ No custom Firebase config, using default');
            return Promise.resolve(false);
        }
        
        try {
            // Tạo tên app duy nhất để tránh xung đột
            var appName = 'secondary_' + Date.now();
            _secondaryApp = firebase.initializeApp(customConfig, appName);
            _secondaryDb = _secondaryApp.database();
            console.log('✅ Initialized custom Firebase config:', customConfig.projectId || 'unknown');
            return Promise.resolve(true);
        } catch(e) {
            console.error('❌ Failed to initialize custom Firebase config:', e.message);
            _secondaryApp = null;
            _secondaryDb = null;
            return Promise.reject(e);
        }
    }
    
    // Lấy custom Firebase config từ localStorage (được lưu sau khi login)
    function _loadCustomFirebaseConfig() {
        try {
            var stored = localStorage.getItem('pos_firebase_config');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch(e) {}
        return null;
    }
    
    // Khởi tạo custom config từ localStorage khi load trang
    var _savedCustomConfig = _loadCustomFirebaseConfig();
    if (_savedCustomConfig) {
        initWithCustomConfig(_savedCustomConfig).catch(function(err) {
            console.warn('⚠️ Could not restore custom Firebase config:', err.message);
        });
    }
    
    // Constants
    var STORE_NAME = 'pos_data';
    
    var currentUser = null;
    var savedSession = localStorage.getItem('pos_session');
    if (savedSession) {
        try { currentUser = JSON.parse(savedSession); } catch(e) { localStorage.removeItem('pos_session'); }
    }
    
    // Đồng bộ MASTER_CONFIG nếu session là master admin
    if (currentUser && currentUser.role === 'master_admin' && typeof MASTER_CONFIG !== 'undefined' && MASTER_CONFIG) {
        MASTER_CONFIG.syncSession(currentUser);
    }
    
    var CURRENT_SHOP_ID = localStorage.getItem('current_shop_id');
    if (!CURRENT_SHOP_ID) {
        if (currentUser && currentUser.shopId) {
            CURRENT_SHOP_ID = currentUser.shopId;
            localStorage.setItem('current_shop_id', CURRENT_SHOP_ID);
        } else {
            CURRENT_SHOP_ID = 'shop_default';
        }
    }
    var CURRENT_DEVICE_ID = localStorage.getItem('device_id') || ('device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
    localStorage.setItem('device_id', CURRENT_DEVICE_ID);

    var localDB = null;
    var dbReady = null;
    var syncQueue = [];
    var isOnline = navigator.onLine;
    var listeners = {};
    var _unsubscribeFns = {}; // { collection: [function] } - lưu các hàm unsubscribe để cleanup
    
    // ========== SYNC META ==========
    var SYNC_META_STORE = 'sync_meta';
    var syncMetaCache = {}; // memory cache cho sync_meta
    
    var THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    
    var _isEmployeeMode = function() {
        return !currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'master_admin');
    };
    
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
    
    var MASTER_COLLECTIONS = {
        tables: true,
        customers: true,
        menu: true,
        menu_categories: true,
        ingredients: true,
        staffs: true,
        cost_categories: true,
        info: true,
        bonus_fund: true
    };
    
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
    
    var memoryCache = {};
    var cacheVersion = {};
    
    var _localCallbacks = {};
    
    // Event types: 'collection:added', 'collection:changed', 'collection:removed'
    var _eventBus = {};
    
    function _on(eventType, callback) {
        if (!_eventBus[eventType]) _eventBus[eventType] = [];
        _eventBus[eventType].push(callback);
        return function() {
            _off(eventType, callback);
        };
    }
    
    function _off(eventType, callback) {
        var cbs = _eventBus[eventType];
        if (!cbs) return;
        for (var i = cbs.length - 1; i >= 0; i--) {
            if (cbs[i] === callback) {
                cbs.splice(i, 1);
            }
        }
    }
    
    function _emit(eventType, data) {
        var cbs = _eventBus[eventType];
        if (cbs) {
            for (var i = 0; i < cbs.length; i++) {
                try { cbs[i](data); } catch(e) { console.error('[EventBus] Lỗi handler ' + eventType + ':', e); }
            }
        }
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
    
    var _componentRegistry = {};  // { collection: [ { id, selector, renderFn, lastData } ] }
    var _componentIdCounter = 0;

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
        if (memoryCache[collection]) {
            var data = [];
            for (var key in memoryCache[collection]) {
                if (memoryCache[collection].hasOwnProperty(key)) {
                    data.push(memoryCache[collection][key]);
                }
            }
            entry.lastData = data;
            try { renderFn(data); } catch(e) { console.error('[ComponentRegistry] Lỗi render lần đầu:', e); }
        }
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
                    console.error('[ComponentRegistry] Lỗi selector:', e);
                    shouldRender = true;
                }
            }
            if (shouldRender) {
                entry.lastData = newData;
                try { entry.renderFn(newData, changeInfo); } catch(e) {
                    console.error('[ComponentRegistry] Lỗi render:', e);
                }
            }
        }
    }

    var _suppressRealtime = 0;
    var _pendingNotifyCollections = {};

    function toDateKey(value) {
        if (!value) return '';
        if (typeof value === 'string') {
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

    var _lastChangeInfo = {};
    function _notifyLocal(collection, changeInfo) {
        if (_suppressRealtime > 0) {
            _pendingNotifyCollections[collection] = true;
            return;
        }
        if (changeInfo && changeInfo.type) {
            var eventType = collection + ':' + changeInfo.type;
            _emit(eventType, {
                collection: collection,
                type: changeInfo.type,
                item: changeInfo.item || null,
                timestamp: Date.now()
            });
        }
        
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
        if (changeInfo) {
            _lastChangeInfo[collection] = changeInfo;
        }
        for (var i = 0; i < cbs.length; i++) {
            try { cbs[i](data); } catch(e) { console.error('Local callback error:', e); }
        }
    }
    
    function _setSuppressRealtime(suppress) {
        if (suppress) {
            _suppressRealtime++;
        } else {
            _suppressRealtime--;
            if (_suppressRealtime <= 0) {
                _suppressRealtime = 0;
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
        return dbReady.then(function() {
            if (!localDB) throw new Error('DB not ready');
            if (!localDB.objectStoreNames.contains(collection)) throw new Error('Store ' + collection + ' not found');
            if (!memoryCache[collection]) memoryCache[collection] = {};
            var isNew = !memoryCache[collection][data.id];
            memoryCache[collection][data.id] = normalizeIndexedFields(collection, data);
            cacheVersion[collection] = (cacheVersion[collection] || 0) + 1;
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
        return dbReady.then(function() {
            if (!localDB) return id !== undefined ? null : [];
            if (!localDB.objectStoreNames.contains(collection)) return id !== undefined ? null : [];
            
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
        return dbReady.then(function() {
            if (!localDB) return;
            if (!localDB.objectStoreNames.contains(collection)) return;
            if (memoryCache[collection]) {
                delete memoryCache[collection][id];
                cacheVersion[collection] = (cacheVersion[collection] || 0) + 1;
            }
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
            lastError: null,   // Lưu lỗi gần nhất để debug
            dirtyAt: Date.now() // Thời điểm đánh dấu dirty
        };
        syncQueue.push(item);
        saveToLocal('sync_queue', item);
        _markDirty(collection);
        if (isOnline) processSyncQueue();
        return item.id;
    }
    
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
                        var item = batchItems[0];
                        return syncToFirebase(item).then(function() {
                            return _markItemSynced(item);
                        }).catch(function(err) {
                            return _handleSyncError(item, err);
                        });
                    } else {
                        return _batchSyncToFirebase(batchItems).then(function() {
                            var chain2 = Promise.resolve();
                            for (var j = 0; j < batchItems.length; j++) {
                                chain2 = chain2.then((function(item) {
                                    return function() { return _markItemSynced(item); };
                                })(batchItems[j]));
                            }
                            return chain2;
                        }).catch(function(err) {
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
    
    function _batchSyncToFirebase(items) {
        if (items.length === 0) return Promise.resolve();
        var collection = items[0].collection;
        var action = items[0].action;
        var ref = _getDb().ref(CURRENT_SHOP_ID + '/' + collection);
        var metaRef = _getDb().ref(CURRENT_SHOP_ID + '/_meta/' + collection + '/maxVersion');
        
        if (action === 'delete') {
            var batchData = {};
            for (var i = 0; i < items.length; i++) {
                batchData[items[i].targetId] = null;
            }
            return ref.update(batchData);
        }
        
        return metaRef.transaction(function(currentMax) {
            return (currentMax || 0) + items.length;
        }).then(function(result) {
            var baseVersion = result.snapshot.val() - items.length;
            var batchData = {};
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var syncData = {};
                for (var k in item.data) if (item.data.hasOwnProperty(k)) syncData[k] = item.data[k];
                syncData._syncedAt = firebase.database.ServerValue.TIMESTAMP;
                syncData._syncedBy = item.deviceId;
                syncData._version = baseVersion + i + 1; // ✅ Mỗi item có _version riêng, tăng dần
                batchData[item.targetId] = syncData;
            }
            return ref.update(batchData);
        }).catch(function(err) {
            console.warn('⚠️ Batch transaction failed, using client versions:', err.message);
            var batchData = {};
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var syncData = {};
                for (var k in item.data) if (item.data.hasOwnProperty(k)) syncData[k] = item.data[k];
                syncData._syncedAt = firebase.database.ServerValue.TIMESTAMP;
                syncData._syncedBy = item.deviceId;
                syncData._version = (item.data._version || 1);
                batchData[item.targetId] = syncData;
            }
            return ref.update(batchData);
        });
    }
    
    function _markItemSynced(item) {
        item.status = 'synced';
        return saveToLocal('sync_queue', item).then(function() {
            return deleteFromLocal('sync_queue', item.id);
        }).then(function() {
            var idx = syncQueue.findIndex(function(q) { return q.id === item.id; });
            if (idx !== -1) syncQueue.splice(idx, 1);
            console.log('✅ Synced:', item.action, item.collection, item.targetId);
            var hasPending = syncQueue.some(function(q) { return q.collection === item.collection && q.status === 'pending'; });
            if (!hasPending) {
                _clearDirty(item.collection);
            }
        });
    }
    
    function _handleSyncError(item, err) {
        item.retryCount = (item.retryCount || 0) + 1;
        item.lastError = err.message || String(err);
        var MAX_RETRY = 5;
        if (item.retryCount < MAX_RETRY) {
            item.status = 'pending';
            return saveToLocal('sync_queue', item).then(function() {
                var delay = Math.min(2000 * Math.pow(2, item.retryCount - 1), 30000); // exponential backoff, max 30s
                console.warn('  ⚠️ Retry', item.retryCount, 'for', item.collection, item.targetId, 'in', delay + 'ms');
                return new Promise(function(r) { setTimeout(r, delay); });
            }).then(function() {
                return processSyncQueue();
            });
        } else {
            item.status = 'failed';
            console.error('❌ Sync failed after ' + MAX_RETRY + ' retries:', item.action, item.collection, item.targetId, 'Error:', item.lastError);
            return saveToLocal('sync_queue', item);
        }
    }

    function syncToFirebase(item) {
        var ref = _getDb().ref(CURRENT_SHOP_ID + '/' + item.collection + '/' + item.targetId);
        var metaRef = _getDb().ref(CURRENT_SHOP_ID + '/_meta/' + item.collection + '/maxVersion');
        
        if (item.action === 'delete') return ref.remove();
        
        return metaRef.transaction(function(currentMax) {
            return (currentMax || 0) + 1;
        }).then(function(result) {
            var serverVersion = result.snapshot.val();
            var syncData = {};
            for (var k in item.data) if (item.data.hasOwnProperty(k)) syncData[k] = item.data[k];
            syncData._syncedAt = firebase.database.ServerValue.TIMESTAMP;
            syncData._syncedBy = item.deviceId;
            syncData._version = serverVersion; // ✅ Version từ server, không trùng
            return ref.update(syncData);
        }).catch(function(err) {
            console.warn('⚠️ Transaction failed, using client version:', err.message);
            var syncData = {};
            for (var k in item.data) if (item.data.hasOwnProperty(k)) syncData[k] = item.data[k];
            syncData._syncedAt = firebase.database.ServerValue.TIMESTAMP;
            syncData._syncedBy = item.deviceId;
            syncData._version = (item.data._version || 1);
            return ref.update(syncData);
        });
    }

    // CRUD Public
    function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }

    function _generateIdempotencyKey(collection, data) {
        if (collection !== 'transactions') return null;
        var ts = Math.floor(Date.now() / 1000);
        var tableKey = data.tableId || data.tableName || 'unknown';
        var amt = Math.round(data.amount || 0);
        var method = data.paymentMethod || 'unknown';
        return CURRENT_DEVICE_ID + '|' + ts + '|' + tableKey + '|' + amt + '|' + method;
    }

    function _isDuplicateTransaction(data) {
        var amt = Math.round(data.amount || 0);
        var method = data.paymentMethod || '';
        var type = data.type || '';
        var txCache = memoryCache.transactions;
        if (!txCache) {
            return false;
        }
        
        if (data.tableId || data.tableName) {
            var tableKey = data.tableId || data.tableName;
            for (var key in txCache) {
                if (!txCache.hasOwnProperty(key)) continue;
                var tx = txCache[key];
                if (tx.refunded) continue;
                var txTableKey = tx.tableId || tx.tableName;
                if (txTableKey === tableKey && Math.round(tx.amount || 0) === amt && tx.paymentMethod === method) {
                    var txTime = tx.createdAt || 0;
                    var dataTime = data.createdAt || Date.now();
                    if (Math.abs(txTime - dataTime) < 30000) {
                        return true;
                    }
                }
            }
        }
        
        if (!data.tableId && !data.tableName) {
            var customerId = data.customer ? data.customer.id : null;
            for (var key in txCache) {
                if (!txCache.hasOwnProperty(key)) continue;
                var tx = txCache[key];
                if (tx.refunded) continue;
                if (tx.type === type && Math.round(tx.amount || 0) === amt && tx.paymentMethod === method) {
                    if (customerId) {
                        var txCustId = tx.customer ? tx.customer.id : null;
                        if (txCustId !== customerId) continue;
                    }
                    var txTime = tx.createdAt || 0;
                    var dataTime = data.createdAt || Date.now();
                    if (Math.abs(txTime - dataTime) < 30000) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    function create(collection, data, customId) {
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
        if (collection === 'transactions') {
            newData._idempotencyKey = _generateIdempotencyKey(collection, data);
        }
        return saveToLocal(collection, newData).then(function() {
            addToSyncQueue('create', collection, newData, id);
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
                if (isOnline) _debouncedProcessSyncQueue();
                return Promise.resolve();
            }).then(function() { return updated; });
        });
    }

    function batchUpdateSortOrder(items, collection) {
        collection = collection || 'menu';
        return dbReady.then(function() {
            if (!localDB) throw new Error('DB not ready');
            var tx = localDB.transaction([collection], 'readwrite');
            var store = tx.objectStore(collection);
            var now = Date.now();
            
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (!memoryCache[collection]) memoryCache[collection] = {};
                if (memoryCache[collection][item.id]) {
                    memoryCache[collection][item.id].sortOrder = item.sortOrder;
                }
                var fullData = memoryCache[collection][item.id];
                if (fullData) {
                    fullData.sortOrder = item.sortOrder;
                    fullData.updatedAt = now;
                    store.put(normalizeIndexedFields(collection, fullData));
                }
            }
            
            return new Promise(function(resolve, reject) {
                tx.oncomplete = function() {
                    if (isOnline && CURRENT_SHOP_ID) {
                        var updates = {};
                        var firebasePath = (collection === 'menu_categories') ? 'menu_categories' : 'menu';
                        for (var i = 0; i < items.length; i++) {
                            var key = CURRENT_SHOP_ID + '/' + firebasePath + '/' + items[i].id + '/sortOrder';
                            updates[key] = items[i].sortOrder;
                        }
                        _getDb().ref().update(updates).catch(function(err) {
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

    function _fixDateKeyIfNeeded(tx) {
        if (!tx || !tx.id) return tx;
        var correctKey = toDateKey(tx.createdAt || tx.date || tx.updatedAt);
        if (correctKey && tx.dateKey !== correctKey) {
            
            tx.dateKey = correctKey;
            tx.dateTypeKey = correctKey + '|' + (tx.type || 'unknown');
            if (memoryCache.transactions) {
                memoryCache.transactions[tx.id] = tx;
            }
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

    var _fetchingTxDateKeys = {};

    function getTransactionsByDate(dateKey, options) {
        options = options || {};
        var type = options.type || 'all';
        
        var txFetchKey = dateKey + '|' + type;
        if (_fetchingTxDateKeys[txFetchKey]) {
            return _fetchingTxDateKeys[txFetchKey];
        }
        
        var promise = dbReady.then(function() {
            if (!localDB || !localDB.objectStoreNames.contains('transactions')) return [];
            
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
            
            return localPromise.then(function(localData) {
                if (localData && localData.length > 0) {
                    return localData; // Đã có local, trả về ngay
                }
                
                if (!isOnline) return [];
                
                if (_isEmployeeMode()) {
                    var todayKey = toDateKey(Date.now());
                    var yesterdayMs = Date.now() - 86400000;
                    var yesterdayKey = toDateKey(yesterdayMs);
                    if (dateKey !== todayKey && dateKey !== yesterdayKey) {
                        console.log('📡 Employee mode - skip auto-fetch for date:', dateKey);
                        return [];
                    }
                }
                
                console.log('📡 Auto-fetching transactions for date:', dateKey);
                return syncCollectionByDate('transactions', dateKey).then(function(fetched) {
                    if (type !== 'all' && fetched) {
                        fetched = fetched.filter(function(t) { return t.type === type; });
                    }
                    return fetched || [];
                });
            });
        });
        
        _fetchingTxDateKeys[txFetchKey] = promise;
        return promise.then(function(result) {
            delete _fetchingTxDateKeys[txFetchKey];
            return result;
        }).catch(function(err) {
            delete _fetchingTxDateKeys[txFetchKey];
            throw err;
        });
    }

    var _fetchingRange = null;
    
    function getTransactionsByDateRange(startDateKey, endDateKey, options) {
        options = options || {};
        var type = options.type || 'all';
        var noAutoFetch = options.noAutoFetch === true;
        
        if (_fetchingRange) {
            return _fetchingRange.then(function() {
                return _doGetTransactionsByDateRange(startDateKey, endDateKey, type, noAutoFetch);
            });
        }
        
        var promise = _doGetTransactionsByDateRange(startDateKey, endDateKey, type, noAutoFetch);
        _fetchingRange = promise;
        return promise.then(function(result) {
            _fetchingRange = null;
            return result;
        }).catch(function(err) {
            _fetchingRange = null;
            throw err;
        });
    }
    
    function _doGetTransactionsByDateRange(startDateKey, endDateKey, type, noAutoFetch) {
        return dbReady.then(function() {
            if (!localDB || !localDB.objectStoreNames.contains('transactions')) return [];
            
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
            
            return localPromise.then(function(localData) {
                var localDateKeys = {};
                for (var i = 0; i < localData.length; i++) {
                    if (localData[i].dateKey) {
                        localDateKeys[localData[i].dateKey] = true;
                    }
                }
                
                return getSyncMeta('transactions').then(function(meta) {
                    var fetchedDateKeys = (meta && meta.dateKeys) || [];
                    for (var i = 0; i < fetchedDateKeys.length; i++) {
                        localDateKeys[fetchedDateKeys[i]] = true;
                    }
                    
                    var allDateKeys = getDateKeysBetween(startDateKey, endDateKey);
                    var missingDateKeys = [];
                    for (var i = 0; i < allDateKeys.length; i++) {
                        if (!localDateKeys[allDateKeys[i]]) {
                            missingDateKeys.push(allDateKeys[i]);
                        }
                    }
                    
                    if (missingDateKeys.length === 0 || !isOnline) {
                        return localData; // Đã có đủ dữ liệu
                    }
                    
                    if (noAutoFetch) {
                        console.log('📡 Auto-fetch skipped (noAutoFetch=true), missing:', missingDateKeys.length, 'days');
                        return localData;
                    }
                    
                    var MAX_AUTO_FETCH_DAYS = _isEmployeeMode() ? 2 : 7;
                    var dateKeysToFetch = missingDateKeys;
                    if (missingDateKeys.length > MAX_AUTO_FETCH_DAYS) {
                        dateKeysToFetch = missingDateKeys.slice(missingDateKeys.length - MAX_AUTO_FETCH_DAYS);
                        console.log('📡 Auto-fetch limited to', MAX_AUTO_FETCH_DAYS, 'days (range has', missingDateKeys.length, 'missing days)');
                    }
                    
                    console.log('📡 Auto-fetching missing dates:', dateKeysToFetch.length, 'days');
                    
                    var chain = Promise.resolve();
                    for (var i = 0; i < dateKeysToFetch.length; i++) {
                        chain = chain.then((function(dateKey) {
                            return function() {
                                return syncCollectionByDate('transactions', dateKey);
                            };
                        })(dateKeysToFetch[i]));
                    }
                    
                    return chain.then(function() {
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
    if (callback) {
        if (!_localCallbacks[collection]) _localCallbacks[collection] = [];
        _localCallbacks[collection].push(callback);
    }
    
    var ref = _getDb().ref(CURRENT_SHOP_ID + '/' + collection);
    if (options && options.orderByChild) {
        var queryRef = ref.orderByChild(options.orderByChild);
        if (options.limitToLast) {
            queryRef = queryRef.limitToLast(options.limitToLast);
        }
        ref = queryRef;
    } else if (options && options.limitToLast) {
        ref = ref.limitToLast(options.limitToLast);
    }
    
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
            var item = { id: 'shop_config' };
            for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
            saveToLocal(collection, item).then(emitUpdateInfo);
        };
        ref.on('value', onValue);
        if (!listeners[collection]) listeners[collection] = [];
        listeners[collection].push({ value: onValue });
        // Lưu hàm unsubscribe
        var unsubFn = function() {
            ref.off('value', onValue);
        };
        if (!_unsubscribeFns[collection]) _unsubscribeFns[collection] = [];
        _unsubscribeFns[collection].push(unsubFn);
        return unsubFn;
    }
    
    var updateScheduled = false;
    var emitUpdate = function() {
        if (updateScheduled) return;
        updateScheduled = true;
        setTimeout(function() {
            updateScheduled = false;
            loadFromLocal(collection).then(function(localData) {
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
        
        if (collection !== 'tables') {
            var localItem = memoryCache[collection] ? memoryCache[collection][key] : null;
            if (localItem && (localItem._version || 0) > (item._version || 0)) {
                return;
            }
        }
        
        if (collection === 'transactions' && memoryCache.transactions && memoryCache.transactions[key]) {
            var localTx = memoryCache.transactions[key];
            if (localTx._version >= 1 && !localTx._syncedAt) {
                console.log('⏭️ Skip Firebase overwrite for pending local transaction:', key);
                return;
            }
        }
        
        if (collection === 'transactions' && item.amount) {
            var txCache = memoryCache.transactions;
            if (txCache) {
                for (var ck in txCache) {
                    if (!txCache.hasOwnProperty(ck) || ck === key) continue;
                    var existing = txCache[ck];
                    if (existing.refunded) continue;
                    
                    var isDuplicate = false;
                    var sameAmount = Math.round(existing.amount || 0) === Math.round(item.amount || 0);
                    var sameMethod = existing.paymentMethod === item.paymentMethod;
                    
                    if (item.tableId || item.tableName) {
                        var sameTable = (existing.tableId === item.tableId) || (existing.tableName === item.tableName);
                        isDuplicate = sameTable && sameAmount && sameMethod;
                    } else {
                        var sameType = existing.type === item.type;
                        var sameCustomer = false;
                        if (item.customer && item.customer.id) {
                            sameCustomer = (existing.customer && existing.customer.id === item.customer.id);
                        } else {
                            sameCustomer = true; // KhÃ´ng cÃ³ customer thÃ¬ chá»‰ cáº§n type+amount+method
                        }
                        isDuplicate = sameType && sameAmount && sameMethod && sameCustomer;
                    }
                    
                    if (isDuplicate) {
                        var timeDiff = Math.abs((existing.createdAt || 0) - (item.createdAt || 0));
                        if (timeDiff < 30000 && timeDiff > 0) {
                            console.warn('⚠️ Detected duplicate transaction from another device:', key, 'duplicates', ck);
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
        
        if (collection !== 'tables') {
            var localItem = memoryCache[collection] ? memoryCache[collection][key] : null;
            if (localItem && (localItem._version || 0) > (item._version || 0)) {
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
    // Lưu hàm unsubscribe
    var unsubFn = function() {
        ref.off('child_added', onAdded);
        ref.off('child_changed', onChanged);
        ref.off('child_removed', onRemoved);
    };
    if (!_unsubscribeFns[collection]) _unsubscribeFns[collection] = [];
    _unsubscribeFns[collection].push(unsubFn);
    return unsubFn;
}

    var _pollingTimers = {};
    function subscribeWithPolling(collection, callback, intervalSeconds) {
        intervalSeconds = intervalSeconds || 60; // Mặc định 60 giây
        if (callback) {
            if (!_localCallbacks[collection]) _localCallbacks[collection] = [];
            _localCallbacks[collection].push(callback);
        }
        
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
                        console.log('⏳ Polling ' + collection + ': memoryCache empty, registering callback for later');
                        if (!_localCallbacks[collection]) _localCallbacks[collection] = [];
                        _localCallbacks[collection].push(callback);
                    }
                } else {
                    console.log('⏳ Polling ' + collection + ': memoryCache not ready, registering callback for later');
                    if (!_localCallbacks[collection]) _localCallbacks[collection] = [];
                    _localCallbacks[collection].push(callback);
                }
            }
            return function() {
                clearInterval(_pollingTimers[collection]);
                delete _pollingTimers[collection];
            };
        }
        
        var ref = _getDb().ref(CURRENT_SHOP_ID + '/' + collection);
        
        getSyncMeta(collection).then(function(meta) {
            if (meta && meta.maxVersion > 0) {
                deltaSync(collection);
            } else {
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
                    console.log('📥 Polling loaded ' + collection + ': ' + count + ' items');
                });
            }
        });
        
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
                        console.log('📥 Polling delta ' + collection + ': ' + count + ' new items');
                    }
                });
            });
            
            _cleanupDeletedIds(collection);
        }, intervalSeconds * 1000);
        
        return function() {
            clearInterval(_pollingTimers[collection]);
            delete _pollingTimers[collection];
        };
    }
    
    function _cleanupOldData() {
        if (!localDB) return;
        var todayKey = toDateKey(Date.now());
        var yesterdayKey = toDateKey(Date.now() - 86400000);
        var keepKeys = {};
        keepKeys[todayKey] = true;
        keepKeys[yesterdayKey] = true;
        
        var dateKeys = Object.keys(DATE_BASED_COLLECTIONS);
        for (var c = 0; c < dateKeys.length; c++) {
            var collection = dateKeys[c];
            if (!localDB.objectStoreNames.contains(collection)) continue;
            
            (function(col) {
                var tx = localDB.transaction([col], 'readwrite');
                var store = tx.objectStore(col);
                var req = store.getAll();
                req.onsuccess = function() {
                    var items = req.result || [];
                    var deleted = 0;
                    for (var i = 0; i < items.length; i++) {
                        var dk = items[i].dateKey || toDateKey(items[i].date);
                        if (dk && !keepKeys[dk]) {
                            store.delete(items[i].id);
                            deleted++;
                        }
                    }
                    if (deleted > 0) {
                        console.log('🧹 Cleaned up', deleted, 'old items from', col);
                    }
                };
            })(collection);
        }
    }
    
    var _quickSyncTimer = null;
    function _quickSync() {
        if (_quickSyncTimer) clearTimeout(_quickSyncTimer);
        _quickSyncTimer = setTimeout(function() {
            _quickSyncTimer = null;
            if (!isOnline) return;
            console.log('📡 Quick sync on resume...');
            fullSync('tables');
            var masterKeys = Object.keys(MASTER_COLLECTIONS);
            for (var i = 0; i < masterKeys.length; i++) {
                if (masterKeys[i] !== 'tables') {
                    deltaSync(masterKeys[i]);
                }
            }
            if (_isEmployeeMode()) {
                var todayKey = toDateKey(Date.now());
                var yesterdayKey = toDateKey(Date.now() - 86400000);
                var dateKeys = Object.keys(DATE_BASED_COLLECTIONS);
                for (var j = 0; j < dateKeys.length; j++) {
                    syncCollectionByDate(dateKeys[j], todayKey);
                    syncCollectionByDate(dateKeys[j], yesterdayKey);
                }
                _cleanupOldData();
            } else {
                var dateKeys = Object.keys(DATE_BASED_COLLECTIONS);
                for (var j = 0; j < dateKeys.length; j++) {
                    deltaSync(dateKeys[j]);
                }
            }
        }, 500);
    }
    
    // Network listener
    function initNetwork() {
        window.addEventListener('online', function() {
            isOnline = true;
            showToast('📡 Đã kết nối mạng', 'success');
            processSyncQueue();
            fullSync('tables');
            var masterKeys = Object.keys(MASTER_COLLECTIONS);
            for (var i = 0; i < masterKeys.length; i++) {
                if (masterKeys[i] !== 'tables') {
                    deltaSync(masterKeys[i]);
                }
            }
            var dateKeys = Object.keys(DATE_BASED_COLLECTIONS);
            for (var j = 0; j < dateKeys.length; j++) {
                deltaSync(dateKeys[j]);
            }
        });
        window.addEventListener('offline', function() {
            isOnline = false;
            showToast('⚠️ Mất kết nối', 'warning');
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
    }

    // ========== SYNC META OPERATIONS ==========
    
    // Key prefix cho localStorage
    var LS_SYNC_META_PREFIX = 'sync_meta_';
    
    function getSyncMeta(collection) {
        if (syncMetaCache[collection]) {
            return Promise.resolve(syncMetaCache[collection]);
        }
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
        }
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
    
    function saveSyncMeta(collection, meta) {
        syncMetaCache[collection] = meta;
        try {
            var lsKey = LS_SYNC_META_PREFIX + CURRENT_SHOP_ID + '_' + collection;
            localStorage.setItem(lsKey, JSON.stringify({
                id: collection,
                lastSyncAt: meta.lastSyncAt,
                maxVersion: meta.maxVersion,
                dateKeys: meta.dateKeys || []
            }));
        } catch (e) {
        }
        if (!dbReady) return Promise.resolve();
        return dbReady.then(function() {
            if (!localDB || !localDB.objectStoreNames.contains(SYNC_META_STORE)) return;
            return new Promise(function(resolve, reject) {
                var tx = localDB.transaction([SYNC_META_STORE], 'readwrite');
                var store = tx.objectStore(SYNC_META_STORE);
                store.put({ id: collection, lastSyncAt: meta.lastSyncAt, maxVersion: meta.maxVersion, dateKeys: meta.dateKeys || [] });
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { resolve(); }; // Không reject để tránh lỗi lan truyền
            });
        });
    }
    
    function getMaxVersionFromFirebase(collection) {
        if (!isOnline) return Promise.resolve(0);
        return _getDb().ref(CURRENT_SHOP_ID + '/_meta/' + collection + '/maxVersion').once('value').then(function(snapshot) {
            return snapshot.val() || 0;
        }).catch(function() { return 0; });
    }
    
    function updateMetaOnFirebase(collection, maxVersion) {
        if (!isOnline) return Promise.resolve();
        return _getDb().ref(CURRENT_SHOP_ID + '/_meta/' + collection).update({
            maxVersion: maxVersion,
            lastUpdatedAt: firebase.database.ServerValue.TIMESTAMP
        }).catch(function(err) {
            console.warn('⚠️ Could not update _meta for', collection, err);
        });
    }
    
    // ========== SMART SYNC ==========
    
    var _syncPromise = null;
    
    function whenSyncComplete() {
        if (_syncPromise) return _syncPromise;
        return Promise.resolve();
    }
    
    function smartSync() {
        if (!isOnline) {
            _syncPromise = Promise.resolve();
            return _syncPromise;
        }
        
        console.log('🔄 Smart sync started...');
        
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
        
        var masterPromises = [];
        for (var m = 0; m < masterKeys.length; m++) {
            (function(collection) {
                masterPromises.push(syncCollection(collection));
            })(masterKeys[m]);
        }
        
        var todayKey = toDateKey(Date.now());
        var datePromises = [];
        
        if (_isEmployeeMode()) {
            for (var d = 0; d < dateKeys.length; d++) {
                (function(collection) {
                    datePromises.push(syncCollectionByDate(collection, todayKey));
                })(dateKeys[d]);
            }
        } else {
            var dateKeysList = getDateKeysBetween(
                toDateKey(Date.now() - THIRTY_DAYS_MS),
                todayKey
            );
            for (var d = 0; d < dateKeys.length; d++) {
                (function(collection) {
                    for (var k = 0; k < dateKeysList.length; k++) {
                        (function(dk) {
                            datePromises.push(syncCollectionByDate(collection, dk));
                        })(dateKeysList[k]);
                    }
                })(dateKeys[d]);
            }
        }
        
        _syncPromise = Promise.all(masterPromises).then(function() {
            return Promise.all(datePromises);
        }).then(function() {
            console.log('✅ Smart sync completed' + (_isEmployeeMode() ? ' (today only)' : ' (31 days)') + '. Full:', syncResults.full.length, 'Delta:', syncResults.delta.length, 'Skipped:', syncResults.skipped.length);
            return syncResults;
        });
        return _syncPromise;
    }
    
    function fullSync(collection) {
        if (!isOnline) return Promise.resolve();
        
        var isDateBased = DATE_BASED_COLLECTIONS[collection];
        var isMaster = MASTER_COLLECTIONS[collection];
        if (!isMaster && !isDateBased) {
            console.warn('  ⚠️ Unknown collection, skipping fullSync:', collection);
            return Promise.resolve();
        }
        
        return new Promise(function(resolve, reject) {
            var ref = _getDb().ref(CURRENT_SHOP_ID + '/' + collection);
            
            if (isDateBased) {
                var thirtyDaysAgo = Date.now() - THIRTY_DAYS_MS;
                ref = ref.orderByChild('createdAt').startAt(thirtyDaysAgo);
            }
            
            ref.once('value', function(snapshot) {
                if (!snapshot.exists()) {
                    saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: 0, dateKeys: [] });
                    resolve();
                    return;
                }
                
                var remote = snapshot.val() || {};
                var count = 0;
                var maxVersion = 0;
                var dateKeys = [];
                
                _setSuppressRealtime(true);
                
                if (isMaster && memoryCache[collection]) {
                    memoryCache[collection] = {};
                }
                
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
                        _setSuppressRealtime(false);
                        _emit(collection + ':synced', { collection: collection, count: 1, timestamp: Date.now() });
                        console.log('  📥 Full synced info: 1 item');
                        resolve();
                    });
                    return;
                }
                
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
                    return _cleanupDeletedIds(collection).then(function() {
                        // Ghi sync_meta
                        saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: maxVersion, dateKeys: dateKeys });
                        updateMetaOnFirebase(collection, maxVersion);
                        _setSuppressRealtime(false);
                        _emit(collection + ':synced', { collection: collection, count: count, timestamp: Date.now() });
                        resolve();
                    });
                }).catch(function(err) {
                    console.error('  ❌ Error full syncing ' + collection + ': ', err);
                    _setSuppressRealtime(false);
                    resolve();
                });
            }, function(err) {
                console.error('  ❌ Firebase read error for ' + collection + ': ', err);
                _setSuppressRealtime(false);
                resolve();
            });
        });
    }
    
    function deltaSync(collection) {
        if (!isOnline) return Promise.resolve();
        
        return getSyncMeta(collection).then(function(meta) {
            var localMaxVersion = (meta && meta.maxVersion) || 0;
            
            return new Promise(function(resolve, reject) {
                var ref = _getDb().ref(CURRENT_SHOP_ID + '/' + collection);
                var queryRef = ref.orderByChild('_version').startAt(localMaxVersion + 1);
                
                queryRef.once('value', function(snapshot) {
                    var remote = snapshot.exists() ? (snapshot.val() || {}) : {};
                    var count = 0;
                    var newMaxVersion = localMaxVersion;
                    var dateKeys = (meta && meta.dateKeys) || [];
                    var isDateBased = DATE_BASED_COLLECTIONS[collection];
                    
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
                        return _cleanupDeletedIds(collection).then(function() {
                            saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: newMaxVersion, dateKeys: dateKeys });
                            updateMetaOnFirebase(collection, newMaxVersion);
                            resolve();
                        });
                    }).catch(function(err) {
                        console.error('  ❌ Error delta syncing ' + collection + ': ', err);
                        resolve();
                    });
                }, function(err) {
                    console.error('  ❌ Firebase query error for ' + collection + ': ', err);
                    resolve();
                });
            });
        });
    }
    
    function _cleanupDeletedIds(collection) {
        if (!isOnline) return Promise.resolve();
        
        var loadMemory = Promise.resolve();
        if (!memoryCache[collection]) {
            loadMemory = loadFromLocal(collection).then(function(data) {
                if (data) {
                    if (!memoryCache[collection]) memoryCache[collection] = {};
                    for (var i = 0; i < data.length; i++) {
                        memoryCache[collection][data[i].id] = data[i];
                    }
                }
            });
        }
        
        return loadMemory.then(function() {
            if (!memoryCache[collection]) return;
            
            var localIds = Object.keys(memoryCache[collection]);
            if (localIds.length === 0) return;
        
            var ref = _getDb().ref(CURRENT_SHOP_ID + '/' + collection);
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
                
                console.log('  🗑️ Cleaning up', deletedIds.length, 'deleted IDs from', collection);
                
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
                console.warn('  ⚠️ Could not check deleted IDs for', collection, ':', err.message);
            });
        });
    }
    
    function reconcileSnapshot(collection) {
        if (!isOnline) return Promise.resolve();
        var isMaster = MASTER_COLLECTIONS[collection];
        console.log('🔄 Reconcile snapshot for:', collection);
        return _cleanupDeletedIds(collection).then(function() {
            if (isMaster) {
                // Master collections: reset sync_meta + fullSync
                return saveSyncMeta(collection, { lastSyncAt: 0, maxVersion: 0, dateKeys: [] }).then(function() {
                    return fullSync(collection);
                });
            } else {
                return deltaSync(collection);
            }
        });
    }
    
    var _fetchingDateKeys = {};
    
    function syncCollectionByDate(collection, dateKey) {
        if (!isOnline) return Promise.resolve([]);
        
        var fetchKey = collection + '|' + dateKey;
        if (_fetchingDateKeys[fetchKey]) {
            return _fetchingDateKeys[fetchKey];
        }
        
        var promise = _doSyncCollectionByDate(collection, dateKey);
        _fetchingDateKeys[fetchKey] = promise;
        
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
            
            if (dateKeys.indexOf(dateKey) >= 0) {
                return loadFromLocal(collection).then(function(data) {
                    var filtered = [];
                    for (var i = 0; i < data.length; i++) {
                        if (data[i].dateKey === dateKey) filtered.push(data[i]);
                    }
                    return filtered;
                });
            }
            
            console.log('  📥 Fetching', collection, 'for date:', dateKey);
            
            return new Promise(function(resolve, reject) {
                var ref = _getDb().ref(CURRENT_SHOP_ID + '/' + collection);
                ref.orderByChild('dateKey').equalTo(dateKey).once('value', function(snapshot) {
                    if (!snapshot.exists()) {
                        if (dateKeys.indexOf(dateKey) < 0) {
                            dateKeys.push(dateKey);
                        }
                        saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: (meta && meta.maxVersion) || 0, dateKeys: dateKeys });
                        console.log('  📥 Fetched', collection, 'for', dateKey, ': 0 items (no data)');
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
                        if (dateKeys.indexOf(dateKey) < 0) {
                            dateKeys.push(dateKey);
                        }
                        saveSyncMeta(collection, { lastSyncAt: Date.now(), maxVersion: maxVersion, dateKeys: dateKeys });
                        updateMetaOnFirebase(collection, maxVersion);
                        console.log('  📥 Fetched', collection, 'for', dateKey, ':', items.length, 'items');
                        resolve(items);
                    }).catch(function(err) {
                        console.error('  ❌ Error fetching', collection, 'by date:', err);
                        resolve([]);
                    });
                }, function(err) {
                    console.error('  ❌ Firebase query error:', err);
                    resolve([]);
                });
            });
        });
    }
    
    function ensureRecentDaysData(daysCount, callback) {
        daysCount = daysCount || 31; // Hôm nay + 30 ngày trước
        callback = callback || function() {};
        
        if (!isOnline) {
            callback({ error: 'OFFLINE' });
            return Promise.reject(new Error('Offline'));
        }
        
        var now = Date.now();
        var endDateKey = toDateKey(now);
        
        var startDate = new Date(now);
        startDate.setDate(startDate.getDate() - (daysCount - 1));
        var startDateKey = toDateKey(startDate.getTime());
        
        var requiredDateKeys = getDateKeysBetween(startDateKey, endDateKey);
        var dateKeysList = Object.keys(DATE_BASED_COLLECTIONS);
        
        var totalTasks = dateKeysList.length;
        var completedTasks = 0;
        var allResults = {};
        
        console.log('📦 ensureRecentDaysData: Need', requiredDateKeys.length, 'dateKeys for', dateKeysList.length, 'collections');
        
        function processCollection(collection) {
            return getSyncMeta(collection).then(function(meta) {
                var existingDateKeys = (meta && meta.dateKeys) || [];
                var existingSet = {};
                for (var i = 0; i < existingDateKeys.length; i++) {
                    existingSet[existingDateKeys[i]] = true;
                }
                
                var missingDateKeys = [];
                for (var i = 0; i < requiredDateKeys.length; i++) {
                    if (!existingSet[requiredDateKeys[i]]) {
                        missingDateKeys.push(requiredDateKeys[i]);
                    }
                }
                
                if (missingDateKeys.length === 0) {
                    completedTasks++;
                    callback({ current: completedTasks, total: totalTasks, collection: collection, dateKey: null, status: 'skipped', missingCount: 0 });
                    return { collection: collection, fetched: 0, skipped: true };
                }
                
                console.log('  📥 Collection', collection, 'missing', missingDateKeys.length, 'days');
                
                var chain = Promise.resolve();
                var fetchedCount = 0;
                
                for (var i = 0; i < missingDateKeys.length; i++) {
                    (function(dateKey) {
                        chain = chain.then(function() {
                            callback({ current: completedTasks, total: totalTasks, collection: collection, dateKey: dateKey, status: 'fetching', missingCount: missingDateKeys.length });
                            return syncCollectionByDate(collection, dateKey).then(function(items) {
                                fetchedCount += (items ? items.length : 0);
                            });
                        });
                    })(missingDateKeys[i]);
                }
                
                return chain.then(function() {
                    completedTasks++;
                    callback({ current: completedTasks, total: totalTasks, collection: collection, dateKey: null, status: 'done', missingCount: missingDateKeys.length, fetchedCount: fetchedCount });
                    return { collection: collection, fetched: fetchedCount, missingCount: missingDateKeys.length };
                });
            });
        }
        
        var chain = Promise.resolve();
        for (var c = 0; c < dateKeysList.length; c++) {
            (function(collection) {
                chain = chain.then(function() {
                    return processCollection(collection);
                }).then(function(result) {
                    allResults[collection] = result;
                });
            })(dateKeysList[c]);
        }
        
        return chain.then(function() {
            console.log('✅ ensureRecentDaysData completed:', allResults);
            return allResults;
        });
    }
    
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
            var request = indexedDB.open(STORE_NAME, 20);
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
    'sync_meta',
    'bonus_fund'
];
                for (var i = 0; i < stores.length; i++) {
                    if (!db.objectStoreNames.contains(stores[i])) {
                        db.createObjectStore(stores[i], { keyPath: 'id' });
                        console.log('Created store:', stores[i]);
                    }
                }
                try {
                    var tx = e.target.transaction;
                    
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

    function seedDefaultShop() {
        return db.ref('shop_registry/123123').once('value').then(function(snapshot) {
            if (snapshot.exists()) return; // Đã có rồi, không cần seed
            
            console.log('🌱 Seeding default shop data...');
            var staffId = 'staff_admin_' + Date.now().toString(36);
            var updates = {};
            
            updates['shop_registry/123123'] = {
                shopId: 'shop_default',
                shopName: 'MILANO COFFEE 259',
                shopCode: '123123',
                createdAt: Date.now()
            };
            
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
                name: 'MILANO COFFEE 259',
                code: '123123',
                createdAt: Date.now(),
                // Telegram config
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
            
            return db.ref().update(updates).then(function() {
                console.log('✅ Default shop seeded: mã 123123, user admin123123, pass 123123');
            });
        }).catch(function(err) {
            console.error('Seed error:', err);
        });
    }

    function ensureShopConfig() {
        return _getDb().ref(CURRENT_SHOP_ID + '/info').once('value').then(function(snapshot) {
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
                return _getDb().ref(CURRENT_SHOP_ID + '/info').update(updates).then(function() {
                    console.log('✅ Shop config fields created');
                });
            }
        }).catch(function(err) {
            console.error('⚠️ ensureShopConfig error:', err);
        });
    }

    
    // ========== ENSURE COLLECTION ==========
    function ensureCollection(collection) {
        if (!isOnline) return Promise.resolve([]);
        return loadFromLocal(collection).then(function(localData) {
            if (localData && Object.keys(localData).length > 0) {
                var arr = [];
                for (var k in localData) {
                    if (localData.hasOwnProperty(k)) arr.push(localData[k]);
                }
                return arr;
            }
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
    function forceSyncFromFirebase() {
        if (!isOnline) {
            console.warn('⚠️ Offline, cannot force sync from Firebase');
            return Promise.reject(new Error('Offline'));
        }
        
        // Master collections: fullSync (tables, menu, customers, ingredients, staffs...)
        // Date-based collections: syncCollectionByDate
        var isEmployee = _isEmployeeMode();
        console.log('🔔 Force syncing collections from Firebase (master: fullSync, date-based: ' + (isEmployee ? 'today only' : '31 days') + ')...');
        
        syncMetaCache = {};
        
        var todayKey = toDateKey(Date.now());
        
        // Master collections: fullSync song song
        var masterKeys = Object.keys(MASTER_COLLECTIONS);
        var masterPromises = [];
        for (var m = 0; m < masterKeys.length; m++) {
            (function(collection) {
                if (memoryCache[collection]) {
                    memoryCache[collection] = {};
                }
                masterPromises.push(fullSync(collection));
            })(masterKeys[m]);
        }
        
        if (memoryCache['messages']) {
            memoryCache['messages'] = {};
        }
        masterPromises.push(fullSync('messages'));
        
        // Date-based collections: syncCollectionByDate song song
        var dateKeys = Object.keys(DATE_BASED_COLLECTIONS);
        var dateKeysToFetch = [];
        if (isEmployee) {
            dateKeysToFetch.push(todayKey);
        } else {
            dateKeysToFetch = getDateKeysBetween(
                toDateKey(Date.now() - THIRTY_DAYS_MS),
                todayKey
            );
        }
        
        var datePromises = [];
        for (var d = 0; d < dateKeys.length; d++) {
            (function(collection) {
                if (memoryCache[collection]) {
                    memoryCache[collection] = {};
                }
                for (var k = 0; k < dateKeysToFetch.length; k++) {
                    (function(dk) {
                        datePromises.push(syncCollectionByDate(collection, dk));
                    })(dateKeysToFetch[k]);
                }
            })(dateKeys[d]);
        }
        
        _syncPromise = Promise.all(masterPromises).then(function() {
            return Promise.all(datePromises);
        }).then(function() {
            console.log('✅ Force sync completed' + (isEmployee ? ' (today only)' : ' (31 days)'));
        });
        return _syncPromise;
    }

    // Hủy các subscription cũ và đăng ký lại (dùng khi chuyển Firebase config)
    function _reinitializeSubscriptions() {
        // Hủy tất cả listeners realtime cũ bằng cách gọi unsubscribe functions
        for (var col in _unsubscribeFns) {
            if (_unsubscribeFns.hasOwnProperty(col)) {
                var fns = _unsubscribeFns[col];
                for (var i = 0; i < fns.length; i++) {
                    try {
                        fns[i]();
                    } catch(e) {
                        console.warn('⚠️ Error unsubscribing', col, ':', e.message);
                    }
                }
            }
        }
        _unsubscribeFns = {};
        listeners = {};
        
        // Hủy tất cả polling timers cũ
        for (var timerCol in _pollingTimers) {
            if (_pollingTimers.hasOwnProperty(timerCol)) {
                clearInterval(_pollingTimers[timerCol]);
            }
        }
        _pollingTimers = {};
        
        // Đăng ký lại subscriptions với _getDb() (sẽ dùng _secondaryDb nếu có)
        subscribeToCollection('tables');
        _cleanupDeletedIds('tables').then(function() {
            subscribeToCollection('customers');
            subscribeToCollection('transactions', null, { orderByChild: 'createdAt', limitToLast: 200 });
            subscribeToCollection('notifications');
            subscribeToCollection('info');
            subscribeToCollection('daily_balances');
            subscribeToCollection('cost_categories');
            subscribeToCollection('cost_transactions');

            if (!_pollingTimers['tables']) {
                _pollingTimers['tables'] = setInterval(function() {
                    if (!isOnline) return;
                    _cleanupDeletedIds('tables').then(function() {
                        return deltaSync('tables');
                    });
                }, 30000);
            }
            
            if (!_pollingTimers['menu']) {
                _pollingTimers['menu'] = setInterval(function() {
                    if (!isOnline) return;
                    var ref = _getDb().ref(CURRENT_SHOP_ID + '/menu');
                    getSyncMeta('menu').then(function(meta) {
                        var localMaxVersion = (meta && meta.maxVersion) || 0;
                        ref.orderByChild('_version').startAt(localMaxVersion + 1).once('value', function(snapshot) {
                            if (!snapshot.exists()) return;
                            var remote = snapshot.val() || {};
                            var count = 0, newMaxVersion = localMaxVersion;
                            for (var key in remote) {
                                if (remote.hasOwnProperty(key)) {
                                    var src = remote[key];
                                    var item = { id: key };
                                    for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
                                    if (item._version === undefined) item._version = 1;
                                    if (item._version > newMaxVersion) newMaxVersion = item._version;
                                    var localItem = memoryCache['menu'] ? memoryCache['menu'][key] : null;
                                    saveToLocal('menu', item, localItem ? 'changed' : 'added');
                                    count++;
                                }
                            }
                            if (count > 0) {
                                saveSyncMeta('menu', { lastSyncAt: Date.now(), maxVersion: newMaxVersion, dateKeys: (meta && meta.dateKeys) || [] });
                            }
                            _cleanupDeletedIds('menu');
                        });
                    });
                }, 60000);
            }
            if (!_pollingTimers['menu_categories']) {
                _pollingTimers['menu_categories'] = setInterval(function() {
                    if (!isOnline) return;
                    var ref = _getDb().ref(CURRENT_SHOP_ID + '/menu_categories');
                    getSyncMeta('menu_categories').then(function(meta) {
                        var localMaxVersion = (meta && meta.maxVersion) || 0;
                        ref.orderByChild('_version').startAt(localMaxVersion + 1).once('value', function(snapshot) {
                            if (!snapshot.exists()) return;
                            var remote = snapshot.val() || {};
                            var count = 0, newMaxVersion = localMaxVersion;
                            for (var key in remote) {
                                if (remote.hasOwnProperty(key)) {
                                    var src = remote[key];
                                    var item = { id: key };
                                    for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
                                    if (item._version === undefined) item._version = 1;
                                    if (item._version > newMaxVersion) newMaxVersion = item._version;
                                    var localItem = memoryCache['menu_categories'] ? memoryCache['menu_categories'][key] : null;
                                    saveToLocal('menu_categories', item, localItem ? 'changed' : 'added');
                                    count++;
                                }
                            }
                            if (count > 0) {
                                saveSyncMeta('menu_categories', { lastSyncAt: Date.now(), maxVersion: newMaxVersion, dateKeys: (meta && meta.dateKeys) || [] });
                            }
                            _cleanupDeletedIds('menu_categories');
                        });
                    });
                }, 60000);
            }
            if (!_pollingTimers['ingredients']) {
                _pollingTimers['ingredients'] = setInterval(function() {
                    if (!isOnline) return;
                    var ref = _getDb().ref(CURRENT_SHOP_ID + '/ingredients');
                    getSyncMeta('ingredients').then(function(meta) {
                        var localMaxVersion = (meta && meta.maxVersion) || 0;
                        ref.orderByChild('_version').startAt(localMaxVersion + 1).once('value', function(snapshot) {
                            if (!snapshot.exists()) return;
                            var remote = snapshot.val() || {};
                            var count = 0, newMaxVersion = localMaxVersion;
                            for (var key in remote) {
                                if (remote.hasOwnProperty(key)) {
                                    var src = remote[key];
                                    var item = { id: key };
                                    for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
                                    if (item._version === undefined) item._version = 1;
                                    if (item._version > newMaxVersion) newMaxVersion = item._version;
                                    var localItem = memoryCache['ingredients'] ? memoryCache['ingredients'][key] : null;
                                    saveToLocal('ingredients', item, localItem ? 'changed' : 'added');
                                    count++;
                                }
                            }
                            if (count > 0) {
                                saveSyncMeta('ingredients', { lastSyncAt: Date.now(), maxVersion: newMaxVersion, dateKeys: (meta && meta.dateKeys) || [] });
                            }
                            _cleanupDeletedIds('ingredients');
                        });
                    });
                }, 60000);
            }
            if (!_pollingTimers['messages']) {
                _pollingTimers['messages'] = setInterval(function() {
                    if (!isOnline) return;
                    var ref = _getDb().ref(CURRENT_SHOP_ID + '/messages');
                    getSyncMeta('messages').then(function(meta) {
                        var localMaxVersion = (meta && meta.maxVersion) || 0;
                        ref.orderByChild('_version').startAt(localMaxVersion + 1).once('value', function(snapshot) {
                            if (!snapshot.exists()) return;
                            var remote = snapshot.val() || {};
                            var count = 0, newMaxVersion = localMaxVersion;
                            for (var key in remote) {
                                if (remote.hasOwnProperty(key)) {
                                    var src = remote[key];
                                    var item = { id: key };
                                    for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
                                    if (item._version === undefined) item._version = 1;
                                    if (item._version > newMaxVersion) newMaxVersion = item._version;
                                    var localItem = memoryCache['messages'] ? memoryCache['messages'][key] : null;
                                    saveToLocal('messages', item, localItem ? 'changed' : 'added');
                                    count++;
                                }
                            }
                            if (count > 0) {
                                saveSyncMeta('messages', { lastSyncAt: Date.now(), maxVersion: newMaxVersion, dateKeys: (meta && meta.dateKeys) || [] });
                            }
                            _cleanupDeletedIds('messages');
                        });
                    });
                }, 60000);
            }
            console.log('✅ Re-initialized subscriptions for Firebase config:', _secondaryDb ? 'custom' : 'default');
        });
    }

    // Init Database
    function initDatabase() {
        _restoreDirtyFlags();
        return initLocalDB().then(function() {
            initNetwork();
            // Chỉ chạy smartSync nếu đã có session (đã login trước đó)
            // Tránh đổ dữ liệu từ default Firebase khi chưa login
            if (isOnline && currentUser) {
                return smartSync();
            }
            return Promise.resolve();
        }).then(function() {
            // seedDefaultShop chỉ chạy khi dùng default Firebase (không có custom config)
            // và chưa có session (lần đầu tiên)
            if (!_secondaryDb && !currentUser) {
                return seedDefaultShop();
            }
            return Promise.resolve();
        }).then(function() {
            // ensureShopConfig chỉ chạy khi đã có session (đã login)
            // để tránh ghi config vào sai shopId
            if (currentUser) {
                return ensureShopConfig();
            }
            return Promise.resolve();
        }).then(function() {
            // tables, customers, menu, menu_categories, transactions, notifications
            //      admin_cost_categories, reports
            subscribeToCollection('tables');
            // FIX: Cleanup deleted IDs ngay sau khi subscribe tables
            _cleanupDeletedIds('tables').then(function() {
                subscribeToCollection('customers');
                subscribeToCollection('transactions', null, { orderByChild: 'createdAt', limitToLast: 200 });
                subscribeToCollection('notifications');
                subscribeToCollection('info');
                subscribeToCollection('daily_balances');
                subscribeToCollection('cost_categories');
                subscribeToCollection('cost_transactions');

                if (!_pollingTimers['tables']) {
                    _pollingTimers['tables'] = setInterval(function() {
                        if (!isOnline) return;
                        _cleanupDeletedIds('tables').then(function() {
                            return deltaSync('tables');
                        });
                    }, 30000);
                }
                
                if (!_pollingTimers['menu']) {
                    _pollingTimers['menu'] = setInterval(function() {
                        if (!isOnline) return;
                        var ref = _getDb().ref(CURRENT_SHOP_ID + '/menu');
                        getSyncMeta('menu').then(function(meta) {
                            var localMaxVersion = (meta && meta.maxVersion) || 0;
                            ref.orderByChild('_version').startAt(localMaxVersion + 1).once('value', function(snapshot) {
                                if (!snapshot.exists()) return;
                                var remote = snapshot.val() || {};
                                var count = 0, newMaxVersion = localMaxVersion;
                                for (var key in remote) {
                                    if (remote.hasOwnProperty(key)) {
                                        var src = remote[key];
                                        var item = { id: key };
                                        for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
                                        if (item._version === undefined) item._version = 1;
                                        if (item._version > newMaxVersion) newMaxVersion = item._version;
                                        var localItem = memoryCache['menu'] ? memoryCache['menu'][key] : null;
                                        saveToLocal('menu', item, localItem ? 'changed' : 'added');
                                        count++;
                                    }
                                }
                                if (count > 0) {
                                    saveSyncMeta('menu', { lastSyncAt: Date.now(), maxVersion: newMaxVersion, dateKeys: (meta && meta.dateKeys) || [] });
                                }
                                _cleanupDeletedIds('menu');
                            });
                        });
                    }, 60000);
                }
                if (!_pollingTimers['menu_categories']) {
                    _pollingTimers['menu_categories'] = setInterval(function() {
                        if (!isOnline) return;
                        var ref = _getDb().ref(CURRENT_SHOP_ID + '/menu_categories');
                        getSyncMeta('menu_categories').then(function(meta) {
                            var localMaxVersion = (meta && meta.maxVersion) || 0;
                            ref.orderByChild('_version').startAt(localMaxVersion + 1).once('value', function(snapshot) {
                                if (!snapshot.exists()) return;
                                var remote = snapshot.val() || {};
                                var count = 0, newMaxVersion = localMaxVersion;
                                for (var key in remote) {
                                    if (remote.hasOwnProperty(key)) {
                                        var src = remote[key];
                                        var item = { id: key };
                                        for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
                                        if (item._version === undefined) item._version = 1;
                                        if (item._version > newMaxVersion) newMaxVersion = item._version;
                                        var localItem = memoryCache['menu_categories'] ? memoryCache['menu_categories'][key] : null;
                                        saveToLocal('menu_categories', item, localItem ? 'changed' : 'added');
                                        count++;
                                    }
                                }
                                if (count > 0) {
                                    saveSyncMeta('menu_categories', { lastSyncAt: Date.now(), maxVersion: newMaxVersion, dateKeys: (meta && meta.dateKeys) || [] });
                                }
                                _cleanupDeletedIds('menu_categories');
                            });
                        });
                    }, 60000);
                }
                if (!_pollingTimers['ingredients']) {
                    _pollingTimers['ingredients'] = setInterval(function() {
                        if (!isOnline) return;
                        var ref = _getDb().ref(CURRENT_SHOP_ID + '/ingredients');
                        getSyncMeta('ingredients').then(function(meta) {
                            var localMaxVersion = (meta && meta.maxVersion) || 0;
                            ref.orderByChild('_version').startAt(localMaxVersion + 1).once('value', function(snapshot) {
                                if (!snapshot.exists()) return;
                                var remote = snapshot.val() || {};
                                var count = 0, newMaxVersion = localMaxVersion;
                                for (var key in remote) {
                                    if (remote.hasOwnProperty(key)) {
                                        var src = remote[key];
                                        var item = { id: key };
                                        for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
                                        if (item._version === undefined) item._version = 1;
                                        if (item._version > newMaxVersion) newMaxVersion = item._version;
                                        var localItem = memoryCache['ingredients'] ? memoryCache['ingredients'][key] : null;
                                        saveToLocal('ingredients', item, localItem ? 'changed' : 'added');
                                        count++;
                                    }
                                }
                                if (count > 0) {
                                    saveSyncMeta('ingredients', { lastSyncAt: Date.now(), maxVersion: newMaxVersion, dateKeys: (meta && meta.dateKeys) || [] });
                                }
                                _cleanupDeletedIds('ingredients');
                            });
                        });
                    }, 60000);
                }
                if (!_pollingTimers['messages']) {
                    _pollingTimers['messages'] = setInterval(function() {
                        if (!isOnline) return;
                        var ref = _getDb().ref(CURRENT_SHOP_ID + '/messages');
                        getSyncMeta('messages').then(function(meta) {
                            var localMaxVersion = (meta && meta.maxVersion) || 0;
                            ref.orderByChild('_version').startAt(localMaxVersion + 1).once('value', function(snapshot) {
                                if (!snapshot.exists()) return;
                                var remote = snapshot.val() || {};
                                var count = 0, newMaxVersion = localMaxVersion;
                                for (var key in remote) {
                                    if (remote.hasOwnProperty(key)) {
                                        var src = remote[key];
                                        var item = { id: key };
                                        for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
                                        if (item._version === undefined) item._version = 1;
                                        if (item._version > newMaxVersion) newMaxVersion = item._version;
                                        var localItem = memoryCache['messages'] ? memoryCache['messages'][key] : null;
                                        saveToLocal('messages', item, localItem ? 'changed' : 'added');
                                        count++;
                                    }
                                }
                                if (count > 0) {
                                    saveSyncMeta('messages', { lastSyncAt: Date.now(), maxVersion: newMaxVersion, dateKeys: (meta && meta.dateKeys) || [] });
                                }
                                _cleanupDeletedIds('messages');
                            });
                        });
                    }, 60000);
                }
                console.log('✅ Database ready, device:', CURRENT_DEVICE_ID);
                return { isOnline: isOnline, deviceId: CURRENT_DEVICE_ID };
            });
        });
    }

    function showToast(msg, type) {
        var container = document.getElementById('toastContainer');
        if (!container) { console.log(msg); return; }
        var toast = document.createElement('div');
        toast.className = 'toast ' + (type || 'info');
        toast.innerText = msg;
        container.appendChild(toast);
        setTimeout(function() { toast.remove(); }, 2500);
    }

    // ========== AUTH METHODS ==========
    
    function clearLocalData() {
        memoryCache = {};
        cacheVersion = {};
        syncMetaCache = {};
        
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
    
    function setShopId(shopId) {
        if (!shopId) return;
        CURRENT_SHOP_ID = shopId;
        localStorage.setItem('current_shop_id', shopId);
        console.log('🔔 Switched to shop:', shopId);
    }
    
    function getShopId() {
        return CURRENT_SHOP_ID;
    }
    
    function login(shopCode, username, password) {
        if (!username || !password) {
            return Promise.reject(new Error('Vui lòng nhập tên đăng nhập và mật khẩu'));
        }
        
        // Kiểm tra MASTER_CONFIG trước (nếu đã load)
        if (typeof MASTER_CONFIG !== 'undefined' && MASTER_CONFIG) {
            return MASTER_CONFIG.login(shopCode, username, password).then(function(result) {
                if (result) {
                    // Master admin login
                    if (result.isMasterAdmin) {
                        // Master admin login vào POS cụ thể (có mã POS)
                        if (result.isMasterInPos) {
                            var posInfo = result.posInfo;
                            var shopId = posInfo.shopId || ('shop_' + posInfo.code);
                            
                            // Xóa dữ liệu local trước khi chuyển sang POS khác
                            return clearLocalData().then(function() {
                                // Khởi tạo custom Firebase config nếu có
                                if (result.firebaseConfig) {
                                    localStorage.setItem('pos_firebase_config', JSON.stringify(result.firebaseConfig));
                                    return initWithCustomConfig(result.firebaseConfig).then(function() {
                                        _reinitializeSubscriptions();
                                        currentUser = {
                                            id: 'master_admin',
                                            username: result.user.username,
                                            displayName: result.user.displayName,
                                            role: 'master_admin',
                                            shopId: shopId,
                                            shopCode: posInfo.code,
                                            shopName: posInfo.name || ''
                                        };
                                        localStorage.setItem('pos_session', JSON.stringify(currentUser));
                                        localStorage.setItem('current_shop_id', shopId);
                                        return currentUser;
                                    });
                                } else {
                                    localStorage.removeItem('pos_firebase_config');
                                    return initWithCustomConfig(null).then(function() {
                                        _reinitializeSubscriptions();
                                        currentUser = {
                                            id: 'master_admin',
                                            username: result.user.username,
                                            displayName: result.user.displayName,
                                            role: 'master_admin',
                                            shopId: shopId,
                                            shopCode: posInfo.code,
                                            shopName: posInfo.name || ''
                                        };
                                        localStorage.setItem('pos_session', JSON.stringify(currentUser));
                                        localStorage.setItem('current_shop_id', shopId);
                                        return currentUser;
                                    });
                                }
                            });
                        }
                        
                        // Master admin login không có mã POS → vào Master Control
                        currentUser = {
                            id: 'master_admin',
                            username: result.user.username,
                            displayName: 'Master Admin',
                            role: 'master_admin',
                            shopId: 'master',
                            shopCode: 'master',
                            shopName: 'Master Control'
                        };
                        localStorage.setItem('pos_session', JSON.stringify(currentUser));
                        localStorage.setItem('current_shop_id', 'master');
                        localStorage.removeItem('pos_firebase_config');
                        // Dùng default db
                        initWithCustomConfig(null);
                        return currentUser;
                    }
                    
                    // POS admin login - có thể có custom Firebase config
                    var posInfo = result.posInfo;
                    var shopId = posInfo.shopId || ('shop_' + posInfo.code);
                    
                    // QUAN TRỌNG: Xóa dữ liệu local TRƯỚC khi chuyển sang custom Firebase config
                    // để tránh dữ liệu cũ từ default Firebase bị mix với dữ liệu mới
                    return clearLocalData().then(function() {
                        // Khởi tạo custom Firebase config nếu có
                        if (result.firebaseConfig) {
                            localStorage.setItem('pos_firebase_config', JSON.stringify(result.firebaseConfig));
                            return initWithCustomConfig(result.firebaseConfig).then(function() {
                                _reinitializeSubscriptions();
                                return _completePosLogin(result.user, posInfo, shopId);
                            });
                        } else {
                            localStorage.removeItem('pos_firebase_config');
                            // Dùng default db
                            return initWithCustomConfig(null).then(function() {
                                _reinitializeSubscriptions();
                                return _completePosLogin(result.user, posInfo, shopId);
                            });
                        }
                    });
                }
                // result falsy (null) - không phải master admin, không có trong shop_registry
                // Fallback: login qua shop_registry (tương thích ngược)
                return _legacyLogin(shopCode, username, password);
            }).catch(function(err) {
                // Nếu MASTER_CONFIG bị lỗi HOẶC sai mật khẩu
                // Kiểm tra nếu POS có custom Firebase config thì KHÔNG fallback về legacy
                // vì legacy chỉ đọc từ default Firebase, chắc chắn không có staffs ở đó
                if (err && err.customFirebaseConfig) {
                    throw err;
                }
                // Nếu POS bị khóa, throw luôn không fallback về legacy
                if (err && err.locked) {
                    throw err;
                }
                // Fallback về legacy cho các POS dùng default Firebase
                return _legacyLogin(shopCode, username, password);
            });
        }
        
        // Không có MASTER_CONFIG, dùng legacy login
        return _legacyLogin(shopCode, username, password);
    }
    
    // Login cũ qua shop_registry (giữ để tương thích ngược)
    function _legacyLogin(shopCode, username, password) {
        return db.ref('shop_registry/' + shopCode).once('value').then(function(snapshot) {
            if (!snapshot.exists()) {
                throw new Error('Mã POS không tồn tại');
            }
            var shopInfo = snapshot.val();
            var shopId = shopInfo.shopId;
            
            return db.ref(shopId + '/staffs').once('value').then(function(staffSnapshot) {
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
                    throw new Error('Sai tên đăng nhập hoặc mật khẩu');
                }
                
                return clearLocalData().then(function() {
                    currentUser = {
                        id: foundStaff.id,
                        username: foundStaff.username,
                        displayName: foundStaff.displayName || foundStaff.username,
                        role: foundStaff.role || 'staff',
                        shopId: shopId,
                        shopCode: shopCode,
                        shopName: shopInfo.shopName || ''
                    };
                    localStorage.setItem('pos_session', JSON.stringify(currentUser));
                    localStorage.removeItem('pos_firebase_config');
                    setShopId(shopId);
                    
                    return currentUser;
                });
            });
        });
    }
    
    // Hoàn tất login POS với thông tin từ master config
    // Lưu ý: clearLocalData() đã được gọi TRƯỚC đó trong login()
    function _completePosLogin(userData, posInfo, shopId) {
        currentUser = {
            id: userData.id || ('staff_' + Date.now().toString(36)),
            username: userData.username,
            displayName: userData.displayName || userData.username,
            role: 'admin',
            shopId: shopId,
            shopCode: posInfo.code,
            shopName: posInfo.name || ''
        };
        localStorage.setItem('pos_session', JSON.stringify(currentUser));
        setShopId(shopId);
        return Promise.resolve(currentUser);
    }
    
    function registerShop(shopName, shopCode, adminUser, adminPass) {
        if (!shopName || !shopCode || !adminUser || !adminPass) {
            return Promise.reject(new Error('Vui lòng nhập đầy đủ thông tin'));
        }
        if (shopCode.length < 3) {
            return Promise.reject(new Error('Mã POS phải có ít nhất 3 ký tự'));
        }
        if (adminPass.length < 4) {
            return Promise.reject(new Error('Mật khẩu phải có ít nhất 4 ký tự'));
        }
        
        return db.ref('shop_registry/' + shopCode).once('value').then(function(snapshot) {
            if (snapshot.exists()) {
                throw new Error('Mã POS này đã được đăng ký');
            }
            
            var shopId = 'shop_' + shopCode.toLowerCase();
            
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
            
            var registryData = {
                shopId: shopId,
                shopName: shopName,
                shopCode: shopCode,
                adminUser: adminUser,
                adminPass: adminPass,
                role: 'pos_admin',
                createdAt: Date.now()
            };
            
            // Batch write: shop_registry + shop data + staff
            var updates = {};
            updates['shop_registry/' + shopCode] = registryData;
            updates[shopId + '/staffs/' + staffId] = staffData;
            updates[shopId + '/info'] = {
                id: 'shop_config',
                name: shopName,
                code: shopCode,
                createdAt: Date.now()
            };
            
            return db.ref().update(updates).then(function() {
                return clearLocalData();
            }).then(function() {
                currentUser = {
                    id: staffId,
                    username: adminUser,
                    displayName: adminUser,
                    role: 'admin',
                    shopId: shopId,
                    shopCode: shopCode,
                    shopName: shopName
                };
                localStorage.setItem('pos_session', JSON.stringify(currentUser));
                setShopId(shopId);
                return currentUser;
            });
        });
    }
    
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
        
        var ref = _getDb().ref(CURRENT_SHOP_ID + '/staffs/' + staffId);
        return ref.set(data).then(function() {
            return saveToLocal('staffs', data);
        }).then(function() {
            return data;
        });
    }
    
    function getStaffs() {
        return getAll('staffs').then(function(localStaffs) {
            if (localStaffs && localStaffs.length > 0) {
                _getDb().ref(CURRENT_SHOP_ID + '/staffs').once('value').then(function(snapshot) {
                    var data = snapshot.val() || {};
                    for (var key in data) {
                        if (data.hasOwnProperty(key)) {
                            var item = data[key];
                            item.id = key;
                            saveToLocal('staffs', item);
                        }
                    }
                }).catch(function() {
                });
                return localStaffs;
            }
            return _getDb().ref(CURRENT_SHOP_ID + '/staffs').once('value').then(function(snapshot) {
                var data = snapshot.val() || {};
                var list = [];
                for (var key in data) {
                    if (data.hasOwnProperty(key)) {
                        var item = data[key];
                        item.id = key;
                        list.push(item);
                    }
                }
                for (var i = 0; i < list.length; i++) {
                    saveToLocal('staffs', list[i]);
                }
                return list;
            }).catch(function() {
                return getAll('staffs');
            });
        });
    }
    
    function logout() {
        currentUser = null;
        localStorage.removeItem('pos_session');
        localStorage.removeItem('pos_firebase_config');
        CURRENT_SHOP_ID = 'shop_default';
        localStorage.setItem('current_shop_id', 'shop_default');
        
        // Dọn dẹp secondary Firebase app nếu có
        if (_secondaryApp) {
            try {
                _secondaryApp.delete();
            } catch(e) {
                console.warn('⚠️ Could not delete secondary Firebase app:', e.message);
            }
            _secondaryApp = null;
            _secondaryDb = null;
        }
        
        console.log('👋 Logged out');
    }
    
    function getCurrentUser() {
        return currentUser;
    }
    
    function isLoggedIn() {
        return currentUser !== null;
    }
    
    function isAdmin() {
        return currentUser && (currentUser.role === 'admin' || currentUser.role === 'master_admin' || currentUser.role === 'pos_admin');
    }

    // Alias for isAdmin - dùng trong expense.js và các module khác
    function isAdminUser() {
        return isAdmin();
    }

    function getShopConfig() {
        return dbReady.then(function() {
            if (!isOnline) return Promise.resolve({});
            return _getDb().ref(CURRENT_SHOP_ID + '/info').once('value').then(function(snapshot) {
                return snapshot.val() || {};
            }).catch(function() {
                return {};
            });
        });
    }

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
        isAdminUser: isAdminUser,
        clearLocalData: clearLocalData,
        forceSyncFromFirebase: forceSyncFromFirebase,
        ensureCollection: ensureCollection,
        whenSyncComplete: whenSyncComplete,
        batchUpdateSortOrder: batchUpdateSortOrder,
        getShopConfig: getShopConfig,
        reconcileSnapshot: reconcileSnapshot,
        getDirtyCollections: function() { return Object.keys(_dirtyCollections); },
        renderOn: function(collection, selector, renderFn) {
            return _renderOn(collection, selector, renderFn);
        },
        ensureRecentDaysData: ensureRecentDaysData,
        // Multi-tenant support
        initWithCustomConfig: initWithCustomConfig,
        _getDb: _getDb,
        reinitializeSubscriptions: _reinitializeSubscriptions,
        // Hàm database gốc (cho master-config.js dùng để luôn truy cập default Firebase)
        _origFirebaseDatabase: _origFirebaseDatabase
    };

    // Global export cho các module cũ gọi isAdminUser() trực tiếp (expense.js, v.v.)
    window.isAdminUser = isAdminUser;
})();
