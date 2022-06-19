//#region Market
if (currentPage == PAGE_MARKET || currentPage == PAGE_MARKET_LISTING) {
    var marketListingsRelistedAssets = [];

    var marketListingsQueue = async.queue(function(listing, next) {
        marketListingsQueueWorker(listing,
            false,
            function(success, cached) {
                if (success) {
                    setTimeout(function() {
                            next();
                        },
                        cached ? 0 : getRandomInt(1000, 1500));
                } else {
                    setTimeout(function() {
                            marketListingsQueueWorker(listing,
                                true,
                                function(success, cached) {
                                    next(); // Go to the next queue item, regardless of success.
                                });
                        },
                        cached ? 0 : getRandomInt(30000, 45000));
                }
            });
    }, 1);

    marketListingsQueue.drain = function() {
        injectJs(function() {
            g_bMarketWindowHidden = false;
        })
    };

    // Gets the price, in cents, from a market listing.
    function getPriceFromMarketListing(listing) {
        var priceLabel = listing.trim().replace('--', '00');

        // Fixes RUB, which has a dot at the end.
        if (priceLabel[priceLabel.length - 1] === '.' || priceLabel[priceLabel.length - 1] === ",")
            priceLabel = priceLabel.slice(0, -1);

        // For round numbers (e.g., 100 EUR).
        if (priceLabel.indexOf('.') === -1 && priceLabel.indexOf(',') === -1) {
            priceLabel = priceLabel + ',00';
        }

        return parseInt(replaceNonNumbers(priceLabel));
    }

    function marketListingsQueueWorker(listing, ignoreErrors, callback) {
        var asset = unsafeWindow.g_rgAssets[listing.appid][listing.contextid][listing.assetid];

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
        var price = getPriceFromMarketListing($('.market_listing_price > span:nth-child(1) > span:nth-child(1)', listingUI).text());

        if (price <= getSettingWithDefault(SETTING_PRICE_MIN_CHECK_PRICE) * 100) {
            $('.market_listing_my_price', listingUI).last().css('background', COLOR_PRICE_NOT_CHECKED);
            $('.market_listing_my_price', listingUI).last().prop('title', 'The price is not checked.');
            listingUI.addClass('not_checked');
          
            return callback(true, true);
        }

        var priceInfo = getPriceInformationFromItem(asset);
        var item = {
            appid: parseInt(appid),
            description: {
                market_hash_name: market_hash_name
            }
        };

        var failed = 0;

        market.getPriceHistory(item,
            true,
            function(errorPriceHistory, history, cachedHistory) {
                if (errorPriceHistory) {
                    logConsole('Failed to get price history for ' + game_name);

                    if (errorPriceHistory == ERROR_FAILED)
                        failed += 1;
                }

                market.getItemOrdersHistogram(item,
                    true,
                    function(errorHistogram, histogram, cachedListings) {
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
                        var highestBuyOrderPrice = (histogram == null || histogram.highest_buy_order == null ?
                            '-' :
                            ((histogram.highest_buy_order / 100) + currencySymbol));
                        $('.market_table_value > span:nth-child(1) > span:nth-child(1) > span:nth-child(1)',
                            listingUI).append(' ➤ <span title="This is likely the highest buy order price.">' +
                            highestBuyOrderPrice +
                            '</span>');

                        logConsole('============================')
                        logConsole(JSON.stringify(listing));
                        logConsole(game_name + ': ' + asset.name);
                        logConsole('Current price: ' + price / 100.0);

                        // Calculate two prices here, one without the offset and one with the offset.
                        // The price without the offset is required to not relist the item constantly when you have the lowest price (i.e., with a negative offset).
                        // The price with the offset should be used for relisting so it will still apply the user-set offset.

                        var sellPriceWithoutOffset = calculateSellPriceBeforeFees(history,
                            histogram,
                            false,
                            priceInfo.minPriceBeforeFees,
                            priceInfo.maxPriceBeforeFees);
                        var sellPriceWithOffset = calculateSellPriceBeforeFees(history,
                            histogram,
                            true,
                            priceInfo.minPriceBeforeFees,
                            priceInfo.maxPriceBeforeFees);

                        var sellPriceWithoutOffsetWithFees = market.getPriceIncludingFees(sellPriceWithoutOffset);

                        logConsole('Calculated price: ' +
                            sellPriceWithoutOffsetWithFees / 100.0 +
                            ' (' +
                            sellPriceWithoutOffset / 100.0 +
                            ')');

                        listingUI.addClass('price_' + sellPriceWithOffset);

                        $('.market_listing_my_price', listingUI).last().prop('title',
                            'The best price is ' + (sellPriceWithoutOffsetWithFees / 100.0) + currencySymbol + '.');

                        if (sellPriceWithoutOffsetWithFees < price) {
                            logConsole('Sell price is too high.');

                            $('.market_listing_my_price', listingUI).last()
                                .css('background', COLOR_PRICE_EXPENSIVE);
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
                    });
            });
    }

    var marketOverpricedQueue = async.queue(function(item, next) {
            marketOverpricedQueueWorker(item,
                false,
                function(success) {
                    if (success) {
                        setTimeout(function() {
                                next();
                            },
                            getRandomInt(1000, 1500));
                    } else {
                        setTimeout(function() {
                                marketOverpricedQueueWorker(item,
                                    true,
                                    function(success) {
                                        next(); // Go to the next queue item, regardless of success.
                                    });
                            },
                            getRandomInt(30000, 45000));
                    }
                });
        },
        1);

    function marketOverpricedQueueWorker(item, ignoreErrors, callback) {
        var listingUI = getListingFromLists(item.listing).elm;

        market.removeListing(item.listing,
            function(errorRemove, data) {
                if (!errorRemove) {
                    $('.actual_content', listingUI).css('background', COLOR_PENDING);

                    setTimeout(function() {
                        var baseUrl = $('.header_notification_items').first().attr('href') + 'json/';
                        var itemName = $('.market_listing_item_name_link', listingUI).first().attr('href');
                        var marketHashNameIndex = itemName.lastIndexOf('/') + 1;
                        var marketHashName = itemName.substring(marketHashNameIndex);
                        var decodedMarketHashName = decodeURIComponent(itemName.substring(marketHashNameIndex));
                        var newAssetId = -1;

                        unsafeWindow.RequestFullInventory(baseUrl + item.appid + "/" + item.contextid + "/", {}, null, null, function(transport) {
                            if (transport.responseJSON && transport.responseJSON.success) {
                                var inventory = transport.responseJSON.rgInventory;

                                for (var child in inventory) {
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

                                market.sellItem(item,
                                    item.sellPrice,
                                    function(errorSell) {
                                        if (!errorSell) {
                                            $('.actual_content', listingUI).css('background', COLOR_SUCCESS);

                                            setTimeout(function() {
                                                removeListingFromLists(item.listing)
                                            }, 3000);

                                            return callback(true);
                                        } else {
                                            $('.actual_content', listingUI).css('background', COLOR_ERROR);
                                            return callback(false);
                                        }
                                    });

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
            marketOverpricedQueue.push({
                listing: listingid,
                assetid: assetInfo.assetid,
                contextid: assetInfo.contextid,
                appid: assetInfo.appid,
                sellPrice: price
            });
        }
    }

    var marketRemoveQueue = async.queue(function(listingid, next) {
            marketRemoveQueueWorker(listingid,
                false,
                function(success) {
                    if (success) {
                        setTimeout(function() {
                                next();
                            },
                            getRandomInt(50, 100));
                    } else {
                        setTimeout(function() {
                                marketRemoveQueueWorker(listingid,
                                    true,
                                    function(success) {
                                        next(); // Go to the next queue item, regardless of success.
                                    });
                            },
                            getRandomInt(30000, 45000));
                    }
                });
        },
        10);

    function marketRemoveQueueWorker(listingid, ignoreErrors, callback) {
        var listingUI = getListingFromLists(listingid).elm;

        market.removeListing(listingid,
            function(errorRemove, data) {
                if (!errorRemove) {
                    $('.actual_content', listingUI).css('background', COLOR_SUCCESS);

                    setTimeout(function() {
                            removeListingFromLists(listingid);

                            var numberOfListings = marketLists[0].size;
                            if (numberOfListings > 0) {
                                $('#my_market_selllistings_number').text((numberOfListings).toString());

                                // This seems identical to the number of sell listings.
                                $('#my_market_activelistings_number').text((numberOfListings).toString());
                            }
                        },
                        3000);

                    return callback(true);
                } else {
                    $('.actual_content', listingUI).css('background', COLOR_ERROR);

                    return callback(false);
                }
            });
    }

    var marketListingsItemsQueue = async.queue(function(listing, next) {
            $.get(window.location.protocol + '//steamcommunity.com/market/mylistings?count=100&start=' + listing,
                    function(data) {
                        if (!data || !data.success) {
                            next();
                            return;
                        }

                        var myMarketListings = $('#tabContentsMyActiveMarketListingsRows');

                        var nodes = $.parseHTML(data.results_html);
                        var rows = $('.market_listing_row', nodes);
                        myMarketListings.append(rows);

                        // g_rgAssets
                        unsafeWindow.MergeWithAssetArray(data.assets); // This is a method from Steam.

                        next();
                    },
                    'json')
                .fail(function(data) {
                    next();
                    return;
                });
        },
        1);

    marketListingsItemsQueue.drain = function() {
        var myMarketListings = $('#tabContentsMyActiveMarketListingsRows');
        myMarketListings.checkboxes('range', true);

        // Sometimes the Steam API is returning duplicate entries (especially during item listing), filter these.
        var seen = {};
        $('.market_listing_row', myMarketListings).each(function() {
            var item_id = $(this).attr('id');
            if (seen[item_id])
                $(this).remove();
            else
                seen[item_id] = true;

            // Remove listings awaiting confirmations, they are already listed separately.
            if ($('.item_market_action_button', this).attr('href').toLowerCase()
                .includes('CancelMarketListingConfirmation'.toLowerCase()))
                $(this).remove();

            // Remove buy order listings, they are already listed separately.
            if ($('.item_market_action_button', this).attr('href').toLowerCase()
                .includes('CancelMarketBuyOrder'.toLowerCase()))
                $(this).remove();
        });

        // Now add the market checkboxes.
        addMarketCheckboxes();

        // Show the listings again, rendering is done.
        $('#market_listings_spinner').remove();
        myMarketListings.show();

        fillMarketListingsQueue();

        injectJs(function() {
            g_bMarketWindowHidden =
                true; // Limits the number of requests made to steam by stopping constant polling of popular listings.
        });
    };


    function fillMarketListingsQueue() {
        $('.market_home_listing_table').each(function(e) {

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

        var totalPriceBuyer = 0;
        var totalPriceSeller = 0;
        // Add the listings to the queue to be checked for the price.
        for (var i = 0; i < marketLists.length; i++) {
            for (var j = 0; j < marketLists[i].items.length; j++) {
                var listingid = replaceNonNumbers(marketLists[i].items[j].values().market_listing_item_name);
                var assetInfo = getAssetInfoFromListingId(listingid);

                if (!isNaN(assetInfo.priceBuyer))
                    totalPriceBuyer += assetInfo.priceBuyer;
                if (!isNaN(assetInfo.priceSeller))
                    totalPriceSeller += assetInfo.priceSeller;

                marketListingsQueue.push({
                    listingid,
                    appid: assetInfo.appid,
                    contextid: assetInfo.contextid,
                    assetid: assetInfo.assetid
                });
            }
        }

        $('#my_market_selllistings_number').append('<span id="my_market_sellistings_total_price">, ' + (totalPriceBuyer / 100.0).toFixed(2) + currencySymbol + ' ➤ ' + (totalPriceSeller / 100.0).toFixed(2) + currencySymbol + '</span>');
    }


    // Gets the asset info (appid/contextid/assetid) based on a listingid.
    function getAssetInfoFromListingId(listingid) {
        var listing = getListingFromLists(listingid);
        if (listing == null) {
            return {};
        }

        var actionButton = $('.item_market_action_button', listing.elm).attr('href');
        // Market buy orders have no asset info.
        if (actionButton == null || actionButton.toLowerCase().includes('cancelmarketbuyorder'))
            return {};

        var priceBuyer = getPriceFromMarketListing($('.market_listing_price > span:nth-child(1) > span:nth-child(1)', listing.elm).text());
        var priceSeller = getPriceFromMarketListing($('.market_listing_price > span:nth-child(1) > span:nth-child(3)', listing.elm).text());
        var itemIds = actionButton.split(',');
        var appid = replaceNonNumbers(itemIds[2]);
        var contextid = replaceNonNumbers(itemIds[3]);
        var assetid = replaceNonNumbers(itemIds[4]);
        return {
            appid,
            contextid,
            assetid,
            priceBuyer,
            priceSeller
        };
    }

    // Adds pagination and search options to the market item listings.
    function addMarketPagination(market_listing_see) {
        market_listing_see.addClass('list');

        market_listing_see.before('<ul class="paginationTop pagination"></ul>');
        market_listing_see.after('<ul class="paginationBottom pagination"></ul>');

        $('.market_listing_table_header', market_listing_see.parent())
            .append('<input class="search" id="market_name_search" placeholder="Search..." />');

        var options = {
            valueNames: [
                'market_listing_game_name', 'market_listing_item_name_link', 'market_listing_price',
                'market_listing_listed_date', {
                    name: 'market_listing_item_name',
                    attr: 'id'
                }
            ],
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
        list.on('searchComplete', updateMarketSelectAllButton);
        marketLists.push(list);
    }

    // Adds checkboxes to market listings.
    function addMarketCheckboxes() {
        $('.market_listing_row').each(function() {
            // Don't add it again, one time is enough.
            if ($('.market_listing_select', this).length == 0) {
                $('.market_listing_cancel_button', $(this)).append('<div class="market_listing_select">' +
                    '<input type="checkbox" class="market_select_item"/>' +
                    '</div>');

                $('.market_select_item', this).change(function(e) {
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
            var currentCount = 0;
            var totalCount = 0;

            if (typeof unsafeWindow.g_oMyListings !== 'undefined' && unsafeWindow.g_oMyListings != null && unsafeWindow.g_oMyListings.m_cTotalCount != null)
                totalCount = unsafeWindow.g_oMyListings.m_cTotalCount;
            else {
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
            $('.market_home_listing_table').each(function(e) {
                // Not on 'x requests to buy at y,yy or lower'.
                if ($('#market_buyorder_info_show_details', $(this)).length > 0)
                    return;

                $(this).children().last().addClass("market_listing_see");

                addMarketPagination($('.market_listing_see', this).last());
                sortMarketListings($(this), false, false, true);
            });

            $('#tabContentsMyActiveMarketListingsRows > .market_listing_row').each(function() {
                var listingid = $(this).attr('id').replace('mylisting_', '').replace('mybuyorder_', '').replace('mbuyorder_', '');
                var assetInfo = getAssetInfoFromListingId(listingid);

                // There's only one item in the g_rgAssets on a market listing page.
                var existingAsset = null;
                for (var appid in unsafeWindow.g_rgAssets) {
                    for (var contextid in unsafeWindow.g_rgAssets[appid]) {
                        for (var assetid in unsafeWindow.g_rgAssets[appid][contextid]) {
                            existingAsset = unsafeWindow.g_rgAssets[appid][contextid][assetid];
                            break;
                        }
                    }
                }

                // appid and contextid are identical, only the assetid is different for each asset.
                unsafeWindow.g_rgAssets[appid][contextid][assetInfo.assetid] = existingAsset;
                marketListingsQueue.push({
                    listingid,
                    appid: assetInfo.appid,
                    contextid: assetInfo.contextid,
                    assetid: assetInfo.assetid
                });
            })
        }
    }

    // Update the select/deselect all button on the market.
    function updateMarketSelectAllButton() {
        $('.market_listing_buttons').each(function() {
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
        if (list == null) {
            console.log('Invalid parameter, could not find a list matching elem.');
            return;
        }

        // Change sort order (asc/desc).
        var nextSort = isPrice ? 1 : (isDate ? 2 : 3);
        var asc = true;

        // (Re)set the asc/desc arrows.
        const arrow_down = '🡻';
        const arrow_up = '🡹';

        $('.market_listing_table_header > span', elem).each(function() {
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

        if (list.sort == null)
            return;

        if (isName) {
            list.sort('', {
                order: asc ? "asc" : "desc",
                sortFunction: function(a, b) {
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
            var currentMonth = DateTime.local().month;

            list.sort('market_listing_listed_date', {
                order: asc ? "asc" : "desc",
                sortFunction: function(a, b) {
                    var firstDate = DateTime.fromString((a.values().market_listing_listed_date).trim(), 'd MMM');
                    var secondDate = DateTime.fromString((b.values().market_listing_listed_date).trim(), 'd MMM');

                    if (firstDate == null || secondDate == null) {
                        return 0;
                    }

                    if (firstDate.month > currentMonth)
                        firstDate = firstDate.plus({ years: -1});
                    if (secondDate.month > currentMonth)
                        secondDate = secondDate.plus({ years: -1});

                    if (firstDate > secondDate)
                        return 1;
                    if (firstDate === secondDate)
                        return 0;
                    return -1;
                }
            })
        } else if (isPrice) {
            list.sort('market_listing_price', {
                order: asc ? "asc" : "desc",
                sortFunction: function(a, b) {
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
            if (values != null && values.length > 0) {
                return values[0];
            }

            values = marketLists[i].get("market_listing_item_name", 'mbuyorder_' + listingid + '_name');
            if (values != null && values.length > 0) {
                return values[0];
            }
        }


    }

    function removeListingFromLists(listingid) {
        for (var i = 0; i < marketLists.length; i++) {
            marketLists[i].remove("market_listing_item_name", 'mylisting_' + listingid + '_name');
            marketLists[i].remove("market_listing_item_name", 'mbuyorder_' + listingid + '_name');
        }
    }

    // Initialize the market UI.
    function initializeMarketUI() {
        // Sell orders.
        $('.my_market_header').first().append(
            '<div class="market_listing_buttons">' +
            '<a class="item_market_action_button item_market_action_button_green select_all market_listing_button">' +
            '<span class="item_market_action_button_contents" style="text-transform:none">Select all</span>' +
            '</a>' +
            '<span class="separator-small"></span>' +
            '<a class="item_market_action_button item_market_action_button_green remove_selected market_listing_button">' +
            '<span class="item_market_action_button_contents" style="text-transform:none">Remove selected</span>' +
            '</a>' +
            '<a class="item_market_action_button item_market_action_button_green relist_selected market_listing_button market_listing_button_right">' +
            '<span class="item_market_action_button_contents" style="text-transform:none">Relist selected</span>' +
            '</a>' +
            '<span class="separator-small"></span>' +
            '<a class="item_market_action_button item_market_action_button_green relist_overpriced market_listing_button market_listing_button_right">' +
            '<span class="item_market_action_button_contents" style="text-transform:none">Relist overpriced</span>' +
            '</a>' +
            '<span class="separator-small"></span>' +
            '<a class="item_market_action_button item_market_action_button_green select_overpriced market_listing_button market_listing_button_right">' +
            '<span class="item_market_action_button_contents" style="text-transform:none">Select overpriced</span>' +
            '</a>' +
            '</div>');

        // Listings confirmations and buy orders.
        $('.my_market_header').slice(1).append(
            '<div class="market_listing_buttons">' +
            '<a class="item_market_action_button item_market_action_button_green select_all market_listing_button">' +
            '<span class="item_market_action_button_contents" style="text-transform:none">Select all</span>' +
            '</a>' +
            '<span class="separator-large"></span>' +
            '<a class="item_market_action_button item_market_action_button_green remove_selected market_listing_button">' +
            '<span class="item_market_action_button_contents" style="text-transform:none">Remove selected</span>' +
            '</a>' +
            '</div>');

        $('.market_listing_table_header').on('click', 'span', function() {
            if ($(this).hasClass('market_listing_edit_buttons') || $(this).hasClass('item_market_action_button_contents'))
                return;

            var isPrice = $('.market_listing_table_header', $(this).parent().parent()).children().eq(1).text() == $(this).text();
            var isDate = $('.market_listing_table_header', $(this).parent().parent()).children().eq(2).text() == $(this).text();
            var isName = $('.market_listing_table_header', $(this).parent().parent()).children().eq(3).text() == $(this).text();

            sortMarketListings($(this).parent().parent(), isPrice, isDate, isName);
        });

        $('.select_all').on('click', '*', function() {
            var selectionGroup = $(this).parent().parent().parent().parent();
            var marketList = getListFromContainer(selectionGroup);

            var invert = $('.market_select_item:checked', selectionGroup).length == $('.market_select_item', selectionGroup).length;

            for (var i = 0; i < marketList.matchingItems.length; i++) {
                $('.market_select_item', marketList.matchingItems[i].elm).prop('checked', !invert);
            }

            updateMarketSelectAllButton();
        });


        $('#market_removelisting_dialog_accept').on('click', '*', function() {
            // This is when a user removed an item through the Remove/Cancel button.
            // Ideally, it should remove this item from the list (instead of just the UI element which Steam does), but I'm not sure how to get the current item yet.
            window.location.reload();
        });

        $('.select_overpriced').on('click', '*', function() {
            var selectionGroup = $(this).parent().parent().parent().parent();
            var marketList = getListFromContainer(selectionGroup);

            for (var i = 0; i < marketList.matchingItems.length; i++) {
                if ($(marketList.matchingItems[i].elm).hasClass('overpriced')) {
                    $('.market_select_item', marketList.matchingItems[i].elm).prop('checked', true);
                }
            }

            $('.market_listing_row', selectionGroup).each(function(index) {
                if ($(this).hasClass('overpriced'))
                    $('.market_select_item', $(this)).prop('checked', true);
            });

            updateMarketSelectAllButton();
        });

        $('.remove_selected').on('click', '*', function() {
            var selectionGroup = $(this).parent().parent().parent().parent();
            var marketList = getListFromContainer(selectionGroup);

            for (var i = 0; i < marketList.matchingItems.length; i++) {
                if ($('.market_select_item', $(marketList.matchingItems[i].elm)).prop('checked')) {
                    var listingid = replaceNonNumbers(marketList.matchingItems[i].values().market_listing_item_name);
                    marketRemoveQueue.push(listingid);
                }
            }
        });

        $('.market_relist_auto').change(function() {
            setSetting(SETTING_RELIST_AUTOMATICALLY, $('.market_relist_auto').is(":checked") ? 1 : 0);
        });

        $('.relist_overpriced').on('click', '*', function() {
            var selectionGroup = $(this).parent().parent().parent().parent();
            var marketList = getListFromContainer(selectionGroup);

            for (var i = 0; i < marketList.matchingItems.length; i++) {
                if ($(marketList.matchingItems[i].elm).hasClass('overpriced')) {
                    var listingid = replaceNonNumbers(marketList.matchingItems[i].values().market_listing_item_name);
                    queueOverpricedItemListing(listingid);
                }
            }
        });

        $('.relist_selected').on('click', '*', function() {
            var selectionGroup = $(this).parent().parent().parent().parent();
            var marketList = getListFromContainer(selectionGroup);

            for (var i = 0; i < marketList.matchingItems.length; i++) {
                if ($(marketList.matchingItems[i].elm).hasClass('overpriced') && $('.market_select_item', $(marketList.matchingItems[i].elm)).prop('checked')) {
                    var listingid = replaceNonNumbers(marketList.matchingItems[i].values().market_listing_item_name);
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
//#region Steam Market

    // Sell an item with a price in cents.
    // Price is before fees.
    SteamMarket.prototype.sellItem = function(item, price, callback /*err, data*/ ) {
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
            success: function(data) {
                if (data.success === false && isRetryMessage(data.message)) {
                    callback(ERROR_FAILED, data);
                } else {
                    callback(ERROR_SUCCESS, data);
                }
            },
            error: function(data) {
                return callback(ERROR_FAILED, data);
            },
            crossDomain: true,
            xhrFields: {
                withCredentials: true
            },
            dataType: 'json'
        });
    };

    // Removes an item.
    // Item is the unique item id.
    SteamMarket.prototype.removeListing = function(item, callback /*err, data*/ ) {
        var sessionId = readCookie('sessionid');
        $.ajax({
            type: "POST",
            url: window.location.protocol + '//steamcommunity.com/market/removelisting/' + item,
            data: {
                sessionid: sessionId
            },
            success: function(data) {
                callback(ERROR_SUCCESS, data);
            },
            error: function() {
                return callback(ERROR_FAILED);
            },
            crossDomain: true,
            xhrFields: {
                withCredentials: true
            },
            dataType: 'json'
        });
    };

    // Get the price history for an item.
    //
    // PriceHistory is an array of prices in the form [data, price, number sold].
    // Example: [["Fri, 19 Jul 2013 01:00:00 +0000",7.30050206184,362]]
    // Prices are ordered by oldest to most recent.
    // Price is inclusive of fees.
    SteamMarket.prototype.getPriceHistory = function(item, cache, callback) {
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
                    .then(function(value) {
                        if (value != null)
                            callback(ERROR_SUCCESS, value, true);
                        else
                            market.getCurrentPriceHistory(appid, market_name, callback);
                    })
                    .catch(function(error) {
                        market.getCurrentPriceHistory(appid, market_name, callback);
                    });
            } else
                market.getCurrentPriceHistory(appid, market_name, callback);
        } catch (e) {
            return callback(ERROR_FAILED);
        }
    };

    SteamMarket.prototype.getGooValue = function(item, callback) {
        try {
            var sessionId = readCookie('sessionid');
            $.ajax({
                type: "GET",
                url: this.inventoryUrlBase + 'ajaxgetgoovalue/',
                data: {
                    sessionid: sessionId,
                    appid: item.market_fee_app,
                    assetid: item.assetid,
                    contextid: item.contextid
                },
                success: function(data) {
                    callback(ERROR_SUCCESS, data);
                },
                error: function(data) {
                    return callback(ERROR_FAILED, data);
                },
                crossDomain: true,
                xhrFields: {
                    withCredentials: true
                },
                dataType: 'json'
            });
        } catch (e) {
            return callback(ERROR_FAILED);
        }
        //http://steamcommunity.com/auction/ajaxgetgoovalueforitemtype/?appid=582980&item_type=18&border_color=0
        // OR
        //http://steamcommunity.com/my/ajaxgetgoovalue/?sessionid=xyz&appid=535690&assetid=4830605461&contextid=6
        //sessionid=xyz
        //appid = 535690
        //assetid = 4830605461
        //contextid = 6
    }


    // Grinds the item into gems.
    SteamMarket.prototype.grindIntoGoo = function(item, callback) {
        try {
            var sessionId = readCookie('sessionid');
            $.ajax({
                type: "POST",
                url: this.inventoryUrlBase + 'ajaxgrindintogoo/',
                data: {
                    sessionid: sessionId,
                    appid: item.market_fee_app,
                    assetid: item.assetid,
                    contextid: item.contextid,
                    goo_value_expected: item.goo_value_expected
                },
                success: function(data) {
                    callback(ERROR_SUCCESS, data);
                },
                error: function(data) {
                    return callback(ERROR_FAILED, data);
                },
                crossDomain: true,
                xhrFields: {
                    withCredentials: true
                },
                dataType: 'json'
            });
        } catch (e) {
            return callback(ERROR_FAILED);
        }

        //sessionid = xyz
        //appid = 535690
        //assetid = 4830605461
        //contextid = 6
        //goo_value_expected = 10
        //http://steamcommunity.com/my/ajaxgrindintogoo/
    }


    // Unpacks the booster pack.
    SteamMarket.prototype.unpackBoosterPack = function(item, callback) {
        try {
            var sessionId = readCookie('sessionid');
            $.ajax({
                type: "POST",
                url: this.inventoryUrlBase + 'ajaxunpackbooster/',
                data: {
                    sessionid: sessionId,
                    appid: item.market_fee_app,
                    communityitemid: item.assetid
                },
                success: function(data) {
                    callback(ERROR_SUCCESS, data);
                },
                error: function(data) {
                    return callback(ERROR_FAILED, data);
                },
                crossDomain: true,
                xhrFields: {
                    withCredentials: true
                },
                dataType: 'json'
            });
        } catch (e) {
            return callback(ERROR_FAILED);
        }

        //sessionid = xyz
        //appid = 535690
        //communityitemid = 4830605461
        //http://steamcommunity.com/my/ajaxunpackbooster/
    }

    // Get the current price history for an item.
    SteamMarket.prototype.getCurrentPriceHistory = function(appid, market_name, callback) {
        var url = window.location.protocol +
            '//steamcommunity.com/market/pricehistory/?appid=' +
            appid +
            '&market_hash_name=' +
            market_name;

        $.get(url,
                function(data) {
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
                },
                'json')
            .fail(function(data) {
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
    SteamMarket.prototype.getMarketItemNameId = function(item, callback) {
        try {
            var market_name = getMarketHashName(item);
            if (market_name == null) {
                callback(ERROR_FAILED);
                return;
            }

            var appid = item.appid;
            var storage_hash = 'itemnameid_' + appid + '+' + market_name;

            storagePersistent.getItem(storage_hash)
                .then(function(value) {
                    if (value != null)
                        callback(ERROR_SUCCESS, value);
                    else
                        return market.getCurrentMarketItemNameId(appid, market_name, callback);
                })
                .catch(function(error) {
                    return market.getCurrentMarketItemNameId(appid, market_name, callback);
                });
        } catch (e) {
            return callback(ERROR_FAILED);
        }
    }

    // Get the item name id from a market item.
    SteamMarket.prototype.getCurrentMarketItemNameId = function(appid, market_name, callback) {
        var url = window.location.protocol + '//steamcommunity.com/market/listings/' + appid + '/' + market_name;
        $.get(url,
                function(page) {
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
            .fail(function(e) {
                return callback(ERROR_FAILED, e.status);
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
    SteamMarket.prototype.getItemOrdersHistogram = function(item, cache, callback) {
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
                    .then(function(value) {
                        if (value != null)
                            callback(ERROR_SUCCESS, value, true);
                        else {
                            market.getCurrentItemOrdersHistogram(item, market_name, callback);
                        }
                    })
                    .catch(function(error) {
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
    SteamMarket.prototype.getCurrentItemOrdersHistogram = function(item, market_name, callback) {
        market.getMarketItemNameId(item,
            function(error, item_nameid) {
                if (error) {
                    if (item_nameid != 429) // 429 = Too many requests made.
                        callback(ERROR_DATA);
                    else
                        callback(ERROR_FAILED);
                    return;
                }
                var url = window.location.protocol +
                    '//steamcommunity.com/market/itemordershistogram?language=english&currency=' +
                    currencyId +
                    '&item_nameid=' +
                    item_nameid +
                    '&two_factor=0';

                $.get(url,
                        function(histogram) {
                            // Store the histogram in the session storage.
                            var storage_hash = 'itemordershistogram_' + item.appid + '+' + market_name;
                            storageSession.setItem(storage_hash, histogram);

                            callback(ERROR_SUCCESS, histogram, false);
                        })
                    .fail(function() {
                        return callback(ERROR_FAILED, null);
                    });
            });
    };

    // Calculate the price before fees (seller price) from the buyer price
    SteamMarket.prototype.getPriceBeforeFees = function(price, item) {
        var publisherFee = -1;

        if (item != null) {
            if (item.market_fee != null)
                publisherFee = item.market_fee;
            else if (item.description != null && item.description.market_fee != null)
                publisherFee = item.description.market_fee;
        }

        if (publisherFee == -1) {
            if (this.walletInfo != null)
                publisherFee = this.walletInfo['wallet_publisher_fee_percent_default'];
            else
                publisherFee = 0.10;
        }

        price = Math.round(price);
        var feeInfo = CalculateFeeAmount(price, publisherFee, this.walletInfo);
        return price - feeInfo.fees;
    };

    // Calculate the buyer price from the seller price
    SteamMarket.prototype.getPriceIncludingFees = function(price, item) {
        var publisherFee = -1;
        if (item != null) {
            if (item.market_fee != null)
                publisherFee = item.market_fee;
            else if (item.description != null && item.description.market_fee != null)
                publisherFee = item.description.market_fee;
        }
        if (publisherFee == -1) {
            if (this.walletInfo != null)
                publisherFee = this.walletInfo['wallet_publisher_fee_percent_default'];
            else
                publisherFee = 0.10;
        }

        price = Math.round(price);
        var feeInfo = CalculateAmountToSendForDesiredReceivedAmount(price, publisherFee, this.walletInfo);
        return feeInfo.amount;
    };
    //#endregion