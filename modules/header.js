// jQuery is already added by Steam, force no conflict mode.
(function($, async) {
    $.noConflict(true);

    var DateTime = luxon.DateTime;

    const STEAM_INVENTORY_ID = 753;

    const PAGE_MARKET = 0;
    const PAGE_MARKET_LISTING = 1;
    const PAGE_TRADEOFFER = 2;
    const PAGE_INVENTORY = 3;

    const COLOR_ERROR = '#8A4243';
    const COLOR_SUCCESS = '#407736';
    const COLOR_PENDING = '#908F44';
    const COLOR_PRICE_FAIR = '#496424';
    const COLOR_PRICE_CHEAP = '#837433';
    const COLOR_PRICE_EXPENSIVE = '#813030';
    const COLOR_PRICE_NOT_CHECKED = '#26566c';

    const ERROR_SUCCESS = null;
    const ERROR_FAILED = 1;
    const ERROR_DATA = 2;

    var marketLists = [];
    var totalNumberOfProcessedQueueItems = 0;
    var totalNumberOfQueuedItems = 0;
    var totalPriceWithFeesOnMarket = 0;
    var totalPriceWithoutFeesOnMarket = 0;
    var totalScrap = 0;

    var spinnerBlock =
        '<div class="spinner"><div class="rect1"></div>&nbsp;<div class="rect2"></div>&nbsp;<div class="rect3"></div>&nbsp;<div class="rect4"></div>&nbsp;<div class="rect5"></div>&nbsp;</div>';
    var numberOfFailedRequests = 0;

    var enableConsoleLog = false;

    var isLoggedIn = typeof unsafeWindow.g_rgWalletInfo !== 'undefined' && unsafeWindow.g_rgWalletInfo != null || (typeof unsafeWindow.g_bLoggedIn !== 'undefined' && unsafeWindow.g_bLoggedIn);

    var currentPage = window.location.href.includes('.com/market') ?
        (window.location.href.includes('market/listings') ?
            PAGE_MARKET_LISTING :
            PAGE_MARKET) :
        (window.location.href.includes('.com/tradeoffer') ?
            PAGE_TRADEOFFER :
            PAGE_INVENTORY);

    var market = new SteamMarket(unsafeWindow.g_rgAppContextData,
        typeof unsafeWindow.g_strInventoryLoadURL !== 'undefined' && unsafeWindow.g_strInventoryLoadURL != null ?
        unsafeWindow.g_strInventoryLoadURL :
        location.protocol + '//steamcommunity.com/my/inventory/json/',
        isLoggedIn ? unsafeWindow.g_rgWalletInfo : undefined);

    var currencyId =
        isLoggedIn &&
        market != null &&
        market.walletInfo != null &&
        market.walletInfo.wallet_currency != null ?
        market.walletInfo.wallet_currency :
        3;

    var currencySymbol = unsafeWindow.GetCurrencySymbol(unsafeWindow.GetCurrencyCode(currencyId));

    const SETTING_MIN_NORMAL_PRICE = "SETTING_MIN_NORMAL_PRICE";
    const SETTING_MAX_NORMAL_PRICE = "SETTING_MAX_NORMAL_PRICE";
    const SETTING_MIN_FOIL_PRICE = "SETTING_MIN_FOIL_PRICE";
    const SETTING_MAX_FOIL_PRICE = "SETTING_MAX_FOIL_PRICE";
    const SETTING_MIN_MISC_PRICE = "SETTING_MIN_MISC_PRICE";
    const SETTING_MAX_MISC_PRICE = "SETTING_MAX_MISC_PRICE";
    const SETTING_PRICE_OFFSET = "SETTING_PRICE_OFFSET";
    const SETTING_PRICE_MIN_CHECK_PRICE = "SETTING_PRICE_MIN_CHECK_PRICE";
    const SETTING_PRICE_ALGORITHM = "SETTING_PRICE_ALGORITHM";
    const SETTING_PRICE_IGNORE_LOWEST_Q = "SETTING_PRICE_IGNORE_LOWEST_Q";
    const SETTING_PRICE_HISTORY_HOURS = "SETTING_PRICE_HISTORY_HOURS";
    const SETTING_INVENTORY_PRICE_LABELS = "SETTING_INVENTORY_PRICE_LABELS";
    const SETTING_TRADEOFFER_PRICE_LABELS = "SETTING_TRADEOFFER_PRICE_LABELS";
    const SETTING_LAST_CACHE = "SETTING_LAST_CACHE";
    const SETTING_RELIST_AUTOMATICALLY = "SETTING_RELIST_AUTOMATICALLY";
    const SETTING_MARKET_PAGE_COUNT = "SETTING_MARKET_PAGE_COUNT";
    const SETTING_INVENTORY_PRICES = "SETTING_INVENTORY_PRICES";
    var settingDefaults = {
      SETTING_MIN_NORMAL_PRICE: 0.05,
      SETTING_MAX_NORMAL_PRICE: 2.5,
      SETTING_MIN_FOIL_PRICE: 0.15,
      SETTING_MAX_FOIL_PRICE: 10,
      SETTING_MIN_MISC_PRICE: 0.05,
      SETTING_MAX_MISC_PRICE: 10,
      SETTING_PRICE_OFFSET: 0,
      SETTING_PRICE_MIN_CHECK_PRICE: 0,
      SETTING_PRICE_ALGORITHM: 1,
      SETTING_PRICE_IGNORE_LOWEST_Q: 1,
      SETTING_PRICE_HISTORY_HOURS: 12,
      SETTING_INVENTORY_PRICE_LABELS: 1,
      SETTING_TRADEOFFER_PRICE_LABELS: 1,
      SETTING_LAST_CACHE: 0,
      SETTING_RELIST_AUTOMATICALLY: 0,
      SETTING_MARKET_PAGE_COUNT: 100
    };

    function SteamMarket(appContext, inventoryUrl, walletInfo) {
        this.appContext = appContext;
        this.inventoryUrl = inventoryUrl;
        this.walletInfo = walletInfo;
        this.inventoryUrlBase = inventoryUrl.replace('/inventory/json', '');
        if (!this.inventoryUrlBase.endsWith('/'))
            this.inventoryUrlBase += '/';
    }

    function replaceAll(str, find, replace) {
        return str.replace(new RegExp(find, 'g'), replace);
    }

    // Cannot use encodeURI / encodeURIComponent, Steam only escapes certain characters.
    function escapeURI(name) {
        var previousName = '';
        while (previousName != name) {
            previousName = name;
            name = name.replace('?', '%3F')
                .replace('#', '%23')
                .replace('	', '%09');
        }
        return name;
    }

