// ==UserScript==
// @name        Steam Economy Enhancer
// @namespace   https://github.com/Nuklon
// @author      Nuklon
// @license     MIT
// @version     5.0.5
// @description Enhances the Steam Inventory and Steam Market.
// @include     *://steamcommunity.com/id/*/inventory*
// @include     *://steamcommunity.com/profiles/*/inventory*
// @include     *://steamcommunity.com/market*
// @include     *://steamcommunity.com/tradeoffer*
// @require     https://code.jquery.com/jquery-3.2.1.min.js
// @require     https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @require     https://raw.githubusercontent.com/kapetan/jquery-observe/master/jquery-observe.js
// @require     https://raw.githubusercontent.com/superRaytin/paginationjs/master/dist/pagination.js
// @require     https://raw.githubusercontent.com/caolan/async/master/dist/async.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/localforage/1.4.3/localforage.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/datejs/1.0/date.min.js
// @require     https://raw.githubusercontent.com/javve/list.js/v1.5.0/dist/list.min.js
// @require     http://underscorejs.org/underscore-min.js
// @homepageURL https://github.com/Nuklon/Steam-Economy-Enhancer
// @supportURL  https://github.com/Nuklon/Steam-Economy-Enhancer/issues
// @downloadURL https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js
// @updateURL   https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js
// ==/UserScript==

// jQuery is already added by Steam, force no conflict mode.
(function ($, async) {
    $.noConflict(true);

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

    const ERROR_SUCCESS = null;
    const ERROR_FAILED = 1;
    const ERROR_DATA = 2;

    var marketLists = [];
    var queuedItems = [];
    var spinnerBlock = '<div class="spinner"><div class="rect1"></div>&nbsp;<div class="rect2"></div>&nbsp;<div class="rect3"></div>&nbsp;<div class="rect4"></div>&nbsp;<div class="rect5"></div>&nbsp;</div>';

    var enableConsoleLog = false;

    var isLoggedIn = typeof g_rgWalletInfo !== 'undefined' || (typeof g_bLoggedIn !== 'undefined' && g_bLoggedIn);

    var currentPage = window.location.href.includes('.com/market')
        ? (window.location.href.includes('market/listings')
            ? PAGE_MARKET_LISTING
            : PAGE_MARKET)
        : (window.location.href.includes('.com/tradeoffer')
            ? PAGE_TRADEOFFER
            : PAGE_INVENTORY);

    var market = new SteamMarket(g_rgAppContextData, typeof g_strInventoryLoadURL !== 'undefined' ? g_strInventoryLoadURL : location.protocol + '//steamcommunity.com/my/inventory/json/', isLoggedIn ? g_rgWalletInfo : undefined);

    var currencyId = isLoggedIn && typeof market !== 'undefined' && typeof market.walletInfo !== 'undefined' && typeof market.walletInfo.wallet_currency !== 'undefined' ? market.walletInfo.wallet_currency : 3;
    var currencySymbol = GetCurrencySymbol(GetCurrencyCode(currencyId));

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
    const SETTING_PRICE_IGNORE_LOWEST_Q = 'SETTING_PRICE_IGNORE_LOWEST_Q';
    const SETTING_LAST_CACHE = 'SETTING_LAST_CACHE';
    const SETTING_RELIST_AUTOMATICALLY = 'SETTING_RELIST_AUTOMATICALLY';
    const SETTING_MARKET_PAGE_COUNT = 'SETTING_MARKET_PAGE_COUNT';

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
            SETTING_PRICE_IGNORE_LOWEST_Q: 1,
            SETTING_LAST_CACHE: 0,
            SETTING_RELIST_AUTOMATICALLY: 0,
            SETTING_MARKET_PAGE_COUNT: 100
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

    //#region Price helpers
    function getPriceInformationFromItem(item) {
        var isTradingCard = getIsTradingCard(item);
        var isFoilTradingCard = getIsFoilTradingCard(item);
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

        var maxPriceBeforeFees = market.getPriceBeforeFees(maxPrice);
        var minPriceBeforeFees = market.getPriceBeforeFees(minPrice);

        return { maxPrice, minPrice, maxPriceBeforeFees, minPriceBeforeFees };
    }

    // Calculates the average history price, before the fee.
    function calculateAverageHistoryPriceBeforeFees(history) {
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

    // Calculates the listing price, before the fee.    
    function calculateListingPriceBeforeFees(histogram) {
        if (histogram == null || typeof histogram.lowest_sell_order === 'undefined' || typeof histogram.sell_order_graph === 'undefined')
            return 0;

        var listingPrice = market.getPriceBeforeFees(histogram.lowest_sell_order);

        var shouldIgnoreLowestListingOnLowQuantity = getSettingWithDefault(SETTING_PRICE_IGNORE_LOWEST_Q) == 1;

        if (shouldIgnoreLowestListingOnLowQuantity && histogram.sell_order_graph.length >= 2) {
            var listingPrice2ndLowest = market.getPriceBeforeFees(histogram.sell_order_graph[1][0] * 100);

            if (listingPrice2ndLowest > listingPrice) {
                var numberOfListingsLowest = histogram.sell_order_graph[0][1];
                var numberOfListings2ndLowest = histogram.sell_order_graph[1][1];

                var percentageLower = (100 * (numberOfListingsLowest / numberOfListings2ndLowest));

                // The percentage should change based on the quantity (for example, 1200 listings vs 5, or 1 vs 25).
                if (numberOfListings2ndLowest >= 1000 && percentageLower <= 5) {
                    listingPrice = listingPrice2ndLowest;
                } else if (numberOfListings2ndLowest < 1000 && percentageLower <= 10) {
                    listingPrice = listingPrice2ndLowest;
                } else if (numberOfListings2ndLowest < 100 && percentageLower <= 15) {
                    listingPrice = listingPrice2ndLowest;
                } else if (numberOfListings2ndLowest < 50 && percentageLower <= 20) {
                    listingPrice = listingPrice2ndLowest;
                } else if (numberOfListings2ndLowest < 25 && percentageLower <= 25) {
                    listingPrice = listingPrice2ndLowest;
                } else if (numberOfListings2ndLowest < 10 && percentageLower <= 30) {
                    listingPrice = listingPrice2ndLowest;
                }
            }
        }

        return listingPrice;
    }

    // Calculate the sell price based on the history and listings.
    // applyOffset specifies whether the price offset should be applied when the listings are used to determine the price.
    function calculateSellPriceBeforeFees(history, histogram, applyOffset, minPriceBeforeFees, maxPriceBeforeFees) {
        var historyPrice = calculateAverageHistoryPriceBeforeFees(history);
        var listingPrice = calculateListingPriceBeforeFees(histogram);

        var shouldUseAverage = getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1;

        // If the highest average price is lower than the first listing, return the offset + that listing.
        // Otherwise, use the highest average price instead.
        var calculatedPrice = 0;

        if (historyPrice < listingPrice || !shouldUseAverage) {
            calculatedPrice = listingPrice;
        } else {
            calculatedPrice = historyPrice;
        }

        var changedToMax = false;
        // List for the maximum price if there are no listings yet.
        if (calculatedPrice == 0) {
            calculatedPrice = maxPriceBeforeFees;
            changedToMax = true;
        }


        // Apply the offset to the calculated price, but only if the price wasn't changed to the max (as otherwise it's impossible to list for this price).
        if (!changedToMax && applyOffset) {
            calculatedPrice = calculatedPrice + (getSettingWithDefault(SETTING_PRICE_OFFSET) * 100);
        }


        // Keep our minimum and maximum in mind.
        calculatedPrice = clamp(calculatedPrice, minPriceBeforeFees, maxPriceBeforeFees);


        // In case there's a buy order higher than the calculated price.
        if (histogram != null && typeof histogram.highest_buy_order !== 'undefined') {
            var buyOrderPrice = market.getPriceBeforeFees(histogram.highest_buy_order);
            if (buyOrderPrice > calculatedPrice)
                calculatedPrice = buyOrderPrice;
        }

        return calculatedPrice;
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
            .fail(function (data) {
                if (!data || !data.responseJSON) {
                    return callback(ERROR_FAILED);
                }
                if (!data.responseJSON.success) {
                    callback(ERROR_DATA);
                    return;
                }
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
                        else {
                            market.getCurrentItemOrdersHistogram(item, market_name, callback);
                        }
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
                var url = window.location.protocol + '//steamcommunity.com/market/itemordershistogram?language=english&currency=' + currencyId + '&item_nameid=' + item_nameid + '&two_factor=0';

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

        if (publisherFee == -1) {
            if (typeof this.walletInfo !== 'undefined')
                publisherFee = this.walletInfo['wallet_publisher_fee_percent_default'];
            else
                publisherFee = 0.10;
        }

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
        if (publisherFee == -1) {
            if (typeof this.walletInfo !== 'undefined')
                publisherFee = this.walletInfo['wallet_publisher_fee_percent_default'];
            else
                publisherFee = 0.10;
        }

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

        // This is available on the inventory page.
        var tags = typeof item.tags !== 'undefined' ? item.tags : (typeof item.description !== 'undefined' && typeof item.description.tags !== 'undefined' ? item.description.tags : null);
        if (tags != null) {
            var isTaggedAsTradingCard = false;
            tags.forEach(function (arrayItem) {
                if (arrayItem.category == 'item_class')
                    if (arrayItem.internal_name == 'item_class_2') // trading card.
                        isTaggedAsTradingCard = true;
            });
            if (isTaggedAsTradingCard)
                return true;
        }

        // This is available on the market page.
        if (typeof item.owner_actions !== 'undefined') {
            for (var i = 0; i < item.owner_actions.length; i++) {
                if (typeof item.owner_actions[i].link === "undefined")
                    continue;

                // Cards include a link to the gamecard page.
                // For example: // For example: "http://steamcommunity.com/my/gamecards/503820/".
                if (item.owner_actions[i].link.toString().toLowerCase().includes('gamecards'))
                    return true;
            }
        }

        // A fallback for the market page (only works with language on English).
        if (typeof item.type !== 'undefined' && item.type.toLowerCase().includes('trading card'))
            return true;

        return false;
    }

    function getIsFoilTradingCard(item) {
        if (!getIsTradingCard(item))
            return false;

        // This is available on the inventory page.
        var tags = typeof item.tags !== 'undefined' ? item.tags : (typeof item.description !== 'undefined' && typeof item.description.tags !== 'undefined' ? item.description.tags : null);
        if (tags != null) {
            var isTaggedAsFoilTradingCard = false;
            tags.forEach(function (arrayItem) {
                if (arrayItem.category == 'cardborder')
                    if (arrayItem.internal_name == 'cardborder_1') // foil border.
                        isTaggedAsFoilTradingCard = true;
            });
            if (isTaggedAsFoilTradingCard)
                return true;
        }

        // This is available on the market page.
        if (typeof item.owner_actions !== 'undefined') {
            for (var i = 0; i < item.owner_actions.length; i++) {
                if (typeof item.owner_actions[i].link === "undefined")
                    continue;

                // Cards include a link to the gamecard page.
                // The border parameter specifies the foil cards.
                // For example: "http://steamcommunity.com/my/gamecards/503820/?border=1".
                if (item.owner_actions[i].link.toString().toLowerCase().includes('gamecards') && item.owner_actions[i].link.toString().toLowerCase().includes('border'))
                    return true;
            }
        }

        // A fallback for the market page (only works with language on English).
        if (typeof item.type !== 'undefined' && item.type.toLowerCase().includes('foil trading card'))
            return true;

        return false;
    }

    function CalculateFeeAmount(amount, publisherFee, walletInfo) {
        if (typeof walletInfo === 'undefined' || !walletInfo['wallet_fee']) {
            return { fees: 0 };
        }

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

    // Clamps cur between min and max (inclusive).
    function clamp(cur, min, max) {
        if (cur < min)
            cur = min;

        if (cur > max)
            cur = max;

        return cur;
    }

    // Strangely named function, it actually works out the fees and buyer price for a seller price
    function CalculateAmountToSendForDesiredReceivedAmount(receivedAmount, publisherFee, walletInfo) {
        if (typeof walletInfo === 'undefined' || !walletInfo['wallet_fee']) {
            return { amount: receivedAmount };
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
    var userScrolled = false;
    var logger = document.createElement('div');
    logger.setAttribute('id', 'logger');

    function updateScroll() {
        if (!userScrolled) {
            var element = document.getElementById("logger");
            element.scrollTop = element.scrollHeight;
        }
    }

    function logDOM(text) {
        logger.innerHTML += text + '<br/>';

        updateScroll();
    }

    function clearLogDOM() {
        logger.innerHTML = '';

        updateScroll();
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
                    logDOM(padLeft + ' - ' + itemName + ' added to market for ' + (market.getPriceIncludingFees(task.sellPrice) / 100.0).toFixed(2) + currencySymbol + '.');

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

        sellQueue.drain = function () {
            if (itemQueue.length() == 0) {
                $('#inventory_items_spinner').remove();
            }
        }

        function sellAllItems(appId) {
            g_ActiveInventory.LoadCompleteInventory().then(function () {
                var items = getInventoryItems();
                var filteredItems = [];

                items.forEach(function (item) {
                    if (!item.marketable) {
                        return;
                    }

                    filteredItems.push(item);
                });

                sellItems(filteredItems);
            }, function () {
                logDOM('Could not retrieve the inventory...');
            });
        }

        function sellAllCards() {
            g_ActiveInventory.LoadCompleteInventory().then(function () {
                var items = getInventoryItems();
                var filteredItems = [];

                items.forEach(function (item) {
                    if (!getIsTradingCard(item) || !item.marketable) {
                        return;
                    }

                    filteredItems.push(item);
                });

                sellItems(filteredItems);
            }, function () {
                logDOM('Could not retrieve the inventory...');
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

            g_ActiveInventory.LoadCompleteInventory().then(function () {
                var items = getInventoryItems();
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
            }, function () {
                logDOM('Could not retrieve the inventory...');
            });
        }

        function sellItems(items) {
            if (items.length == 0) {
                logDOM('These items cannot be added to the market...');

                return;
            }

            $('#inventory_items_spinner').remove();
            $('#price_options').append('<div id="inventory_items_spinner">' +
                spinnerBlock +
                '<div style="text-align:center">Selling items</div>' +
                '</div>');

            items.forEach(function (item, index, array) {
                var itemId = item.assetid || item.id;
                if (queuedItems.indexOf(itemId) == -1) {
                    item.ignoreErrors = false;

                    queuedItems.push(itemId);
                    itemQueue.push(item);
                }
            });
        }

        var itemQueue = async.queue(function (item, next) {
            var numberOfFailedItems = 0;

            itemQueueWorker(item, item.ignoreErrors, function (success, cached) {
                if (success) {
                    if (numberOfFailedItems > 0)
                        numberOfFailedItems--;

                    setTimeout(function () {
                        next();
                    }, cached ? 0 : getRandomInt(250, 500));
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

        function itemQueueWorker(item, ignoreErrors, callback) {
            var priceInfo = getPriceInformationFromItem(item);

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

                    var sellPrice = calculateSellPriceBeforeFees(history, histogram, true, priceInfo.minPriceBeforeFees, priceInfo.maxPriceBeforeFees);

                    logConsole('Sell price: ' + sellPrice / 100.0 + ' (' + market.getPriceIncludingFees(sellPrice) / 100.0 + ')');

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
        var isOwnInventory = g_ActiveUser.strSteamId == g_steamID;
        var previousSelection = -1; // To store the index of the previous selection.
        updateInventoryUI(isOwnInventory);

        $('.games_list_tabs').on('click', '*', function () {
            updateInventoryUI(isOwnInventory);
        });

        // Ignore selection on other user's inventories.
        if (!isOwnInventory)
            return;

        var filter = ".itemHolder:not([style*=none])"; // Steam adds 'display:none' to items while searching. These should not be selected while using shift/ctrl.
        $('#inventories').selectable({
            filter: filter,
            selecting: function (e, ui) {
                var selectedIndex = $(ui.selecting.tagName, e.target).index(ui.selecting); // Get selected item index.
                if (e.shiftKey && previousSelection > -1) { // If shift key was pressed and there is previous - select them all.
                    $(ui.selecting.tagName, e.target).slice(Math.min(previousSelection, selectedIndex), 1 + Math.max(previousSelection, selectedIndex)).each(function () {
                        if ($(this).is(filter)) {
                            $(this).addClass('ui-selected');
                        }
                    });
                    previousSelection = -1; // Reset previous.
                } else {
                    previousSelection = selectedIndex; // Save previous.					
                }
            },
            selected: function (e, ui) {
                updateInventorySelection(ui.selected);
            }
        });
    }

    function updateInventorySelection(item) {
        // Wait until g_ActiveInventory.selectedItem is identical to the selected UI item.
        // This also makes sure that the new - and correct - item_info (iteminfo0 or iteminfo1) is visible.
        var selectedItemIdUI = $('div', item).attr('id');
        var selectedItemIdInventory = g_ActiveInventory.selectedItem.appid + '_' + g_ActiveInventory.selectedItem.contextid + '_' + g_ActiveInventory.selectedItem.assetid;
        if (selectedItemIdUI !== selectedItemIdInventory) {
            setTimeout(function () {
                updateInventorySelection(item);
            }, 250);

            return;
        }

        var item_info = $('.inventory_iteminfo:visible').first();
        if (item_info.html().indexOf('checkout/sendgift/') > -1) // Gifts have no market information.
            return;

        // Use a 'hard' item id instead of relying on the selected item_info (sometimes Steam temporarily changes the correct item (?)).
        var item_info_id = item_info.attr('id');

        // Move scrap to bottom, this is of little interest.
        var scrap = $('#' + item_info_id + '_scrap_content');
        scrap.next().insertBefore(scrap);

        // Starting at prices are already retrieved in the table.
        $('#' + item_info_id + '_item_market_actions > div:nth-child(1) > div:nth-child(2)').remove(); // Starting at: x,xx.

        var market_hash_name = getMarketHashName(g_ActiveInventory.selectedItem);
        if (market_hash_name == null)
            return;

        var appid = g_ActiveInventory.selectedItem.appid;
        var item = { appid: parseInt(appid), description: { market_hash_name: market_hash_name } };

        market.getItemOrdersHistogram(item, false,
            function (err, listings) {
                if (err) {
                    logConsole('Failed to get orders histogram for ' + (g_ActiveInventory.selectedItem.name || g_ActiveInventory.selectedItem.description.name));
                    return;
                }

                var groupMain = $('<div id="listings_group">' +
                    '<div><div id="listings_sell">Sell</div>' + listings.sell_order_table + '</div>' +
                    '<div><div id="listings_buy">Buy</div>' + listings.buy_order_table + '</div>' +
                    '</div>');

                $('#' + item_info_id + '_item_market_actions > div').after(groupMain);

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

                var priceInformation = getPriceInformationFromItem(g_ActiveInventory.selectedItem);
                prices.push(priceInformation.minPrice);
                prices.push(priceInformation.maxPrice);

                prices = prices.filter((v, i) => prices.indexOf(v) === i).sort((a, b) => a - b);

                var buttons = '<br/>';
                prices.forEach(function (e) {
                    buttons += '<a class="item_market_action_button item_market_action_button_green quick_sell" id="quick_sell' + e + '">' +
                        '<span class="item_market_action_button_edge item_market_action_button_left"></span>' +
                        '<span class="item_market_action_button_contents">' + (e / 100.0) + currencySymbol + '</span>' +
                        '<span class="item_market_action_button_edge item_market_action_button_right"></span>' +
                        '<span class="item_market_action_button_preload"></span>' +
                        '</a>'
                });

                $('#' + item_info_id + '_item_market_actions', item_info).append(buttons);

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
    }

    // Update the inventory UI.
    function updateInventoryUI(isOwnInventory) {
        // Remove previous containers (e.g., when a user changes inventory).
        $('#inventory_sell_buttons').remove();
        $('#price_options').remove();
        $('#inventory_reload_button').remove();

        $('#see_settings').remove();
        $('#global_action_menu').prepend('<span id="see_settings"><a href="javascript:void(0)">⬖ Steam Economy Enhancer</a></span>');
        $('#see_settings').on('click', '*', () => openSettings());

        var appId = g_ActiveInventory.m_appid;
        var showCardOptions = appId == 753;

        var sellButtons = $('<div id="inventory_sell_buttons" style="margin-bottom:12px;">' +
            '<a class="btn_green_white_innerfade btn_medium_wide sell_all"><span>Sell All Items</span></a>&nbsp;&nbsp;&nbsp;' +
            '<a class="btn_green_white_innerfade btn_medium_wide sell_selected"><span>Sell Selected Items</span></a>&nbsp;&nbsp;&nbsp;' +
            (showCardOptions ? '<a class="btn_darkblue_white_innerfade btn_medium_wide sell_all_cards"><span>Sell All Cards</span></a>&nbsp;&nbsp;&nbsp;' : '') +
            '</div>');

        var reloadButton = $('<a id="inventory_reload_button" class="btn_darkblue_white_innerfade btn_medium_wide reload_inventory" style="margin-right:12px"><span>Reload Inventory</span></a>');

        $('#inventory_logos')[0].style.height = 'auto';

        $('#inventory_applogo').hide(); // Hide the Steam/game logo, we don't need to see it twice.
        $('#inventory_applogo').after(logger);

        $("#logger").on('scroll', function () {
            var hasUserScrolledToBottom = $("#logger").prop('scrollHeight') - $("#logger").prop('clientHeight') <= $("#logger").prop('scrollTop') + 1;
            userScrolled = !hasUserScrolledToBottom;
        });

        // Only add buttons on the user's inventory.
        if (isOwnInventory) {
            $('#inventory_applogo').after(sellButtons);

            // Add bindings to sell buttons.
            $('.sell_all').on('click', '*', function () {
                sellAllItems(appId);
            });
            $('.sell_selected').on('click', '*', sellSelectedItems);
            $('.sell_all_cards').on('click', '*', sellAllCards);
        }

        $('.inventory_rightnav').prepend(reloadButton);
        $('.reload_inventory').on('click', '*', function () {
            window.location.reload();
        });

        g_ActiveInventory.LoadCompleteInventory().then(function () {
            var inventoryItems = null;
            var updateInventoryPrices = _.debounce(function () {
                setInventoryPrices(getInventoryItems());
            }, 500);

            // Load after the inventory is loaded.
            updateInventoryPrices();

            $('#inventory_pagecontrols').observe('childlist', '*', function (record) {
                updateInventoryPrices();
            });
        }, function () {
            logDOM('Could not retrieve the inventory...');
        });
    }

    // Gets the inventory items from the active inventory.
    function getInventoryItems() {
        var arr = [];

        for (var key in g_ActiveInventory.m_rgAssets) {
            var value = g_ActiveInventory.m_rgAssets[key];
            if (typeof value === 'object') {
                // Merges the description in the normal object, this is done to keep the layout consistent with the market page, which is also flattened.
                Object.assign(value, value.description);
                // Includes the id of the inventory item.
                value['id'] = key;
                arr.push(value);
            }
        }

        return arr;
    }

    // Sets the prices for the items.
    function setInventoryPrices(items) {

        var inventoryPriceQueue = async.queue(function (item, next) {
            var numberOfFailedItems = 0;

            inventoryPriceQueueWorker(item, false, function (success, cached) {
                if (success) {
                    if (numberOfFailedItems > 0)
                        numberOfFailedItems--;

                    setTimeout(function () {
                        next();
                    }, cached ? 0 : getRandomInt(500, 1000));
                } else {
                    if (!item.ignoreErrors) {
                        item.ignoreErrors = true;
                        inventoryPriceQueue.push(item);
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

        function inventoryPriceQueueWorker(item, ignoreErrors, callback) {
            var priceInfo = getPriceInformationFromItem(item);

            var failed = 0;
            var itemName = item.name || item.description.name;


            // Only get the market orders here, the history is not important to visualize the current prices.
            market.getItemOrdersHistogram(item, true, function (err, histogram, cachedListings) {
                if (err) {
                    logConsole('Failed to get orders histogram for ' + itemName);

                    if (err == ERROR_FAILED)
                        failed += 1;
                }

                if (failed > 0 && !ignoreErrors) {
                    return callback(false, cachedListings);
                }

                var sellPrice = calculateSellPriceBeforeFees(null, histogram, false, 0, 65535);
                var itemPrice = sellPrice == 65535 ? '∞' : (market.getPriceIncludingFees(sellPrice) / 100.0).toFixed(2) + currencySymbol;

                var elementName = (currentPage == PAGE_TRADEOFFER ? '#item' : '#') + item.appid + '_' + item.contextid + '_' + item.id;
                var element = $(elementName);

                $('.inventory_item_price', element).remove();
                element.append('<span class="inventory_item_price">' + itemPrice + '</span>');

                return callback(true, cachedListings);
            });
        }

        items.forEach(function (item) {
            if (!item.marketable) {
                return;
            }

            inventoryPriceQueue.push(item);
        });
    }


    //#endregion

    //#region Market
    if (currentPage == PAGE_MARKET || currentPage == PAGE_MARKET_LISTING) {
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
            var asset = g_rgAssets[listing.appid][listing.contextid][listing.assetid];

            // An asset:
            //{
            // "currency" : 0,
            // "appid" : 753,
            // "contextid" : "6",
            // "id" : "4363079664",
            // "classid" : "2228526061",
            // "instanceid" : "0",
            // "amount" : "1",
            // "status" : 2,
            // "original_amount" : "1",
            // "background_color" : "",
            // "icon_url" : "xx",
            // "icon_url_large" : "xxx",
            // "descriptions" : [{
            //   "value" : "Their dense, shaggy fur conceals the presence of swams of moogamites, purple scaly skin, and more nipples than one would expect."
            //  }
            // ],
            // "tradable" : 1,
            // "owner_actions" : [{
            //   "link" : "http://steamcommunity.com/my/gamecards/443880/",
            //   "name" : "View badge progress"
            //  }, {
            //   "link" : "javascript:GetGooValue( '%contextid%', '%assetid%', 443880, 7, 0 )",
            //   "name" : "Turn into Gems..."
            //  }
            // ],
            // "name" : "Wook",
            // "type" : "Loot Rascals Trading Card",
            // "market_name" : "Wook",
            // "market_hash_name" : "443880-Wook",
            // "market_fee_app" : 443880,
            // "commodity" : 1,
            // "market_tradable_restriction" : 7,
            // "market_marketable_restriction" : 7,
            // "marketable" : 1,
            // "app_icon" : "xxxx",
            // "owner" : 0
            //}

            var market_hash_name = getMarketHashName(asset);
            var appid = listing.appid;

            var listingUI = $(getListingFromLists(listing.listingid).elm);

            var game_name = asset.type;
            var price = parseInt(replaceNonNumbers($('.market_listing_price > span:nth-child(1) > span:nth-child(1)', listingUI).text().trim().replace('--', '00')));

            var priceInfo = getPriceInformationFromItem(asset);
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

                    // Shows the highest buy order price on the market listings.
                    // The 'histogram.highest_buy_order' is not reliable as Steam is caching this value, but it gives some idea for older titles/listings.
                    $('.market_table_value > span:nth-child(1) > span:nth-child(1) > span:nth-child(1)', listingUI).append(' ➤ <span title="This is likely the highest buy order price.">' + (histogram.highest_buy_order == null ? '-' : ((histogram.highest_buy_order / 100) + currencySymbol)) + '</span>');
                    
                    logConsole('============================')
                    logConsole(JSON.stringify(listing));
                    logConsole(game_name + ': ' + asset.name);
                    logConsole('Current price: ' + price / 100.0);

                    // Calculate two prices here, one without the offset and one with the offset.
                    // The price without the offset is required to not relist the item constantly when you have the lowest price (i.e., with a negative offset).
                    // The price with the offset should be used for relisting so it will still apply the user-set offset.

                    var sellPriceWithoutOffset = calculateSellPriceBeforeFees(history, histogram, false, priceInfo.minPriceBeforeFees, priceInfo.maxPriceBeforeFees);
                    var sellPriceWithOffset = calculateSellPriceBeforeFees(history, histogram, true, priceInfo.minPriceBeforeFees, priceInfo.maxPriceBeforeFees);

                    var sellPriceWithoutOffsetWithFees = market.getPriceIncludingFees(sellPriceWithoutOffset);

                    logConsole('Calculated price: ' + sellPriceWithoutOffsetWithFees / 100.0 + ' (' + sellPriceWithoutOffset / 100.0 + ')');

                    listingUI.addClass('price_' + sellPriceWithOffset);

                    $('.market_listing_my_price', listingUI).last().prop('title', 'The best price is ' + (sellPriceWithoutOffsetWithFees / 100.0) + currencySymbol +'.');

                    if (sellPriceWithoutOffsetWithFees < price) {
                        logConsole('Sell price is too high.');

                        $('.market_listing_my_price', listingUI).last().css('background', COLOR_PRICE_EXPENSIVE);
                        listingUI.addClass('overpriced');

                        if (getSettingWithDefault(SETTING_RELIST_AUTOMATICALLY) == 1) {
                            queueOverpricedItemListing(listing.listingid);
                        }
                    }
                    else if (sellPriceWithoutOffsetWithFees > price) {
                        logConsole('Sell price is too low.');

                        $('.market_listing_my_price', listingUI).last().css('background', COLOR_PRICE_CHEAP);
                        listingUI.addClass('underpriced');
                    }
                    else {
                        logConsole('Sell price is fair.');

                        $('.market_listing_my_price', listingUI).last().css('background', COLOR_PRICE_FAIR);
                        listingUI.addClass('fair');
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
            var listingUI = getListingFromLists(item.listing).elm;

            market.removeListing(item.listing, function (errorRemove, data) {
                if (!errorRemove) {
                    $('.actual_content', listingUI).css('background', COLOR_PENDING);

                    setTimeout(function () {
                        market.sellItem(item, item.sellPrice, function (errorSell) {
                            if (!errorSell) {
                                $('.actual_content', listingUI).css('background', COLOR_SUCCESS);

                                setTimeout(function () { removeListingFromLists(item.listing) }, 3000);

                                return callback(true);
                            } else {
                                $('.actual_content', listingUI).css('background', COLOR_ERROR);

                                return callback(false);
                            }
                        });
                    }, getRandomInt(500, 1000)); // Wait a little to make sure the item is returned to inventory.
                } else {
                    $('.actual_content', listingUI).css('background', COLOR_ERROR);

                    return callback(false);
                }
            });
        }

        // Queue an overpriced item listing to be relisted.
        function queueOverpricedItemListing(listingid) {
            var assetInfo = getAssetInfoFromListingId(listingid);
            var listingUI = $(getListingFromLists(listingid).elm);
            var price = -1;

            var items = $(listingUI).attr('class').split(' ');
            for (var i in items) {
                if (items[i].toString().includes('price_'))
                    price = parseInt(items[i].toString().replace('price_', ''));
            }

            if (price > 0) {
                marketOverpricedQueue.push({ listing: listingid, assetid: assetInfo.assetid, contextid: assetInfo.contextid, appid: assetInfo.appid, sellPrice: price });
            }
        }

        var marketRemoveQueue = async.queue(function (listingid, next) {
            marketRemoveQueueWorker(listingid, false, function (success) {
                if (success) {
                    setTimeout(function () {
                        next();
                    }, getRandomInt(50, 100));
                } else {
                    setTimeout(function () {
                        marketRemoveQueueWorker(listingid, true, function (success) {
                            next(); // Go to the next queue item, regardless of success.
                        });
                    }, getRandomInt(30000, 45000));
                }
            });
        }, 10);

        function marketRemoveQueueWorker(listingid, ignoreErrors, callback) {
            var listingUI = getListingFromLists(listingid).elm;

            market.removeListing(listingid, function (errorRemove, data) {
                if (!errorRemove) {
                    $('.actual_content', listingUI).css('background', COLOR_SUCCESS);

                    setTimeout(function () {
                        removeListingFromLists(listingid);

                        var numberOfListings = marketLists[0].size;
                        if (numberOfListings > 0) {
                            $('#my_market_selllistings_number').text((numberOfListings).toString());

                            // This seems identical to the number of sell listings.
                            $('#my_market_activelistings_number').text((numberOfListings).toString());
                        }
                    }, 3000);

                    return callback(true);
                } else {
                    $('.actual_content', listingUI).css('background', COLOR_ERROR);

                    return callback(false);
                }
            });
        }

        var marketListingsItemsQueue = async.queue(function (listing, next) {
            $.get(window.location.protocol + '//steamcommunity.com/market/mylistings?count=100&start=' + listing, function (data) {
                if (!data || !data.success) {
                    next();
                    return;
                }

                var myMarketListings = $('#tabContentsMyActiveMarketListingsRows');

                var nodes = $.parseHTML(data.results_html);
                var rows = $('.market_listing_row', nodes);
                myMarketListings.append(rows);

                // g_rgAssets
                MergeWithAssetArray(data.assets); // This is a method from Steam.

                next();
            }, 'json')
                .fail(function (data) {
                    next();
                    return;
                });
        }, 1);

        marketListingsItemsQueue.drain = function () {
            var myMarketListings = $('#tabContentsMyActiveMarketListingsRows');

            // Sometimes the Steam API is returning duplicate entries (especially during item listing), filter these.
            var seen = {};
            $('.market_listing_row', myMarketListings).each(function () {
                var item_id = $(this).attr('id');
                if (seen[item_id])
                    $(this).remove();
                else
                    seen[item_id] = true;

                // Remove listings awaiting confirmations, they are already listed separately.
                if ($('.item_market_action_button', this).attr('href').toLowerCase().includes('CancelMarketListingConfirmation'.toLowerCase()))
                    $(this).remove();

                // Remove buy order listings, they are already listed separately.
                if ($('.item_market_action_button', this).attr('href').toLowerCase().includes('CancelMarketBuyOrder'.toLowerCase()))
                    $(this).remove();
            });

            // Now add the market checkboxes.
            addMarketCheckboxes();

            $('#market_listings_spinner').remove();

            $('.market_select_item').change(function (e) {
                updateMarketSelectAllButton();
            });

            $('.market_home_listing_table').each(function (e) {
                // Not for popular / new / recently sold items (bottom of page).
                if ($('.my_market_header', $(this)).length == 0)
                    return;

                // Buy orders and listings confirmations are not grouped like the sell listings, add this so pagination works there as well.
                if (!$(this).attr('id')) {
                    $(this).attr('id', 'market-listing-' + e);

                    $(this).append('<div class="market_listing_see" id="market-listing-container-' + e + '"></div>')
                    $('.market_listing_row', $(this)).appendTo($('#market-listing-container-' + e));
                } else {
                    $(this).children().last().addClass("market_listing_see");
                }

                addMarketPagination($('.market_listing_see', this).last());
                sortMarketListings($(this), false, false, true);
            });

            // Add the listings to the queue to be checked for the price.
            for (var i = 0; i < marketLists.length; i++) {
                for (var j = 0; j < marketLists[i].items.length; j++) {
                    var listingid = replaceNonNumbers(marketLists[i].items[j].values().market_listing_item_name);
                    var assetInfo = getAssetInfoFromListingId(listingid);

                    marketListingsQueue.push({ listingid, appid: assetInfo.appid, contextid: assetInfo.contextid, assetid: assetInfo.assetid });
                }
            }

            // Show the listings again, rendering is done.
            myMarketListings.show();

            injectJs(function () {
                g_bMarketWindowHidden = true; // limit the number of requests made to steam by stopping constant polling of popular listings.
            });
        };

        // Gets the asset info (appid/contextid/assetid) based on a listingid.
        function getAssetInfoFromListingId(listingid) {
            var listing = getListingFromLists(listingid);
            if (typeof listing === "undefined")
                return {};

            var actionButton = $('.item_market_action_button', listing.elm).attr('href');
            if (typeof actionButton === "undefined")
                return {};

            var itemIds = actionButton.split(',');
            var appid = replaceNonNumbers(itemIds[2]);
            var contextid = replaceNonNumbers(itemIds[3]);
            var assetid = replaceNonNumbers(itemIds[4]);
            return { appid, contextid, assetid };
        }

        // Adds pagination and search options to the market item listings.
        function addMarketPagination(market_listing_see) {
            market_listing_see.addClass('list');

            market_listing_see.before('<ul class="paginationTop pagination"></ul>');
            market_listing_see.after('<ul class="paginationBottom pagination"></ul>');

            $('.market_listing_table_header', market_listing_see.parent()).append('<input class="search" id="market_name_search" placeholder="Search..." />');

            var options = {
                valueNames: ['market_listing_game_name', 'market_listing_item_name_link', 'market_listing_price', 'market_listing_listed_date', { name: 'market_listing_item_name', attr: 'id' }],
                pagination: [{
                    name: "paginationTop",
                    paginationClass: "paginationTop",
                    innerWindow: 100,
                    outerWindow: 100,
                    left: 100,
                    right: 100
                }, {
                    name: "paginationBottom",
                    paginationClass: "paginationBottom",
                    innerWindow: 100,
                    outerWindow: 100,
                    left: 100,
                    right: 100
                }],
                page: parseInt(getSettingWithDefault(SETTING_MARKET_PAGE_COUNT))
            };

            var list = new List(market_listing_see.parent().attr('id'), options);
            marketLists.push(list);
        }

        // Adds checkboxes to market listings.
        function addMarketCheckboxes() {
            $('.market_listing_row').each(function () {
                // Don't add it again, one time is enough.
                if ($('.market_listing_select', this).length == 0) {
                    $('.market_listing_cancel_button', $(this)).append('<div class="market_listing_select">' +
                        '<input type="checkbox" class="market_select_item"/>' +
                        '</div>');
                }
            });
        }

        // Process the market listings.
        function processMarketListings() {
            addMarketCheckboxes();

            if (currentPage == PAGE_MARKET) {
                // Load the market listings.
                var currentCount = 0;
                var totalCount = g_oMyListings.m_cTotalCount;
                if (isNaN(totalCount) || totalCount == 0)
                    return;

                $('#tabContentsMyActiveMarketListingsRows').html(''); // Clear the default listings.
                $('#tabContentsMyActiveMarketListingsRows').hide(); // Hide all listings until everything has been loaded.

                // Hide Steam's paging controls.
                $('#tabContentsMyActiveMarketListings_ctn').hide();
                $('.market_pagesize_options').hide();

                // Show the spinner so the user knows that something is going on.
                $('.my_market_header').eq(0).append('<div id="market_listings_spinner">' +
                    spinnerBlock +
                    '<div style="text-align:center">Loading market listings</div>' +
                    '</div>');

                while (currentCount < totalCount) {
                    marketListingsItemsQueue.push(currentCount);
                    currentCount += 100;
                }
            } else {
                // This is on a market item page.
                $('.market_home_listing_table').each(function (e) {
                    // Not on 'x requests to buy at y,yy or lower'.
                    if ($('#market_buyorder_info_show_details', $(this)).length > 0)
                        return;

                    $(this).children().last().addClass("market_listing_see");

                    addMarketPagination($('.market_listing_see', this).last());
                    sortMarketListings($(this), false, false, true);
                });

                $('#tabContentsMyActiveMarketListingsRows > .market_listing_row').each(function () {
                    var listingid = $(this).attr('id').replace('mylisting_', '');
                    var assetInfo = getAssetInfoFromListingId(listingid);

                    // There's only one item in the g_rgAssets on a market listing page.
                    var existingAsset = null;
                    for (var appid in g_rgAssets) {
                        for (var contextid in g_rgAssets[appid]) {
                            for (var assetid in g_rgAssets[appid][contextid]) {
                                existingAsset = g_rgAssets[appid][contextid][assetid];
                                break;
                            }
                        }
                    }

                    // appid and contextid are identical, only the assetid is different for each asset.
                    g_rgAssets[appid][contextid][assetInfo.assetid] = existingAsset;
                    marketListingsQueue.push({ listingid, appid: assetInfo.appid, contextid: assetInfo.contextid, assetid: assetInfo.assetid });
                })
            }
        }

        // Update the select/deselect all button on the market.
        function updateMarketSelectAllButton() {
            $('.market_listing_buttons').each(function () {
                var selectionGroup = $(this).parent().parent();
                var invert = $('.market_select_item:checked', selectionGroup).length == $('.market_select_item', selectionGroup).length;
                if ($('.market_select_item', selectionGroup).length == 0) // If there are no items to select, keep it at Select all.
                    invert = false;
                $('.select_all > span', selectionGroup).text(invert ? 'Deselect all' : 'Select all');
            });
        }

        // Sort the market listings.
        function sortMarketListings(elem, isPrice, isDate, isName) {
            var list = getListFromContainer(elem);
            if (typeof list === 'undefined') {
                console.log('Invalid parameter, could not find a list matching elem.');
                return;
            }

            // Change sort order (asc/desc).
            var nextSort = isPrice ? 1 : (isDate ? 2 : 3);
            var asc = true;

            // (Re)set the asc/desc arrows.
            const arrow_down = '🡻';
            const arrow_up = '🡹';

            $('.market_listing_table_header > span', elem).each(function () {
                if ($(this).hasClass('market_listing_edit_buttons'))
                    return;

                if ($(this).text().includes(arrow_up))
                    asc = false;

                $(this).text($(this).text().replace(' ' + arrow_down, '').replace(' ' + arrow_up, ''));
            })

            var market_listing_selector;
            if (isPrice) {
                market_listing_selector = $('.market_listing_table_header', elem).children().eq(1);
            } else if (isDate) {
                market_listing_selector = $('.market_listing_table_header', elem).children().eq(2);
            } else if (isName) {
                market_listing_selector = $('.market_listing_table_header', elem).children().eq(3);
            }
            market_listing_selector.text(market_listing_selector.text() + ' ' + (asc ? arrow_up : arrow_down));

            if (typeof list.sort === 'undefined')
                return;

            if (isName) {
                list.sort('',
                    {
                        order: asc ? "asc" : "desc",
                        sortFunction:
                        function (a, b) {
                            if (a.values().market_listing_game_name.toLowerCase()
                                .localeCompare(b.values().market_listing_game_name.toLowerCase()) ==
                                0) {
                                return a.values().market_listing_item_name_link.toLowerCase()
                                    .localeCompare(b.values().market_listing_item_name_link.toLowerCase());
                            }
                            return a.values().market_listing_game_name.toLowerCase()
                                .localeCompare(b.values().market_listing_game_name.toLowerCase());
                        }
                    });
            } else if (isDate) {
                var currentMonth = parseInt(Date.today().toString('M'));

                list.sort('market_listing_listed_date', {
                    order: asc ? "asc" : "desc", sortFunction: function (a, b) {
                        var firstDate = Date.parse((a.values().market_listing_listed_date).trim());
                        var secondDate = Date.parse((b.values().market_listing_listed_date).trim());

                        if (firstDate == null || secondDate == null) {
                            return 0;
                        }

                        if (parseInt(firstDate.toString('M')) > currentMonth)
                            firstDate = firstDate.addYears(-1);
                        if (parseInt(secondDate.toString('M')) > currentMonth)
                            secondDate = secondDate.addYears(-1);

                        return firstDate.compareTo(secondDate);
                    }
                })
            } else if (isPrice) {
                list.sort('market_listing_price', {
                    order: asc ? "asc" : "desc", sortFunction: function (a, b) {
                        var listingPriceA = $(a.values().market_listing_price).text();
                        listingPriceA = listingPriceA.substr(0, listingPriceA.indexOf('('));
                        listingPriceA = listingPriceA.replace('--', '00');

                        var listingPriceB = $(b.values().market_listing_price).text();
                        listingPriceB = listingPriceB.substr(0, listingPriceB.indexOf('('));
                        listingPriceB = listingPriceB.replace('--', '00');

                        var firstPrice = parseInt(replaceNonNumbers(listingPriceA));
                        var secondPrice = parseInt(replaceNonNumbers(listingPriceB));

                        return firstPrice - secondPrice;
                    }
                })
            }
        }

        function getListFromContainer(group) {
            for (var i = 0; i < marketLists.length; i++) {
                if (group.attr('id') == $(marketLists[i].listContainer).attr('id'))
                    return marketLists[i];
            }
        }

        function getListingFromLists(listingid) {
            // Sometimes listing ids are contained in multiple lists (?), use the last one available as this is the one we're most likely interested in.
            for (var i = marketLists.length - 1; i >= 0; i--) {
                var values = marketLists[i].get("market_listing_item_name", 'mylisting_' + listingid + '_name');
                if (typeof values !== 'undefined' && values.length > 0) {
                    return values[0];
                }
            }
        }

        function removeListingFromLists(listingid) {
            for (var i = 0; i < marketLists.length; i++) {
                marketLists[i].remove("market_listing_item_name", 'mylisting_' + listingid + '_name');
            }
        }

        // Initialize the market UI.
        function initializeMarketUI() {
            // Sell orders.
            $('.my_market_header').first().append(
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

            // Listings confirmations and buy orders.
            $('.my_market_header').slice(1).append(
                '<div class="market_listing_buttons">' +
                '<a class="item_market_action_button item_market_action_button_green select_all market_listing_button">' +
                '<span class="item_market_action_button_contents" style="text-transform:none">Select all</span>' +
                '</a>' +
                '<a class="item_market_action_button item_market_action_button_green remove_selected market_listing_button">' +
                '<span class="item_market_action_button_contents" style="text-transform:none">Remove selected</span>' +
                '</a>' +
                '</div>');

            $('.market_listing_table_header').on('click', 'span', function () {
                if ($(this).hasClass('market_listing_edit_buttons') || $(this).hasClass('item_market_action_button_contents'))
                    return;

                var isPrice = $('.market_listing_table_header', $(this).parent().parent()).children().eq(1).text() == $(this).text();
                var isDate = $('.market_listing_table_header', $(this).parent().parent()).children().eq(2).text() == $(this).text();
                var isName = $('.market_listing_table_header', $(this).parent().parent()).children().eq(3).text() == $(this).text();

                sortMarketListings($(this).parent().parent(), isPrice, isDate, isName);
            });

            $('.select_all').on('click', '*', function () {
                var selectionGroup = $(this).parent().parent().parent().parent();
                var marketList = getListFromContainer(selectionGroup);

                var invert = $('.market_select_item:checked', selectionGroup).length == $('.market_select_item', selectionGroup).length;

                for (var i = 0; i < marketList.items.length; i++) {
                    $('.market_select_item', marketList.items[i].elm).prop('checked', !invert);
                }

                updateMarketSelectAllButton();
            });


            $('#market_removelisting_dialog_accept').on('click', '*', function () {
                // This is when a user removed an item through the Remove/Cancel button.
                // Ideally, it should remove this item from the list (instead of just the UI element which Steam does), but I'm not sure how to get the current item yet.
                window.location.reload();
            });

            $('.select_overpriced').on('click', '*', function () {
                var selectionGroup = $(this).parent().parent().parent().parent();
                var marketList = getListFromContainer(selectionGroup);

                for (var i = 0; i < marketList.items.length; i++) {
                    if ($(marketList.items[i].elm).hasClass('overpriced')) {
                        $('.market_select_item', marketList.items[i].elm).prop('checked', true);
                    }
                }

                $('.market_listing_row', selectionGroup).each(function (index) {
                    if ($(this).hasClass('overpriced'))
                        $('.market_select_item', $(this)).prop('checked', true);
                });

                updateMarketSelectAllButton();
            });

            $('.remove_selected').on('click', '*', function () {
                var selectionGroup = $(this).parent().parent().parent().parent();
                var marketList = getListFromContainer(selectionGroup);

                for (var i = 0; i < marketList.items.length; i++) {
                    if ($('.market_select_item', $(marketList.items[i].elm)).prop('checked')) {
                        var listingid = replaceNonNumbers(marketList.items[i].values().market_listing_item_name);
                        marketRemoveQueue.push(listingid);
                    }
                }
            });

            $('.market_relist_auto').change(function () {
                setSetting(SETTING_RELIST_AUTOMATICALLY, $('.market_relist_auto').is(":checked") ? 1 : 0);
            });

            $('.relist_overpriced').on('click', '*', function () {
                var selectionGroup = $(this).parent().parent().parent().parent();
                var marketList = getListFromContainer(selectionGroup);

                for (var i = 0; i < marketList.items.length; i++) {
                    if ($(marketList.items[i].elm).hasClass('overpriced')) {
                        var listingid = replaceNonNumbers(marketList.items[i].values().market_listing_item_name);
                        queueOverpricedItemListing(listingid);
                    }
                }
            });

            $('#see_settings').remove();
            $('#global_action_menu').prepend('<span id="see_settings"><a href="javascript:void(0)">⬖ Steam Economy Enhancer</a></span>');
            $('#see_settings').on('click', '*', () => openSettings());

            processMarketListings();
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

        $('.trade_right > div > div > div > .trade_item_box').observe('childlist subtree', function (record) {
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

        var updateInventoryPrices = _.debounce(function () {
            var tradeOfferItems = [];
            for (var i = 0; i < g_ActiveInventory.rgItemElements.length; i++) {
                tradeOfferItems.push(g_ActiveInventory.rgItemElements[i].rgItem);
            }

            setInventoryPrices(tradeOfferItems);
        }, 500);

        $('#inventory_pagecontrols').observe('childlist', '*', function (record) {
            updateInventoryPrices();
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

                if (!item.tradable)
                    return;

                MoveItemToTrade(it);
            });
        });
    }
    //#endregion

    //#region Settings
    function openSettings() {
        var price_options = $('<div id="price_options">' +
            '<div style="margin-bottom:6px;">' +
            'Calculate prices as the:&nbsp;<select class="price_option_input" style="background-color: black;color: white;border: transparent;" id="' + SETTING_PRICE_ALGORITHM + '">' +
            '<option value="1"' + (getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1 ? 'selected="selected"' : '') + '>maximum of the average (12 hours) and lowest listing</option>' +
            '<option value="2" ' + (getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 2 ? 'selected="selected"' : '') + '>lowest listing</option>' +
            '</select>' +
            '<br/>' +
            '</div>' +
            '<div style="margin-bottom:6px;">' +
            'The value to add to the calculated price (minimum and maximum are respected):&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_PRICE_OFFSET + '" value=' + getSettingWithDefault(SETTING_PRICE_OFFSET) + '>' +
            '<br/>' +
            '</div>' +
            '<div style="margin-top:6px">' +
            'Use the second lowest listing when the lowest listing has a low quantity:&nbsp;<input class="price_option_input" style="background-color: black;color: white;border: transparent;" type="checkbox" id="' + SETTING_PRICE_IGNORE_LOWEST_Q + '" ' + (getSettingWithDefault(SETTING_PRICE_IGNORE_LOWEST_Q) == 1 ? 'checked=""' : '') + '>' +
            '<br/>' +
            '</div>' +
            '<div style="margin-top:24px">' +
            '<div style="margin-bottom:6px;">' +
            'Minimum:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_NORMAL_PRICE + '" value=' + getSettingWithDefault(SETTING_MIN_NORMAL_PRICE) + '>&nbsp;' +
            'and maximum:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_NORMAL_PRICE + '" value=' + getSettingWithDefault(SETTING_MAX_NORMAL_PRICE) + '>&nbsp;price for normal cards' +
            '<br/>' +
            '</div>' +
            '<div style="margin-bottom:6px;">' +
            'Minimum:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_FOIL_PRICE + '" value=' + getSettingWithDefault(SETTING_MIN_FOIL_PRICE) + '>&nbsp;' +
            'and maximum:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_FOIL_PRICE + '" value=' + getSettingWithDefault(SETTING_MAX_FOIL_PRICE) + '>&nbsp;price for foil cards' +
            '<br/>' +
            '</div>' +
            '<div style="margin-bottom:6px;">' +
            'Minimum:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_MISC_PRICE + '" value=' + getSettingWithDefault(SETTING_MIN_MISC_PRICE) + '>&nbsp;' +
            'and maximum:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_MISC_PRICE + '" value=' + getSettingWithDefault(SETTING_MAX_MISC_PRICE) + '>&nbsp;price for other items' +
            '<br/>' +
            '</div>' +
            '<div style="margin-top:24px;">' +
            'Market items per page:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MARKET_PAGE_COUNT + '" value=' + getSettingWithDefault(SETTING_MARKET_PAGE_COUNT) + '>' +
            '<br/>' +
            '</div>' +
            '</div>');

        var dialog = ShowConfirmDialog('Steam Economy Enhancer', price_options).done(function () {
            setSetting(SETTING_MIN_NORMAL_PRICE, $('#' + SETTING_MIN_NORMAL_PRICE, price_options).val());
            setSetting(SETTING_MAX_NORMAL_PRICE, $('#' + SETTING_MAX_NORMAL_PRICE, price_options).val());
            setSetting(SETTING_MIN_FOIL_PRICE, $('#' + SETTING_MIN_FOIL_PRICE, price_options).val());
            setSetting(SETTING_MAX_FOIL_PRICE, $('#' + SETTING_MAX_FOIL_PRICE, price_options).val());
            setSetting(SETTING_MIN_MISC_PRICE, $('#' + SETTING_MIN_MISC_PRICE, price_options).val());
            setSetting(SETTING_MAX_MISC_PRICE, $('#' + SETTING_MAX_MISC_PRICE, price_options).val());
            setSetting(SETTING_PRICE_OFFSET, $('#' + SETTING_PRICE_OFFSET, price_options).val());
            setSetting(SETTING_PRICE_ALGORITHM, $('#' + SETTING_PRICE_ALGORITHM, price_options).val());
            setSetting(SETTING_MARKET_PAGE_COUNT, $('#' + SETTING_MARKET_PAGE_COUNT, price_options).val());
            setSetting(SETTING_PRICE_IGNORE_LOWEST_Q, $('#' + SETTING_PRICE_IGNORE_LOWEST_Q, price_options).prop('checked') ? 1 : 0);

            window.location.reload();
        });
    }
    //#endregion

    //#region UI
    injectCss('.ui-selected { outline: 1px groove #FFFFFF; } ' +
        '#logger { color: #767676; font-size: 12px;margin-top:16px; max-height: 200px; overflow-y: auto; }' +
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
        '.quick_sell { margin-right: 4px; }' +
        '.spinner{margin:10px auto;width:50px;height:40px;text-align:center;font-size:10px;}.spinner > div{background-color:#ccc;height:100%;width:6px;display:inline-block;-webkit-animation:sk-stretchdelay 1.2s infinite ease-in-out;animation:sk-stretchdelay 1.2s infinite ease-in-out}.spinner .rect2{-webkit-animation-delay:-1.1s;animation-delay:-1.1s}.spinner .rect3{-webkit-animation-delay:-1s;animation-delay:-1s}.spinner .rect4{-webkit-animation-delay:-.9s;animation-delay:-.9s}.spinner .rect5{-webkit-animation-delay:-.8s;animation-delay:-.8s}@-webkit-keyframes sk-stretchdelay{0%,40%,100%{-webkit-transform:scaleY(0.4)}20%{-webkit-transform:scaleY(1.0)}}@keyframes sk-stretchdelay{0%,40%,100%{transform:scaleY(0.4);-webkit-transform:scaleY(0.4)}20%{transform:scaleY(1.0);-webkit-transform:scaleY(1.0)}}' +
        '#market_name_search { float: right; background: rgba(0, 0, 0, 0.25); color: white; border: none;height: 25px; padding-left: 6px;}' +
        '.price_option_price { width: 100px }' +
        '#see_settings { background: #26566c; margin-right: 10px; height: 21px; line-height:21px; display:inline-block; padding: 0px 6px; }' +
        '.inventory_item_price { top: 0px;position: absolute;right: 0;background: #3571a5;padding: 2px;color: white; font-size:11px; border: 1px solid #666666;}' +
        '.pagination { padding-left: 0px; }' +
        '.pagination li { display:inline-block; padding: 5px 10px;background: rgba(255, 255, 255, 0.10); margin-right: 6px; border: 1px solid #666666; }' +
        '.pagination li.active { background: rgba(255, 255, 255, 0.25); }');

    $(document).ready(function () {
        // Make sure the user is logged in, there's not much we can do otherwise.
        if (!isLoggedIn) {
            return;
        }

        if (currentPage == PAGE_INVENTORY) {
            initializeInventoryUI();
        }

        if (currentPage == PAGE_MARKET || currentPage == PAGE_MARKET_LISTING) {
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
