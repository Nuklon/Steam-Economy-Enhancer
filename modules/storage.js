//#region Storage

var storagePersistent = localforage.createInstance({
    name: 'see_persistent'
});

var storageSession;

var currentUrl = new URL(window.location.href);
var noCache = currentUrl.searchParams.get('no-cache') != null;

// This does not work the same as the 'normal' session storage because opening a new browser session/tab will clear the cache.
// For this reason, a rolling cache is used.
if (getSessionStorageItem('SESSION') == null || noCache) {
    var lastCache = getSettingWithDefault(SETTING_LAST_CACHE);
    if (lastCache > 5)
        lastCache = 0;

    setSetting(SETTING_LAST_CACHE, lastCache + 1);

    storageSession = localforage.createInstance({
        name: 'see_session_' + lastCache
    });

    storageSession.clear(); // Clear any previous data.
    setSessionStorageItem('SESSION', lastCache);
} else {
    storageSession = localforage.createInstance({
        name: 'see_session_' + getSessionStorageItem('SESSION')
    });
}

function getLocalStorageItem(name) {
    try {
        return localStorage.getItem(name);
    } catch (e) {
        return null;
    }
}

function setLocalStorageItem(name, value) {
    try {
        localStorage.setItem(name, value);
        return true;
    } catch (e) {
        logConsole('Failed to set local storage item ' + name + ', ' + e + '.')
        return false;
    }
}

function getSessionStorageItem(name) {
    try {
        return sessionStorage.getItem(name);
    } catch (e) {
        return null;
    }
}

function setSessionStorageItem(name, value) {
    try {
        sessionStorage.setItem(name, value);
        return true;
    } catch (e) {
        logConsole('Failed to set session storage item ' + name + ', ' + e + '.')
        return false;
    }
}
//#endregion