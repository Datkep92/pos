// ========== db.js ES5 - Tương thích Android 6, iOS 16 ==========
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
        apiKey: "AIzaSyCQFIzj8m3kpsE_x354xxJ8MTAuRG9eCx4",
        authDomain: "posmilano.firebaseapp.com",
        projectId: "posmilano",
        databaseURL: "https://posmilano-default-rtdb.firebaseio.com",
        storageBucket: "posmilano.firebasestorage.app",
        messagingSenderId: "34185947554",
        appId: "1:34185947554:web:925f29864d3b17b8d46afb",
        measurementId: "G-J3MX8EL1C8"
    };
    firebase.initializeApp(firebaseConfig);
    var db = firebase.database();
    var auth = firebase.auth();

    // Constants
    var STORE_NAME = 'pos_data';
    // Đọc shopId từ localStorage, mặc định 'shop_default' nếu chưa có
    var CURRENT_SHOP_ID = localStorage.getItem('current_shop_id') || 'shop_default';
    var CURRENT_DEVICE_ID = localStorage.getItem('device_id') || ('device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
    localStorage.setItem('device_id', CURRENT_DEVICE_ID);
    
    // Biến lưu thông tin user hiện tại
    var currentUser = null;
    // Đọc session từ localStorage nếu có
    var savedSession = localStorage.getItem('pos_session');
    if (savedSession) {
        try { currentUser = JSON.parse(savedSession); } catch(e) { localStorage.removeItem('pos_session'); }
    }

    var localDB = null;
    var dbReady = null;
    var syncQueue = [];
    var isOnline = navigator.onLine;
    var listeners = {};
    
    // OPTIMIZE: Memory cache layer - tránh đọc IndexedDB liên tục
    var memoryCache = {};
    var cacheVersion = {};
    
    // FIX: Local callbacks - notify UI ngay sau khi ghi local, không chờ Firebase
    var _localCallbacks = {};
    
    // OPTIMIZE: Cơ chế suppress realtime notifications khi batch operations
    // Khi _suppressRealtime > 0, _notifyLocal sẽ không gọi callbacks
    // Dùng cho thanh toán, nhập hàng loạt, etc.
    var _suppressRealtime = 0;
    var _pendingNotifyCollections = {};

    // Helper: toDateKey
    function toDateKey(value) {
        if (!value) return '';
        if (typeof value === 'string') {
            if (value.length >= 10 && value[4] === '-' && value[7] === '-') return value.slice(0, 10);
            var parsed = Date.parse(value);
            if (!isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
            return '';
        }
        if (typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
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
    function _notifyLocal(collection) {
        // OPTIMIZE: Nếu đang suppress, ghi nhận collection cần notify sau
        if (_suppressRealtime > 0) {
            _pendingNotifyCollections[collection] = true;
            return;
        }
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
    function saveToLocal(collection, data) {
        return dbReady.then(function() {
            if (!localDB) throw new Error('DB not ready');
            if (!localDB.objectStoreNames.contains(collection)) throw new Error('Store ' + collection + ' not found');
            // Cập nhật memory cache ngay lập tức
            if (!memoryCache[collection]) memoryCache[collection] = {};
            memoryCache[collection][data.id] = data;
            cacheVersion[collection] = (cacheVersion[collection] || 0) + 1;
            // FIX: Notify local subscribers ngay, không chờ Firebase
            _notifyLocal(collection);
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
        return dbReady.then(function() {
            if (!localDB) return;
            if (!localDB.objectStoreNames.contains(collection)) return;
            // Xóa khỏi memory cache ngay
            if (memoryCache[collection]) {
                delete memoryCache[collection][id];
                cacheVersion[collection] = (cacheVersion[collection] || 0) + 1;
            }
            // FIX: Notify local subscribers ngay, không chờ Firebase
            _notifyLocal(collection);
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
            status: 'pending'
        };
        syncQueue.push(item);
        saveToLocal('sync_queue', item);
        if (isOnline) processSyncQueue();
        return item.id;
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
    function _batchSyncToFirebase(items) {
        if (items.length === 0) return Promise.resolve();
        var collection = items[0].collection;
        var action = items[0].action;
        var ref = db.ref(CURRENT_SHOP_ID + '/' + collection);
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
        });
    }
    
    function _handleSyncError(item, err) {
        item.retryCount++;
        if (item.retryCount < 5) {
            item.status = 'pending';
            return new Promise(function(r) { setTimeout(r, 2000 * item.retryCount); }).then(function() {
                return syncToFirebase(item).then(function() {
                    item.status = 'synced';
                    return deleteFromLocal('sync_queue', item.id);
                }).catch(function() {});
            });
        } else {
            item.status = 'failed';
            console.error('Sync failed:', item.action, item.collection, item.targetId);
            return saveToLocal('sync_queue', item);
        }
    }

    function syncToFirebase(item) {
        var ref = db.ref(CURRENT_SHOP_ID + '/' + item.collection + '/' + item.targetId);
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

    function create(collection, data, customId) {
        var id = customId || data.id || generateId();
        var newData = { id: id };
        for (var k in data) if (data.hasOwnProperty(k) && k !== 'id') newData[k] = data[k];
        newData.createdAt = Date.now();
        newData.createdBy = CURRENT_DEVICE_ID;
        newData.updatedAt = Date.now();
        newData._version = 1;
        return saveToLocal(collection, newData).then(function() {
            addToSyncQueue('create', collection, newData, id);
            if (isOnline) return processSyncQueue();
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
                if (isOnline) return processSyncQueue();
                return Promise.resolve();
            }).then(function() { return updated; });
        });
    }

    function remove(collection, id) {
        return deleteFromLocal(collection, String(id)).then(function() {
            addToSyncQueue('delete', collection, { id: id }, String(id));
            if (isOnline) return processSyncQueue();
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

    function getTransactionsByDate(dateKey, options) {
        options = options || {};
        var type = options.type || 'all';
        return dbReady.then(function() {
            if (!localDB || !localDB.objectStoreNames.contains('transactions')) return [];
            // OPTIMIZE: Memory cache - tránh đọc IndexedDB
            if (memoryCache.transactions) {
                var allTx = [];
                for (var key in memoryCache.transactions) {
                    if (memoryCache.transactions.hasOwnProperty(key)) {
                        allTx.push(memoryCache.transactions[key]);
                    }
                }
                var filtered = allTx.filter(function(t) { return t.dateKey === dateKey; });
                if (type !== 'all') filtered = filtered.filter(function(t) { return t.type === type; });
                return filtered;
            }
            return new Promise(function(resolve, reject) {
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
                    resolve(rows);
                };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

   function subscribeToCollection(collection, callback) {
    // FIX: Đăng ký local callback để UI nhận notify ngay sau ghi local
    if (callback) {
        if (!_localCallbacks[collection]) _localCallbacks[collection] = [];
        _localCallbacks[collection].push(callback);
    }
    
    var ref = db.ref(CURRENT_SHOP_ID + '/' + collection);
    var useIncremental = (collection === 'transactions' || collection === 'reports');
    if (useIncremental) {
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
            saveToLocal(collection, item).then(emitUpdate);
        };
        var onChanged = function(snapshot) {
            if (!snapshot.exists()) return;
            var key = snapshot.key;
            var src = snapshot.val() || {};
            var item = { id: key };
            for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
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
    } else {
        var scheduled = false;
        var handler = ref.on('value', function(snapshot) {
            var remote = snapshot.val() || {};
            var remoteMap = {};
            for (var key in remote) {
                if (remote.hasOwnProperty(key)) {
                    var item = { id: key };
                    var src = remote[key];
                    for (var p in src) if (src.hasOwnProperty(p)) item[p] = src[p];
                    remoteMap[key] = item;
                }
            }
            loadFromLocal(collection).then(function(localItems) {
                var toDelete = [];
                var toSave = [];
                var localMap = {};
                for (var i = 0; i < localItems.length; i++) localMap[localItems[i].id] = localItems[i];
                for (var id in localMap) {
                    if (!remoteMap[id]) toDelete.push(id);
                }
                for (var id in remoteMap) {
                    var local = localMap[id];
                    if (!local) toSave.push(remoteMap[id]);
                    else if ((remoteMap[id]._version || 0) > (local._version || 0)) toSave.push(remoteMap[id]);
                }
                var delPromises = toDelete.map(function(id) { return deleteFromLocal(collection, id); });
                var savePromises = toSave.map(function(item) { return saveToLocal(collection, item); });
                return Promise.all(delPromises.concat(savePromises)).then(function() {
                    return loadFromLocal(collection);
                }).then(function(newData) {
                    if (scheduled) return;
                    scheduled = true;
                    setTimeout(function() {
                        scheduled = false;
                        // FIX: Firebase callback - gọi sau local callback, tránh trùng
                        if (callback) callback(newData);
                        var evt = document.createEvent('CustomEvent');
                        evt.initCustomEvent('db_update', true, true, { detail: { collection: collection, data: newData } });
                        window.dispatchEvent(evt);
                    }, 200);
                });
            });
        });
        if (!listeners[collection]) listeners[collection] = [];
        listeners[collection].push(handler);
        return function() { ref.off('value', handler); };
    }
}
    // Network listener
    function initNetwork() {
        window.addEventListener('online', function() {
            isOnline = true;
            showToast('📡 Đã kết nối mạng', 'success');
            processSyncQueue();
        });
        window.addEventListener('offline', function() {
            isOnline = false;
            showToast('⚠️ Mất kết nối', 'warning');
        });
        isOnline = navigator.onLine;
    }

    // Historical sync (simplified, only if needed)
    function syncHistorical() {
        return Promise.resolve(); // bỏ qua historical sync cho gọn, vẫn realtime
    }

    // Init IndexedDB
    function initLocalDB() {
        if (dbReady) return dbReady;
        dbReady = new Promise(function(resolve, reject) {
            var request = indexedDB.open(STORE_NAME, 14);
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
    'ingredient_transactions', 'notifications'
];
                for (var i = 0; i < stores.length; i++) {
                    if (!db.objectStoreNames.contains(stores[i])) {
                        db.createObjectStore(stores[i], { keyPath: 'id' });
                        console.log('Created store:', stores[i]);
                    }
                }
                var txStore = e.target.transaction.objectStore('transactions');
                if (!txStore.indexNames.contains('dateKey')) txStore.createIndex('dateKey', 'dateKey', { unique: false });
                if (!txStore.indexNames.contains('type')) txStore.createIndex('type', 'type', { unique: false });
                if (!txStore.indexNames.contains('dateTypeKey')) txStore.createIndex('dateTypeKey', 'dateTypeKey', { unique: false });
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
    function seedDefaultShop() {
        return db.ref('shop_registry/123123').once('value').then(function(snapshot) {
            if (snapshot.exists()) return; // Đã có rồi, không cần seed
            
            console.log('🌱 Seeding default shop data...');
            var staffId = 'staff_admin_' + Date.now().toString(36);
            var updates = {};
            
            // Tạo shop_registry cho mã 123123 -> shop_default
            updates['shop_registry/123123'] = {
                shopId: 'shop_default',
                shopName: 'POS Cafe',
                shopCode: '123123',
                createdAt: Date.now()
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
                name: 'POS Cafe',
                code: '123123',
                createdAt: Date.now()
            };
            
            return db.ref().update(updates).then(function() {
                console.log('✅ Default shop seeded: mã 123123, user admin123123, pass 123123');
            });
        }).catch(function(err) {
            console.error('Seed error:', err);
        });
    }

    // Init Database
    function initDatabase() {
        return initLocalDB().then(function() {
            initNetwork();
            if (isOnline) return syncHistorical();
            return Promise.resolve();
        }).then(function() {
            // Seed dữ liệu mặc định nếu chưa có
            return seedDefaultShop();
        }).then(function() {
            // Subscribe to essential collections (real-time)
            subscribeToCollection('tables');
            subscribeToCollection('customers');
            subscribeToCollection('menu');
            subscribeToCollection('menu_categories');
            subscribeToCollection('ingredients');
            subscribeToCollection('cost_categories');
            subscribeToCollection('cost_transactions');
            subscribeToCollection('cost_transactions_admin');
            subscribeToCollection('admin_cost_categories');
            subscribeToCollection('transactions');
            subscribeToCollection('reports');
            subscribeToCollection('daily_balances');
            console.log('✅ Database ready, device:', CURRENT_DEVICE_ID);
            return { isOnline: isOnline, deviceId: CURRENT_DEVICE_ID };
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

    // ========== AUTH METHODS ==========
    
    // Xóa toàn bộ dữ liệu local (IndexedDB + memory cache) khi chuyển POS
    function clearLocalData() {
        // Xóa memory cache
        memoryCache = {};
        cacheVersion = {};
        
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
    
    // Đổi shopId (khi đăng nhập vào POS khác)
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
    
    // Đăng nhập: kiểm tra shopCode -> lấy shopId -> verify staff credentials
    function login(shopCode, username, password) {
        if (!shopCode || !username || !password) {
            return Promise.reject(new Error('Vui lòng nhập đầy đủ thông tin'));
        }
        // Tra cứu shopCode trong shop_registry
        return db.ref('shop_registry/' + shopCode).once('value').then(function(snapshot) {
            if (!snapshot.exists()) {
                throw new Error('Mã POS không tồn tại');
            }
            var shopInfo = snapshot.val();
            var shopId = shopInfo.shopId;
            
            // Kiểm tra staff credentials trong shops/{shopId}/staffs
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
                
                // Xóa dữ liệu local cũ trước khi chuyển POS
                return clearLocalData().then(function() {
                    // Lưu session
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
                    
                    // Cập nhật shopId
                    setShopId(shopId);
                    
                    return currentUser;
                });
            });
        });
    }
    
    // Đăng ký POS mới (tạo shop + admin)
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
        
        // Kiểm tra shopCode đã tồn tại chưa
        return db.ref('shop_registry/' + shopCode).once('value').then(function(snapshot) {
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
                createdAt: Date.now()
            };
            
            // Batch write: shop_registry + shop data + staff
            var updates = {};
            updates['shop_registry/' + shopCode] = registryData;
            updates[shopId + '/staffs/' + staffId] = staffData;
            updates[shopId + '/info'] = {
                name: shopName,
                code: shopCode,
                createdAt: Date.now()
            };
            
            return db.ref().update(updates).then(function() {
                // Xóa dữ liệu local cũ trước khi chuyển POS mới
                return clearLocalData();
            }).then(function() {
                // Tự động đăng nhập sau khi đăng ký
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
    
    // Tạo nhân viên mới (chỉ admin)
    function createStaff(staffData) {
        if (!currentUser || currentUser.role !== 'admin') {
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
        
        var ref = db.ref(CURRENT_SHOP_ID + '/staffs/' + staffId);
        return ref.set(data).then(function() {
            // Lưu vào IndexedDB local
            return saveToLocal('staffs', data);
        }).then(function() {
            return data;
        });
    }
    
    // Lấy danh sách nhân viên
    function getStaffs() {
        return db.ref(CURRENT_SHOP_ID + '/staffs').once('value').then(function(snapshot) {
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
    }
    
    // Đăng xuất
    function logout() {
        currentUser = null;
        localStorage.removeItem('pos_session');
        // Reset về shop mặc định
        CURRENT_SHOP_ID = 'shop_default';
        localStorage.setItem('current_shop_id', 'shop_default');
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
    
    // Kiểm tra có phải admin không
    function isAdmin() {
        return currentUser && currentUser.role === 'admin';
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
        subscribe: subscribeToCollection,
        isOnline: function() { return isOnline; },
        getDeviceId: function() { return CURRENT_DEVICE_ID; },
        processSyncQueue: processSyncQueue,
        getSyncQueue: function() { return syncQueue; },
        // OPTIMIZE: Suppress realtime notifications cho batch operations
        suppressRealtime: function() { _setSuppressRealtime(true); },
        flushRealtime: function() { _setSuppressRealtime(false); },
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
        clearLocalData: clearLocalData
    };
})();