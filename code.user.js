// ==UserScript==
// @name         Steam Economy Enhancer
// @icon         data:image/svg+xml,%0A%3Csvg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2" clip-rule="evenodd" viewBox="0 0 267 267"%3E%3Ccircle cx="133.3" cy="133.3" r="133.3" fill="%2326566c"/%3E%3Cpath fill="%23ebebeb" fill-rule="nonzero" d="m50 133 83-83 84 83-84 84-83-84Zm83 62 62-61-62-62v123Z"/%3E%3C/svg%3E
// @namespace    https://github.com/Nuklon
// @author       Nuklon
// @license      MIT
// @version      7.1.7
// @description  Enhances the Steam Inventory and Steam Market.
// @match        https://steamcommunity.com/id/*/inventory*
// @match        https://steamcommunity.com/profiles/*/inventory*
// @match        https://steamcommunity.com/market*
// @match        https://steamcommunity.com/tradeoffer*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.14.1/jquery-ui.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/async/2.6.0/async.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/luxon/3.5.0/luxon.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/list.js/2.3.1/list.js
// @require      https://raw.githubusercontent.com/kapetan/jquery-observe/ca67b735bb3ae8d678d1843384ebbe7c02466c61/jquery-observe.js
// @require      https://raw.githubusercontent.com/rmariuzzo/checkboxes.js/91bec667e9172ceb063df1ecb7505e8ed0bae9ba/src/jquery.checkboxes.js
// @grant        unsafeWindow
// @homepageURL  https://github.com/Nuklon/Steam-Economy-Enhancer
// @homepage     https://github.com/Nuklon/Steam-Economy-Enhancer
// @supportURL   https://github.com/Nuklon/Steam-Economy-Enhancer/issues
// @downloadURL  https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js
// @updateURL    https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js
// ==/UserScript==

/* disable some eslint rules until the code is cleaned up */
/* global unsafeWindow, luxon, jQuery, async, List, localforage */
/* eslint no-undef: off */

// jQuery is already added by Steam, force no conflict mode.
(function($, async) {
    $.noConflict(true);

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

    const marketLists = [];
    let totalNumberOfProcessedQueueItems = 0;
    let totalNumberOfQueuedItems = 0;
    let totalPriceWithFeesOnMarket = 0;
    let totalPriceWithoutFeesOnMarket = 0;
    let totalScrap = 0;

    const spinnerBlock =
        '<div class="spinner"><div class="rect1"></div>&nbsp;<div class="rect2"></div>&nbsp;<div class="rect3"></div>&nbsp;<div class="rect4"></div>&nbsp;<div class="rect5"></div>&nbsp;</div>';
    let numberOfFailedRequests = 0;

    const enableConsoleLog = false;

    const country = typeof unsafeWindow.g_strCountryCode !== 'undefined' ? unsafeWindow.g_strCountryCode : undefined;
    const isLoggedIn = typeof unsafeWindow.g_rgWalletInfo !== 'undefined' && unsafeWindow.g_rgWalletInfo != null || typeof unsafeWindow.g_bLoggedIn !== 'undefined' && unsafeWindow.g_bLoggedIn;

    const currentPage = window.location.href.includes('.com/market')
        ? window.location.href.includes('market/listings')
            ? PAGE_MARKET_LISTING
            : PAGE_MARKET
        : window.location.href.includes('.com/tradeoffer')
            ? PAGE_TRADEOFFER
            : PAGE_INVENTORY;

    const market = new SteamMarket(
        unsafeWindow.g_rgAppContextData,
        getInventoryUrl(),
        isLoggedIn ? unsafeWindow.g_rgWalletInfo : undefined
    );

    const currencyId =
        isLoggedIn &&
            market != null &&
            market.walletInfo != null &&
            market.walletInfo.wallet_currency != null
            ? market.walletInfo.wallet_currency
            : 3;

    const currencyCountry =
        isLoggedIn &&
            market != null &&
            market.walletInfo != null &&
            market.walletInfo.wallet_country != null
            ? market.walletInfo.wallet_country
            : 'US';

    const currencyCode = unsafeWindow.GetCurrencyCode(currencyId);

    function SteamMarket(appContext, inventoryUrl, walletInfo) {
        this.appContext = appContext;
        this.inventoryUrl = inventoryUrl;
        this.walletInfo = walletInfo;
        this.inventoryUrlBase = inventoryUrl.replace('/inventory/json', '');
        if (!this.inventoryUrlBase.endsWith('/')) {
            this.inventoryUrlBase += '/';
        }
    }

    function request(url, options, callback) {
        let delayBetweenRequests = 300;
        let requestStorageHash = 'see:request:last';

        if (url.startsWith('https://steamcommunity.com/market/')) {
            requestStorageHash = `${requestStorageHash}:steamcommunity.com/market`;
            delayBetweenRequests = 1000;
        }

        const lastRequest = JSON.parse(getLocalStorageItem(requestStorageHash) || JSON.stringify({ time: new Date(0), limited: false }));
        const timeSinceLastRequest = Date.now() - new Date(lastRequest.time).getTime();

        delayBetweenRequests = lastRequest.limited ? 2.5 * 60 * 1000 : delayBetweenRequests;

        if (timeSinceLastRequest < delayBetweenRequests) {
            setTimeout(() => request(...arguments), delayBetweenRequests - timeSinceLastRequest);
            return;
        }

        lastRequest.time = new Date();
        lastRequest.limited = false;

        setLocalStorageItem(requestStorageHash, JSON.stringify(lastRequest));

        $.ajax({
            url: url,
            type: options.method,
            data: options.data,
            success: function(data, statusMessage, xhr) {
                if (xhr.status === 429) {
                    lastRequest.limited = true;
                    setLocalStorageItem(requestStorageHash, JSON.stringify(lastRequest));
                }

                if (xhr.status >= 400) {
                    const error = new Error('Http error');
                    error.statusCode = xhr.status;

                    callback(error, data);
                } else {
                    callback(null, data)
                }
            },
            error: (xhr) => {
                if (xhr.status === 429) {
                    lastRequest.limited = true;
                    setLocalStorageItem(requestStorageHash, JSON.stringify(lastRequest));
                }

                const error = new Error('Request failed');
                error.statusCode = xhr.status;

                callback(error);
            },
            dataType: options.responseType
        });
    };

    function getInventoryUrl() {
        if (unsafeWindow.g_strInventoryLoadURL) {
            return unsafeWindow.g_strInventoryLoadURL;
        }

        let profileUrl = `${window.location.origin}/my/`;

        if (unsafeWindow.g_strProfileURL) {
            profileUrl = unsafeWindow.g_strProfileURL;
        } else {
            const avatar = document.querySelector('#global_actions a.user_avatar');

            if (avatar) {
                profileUrl = avatar.href;
            }
        }

        return `${profileUrl.replace(/\/$/, '')}/inventory/json/`;
    }

    //#region Settings
    const SETTING_MIN_NORMAL_PRICE = 'SETTING_MIN_NORMAL_PRICE';
    const SETTING_MAX_NORMAL_PRICE = 'SETTING_MAX_NORMAL_PRICE';
    const SETTING_MIN_FOIL_PRICE = 'SETTING_MIN_FOIL_PRICE';
    const SETTING_MAX_FOIL_PRICE = 'SETTING_MAX_FOIL_PRICE';
    const SETTING_MIN_MISC_PRICE = 'SETTING_MIN_MISC_PRICE';
    const SETTING_MAX_MISC_PRICE = 'SETTING_MAX_MISC_PRICE';
    const SETTING_PRICE_OFFSET = 'SETTING_PRICE_OFFSET';
    const SETTING_PRICE_MIN_CHECK_PRICE = 'SETTING_PRICE_MIN_CHECK_PRICE';
    const SETTING_PRICE_MIN_LIST_PRICE = 'SETTING_PRICE_MIN_LIST_PRICE';
    const SETTING_PRICE_ALGORITHM = 'SETTING_PRICE_ALGORITHM';
    const SETTING_PRICE_IGNORE_LOWEST_Q = 'SETTING_PRICE_IGNORE_LOWEST_Q';
    const SETTING_PRICE_HISTORY_HOURS = 'SETTING_PRICE_HISTORY_HOURS';
    const SETTING_INVENTORY_PRICE_LABELS = 'SETTING_INVENTORY_PRICE_LABELS';
    const SETTING_TRADEOFFER_PRICE_LABELS = 'SETTING_TRADEOFFER_PRICE_LABELS';
    const SETTING_QUICK_SELL_BUTTONS = 'SETTING_QUICK_SELL_BUTTONS';
    const SETTING_LAST_CACHE = 'SETTING_LAST_CACHE';
    const SETTING_RELIST_AUTOMATICALLY = 'SETTING_RELIST_AUTOMATICALLY';
    const SETTING_MARKET_PAGE_COUNT = 'SETTING_MARKET_PAGE_COUNT';

    const settingDefaults = {
        SETTING_MIN_NORMAL_PRICE: 0.05,
        SETTING_MAX_NORMAL_PRICE: 2.50,
        SETTING_MIN_FOIL_PRICE: 0.15,
        SETTING_MAX_FOIL_PRICE: 10,
        SETTING_MIN_MISC_PRICE: 0.05,
        SETTING_MAX_MISC_PRICE: 10,
        SETTING_PRICE_OFFSET: 0.00,
        SETTING_PRICE_MIN_CHECK_PRICE: 0.00,
        SETTING_PRICE_MIN_LIST_PRICE: 0.03,
        SETTING_PRICE_ALGORITHM: 1,
        SETTING_PRICE_IGNORE_LOWEST_Q: 1,
        SETTING_PRICE_HISTORY_HOURS: 12,
        SETTING_INVENTORY_PRICE_LABELS: 1,
        SETTING_TRADEOFFER_PRICE_LABELS: 1,
        SETTING_QUICK_SELL_BUTTONS: 1,
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

    const storagePersistent = localforage.createInstance({
        name: 'see_persistent'
    });

    let storageSession;

    const currentUrl = new URL(window.location.href);
    const noCache = currentUrl.searchParams.get('no-cache') != null;

    // This does not work the same as the 'normal' session storage because opening a new browser session/tab will clear the cache.
    // For this reason, a rolling cache is used.
    if (getSessionStorageItem('SESSION') == null || noCache) {
        let lastCache = getSettingWithDefault(SETTING_LAST_CACHE);
        if (lastCache > 5) {
            lastCache = 0;
        }

        setSetting(SETTING_LAST_CACHE, lastCache + 1);

        storageSession = localforage.createInstance({
            name: `see_session_${lastCache}`
        });

        storageSession.clear(); // Clear any previous data.
        setSessionStorageItem('SESSION', lastCache);
    } else {
        storageSession = localforage.createInstance({
            name: `see_session_${getSessionStorageItem('SESSION')}`
        });
    }

    function getLocalStorageItem(name) {
        try {
            return localStorage.getItem(name);
        } catch (e) {
            logConsole(`Failed to get local storage item ${name}, ${e}.`);
            return null;
        }
    }

    function setLocalStorageItem(name, value) {
        try {
            localStorage.setItem(name, value);
            return true;
        } catch (e) {
            logConsole(`Failed to set local storage item ${name}, ${e}.`);
            return false;
        }
    }

    function getSessionStorageItem(name) {
        try {
            return sessionStorage.getItem(name);
        } catch (e) {
            logConsole(`Failed to get session storage item ${name}, ${e}.`);
            return null;
        }
    }

    function setSessionStorageItem(name, value) {
        try {
            sessionStorage.setItem(name, value);
            return true;
        } catch (e) {
            logConsole(`Failed to set session storage item ${name}, ${e}.`);
            return false;
        }
    }
    //#endregion

    //#region Price helpers
    function formatPrice(valueInCents) {
        return unsafeWindow.v_currencyformat(valueInCents, currencyCode, currencyCountry);
    }

    function getPriceInformationFromItem(item) {
        const isTradingCard = getIsTradingCard(item);
        const isFoilTradingCard = getIsFoilTradingCard(item);
        return getPriceInformation(isTradingCard, isFoilTradingCard);
    }

    function getPriceInformation(isTradingCard, isFoilTradingCard) {
        let maxPrice = 0;
        let minPrice = 0;

        if (!isTradingCard) {
            maxPrice = getSettingWithDefault(SETTING_MAX_MISC_PRICE);
            minPrice = getSettingWithDefault(SETTING_MIN_MISC_PRICE);
        } else {
            maxPrice = isFoilTradingCard
                ? getSettingWithDefault(SETTING_MAX_FOIL_PRICE)
                : getSettingWithDefault(SETTING_MAX_NORMAL_PRICE);
            minPrice = isFoilTradingCard
                ? getSettingWithDefault(SETTING_MIN_FOIL_PRICE)
                : getSettingWithDefault(SETTING_MIN_NORMAL_PRICE);
        }

        maxPrice = maxPrice * 100.0;
        minPrice = minPrice * 100.0;

        const maxPriceBeforeFees = market.getPriceBeforeFees(maxPrice);
        const minPriceBeforeFees = market.getPriceBeforeFees(minPrice);

        return {
            maxPrice,
            minPrice,
            maxPriceBeforeFees,
            minPriceBeforeFees
        };
    }

    // Calculates the average history price, before the fee.
    function calculateAverageHistoryPriceBeforeFees(history) {
        let highest = 0;
        let total = 0;

        if (history != null) {
            // Highest average price in the last xx hours.
            const timeAgo = Date.now() - getSettingWithDefault(SETTING_PRICE_HISTORY_HOURS) * 60 * 60 * 1000;

            history.forEach((historyItem) => {
                const d = new Date(historyItem[0]);
                if (d.getTime() > timeAgo) {
                    highest += historyItem[1] * historyItem[2];
                    total += historyItem[2];
                }
            });
        }

        if (total == 0) {
            return 0;
        }

        highest = Math.floor(highest / total);
        return market.getPriceBeforeFees(highest);
    }

    // Calculates the listing price, before the fee.
    function calculateListingPriceBeforeFees(histogram) {
        if (typeof histogram === 'undefined' ||
            histogram == null ||
            histogram.lowest_sell_order == null ||
            histogram.sell_order_graph == null) {
            return 0;
        }

        let listingPrice = market.getPriceBeforeFees(histogram.lowest_sell_order);

        const shouldIgnoreLowestListingOnLowQuantity = getSettingWithDefault(SETTING_PRICE_IGNORE_LOWEST_Q) == 1;

        if (shouldIgnoreLowestListingOnLowQuantity && histogram.sell_order_graph.length >= 2) {
            const listingPrice2ndLowest = market.getPriceBeforeFees(histogram.sell_order_graph[1][0] * 100);

            if (listingPrice2ndLowest > listingPrice) {
                const numberOfListingsLowest = histogram.sell_order_graph[0][1];
                const numberOfListings2ndLowest = histogram.sell_order_graph[1][1];

                const percentageLower = 100 * (numberOfListingsLowest / numberOfListings2ndLowest);

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

    function calculateBuyOrderPriceBeforeFees(histogram) {
        if (typeof histogram === 'undefined') {
            return 0;
        }

        return market.getPriceBeforeFees(histogram.highest_buy_order);
    }

    // Calculate the sell price based on the history and listings.
    // applyOffset specifies whether the price offset should be applied when the listings are used to determine the price.
    function calculateSellPriceBeforeFees(history, histogram, applyOffset, minPriceBeforeFees, maxPriceBeforeFees) {
        const historyPrice = calculateAverageHistoryPriceBeforeFees(history);
        const listingPrice = calculateListingPriceBeforeFees(histogram);
        const buyPrice = calculateBuyOrderPriceBeforeFees(histogram);

        const shouldUseAverage = getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1;
        const shouldUseBuyOrder = getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 3;

        // If the highest average price is lower than the first listing, return the offset + that listing.
        // Otherwise, use the highest average price instead.
        let calculatedPrice = 0;
        if (shouldUseBuyOrder && buyPrice !== -2) {
            calculatedPrice = buyPrice;
        } else if (historyPrice < listingPrice || !shouldUseAverage) {
            calculatedPrice = listingPrice;
        } else {
            calculatedPrice = historyPrice;
        }

        let changedToMax = false;
        // List for the maximum price if there are no listings yet.
        if (calculatedPrice == 0) {
            calculatedPrice = maxPriceBeforeFees;
            changedToMax = true;
        }


        // Apply the offset to the calculated price, but only if the price wasn't changed to the max (as otherwise it's impossible to list for this price).
        if (!changedToMax && applyOffset) {
            calculatedPrice = calculatedPrice + getSettingWithDefault(SETTING_PRICE_OFFSET) * 100;
        }


        // Keep our minimum and maximum in mind.
        calculatedPrice = clamp(calculatedPrice, minPriceBeforeFees, maxPriceBeforeFees);


        // In case there's a buy order higher than the calculated price.
        if (typeof histogram !== 'undefined' && histogram != null && histogram.highest_buy_order != null) {
            const buyOrderPrice = market.getPriceBeforeFees(histogram.highest_buy_order);
            if (buyOrderPrice > calculatedPrice) {
                calculatedPrice = buyOrderPrice;
            }
        }

        return calculatedPrice;
    }
    //#endregion

    //#region Integer helpers
    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function getNumberOfDigits(x) {
        return (Math.log10((x ^ x >> 31) - (x >> 31)) | 0) + 1;
    }

    function padLeftZero(str, max) {
        str = str.toString();
        return str.length < max ? padLeftZero(`0${str}`, max) : str;
    }

    function replaceNonNumbers(str) {
        return str.replace(/\D/g, '');
    }
    //#endregion

    //#region Steam Market

    // Sell an item with a price in cents.
    // Price is before fees.
    SteamMarket.prototype.sellItem = function(item, price, callback /*err, data*/) {
        const url = `${window.location.origin}/market/sellitem/`;

        const options = {
            method: 'POST',
            data: {
                sessionid: readCookie('sessionid'),
                appid: item.appid,
                contextid: item.contextid,
                assetid: item.assetid || item.id,
                amount: item.amount || 1,
                price: price
            },
            responseType: 'json'
        };

        request(url, options, callback);
    };

    // Removes an item.
    // Item is the unique item id.
    SteamMarket.prototype.removeListing = function(item, isBuyOrder, callback /*err, data*/) {
        const url = isBuyOrder
            ? `${window.location.origin}/market/cancelbuyorder/`
            : `${window.location.origin}/market/removelisting/${item}`;

        const options = {
            method: 'POST',
            data: {
                sessionid: readCookie('sessionid'),
                ...(isBuyOrder ? { buy_orderid: item } : {})
            },
            responseType: 'json'
        };

        request(
            url,
            options,
            (error, data) => {
                if (error) {
                    callback(ERROR_FAILED);
                    return;
                }

                callback(ERROR_SUCCESS, data);
            }
        );
    };

    // Get the price history for an item.
    //
    // PriceHistory is an array of prices in the form [data, price, number sold].
    // Example: [["Fri, 19 Jul 2013 01:00:00 +0000",7.30050206184,362]]
    // Prices are ordered by oldest to most recent.
    // Price is inclusive of fees.
    SteamMarket.prototype.getPriceHistory = function(item, cache, callback) {
        const shouldUseAverage = getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1;

        if (!shouldUseAverage) {
            // The price history is only used by the "average price" calculation
            return callback(ERROR_SUCCESS, null, true);
        }

        try {
            const market_name = getMarketHashName(item);
            if (market_name == null) {
                callback(ERROR_FAILED);
                return;
            }

            const appid = item.appid;

            if (cache) {
                const storage_hash = `pricehistory_${appid}+${market_name}`;

                storageSession.getItem(storage_hash).
                    then((value) => {
                        if (value != null) {
                            callback(ERROR_SUCCESS, value, true);
                        } else {
                            market.getCurrentPriceHistory(appid, market_name, callback);
                        }
                    }).
                    catch(() => {
                        market.getCurrentPriceHistory(appid, market_name, callback);
                    });
            } else {
                market.getCurrentPriceHistory(appid, market_name, callback);
            }
        } catch {
            return callback(ERROR_FAILED);
        }
    };

    SteamMarket.prototype.getGooValue = function(item, callback) {
        try {
            let appid = item.market_fee_app;

            for (const action of item.owner_actions) {
                if (!action.link || !action.link.startsWith('javascript:GetGooValue')) {
                    continue;
                }

                const rgMatches = action.link.match(/GetGooValue\( *'%contextid%', *'%assetid%', *'?(?<appid>[0-9]+)'?/);

                if (!rgMatches) {
                    continue;
                }

                appid = rgMatches.groups.appid;
                break;
            }

            const url = `${this.inventoryUrlBase}ajaxgetgoovalue/`;

            const options = {
                method: 'GET',
                data: {
                    sessionid: readCookie('sessionid'),
                    appid: appid,
                    assetid: item.assetid,
                    contextid: item.contextid
                },
                responseType: 'json'
            };

            request(
                url,
                options,
                (error, data) => {
                    if (error) {
                        callback(ERROR_FAILED, data);
                        return;
                    }

                    callback(ERROR_SUCCESS, data);
                }
            );
        } catch {
            return callback(ERROR_FAILED);
        }
        //http://steamcommunity.com/auction/ajaxgetgoovalueforitemtype/?appid=582980&item_type=18&border_color=0
        // OR
        //http://steamcommunity.com/my/ajaxgetgoovalue/?sessionid=xyz&appid=535690&assetid=4830605461&contextid=6
        //sessionid=xyz
        //appid = 535690
        //assetid = 4830605461
        //contextid = 6
    };


    // Grinds the item into gems.
    SteamMarket.prototype.grindIntoGoo = function(item, callback) {
        try {
            const url = `${this.inventoryUrlBase}ajaxgrindintogoo/`;

            const options = {
                method: 'POST',
                data: {
                    sessionid: readCookie('sessionid'),
                    appid: item.market_fee_app,
                    assetid: item.assetid,
                    contextid: item.contextid,
                    goo_value_expected: item.goo_value_expected
                },
                responseType: 'json'
            };

            request(
                url,
                options,
                (error, data) => {
                    if (error) {
                        callback(ERROR_FAILED, data);
                        return;
                    }

                    callback(ERROR_SUCCESS, data);
                }
            );
        } catch {
            return callback(ERROR_FAILED);
        }

        //sessionid = xyz
        //appid = 535690
        //assetid = 4830605461
        //contextid = 6
        //goo_value_expected = 10
        //http://steamcommunity.com/my/ajaxgrindintogoo/
    };


    // Unpacks the booster pack.
    SteamMarket.prototype.unpackBoosterPack = function(item, callback) {
        try {
            const url = `${this.inventoryUrlBase}ajaxunpackbooster/`;

            const options = {
                method: 'POST',
                data: {
                    sessionid: readCookie('sessionid'),
                    appid: item.market_fee_app,
                    communityitemid: item.assetid
                },
                responseType: 'json'
            };

            request(
                url,
                options,
                (error, data) => {
                    if (error) {
                        callback(ERROR_FAILED, data);
                        return;
                    }

                    callback(ERROR_SUCCESS, data);
                }
            );
        } catch {
            return callback(ERROR_FAILED);
        }

        //sessionid = xyz
        //appid = 535690
        //communityitemid = 4830605461
        //http://steamcommunity.com/my/ajaxunpackbooster/
    };

    // Get the current price history for an item.
    SteamMarket.prototype.getCurrentPriceHistory = function(appid, market_name, callback) {
        const url = `${window.location.origin}/market/pricehistory/`;

        const options = {
            method: 'GET',
            data: {
                appid: appid,
                market_hash_name: market_name
            },
            responseType: 'json'
        };

        request(
            url,
            options,
            (error, data) => {
                if (error) {
                    callback(ERROR_FAILED);
                    return;
                }

                if (data && (!data.success || !data.prices)) {
                    callback(ERROR_DATA);
                    return;
                }

                // Multiply prices so they're in pennies.
                for (let i = 0; i < data.prices.length; i++) {
                    data.prices[i][1] *= 100;
                    data.prices[i][2] = parseInt(data.prices[i][2]);
                }

                // Store the price history in the session storage.
                const storage_hash = `pricehistory_${appid}+${market_name}`;
                storageSession.setItem(storage_hash, data.prices);

                callback(ERROR_SUCCESS, data.prices, false);
            }
        );
    };

    // Get the item name id from a market item.
    //
    // This id never changes so we can store this in the persistent storage.
    SteamMarket.prototype.getMarketItemNameId = function(item, callback) {
        try {
            const market_name = getMarketHashName(item);
            if (market_name == null) {
                callback(ERROR_FAILED);
                return;
            }

            const appid = item.appid;
            const storage_hash = `itemnameid_${appid}+${market_name}`;

            storagePersistent.getItem(storage_hash).
                then((value) => {
                    if (value != null) {
                        callback(ERROR_SUCCESS, value);
                    } else {
                        return market.getCurrentMarketItemNameId(appid, market_name, callback);
                    }
                }).
                catch(() => {
                    return market.getCurrentMarketItemNameId(appid, market_name, callback);
                });
        } catch {
            return callback(ERROR_FAILED);
        }
    };

    // Get the item name id from a market item.
    SteamMarket.prototype.getCurrentMarketItemNameId = function(appid, market_name, callback) {
        const url = `${window.location.origin}/market/listings/${appid}/${escapeURI(market_name)}`;

        const options = { method: 'GET' };

        request(
            url,
            options,
            (error, data) => {
                if (error) {
                    callback(ERROR_FAILED);
                    return;
                }

                const matches = (/Market_LoadOrderSpread\( (\d+) \);/).exec(data || '');
                if (matches == null) {
                    callback(ERROR_DATA);
                    return;
                }

                const item_nameid = matches[1];

                // Store the item name id in the persistent storage.
                const storage_hash = `itemnameid_${appid}+${market_name}`;
                storagePersistent.setItem(storage_hash, item_nameid);

                callback(ERROR_SUCCESS, item_nameid);
            }
        );
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
    SteamMarket.prototype.getItemOrdersHistogram = function(item, cache, callback) {
        try {
            const market_name = getMarketHashName(item);
            if (market_name == null) {
                callback(ERROR_FAILED);
                return;
            }

            const appid = item.appid;

            if (cache) {
                const storage_hash = `itemordershistogram_${appid}+${market_name}`;
                storageSession.getItem(storage_hash).
                    then((value) => {
                        if (value != null) {
                            callback(ERROR_SUCCESS, value, true);
                        } else {
                            market.getCurrentItemOrdersHistogram(item, market_name, callback);
                        }
                    }).
                    catch(() => {
                        market.getCurrentItemOrdersHistogram(item, market_name, callback);
                    });
            } else {
                market.getCurrentItemOrdersHistogram(item, market_name, callback);
            }

        } catch {
            return callback(ERROR_FAILED);
        }
    };

    // Get the sales listings for this item in the market, with more information.
    SteamMarket.prototype.getCurrentItemOrdersHistogram = function(item, market_name, callback) {
        market.getMarketItemNameId(
            item,
            (error, item_nameid) => {
                if (error) {
                    callback(ERROR_FAILED);
                    return;
                }

                const url = `${window.location.origin}/market/itemordershistogram`;

                const options = {
                    method: 'GET',
                    data: {
                        country: country,
                        language: 'english',
                        currency: currencyId,
                        item_nameid: item_nameid,
                        two_factor: 0
                    }
                };

                request(
                    url,
                    options,
                    (error, data) => {
                        if (error) {
                            callback(ERROR_FAILED, null);
                            return;
                        }

                        // Store the histogram in the session storage.
                        const storage_hash = `itemordershistogram_${item.appid}+${market_name}`;
                        storageSession.setItem(storage_hash, data);

                        callback(ERROR_SUCCESS, data, false);
                    }
                )
            }
        );
    };

    // Calculate the price before fees (seller price) from the buyer price
    SteamMarket.prototype.getPriceBeforeFees = function(price, item) {
        let publisherFee = -1;

        if (item != null) {
            if (item.market_fee != null) {
                publisherFee = item.market_fee;
            } else if (item.description != null && item.description.market_fee != null) {
                publisherFee = item.description.market_fee;
            }
        }

        if (publisherFee == -1) {
            if (this.walletInfo != null) {
                publisherFee = this.walletInfo['wallet_publisher_fee_percent_default'];
            } else {
                publisherFee = 0.10;
            }
        }

        price = Math.round(price);
        const feeInfo = CalculateFeeAmount(price, publisherFee, this.walletInfo);
        return price - feeInfo.fees;
    };

    // Calculate the buyer price from the seller price
    SteamMarket.prototype.getPriceIncludingFees = function(price, item) {
        let publisherFee = -1;
        if (item != null) {
            if (item.market_fee != null) {
                publisherFee = item.market_fee;
            } else if (item.description != null && item.description.market_fee != null) {
                publisherFee = item.description.market_fee;
            }
        }
        if (publisherFee == -1) {
            if (this.walletInfo != null) {
                publisherFee = this.walletInfo['wallet_publisher_fee_percent_default'];
            } else {
                publisherFee = 0.10;
            }
        }

        price = Math.round(price);
        const feeInfo = CalculateAmountToSendForDesiredReceivedAmount(price, publisherFee, this.walletInfo);
        return feeInfo.amount;
    };
    //#endregion

    // Cannot use encodeURI / encodeURIComponent, Steam only escapes certain characters.
    function escapeURI(name) {
        let previousName = '';
        while (previousName != name) {
            previousName = name;
            name = name.replace('?', '%3F').
                replace('#', '%23').
                replace('	', '%09');
        }
        return name;
    }

    //#region Steam Market / Inventory helpers
    function getMarketHashName(item) {
        if (item == null) {
            return null;
        }

        if (item.description != null && item.description.market_hash_name != null) {
            return item.description.market_hash_name;
        }

        if (item.description != null && item.description.name != null) {
            return item.description.name;
        }

        if (item.market_hash_name != null) {
            return item.market_hash_name;
        }

        if (item.name != null) {
            return item.name;
        }

        return null;
    }

    function getIsCrate(item) {
        if (item == null) {
            return false;
        }
        // This is available on the inventory page.
        const tags = item.tags != null
            ? item.tags
            : item.description != null && item.description.tags != null
                ? item.description.tags
                : null;
        if (tags != null) {
            let isTaggedAsCrate = false;
            tags.forEach((arrayItem) => {
                if (arrayItem.category == 'Type') {
                    if (arrayItem.internal_name == 'Supply Crate') {
                        isTaggedAsCrate = true;
                    }
                }
            });
            if (isTaggedAsCrate) {
                return true;
            }
        }
    }

    function getIsTradingCard(item) {
        if (item == null) {
            return false;
        }

        // This is available on the inventory page.
        const tags = item.tags != null
            ? item.tags
            : item.description != null && item.description.tags != null
                ? item.description.tags
                : null;
        if (tags != null) {
            let isTaggedAsTradingCard = false;
            tags.forEach((arrayItem) => {
                if (arrayItem.category == 'item_class') {
                    if (arrayItem.internal_name == 'item_class_2') { // trading card.
                        isTaggedAsTradingCard = true;
                    }
                }
            });
            if (isTaggedAsTradingCard) {
                return true;
            }
        }

        // This is available on the market page.
        if (item.owner_actions != null) {
            for (let i = 0; i < item.owner_actions.length; i++) {
                if (item.owner_actions[i].link == null) {
                    continue;
                }

                // Cards include a link to the gamecard page.
                // For example: "http://steamcommunity.com/my/gamecards/503820/".
                if (item.owner_actions[i].link.toString().toLowerCase().includes('gamecards')) {
                    return true;
                }
            }
        }

        // A fallback for the market page (only works with language on English).
        if (item.type != null && item.type.toLowerCase().includes('trading card')) {
            return true;
        }

        return false;
    }

    function getIsFoilTradingCard(item) {
        if (!getIsTradingCard(item)) {
            return false;
        }

        // This is available on the inventory page.
        const tags = item.tags != null
            ? item.tags
            : item.description != null && item.description.tags != null
                ? item.description.tags
                : null;
        if (tags != null) {
            let isTaggedAsFoilTradingCard = false;
            tags.forEach((arrayItem) => {
                if (arrayItem.category == 'cardborder' && arrayItem.internal_name == 'cardborder_1') { // foil border.
                    isTaggedAsFoilTradingCard = true;
                }
            });
            if (isTaggedAsFoilTradingCard) {
                return true;
            }
        }

        // This is available on the market page.
        if (item.owner_actions != null) {
            for (let i = 0; i < item.owner_actions.length; i++) {
                if (item.owner_actions[i].link == null) {
                    continue;
                }

                // Cards include a link to the gamecard page.
                // The border parameter specifies the foil cards.
                // For example: "http://steamcommunity.com/my/gamecards/503820/?border=1".
                if (item.owner_actions[i].link.toString().toLowerCase().includes('gamecards') &&
                    item.owner_actions[i].link.toString().toLowerCase().includes('border')) {
                    return true;
                }
            }
        }

        // A fallback for the market page (only works with language on English).
        if (item.type != null && item.type.toLowerCase().includes('foil trading card')) {
            return true;
        }

        return false;
    }

    function CalculateFeeAmount(amount, publisherFee, walletInfo) {
        if (walletInfo == null || !walletInfo['wallet_fee']) {
            return {
                fees: 0
            };
        }

        publisherFee = publisherFee == null ? 0 : publisherFee;
        // Since CalculateFeeAmount has a Math.floor, we could be off a cent or two. Let's check:
        let iterations = 0; // shouldn't be needed, but included to be sure nothing unforseen causes us to get stuck
        let nEstimatedAmountOfWalletFundsReceivedByOtherParty =
            parseInt((amount - parseInt(walletInfo['wallet_fee_base'])) /
                (parseFloat(walletInfo['wallet_fee_percent']) + parseFloat(publisherFee) + 1));
        let bEverUndershot = false;
        let fees = CalculateAmountToSendForDesiredReceivedAmount(
            nEstimatedAmountOfWalletFundsReceivedByOtherParty,
            publisherFee,
            walletInfo
        );
        while (fees.amount != amount && iterations < 10) {
            if (fees.amount > amount) {
                if (bEverUndershot) {
                    fees = CalculateAmountToSendForDesiredReceivedAmount(
                        nEstimatedAmountOfWalletFundsReceivedByOtherParty - 1,
                        publisherFee,
                        walletInfo
                    );
                    fees.steam_fee += amount - fees.amount;
                    fees.fees += amount - fees.amount;
                    fees.amount = amount;
                    break;
                } else {
                    nEstimatedAmountOfWalletFundsReceivedByOtherParty--;
                }
            } else {
                bEverUndershot = true;
                nEstimatedAmountOfWalletFundsReceivedByOtherParty++;
            }
            fees = CalculateAmountToSendForDesiredReceivedAmount(
                nEstimatedAmountOfWalletFundsReceivedByOtherParty,
                publisherFee,
                walletInfo
            );
            iterations++;
        }
        // fees.amount should equal the passed in amount
        return fees;
    }

    // Clamps cur between min and max (inclusive).
    function clamp(cur, min, max) {
        if (cur < min) {
            cur = min;
        }

        if (cur > max) {
            cur = max;
        }

        return cur;
    }

    // Strangely named function, it actually works out the fees and buyer price for a seller price
    function CalculateAmountToSendForDesiredReceivedAmount(receivedAmount, publisherFee, walletInfo) {
        if (walletInfo == null || !walletInfo['wallet_fee']) {
            return {
                amount: receivedAmount
            };
        }

        publisherFee = publisherFee == null ? 0 : publisherFee;
        const nSteamFee = parseInt(Math.floor(Math.max(
            receivedAmount * parseFloat(walletInfo['wallet_fee_percent']),
            walletInfo['wallet_fee_minimum']
        ) +
            parseInt(walletInfo['wallet_fee_base'])));
        const nPublisherFee = parseInt(Math.floor(publisherFee > 0 ? Math.max(receivedAmount * publisherFee, 1) : 0));
        const nAmountToSend = receivedAmount + nSteamFee + nPublisherFee;
        return {
            steam_fee: nSteamFee,
            publisher_fee: nPublisherFee,
            fees: nSteamFee + nPublisherFee,
            amount: parseInt(nAmountToSend)
        };
    }

    function readCookie(name) {
        const nameEQ = `${name}=`;
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) == ' ') {
                c = c.substring(1, c.length);
            }
            if (c.indexOf(nameEQ) == 0) {
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
        }
        return null;
    }

    function isRetryMessage(message) {
        const messageList = [
            'You cannot sell any items until your previous action completes.',
            'There was a problem listing your item. Refresh the page and try again.',
            'We were unable to contact the game\'s item server. The game\'s item server may be down or Steam may be experiencing temporary connectivity issues. Your listing has not been created. Refresh the page and try again.'
        ];

        return messageList.indexOf(message) !== -1;
    }
    //#endregion

    //#region Logging
    let userScrolled = false;
    const logger = document.createElement('div');
    logger.setAttribute('id', 'logger');

    function updateScroll() {
        if (!userScrolled) {
            const element = document.getElementById('logger');
            element.scrollTop = element.scrollHeight;
        }
    }

    function logDOM(text) {
        logger.innerHTML += `${text}<br/>`;

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

        function onQueueDrain() {
            if (itemQueue.length() == 0 && sellQueue.length() == 0 && scrapQueue.length() == 0 && boosterQueue.length() == 0) {
                $('#inventory_items_spinner').remove();
            }
        }

        function updateTotals() {
            if ($('#loggerTotal').length == 0) {
                $(logger).parent().append('<div id="loggerTotal"></div>');
            }

            const totals = document.getElementById('loggerTotal');
            totals.innerHTML = '';

            if (totalPriceWithFeesOnMarket > 0) {
                totals.innerHTML += `<div><strong>Total listed for ${formatPrice(totalPriceWithFeesOnMarket)}, you will receive ${formatPrice(totalPriceWithoutFeesOnMarket)}.</strong></div>`;
            }
            if (totalScrap > 0) {
                totals.innerHTML += `<div><strong>Total scrap ${totalScrap}.</strong></div>`;
            }
        }

        const sellQueue = async.queue(
            (task, next) => {
                totalNumberOfProcessedQueueItems++;

                const digits = getNumberOfDigits(totalNumberOfQueuedItems);
                const itemId = task.item.assetid || task.item.id;
                const itemName = task.item.name || task.item.description.name;
                const itemNameWithAmount = task.item.amount == 1 ? itemName : `${task.item.amount}x ${itemName}`;
                const padLeft = `${padLeftZero(`${totalNumberOfProcessedQueueItems}`, digits)} / ${totalNumberOfQueuedItems}`;

                if (getSettingWithDefault(SETTING_PRICE_MIN_LIST_PRICE) * 100 >= market.getPriceIncludingFees(task.sellPrice)) {
                    logDOM(`${padLeft} - ${itemNameWithAmount} is not listed due to ignoring price settings.`);
                    $(`#${task.item.appid}_${task.item.contextid}_${itemId}`).css('background', COLOR_PRICE_NOT_CHECKED);
                    next();
                    return;
                }

                market.sellItem(
                    task.item,
                    task.sellPrice,
                    (error, data) => {
                        const success = Boolean(data?.success);
                        const message = data?.message || '';

                        const callback = () => setTimeout(() => next(), getRandomInt(1000, 1500));

                        if (success) {
                            logDOM(`${padLeft} - ${itemNameWithAmount} listed for ${formatPrice(market.getPriceIncludingFees(task.sellPrice) * task.item.amount)}, you will receive ${formatPrice(task.sellPrice * task.item.amount)}.`);
                            $(`#${task.item.appid}_${task.item.contextid}_${itemId}`).css('background', COLOR_SUCCESS);

                            totalPriceWithoutFeesOnMarket += task.sellPrice * task.item.amount;
                            totalPriceWithFeesOnMarket += market.getPriceIncludingFees(task.sellPrice) * task.item.amount;

                            updateTotals();
                            callback()

                            return;
                        }

                        if (message && isRetryMessage(message)) {
                            logDOM(`${padLeft} - ${itemNameWithAmount} retrying listing because: ${message.charAt(0).toLowerCase()}${message.slice(1)}`);

                            totalNumberOfProcessedQueueItems--;
                            sellQueue.unshift(task);
                            sellQueue.pause();

                            setTimeout(() => sellQueue.resume(), getRandomInt(30000, 45000));
                            callback();

                            return;
                        }

                        logDOM(`${padLeft} - ${itemNameWithAmount} not added to market${message ? ` because:  ${message.charAt(0).toLowerCase()}${message.slice(1)}` : '.'}`);
                        $(`#${task.item.appid}_${task.item.contextid}_${itemId}`).css('background', COLOR_ERROR);

                        callback();
                    }
                );
            },
            1
        );

        sellQueue.drain = function() {
            onQueueDrain();
        };

        function sellAllItems() {
            loadAllInventories().then(
                () => {
                    const items = getInventoryItems();
                    const filteredItems = [];

                    items.forEach((item) => {
                        if (!item.marketable) {
                            return;
                        }

                        filteredItems.push(item);
                    });

                    sellItems(filteredItems);
                },
                () => {
                    logDOM('Could not retrieve the inventory...');
                }
            );
        }

        function sellAllDuplicateItems() {
            loadAllInventories().then(
                () => {
                    const items = getInventoryItems();
                    const marketableItems = [];
                    let filteredItems = [];

                    items.forEach((item) => {
                        if (!item.marketable) {
                            return;
                        }

                        marketableItems.push(item);
                    });

                    filteredItems = marketableItems.filter((e, i) => marketableItems.map((m) => m.classid).indexOf(e.classid) !== i);

                    sellItems(filteredItems);
                },
                () => {
                    logDOM('Could not retrieve the inventory...');
                }
            );
        }

        function gemAllDuplicateItems() {
            loadAllInventories().then(
                () => {
                    const items = getInventoryItems();
                    let filteredItems = [];
                    let numberOfQueuedItems = 0;

                    filteredItems = items.filter((e, i) => items.map((m) => m.classid).indexOf(e.classid) !== i);

                    filteredItems.forEach((item) => {
                        if (item.queued != null) {
                            return;
                        }

                        if (item.owner_actions == null) {
                            return;
                        }

                        let canTurnIntoGems = false;
                        for (const owner_action in item.owner_actions) {
                            if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('GetGooValue')) {
                                canTurnIntoGems = true;
                            }
                        }

                        if (!canTurnIntoGems) {
                            return;
                        }

                        item.queued = true;
                        scrapQueue.push(item);
                        numberOfQueuedItems++;
                    });

                    if (numberOfQueuedItems > 0) {
                        totalNumberOfQueuedItems += numberOfQueuedItems;

                        $('#inventory_items_spinner').remove();
                        $('#inventory_sell_buttons').append(`<div id="inventory_items_spinner">${spinnerBlock
                            }<div style="text-align:center">Processing ${numberOfQueuedItems} items</div>` +
                            '</div>');
                    }
                },
                () => {
                    logDOM('Could not retrieve the inventory...');
                }
            );
        }

        function sellAllCards() {
            loadAllInventories().then(
                () => {
                    const items = getInventoryItems();
                    const filteredItems = [];

                    items.forEach((item) => {
                        if (!getIsTradingCard(item) || !item.marketable) {
                            return;
                        }

                        filteredItems.push(item);
                    });

                    sellItems(filteredItems);
                },
                () => {
                    logDOM('Could not retrieve the inventory...');
                }
            );
        }

        function sellAllCrates() {
            loadAllInventories().then(
                () => {
                    const items = getInventoryItems();
                    const filteredItems = [];
                    items.forEach((item) => {
                        if (!getIsCrate(item) || !item.marketable) {
                            return;
                        }
                        filteredItems.push(item);
                    });

                    sellItems(filteredItems);
                },
                () => {
                    logDOM('Could not retrieve the inventory...');
                }
            );
        }

        const scrapQueue = async.queue((item, next) => {
            scrapQueueWorker(item, (success) => {
                if (success) {
                    setTimeout(() => {
                        next();
                    }, 250);
                } else {
                    const delay = numberOfFailedRequests > 1
                        ? getRandomInt(30000, 45000)
                        : getRandomInt(1000, 1500);

                    if (numberOfFailedRequests > 3) {
                        numberOfFailedRequests = 0;
                    }

                    setTimeout(() => {
                        next();
                    }, delay);
                }
            });
        }, 1);

        scrapQueue.drain = function() {
            onQueueDrain();
        };

        function scrapQueueWorker(item, callback) {
            const itemName = item.name || item.description.name;
            const itemId = item.assetid || item.id;

            market.getGooValue(
                item,
                (err, goo) => {
                    totalNumberOfProcessedQueueItems++;

                    const digits = getNumberOfDigits(totalNumberOfQueuedItems);
                    const padLeft = `${padLeftZero(`${totalNumberOfProcessedQueueItems}`, digits)} / ${totalNumberOfQueuedItems}`;

                    if (err != ERROR_SUCCESS) {
                        logConsole(`Failed to get gems value for ${itemName}`);
                        logDOM(`${padLeft} - ${itemName} not turned into gems due to missing gems value.`);

                        $(`#${item.appid}_${item.contextid}_${itemId}`).css('background', COLOR_ERROR);
                        return callback(false);
                    }

                    item.goo_value_expected = parseInt(goo.goo_value, 10);

                    market.grindIntoGoo(
                        item,
                        (err) => {
                            if (err != ERROR_SUCCESS) {
                                logConsole(`Failed to turn item into gems for ${itemName}`);
                                logDOM(`${padLeft} - ${itemName} not turned into gems due to unknown error.`);

                                $(`#${item.appid}_${item.contextid}_${itemId}`).css('background', COLOR_ERROR);
                                return callback(false);
                            }

                            logConsole('============================');
                            logConsole(itemName);
                            logConsole(`Turned into ${goo.goo_value} gems`);
                            logDOM(`${padLeft} - ${itemName} turned into ${item.goo_value_expected} gems.`);
                            $(`#${item.appid}_${item.contextid}_${itemId}`).css('background', COLOR_SUCCESS);

                            totalScrap += item.goo_value_expected;
                            updateTotals();

                            callback(true);
                        }
                    );
                }
            );
        }

        const boosterQueue = async.queue((item, next) => {
            boosterQueueWorker(item, (success) => {
                if (success) {
                    setTimeout(() => {
                        next();
                    }, 250);
                } else {
                    const delay = numberOfFailedRequests > 1
                        ? getRandomInt(30000, 45000)
                        : getRandomInt(1000, 1500);

                    if (numberOfFailedRequests > 3) {
                        numberOfFailedRequests = 0;
                    }

                    setTimeout(() => {
                        next();
                    }, delay);
                }
            });
        }, 1);

        boosterQueue.drain = function() {
            onQueueDrain();
        };

        function boosterQueueWorker(item, callback) {
            const itemName = item.name || item.description.name;
            const itemId = item.assetid || item.id;

            market.unpackBoosterPack(
                item,
                (err) => {
                    totalNumberOfProcessedQueueItems++;

                    const digits = getNumberOfDigits(totalNumberOfQueuedItems);
                    const padLeft = `${padLeftZero(`${totalNumberOfProcessedQueueItems}`, digits)} / ${totalNumberOfQueuedItems}`;

                    if (err != ERROR_SUCCESS) {
                        logConsole(`Failed to unpack booster pack ${itemName}`);
                        logDOM(`${padLeft} - ${itemName} not unpacked.`);

                        $(`#${item.appid}_${item.contextid}_${itemId}`).css('background', COLOR_ERROR);
                        return callback(false);
                    }

                    logDOM(`${padLeft} - ${itemName} unpacked.`);
                    $(`#${item.appid}_${item.contextid}_${itemId}`).css('background', COLOR_SUCCESS);

                    callback(true);
                }
            );
        }


        // Turns the selected items into gems.
        function turnSelectedItemsIntoGems() {
            const ids = getSelectedItems();

            loadAllInventories().then(() => {
                const items = getInventoryItems();

                let numberOfQueuedItems = 0;
                items.forEach((item) => {
                    // Ignored queued items.
                    if (item.queued != null) {
                        return;
                    }

                    if (item.owner_actions == null) {
                        return;
                    }

                    let canTurnIntoGems = false;
                    for (const owner_action in item.owner_actions) {
                        if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('GetGooValue')) {
                            canTurnIntoGems = true;
                        }
                    }

                    if (!canTurnIntoGems) {
                        return;
                    }

                    const itemId = item.assetid || item.id;
                    if (ids.indexOf(itemId) !== -1) {
                        item.queued = true;
                        scrapQueue.push(item);
                        numberOfQueuedItems++;
                    }
                });

                if (numberOfQueuedItems > 0) {
                    totalNumberOfQueuedItems += numberOfQueuedItems;

                    $('#inventory_items_spinner').remove();
                    $('#inventory_sell_buttons').append(`<div id="inventory_items_spinner">${spinnerBlock
                        }<div style="text-align:center">Processing ${numberOfQueuedItems} items</div>` +
                        '</div>');
                }
            }, () => {
                logDOM('Could not retrieve the inventory...');
            });
        }

        // Unpacks the selected booster packs.
        function unpackSelectedBoosterPacks() {
            const ids = getSelectedItems();

            loadAllInventories().then(() => {
                const items = getInventoryItems();

                let numberOfQueuedItems = 0;
                items.forEach((item) => {
                    // Ignored queued items.
                    if (item.queued != null) {
                        return;
                    }

                    if (item.owner_actions == null) {
                        return;
                    }

                    let canOpenBooster = false;
                    for (const owner_action in item.owner_actions) {
                        if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('OpenBooster')) {
                            canOpenBooster = true;
                        }
                    }

                    if (!canOpenBooster) {
                        return;
                    }

                    const itemId = item.assetid || item.id;
                    if (ids.indexOf(itemId) !== -1) {
                        item.queued = true;
                        boosterQueue.push(item);
                        numberOfQueuedItems++;
                    }
                });

                if (numberOfQueuedItems > 0) {
                    totalNumberOfQueuedItems += numberOfQueuedItems;

                    $('#inventory_items_spinner').remove();
                    $('#inventory_sell_buttons').append(`<div id="inventory_items_spinner">${spinnerBlock
                        }<div style="text-align:center">Processing ${numberOfQueuedItems} items</div>` +
                        '</div>');
                }
            }, () => {
                logDOM('Could not retrieve the inventory...');
            });
        }

        function sellSelectedItems() {
            getInventorySelectedMarketableItems((items) => {
                sellItems(items);
            });
        }

        function canSellSelectedItemsManually(items) {
            // We have to construct an URL like this
            // https://steamcommunity.com/market/multisell?appid=730&contextid=2&items[]=Falchion%20Case&qty[]=100
            const contextid = items[0].contextid;
            let hasInvalidItem = false;

            items.forEach((item) => {
                if (item.contextid != contextid || item.commodity == false) {
                    hasInvalidItem = true;
                }
            });

            return !hasInvalidItem;
        }

        function sellSelectedItemsManually() {
            getInventorySelectedMarketableItems((items) => {
                // We have to construct an URL like this
                // https://steamcommunity.com/market/multisell?appid=730&contextid=2&items[]=Falchion%20Case&qty[]=100

                const appid = items[0].appid;
                const contextid = items[0].contextid;

                const itemsWithQty = {};

                items.forEach((item) => {
                    itemsWithQty[item.market_hash_name] = itemsWithQty[item.market_hash_name] + 1 || 1;
                });

                let itemsString = '';
                for (const itemName in itemsWithQty) {
                    itemsString += `&items[]=${encodeURIComponent(itemName)}&qty[]=${itemsWithQty[itemName]}`;
                }

                const baseUrl = `${window.location.origin}/market/multisell`;
                const redirectUrl = `${baseUrl}?appid=${appid}&contextid=${contextid}${itemsString}`;

                const dialog = unsafeWindow.ShowDialog('Steam Economy Enhancer', `<iframe frameBorder="0" height="650" width="900" src="${redirectUrl}"></iframe>`);
                dialog.OnDismiss(() => {
                    items.forEach((item) => {
                        const itemId = item.assetid || item.id;
                        $(`#${item.appid}_${item.contextid}_${itemId}`).css('background', COLOR_PENDING);
                    });
                });
            });
        }

        function sellItems(items) {
            if (items.length == 0) {
                logDOM('These items cannot be added to the market...');

                return;
            }

            let numberOfQueuedItems = 0;

            items.forEach((item) => {
                // Ignored queued items.
                if (item.queued != null) {
                    return;
                }

                item.queued = true;
                item.ignoreErrors = false;
                itemQueue.push(item);
                numberOfQueuedItems++;
            });

            if (numberOfQueuedItems > 0) {
                totalNumberOfQueuedItems += numberOfQueuedItems;

                $('#inventory_items_spinner').remove();
                $('#inventory_sell_buttons').append(`<div id="inventory_items_spinner">${spinnerBlock
                    }<div style="text-align:center">Processing ${numberOfQueuedItems} items</div>` +
                    '</div>');
            }
        }

        const itemQueue = async.queue((item, next) => {
            itemQueueWorker(
                item,
                item.ignoreErrors,
                (success, cached) => {
                    if (success) {
                        setTimeout(() => next(), cached ? 0 : getRandomInt(1000, 1500));
                    } else {
                        if (!item.ignoreErrors) {
                            item.ignoreErrors = true;
                            itemQueue.push(item);
                        }

                        const delay = numberOfFailedRequests > 1 ? getRandomInt(30000, 45000) : getRandomInt(1000, 1500);
                        numberOfFailedRequests = numberOfFailedRequests > 3 ? 0 : numberOfFailedRequests;

                        setTimeout(() => next(), cached ? 0 : delay);
                    }
                }
            );
        }, 1);

        function itemQueueWorker(item, ignoreErrors, callback) {
            const priceInfo = getPriceInformationFromItem(item);

            let failed = 0;
            const itemName = item.name || item.description.name;

            market.getPriceHistory(
                item,
                true,
                (err, history, cachedHistory) => {
                    if (err) {
                        logConsole(`Failed to get price history for ${itemName}`);

                        if (err == ERROR_FAILED) {
                            failed += 1;
                        }
                    }

                    market.getItemOrdersHistogram(
                        item,
                        true,
                        (err, histogram, cachedListings) => {
                            if (err) {
                                logConsole(`Failed to get orders histogram for ${itemName}`);

                                if (err == ERROR_FAILED) {
                                    failed += 1;
                                }
                            }

                            if (failed > 0 && !ignoreErrors) {
                                return callback(false, cachedHistory && cachedListings);
                            }

                            logConsole('============================');
                            logConsole(itemName);

                            const sellPrice = calculateSellPriceBeforeFees(
                                history,
                                histogram,
                                true,
                                priceInfo.minPriceBeforeFees,
                                priceInfo.maxPriceBeforeFees
                            );


                            logConsole(`Sell price: ${sellPrice / 100.0} (${market.getPriceIncludingFees(sellPrice) / 100.0})`);

                            sellQueue.push({
                                item: item,
                                sellPrice: sellPrice
                            });

                            return callback(true, cachedHistory && cachedListings);
                        }
                    );
                }
            );
        }

        // Initialize the inventory UI.
        function initializeInventoryUI() {
            const isOwnInventory = unsafeWindow.g_ActiveUser.strSteamId == unsafeWindow.g_steamID;
            let previousSelection = -1; // To store the index of the previous selection.
            updateInventoryUI(isOwnInventory);

            $('.games_list_tabs').on(
                'click',
                '*',
                () => {
                    updateInventoryUI(isOwnInventory);
                }
            );

            // Ignore selection on other user's inventories.
            if (!isOwnInventory) {
                return;
            }

            // Steam adds 'display:none' to items while searching. These should not be selected while using shift/ctrl.
            const filter = '.itemHolder:not([style*=none])';
            $('#inventories').selectable({
                filter: filter,
                selecting: function(e, ui) {
                    // Get selected item index.
                    const selectedIndex = $(ui.selecting.tagName, e.target).index(ui.selecting);

                    // If shift key was pressed and there is previous - select them all.
                    if (e.shiftKey && previousSelection > -1) {
                        $(ui.selecting.tagName, e.target).
                            slice(
                                Math.min(previousSelection, selectedIndex),
                                1 + Math.max(previousSelection, selectedIndex)
                            ).each(function() {
                                if ($(this).is(filter)) {
                                    $(this).addClass('ui-selected');
                                }
                            });
                        previousSelection = -1; // Reset previous.
                    } else {
                        previousSelection = selectedIndex; // Save previous.
                    }
                },
                selected: function() {
                    updateButtons();
                }
            });

            if (typeof unsafeWindow.CInventory !== 'undefined') {
                const originalSelectItem = unsafeWindow.CInventory.prototype.SelectItem;

                unsafeWindow.CInventory.prototype.SelectItem = function(event, elItem, rgItem) {
                    originalSelectItem.apply(this, arguments);

                    updateButtons();
                    updateInventorySelection(rgItem);
                };
            }
        }

        // Gets the selected items in the inventory.
        function getSelectedItems() {
            const ids = [];
            $('.inventory_ctn').each(function() {
                $(this).find('.inventory_page').each(function() {
                    const inventory_page = this;

                    $(inventory_page).find('.itemHolder.ui-selected:not([style*=none])').each(function() {
                        $(this).find('.item').each(function() {
                            const matches = this.id.match(/_(-?\d+)$/);
                            if (matches) {
                                ids.push(matches[1]);
                            }
                        });
                    });
                });
            });

            return ids;
        }

        // Gets the selected and marketable items in the inventory.
        function getInventorySelectedMarketableItems(callback) {
            const ids = getSelectedItems();

            loadAllInventories().then(() => {
                const items = getInventoryItems();
                const filteredItems = [];

                items.forEach((item) => {
                    if (!item.marketable) {
                        return;
                    }

                    const itemId = item.assetid || item.id;
                    if (ids.indexOf(itemId) !== -1) {
                        filteredItems.push(item);
                    }
                });

                callback(filteredItems);
            }, () => {
                logDOM('Could not retrieve the inventory...');
            });
        }

        // Gets the selected and gemmable items in the inventory.
        function getInventorySelectedGemsItems(callback) {
            const ids = getSelectedItems();

            loadAllInventories().then(() => {
                const items = getInventoryItems();
                const filteredItems = [];

                items.forEach((item) => {
                    let canTurnIntoGems = false;
                    for (const owner_action in item.owner_actions) {
                        if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('GetGooValue')) {
                            canTurnIntoGems = true;
                        }
                    }

                    if (!canTurnIntoGems) {
                        return;
                    }

                    const itemId = item.assetid || item.id;
                    if (ids.indexOf(itemId) !== -1) {
                        filteredItems.push(item);
                    }
                });

                callback(filteredItems);
            }, () => {
                logDOM('Could not retrieve the inventory...');
            });
        }

        // Gets the selected and booster pack items in the inventory.
        function getInventorySelectedBoosterPackItems(callback) {
            const ids = getSelectedItems();

            loadAllInventories().then(() => {
                const items = getInventoryItems();
                const filteredItems = [];

                items.forEach((item) => {
                    let canOpenBooster = false;
                    for (const owner_action in item.owner_actions) {
                        if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('OpenBooster')) {
                            canOpenBooster = true;
                        }
                    }

                    if (!canOpenBooster) {
                        return;
                    }

                    const itemId = item.assetid || item.id;
                    if (ids.indexOf(itemId) !== -1) {
                        filteredItems.push(item);
                    }
                });

                callback(filteredItems);
            }, () => {
                logDOM('Could not retrieve the inventory...');
            });
        }

        // Updates the (selected) sell ... items button.
        function updateSellSelectedButton() {
            getInventorySelectedMarketableItems((items) => {
                const selectedItems = items.length;
                if (items.length == 0) {
                    $('.sell_selected').hide();
                    $('.sell_manual').hide();
                } else {
                    $('.sell_selected').show();
                    if (canSellSelectedItemsManually(items)) {
                        $('.sell_manual').show();
                        $('.sell_manual > span').text(`Sell ${selectedItems}${selectedItems == 1 ? ' Item Manual' : ' Items Manual'}`);
                    } else {
                        $('.sell_manual').hide();
                    }
                    $('.sell_selected > span').text(`Sell ${selectedItems}${selectedItems == 1 ? ' Item' : ' Items'}`);
                }
            });
        }

        // Updates the (selected) turn into ... gems button.
        function updateTurnIntoGemsButton() {
            getInventorySelectedGemsItems((items) => {
                const selectedItems = items.length;
                if (items.length == 0) {
                    $('.turn_into_gems').hide();
                } else {
                    $('.turn_into_gems').show();
                    $('.turn_into_gems > span').
                        text(`Turn ${selectedItems}${selectedItems == 1 ? ' Item Into Gems' : ' Items Into Gems'}`);
                }
            });
        }

        // Updates the (selected) open ... booster packs button.
        function updateOpenBoosterPacksButton() {
            getInventorySelectedBoosterPackItems((items) => {
                const selectedItems = items.length;
                if (items.length == 0) {
                    $('.unpack_booster_packs').hide();
                } else {
                    $('.unpack_booster_packs').show();
                    $('.unpack_booster_packs > span').
                        text(`Unpack ${selectedItems}${selectedItems == 1 ? ' Booster Pack' : ' Booster Packs'}`);
                }
            });
        }

        function updateButtons() {
            updateSellSelectedButton();
            updateTurnIntoGemsButton();
            updateOpenBoosterPacksButton();
        }

        function updateInventorySelection(selectedItem) {
            const item_info = $(`#iteminfo${unsafeWindow.iActiveSelectView}`);

            if (!item_info.length) {
                return;
            }

            if (item_info.html().indexOf('checkout/sendgift/') > -1) { // Gifts have no market information.
                return;
            }

            // Use a 'hard' item id instead of relying on the selected item_info (sometimes Steam temporarily changes the correct item (?)).
            const item_info_id = item_info.attr('id');

            // Move scrap to bottom, this is of little interest.
            const scrap = $(`#${item_info_id}_scrap_content`);
            scrap.next().insertBefore(scrap);

            // Skip unmarketable items
            if (!selectedItem.marketable) {
                return;
            }

            // Starting at prices are already retrieved in the table.
            //$('#' + item_info_id + '_item_market_actions > div:nth-child(1) > div:nth-child(2)')
            //    .remove(); // Starting at: x,xx.

            const market_hash_name = getMarketHashName(selectedItem);
            if (market_hash_name == null) {
                return;
            }

            const appid = selectedItem.appid;
            const item = {
                appid: parseInt(appid),
                description: {
                    market_hash_name: market_hash_name
                }
            };

            const ownerActions = $(`#${item_info_id}_item_owner_actions`);

            // Move market link to a button
            ownerActions.append(`<a class="btn_small btn_grey_white_innerfade" href="/market/listings/${appid}/${encodeURIComponent(market_hash_name)}"><span>View in Community Market</span></a>`);
            $(`#${item_info_id}_item_market_actions > div:nth-child(1) > div:nth-child(1)`).hide();

            // ownerActions is hidden on other games' inventories, we need to show it to have a "Market" button visible
            ownerActions.show();

            const isBoosterPack = selectedItem.name.toLowerCase().endsWith('booster pack');
            if (isBoosterPack) {
                const tradingCardsUrl = `/market/search?q=&category_753_Game%5B%5D=tag_app_${selectedItem.market_fee_app}&category_753_item_class%5B%5D=tag_item_class_2&appid=753`;
                ownerActions.append(`<br/> <a class="btn_small btn_grey_white_innerfade" href="${tradingCardsUrl}"><span>View trading cards in Community Market</span></a>`);
            }

            if (getSettingWithDefault(SETTING_QUICK_SELL_BUTTONS) != 1) {
                return;
            }

            // Ignored queued items.
            if (selectedItem.queued != null) {
                return;
            }

            market.getItemOrdersHistogram(
                item,
                false,
                (err, histogram) => {
                    if (err) {
                        logConsole(`Failed to get orders histogram for ${selectedItem.name || selectedItem.description.name}`);
                        return;
                    }

                    // Ignored queued items.
                    if (selectedItem.queued != null) {
                        return;
                    }

                    const groupMain = $(`<div id="listings_group">
                        <div>
                            <div id="listings_sell">Sell</div>
                            ${histogram.sell_order_table}
                        </div>
                        <div>
                            <div id="listings_buy">Buy</div>
                            ${histogram.buy_order_table}
                        </div>
                    </div>`);

                    $(`#${item_info_id}_item_market_actions > div`).after(groupMain);

                    // Generate quick sell buttons.
                    let prices = [];

                    if (histogram != null && histogram.highest_buy_order != null) {
                        prices.push(parseInt(histogram.highest_buy_order));
                    }

                    if (histogram != null && histogram.lowest_sell_order != null) {
                        // Transaction volume must be separable into three or more parts (no matter if equal): valve+publisher+seller.
                        if (parseInt(histogram.lowest_sell_order) > 3) {
                            prices.push(parseInt(histogram.lowest_sell_order) - 1);
                        }
                        prices.push(parseInt(histogram.lowest_sell_order));
                    }

                    prices = prices.filter((v, i) => prices.indexOf(v) === i).sort((a, b) => a - b);

                    let buttons = ' ';
                    prices.forEach((e) => {
                        buttons += `<a class="item_market_action_button item_market_action_button_green quick_sell" id="quick_sell${e}">
                            <span class="item_market_action_button_edge item_market_action_button_left"></span>
                            <span class="item_market_action_button_contents">${formatPrice(e)}</span>
                            <span class="item_market_action_button_edge item_market_action_button_right"></span>
                            <span class="item_market_action_button_preload"></span>
                        </a>`;
                    });

                    $(`#${item_info_id}_item_market_actions`, item_info).append(buttons);

                    $(`#${item_info_id}_item_market_actions`, item_info).append(`<div style="display:flex">
                        <input id="quick_sell_input" style="background-color: black;color: white;border: transparent;max-width:65px;text-align:center;" type="number" value="${histogram.lowest_sell_order / 100}" step="0.01" />&nbsp;
                        <a class="item_market_action_button item_market_action_button_green quick_sell_custom">
                            <span class="item_market_action_button_edge item_market_action_button_left"></span>
                            <span class="item_market_action_button_contents">➜ Sell</span>
                            <span class="item_market_action_button_edge item_market_action_button_right"></span>
                            <span class="item_market_action_button_preload"></span>
                        </a>
                    </div>`);

                    $('.quick_sell').on(
                        'click',
                        function() {
                            let price = $(this).attr('id').replace('quick_sell', '');
                            price = market.getPriceBeforeFees(price);

                            totalNumberOfQueuedItems++;

                            sellQueue.push({
                                item: selectedItem,
                                sellPrice: price
                            });
                        }
                    );

                    $('.quick_sell_custom').on(
                        'click',
                        () => {
                            let price = $('#quick_sell_input', $(`#${item_info_id}_item_market_actions`, item_info)).val() * 100;
                            price = market.getPriceBeforeFees(price);

                            totalNumberOfQueuedItems++;

                            sellQueue.push({
                                item: selectedItem,
                                sellPrice: price
                            });
                        }
                    );
                }
            );
        }

        // Update the inventory UI.
        function updateInventoryUI(isOwnInventory) {
            // Remove previous containers (e.g., when a user changes inventory).
            $('#inventory_sell_buttons').remove();
            $('#see_settings_modal').remove();
            $('#inventory_reload_button').remove();

            $('#see_settings').remove();
            $('#global_action_menu').
                prepend('<span id="see_settings"><a href="javascript:void(0)">⬖ Steam Economy Enhancer</a></span>');
            $('#see_settings').on('click', '*', () => openSettings());

            const appId = getActiveInventory().m_appid;
            const showMiscOptions = appId == 753;
            const TF2 = appId == 440;

            let buttonsHtml = `
                <a class="btn_green_white_innerfade btn_medium_wide sell_all"><span>Sell All Items</span></a>
                <a class="btn_green_white_innerfade btn_medium_wide sell_all_duplicates"><span>Sell All Duplicate Items</span></a>
                <a class="btn_green_white_innerfade btn_medium_wide sell_selected" style="display:none"><span>Sell Selected Items</span></a>
                <a class="btn_green_white_innerfade btn_medium_wide sell_manual" style="display:none"><span>Sell Manually</span></a>
            `;

            if (showMiscOptions) {
                buttonsHtml += `
                    <a class="btn_green_white_innerfade btn_medium_wide sell_all_cards"><span>Sell All Cards</span></a>
                    <div class="see_inventory_buttons">
                        <a class="btn_darkblue_white_innerfade btn_medium_wide turn_into_gems" style="display:none"><span>Turn Selected Items Into Gems</span></a>
                        <a class="btn_darkblue_white_innerfade btn_medium_wide gem_all_duplicates"><span>Turn All Duplicate Items Into Gems</span></a>
                        <a class="btn_darkblue_white_innerfade btn_medium_wide unpack_booster_packs" style="display:none"><span>Unpack Selected Booster Packs</span></a>
                    </div>
                `;
            } else if (TF2) {
                buttonsHtml += '<a class="btn_green_white_innerfade btn_medium_wide sell_all_crates"><span>Sell All Crates</span></a>';
            }

            const sellButtons = $(`<div id="inventory_sell_buttons" class="see_inventory_buttons">${buttonsHtml}</div>`);

            const reloadButton =
                $('<a id="inventory_reload_button" class="btn_darkblue_white_innerfade btn_medium_wide reload_inventory" style="margin-right:12px"><span>Reload Inventory</span></a>');

            const logo = $('#inventory_logos')[0];
            logo.style.height = 'auto';
            logo.style.maxHeight = 'unset';

            $('#inventory_applogo').hide(); // Hide the Steam/game logo, we don't need to see it twice.
            $('#inventory_applogo').after(logger);


            $('#logger').on(
                'scroll',
                () => {
                    const hasUserScrolledToBottom =
                        $('#logger').prop('scrollHeight') - $('#logger').prop('clientHeight') <=
                        $('#logger').prop('scrollTop') + 1;
                    userScrolled = !hasUserScrolledToBottom;
                }
            );

            // Only add buttons on the user's inventory.
            if (isOwnInventory) {
                $('#inventory_applogo').after(sellButtons);

                // Add bindings to sell buttons.
                $('.sell_all').on(
                    'click',
                    '*',
                    () => {
                        sellAllItems();
                    }
                );
                $('.sell_selected').on('click', '*', sellSelectedItems);
                $('.sell_all_duplicates').on('click', '*', sellAllDuplicateItems);
                $('.gem_all_duplicates').on('click', '*', gemAllDuplicateItems);
                $('.sell_manual').on('click', '*', sellSelectedItemsManually);
                $('.sell_all_cards').on('click', '*', sellAllCards);
                $('.sell_all_crates').on('click', '*', sellAllCrates);
                $('.turn_into_gems').on('click', '*', turnSelectedItemsIntoGems);
                $('.unpack_booster_packs').on('click', '*', unpackSelectedBoosterPacks);

            }

            $('.inventory_rightnav').prepend(reloadButton);
            $('.reload_inventory').on(
                'click',
                '*',
                () => {
                    window.location.reload();
                }
            );

            loadAllInventories().then(
                () => {
                    const updateInventoryPrices = function() {
                        if (getSettingWithDefault(SETTING_INVENTORY_PRICE_LABELS) == 1) {
                            setInventoryPrices(getInventoryItems());
                        }
                    };

                    // Load after the inventory is loaded.
                    updateInventoryPrices();

                    $('#inventory_pagecontrols').observe(
                        'childlist',
                        '*',
                        () => {
                            updateInventoryPrices();
                        }
                    );
                },
                () => {
                    logDOM('Could not retrieve the inventory...');
                }
            );
        }

        // Loads the specified inventories.
        function loadInventories(inventories) {
            return new Promise((resolve) => {
                inventories.reduce(
                    (promise, inventory) => {
                        return promise.then(() => {
                            return inventory.LoadCompleteInventory().done(() => { });
                        });
                    },
                    Promise.resolve()
                );

                resolve();
            });
        }

        // Loads all inventories.
        function loadAllInventories() {
            const items = [];

            for (const child in getActiveInventory().m_rgChildInventories) {
                items.push(getActiveInventory().m_rgChildInventories[child]);
            }
            items.push(getActiveInventory());

            return loadInventories(items);
        }

        // Gets the inventory items from the active inventory.
        function getInventoryItems() {
            const arr = [];

            for (const child in getActiveInventory().m_rgChildInventories) {
                for (const key in getActiveInventory().m_rgChildInventories[child].m_rgAssets) {
                    const value = getActiveInventory().m_rgChildInventories[child].m_rgAssets[key];
                    if (typeof value === 'object') {
                        // Merges the description in the normal object, this is done to keep the layout consistent with the market page, which is also flattened.
                        Object.assign(value, value.description);
                        // Includes the id of the inventory item.
                        value['id'] = key;
                        arr.push(value);
                    }
                }
            }

            // Some inventories (e.g. BattleBlock Theater) do not have child inventories, they have just one.
            for (const key in getActiveInventory().m_rgAssets) {
                const value = getActiveInventory().m_rgAssets[key];
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
    }
    //#endregion

    //#region Inventory + Tradeoffer
    if (currentPage == PAGE_INVENTORY || currentPage == PAGE_TRADEOFFER) {

        // Gets the active inventory.
        function getActiveInventory() {
            return unsafeWindow.g_ActiveInventory;
        }

        // Sets the prices for the items.
        function setInventoryPrices(items) {
            inventoryPriceQueue.kill();

            items.forEach((item) => {
                if (!item.marketable) {
                    return;
                }

                if (!$(item.element).is(':visible')) {
                    return;
                }

                inventoryPriceQueue.push(item);
            });
        }

        const inventoryPriceQueue = async.queue(
            (item, next) => {
                inventoryPriceQueueWorker(
                    item,
                    false,
                    (success, cached) => {
                        if (success) {
                            setTimeout(() => next(), cached ? 0 : getRandomInt(1000, 1500));
                        } else {
                            if (!item.ignoreErrors) {
                                item.ignoreErrors = true;
                                inventoryPriceQueue.push(item);
                            }

                            numberOfFailedRequests++;

                            const delay = numberOfFailedRequests > 1 ? getRandomInt(30000, 45000) : getRandomInt(1000, 1500);
                            numberOfFailedRequests = numberOfFailedRequests > 3 ? 0 : numberOfFailedRequests;

                            setTimeout(() => next(), cached ? 0 : delay);
                        }
                    }
                );
            },
            1
        );

        function inventoryPriceQueueWorker(item, ignoreErrors, callback) {
            let failed = 0;
            const itemName = item.name || item.description.name;

            // Only get the market orders here, the history is not important to visualize the current prices.
            market.getItemOrdersHistogram(
                item,
                true,
                (err, histogram, cachedListings) => {
                    if (err) {
                        logConsole(`Failed to get orders histogram for ${itemName}`);

                        if (err == ERROR_FAILED) {
                            failed += 1;
                        }
                    }

                    if (failed > 0 && !ignoreErrors) {
                        return callback(false, cachedListings);
                    }

                    const sellPrice = calculateSellPriceBeforeFees(null, histogram, false, 0, 65535);

                    const itemPrice = sellPrice == 65535
                        ? '∞'
                        : formatPrice(market.getPriceIncludingFees(sellPrice));

                    const elementName = `${(currentPage == PAGE_TRADEOFFER ? '#item' : '#')}${item.appid}_${item.contextid}_${item.id}`;
                    const element = $(elementName);

                    $('.inventory_item_price', element).remove();
                    element.append(`<span class="inventory_item_price price_${sellPrice == 65535 ? 0 : market.getPriceIncludingFees(sellPrice)}">${itemPrice}</span>`);

                    return callback(true, cachedListings);
                }
            );
        }
    }
    //#endregion

    //#region Market
    if (currentPage == PAGE_MARKET || currentPage == PAGE_MARKET_LISTING) {
        const marketListingsRelistedAssets = [];
        let marketProgressBar;

        function increaseMarketProgressMax() {
            let value = marketProgressBar.max;

            // Reset the progress bar if it already completed
            if (marketProgressBar.value === value) {
                marketProgressBar.value = 0;
                value = 0;
            }

            marketProgressBar.max = value + 1;
            marketProgressBar.removeAttribute('hidden');
        }

        function increaseMarketProgress() {
            marketProgressBar.value += 1;

            if (marketProgressBar.value === marketProgressBar.max) {
                marketProgressBar.setAttribute('hidden', 'true');
            }
        }

        // Match number part from any currency format
        const getPriceValueAsInt = listing =>
            unsafeWindow.GetPriceValueAsInt(
                listing.match(/(?<price>[0-9][0-9 .,]*)/)?.groups?.price ?? 0
            );

        const marketListingsQueue = async.queue((listing, next) => {
            marketListingsQueueWorker(
                listing,
                false,
                (success, cached) => {
                    const callback = () => {
                        increaseMarketProgress();
                        next();
                    };

                    if (success) {
                        setTimeout(callback, cached ? 0 : getRandomInt(1000, 1500));
                    } else {
                        setTimeout(() => marketListingsQueueWorker(listing, true, callback), cached ? 0 : getRandomInt(30000, 45000));
                    }
                }
            );
        }, 1);

        function marketListingsQueueWorker(listing, ignoreErrors, callback) {
            const asset = unsafeWindow.g_rgAssets[listing.appid][listing.contextid][listing.assetid];

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

            const market_hash_name = getMarketHashName(asset);
            const appid = listing.appid;

            const listingUI = $(getListingFromLists(listing.listingid).elm);

            const game_name = asset.type;
            const price = getPriceValueAsInt($('.market_listing_price > span:nth-child(1) > span:nth-child(1)', listingUI).text());

            if (price <= getSettingWithDefault(SETTING_PRICE_MIN_CHECK_PRICE) * 100) {
                $('.market_listing_my_price', listingUI).last().css('background', COLOR_PRICE_NOT_CHECKED);
                $('.market_listing_my_price', listingUI).last().prop('title', 'The price is not checked.');
                listingUI.addClass('not_checked');

                return callback(true, true);
            }

            const priceInfo = getPriceInformationFromItem(asset);
            const item = {
                appid: parseInt(appid),
                description: {
                    market_hash_name: market_hash_name
                }
            };

            let failed = 0;

            market.getPriceHistory(
                item,
                true,
                (errorPriceHistory, history, cachedHistory) => {
                    if (errorPriceHistory) {
                        logConsole(`Failed to get price history for ${game_name}`);

                        if (errorPriceHistory == ERROR_FAILED) {
                            failed += 1;
                        }
                    }

                    market.getItemOrdersHistogram(
                        item,
                        true,
                        (errorHistogram, histogram, cachedListings) => {
                            if (errorHistogram) {
                                logConsole(`Failed to get orders histogram for ${game_name}`);

                                if (errorHistogram == ERROR_FAILED) {
                                    failed += 1;
                                }
                            }

                            if (failed > 0 && !ignoreErrors) {
                                return callback(false, cachedHistory && cachedListings);
                            }

                            // Shows the highest buy order price on the market listings.
                            // The 'histogram.highest_buy_order' is not reliable as Steam is caching this value, but it gives some idea for older titles/listings.
                            const highestBuyOrderPrice = histogram == null || histogram.highest_buy_order == null
                                ? '-'
                                : formatPrice(histogram.highest_buy_order);
                            $(
                                '.market_table_value > span:nth-child(1) > span:nth-child(1) > span:nth-child(1)',
                                listingUI
                            ).append(` ➤ <span title="This is likely the highest buy order price.">${highestBuyOrderPrice
                                }</span>`);

                            logConsole('============================');
                            logConsole(JSON.stringify(listing));
                            logConsole(`${game_name}: ${asset.name}`);
                            logConsole(`Current price: ${price / 100.0}`);

                            // Calculate two prices here, one without the offset and one with the offset.
                            // The price without the offset is required to not relist the item constantly when you have the lowest price (i.e., with a negative offset).
                            // The price with the offset should be used for relisting so it will still apply the user-set offset.

                            const sellPriceWithoutOffset = calculateSellPriceBeforeFees(
                                history,
                                histogram,
                                false,
                                priceInfo.minPriceBeforeFees,
                                priceInfo.maxPriceBeforeFees
                            );
                            const sellPriceWithOffset = calculateSellPriceBeforeFees(
                                history,
                                histogram,
                                true,
                                priceInfo.minPriceBeforeFees,
                                priceInfo.maxPriceBeforeFees
                            );

                            const sellPriceWithoutOffsetWithFees = market.getPriceIncludingFees(sellPriceWithoutOffset);

                            logConsole(`Calculated price: ${sellPriceWithoutOffsetWithFees / 100.0} (${sellPriceWithoutOffset / 100.0})`);

                            listingUI.addClass(`price_${sellPriceWithOffset}`);

                            $('.market_listing_my_price', listingUI).last().prop(
                                'title',
                                `The best price is ${formatPrice(sellPriceWithoutOffsetWithFees)}.`
                            );

                            if (sellPriceWithoutOffsetWithFees < price) {
                                logConsole('Sell price is too high.');

                                $('.market_listing_my_price', listingUI).last().
                                    css('background', COLOR_PRICE_EXPENSIVE);
                                listingUI.addClass('overpriced');

                                if (getSettingWithDefault(SETTING_RELIST_AUTOMATICALLY) == 1) {
                                    queueOverpricedItemListing(listing.listingid);
                                }
                            } else if (sellPriceWithoutOffsetWithFees > price) {
                                logConsole('Sell price is too low.');

                                $('.market_listing_my_price', listingUI).last().css('background', COLOR_PRICE_CHEAP);
                                listingUI.addClass('underpriced');
                            } else {
                                logConsole('Sell price is fair.');

                                $('.market_listing_my_price', listingUI).last().css('background', COLOR_PRICE_FAIR);
                                listingUI.addClass('fair');
                            }

                            return callback(true, cachedHistory && cachedListings);
                        }
                    );
                }
            );
        }

        const marketOverpricedQueue = async.queue(
            (item, next) => {
                marketOverpricedQueueWorker(
                    item,
                    false,
                    (success) => {
                        const callback = () => {
                            increaseMarketProgress();
                            next();
                        };

                        if (success) {
                            setTimeout(callback, getRandomInt(1000, 1500));
                        } else {
                            setTimeout(() => marketOverpricedQueueWorker(item, true, callback), getRandomInt(30000, 45000));
                        }
                    }
                );
            },
            1
        );

        function marketOverpricedQueueWorker(item, ignoreErrors, callback) {
            const listingUI = getListingFromLists(item.listing).elm;

            market.removeListing(
                item.listing, false,
                (errorRemove) => {
                    if (!errorRemove) {
                        $('.actual_content', listingUI).css('background', COLOR_PENDING);

                        setTimeout(() => {
                            const itemName = $('.market_listing_item_name_link', listingUI).first().attr('href');
                            const marketHashNameIndex = itemName.lastIndexOf('/') + 1;
                            const marketHashName = itemName.substring(marketHashNameIndex);
                            const decodedMarketHashName = decodeURIComponent(itemName.substring(marketHashNameIndex));
                            let newAssetId = -1;

                            unsafeWindow.RequestFullInventory(`${market.inventoryUrl + item.appid}/${item.contextid}/`, {}, null, null, (transport) => {
                                if (transport.responseJSON && transport.responseJSON.success) {
                                    const inventory = transport.responseJSON.rgInventory;

                                    for (const child in inventory) {
                                        if (marketListingsRelistedAssets.indexOf(child) == -1 && inventory[child].appid == item.appid && (inventory[child].market_hash_name == decodedMarketHashName || inventory[child].market_hash_name == marketHashName)) {
                                            newAssetId = child;
                                            break;
                                        }
                                    }

                                    if (newAssetId == -1) {
                                        $('.actual_content', listingUI).css('background', COLOR_ERROR);
                                        return callback(false);
                                    }

                                    item.assetid = newAssetId;
                                    marketListingsRelistedAssets.push(newAssetId);

                                    market.sellItem(
                                        item,
                                        item.sellPrice,
                                        (errorSell) => {
                                            if (!errorSell) {
                                                $('.actual_content', listingUI).css('background', COLOR_SUCCESS);

                                                setTimeout(() => {
                                                    removeListingFromLists(item.listing);
                                                }, 3000);

                                                return callback(true);
                                            } else {
                                                $('.actual_content', listingUI).css('background', COLOR_ERROR);
                                                return callback(false);
                                            }
                                        }
                                    );

                                } else {
                                    $('.actual_content', listingUI).css('background', COLOR_ERROR);
                                    return callback(false);
                                }
                            });
                        }, getRandomInt(1500, 2500)); // Wait a little to make sure the item is returned to inventory.
                    } else {
                        $('.actual_content', listingUI).css('background', COLOR_ERROR);
                        return callback(false);
                    }
                }
            );
        }

        // Queue an overpriced item listing to be relisted.
        function queueOverpricedItemListing(listingid) {
            const assetInfo = getAssetInfoFromListingId(listingid);
            const listingUI = $(getListingFromLists(listingid).elm);
            let price = -1;

            const items = $(listingUI).attr('class').split(' ');
            for (const i in items) {
                if (items[i].toString().includes('price_')) {
                    price = parseInt(items[i].toString().replace('price_', ''));
                }
            }

            if (price > 0) {
                marketOverpricedQueue.push({
                    listing: listingid,
                    assetid: assetInfo.assetid,
                    contextid: assetInfo.contextid,
                    appid: assetInfo.appid,
                    sellPrice: price
                });
                increaseMarketProgressMax();
            }
        }

        const marketRemoveQueue = async.queue(
            (listingid, next) => {
                marketRemoveQueueWorker(
                    listingid,
                    false,
                    (success) => {
                        const callback = () => {
                            increaseMarketProgress();
                            next();
                        };

                        if (success) {
                            setTimeout(callback, getRandomInt(50, 100));
                        } else {
                            setTimeout(() => marketRemoveQueueWorker(listingid, true, callback), getRandomInt(30000, 45000));
                        }
                    }
                );
            },
            1
        );

        function marketRemoveQueueWorker(listingid, ignoreErrors, callback) {
            const listingUI = getListingFromLists(listingid).elm;
            const isBuyOrder = listingUI.id.startsWith('mybuyorder_');

            market.removeListing(
                listingid, isBuyOrder,
                (errorRemove) => {
                    if (!errorRemove) {
                        $('.actual_content', listingUI).css('background', COLOR_SUCCESS);

                        setTimeout(
                            () => {
                                removeListingFromLists(listingid);

                                const numberOfListings = marketLists[0].size;
                                if (numberOfListings > 0) {
                                    $('#my_market_selllistings_number').text(numberOfListings.toString());

                                    // This seems identical to the number of sell listings.
                                    $('#my_market_activelistings_number').text(numberOfListings.toString());
                                }
                            },
                            3000
                        );

                        return callback(true);
                    } else {
                        $('.actual_content', listingUI).css('background', COLOR_ERROR);

                        return callback(false);
                    }
                }
            );
        }

        const marketListingsItemsQueue = async.queue(
            (listing, next) => {
                const callback = () => {
                    increaseMarketProgress();
                    setTimeout(() => next(), getRandomInt(1000, 1500));
                };

                const url = `${window.location.origin}/market/mylistings`

                const options = {
                    method: 'GET',
                    data: {
                        count: 100,
                        start: listing
                    },
                    responseType: 'json'
                };

                request(
                    url,
                    options,
                    (error, data) => {
                        if (error || !data?.success) {
                            callback();
                            return;
                        }

                        const myMarketListings = $('#tabContentsMyActiveMarketListingsRows');

                        const nodes = $.parseHTML(data.results_html);
                        const rows = $('.market_listing_row', nodes);
                        myMarketListings.append(rows);

                        // g_rgAssets
                        unsafeWindow.MergeWithAssetArray(data.assets); // This is a method from Steam.

                        callback();
                    }
                )
            },
            1
        );

        marketListingsItemsQueue.drain = function() {
            const myMarketListings = $('#tabContentsMyActiveMarketListingsRows');
            myMarketListings.checkboxes('range', true);

            // Sometimes the Steam API is returning duplicate entries (especially during item listing), filter these.
            const seen = {};
            $('.market_listing_row', myMarketListings).each(function() {
                const item_id = $(this).attr('id');
                if (seen[item_id]) {
                    $(this).remove();
                } else {
                    seen[item_id] = true;
                }

                // Remove listings awaiting confirmations, they are already listed separately.
                if ($('.item_market_action_button', this).attr('href').toLowerCase().
                    includes('CancelMarketListingConfirmation'.toLowerCase())) {
                    $(this).remove();
                }

                // Remove buy order listings, they are already listed separately.
                if ($('.item_market_action_button', this).attr('href').toLowerCase().
                    includes('CancelMarketBuyOrder'.toLowerCase())) {
                    $(this).remove();
                }
            });

            // Now add the market checkboxes.
            addMarketCheckboxes();

            // Show the listings again, rendering is done.
            $('#market_listings_spinner').remove();
            myMarketListings.show();

            fillMarketListingsQueue();
        };


        function fillMarketListingsQueue() {
            $('.market_home_listing_table').each(function(e) {

                // Not for popular / new / recently sold items (bottom of page).
                if ($('.my_market_header', $(this)).length == 0) {
                    return;
                }

                // Buy orders and listings confirmations are not grouped like the sell listings, add this so pagination works there as well.
                if (!$(this).attr('id')) {
                    $(this).attr('id', `market-listing-${e}`);

                    $(this).append(`<div class="market_listing_see" id="market-listing-container-${e}"></div>`);
                    $('.market_listing_row', $(this)).appendTo($(`#market-listing-container-${e}`));
                } else {
                    $(this).children().last().addClass('market_listing_see');
                }

                addMarketPagination($('.market_listing_see', this).last());
                sortMarketListings($(this), false, false, true);
            });

            let totalPriceBuyer = 0;
            let totalPriceSeller = 0;
            let totalAmount = 0;

            // Add the listings to the queue to be checked for the price.
            for (let i = 0; i < marketLists.length; i++) {
                for (let j = 0; j < marketLists[i].items.length; j++) {
                    const listingid = replaceNonNumbers(marketLists[i].items[j].values().market_listing_item_name);
                    const assetInfo = getAssetInfoFromListingId(listingid);

                    totalAmount += assetInfo.amount
                    if (!isNaN(assetInfo.priceBuyer)) {
                        totalPriceBuyer += assetInfo.priceBuyer * assetInfo.amount;
                    }
                    if (!isNaN(assetInfo.priceSeller)) {
                        totalPriceSeller += assetInfo.priceSeller * assetInfo.amount;
                    }

                    marketListingsQueue.push({
                        listingid,
                        appid: assetInfo.appid,
                        contextid: assetInfo.contextid,
                        assetid: assetInfo.assetid
                    });
                    increaseMarketProgressMax();
                }
            }

            $('#my_market_selllistings_number').append(`<span id="my_market_sellistings_total_amount"> [${totalAmount}]</span>`)
                .append(`<span id="my_market_sellistings_total_price">, ${formatPrice(totalPriceBuyer)} ➤ ${formatPrice(totalPriceSeller)}</span>`);
        }


        // Gets the asset info (appid/contextid/assetid) based on a listingid.
        function getAssetInfoFromListingId(listingid) {
            const listing = getListingFromLists(listingid);
            if (listing == null) {
                return {};
            }

            const actionButton = $('.item_market_action_button', listing.elm).attr('href');
            // Market buy orders have no asset info.
            if (actionButton == null || actionButton.toLowerCase().includes('cancelmarketbuyorder')) {
                return {};
            }

            const priceBuyer = getPriceValueAsInt($('.market_listing_price > span:nth-child(1) > span:nth-child(1)', listing.elm).text());
            const priceSeller = getPriceValueAsInt($('.market_listing_price > span:nth-child(1) > span:nth-child(3)', listing.elm).text());
            const itemIds = actionButton.split(',');
            const appid = replaceNonNumbers(itemIds[2]);
            const contextid = replaceNonNumbers(itemIds[3]);
            const assetid = replaceNonNumbers(itemIds[4]);
            const amount = Number(unsafeWindow.g_rgAssets[appid][contextid][assetid]?.amount ?? 1);
            return {
                appid,
                contextid,
                assetid,
                amount,
                priceBuyer,
                priceSeller
            };
        }

        // Adds pagination and search options to the market item listings.
        function addMarketPagination(market_listing_see) {
            market_listing_see.addClass('list');

            market_listing_see.before('<ul class="paginationTop pagination"></ul>');
            market_listing_see.after('<ul class="paginationBottom pagination"></ul>');

            $('.market_listing_table_header', market_listing_see.parent()).
                append('<input class="search" id="market_name_search" placeholder="Search..." />');

            let pageSize = parseInt(getSettingWithDefault(SETTING_MARKET_PAGE_COUNT), 10);

            if (isNaN(pageSize) || pageSize < 1) {
                pageSize = settingDefaults[SETTING_MARKET_PAGE_COUNT];
            }

            const options = {
                valueNames: [
                    'market_listing_game_name',
                    'market_listing_item_name_link',
                    'market_listing_price',
                    'market_listing_listed_date',
                    {
                        name: 'market_listing_item_name',
                        attr: 'id'
                    }
                ],
                pagination: [
                    {
                        name: 'paginationTop',
                        paginationClass: 'paginationTop',
                        innerWindow: 100,
                        outerWindow: 100,
                        left: 100,
                        right: 100
                    },
                    {
                        name: 'paginationBottom',
                        paginationClass: 'paginationBottom',
                        innerWindow: 100,
                        outerWindow: 100,
                        left: 100,
                        right: 100
                    }
                ],
                page: pageSize
            };

            try {
                if (market_listing_see[0].childElementCount > 0) {
                    const list = new List(market_listing_see.parent().get(0), options);
                    list.on('searchComplete', updateMarketSelectAllButton);
                    marketLists.push(list);
                }
            } catch (e) {
                console.error(e);
            }
        }

        // Adds checkboxes to market listings.
        function addMarketCheckboxes() {
            $('.market_listing_row').each(function() {
                // Don't add it again, one time is enough.
                if ($('.market_listing_select', this).length == 0) {
                    $('.market_listing_cancel_button', $(this)).append('<div class="market_listing_select">' +
                        '<input type="checkbox" class="market_select_item"/>' +
                        '</div>');

                    $('.market_select_item', this).change(() => {
                        updateMarketSelectAllButton();
                    });
                }
            });
        }

        // Process the market listings.
        function processMarketListings() {
            addMarketCheckboxes();

            if (currentPage == PAGE_MARKET) {
                // Load the market listings.
                let currentCount = 0;
                let totalCount = 0;

                if (typeof unsafeWindow.g_oMyListings !== 'undefined' && unsafeWindow.g_oMyListings != null && unsafeWindow.g_oMyListings.m_cTotalCount != null) {
                    totalCount = unsafeWindow.g_oMyListings.m_cTotalCount;
                } else {
                    totalCount = parseInt($('#my_market_selllistings_number').text());
                }

                if (isNaN(totalCount) || totalCount == 0) {
                    fillMarketListingsQueue();
                    return;
                }

                $('#tabContentsMyActiveMarketListingsRows').html(''); // Clear the default listings.
                $('#tabContentsMyActiveMarketListingsRows').hide(); // Hide all listings until everything has been loaded.

                // Hide Steam's paging controls.
                $('#tabContentsMyActiveMarketListings_ctn').hide();
                $('.market_pagesize_options').hide();

                // Show the spinner so the user knows that something is going on.
                $('.my_market_header').eq(0).append(`<div id="market_listings_spinner">${spinnerBlock
                    }<div style="text-align:center">Loading market listings</div>` +
                    '</div>');

                while (currentCount < totalCount) {
                    marketListingsItemsQueue.push(currentCount);
                    increaseMarketProgressMax();
                    currentCount += 100;
                }
            } else {
                // This is on a market item page.
                $('.market_home_listing_table').each(function() {
                    // Not on 'x requests to buy at y,yy or lower'.
                    if ($('#market_buyorder_info_show_details', $(this)).length > 0) {
                        return;
                    }

                    $(this).children().last().addClass('market_listing_see');

                    addMarketPagination($('.market_listing_see', this).last());
                    sortMarketListings($(this), false, false, true);
                });

                $('#tabContentsMyActiveMarketListingsRows > .market_listing_row').each(function() {
                    const listingid = $(this).attr('id').replace('mylisting_', '').replace('mybuyorder_', '').replace('mbuyorder_', '');
                    const assetInfo = getAssetInfoFromListingId(listingid);

                    // There's only one item in the g_rgAssets on a market listing page.
                    let existingAsset = null;
                    for (const appid in unsafeWindow.g_rgAssets) {
                        for (const contextid in unsafeWindow.g_rgAssets[appid]) {
                            for (const assetid in unsafeWindow.g_rgAssets[appid][contextid]) {
                                existingAsset = unsafeWindow.g_rgAssets[appid][contextid][assetid];
                                break;
                            }
                        }
                    }

                    // appid and contextid are identical, only the assetid is different for each asset.
                    unsafeWindow.g_rgAssets[assetInfo.appid][assetInfo.contextid][assetInfo.assetid] = existingAsset;
                    marketListingsQueue.push({
                        listingid,
                        appid: assetInfo.appid,
                        contextid: assetInfo.contextid,
                        assetid: assetInfo.assetid
                    });
                    increaseMarketProgressMax();
                });
            }
        }

        // Update the select/deselect all button on the market.
        function updateMarketSelectAllButton() {
            $('.market_listing_buttons').each(function() {
                const selectionGroup = $(this).parent().parent();
                let invert = $('.market_select_item:checked', selectionGroup).length == $('.market_select_item', selectionGroup).length;
                if ($('.market_select_item', selectionGroup).length == 0) { // If there are no items to select, keep it at Select all.
                    invert = false;
                }
                $('.select_all > span', selectionGroup).text(invert ? 'Deselect all' : 'Select all');
            });
        }

        // Sort the market listings.
        function sortMarketListings(elem, isPrice, isDate, isName) {
            const list = getListFromContainer(elem);
            if (list == null) {
                console.log('Invalid parameter, could not find a list matching elem.');
                return;
            }

            // Change sort order (asc/desc).
            let asc = true;

            // (Re)set the asc/desc arrows.
            const arrow_down = '🡻';
            const arrow_up = '🡹';

            $('.market_listing_table_header > span', elem).each(function() {
                if ($(this).hasClass('market_listing_edit_buttons')) {
                    return;
                }

                if ($(this).text().includes(arrow_up)) {
                    asc = false;
                }

                $(this).text($(this).text().replace(` ${arrow_down}`, '').replace(` ${arrow_up}`, ''));
            });

            let market_listing_selector;
            if (isPrice) {
                market_listing_selector = $('.market_listing_table_header', elem).children().eq(1);
            } else if (isDate) {
                market_listing_selector = $('.market_listing_table_header', elem).children().eq(2);
            } else if (isName) {
                market_listing_selector = $('.market_listing_table_header', elem).children().eq(3);
            }
            market_listing_selector.text(`${market_listing_selector.text()} ${asc ? arrow_up : arrow_down}`);

            if (list.sort == null) {
                return;
            }

            if (isName) {
                list.sort('', {
                    order: asc ? 'asc' : 'desc',
                    sortFunction: function(a, b) {
                        if (a.values().market_listing_game_name.toLowerCase().
                            localeCompare(b.values().market_listing_game_name.toLowerCase()) ==
                            0) {
                            return a.values().market_listing_item_name_link.toLowerCase().
                                localeCompare(b.values().market_listing_item_name_link.toLowerCase());
                        }
                        return a.values().market_listing_game_name.toLowerCase().
                            localeCompare(b.values().market_listing_game_name.toLowerCase());
                    }
                });
            } else if (isDate) {
                const currentMonth = luxon.DateTime.local().month;

                list.sort('market_listing_listed_date', {
                    order: asc ? 'asc' : 'desc',
                    sortFunction: function(a, b) {
                        let firstDate = luxon.DateTime.fromString(a.values().market_listing_listed_date.trim(), 'd MMM');
                        let secondDate = luxon.DateTime.fromString(b.values().market_listing_listed_date.trim(), 'd MMM');

                        if (firstDate == null || secondDate == null) {
                            return 0;
                        }

                        if (firstDate.month > currentMonth) {
                            firstDate = firstDate.plus({ years: -1 });
                        }
                        if (secondDate.month > currentMonth) {
                            secondDate = secondDate.plus({ years: -1 });
                        }

                        if (firstDate > secondDate) {
                            return 1;
                        }
                        if (firstDate === secondDate) {
                            return 0;
                        }
                        return -1;
                    }
                });
            } else if (isPrice) {
                list.sort('market_listing_price', {
                    order: asc ? 'asc' : 'desc',
                    sortFunction: function(a, b) {
                        let listingPriceA = $(a.values().market_listing_price).text();
                        listingPriceA = listingPriceA.substr(0, listingPriceA.indexOf('('));

                        let listingPriceB = $(b.values().market_listing_price).text();
                        listingPriceB = listingPriceB.substr(0, listingPriceB.indexOf('('));

                        const firstPrice = getPriceValueAsInt(listingPriceA);
                        const secondPrice = getPriceValueAsInt(listingPriceB);

                        return firstPrice - secondPrice;
                    }
                });
            }
        }

        function getListFromContainer(group) {
            for (let i = 0; i < marketLists.length; i++) {
                if (group.attr('id') == $(marketLists[i].listContainer).attr('id')) {
                    return marketLists[i];
                }
            }
        }

        function getListingFromLists(listingid) {
            // Sometimes listing ids are contained in multiple lists (?), use the last one available as this is the one we're most likely interested in.
            for (let i = marketLists.length - 1; i >= 0; i--) {
                let values = marketLists[i].get('market_listing_item_name', `mylisting_${listingid}_name`);
                if (values != null && values.length > 0) {
                    return values[0];
                }

                values = marketLists[i].get('market_listing_item_name', `mbuyorder_${listingid}_name`);
                if (values != null && values.length > 0) {
                    return values[0];
                }
            }


        }

        function removeListingFromLists(listingid) {
            for (let i = 0; i < marketLists.length; i++) {
                marketLists[i].remove('market_listing_item_name', `mylisting_${listingid}_name`);
                marketLists[i].remove('market_listing_item_name', `mbuyorder_${listingid}_name`);
            }
        }

        // Initialize the market UI.
        function initializeMarketUI() {
            $('.market_header_text').append('<progress id="see_market_progress" value="1" max="1" hidden>');
            marketProgressBar = document.getElementById('see_market_progress');

            // Sell orders.
            $('.my_market_header').first().append(`<div class="market_listing_buttons">
                <a class="item_market_action_button item_market_action_button_green select_all market_listing_button">
                    <span class="item_market_action_button_contents">Select all</span>
                </a>
                <a class="item_market_action_button item_market_action_button_green select_five_from_page market_listing_button">
                    <span class="item_market_action_button_contents">Select 5</span>
                </a>
                <a class="item_market_action_button item_market_action_button_green select_twentyfive_from_page market_listing_button">
                    <span class="item_market_action_button_contents">Select 25</span>
                </a>
                <a class="item_market_action_button item_market_action_button_green remove_selected market_listing_button">
                    <span class="item_market_action_button_contents">Remove selected</span>
                </a>
                <a class="item_market_action_button item_market_action_button_green relist_selected market_listing_button" style="margin-left:auto">
                    <span class="item_market_action_button_contents">Relist selected</span>
                </a>
                <a class="item_market_action_button item_market_action_button_green relist_overpriced market_listing_button">
                    <span class="item_market_action_button_contents">Relist overpriced</span>
                </a>
                <a class="item_market_action_button item_market_action_button_green select_overpriced market_listing_button">
                    <span class="item_market_action_button_contents">Select overpriced</span>
                </a>
            </div>`);

            // Listings confirmations and buy orders.
            $('.my_market_header').slice(1).append(`<div class="market_listing_buttons">
                <a class="item_market_action_button item_market_action_button_green select_all market_listing_button">
                    <span class="item_market_action_button_contents">Select all</span>
                </a>
                <a class="item_market_action_button item_market_action_button_green remove_selected market_listing_button">
                    <span class="item_market_action_button_contents">Remove selected</span>
                </a>
            </div>`);

            $('.market_listing_table_header').on('click', 'span', function() {
                if ($(this).hasClass('market_listing_edit_buttons') || $(this).hasClass('item_market_action_button_contents')) {
                    return;
                }

                const isPrice = $('.market_listing_table_header', $(this).parent().parent()).children().eq(1).text() == $(this).text();
                const isDate = $('.market_listing_table_header', $(this).parent().parent()).children().eq(2).text() == $(this).text();
                const isName = $('.market_listing_table_header', $(this).parent().parent()).children().eq(3).text() == $(this).text();

                sortMarketListings($(this).parent().parent(), isPrice, isDate, isName);
            });

            $('.select_all').on('click', '*', function() {
                const selectionGroup = $(this).parent().parent().parent().parent();
                const marketList = getListFromContainer(selectionGroup);

                const invert = $('.market_select_item:checked', selectionGroup).length == $('.market_select_item', selectionGroup).length;

                for (let i = 0; i < marketList.matchingItems.length; i++) {
                    $('.market_select_item', marketList.matchingItems[i].elm).prop('checked', !invert);
                }

                updateMarketSelectAllButton();
            });

            $('.select_five_from_page').on('click', '*', function() {
                const selectionGroup = $(this).parent().parent().parent().parent();
                const marketList = getListFromContainer(selectionGroup);

                let count = 0;
                for (let i = 0; i < marketList.matchingItems.length; i++) {
                    if (count == 5) {
                        break;
                    }
                    if (!$('.market_select_item', marketList.matchingItems[i].elm).prop('checked')) {
                        $('.market_select_item', marketList.matchingItems[i].elm).prop('checked', true);
                        count += 1;
                    }
                }

                updateMarketSelectAllButton();
            });

            $('.select_twentyfive_from_page').on('click', '*', function() {
                const selectionGroup = $(this).parent().parent().parent().parent();
                const marketList = getListFromContainer(selectionGroup);

                let count = 0;
                for (let i = 0; i < marketList.matchingItems.length; i++) {
                    if (count == 25) {
                        break;
                    }
                    if (!$('.market_select_item', marketList.matchingItems[i].elm).prop('checked')) {
                        $('.market_select_item', marketList.matchingItems[i].elm).prop('checked', true);
                        count += 1;
                    }
                }

                updateMarketSelectAllButton();
            });

            $('.select_overpriced').on('click', '*', function() {
                const selectionGroup = $(this).parent().parent().parent().parent();
                const marketList = getListFromContainer(selectionGroup);

                for (let i = 0; i < marketList.matchingItems.length; i++) {
                    if ($(marketList.matchingItems[i].elm).hasClass('overpriced')) {
                        $('.market_select_item', marketList.matchingItems[i].elm).prop('checked', true);
                    }
                }

                $('.market_listing_row', selectionGroup).each(function() {
                    if ($(this).hasClass('overpriced')) {
                        $('.market_select_item', $(this)).prop('checked', true);
                    }
                });

                updateMarketSelectAllButton();
            });

            $('.remove_selected').on('click', '*', function() {
                const selectionGroup = $(this).parent().parent().parent().parent();
                const marketList = getListFromContainer(selectionGroup);

                for (let i = 0; i < marketList.matchingItems.length; i++) {
                    if ($('.market_select_item', $(marketList.matchingItems[i].elm)).prop('checked')) {
                        const listingid = replaceNonNumbers(marketList.matchingItems[i].values().market_listing_item_name);
                        marketRemoveQueue.push(listingid);
                        increaseMarketProgressMax();
                    }
                }
            });

            $('.market_relist_auto').change(() => {
                setSetting(SETTING_RELIST_AUTOMATICALLY, $('.market_relist_auto').is(':checked') ? 1 : 0);
            });

            $('.relist_overpriced').on('click', '*', function() {
                const selectionGroup = $(this).parent().parent().parent().parent();
                const marketList = getListFromContainer(selectionGroup);

                for (let i = 0; i < marketList.matchingItems.length; i++) {
                    if ($(marketList.matchingItems[i].elm).hasClass('overpriced')) {
                        const listingid = replaceNonNumbers(marketList.matchingItems[i].values().market_listing_item_name);
                        queueOverpricedItemListing(listingid);
                    }
                }
            });

            $('.relist_selected').on('click', '*', function() {
                const selectionGroup = $(this).parent().parent().parent().parent();
                const marketList = getListFromContainer(selectionGroup);

                for (let i = 0; i < marketList.matchingItems.length; i++) {
                    if ($(marketList.matchingItems[i].elm) && $('.market_select_item', $(marketList.matchingItems[i].elm)).prop('checked')) {
                        const listingid = replaceNonNumbers(marketList.matchingItems[i].values().market_listing_item_name);
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
    if (currentPage == PAGE_TRADEOFFER) {
        // Gets the trade offer's inventory items from the active inventory.
        function getTradeOfferInventoryItems() {
            const arr = [];
            const activeInventory = getActiveInventory();

            // We don't have an active inventory yet.
            if (!activeInventory) {
                return arr;
            }

            for (const child in activeInventory.rgChildInventories) {
                for (const key in activeInventory.rgChildInventories[child].rgInventory) {
                    const value = activeInventory.rgChildInventories[child].rgInventory[key];
                    if (typeof value === 'object') {
                        // Merges the description in the normal object, this is done to keep the layout consistent with the market page, which is also flattened.
                        Object.assign(value, value.description);
                        // Includes the id of the inventory item.
                        value['id'] = key;
                        arr.push(value);
                    }
                }
            }

            // Some inventories (e.g. BattleBlock Theater) do not have child inventories, they have just one.
            for (const key in activeInventory.rgInventory) {
                const value = activeInventory.rgInventory[key];
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

        function sumTradeOfferAssets(assets, user) {
            const total = {};
            let totalPrice = 0;
            for (let i = 0; i < assets.length; i++) {
                const rgItem = user.findAsset(assets[i].appid, assets[i].contextid, assets[i].assetid);

                let text = '';
                if (rgItem != null) {
                    if (rgItem.element) {
                        const inventoryPriceElements = $('.inventory_item_price', rgItem.element);
                        if (inventoryPriceElements.length) {
                            const firstPriceElement = inventoryPriceElements[0];
                            const classes = $(firstPriceElement).attr('class').split(' ');
                            for (const c in classes) {
                                if (classes[c].toString().includes('price_')) {
                                    const price = parseInt(classes[c].toString().replace('price_', ''));
                                    totalPrice += price;
                                }
                            }

                        }
                    }

                    if (rgItem.original_amount != null && rgItem.amount != null) {
                        const originalAmount = parseInt(rgItem.original_amount);
                        const currentAmount = parseInt(rgItem.amount);
                        const usedAmount = originalAmount - currentAmount;
                        text += `${usedAmount.toString()}x `;
                    }

                    text += rgItem.name;

                    if (rgItem.type != null && rgItem.type.length > 0) {
                        text += ` (${rgItem.type})`;
                    }
                } else {
                    text = 'Unknown Item';
                }

                if (text in total) {
                    total[text] = total[text] + 1;
                } else {
                    total[text] = 1;
                }
            }

            const sortable = [];
            for (const item in total) {
                sortable.push([
                    item,
                    total[item]
                ]);
            }

            sortable.sort((a, b) => {
                return a[1] - b[1];
            }).reverse();

            let totalText = `<strong>Number of unique items: ${sortable.length}, worth ${formatPrice(totalPrice)}<br/><br/></strong>`;
            let totalNumOfItems = 0;
            for (let i = 0; i < sortable.length; i++) {
                totalText += `${sortable[i][1]}x ${sortable[i][0]}<br/>`;
                totalNumOfItems += sortable[i][1];
            }
            totalText += `<br/><strong>Total items: ${totalNumOfItems}</strong><br/>`;

            return totalText;
        }
    }


    let lastTradeOfferSum = 0;

    function hasLoadedAllTradeOfferItems() {
        for (let i = 0; i < unsafeWindow.g_rgCurrentTradeStatus.them.assets.length; i++) {
            const asset = unsafeWindow.UserThem.findAsset(unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].appid, unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].contextid, unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].assetid);
            if (asset == null) {
                return false;
            }
        }
        for (let i = 0; i < unsafeWindow.g_rgCurrentTradeStatus.me.assets.length; i++) {
            const asset = unsafeWindow.UserYou.findAsset(unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].appid, unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].contextid, unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].assetid);
            if (asset == null) {
                return false;
            }
        }
        return true;

    }

    function initializeTradeOfferUI() {
        if (getSettingWithDefault(SETTING_TRADEOFFER_PRICE_LABELS) == 1) {
            const updateInventoryPrices = function() {
                setInventoryPrices(getTradeOfferInventoryItems());
            };

            const updateInventoryPricesInTrade = function() {
                const items = [];
                for (let i = 0; i < unsafeWindow.g_rgCurrentTradeStatus.them.assets.length; i++) {
                    const asset = unsafeWindow.UserThem.findAsset(unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].appid, unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].contextid, unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].assetid);
                    items.push(asset);
                }
                for (let i = 0; i < unsafeWindow.g_rgCurrentTradeStatus.me.assets.length; i++) {
                    const asset = unsafeWindow.UserYou.findAsset(unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].appid, unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].contextid, unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].assetid);
                    items.push(asset);
                }
                setInventoryPrices(items);
            };

            $('.trade_right > div > div > div > .trade_item_box').observe('childlist subtree', () => {
                if (!hasLoadedAllTradeOfferItems()) {
                    return;
                }

                const currentTradeOfferSum = unsafeWindow.g_rgCurrentTradeStatus.me.assets.length + unsafeWindow.g_rgCurrentTradeStatus.them.assets.length;
                if (lastTradeOfferSum != currentTradeOfferSum) {
                    updateInventoryPricesInTrade();
                }

                lastTradeOfferSum = currentTradeOfferSum;

                $('#trade_offer_your_sum').remove();
                $('#trade_offer_their_sum').remove();

                const your_sum = sumTradeOfferAssets(unsafeWindow.g_rgCurrentTradeStatus.me.assets, unsafeWindow.UserYou);
                const their_sum = sumTradeOfferAssets(unsafeWindow.g_rgCurrentTradeStatus.them.assets, unsafeWindow.UserThem);

                $('div.offerheader:nth-child(1) > div:nth-child(3)').append(`<div class="trade_offer_sum" id="trade_offer_your_sum">${your_sum}</div>`);
                $('div.offerheader:nth-child(3) > div:nth-child(3)').append(`<div class="trade_offer_sum" id="trade_offer_their_sum">${their_sum}</div>`);
            });


            // Load after the inventory is loaded.
            updateInventoryPrices();

            $('#inventory_pagecontrols').observe(
                'childlist',
                '*',
                () => {
                    updateInventoryPrices();
                }
            );
        }

        const appendSelectPageButton = () => {
            $('#inventory_displaycontrols').append(`<div class="trade_offer_buttons">
              <a class="item_market_action_button item_market_action_button_green select_all">
                  <span class="item_market_action_button_contents" style="text-transform:none">Select all from page</span>
              </a>
          </div>`);

            $('.select_all').on('click', '*', () => {
                $('.inventory_ctn:visible > .inventory_page:visible > .itemHolder:visible').delayedEach(250, (i, it) => {
                    const item = it.rgItem;
                    if (item.is_stackable) {
                        return;
                    }

                    if (!item.tradable) {
                        return;
                    }

                    unsafeWindow.MoveItemToTrade(it);
                });
            });
        }

        // On counter offers, we need to wait until 'Change offer' is pressed
        if (location.pathname !== '/tradeoffer/new/' && location.pathname !== '/tradeoffer/new') {
            $('.modify_trade_offer').one('click', '*', () => {
                appendSelectPageButton();
            });
        } else {
            appendSelectPageButton();
        }
    }
    //#endregion

    //#region Settings
    function openSettings() {
        const price_options = $(`<div id="see_settings_modal">
            <div>
                Calculate prices as the:&nbsp;
                <select id="${SETTING_PRICE_ALGORITHM}">
                    <option value="1"${getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1 ? 'selected="selected"' : ''}>Maximum of the average history and lowest sell listing</option>
                    <option value="2" ${getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 2 ? 'selected="selected"' : ''}>Lowest sell listing</option>
                    <option value="3" ${getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 3 ? 'selected="selected"' : ''}>Highest current buy order or lowest sell listing</option>
                </select>
            </div>
            <div style="margin-top:6px;">
                Hours to use for the average history calculated price:&nbsp;
                <input type="number" min="0" step="2" id="${SETTING_PRICE_HISTORY_HOURS}" value=${getSettingWithDefault(SETTING_PRICE_HISTORY_HOURS)}>
            </div>
            <div style="margin-top:6px;">
                The value to add to the calculated price (minimum and maximum are respected):&nbsp;
                <input type="number" step="0.01" id="${SETTING_PRICE_OFFSET}" value=${getSettingWithDefault(SETTING_PRICE_OFFSET)}>
            </div>
            <div style="margin-top:6px">
                Use the second lowest sell listing when the lowest sell listing has a low quantity:&nbsp;
                <input type="checkbox" id="${SETTING_PRICE_IGNORE_LOWEST_Q}" ${getSettingWithDefault(SETTING_PRICE_IGNORE_LOWEST_Q) == 1 ? 'checked' : ''}>
            </div>
            <div style="margin-top:6px;">
                Don't check market listings with prices of and below:&nbsp;
                <input type="number" step="0.01" id="${SETTING_PRICE_MIN_CHECK_PRICE}" value=${getSettingWithDefault(SETTING_PRICE_MIN_CHECK_PRICE)}>
            </div>
            <div style="margin-top:6px;">
                Don't list market listings with prices of and below:&nbsp;
                <input type="number" step="0.01" id="${SETTING_PRICE_MIN_LIST_PRICE}" value=${getSettingWithDefault(SETTING_PRICE_MIN_LIST_PRICE)}>
            </div>
            <div style="margin-top:24px">
                Show price labels in inventory:&nbsp;
                <input type="checkbox" id="${SETTING_INVENTORY_PRICE_LABELS}" ${getSettingWithDefault(SETTING_INVENTORY_PRICE_LABELS) == 1 ? 'checked' : ''}>
            </div>
            <div style="margin-top:6px">
                Show price labels in trade offers:&nbsp;
                <input type="checkbox" id="${SETTING_TRADEOFFER_PRICE_LABELS}" ${getSettingWithDefault(SETTING_TRADEOFFER_PRICE_LABELS) == 1 ? 'checked' : ''}>
            </div>
            <div style="margin-top:6px">
                Show quick sell info and buttons:&nbsp;
                <input type="checkbox" id="${SETTING_QUICK_SELL_BUTTONS}" ${getSettingWithDefault(SETTING_QUICK_SELL_BUTTONS) == 1 ? 'checked' : ''}>
            </div>
            <div style="margin-top:24px;">
                Minimum:&nbsp;
                <input type="number" step="0.01" id="${SETTING_MIN_NORMAL_PRICE}" value=${getSettingWithDefault(SETTING_MIN_NORMAL_PRICE)}>
                &nbsp;and maximum:&nbsp;
                <input type="number" step="0.01" id="${SETTING_MAX_NORMAL_PRICE}" value=${getSettingWithDefault(SETTING_MAX_NORMAL_PRICE)}>
                &nbsp;price for normal cards
            </div>
            <div style="margin-top:6px;">
                Minimum:&nbsp;
                <input type="number" step="0.01" id="${SETTING_MIN_FOIL_PRICE}" value=${getSettingWithDefault(SETTING_MIN_FOIL_PRICE)}>
                &nbsp;and maximum:&nbsp;
                <input type="number" step="0.01" id="${SETTING_MAX_FOIL_PRICE}" value=${getSettingWithDefault(SETTING_MAX_FOIL_PRICE)}>
                &nbsp;price for foil cards
            </div>
            <div style="margin-top:6px;">
                Minimum:&nbsp;
                <input type="number" step="0.01" id="${SETTING_MIN_MISC_PRICE}" value=${getSettingWithDefault(SETTING_MIN_MISC_PRICE)}>
                &nbsp;and maximum:&nbsp;
                <input type="number" step="0.01" id="${SETTING_MAX_MISC_PRICE}" value=${getSettingWithDefault(SETTING_MAX_MISC_PRICE)}>
                &nbsp;price for other items
            </div>
            <div style="margin-top:24px;">
                Market items per page:&nbsp;
                <input type="number" min="1" step="5" id="${SETTING_MARKET_PAGE_COUNT}" value=${getSettingWithDefault(SETTING_MARKET_PAGE_COUNT)}>
            </div>
            <div style="margin-top:6px;">
                Automatically relist overpriced market listings (slow on large inventories):&nbsp;
                <input id="${SETTING_RELIST_AUTOMATICALLY}" class="market_relist_auto" type="checkbox" ${getSettingWithDefault(SETTING_RELIST_AUTOMATICALLY) == 1 ? 'checked' : ''}>
            </div>
        </div>`);

        unsafeWindow.ShowConfirmDialog('Steam Economy Enhancer', price_options).done(() => {
            setSetting(SETTING_MIN_NORMAL_PRICE, $(`#${SETTING_MIN_NORMAL_PRICE}`, price_options).val());
            setSetting(SETTING_MAX_NORMAL_PRICE, $(`#${SETTING_MAX_NORMAL_PRICE}`, price_options).val());
            setSetting(SETTING_MIN_FOIL_PRICE, $(`#${SETTING_MIN_FOIL_PRICE}`, price_options).val());
            setSetting(SETTING_MAX_FOIL_PRICE, $(`#${SETTING_MAX_FOIL_PRICE}`, price_options).val());
            setSetting(SETTING_MIN_MISC_PRICE, $(`#${SETTING_MIN_MISC_PRICE}`, price_options).val());
            setSetting(SETTING_MAX_MISC_PRICE, $(`#${SETTING_MAX_MISC_PRICE}`, price_options).val());
            setSetting(SETTING_PRICE_OFFSET, $(`#${SETTING_PRICE_OFFSET}`, price_options).val());
            setSetting(SETTING_PRICE_MIN_CHECK_PRICE, $(`#${SETTING_PRICE_MIN_CHECK_PRICE}`, price_options).val());
            setSetting(SETTING_PRICE_MIN_LIST_PRICE, $(`#${SETTING_PRICE_MIN_LIST_PRICE}`, price_options).val())
            setSetting(SETTING_PRICE_ALGORITHM, $(`#${SETTING_PRICE_ALGORITHM}`, price_options).val());
            setSetting(SETTING_PRICE_IGNORE_LOWEST_Q, $(`#${SETTING_PRICE_IGNORE_LOWEST_Q}`, price_options).prop('checked') ? 1 : 0);
            setSetting(SETTING_PRICE_HISTORY_HOURS, $(`#${SETTING_PRICE_HISTORY_HOURS}`, price_options).val());
            setSetting(SETTING_MARKET_PAGE_COUNT, $(`#${SETTING_MARKET_PAGE_COUNT}`, price_options).val());
            setSetting(SETTING_RELIST_AUTOMATICALLY, $(`#${SETTING_RELIST_AUTOMATICALLY}`, price_options).prop('checked') ? 1 : 0);
            setSetting(SETTING_INVENTORY_PRICE_LABELS, $(`#${SETTING_INVENTORY_PRICE_LABELS}`, price_options).prop('checked') ? 1 : 0);
            setSetting(SETTING_TRADEOFFER_PRICE_LABELS, $(`#${SETTING_TRADEOFFER_PRICE_LABELS}`, price_options).prop('checked') ? 1 : 0);
            setSetting(SETTING_QUICK_SELL_BUTTONS, $(`#${SETTING_QUICK_SELL_BUTTONS}`, price_options).prop('checked') ? 1 : 0);

            window.location.reload();
        });
    }
    //#endregion

    //#region UI
    injectCss(`
        .ui-selected { outline: 2px dashed #FFFFFF; }
        #logger { color: #767676; font-size: 12px;margin-top:16px; max-height: 200px; overflow-y: auto; }
        .trade_offer_sum { color: #767676; font-size: 12px; margin-top:8px; user-select: text; }
        .trade_offer_buttons { margin-top: 12px; }
        .market_commodity_orders_table { font-size:12px; font-family: "Motiva Sans", Sans-serif; font-weight: 300; }
        .market_commodity_orders_table th { padding-left: 10px; }
        #listings_group { display: flex; justify-content: space-between; margin-bottom: 8px; }
        #listings_sell { text-align: right; color: #589328; font-weight:600; }
        #listings_buy { text-align: right; color: #589328; font-weight:600; }
        .market_listing_my_price { height: 50px; padding-right:6px; }
        .market_listing_edit_buttons.actual_content { width:276px; transition-property: background-color, border-color; transition-timing-function: linear; transition-duration: 0.5s;}
        .market_listing_buttons { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; padding: 5px; background: rgba(0, 0, 0, 0.4); }
        .market_listing_label_right { float:right; font-size:12px; margin-top:1px; }
        .market_listing_select { position: absolute; top: 16px;right: 10px; display: flex; }
        #market_listing_relist { vertical-align: middle; position: relative; bottom: -1px; right: 2px; }
        .pick_and_sell_button > a { vertical-align: middle; }
        .market_relist_auto { margin-bottom: 8px;  }
        .market_relist_auto_label { margin-right: 6px; }
        .quick_sell { margin-right: 4px; }

        .spinner {margin:10px auto;width:50px;height:40px;text-align:center;font-size:10px;}
        .spinner > div {background-color:#ccc;height:100%;width:6px;display:inline-block;animation:sk-stretchdelay 1.2s infinite ease-in-out}
        .spinner .rect2 {animation-delay:-1.1s}
        .spinner .rect3 {animation-delay:-1s}
        .spinner .rect4 {animation-delay:-.9s}
        .spinner .rect5 {animation-delay:-.8s}
        @keyframes sk-stretchdelay {
            0%,40%,100% {transform:scaleY(0.4);}
            20% {transform:scaleY(1.0);}
        }

        #market_name_search { float: right; background: rgba(0, 0, 0, 0.25); color: white; border: none;height: 25px; padding-left: 6px;}
        .price_option_price { width: 100px }
        .inventory_item_price { top: 0px;position: absolute;right: 0;background: #3571a5;padding: 2px;color: white; font-size:11px; border: 1px solid #666666;}

        .see_inventory_buttons {display:flex;flex-wrap:wrap;gap:10px;align-items:start;}
        .see_inventory_buttons > .see_inventory_buttons, .see_inventory_buttons > #inventory_items_spinner {flex-basis: 100%;}
        #see_market_progress { display: block; width: 50%; height: 20px; }
        #see_market_progress[hidden] { visibility: hidden; }

        .pagination { padding-left: 0px; }
        .pagination li { display:inline-block; padding: 5px 10px;background: rgba(255, 255, 255, 0.10); margin-right: 6px; border: 1px solid #666666; }
        .pagination li.active { background: rgba(255, 255, 255, 0.25); }

        #see_settings { background: #26566c; margin-right: 10px; height: 24px; line-height:24px; display:inline-block; padding: 0px 6px; }
        #see_settings_modal select, #see_settings_modal input[type="number"] { background-color: black; color: white; border: transparent; padding: 4px 8px; }
        #see_settings_modal input[type="number"] { width: 100px; }
        #see_settings_modal input[type="checkbox"] { width: 16px; height: 16px; vertical-align: middle; accent-color: #000; }
    `);

    $(document).ready(() => {
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
        const head = document.getElementsByTagName('head')[0];
        if (!head) {
            return;
        }
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        head.appendChild(style);
    }

    $.fn.delayedEach = function(timeout, callback, continuous) {
        const $els = this;
        const iterator = function(index) {
            if (index >= $els.length) {
                if (!continuous) {
                    return;
                }
                index = 0;
            }

            const cur = $els[index];
            callback.call(cur, index, cur);

            setTimeout(() => {
                iterator(++index);
            }, timeout);
        };

        iterator(0);
    };
    //#endregion
}(jQuery, async));
