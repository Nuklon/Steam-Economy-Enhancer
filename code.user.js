// ==UserScript==
// @name        Steam Economy Enhancer
// @namespace   https://github.com/Nuklon
// @author      Nuklon
// @license     MIT
// @version     2.5.0
// @description Enhances the Steam Inventory and Steam Market.
// @include     *://steamcommunity.com/id/*/inventory*
// @include     *://steamcommunity.com/profiles/*/inventory*
// @include     *://steamcommunity.com/market*
// @include     *://steamcommunity.com/tradeoffer*
// @require     https://raw.githubusercontent.com/caolan/async/master/dist/async.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/localforage/1.4.3/localforage.min.js
// @require     https://raw.githubusercontent.com/kapetan/jquery-observe/master/jquery-observe.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/datejs/1.0/date.min.js
// @require     https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @homepageURL https://github.com/Nuklon/Steam-Economy-Enhancer
// @supportURL  https://github.com/Nuklon/Steam-Economy-Enhancer/issues
// @downloadURL https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js
// @updateURL   https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js
// ==/UserScript==

(function ($, async) {
    const STEAM_INVENTORY_ID = 753;

    const PAGE_MARKET = 0;
    const PAGE_TRADEOFFER = 1;
    const PAGE_INVENTORY = 2;

    const COLOR_ERROR = '#8A4243';
    const COLOR_SUCCESS = '#407736';
    const COLOR_PENDING = '#908F44';
    const COLOR_PRICE_FAIR = '#496424';
    const COLOR_PRICE_CHEAP = '#837433';
    const COLOR_PRICE_EXPENSIVE = '#813030';

    const ERROR_SUCCESS = null;
    const ERROR_FAILED = 1;
    const ERROR_DATA = 2;

    var queuedItems = [];
    var lastSort = 0;

    var enableConsoleLog = false;

    var isLoggedIn = typeof g_rgWalletInfo !== 'undefined' || (typeof g_bLoggedIn !== 'undefined' && g_bLoggedIn);

    var currentPage = window.location.href.includes('.com/market') ? PAGE_MARKET : (window.location.href.includes('.com/tradeoffer') ? PAGE_TRADEOFFER : PAGE_INVENTORY);
    var market = new SteamMarket(g_rgAppContextData, typeof g_strInventoryLoadURL !== 'undefined' ? g_strInventoryLoadURL : location.protocol + '//steamcommunity.com/my/inventory/json/', isLoggedIn ? g_rgWalletInfo : undefined);
    var user_currency = GetCurrencySymbol(GetCurrencyCode(isLoggedIn ? market.walletInfo.wallet_currency : 1));

    function SteamMarket(appContext, inventoryUrl, walletInfo) {
        this.appContext = appContext;
        this.inventoryUrl = inventoryUrl;
        this.walletInfo = walletInfo;
    }

    //#region Settings
    const SETTING_MIN_NORMAL_PRICE = 'SETTING_MIN_NORMAL_PRICE';
    const SETTING_MAX_NORMAL_PRICE = 'SETTING_MAX_NORMAL_PRICE';
    const SETTING_MIN_FOIL_PRICE = 'SETTING_MIN_FOIL_PRICE';
    const SETTING_MAX_FOIL_PRICE = 'SETTING_MAX_FOIL_PRICE';
    const SETTING_MIN_MISC_PRICE = 'SETTING_MIN_MISC_PRICE';
    const SETTING_MAX_MISC_PRICE = 'SETTING_MAX_MISC_PRICE';
    const SETTING_PRICE_OFFSET = 'SETTING_PRICE_OFFSET';
    const SETTING_PRICE_ALGORITHM = 'SETTING_PRICE_ALGORITHM';
    const SETTING_LAST_CACHE = 'SETTING_LAST_CACHE';
    const SETTING_RELIST_AUTOMATICALLY = 'SETTING_RELIST_AUTOMATICALLY';

    var settingDefaults =
    {
        SETTING_MIN_NORMAL_PRICE: 0.05,
        SETTING_MAX_NORMAL_PRICE: 2.50,
        SETTING_MIN_FOIL_PRICE: 0.15,
        SETTING_MAX_FOIL_PRICE: 10,
        SETTING_MIN_MISC_PRICE: 0.05,
        SETTING_MAX_MISC_PRICE: 10,
        SETTING_PRICE_OFFSET: -0.01,
        SETTING_PRICE_ALGORITHM: 1,
        SETTING_LAST_CACHE: 0,
        SETTING_RELIST_AUTOMATICALLY: 0
    };

    function getSettingWithDefault(name) {
        return getLocalStorageItem(name) || (name in settingDefaults ? settingDefaults[name] : null);
    }

    function setSetting(name, value) {
        setLocalStorageItem(name, value);
    }
    //#endregion

    //#region Storage

    var storagePersistent = localforage.createInstance({
        name: 'see_persistent'
    });

    var storageSession;

    // This does not work the same as the 'normal' session storage because opening a new browser session/tab will clear the cache.
    // For this reason, a rolling cache is used.
    if (getSessionStorageItem('SESSION') == null) {
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

    //#region Price helpers
    function getPriceInformationFromInventoryItem(item) {
        var isTradingCard = getIsTradingCard(item);
        var isFoilTradingCard = getIsFoilTradingCard(item);
        return getPriceInformation(isTradingCard, isFoilTradingCard);
    }

    function getPriceInformationFromListing(url, game_name) {
        var appid = url.substr(0, url.lastIndexOf("/"));
        appid = appid.substr(appid.lastIndexOf("/") + 1)

        isTradingCard = false;
        isFoilTradingCard = false;

        // Unfortunately, on the market page, there is no inventory available, which means we have to check the name.
        // This also means the market only works correctly with Steam on English.
        if (parseInt(appid) === STEAM_INVENTORY_ID) {
            var isTradingCard = game_name.toLowerCase().includes('trading card') || url.toLowerCase().includes('trading%20card');
            var isFoilTradingCard = game_name.toLowerCase().includes('foil trading card') || url.toLowerCase().includes('foil%20trading%20card') || url.toLowerCase().includes('%28foil%29');
        }

        return getPriceInformation(isTradingCard, isFoilTradingCard);
    }

    function getPriceInformation(isTradingCard, isFoilTradingCard) {
        var maxPrice = 0;
        var minPrice = 0;

        if (!isTradingCard) {
            maxPrice = getSettingWithDefault(SETTING_MAX_MISC_PRICE);
            minPrice = getSettingWithDefault(SETTING_MIN_MISC_PRICE);
        } else {
            maxPrice = isFoilTradingCard ? getSettingWithDefault(SETTING_MAX_FOIL_PRICE) : getSettingWithDefault(SETTING_MAX_NORMAL_PRICE);
            minPrice = isFoilTradingCard ? getSettingWithDefault(SETTING_MIN_FOIL_PRICE) : getSettingWithDefault(SETTING_MIN_NORMAL_PRICE);
        }

        maxPrice = maxPrice * 100.0;
        minPrice = minPrice * 100.0;

        var maxPriceBeforeFee = market.getPriceBeforeFees(maxPrice);
        var minPriceBeforeFee = market.getPriceBeforeFees(minPrice);

        return { maxPrice: maxPrice, minPrice: minPrice, maxPriceBeforeFee: maxPriceBeforeFee, minPriceBeforeFee: minPriceBeforeFee };
    }

    // Calculates the average history price, before the fee.
    function calculateAverageHistory(history) {
        var highest = 0;
        var total = 0;

        if (history != null) {
            // Highest average price in the last 12 hours.
            var timeAgo = Date.now() - (12 * 60 * 60 * 1000);

            history.forEach(function (historyItem) {
                var d = new Date(historyItem[0]);
                if (d.getTime() > timeAgo) {
                    highest += historyItem[1] * historyItem[2];
                    total += historyItem[2];
                }
            });
        }

        if (total == 0)
            return 0;

        highest = Math.floor(highest / total);
        return market.getPriceBeforeFees(highest);
    }

    // Calculate the sell price based on the history and listings.
    // applyOffset specifies whether the price offset should be applied when the listings are used to determine the price.
    function calculateSellPriceHistogram(history, histogram, applyOffset) {
        var historyPrice = calculateAverageHistory(history);

        if (histogram == null || typeof histogram.lowest_sell_order === 'undefined' || typeof histogram.sell_order_graph === 'undefined')
            return historyPrice;

        if (histogram.lowest_sell_order == null) // This means that we did managed to retrieve the histogram, but there are no current listings.
            return 0; // In this case we should return 0 so the price can be determined by its minimum and maximum value.

        var listingPrice = market.getPriceBeforeFees(histogram.lowest_sell_order);
        var useAverage = getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1;

        // If the highest average price is lower than the first listing, return the offset + that listing.
        // Otherwise, use the highest average price instead.
        if (historyPrice < listingPrice || !useAverage) {
            if (applyOffset) {
                return listingPrice + (getSettingWithDefault(SETTING_PRICE_OFFSET) * 100);
            }
            return listingPrice;
        } else {
            return historyPrice;
        }
    }
    //#endregion

    //#region Integer helpers
    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function getNumberOfDigits(x) {
        return (Math.log10((x ^ (x >> 31)) - (x >> 31)) | 0) + 1;
    }

    function padLeftZero(str, max) {
        str = str.toString();
        return str.length < max ? padLeftZero("0" + str, max) : str;
    }

    function replaceNonNumbers(str) {
        return str.replace(/\D/g, '');
    }
    //#endregion

    //#region Steam Market
    // Gets all items in your inventory for a game
    // e.g.
    // [: { // An item
    //          id: 1000,
    //          market_name: "Bloodstone of the Ancestor",
    //          ....
    //    }
    // ]
    //
    // Item:
    //{"id":"60967810",
    //	"classid":"171856304",
    //	"instanceid":"256346122",
    //	"amount":"1",
    //	"pos":5,
    //	"appid":"753",
    //	"icon_url":"hARaDSYycBddc2R60GxSGDxIkLxiQn5JmLy_bHmWA7dZDHTtcWUnD_Srfoj0TQCLLRODrTUIMlueveFte5cJr00FeKRtJSMM8PdzzfpTH48wAdb4bV1mCsqtt3V2nFOKXgtu9mZgBRL67HKf_kAbwD1Rhas9UGNY1O7sNynAVuwbAy_9aX58Ufi8eI6jGwyHMFjd9WFdMlvbv-o4e8xAqkIFO_tnOSAF69tyhvpECttnXoCtbF1oDdrs7DF7z17iSVMuqDx8dQb6sC-Po0AL32xa3fVrDmcDwqmwZjyPU-s=",
    //	"icon_url_large":"hARaDSYycBddc2R60GxSGDxIkLxiQn5JmLy_bHmWA7dZDHTtcWUnD_Srfoj0TQCLLRODrTUIMlueveFte5cJr00FeKRtJSMM8PdzzfpTH48wAdb4bV1mCsqtt3V2nFOKXgtu9mZgBRL67HKf_kAbwD1Rhas9UGNY1O7sNynAVuwbAy_9aX58Ufi8eI6jGwyHMFjd9WFdMlvbv-o4e8xAqkIFO_tnOSAF69tyhvpECttnXoCtbF1oDdrs7DF7z17iSVMuqDx8dQb6sC-Po0AL32xa3fVrDmcDwqmwZjyPU-s=",
    //	"icon_drag_url":"",
    //	"name":"Prison Architect",
    //	"market_hash_name":"245070-Prison Architect",
    //	"market_name":"Prison Architect",
    //	"name_color":"",
    //	"background_color":"",
    //	"type":"Steam Summer Getaway Trading Card",
    //	"tradable":1,
    //	"marketable":1,
    //	"market_fee_app":"233450",
    //	"descriptions":[{"value":""}],
    //	"owner_actions":[{"name":"View badge progress","link":"http://steamcommunity.com/my/gamecards/245070/"}],
    //	"tags":[{"internal_name":"droprate_0","name":"Common","category":"droprate","category_name":"Rarity"},{"internal_name":"app_245070","name":"Steam Summer Getaway","category":"Game","category_name":"Game"},{"internal_name":"item_class_2","name":"Trading Card","category":"item_class","category_name":"Item Type"}],
    //	"contextid":"6"}
    SteamMarket.prototype.getInventory = function (gameId, callback/*(error, inventory)*/) {
        var self = this;
        var game = this.getGames()[gameId];
        var contextId;
        var tasks = {};

        // Build the requests for each inventory context as tasks for async
        for (contextId in game.rgContexts) {
            tasks[contextId] = (function (contextId) {
                return function (next) {
                    $.get(self.inventoryUrl + gameId + '/' + contextId + '/', function (data) {
                        if (!data && !data.success) {
                            return next(true);
                        }

                        next(null, data);
                    }, 'json');
                }
            })(contextId);
        }

        // Request all the inventories
        async.parallel(tasks, function (err, results) {
            if (err) {
                return callback(err);
            }

            var items = [];

            for (var id in results) {
                if (results[id].rgInventory.length === 0) {
                    continue;
                }
                results[id] = denormalizeItems(results[id], id);

                for (var i in results[id]) {
                    results[id][i].contextid = id;
                    items.push(results[id][i]);
                }
            }

            callback(ERROR_SUCCESS, items);
        });
    };

    // Sell an item with a price in cents.
    // Price is before fees.
    SteamMarket.prototype.sellItem = function (item, price, callback/*err, data*/) {
        var sessionId = readCookie('sessionid');
        var itemId = item.assetid || item.id;
        $.ajax({
            type: "POST",
            url: 'https://steamcommunity.com/market/sellitem/',
            data: {
                sessionid: sessionId,
                appid: item.appid,
                contextid: item.contextid,
                assetid: itemId,
                amount: 1,
                price: price
            },
            success: function (data) {
                callback(ERROR_SUCCESS, data);
            },
            error: function (data) {
                return callback(ERROR_FAILED, data);
            },
            crossDomain: true,
            xhrFields: { withCredentials: true },
            dataType: 'json'
        });
    };

    // Removes an item.
    // Item is the unique item id.
    SteamMarket.prototype.removeListing = function (item, callback/*err, data*/) {
        var sessionId = readCookie('sessionid');
        $.ajax({
            type: "POST",
            url: window.location.protocol + '//steamcommunity.com/market/removelisting/' + item,
            data: {
                sessionid: sessionId
            },
            success: function (data) {
                callback(ERROR_SUCCESS, data);
            },
            error: function () {
                return callback(ERROR_FAILED);
            },
            crossDomain: true,
            xhrFields: { withCredentials: true },
            dataType: 'json'
        });
    };

    SteamMarket.prototype.getGames = function () {
        return this.appContext;
    };

    // Get the price history for an item.
    //
    // PriceHistory is an array of prices in the form [data, price, number sold].
    // Example: [["Fri, 19 Jul 2013 01:00:00 +0000",7.30050206184,362]]
    // Prices are ordered by oldest to most recent.
    // Price is inclusive of fees.
    SteamMarket.prototype.getPriceHistory = function (item, cache, callback) {
        try {
            var market_name = getMarketHashName(item);
            if (market_name == null) {
                callback(ERROR_FAILED);
                return;
            }

            var appid = item.appid;

            if (cache) {
                var storage_hash = 'pricehistory_' + appid + '+' + market_name;

                storageSession.getItem(storage_hash)
                              .then(function (value) {
                                  if (value != null)
                                      callback(ERROR_SUCCESS, value, true);
                                  else
                                      market.getCurrentPriceHistory(appid, market_name, callback);
                              })
                              .catch(function (error) {
                                  market.getCurrentPriceHistory(appid, market_name, callback);
                              });
            } else
                market.getCurrentPriceHistory(appid, market_name, callback);
        } catch (e) {
            return callback(ERROR_FAILED);
        }
    };

    // Get the current price history for an item.
    SteamMarket.prototype.getCurrentPriceHistory = function (appid, market_name, callback) {
        var url = window.location.protocol + '//steamcommunity.com/market/pricehistory/?appid=' + appid + '&market_hash_name=' + market_name;

        $.get(url,
            function (data) {
                if (!data || !data.success || !data.prices) {
                    callback(ERROR_DATA);
                    return;
                }

                // Multiply prices so they're in pennies.
                for (var i = 0; i < data.prices.length; i++) {
                    data.prices[i][1] *= 100;
                    data.prices[i][2] = parseInt(data.prices[i][2]);
                }

                // Store the price history in the session storage.
                var storage_hash = 'pricehistory_' + appid + '+' + market_name;
                storageSession.setItem(storage_hash, data.prices);

                callback(ERROR_SUCCESS, data.prices, false);
            }, 'json')
         .fail(function () {
             return callback(ERROR_FAILED);
         });
    }

    // Get the item name id from a market item.
    //
    // This id never changes so we can store this in the persistent storage.
    SteamMarket.prototype.getMarketItemNameId = function (item, callback) {
        try {
            var market_name = getMarketHashName(item);
            if (market_name == null) {
                callback(ERROR_FAILED);
                return;
            }

            var appid = item.appid;
            var storage_hash = 'itemnameid_' + appid + '+' + market_name;

            storagePersistent.getItem(storage_hash)
                             .then(function (value) {
                                 if (value != null)
                                     callback(ERROR_SUCCESS, value);
                                 else
                                     return market.getCurrentMarketItemNameId(appid, market_name, callback);
                             })
                             .catch(function (error) {
                                 return market.getCurrentMarketItemNameId(appid, market_name, callback);
                             });
        } catch (e) {
            return callback(ERROR_FAILED);
        }
    }

    // Get the item name id from a market item.
    SteamMarket.prototype.getCurrentMarketItemNameId = function (appid, market_name, callback) {
        var url = window.location.protocol + '//steamcommunity.com/market/listings/' + appid + '/' + market_name;
        $.get(url,
            function (page) {
                var matches = /Market_LoadOrderSpread\( (.+) \);/.exec(page);
                if (matches == null) {
                    callback(ERROR_DATA);
                    return;
                }

                var item_nameid = matches[1];

                // Store the item name id in the persistent storage.
                var storage_hash = 'itemnameid_' + appid + '+' + market_name;
                storagePersistent.setItem(storage_hash, item_nameid);

                callback(ERROR_SUCCESS, item_nameid);
            })
         .fail(function () {
             return callback(ERROR_FAILED);
         });
    };

    // Get the sales listings for this item in the market, with more information.
    //
    //{
    //"success" : 1,
    //"sell_order_table" : "<table class=\"market_commodity_orders_table\"><tr><th align=\"right\">Price<\/th><th align=\"right\">Quantity<\/th><\/tr><tr><td align=\"right\" class=\"\">0,04\u20ac<\/td><td align=\"right\">311<\/td><\/tr><tr><td align=\"right\" class=\"\">0,05\u20ac<\/td><td align=\"right\">895<\/td><\/tr><tr><td align=\"right\" class=\"\">0,06\u20ac<\/td><td align=\"right\">495<\/td><\/tr><tr><td align=\"right\" class=\"\">0,07\u20ac<\/td><td align=\"right\">174<\/td><\/tr><tr><td align=\"right\" class=\"\">0,08\u20ac<\/td><td align=\"right\">49<\/td><\/tr><tr><td align=\"right\" class=\"\">0,09\u20ac or more<\/td><td align=\"right\">41<\/td><\/tr><\/table>",
    //"sell_order_summary" : "<span class=\"market_commodity_orders_header_promote\">1965<\/span> for sale starting at <span class=\"market_commodity_orders_header_promote\">0,04\u20ac<\/span>",
    //"buy_order_table" : "<table class=\"market_commodity_orders_table\"><tr><th align=\"right\">Price<\/th><th align=\"right\">Quantity<\/th><\/tr><tr><td align=\"right\" class=\"\">0,03\u20ac<\/td><td align=\"right\">93<\/td><\/tr><\/table>",
    //"buy_order_summary" : "<span class=\"market_commodity_orders_header_promote\">93<\/span> requests to buy at <span class=\"market_commodity_orders_header_promote\">0,03\u20ac<\/span> or lower",
    //"highest_buy_order" : "3",
    //"lowest_sell_order" : "4",
    //"buy_order_graph" : [[0.03, 93, "93 buy orders at 0,03\u20ac or higher"]],
    //"sell_order_graph" : [[0.04, 311, "311 sell orders at 0,04\u20ac or lower"], [0.05, 1206, "1,206 sell orders at 0,05\u20ac or lower"], [0.06, 1701, "1,701 sell orders at 0,06\u20ac or lower"], [0.07, 1875, "1,875 sell orders at 0,07\u20ac or lower"], [0.08, 1924, "1,924 sell orders at 0,08\u20ac or lower"], [0.09, 1934, "1,934 sell orders at 0,09\u20ac or lower"], [0.1, 1936, "1,936 sell orders at 0,10\u20ac or lower"], [0.11, 1937, "1,937 sell orders at 0,11\u20ac or lower"], [0.12, 1944, "1,944 sell orders at 0,12\u20ac or lower"], [0.14, 1945, "1,945 sell orders at 0,14\u20ac or lower"]],
    //"graph_max_y" : 3000,
    //"graph_min_x" : 0.03,
    //"graph_max_x" : 0.14,
    //"price_prefix" : "",
    //"price_suffix" : "\u20ac"
    //}
    SteamMarket.prototype.getItemOrdersHistogram = function (item, cache, callback) {
        try {
            var market_name = getMarketHashName(item);
            if (market_name == null) {
                callback(ERROR_FAILED);
                return;
            }

            var appid = item.appid;

            if (cache) {
                var storage_hash = 'itemordershistogram_' + appid + '+' + market_name;
                storageSession.getItem(storage_hash)
                              .then(function (value) {
                                  if (value != null)
                                      callback(ERROR_SUCCESS, value, true);
                                  else
                                      market.getCurrentItemOrdersHistogram(item, market_name, callback);
                              })
                              .catch(function (error) {
                                  market.getCurrentItemOrdersHistogram(item, market_name, callback);
                              });
            } else {
                market.getCurrentItemOrdersHistogram(item, market_name, callback);
            }

        } catch (e) {
            return callback(ERROR_FAILED);
        }
    };

    // Get the sales listings for this item in the market, with more information.
    SteamMarket.prototype.getCurrentItemOrdersHistogram = function (item, market_name, callback) {
        market.getMarketItemNameId(item,
            function (error, item_nameid) {
                if (error) {
                    callback(ERROR_DATA);
                    return;
                }

                var currency = market.walletInfo.wallet_currency;
                var url = window.location.protocol + '//steamcommunity.com/market/itemordershistogram?language=english&currency=' + currency + '&item_nameid=' + item_nameid + '&two_factor=0';

                $.get(url,
                        function (pageHistogram) {
                            // Store the histogram in the session storage.
                            var storage_hash = 'itemordershistogram_' + item.appid + '+' + market_name;
                            storageSession.setItem(storage_hash, pageHistogram);

                            callback(ERROR_SUCCESS, pageHistogram, false);
                        })
                    .fail(function () {
                        return callback(ERROR_FAILED);
                    });
            });
    };

    // Calculate the price before fees (seller price) from the buyer price
    SteamMarket.prototype.getPriceBeforeFees = function (price, item) {
        var publisherFee = -1;
        if (typeof item !== 'undefined') {
            if (typeof item.market_fee !== 'undefined')
                publisherFee = item.market_fee;
            else if (typeof item.description !== 'undefined' && typeof item.description.market_fee !== 'undefined')
                publisherFee = item.description.market_fee;
        }
        if (publisherFee == -1)
            publisherFee = this.walletInfo['wallet_publisher_fee_percent_default'];

        price = Math.round(price);
        var feeInfo = CalculateFeeAmount(price, publisherFee, this.walletInfo);

        return price - feeInfo.fees;
    };

    // Calculate the buyer price from the seller price
    SteamMarket.prototype.getPriceIncludingFees = function (price, item) {
        var publisherFee = -1;
        if (typeof item !== 'undefined') {
            if (typeof item.market_fee !== 'undefined')
                publisherFee = item.market_fee;
            else if (typeof item.description !== 'undefined' && typeof item.description.market_fee !== 'undefined')
                publisherFee = item.description.market_fee;
        }
        if (publisherFee == -1)
            publisherFee = this.walletInfo['wallet_publisher_fee_percent_default'];

        price = Math.round(price);
        var feeInfo = CalculateAmountToSendForDesiredReceivedAmount(price, publisherFee, this.walletInfo);

        return feeInfo.amount;
    };
    //#endregion

    function escapeURI(name) {
        return name.replace('?', '%3F')
                   .replace('#', '%23')
                   .replace('	', '%09');
    }

    //#region Steam Market / Inventory helpers
    function getMarketHashName(item) {
        if (typeof item === 'undefined')
            return null;

        if (typeof item.description !== 'undefined' && typeof item.description.market_hash_name !== 'undefined')
            return escapeURI(item.description.market_hash_name);

        if (typeof item.description !== 'undefined' && typeof item.description.name !== 'undefined')
            return escapeURI(item.description.name);

        if (typeof item.market_hash_name !== 'undefined')
            return escapeURI(item.market_hash_name);

        if (typeof item.name !== 'undefined')
            return escapeURI(item.name);

        return null;
    }

    function getIsTradingCard(item) {
        if (typeof item === 'undefined')
            return false;

        if (typeof item.marketable !== 'undefined' && !item.marketable)
            return false;

        if (typeof item.description !== 'undefined' && typeof item.description.marketable !== 'undefined' && !item.description.marketable)
            return false;

        var tags = typeof item.tags !== 'undefined' ? item.tags : (typeof item.description !== 'undefined' && typeof item.description.tags !== 'undefined' ? item.description.tags : null);
        if (tags == null)
            return false;

        var isTaggedAsTradingCard = false;
        tags.forEach(function (arrayItem) {
            if (arrayItem.category == 'item_class')
                if (arrayItem.internal_name == 'item_class_2') // trading card.
                    isTaggedAsTradingCard = true;
        });

        return isTaggedAsTradingCard;
    }

    function getIsFoilTradingCard(item) {
        if (!getIsTradingCard(item))
            return false;

        var isTaggedAsFoilTradingCard = false;
        var tags = typeof item.tags !== 'undefined' ? item.tags : (typeof item.description !== 'undefined' && typeof item.description.tags !== 'undefined' ? item.description.tags : null);
        if (tags == null)
            return false;

        tags.forEach(function (arrayItem) {
            if (arrayItem.category == 'cardborder')
                if (arrayItem.internal_name == 'cardborder_1') // foil border.
                    isTaggedAsFoilTradingCard = true;
        });

        return isTaggedAsFoilTradingCard;
    }

    function CalculateFeeAmount(amount, publisherFee, walletInfo) {
        if (!walletInfo['wallet_fee'])
            return 0;
        publisherFee = (typeof publisherFee == 'undefined') ? 0 : publisherFee;
        // Since CalculateFeeAmount has a Math.floor, we could be off a cent or two. Let's check:
        var iterations = 0; // shouldn't be needed, but included to be sure nothing unforseen causes us to get stuck
        var nEstimatedAmountOfWalletFundsReceivedByOtherParty = parseInt((amount - parseInt(walletInfo['wallet_fee_base'])) / (parseFloat(walletInfo['wallet_fee_percent']) + parseFloat(publisherFee) + 1));
        var bEverUndershot = false;
        var fees = CalculateAmountToSendForDesiredReceivedAmount(nEstimatedAmountOfWalletFundsReceivedByOtherParty, publisherFee, walletInfo);
        while (fees.amount != amount && iterations < 10) {
            if (fees.amount > amount) {
                if (bEverUndershot) {
                    fees = CalculateAmountToSendForDesiredReceivedAmount(nEstimatedAmountOfWalletFundsReceivedByOtherParty - 1, publisherFee, walletInfo);
                    fees.steam_fee += (amount - fees.amount);
                    fees.fees += (amount - fees.amount);
                    fees.amount = amount;
                    break;
                } else {
                    nEstimatedAmountOfWalletFundsReceivedByOtherParty--;
                }
            } else {
                bEverUndershot = true;
                nEstimatedAmountOfWalletFundsReceivedByOtherParty++;
            }
            fees = CalculateAmountToSendForDesiredReceivedAmount(nEstimatedAmountOfWalletFundsReceivedByOtherParty, publisherFee, walletInfo);
            iterations++;
        }
        // fees.amount should equal the passed in amount
        return fees;
    }

    // Clamps the price between min and max (inclusive).
    // zeroOrLower specifies the value to use if the price is zero or lower.
    function clampPrice(cur, min, max, zeroOrLower) {
        if (cur <= 0)
            cur = zeroOrLower;

        if (cur < min)
            cur = min;

        if (cur > max)
            cur = max;

        return cur;
    }

    // Strangely named function, it actually works out the fees and buyer price for a seller price
    function CalculateAmountToSendForDesiredReceivedAmount(receivedAmount, publisherFee, walletInfo) {
        if (!walletInfo['wallet_fee']) {
            return receivedAmount;
        }
        publisherFee = (typeof publisherFee == 'undefined') ? 0 : publisherFee;
        var nSteamFee = parseInt(Math.floor(Math.max(receivedAmount * parseFloat(walletInfo['wallet_fee_percent']), walletInfo['wallet_fee_minimum']) + parseInt(walletInfo['wallet_fee_base'])));
        var nPublisherFee = parseInt(Math.floor(publisherFee > 0 ? Math.max(receivedAmount * publisherFee, 1) : 0));
        var nAmountToSend = receivedAmount + nSteamFee + nPublisherFee;
        return {
            steam_fee: nSteamFee,
            publisher_fee: nPublisherFee,
            fees: nSteamFee + nPublisherFee,
            amount: parseInt(nAmountToSend)
        };
    }

    // Get a list of items with description data from the inventory json
    function denormalizeItems(inventory) {
        var id;
        var item;
        var description;

        for (id in inventory.rgInventory) {
            item = inventory.rgInventory[id];
            description = inventory.rgDescriptions[item.classid + '_' + item.instanceid];
            for (var key in description) {
                item[key] = description[key];
            }
        }

        return inventory.rgInventory;
    }

    function readCookie(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) == ' ')
                c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) == 0)
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
        }
        return null;
    }
    //#endregion

    //#region Logging
    var logger = document.createElement('div');
    logger.setAttribute('id', 'logger');

    function logDOM(text) {
        logger.innerHTML += text + '<br/>';
    }

    function clearLogDOM() {
        logger.innerHTML = '';
    }

    function logConsole(text) {
        if (enableConsoleLog) {
            console.log(text);
        }
    }
    //#endregion

    //#region Inventory
    if (currentPage == PAGE_INVENTORY) {
        var numberOfProcessedItemsInSellQueue = 0;

        var sellQueue = async.queue(function (task, next) {
            market.sellItem(task.item, task.sellPrice, function (err, data) {
                numberOfProcessedItemsInSellQueue++;

                var digits = getNumberOfDigits(queuedItems.length);
                var itemId = task.item.assetid || task.item.id;
                var itemName = task.item.name || task.item.description.name;
                var padLeft = padLeftZero('' + numberOfProcessedItemsInSellQueue, digits) + ' / ' + queuedItems.length;

                if (!err) {
                    logDOM(padLeft + ' - ' + itemName + ' added to market for ' + (market.getPriceIncludingFees(task.sellPrice) / 100.0).toFixed(2) + user_currency + '.');

                    $('#' + task.item.appid + '_' + task.item.contextid + '_' + itemId).css('background', COLOR_SUCCESS);
                } else {
                    if (typeof data.responseJSON.message != 'undefined')
                        logDOM(padLeft + ' - ' + itemName + ' not added to market because ' + data.responseJSON.message[0].toLowerCase() + data.responseJSON.message.slice(1));
                    else
                        logDOM(padLeft + ' - ' + itemName + ' not added to market.');

                    $('#' + task.item.appid + '_' + task.item.contextid + '_' + itemId).css('background', COLOR_ERROR);
                }

                next();
            });
        }, 1);

        function sellAllItems(appId) {
            market.getInventory(appId, function (err, items) {
                if (err)
                    return logDOM('Something went wrong fetching inventory, try again...');
                else {
                    var filteredItems = [];

                    items.forEach(function (item) {
                        if (!item.marketable) {
                            return;
                        }

                        filteredItems.push(item);
                    });

                    sellItems(filteredItems);
                }
            });
        }

        function sellAllCards() {
            market.getInventory(STEAM_INVENTORY_ID, function (err, items) {
                if (err)
                    return logDOM('Something went wrong fetching inventory, try again...');
                else {
                    var filteredItems = [];

                    items.forEach(function (item) {
                        if (!getIsTradingCard(item)) {
                            return;
                        }

                        filteredItems.push(item);
                    });

                    sellItems(filteredItems);
                }
            });
        }

        function sellSelectedItems() {
            var idsToSell = [];
            $('.inventory_ctn').each(function () {
                $(this).find('.inventory_page').each(function () {
                    var inventory_page = this;

                    $(inventory_page).find('.itemHolder').each(function () {
                        if (!$(this).hasClass('ui-selected'))
                            return;

                        $(this).find('.item').each(function () {
                            var matches = this.id.match(/_(\-?\d+)$/);
                            if (matches) {
                                idsToSell.push(matches[1]);
                            }
                        });
                    });
                });
            });

            var appId = $('.games_list_tabs .active')[0].hash.replace(/^#/, '');
            market.getInventory(appId, function (err, items) {
                if (err)
                    return logDOM('Something went wrong fetching inventory, try again...');

                var filteredItems = [];

                items.forEach(function (item) {
                    if (!item.marketable) {
                        return;
                    }

                    var itemId = item.assetid || item.id;
                    if (idsToSell.indexOf(itemId) !== -1) {
                        filteredItems.push(item);
                    }
                });

                sellItems(filteredItems);
            });
        }

        function sellItems(items) {
            var numberOfFailedItems = 0;

            var itemQueue = async.queue(function (item, next) {
                itemQueueWorker(item, item.ignoreErrors, function (success, cached) {
                    if (success) {
                        if (numberOfFailedItems > 0)
                            numberOfFailedItems--;

                        setTimeout(function () {
                            next();
                        }, cached ? 0 : getRandomInt(500, 1000));
                    } else {
                        if (!item.ignoreErrors) {
                            item.ignoreErrors = true;
                            itemQueue.push(item);
                        }

                        if (numberOfFailedItems < 2)
                            numberOfFailedItems++;

                        var delay = numberOfFailedItems > 1 || itemQueue.length < 2 ? getRandomInt(30000, 45000) : getRandomInt(500, 1000);

                        setTimeout(function () {
                            next();
                        }, cached ? 0 : delay);
                    }
                });
            }, 1);

            items = items.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

            items.forEach(function (item, index, array) {
                var itemId = item.assetid || item.id;
                if (queuedItems.indexOf(itemId) == -1) {
                    item.ignoreErrors = false;

                    queuedItems.push(itemId);
                    itemQueue.push(item);
                }
            });
        }

        function itemQueueWorker(item, ignoreErrors, callback) {
            var priceInfo = getPriceInformationFromInventoryItem(item);

            var failed = 0;
            var itemName = item.name || item.description.name;

            market.getPriceHistory(item, true, function (err, history, cachedHistory) {
                if (err) {
                    logConsole('Failed to get price history for ' + itemName);

                    if (err == ERROR_FAILED)
                        failed += 1;
                }

                market.getItemOrdersHistogram(item, true, function (err, histogram, cachedListings) {
                    if (err) {
                        logConsole('Failed to get orders histogram for ' + itemName);

                        if (err == ERROR_FAILED)
                            failed += 1;
                    }

                    if (failed > 0 && !ignoreErrors) {
                        return callback(false, cachedHistory && cachedListings);
                    }

                    logConsole('============================')
                    logConsole(itemName);


                    var sellPrice = calculateSellPriceHistogram(history, histogram, true);

                    var maxPriceBeforeFee = priceInfo.maxPriceBeforeFee;
                    if (histogram != null && typeof histogram.highest_buy_order !== 'undefined') {
                        if (market.getPriceBeforeFees(histogram.highest_buy_order) > maxPriceBeforeFee) // In case there's a buy order with a value larger than our defined maximum.
                            maxPriceBeforeFee = market.getPriceBeforeFees(histogram.highest_buy_order);
                    }

                    logConsole('Calculated sell price: ' + sellPrice / 100.0 + ' (' + market.getPriceIncludingFees(sellPrice) / 100.0 + ')');

                    sellPrice = clampPrice(sellPrice, priceInfo.minPriceBeforeFee, maxPriceBeforeFee, maxPriceBeforeFee);

                    logConsole('Used sell price: ' + sellPrice / 100.0 + ' (' + market.getPriceIncludingFees(sellPrice) / 100.0 + ')');

                    sellQueue.push({
                        item: item,
                        sellPrice: sellPrice
                    });

                    return callback(true, cachedHistory && cachedListings);
                });
            });
        }
    }

    // Initialize the inventory UI.
    function initializeInventoryUI() {
        var previousSelection = -1; // To store the index of the previous selection.
        updateInventoryUI();

        $('.games_list_tabs').on('click', '*', function () {
            updateInventoryUI();
        });

        var filter = ".itemHolder";
        $('#inventories').selectable({
            filter: filter,
            selecting: function (e, ui) {
                var selectedIndex = $(ui.selecting.tagName, e.target).index(ui.selecting); // Get selected item index.
                if (e.shiftKey && previousSelection > -1) { // If shift key was pressed and there is previous - select them all.
                    $(ui.selecting.tagName, e.target).slice(Math.min(previousSelection, selectedIndex), 1 + Math.max(previousSelection, selectedIndex)).each(function () {
                        if ($(this).is(filter))
                            $(this).addClass('ui-selected');
                    });
                    previousSelection = 0; // Reset previous.
                } else {
                    previousSelection = selectedIndex; // Save previous.
                }
            }
        });

        $('.inventory_page_right').observe('childlist', '.hover_item_name:visible', function (record) {
            var item_info_id = $(this).attr('id').replace('_item_name', '');
            var item_info = $('#' + item_info_id);

            if (item_info.html().indexOf('checkout/sendgift/') > -1) // Gifts have no market information.
                return;

            // Move scrap to bottom, this is of little interest.
            var scrap = $('#' + item_info_id + '_scrap_content');
            scrap.next().insertBefore(scrap);

            // Starting at prices are already retrieved in the table.
            $('#' + item_info_id + '_item_market_actions > div:nth-child(1) > div:nth-child(2)').remove();

            var market_hash_name = getMarketHashName(g_ActiveInventory.selectedItem);
            if (market_hash_name == null)
                return;

            var appid = g_ActiveInventory.selectedItem.appid;
            var item = { appid: parseInt(appid), description: { market_hash_name: market_hash_name } };

            var itemName = g_ActiveInventory.selectedItem.name || g_ActiveInventory.selectedItem.description.name;

            market.getItemOrdersHistogram(item, false,
                function (err, listings) {
                    if (err) {
                        logConsole('Failed to get orders histogram for ' + itemName);
                        return;
                    }

                    var groupMain = $('<div id="listings_group">' +
                                        '<div><div id="listings_sell">Sell</div>' + listings.sell_order_table + '</div>' +
                                        '<div><div id="listings_buy">Buy</div>' + listings.buy_order_table + '</div>' +
                                      '</div>');

                    $('.item_market_actions > div', item_info).after(groupMain);

                    // Generate quick sell buttons.
                    var itemId = g_ActiveInventory.selectedItem.assetid || g_ActiveInventory.selectedItem.id;
                    if (queuedItems.indexOf(itemId) != -1) { // There's no need to add queued items again.
                        return;
                    }

                    var prices = [];

                    if (listings.highest_buy_order != null) {
                        prices.push(parseInt(listings.highest_buy_order));
                    }

                    if (listings.lowest_sell_order != null) {
                        prices.push(parseInt(listings.lowest_sell_order) - 1);
                        prices.push(parseInt(listings.lowest_sell_order));
                        prices.push(parseInt(listings.lowest_sell_order) + 1);
                    }

                    var priceInformation = getPriceInformationFromInventoryItem(g_ActiveInventory.selectedItem);
                    prices.push(priceInformation.minPrice);
                    prices.push(priceInformation.maxPrice);

                    prices = prices.filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

                    var buttons = '<br/>';
                    prices.forEach(function (e) {
                        buttons += '<a class="item_market_action_button item_market_action_button_green quick_sell" id="quick_sell' + e + '">' +
                                        '<span class="item_market_action_button_edge item_market_action_button_left"></span>' +
                                        '<span class="item_market_action_button_contents">' + (e / 100.0) + user_currency + '</span>' +
                                        '<span class="item_market_action_button_edge item_market_action_button_right"></span>' +
                                        '<span class="item_market_action_button_preload"></span>' +
                                   '</a>'
                    });

                    $('#' + item_info_id + '_item_market_actions').append(buttons);

                    $('.quick_sell').on('click', function () {
                        if (queuedItems.indexOf(itemId) != -1) { // There's no need to add queued items again.
                            return;
                        }

                        var price = $(this).attr('id').replace('quick_sell', '');
                        price = market.getPriceBeforeFees(price);

                        queuedItems.push(itemId);
                        sellQueue.push({
                            item: g_ActiveInventory.selectedItem,
                            sellPrice: price
                        });
                    });
                });
        });
    }

    // Update the inventory UI.
    function updateInventoryUI() {
        // Remove previous containers (e.g., when a user changes inventory).
        $('#inventory_sell_buttons').remove();
        $('#inventory_price_buttons').remove();
        $('#inventory_reload_button').remove();

        var isSteamInventory = $('.games_list_tabs .active').attr('href').endsWith('#753');


        // Initialize the extra buttons.
        var priceButtons = $('<div id="inventory_price_buttons">' +
                                '<div class="filter_tag_button_ctn">' +
                                    '<div class="btn_black btn_details btn_small">' +
                                        '<span>Default pricing... ' +
                                            '<span class="btn_details_arrow down"></span>' +
                                        '</span>' +
                                    '</div>' +
                                '</div>' +
                                '<div>' +
                                    (isSteamInventory ?
                                    '<div style="margin-bottom:6px;margin-top:6px">' +
                                        'Minimum:&nbsp;<input class="price_input" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_NORMAL_PRICE + '" value=' + getSettingWithDefault(SETTING_MIN_NORMAL_PRICE) + '>&nbsp;' +
                                        'and maximum:&nbsp;<input class="price_input" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_NORMAL_PRICE + '" value=' + getSettingWithDefault(SETTING_MAX_NORMAL_PRICE) + '>&nbsp;for normal cards' +
                                        '<br/>' +
                                    '</div>' +
                                    '<div style="margin-bottom:6px;">' +
                                        'Minimum:&nbsp;<input class="price_input" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_FOIL_PRICE + '" value=' + getSettingWithDefault(SETTING_MIN_FOIL_PRICE) + '>&nbsp;' +
                                        'and maximum:&nbsp;<input class="price_input" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_FOIL_PRICE + '" value=' + getSettingWithDefault(SETTING_MAX_FOIL_PRICE) + '>&nbsp;for foil cards' +
                                        '<br/>' +
                                    '</div>' +
                                    '<div style="margin-bottom:6px;">' +
                                        'Minimum:&nbsp;<input class="price_input" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_MISC_PRICE + '" value=' + getSettingWithDefault(SETTING_MIN_MISC_PRICE) + '>&nbsp;' +
                                        'and maximum:&nbsp;<input class="price_input" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_MISC_PRICE + '" value=' + getSettingWithDefault(SETTING_MAX_MISC_PRICE) + '>&nbsp;for items' +
                                        '<br/>' +
                                    '</div>' +
                                    '<div style="margin-bottom:6px;">' +
                                        'Algorithm:&nbsp;<select class="price_input" style="background-color: black;color: white;border: transparent;" id="' + SETTING_PRICE_ALGORITHM + '">' +
                                            '<option value="1"' + (getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1 ? 'selected="selected"' : '') + '>Maximum of average price (12 hours) and lowest listing</option>' +
                                            '<option value="2" ' + (getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 2 ? 'selected="selected"' : '') + '>Lowest listing</option>' +
                                        '</select>' +
                                        '<br/>' +
                                    '</div>' +
                                    '<div>' +
                                        'Difference when the lowest listing is used:&nbsp;<input class="price_input" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_PRICE_OFFSET + '" value=' + getSettingWithDefault(SETTING_PRICE_OFFSET) + '>' +
                                        '<br/>' +
                                    '</div>' :
                                    '<div style="margin-bottom:6px;margin-top:6px">' +
                                        'Minimum:&nbsp;<input class="price_input" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_MISC_PRICE + '" value=' + getSettingWithDefault(SETTING_MIN_MISC_PRICE) + '>&nbsp;' +
                                        'Maximum:&nbsp;<input class="price_input" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_MISC_PRICE + '" value=' + getSettingWithDefault(SETTING_MAX_MISC_PRICE) + '>&nbsp;for items' +
                                        '<br/>' +
                                    '</div>'
                                    ) +
                                '</div>' +
                           '</div>');

        var sellButtons = $('<div id="inventory_sell_buttons" style="margin-bottom:12px;">' +
                                '<a class="btn_green_white_innerfade btn_medium_wide sell_all"><span>Sell All Items</span></a>&nbsp;&nbsp;&nbsp;' +
                                '<a class="btn_green_white_innerfade btn_medium_wide sell_selected"><span>Sell Selected Items</span></a>&nbsp;&nbsp;&nbsp;' +
                                (isSteamInventory ? '<a class="btn_darkblue_white_innerfade btn_medium_wide sell_all_cards"><span>Sell All Cards</span></a>&nbsp;&nbsp;&nbsp;' : '') +
                            '</div>');

        var reloadButton = $('<a id="inventory_reload_button" class="btn_darkblue_white_innerfade btn_medium_wide reload_inventory" style="margin-right:12px"><span>Reload Inventory</span></a>');

        $('#inventory_logos')[0].style.height = 'auto';

        $('#inventory_applogo').hide(); // Hide the Steam/game logo, we don't need to see it twice.
        $('#inventory_applogo').after(logger);
        $('#inventory_applogo').after(priceButtons);
        $('#inventory_applogo').after(sellButtons);

        $('.inventory_rightnav').prepend(reloadButton);


        // Add bindings to all extra buttons.
        $('.sell_all').on('click', '*', function () {
            var appId = $('.games_list_tabs .active')[0].hash.replace(/^#/, '');
            sellAllItems(appId);
        });
        $('.sell_selected').on('click', '*', sellSelectedItems);
        $('.sell_all_cards').on('click', '*', sellAllCards);

        $('.reload_inventory').on('click', '*', function () {
            window.location.reload();
        });

        $('.price_input').change(function () {
            setSetting(SETTING_MIN_NORMAL_PRICE, $('#' + SETTING_MIN_NORMAL_PRICE).val());
            setSetting(SETTING_MAX_NORMAL_PRICE, $('#' + SETTING_MAX_NORMAL_PRICE).val());
            setSetting(SETTING_MIN_FOIL_PRICE, $('#' + SETTING_MIN_FOIL_PRICE).val());
            setSetting(SETTING_MAX_FOIL_PRICE, $('#' + SETTING_MAX_FOIL_PRICE).val());
            setSetting(SETTING_MIN_MISC_PRICE, $('#' + SETTING_MIN_MISC_PRICE).val());
            setSetting(SETTING_MAX_MISC_PRICE, $('#' + SETTING_MAX_MISC_PRICE).val());
            setSetting(SETTING_PRICE_OFFSET, $('#' + SETTING_PRICE_OFFSET).val());
            setSetting(SETTING_PRICE_ALGORITHM, $('#' + SETTING_PRICE_ALGORITHM).val());
        });

        $('#inventory_price_buttons').accordion({
            collapsible: true,
            active: true,
        });
    }
    //#endregion

    //#region Market
    if (currentPage == PAGE_MARKET) {

        var marketListingsQueue = async.queue(function (listing, next) {
            marketListingsQueueWorker(listing, false, function (success, cached) {
                if (success) {
                    setTimeout(function () {
                        next();
                    }, cached ? 0 : getRandomInt(500, 1000));
                } else {
                    setTimeout(function () {
                        marketListingsQueueWorker(listing, true, function (success, cached) {
                            next(); // Go to the next queue item, regardless of success.
                        });
                    }, cached ? 0 : getRandomInt(30000, 45000));
                }
            });
        }, 1);

        marketListingsQueue.drain = function () {
            injectJs(function () {
                g_bMarketWindowHidden = false;
            })
        };

        function marketListingsQueueWorker(listing, ignoreErrors, callback) {
            var url = $('.market_listing_item_name_link', listing).attr('href');
            var name = $('.market_listing_item_name_link', listing).text().trim();
            var game_name = $('.market_listing_game_name', listing).text().trim();
            var price = $('.market_listing_price > span:nth-child(1) > span:nth-child(1)', listing).text().trim().replace('--', '00').replace(/\D/g, '');

            var priceInfo = getPriceInformationFromListing(url, game_name);

            var appid = url.substr(0, url.lastIndexOf("/"));
            appid = appid.substr(appid.lastIndexOf("/") + 1);
            var market_hash_name = url.substr(url.lastIndexOf("/") + 1);
            var item = { appid: parseInt(appid), description: { market_hash_name: market_hash_name } };

            var failed = 0;

            market.getPriceHistory(item, true, function (errorPriceHistory, history, cachedHistory) {
                if (errorPriceHistory) {
                    logConsole('Failed to get price history for ' + game_name);

                    if (errorPriceHistory == ERROR_FAILED)
                        failed += 1;
                }

                market.getItemOrdersHistogram(item, true, function (errorHistogram, histogram, cachedListings) {
                    if (errorHistogram) {
                        logConsole('Failed to get orders histogram for ' + game_name);

                        if (errorHistogram == ERROR_FAILED)
                            failed += 1;
                    }

                    if (failed > 0 && !ignoreErrors) {
                        return callback(false, cachedHistory && cachedListings);
                    }

                    logConsole('============================')
                    logConsole(game_name + ': ' + name);
                    logConsole('Sell price: ' + price);

                    var sellPrice = calculateSellPriceHistogram(history, histogram, false);

                    //// In case there's only one item - the item we're currently listing. // Unfortunately, sell_order_graph is not always populated with up-to-date values.
                    //if (histogram.sell_order_graph !== 'undefined' && histogram.sell_order_graph.length == 1 && histogram.sell_order_graph[0][1] == 1) {
                    //    sellPrice = priceInfo.maxPriceBeforeFee;
                    //}

                    // In case there's a buy order with a value larger than our defined maximum.
                    var maxPriceBeforeFee = priceInfo.maxPriceBeforeFee;
                    if (histogram != null && typeof histogram.highest_buy_order !== 'undefined') {
                        if (market.getPriceBeforeFees(histogram.highest_buy_order) > maxPriceBeforeFee)
                            maxPriceBeforeFee = market.getPriceBeforeFees(histogram.highest_buy_order);
                    }

                    logConsole('Calculated sell price: ' + sellPrice / 100.0 + ' (' + market.getPriceIncludingFees(sellPrice) / 100.0 + ')');

                    sellPrice = clampPrice(sellPrice, priceInfo.minPriceBeforeFee, maxPriceBeforeFee, market.getPriceBeforeFees(price));

                    logConsole('Used sell price: ' + sellPrice / 100.0 + ' (' + market.getPriceIncludingFees(sellPrice) / 100.0 + ')');

                    var sellPriceIncludingFees = market.getPriceIncludingFees(sellPrice);
                    listing.addClass('price_' + sellPriceIncludingFees);
                    $('.market_listing_my_price', listing).last().prop('title', 'Best price is ' + (sellPriceIncludingFees / 100.0) + user_currency);

                    if (sellPriceIncludingFees < price) {
                        logConsole('Sell price is too high.');

                        $('.market_listing_my_price', listing).last().css('background', COLOR_PRICE_EXPENSIVE);
                        listing.addClass('overpriced');

                        if (getSettingWithDefault(SETTING_RELIST_AUTOMATICALLY) == 1) {
                            queueOverpricedItemListing(listing);
                        }
                    }
                    else if (sellPriceIncludingFees > price) {
                        logConsole('Sell price is too low.');

                        $('.market_listing_my_price', listing).last().css('background', COLOR_PRICE_CHEAP);
                        listing.addClass('underpriced');
                    }
                    else {
                        logConsole('Sell price is fair.');

                        $('.market_listing_my_price', listing).last().css('background', COLOR_PRICE_FAIR);
                        listing.addClass('fair');
                    }

                    return callback(true, cachedHistory && cachedListings);
                });
            });
        }

        var marketOverpricedQueue = async.queue(function (item, next) {
            marketOverpricedQueueWorker(item, false, function (success) {
                if (success) {
                    setTimeout(function () {
                        next();
                    }, getRandomInt(500, 1000));
                } else {
                    setTimeout(function () {
                        marketOverpricedQueueWorker(item, true, function (success) {
                            next(); // Go to the next queue item, regardless of success.
                        });
                    }, getRandomInt(30000, 45000));
                }
            });
        }, 1);

        function marketOverpricedQueueWorker(item, ignoreErrors, callback) {
            market.removeListing(item.listing, function (errorRemove, data) {
                if (!errorRemove) {
                    $('.actual_content', '#mylisting_' + item.listing).css('background', COLOR_PENDING);

                    setTimeout(function () {
                        market.sellItem(item, market.getPriceBeforeFees(item.sellPrice), function (errorSell) {
                            if (!errorSell) {
                                $('.actual_content', '#mylisting_' + item.listing).css('background', COLOR_SUCCESS);

                                setTimeout(function () { $('#mylisting_' + item.listing).remove(); }, 3000);

                                return callback(true);
                            } else {
                                $('.actual_content', '#mylisting_' + item.listing).css('background', COLOR_ERROR);

                                return callback(false);
                            }
                        });
                    }, getRandomInt(500, 1000)); // Wait a little to make sure the item is returned to inventory.
                } else {
                    $('.actual_content', '#mylisting_' + item.listing).css('background', COLOR_ERROR);

                    return callback(false);
                }
            });
        }

        // Queue an overpriced item listing to be relisted.
        function queueOverpricedItemListing(listing) {
            var id = $('.market_listing_item_name', $(listing)).attr('id').replace('mylisting_', '').replace('_name', '');
            var listingUrl = $('.item_market_action_button_edit', $(listing)).first().attr('href');
            var listingUrlParts = listingUrl.split(',');
            var assetid = replaceNonNumbers(listingUrlParts.pop());
            var contextid = replaceNonNumbers(listingUrlParts.pop());
            var appid = replaceNonNumbers(listingUrlParts.pop());
            var price = -1;

            var items = $(listing).attr('class').split(' ');
            for (var i in items) {
                if (items[i].toString().includes('price_'))
                    price = parseInt(items[i].toString().replace('price_', ''));
            }

            if (price > 0) {
                marketOverpricedQueue.push({
                    listing: id,
                    assetid: assetid,
                    contextid: contextid,
                    appid: appid,
                    sellPrice: price
                });
            }
        }

        var marketRemoveQueue = async.queue(function (item, next) {
            marketRemoveQueueWorker(item, false, function (success) {
                if (success) {
                    setTimeout(function () {
                        next();
                    }, getRandomInt(500, 1000));
                } else {
                    setTimeout(function () {
                        marketRemoveQueueWorker(item, true, function (success) {
                            next(); // Go to the next queue item, regardless of success.
                        });
                    }, getRandomInt(30000, 45000));
                }
            });
        }, 1);

        function marketRemoveQueueWorker(item, ignoreErrors, callback) {
            market.removeListing(item, function (errorRemove, data) {
                if (!errorRemove) {
                    $('.actual_content', '#mylisting_' + item).css('background', COLOR_SUCCESS);

                    setTimeout(function () {
                        $('#mylisting_' + item).remove();

                        var numberOfListings = parseInt($('#my_market_selllistings_number').text());
                        if (numberOfListings > 0)
                            $('#my_market_selllistings_number').text((numberOfListings - 1).toString());

                        var numberOfActiveListings = parseInt($('#my_market_activelistings_number').text());
                        if (numberOfActiveListings > 0)
                            $('#my_market_activelistings_number').text((numberOfActiveListings - 1).toString());
                    }, 3000);

                    return callback(true);
                } else {
                    $('.actual_content', '#mylisting_' + item).css('background', COLOR_ERROR);

                    return callback(false);
                }
            });
        }

        // Process the market listings.
        function processMarketListings() {
            $('.my_listing_section > .market_listing_row').each(function (index) {
                var listing = $(this);

                $('.market_listing_cancel_button', listing).after(
                    '<div class="market_listing_select">' +
                        '<input type="checkbox" class="market_select_item"/>' +
                    '</div>');

                $('.market_select_item').change(updateMarketSelectAllButton);

                marketListingsQueue.push(listing);

                injectJs(function () {
                    g_bMarketWindowHidden = true; // Limit the number of requests made to Steam by stopping constant polling of popular listings.
                })
            });
        }

        // Update the select/deselect all button on the market.
        function updateMarketSelectAllButton() {
            var invert = $('.market_select_item:checked').length == $('.market_select_item').length;
            $('.select_all > span').text(invert ? 'Deselect all' : 'Select all');
        }

        // Initialize the market UI.
        function initializeMarketUI() {
            $('.my_market_header').append(
                '<div class="market_listing_buttons">' +
                    '<a class="item_market_action_button item_market_action_button_green select_overpriced market_listing_button">' +
                        '<span class="item_market_action_button_contents" style="text-transform:none">Select overpriced</span>' +
                    '</a>' +
                    '<a class="item_market_action_button item_market_action_button_green select_all market_listing_button">' +
                        '<span class="item_market_action_button_contents" style="text-transform:none">Select all</span>' +
                    '</a>' +
                    '<a class="item_market_action_button item_market_action_button_green remove_selected market_listing_button">' +
                        '<span class="item_market_action_button_contents" style="text-transform:none">Remove selected</span>' +
                    '</a>' +
                    '<a class="item_market_action_button item_market_action_button_green relist_overpriced market_listing_button">' +
                        '<span class="item_market_action_button_contents" style="text-transform:none">Relist overpriced</span>' +
                    '</a>' +
                    '<label class="market_relist_auto_label market_listing_label_right" for="market_listing_relist">' +
                        '<input id="market_listing_relist" class="market_relist_auto" type="checkbox" ' + (getSettingWithDefault(SETTING_RELIST_AUTOMATICALLY) == 1 ? 'checked=""' : '') + '>Automatically relist overpriced listings' +
                    '</label>' +
                '</div>');

            $('.market_listing_table_header').on('click', 'span', function () {
                if ($(this).hasClass('market_listing_edit_buttons') || $(this).hasClass('item_market_action_button_contents'))
                    return;

                if ($('#es_progress').length > 0) // Enhanced Steam.
                    return;

                var isPrice = $('.market_listing_table_header').children().eq(1).text() == $(this).text();
                var isDate = $('.market_listing_table_header').children().eq(2).text() == $(this).text();
                var isName = $('.market_listing_table_header').children().eq(3).text() == $(this).text();


                // Change sort order (asc/desc).
                var nextSort = isPrice ? 1 : (isDate ? 2 : 3);
                var asc = true;
                if (lastSort == nextSort) {
                    asc = false;
                    lastSort = -nextSort;
                } else
                    lastSort = nextSort;


                // (Re)set the asc/desc arrows.
                const arrow_down = '🡻';
                const arrow_up = '🡹';

                $('.market_listing_table_header > span').each(function () {
                    if ($(this).hasClass('market_listing_edit_buttons'))
                        return;

                    $(this).text($(this).text().replace(' ' + arrow_down, '').replace(' ' + arrow_up, ''));
                })

                $(this).text($(this).text() + ' ' + (asc ? arrow_up : arrow_down));


                // Sort the rows.
                $(this).parent().parent().find('.market_listing_row').sort(function (a, b) {
                    var first = asc ? a : b;
                    var second = asc ? b : a;

                    if (isName) {
                        var firstName = $(first).find('.market_listing_item_name_link').text().toLowerCase();
                        var secondName = $(second).find('.market_listing_item_name_link').text().toLowerCase();
                        return firstName.localeCompare(secondName);
                    } else if (isDate) {
                        var firstDate = Date.parse($(first).find('.market_listing_listed_date').text());
                        var secondDate = Date.parse($(second).find('.market_listing_listed_date').text());
                        var currentMonth = parseInt(Date.today().toString('M'));

                        if (parseInt(firstDate.toString('M')) > currentMonth)
                            firstDate = firstDate.addYears(-1);
                        if (parseInt(secondDate.toString('M')) > currentMonth)
                            secondDate = secondDate.addYears(-1);

                        return firstDate.compareTo(secondDate);
                    } else if (isPrice) {
                        var firstPrice = parseInt(replaceNonNumbers($(first).find('.market_listing_price > span > span:nth-child(1)').text()));
                        var secondPrice = parseInt(replaceNonNumbers($(second).find('.market_listing_price > span > span:nth-child(1)').text()));
                        return firstPrice - secondPrice;
                    }
                }).each(function (_, container) {
                    $(container).parent().append(container);
                });
            });

            setTimeout(function () {
                $('.market_listing_table_header > span').last().trigger('click');
                setTimeout(processMarketListings, 1000);
            }, 250);


            $('.select_all').on('click', '*', function () {
                var invert = $('.market_select_item:checked').length == $('.market_select_item').length;

                $('.market_listing_row', $(this).parent().parent().parent().parent()).each(function (index) {
                    $('.market_select_item', $(this)).prop('checked', !invert);
                });

                updateMarketSelectAllButton();
            });

            $('.select_overpriced').on('click', '*', function () {
                $('.market_listing_row', $(this).parent().parent().parent().parent()).each(function (index) {
                    if ($(this).hasClass('overpriced'))
                        $('.market_select_item', $(this)).prop('checked', true);
                });

                updateMarketSelectAllButton();
            });

            $('.remove_selected').on('click', '*', function () {
                var filteredItems = [];

                $('.market_listing_row', $(this).parent().parent().parent().parent()).each(function (index) {
                    if ($('.market_select_item', $(this)).prop('checked')) {
                        var id = $('.market_listing_item_name', $(this)).attr('id').replace('mylisting_', '').replace('_name', '');
                        marketRemoveQueue.push(id);
                    }
                });
            });

            $('.market_relist_auto').change(function () {
                setSetting(SETTING_RELIST_AUTOMATICALLY, $('.market_relist_auto').is(":checked") ? 1 : 0);
            });

            $('.relist_overpriced').on('click', '*', function () {
                $('.market_listing_row', $(this).parent().parent().parent().parent()).each(function (index) {
                    if ($(this).hasClass('overpriced')) {
                        queueOverpricedItemListing(this);
                    }
                });
            });
        }
    }
    //#endregion

    //#region Tradeoffers
    function sumTradeOfferAssets(assets, user) {
        var total = {};

        for (var i = 0; i < assets.length; i++) {
            var rgItem = user.findAsset(assets[i].appid, assets[i].contextid, assets[i].assetid);

            var text = '';
            if (typeof rgItem !== 'undefined') {
                if (typeof rgItem.original_amount !== 'undefined' && typeof rgItem.amount !== 'undefined') {
                    var originalAmount = parseInt(rgItem.original_amount);
                    var currentAmount = parseInt(rgItem.amount);
                    var usedAmount = originalAmount - currentAmount;
                    text += usedAmount.toString() + 'x ';
                }

                text += rgItem.name;

                if (typeof rgItem.type !== 'undefined' && rgItem.type.length > 0) {
                    text += ' (' + rgItem.type + ')';
                }
            }
            else
                text = 'Unknown Item';

            if (text in total)
                total[text] = total[text] + 1;
            else
                total[text] = 1;
        }

        var sortable = [];
        for (var item in total)
            sortable.push([item, total[item]])

        sortable.sort(function (a, b) {
            return a[1] - b[1];
        }).reverse();

        var totalText = '';

        for (var i = 0; i < sortable.length; i++) {
            totalText += sortable[i][1] + 'x ' + sortable[i][0] + '<br/>';
        }

        return totalText;
    }

    function initializeTradeOfferUI() {
        $('.trade_item_box').observe('childlist subtree', function (record) {
            $('#trade_offer_your_sum').remove();
            $('#trade_offer_their_sum').remove();

            var your_sum = sumTradeOfferAssets(g_rgCurrentTradeStatus.me.assets, UserYou);
            var their_sum = sumTradeOfferAssets(g_rgCurrentTradeStatus.them.assets, UserThem);

            $('div.offerheader:nth-child(1) > div:nth-child(3)').append('<div class="trade_offer_sum" id="trade_offer_your_sum">' + your_sum + '</div>');
            $('div.offerheader:nth-child(3) > div:nth-child(3)').append('<div class="trade_offer_sum" id="trade_offer_their_sum">' + their_sum + '</div>');
        });


        // This only works with a new trade offer.
        if (!window.location.href.includes('tradeoffer/new'))
            return;

        $('.trade_box_contents').observe('childlist', '.inventory_page:visible', function (record) { // Fixes a rendering bug from Steam.
            ShowTagFilters();
            setTimeout(HideTagFilters, 10);
        });

        $('#inventory_displaycontrols').append(
            '<br/>' +
            '<div class="trade_offer_buttons">' +
                '<a class="item_market_action_button item_market_action_button_green select_all" style="margin-top:1px">' +
                    '<span class="item_market_action_button_contents" style="text-transform:none">Select all from page</span>' +
                '</a>' +
            '</div>');

        $('.select_all').on('click', '*', function () {
            $('.inventory_ctn:visible > .inventory_page:visible > .itemHolder:visible').delayedEach(250, function (i, it) {
                var item = it.rgItem;
                if (item.is_stackable)
                    return;

                MoveItemToTrade(it);
            });
        });
    }
    //#endregion

    //#region UI
    injectCss('.ui-selected { outline: 1px groove #ABABAB; } ' +
           '#logger { color: #767676; font-size: 12px;margin-top:16px; }' +
           '.trade_offer_sum { color: #767676; font-size: 12px;margin-top:8px; }' +
           '.trade_offer_buttons { margin-top: 12px; }' +
           '.market_commodity_orders_table { font-size:12px; font-family: "Motiva Sans", Sans-serif; font-weight: 300; }' +
           '.market_commodity_orders_table th { padding-left: 10px; }' +
           '#listings_group { display: flex; justify-content: space-between; margin-bottom: 8px; }' +
           '#listings_sell { text-align: right; color: #589328; font-weight:600; }' +
           '#listings_buy { text-align: right; color: #589328; font-weight:600; }' +
           '.market_listing_my_price { height: 50px; padding-right:6px; }' +
           '.market_listing_edit_buttons.actual_content { width:276px; transition-property: background-color, border-color; transition-timing-function: linear; transition-duration: 0.5s;}' +
           '.market_listing_buttons { margin-top: 6px; background: rgba(0, 0, 0, 0.4); padding: 5px 0px 1px 0px; }' +
           '.market_listing_button { margin-right: 4px; }' +
           '.market_listing_button:first-child { margin-left: 4px; }' +
           '.market_listing_label_right { float:right; font-size:12px; margin-top:1px; }' +
           '.market_listing_select { position: absolute; top: 16px;right: 10px; display: flex; }' +
           '#market_listing_relist { vertical-align: middle; position: relative; bottom: -1px; right: 2px; }' +
           '.pick_and_sell_button > a { vertical-align: middle; }' +
           '.market_relist_auto { margin-bottom: 8px;  }' +
           '.market_relist_auto_label { margin-right: 6px;  }' +
           '.quick_sell { margin-right: 4px; }');

    $(window).load(function () {
        // Make sure the user is logged in, there's not much we can do otherwise.
        if (!isLoggedIn) {
            return;
        }

        if (currentPage == PAGE_INVENTORY) {
            initializeInventoryUI();
        }

        if (currentPage == PAGE_MARKET) {
            initializeMarketUI();
        }

        if (currentPage == PAGE_TRADEOFFER) {
            initializeTradeOfferUI();
        }
    });

    function injectCss(css) {
        var head, style;
        head = document.getElementsByTagName('head')[0];
        if (!head) {
            return;
        }
        style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        head.appendChild(style);
    }

    function injectJs(js) {
        var script = document.createElement('script');
        script.setAttribute("type", "application/javascript");
        script.textContent = '(' + js + ')();';
        document.body.appendChild(script);
        document.body.removeChild(script);
    }

    $.fn.delayedEach = function (timeout, callback, continuous) {
        var $els, iterator;

        $els = this;
        iterator = function (index) {
            var cur;

            if (index >= $els.length) {
                if (!continuous) {
                    return;
                }
                index = 0;
            }

            cur = $els[index];
            callback.call(cur, index, cur);

            setTimeout(function () {
                iterator(++index);
            }, timeout);
        };

        iterator(0);
    };
    //#endregion
})(jQuery, async);
