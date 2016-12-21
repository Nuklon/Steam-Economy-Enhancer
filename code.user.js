// ==UserScript==
// @name        Steam Economy Enhancer
// @namespace   https://github.com/Nuklon
// @author      Nuklon
// @license     MIT
// @version     1.5.0
// @description Enhances the Steam Inventory and Steam Market.
// @include     *://steamcommunity.com/id/*/inventory*
// @include     *://steamcommunity.com/profiles/*/inventory*
// @include     *://steamcommunity.com/market*
// @require     https://raw.githubusercontent.com/caolan/async/master/dist/async.min.js
// @require     https://raw.githubusercontent.com/kapetan/jquery-observe/master/jquery-observe.js
// @require     https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @homepageURL https://github.com/Nuklon/Steam-Economy-Enhancer
// @supportURL  https://github.com/Nuklon/Steam-Economy-Enhancer/issues
// @downloadURL https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js
// @updateURL   https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js
// ==/UserScript==

(function ($, async, g_rgAppContextData, g_strInventoryLoadURL, g_rgWalletInfo) {
    var STEAM_INVENTORY_ID = 753;
    var COLOR_ERROR = '#772527';
    var COLOR_SUCCESS = '#496424';
    var COLOR_PENDING = '#837433';

    var queuedItems = [];

    var isOnMarket = window.location.href.includes('.com/market');

    var market = new SteamMarket(g_rgAppContextData, g_strInventoryLoadURL, g_rgWalletInfo);
    var user_currency = GetCurrencySymbol(GetCurrencyCode(market.walletInfo.wallet_currency));

    function SteamMarket(appContext, inventoryUrl, walletInfo) {
        this.appContext = appContext;
        this.inventoryUrl = inventoryUrl;
        this.walletInfo = walletInfo;
    }

    //#region Settings
    var SETTING_MIN_NORMAL_PRICE = 'SETTING_MIN_NORMAL_PRICE';
    var SETTING_MAX_NORMAL_PRICE = 'SETTING_MAX_NORMAL_PRICE';
    var SETTING_MIN_FOIL_PRICE = 'SETTING_MIN_FOIL_PRICE';
    var SETTING_MAX_FOIL_PRICE = 'SETTING_MAX_FOIL_PRICE';
    var SETTING_MIN_MISC_PRICE = 'SETTING_MIN_MISC_PRICE';
    var SETTING_MAX_MISC_PRICE = 'SETTING_MAX_MISC_PRICE';

    var settingDefaults =
    {
        SETTING_MIN_NORMAL_PRICE: 0.05,
        SETTING_MAX_NORMAL_PRICE: 2.50,
        SETTING_MIN_FOIL_PRICE: 0.15,
        SETTING_MAX_FOIL_PRICE: 10,
        SETTING_MIN_MISC_PRICE: 0.05,
        SETTING_MAX_MISC_PRICE: 10
    };

    function getSetting(name) {
        return localStorage.getItem(name) || settingDefaults[name];
    }

    function setSetting(name, value) {
        localStorage.setItem(name, value);
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
            maxPrice = getSetting(SETTING_MAX_MISC_PRICE);
            minPrice = getSetting(SETTING_MIN_MISC_PRICE);
        } else {
            maxPrice = isFoilTradingCard ? getSetting(SETTING_MAX_FOIL_PRICE) : getSetting(SETTING_MAX_NORMAL_PRICE);
            minPrice = isFoilTradingCard ? getSetting(SETTING_MIN_FOIL_PRICE) : getSetting(SETTING_MIN_NORMAL_PRICE);
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

        highest = Math.ceil(highest / total);
        return market.getPriceBeforeFees(highest);
    }

    // Calculate the sell price based on the history and listings.
    // belowFirstListing specifies whether the returned price should be 1 cent below the lowest listing (only if highest average is lower than first listing).
    function calculateSellPriceListings(history, listings, belowFirstListing) {
        var historyPrice = calculateAverageHistory(history);

        if (listings == null || Object.keys(listings).length === 0) {
            if (historyPrice == 0)
                return 0;

            return historyPrice;
        }

        var listingPrice = listings[Object.keys(listings)[0]].converted_price;

        // If the highest average price is lower than the first listing, return 1 cent below that listing.
        // Otherwise, use the highest average price instead.
        if (historyPrice < listingPrice) {
            if (belowFirstListing) {
                return listingPrice - 1;
            }
            return listingPrice;
        } else {
            return historyPrice;
        }
    }

    // Calculate the sell price based on the history and listings.
    // belowFirstListing specifies whether the returned price should be 1 cent below the lowest listing (only if highest average is lower than first listing).
    function calculateSellPriceHistogram(history, histogram, belowFirstListing) {
        var historyPrice = calculateAverageHistory(history);
        if (histogram == null || typeof histogram.sell_order_graph === 'undefined' || histogram.sell_order_graph.length == 0) {
            if (historyPrice == 0) {
                return 0;
            }
                
            return historyPrice;
        }

        var listingPrice = market.getPriceBeforeFees(histogram.lowest_sell_order);

        // If the highest average price is lower than the first listing, return 1 cent below that listing.
        // Otherwise, use the highest average price instead.
        if (historyPrice < listingPrice) {
            if (belowFirstListing) {
                return listingPrice - 1;
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

            callback(null, items);
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
                callback(null, data);
            },
            error: function (data) {
                return callback(true, data);
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
                callback(null, data);
            },
            error: function () {
                return callback(true);
            },
            crossDomain: true,
            xhrFields: { withCredentials: true },
            dataType: 'json'
        });
    };

    SteamMarket.prototype.getGames = function () {
        return this.appContext;
    };

    // Get the price history for an item
    // PriceHistory is an array of prices in the form [data, price, number sold]
    // e.g. [["Fri, 19 Jul 2013 01:00:00 +0000",7.30050206184,362]]
    // Prices are ordered by oldest to most recent
    // Price is inclusive of fees
    SteamMarket.prototype.getPriceHistory = function (item, callback, cached) {
        try {
            var market_name = getMarketHashName(item);
            if (market_name == null) {
                callback(true);
                return;
            }

            var url = window.location.protocol + '//steamcommunity.com/market/pricehistory/?appid=' + item.appid + '&market_hash_name=' + market_name;
            var storage_hash = 'pricehistory_' + url;

            if (sessionStorage.getItem(storage_hash)) {
                callback(null, JSON.parse(sessionStorage.getItem(storage_hash)), true);
                return;
            }
            
            $.get(url,
                function (data) {
                    if (!data || !data.success || !data.prices) {
                        callback(true);
                        return;
                    }

                    // Multiply prices so they're in pennies
                    for (var i = 0; i < data.prices.length; i++) {
                        data.prices[i][1] *= 100;
                        data.prices[i][2] = parseInt(data.prices[i][2]);
                    }

                    sessionStorage.setItem(storage_hash, JSON.stringify(data.prices));
                    callback(null, data.prices, false);
                }, 'json')
			 .fail(function () {
			 	 return callback(true);
			 });
        } catch (e) {
            return callback(true);
        }
    };

    // Get the sales listings for this item in the market.
    // Listings is a list of listing objects.
    // converted_price and converted_fee are the useful bits of info.
    //
    // ** This is not returning up-to-date information on prices **
    //
    // {"listingid":"2944526023990990820",
    //	 "steamid_lister":"76561198065094510",
    //	 "price":2723,
    //	 "fee":408,
    //	 "steam_fee":136,
    //	 "publisher_fee":272,
    //	 "publisher_fee_app":570,
    //	 "publisher_fee_percent":"0.12000000149011612", (actually a multiplier, not a percentage)
    //	 "currencyid":2005,
    //	 "converted_price":50, (price before fees, amount to pay is price+fee)
    //	 "converted_fee":7, (fee added to price)
    //	 "converted_currencyid":2002,
    //	 "converted_steam_fee":2,
    //	 "converted_publisher_fee":5,
    //	 "asset":{"currency":0,"appid":570,"contextid":"2","id":"1113797403","amount":"1"}
    // }
    SteamMarket.prototype.getListings = function (item, callback, cached) {
        try {
            var market_name = getMarketHashName(item);
            if (market_name == null) {
                callback(true);
                return;
            }

            var url = window.location.protocol + '//steamcommunity.com/market/listings/' + item.appid + '/' + market_name;
            var storage_hash = 'listings_' + url;

            if (sessionStorage.getItem(storage_hash)) {
                callback(null, JSON.parse(sessionStorage.getItem(storage_hash)), true);
                return;
            }
           
            $.get(url,
                function (page) {
                    var matches = /var g_rgListingInfo = (.+);/.exec(page);
                    if (matches == null) {
                        callback(true);
                        return;
                    }

                    var listingInfo = JSON.parse(matches[1]);
                    if (!listingInfo) {
                        callback(true);
                        return;
                    }

                    sessionStorage.setItem(storage_hash, JSON.stringify(listingInfo));
                    callback(null, listingInfo, false);
                })
             .fail(function (e) {
                return callback(true);
             });            
        } catch (e) {
            return callback(true);
        }
    };

    // Get the item name id from a market item.
    SteamMarket.prototype.getMarketItemNameId = function (item, callback) {
        try {
            var market_name = getMarketHashName(item);
            if (market_name == null) {
                callback(true);
                return;
            }

            var url = window.location.protocol + '//steamcommunity.com/market/listings/' + item.appid + '/' + market_name;
            var storage_hash = 'itemnameid_' + url;

            if (localStorage.getItem(storage_hash)) {
                var item_nameid = localStorage.getItem(storage_hash);

                // Make sure the stored item name id is valid before returning it.
                if (replaceNonNumbers(item_nameid) == item_nameid) { 
                    callback(null, item_nameid);
                    return;
                }
            }
            
            $.get(url,
                function (page) {
                    var matches = /Market_LoadOrderSpread\( (.+) \);/.exec(page);
                    if (matches == null) {
                        callback(true);
                        return;
                    }

                    var item_nameid = matches[1];

                    localStorage.setItem(storage_hash, item_nameid);

                    callback(null, item_nameid);
                })
             .fail(function () {
                 return callback(true);
             });
        } catch (e) {
            return callback(true);
        }
    }

    // Get the sales listings for this item in the market, with more information.
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
    SteamMarket.prototype.getItemOrdersHistogram = function (item, callback, cached) {
        try {
            var market_name = getMarketHashName(item);
            if (market_name == null)
                return callback(true);

            var url = window.location.protocol + '//steamcommunity.com/market/listings/' + item.appid + '/' + market_name;
            var storage_hash = 'itemordershistogram_' + url;

            if (sessionStorage.getItem(storage_hash)) {
                callback(null, JSON.parse(sessionStorage.getItem(storage_hash)), true);
                return;
            }
            
            this.getMarketItemNameId(item,
                function (err, item_nameid) {
                    if (err) {
                        callback(true);
                        return;
                    }
                    
                    var currency = market.walletInfo.wallet_currency;
                    var histogramUrl = window.location.protocol + '//steamcommunity.com/market/itemordershistogram?language=english&currency=' + currency + '&item_nameid=' + item_nameid + '&two_factor=0';

                    $.get(histogramUrl,
                        function (pageHistogram) {
                            sessionStorage.setItem(storage_hash, JSON.stringify(pageHistogram));
                            callback(null, pageHistogram, false);
                        })
                     .fail(function () {
                         return callback(true);
                     });                    
                });
        } catch (e) {
            return callback(true);
        }
    };

    // Calculate the price before fees (seller price) from the buyer price
    SteamMarket.prototype.getPriceBeforeFees = function (price, item) {
        price = Math.round(price);
        // market_fee may or may not exist - this is copied from steam's code
        var publisherFee = (item && typeof item.market_fee != 'undefined') ? item.market_fee : this.walletInfo['wallet_publisher_fee_percent_default'];
        var feeInfo = CalculateFeeAmount(price, publisherFee, this.walletInfo);

        return price - feeInfo.fees;
    };

    // Calculate the buyer price from the seller price
    SteamMarket.prototype.getPriceIncludingFees = function (price, item) {
        price = Math.round(price);
        // market_fee may or may not exist - this is copied from steam's code
        var publisherFee = (item && typeof item.market_fee != 'undefined') ? item.market_fee : this.walletInfo['wallet_publisher_fee_percent_default'];
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

        if (typeof item.description !== 'undefined') {
            if (typeof item.description.market_hash_name !== 'undefined')
                return escapeURI(item.description.market_hash_name);
            if (typeof item.description.name !== 'undefined')
                return escapeURI(item.description.name);
        }

        if (typeof item.market_hash_name !== 'undefined')
            return escapeURI(item.market_hash_name);
        if (typeof item.name !== 'undefined')
            return escapeURI(item.name);

        return null;
    }

    function getIsTradingCard(item) {
        if (!item.marketable)
            return false;

        if (typeof item.tags === 'undefined')
            return false;

        var isTaggedAsTradingCard = false;
        item.tags.forEach(function (arrayItem) {
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
        item.tags.forEach(function (arrayItem) {
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

    function log(text) {
        logger.innerHTML += text + '<br/>';
    }

    function clearLog() {
        logger.innerHTML = '';
    }
    //#endregion

    //#region Inventory
    if (!isOnMarket) {

        var sellQueue = async.queue(function (task, next) {

            market.sellItem(task.item, task.sellPrice, function (err, data) {
                var digits = getNumberOfDigits(queuedItems.length);
                var itemId = task.item.assetid || task.item.id;
                var itemName = task.item.name || task.item.description.name;
                var padLeft = padLeftZero('' + (queuedItems.indexOf(itemId) + 1), digits) + ' / ' + queuedItems.length;

                if (!err) {
                    log(padLeft + ' - ' + itemName + ' added to market for ' + (market.getPriceIncludingFees(task.sellPrice) / 100.0).toFixed(2) + user_currency + '.');

                    $('#' + task.item.appid + '_' + task.item.contextid + '_' + itemId).css('background', COLOR_SUCCESS);
                } else {
                    if (typeof data.responseJSON.message != 'undefined')
                        log(padLeft + ' - ' + itemName + ' not added to market because ' + data.responseJSON.message[0].toLowerCase() + data.responseJSON.message.slice(1));
                    else
                        log(padLeft + ' - ' + itemName + ' not added to market. ');

                    $('#' + task.item.appid + '_' + task.item.contextid + '_' + itemId).css('background', COLOR_ERROR);
                }

                next();
            });
        }, 1);

        function sellAllItems(appId) {
            market.getInventory(appId, function (err, items) {
                if (err)
                    return log('Something went wrong fetching inventory, try again...');
                else {
                    var filteredItems = [];

                    items.forEach(function (item) {
                        if (!item.marketable) {
                            console.log('Skipping: ' + item.name);
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
                    return log('Something went wrong fetching inventory, try again...');
                else {
                    var filteredItems = [];

                    items.forEach(function (item) {
                        if (!getIsTradingCard(item)) {
                            console.log('Skipping: ' + item.name);
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
                    return log('Something went wrong fetching inventory, try again...');

                var filteredItems = [];

                items.forEach(function (item) {
                    if (!item.marketable) {
                        console.log('Skipping: ' + item.name);
                        return;
                    }

                    if (idsToSell.indexOf(item.id) !== -1) {
                        filteredItems.push(item);
                    }
                });

                sellItems(filteredItems);
            });
        }

        function itemQueueWorker(item, ignoreErrors, callback) {
            var priceInfo = getPriceInformationFromInventoryItem(item);

            var failed = 0;

            market.getPriceHistory(item, function (err, history, cachedHistory) {
                if (err) {
                    console.log('Failed to get price history for ' + item.name);
                    failed += 1;
                }

                market.getItemOrdersHistogram(item, function (err, listings, cachedListings) {
                    if (err) {
                        console.log('Failed to get orders histogram for ' + item.name);
                        failed += 1;
                    }

                    if (failed > 0 && !ignoreErrors) {
                        return callback(false, cachedHistory && cachedListings);
                    }

                    console.log('============================')
                    console.log(item.name);

                    var sellPrice = calculateSellPriceHistogram(history, listings, true);
                    console.log('Calculated sell price: ' + sellPrice + ' (' + market.getPriceIncludingFees(sellPrice) + ')');

                    // Item is not yet listed (or Steam is broken again), so list for maximum price.
                    if (sellPrice <= 0) {
                        sellPrice = priceInfo.maxPriceBeforeFee;
                    }

                    if (sellPrice < priceInfo.minPriceBeforeFee)
                        sellPrice = priceInfo.minPriceBeforeFee;

                    if (sellPrice > priceInfo.maxPriceBeforeFee)
                        sellPrice = priceInfo.maxPriceBeforeFee;

                    sellQueue.push({
                        item: item,
                        sellPrice: sellPrice
                    });

                    return callback(true, cachedHistory && cachedListings);
                });
            });
        }

        function sellItems(items) {
            var itemQueue = async.queue(function (item, next) {
                itemQueueWorker(item, false, function (success, cached) {
                    if (success) {
                        setTimeout(function () {
                            next();
                        }, cached ? 0 : getRandomInt(2500, 3000));
                    } else {
                        setTimeout(function () {
                            itemQueueWorker(item, true, function (success, cached) {
                                next(); // Go to the next queue item, regardless of success.
                            });
                        }, cached ? 0 : getRandomInt(45000, 60000));
                    }
                });
            }, 1);

            items = items.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

            items.forEach(function (item, index, array) {
                var itemId = item.assetid || item.id;
                if (queuedItems.indexOf(itemId) == -1) {
                    queuedItems.push(itemId);
                    itemQueue.push(item);
                }
            });
        }
    }
    //#endregion

    //#region Market
    if (isOnMarket) {

        var marketQueue = async.queue(function (listing, next) {
            marketQueueWorker(listing, false, function (success, cached) {
                if (success) {
                    setTimeout(function () {
                        next();
                    }, cached ? 0 : getRandomInt(2500, 3000));
                } else {
                    setTimeout(function () {
                        marketQueueWorker(listing, true, function (success, cached) {
                            next(); // Go to the next queue item, regardless of success.
                        });
                    }, cached ? 0 : getRandomInt(45000, 60000));
                }
            });
        }, 1);

        marketQueue.drain = function () {
            injectJs(function () {
                g_bMarketWindowHidden = false;
            })
        };

        function marketQueueWorker(listing, ignoreErrors, callback) {
            var url = $('.market_listing_item_name_link', listing).attr('href');
            var name = $('.market_listing_item_name_link', listing).text().trim();
            var game_name = $('.market_listing_game_name', listing).text().trim();
            var price = $('.market_listing_price > span:nth-child(1) > span:nth-child(1)', listing).text().trim().replace('--', '00').replace(/\D/g, '');

            var priceInfo = getPriceInformationFromListing(url, game_name);

            var appid = url.substr(0, url.lastIndexOf("/"));
            appid = appid.substr(appid.lastIndexOf("/") + 1);
            var market_hash_name = url.substr(url.lastIndexOf("/") + 1);
            var item = { appid: parseInt(appid), market_hash_name: market_hash_name };

            var failed = 0;

            market.getPriceHistory(item, function (err, history, cachedHistory) {
                if (err) {
                    console.log('Failed to get price history for ' + game_name);
                    failed += 1;
                }

                market.getItemOrdersHistogram(item, function (err, listings, cachedListings) {
                    if (err) {
                        console.log('Failed to get orders histogram for ' + game_name);
                        failed += 1;
                    }

                    if (failed > 0 && !ignoreErrors) {
                        return callback(false, cachedHistory && cachedListings);
                    }

                    console.log('============================')
                    console.log(game_name);
                    console.log('Sell price: ' + price);

                    var sellPrice = calculateSellPriceHistogram(history, listings, false);
                    console.log('Calculated sell price: ' + sellPrice + ' (' + market.getPriceIncludingFees(sellPrice) + ')');

                    if (sellPrice <= 0) { // Failed to get price; use the listed price instead.
                        sellPrice = market.getPriceBeforeFees(price);
                    }

                    if (sellPrice < priceInfo.minPriceBeforeFee)
                        sellPrice = priceInfo.minPriceBeforeFee;

                    if (sellPrice > priceInfo.maxPriceBeforeFee)
                        sellPrice = priceInfo.maxPriceBeforeFee;

                    if (market.getPriceIncludingFees(sellPrice) < price) {
                        console.log('Sell price is too high.');

                        $('.market_listing_my_price', listing).css('background', COLOR_ERROR);
                        listing.addClass('overpriced');
                    }
                    else if (market.getPriceIncludingFees(sellPrice) > price) {
                        console.log('Sell price is too low.');

                        $('.market_listing_my_price', listing).css('background', COLOR_PENDING);
                        listing.addClass('underpriced');
                    }
                    else {
                        console.log('Sell price is fair.');

                        $('.market_listing_my_price', listing).css('background', COLOR_SUCCESS);
                        listing.addClass('fair');
                    }

                    listing.addClass('price_' + market.getPriceIncludingFees(sellPrice));
                    $('.market_listing_my_price', listing).prop('title', 'Best price is ' + (market.getPriceIncludingFees(sellPrice) / 100.0) + user_currency);

                    return callback(true, cachedHistory && cachedListings);
                });
            });
        }

        var marketListings = $('.my_listing_section > .market_listing_row');
        $('.my_listing_section > .market_listing_row').each(function (index) {
            var listing = $(this);

            $('.market_listing_cancel_button', listing).after('<div class="market_listing_select" style="position: absolute;top: 16px;right: 10px;"><input type="checkbox" class="market_select_item"/></div>');

            marketQueue.push(listing);

            injectJs(function () {
                g_bMarketWindowHidden = true; // Limit the number of requests made to Steam by stopping constant polling of popular listings.
            })
        });
    }
    //#endregion

    //#region UI
    injectCss('.ui-selected { outline: 1px groove #ABABAB; } ' +
           '#logger { color: #767676; font-size: 12px;margin-top:16px; }' +
           '.market_commodity_orders_table { font-size:12px; font-family: "Motiva Sans", Sans-serif; font-weight: 300; }' +
           '.market_commodity_orders_table th { padding-left: 10px; }' +
           '#listingsGroup { display: flex; justify-content: space-between; margin-bottom: 8px; }' +
           '#listingsSell { text-align: right; color: #589328; font-weight:600; }' +
           '#listingsBuy { text-align: right; color: #589328; font-weight:600; }' +
           '.quicksellbutton { margin-right: 4px; }');

    $(document).ready(function () {
        if (!isOnMarket) {
            initializeInventoryUI();
        }

        if (isOnMarket) {
            initializeMarketUI();
        }
    });

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

            // Move scrap to bottom, this is of little interest.
            var scrap = $('#' + item_info_id + '_scrap_content');
            scrap.next().insertBefore(scrap);

            // Starting at prices are already retrieved in the table.
            $('#' + item_info_id + '_item_market_actions > div:nth-child(1) > div:nth-child(2)').remove();

            var market_hash_name = getMarketHashName(g_ActiveInventory.selectedItem);
            if (market_hash_name == null)
                return;

            var appid = g_ActiveInventory.selectedItem.appid;

            var item = { appid: parseInt(appid), market_hash_name: market_hash_name };

            if (item_info.html().indexOf('checkout/sendgift/') > -1) // Gifts have no market information.
                return;

            market.getItemOrdersHistogram(item,
                function (err, listings) {
                    if (err) {
                        console.log('Failed to get orders histogram for ' + item.name);
                        return;
                    }

                    var groupMain = $('<div id="listingsGroup">' +
                                        '<div><div id="listingsSell">Sell</div>' + listings.sell_order_table + '</div>' +
                                        '<div><div id="listingsBuy">Buy</div>' + listings.buy_order_table + '</div>' +
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
                        buttons += '<a class="item_market_action_button item_market_action_button_green quicksellbutton" id="quicksellbutton' + e + '">' +
                                        '<span class="item_market_action_button_edge item_market_action_button_left"></span>' +
                                        '<span class="item_market_action_button_contents">' + (e / 100.0) + user_currency + '</span>' +
                                        '<span class="item_market_action_button_edge item_market_action_button_right"></span>' +
                                        '<span class="item_market_action_button_preload"></span>' +
                                   '</a>'
                    });

                    $('#' + item_info_id + '_item_market_actions').append(buttons);

                    $('.quicksellbutton').on('click', function () {
                        if (queuedItems.indexOf(itemId) != -1) { // There's no need to add queued items again.
                            return;
                        }

                        var price = $(this).attr('id').replace('quicksellbutton', '');
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

    // Initialize the market UI.
    function initializeMarketUI() {
        $('.market_listing_table_header > .market_listing_edit_buttons').append('<a class="item_market_action_button item_market_action_button_green select_overpriced" style="margin-right:4px;margin-top:1px"><span class="item_market_action_button_contents" style="text-transform:none">Select overpriced</span></a>');
        $('.market_listing_table_header > .market_listing_edit_buttons').append('<a class="item_market_action_button item_market_action_button_green select_all" style="margin-right:4px;margin-top:1px"><span class="item_market_action_button_contents" style="text-transform:none">Select all</span></a>');
        $('.pick_and_sell_button').prepend('<a class="item_market_action_button item_market_action_button_green relist_overpriced" style="margin-right:3px;margin-top:1px"><span class="item_market_action_button_contents" style="text-transform:none">Relist overpriced</span></a>');
        $('.market_listing_table_header > .market_listing_edit_buttons').append('<a class="item_market_action_button item_market_action_button_green remove_selected" style="margin-top:1px"><span class="item_market_action_button_contents" style="text-transform:none">Remove selected</span></a>');

        $('.select_all').on('click', '*', function () {
            $('.market_listing_row', $(this).parent().parent().parent().parent()).each(function (index) {
                $('.market_select_item', $(this)).prop('checked', true);
            });
        });

        $('.select_overpriced').on('click', '*', function () {
            $('.market_listing_row', $(this).parent().parent().parent().parent()).each(function (index) {
                if ($(this).hasClass('overpriced'))
                    $('.market_select_item', $(this)).prop('checked', true);
            });
        });

        $('.remove_selected').on('click', '*', function () {
            var filteredItems = [];

            $('.market_listing_row', $(this).parent().parent().parent().parent()).each(function (index) {
                if ($('.market_select_item', $(this)).prop('checked')) {
                    var id = $('.market_listing_item_name', $(this)).attr('id').replace('mylisting_', '').replace('_name', '');
                    filteredItems.push(id);
                }
            });

            filteredItems.forEach(function (item, index, array) {
                setTimeout(function () {
                    market.removeListing(item, function (err, data) {
                        if (!err) {
                            $('#mylisting_' + item).css('background', COLOR_SUCCESS);
                            setTimeout(function () {
                                $('#mylisting_' + item).remove();
                            }, 3000);
                        } else
                            $('#mylisting_' + item).css('background', COLOR_ERROR);
                    });

                }, getRandomInt(500 * index, (500 * index) + 250)); // Have some healthy delay or steam will block you for flooding.
            });
        });

        $('.relist_overpriced').on('click', '*', function () {
            var items = async.queue(function (item, next) {
                market.removeListing(item.listing, function (err, data) {
                    if (!err) {
                        $('#mylisting_' + item.listing).css('background', COLOR_PENDING);
                        var timeout = getRandomInt(3000, 3500);

                        setTimeout(function () {
                            market.sellItem(item, market.getPriceBeforeFees(item.sellPrice),
                            function (err2) {
                                if (!err2) {
                                    $('#mylisting_' + item.listing).css('background', COLOR_SUCCESS);
                                    setTimeout(function () {
                                        $('#mylisting_' + item.listing).remove();
                                    }, timeout);
                                } else {
                                    $('#mylisting_' + item.listing).css('background', COLOR_ERROR);
                                }

                                setTimeout(function () {
                                    $('#mylisting_' + item.listing).remove();
                                    next();
                                }, timeout);
                            });
                        });
                    } else {
                        setTimeout(function () {
                            $('#mylisting_' + item.listing).css('background', COLOR_ERROR);
                            next();
                        }, getRandomInt(3000, 3500));
                    }
                });
            }, 1);

            $('.market_listing_row', $(this).parent().parent().parent().parent()).each(function (index) {
                if ($(this).hasClass('overpriced')) {
                    var id = $('.market_listing_item_name', $(this)).attr('id').replace('mylisting_', '').replace('_name', '');
                    var listingUrl = $('.item_market_action_button_edit', $(this)).first().attr('href');
                    var listingUrlParts = listingUrl.split(',');
                    var assetid = replaceNonNumbers(listingUrlParts.pop());
                    var contextid = replaceNonNumbers(listingUrlParts.pop());
                    var appid = replaceNonNumbers(listingUrlParts.pop());
                    var price = parseInt($(this).attr('class').split(' ').pop().replace('price_', ''));

                    items.push({
                        listing: id,
                        assetid: assetid,
                        contextid: contextid,
                        appid: appid,
                        sellPrice: price
                    });
                }
            });
        });
    }

    // Update the inventory UI.
    function updateInventoryUI() {
        // Remove previous containers (e.g., when a user changes inventory).
        $('#inventorySellButtons').remove();
        $('#inventoryPriceButtons').remove();
        $('#inventoryReloadButton').remove();

        var isSteamInventory = $('.games_list_tabs .active').attr('href').endsWith('#753');


        // Initialize the extra buttons.
        var priceButtons = $('<div id="inventoryPriceButtons">' +
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
                                        'Minimum:&nbsp;<input class="priceInput" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_NORMAL_PRICE + '" value=' + getSetting(SETTING_MIN_NORMAL_PRICE) + '>&nbsp;' +
                                        'Maximum:&nbsp;<input class="priceInput" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_NORMAL_PRICE + '" value=' + getSetting(SETTING_MAX_NORMAL_PRICE) + '>&nbsp;for normal cards' +
                                        '<br/>' +
                                    '</div>' +
                                    '<div style="margin-bottom:6px;">' +
                                        'Minimum:&nbsp;<input class="priceInput" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_FOIL_PRICE + '" value=' + getSetting(SETTING_MIN_FOIL_PRICE) + '>&nbsp;' +
                                        'Maximum:&nbsp;<input class="priceInput" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_FOIL_PRICE + '" value=' + getSetting(SETTING_MAX_FOIL_PRICE) + '>&nbsp;for foil cards' +
                                        '<br/>' +
                                    '</div>' +
                                    '<div>' +
                                        'Minimum:&nbsp;<input class="priceInput" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_MISC_PRICE + '" value=' + getSetting(SETTING_MIN_MISC_PRICE) + '>&nbsp;' +
                                        'Maximum:&nbsp;<input class="priceInput" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_MISC_PRICE + '" value=' + getSetting(SETTING_MAX_MISC_PRICE) + '>&nbsp;for items' +
                                        '<br/>' +
                                    '</div>' :
                                    '<div style="margin-bottom:6px;margin-top:6px">' +
                                        'Minimum:&nbsp;<input class="priceInput" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_MISC_PRICE + '" value=' + getSetting(SETTING_MIN_MISC_PRICE) + '>&nbsp;' +
                                        'Maximum:&nbsp;<input class="priceInput" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_MISC_PRICE + '" value=' + getSetting(SETTING_MAX_MISC_PRICE) + '>&nbsp;for items' +
                                        '<br/>' +
                                    '</div>'
                                    ) +
                                '</div>' +
                           '</div>');

        var sellButtons = $('<div id="inventorySellButtons" style="margin-bottom:12px;">' +
                                '<a class="btn_green_white_innerfade btn_medium_wide sellall"><span>Sell All Items</span></a>&nbsp;&nbsp;&nbsp;' +
                                '<a class="btn_green_white_innerfade btn_medium_wide sellselected"><span>Sell Selected Items</span></a>&nbsp;&nbsp;&nbsp;' +
                                (isSteamInventory ? '<a class="btn_darkblue_white_innerfade btn_medium_wide sellallcards"><span>Sell All Cards</span></a>&nbsp;&nbsp;&nbsp;' : '') +
                            '</div>');

        var reloadButton = $('<a id="inventoryReloadButton" class="btn_darkblue_white_innerfade btn_medium_wide reloadinventory" style="margin-right:12px"><span>Reload Inventory</span></a>');

        $('#inventory_logos')[0].style.height = 'auto';

        $('#inventory_applogo').hide(); // Hide the Steam/game logo, we don't need to see it twice.
        $('#inventory_applogo').after(logger);
        $('#inventory_applogo').after(priceButtons);
        $('#inventory_applogo').after(sellButtons);

        $('.inventory_rightnav').prepend(reloadButton);


        // Add bindings to all extra buttons.
        $('.sellall').on('click', '*', function () {
            var appId = $('.games_list_tabs .active')[0].hash.replace(/^#/, '');
            sellAllItems(appId);
        });
        $('.sellselected').on('click', '*', sellSelectedItems);
        $('.sellallcards').on('click', '*', sellAllCards);

        $('.reloadinventory').on('click', '*', function () {
            window.location.reload();
        });

        $('.priceInput').change(function () {
            setSetting(SETTING_MIN_NORMAL_PRICE, $('#' + SETTING_MIN_NORMAL_PRICE).val());
            setSetting(SETTING_MAX_NORMAL_PRICE, $('#' + SETTING_MAX_NORMAL_PRICE).val());
            setSetting(SETTING_MIN_FOIL_PRICE, $('#' + SETTING_MIN_FOIL_PRICE).val());
            setSetting(SETTING_MAX_FOIL_PRICE, $('#' + SETTING_MAX_FOIL_PRICE).val());
            setSetting(SETTING_MIN_MISC_PRICE, $('#' + SETTING_MIN_MISC_PRICE).val());
            setSetting(SETTING_MAX_MISC_PRICE, $('#' + SETTING_MAX_MISC_PRICE).val());
        });

        $('#inventoryPriceButtons').accordion({
            collapsible: true,
            active: true,
        });
    }

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
    //#endregion
})(jQuery, async, g_rgAppContextData, typeof g_strInventoryLoadURL !== 'undefined' ? g_strInventoryLoadURL : location.protocol + '//steamcommunity.com/my/inventory', g_rgWalletInfo);
