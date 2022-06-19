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

        var totals = document.getElementById('loggerTotal');
        totals.innerHTML = '';

        if (totalPriceWithFeesOnMarket > 0) {
            totals.innerHTML += '<div><strong>Total listed for ' +
                (totalPriceWithFeesOnMarket / 100.0).toFixed(2) +
                currencySymbol +
                ', you will receive ' +
                (totalPriceWithoutFeesOnMarket / 100).toFixed(2) +
                currencySymbol +
                '.</strong></div>';
        }
        if (totalScrap > 0) {
            totals.innerHTML += '<div><strong>Total scrap ' + totalScrap + '.</strong></div>';
        }
    }

    var sellQueue = async.queue(function(task, next) {
            market.sellItem(task.item,
                task.sellPrice,
                function(err, data) {
                    totalNumberOfProcessedQueueItems++;

                    var digits = getNumberOfDigits(totalNumberOfQueuedItems);
                    var itemId = task.item.assetid || task.item.id;
                    var itemName = task.item.name || task.item.description.name;
                    var padLeft = padLeftZero('' + totalNumberOfProcessedQueueItems, digits) + ' / ' + totalNumberOfQueuedItems;

                    if (!err) {
                        logDOM(padLeft +
                            ' - ' +
                            itemName +
                            ' listed for ' +
                            (market.getPriceIncludingFees(task.sellPrice) / 100.0).toFixed(2) +
                            currencySymbol +
                            ', you will receive ' +
                            (task.sellPrice / 100.0).toFixed(2) + currencySymbol +
                            '.');

                        $('#' + task.item.appid + '_' + task.item.contextid + '_' + itemId)
                            .css('background', COLOR_SUCCESS);

                        totalPriceWithoutFeesOnMarket += task.sellPrice;
                        totalPriceWithFeesOnMarket += market.getPriceIncludingFees(task.sellPrice);
                        updateTotals();
                    } else if (data != null && isRetryMessage(data.message)) {
                        logDOM(padLeft +
                            ' - ' +
                            itemName +
                            ' retrying listing because ' +
                            data.message[0].toLowerCase() +
                            data.message.slice(1));

                        totalNumberOfProcessedQueueItems--;
                        sellQueue.unshift(task);
                        sellQueue.pause();

                        setTimeout(function() {
                            sellQueue.resume();
                        }, getRandomInt(30000, 45000));
                    } else {
                        if (data != null && data.responseJSON != null && data.responseJSON.message != null) {
                            logDOM(padLeft +
                                ' - ' +
                                itemName +
                                ' not added to market because ' +
                                data.responseJSON.message[0].toLowerCase() +
                                data.responseJSON.message.slice(1));
                        } else
                            logDOM(padLeft + ' - ' + itemName + ' not added to market.');

                        $('#' + task.item.appid + '_' + task.item.contextid + '_' + itemId)
                            .css('background', COLOR_ERROR);
                    }

                    next();
                });
        },
        1);

    sellQueue.drain = function() {
        onQueueDrain();
    }

    function sellAllItems(appId) {
        loadAllInventories().then(function() {
                var items = getInventoryItems();
                var filteredItems = [];

                items.forEach(function(item) {
                    if (!item.marketable) {
                        return;
                    }

                    filteredItems.push(item);
                });

                sellItems(filteredItems);
            },
            function() {
                logDOM('Could not retrieve the inventory...');
            });
    }

    function sellAllCards() {
        loadAllInventories().then(function() {
                var items = getInventoryItems();
                var filteredItems = [];

                items.forEach(function(item) {
                    if (!getIsTradingCard(item) || !item.marketable) {
                        return;
                    }

                    filteredItems.push(item);
                });

                sellItems(filteredItems);
            },
            function() {
                logDOM('Could not retrieve the inventory...');
            });
    }

    function sellAllCrates() {
        loadAllInventories().then(function () {
                var items = getInventoryItems();
                var filteredItems = [];
                items.forEach(function (item) {
                    if (!getIsCrate(item) || !item.marketable) {
                        return;
                    }
                    filteredItems.push(item);
                });

                sellItems(filteredItems);
            },
            function() {
                logDOM('Could not retrieve the inventory...');
            });
    }

    var scrapQueue = async.queue(function(item, next) {
        scrapQueueWorker(item, function(success) {
            if (success) {
                setTimeout(function() {
                    next();
                }, 250);
            } else {
                var delay = numberOfFailedRequests > 1 ?
                    getRandomInt(30000, 45000) :
                    getRandomInt(1000, 1500);

                if (numberOfFailedRequests > 3)
                    numberOfFailedRequests = 0;

                setTimeout(function() {
                    next();
                }, delay);
            }
        });
    }, 1);

    scrapQueue.drain = function() {
        onQueueDrain();
    }

    function scrapQueueWorker(item, callback) {
        var failed = 0;
        var itemName = item.name || item.description.name;
        var itemId = item.assetid || item.id;

        market.getGooValue(item,
            function(err, goo) {
                totalNumberOfProcessedQueueItems++;

                var digits = getNumberOfDigits(totalNumberOfQueuedItems);
                var padLeft = padLeftZero('' + totalNumberOfProcessedQueueItems, digits) + ' / ' + totalNumberOfQueuedItems;

                if (err != ERROR_SUCCESS) {
                    logConsole('Failed to get gems value for ' + itemName);
                    logDOM(padLeft + ' - ' + itemName + ' not turned into gems due to missing gems value.');

                    $('#' + item.appid + '_' + item.contextid + '_' + itemId).css('background', COLOR_ERROR);
                    return callback(false);
                }

                item.goo_value_expected = parseInt(goo.goo_value);

                market.grindIntoGoo(item,
                    function(err, result) {
                        if (err != ERROR_SUCCESS) {
                            logConsole('Failed to turn item into gems for ' + itemName);
                            logDOM(padLeft + ' - ' + itemName + ' not turned into gems due to unknown error.');

                            $('#' + item.appid + '_' + item.contextid + '_' + itemId).css('background', COLOR_ERROR);
                            return callback(false);
                        }

                        logConsole('============================')
                        logConsole(itemName);
                        logConsole('Turned into ' + goo.goo_value + ' gems');
                        logDOM(padLeft + ' - ' + itemName + ' turned into ' + item.goo_value_expected + ' gems.');
                        $('#' + item.appid + '_' + item.contextid + '_' + itemId).css('background', COLOR_SUCCESS);

                        totalScrap += item.goo_value_expected;
                        updateTotals();

                        callback(true);
                    });
            });
    }

    var boosterQueue = async.queue(function(item, next) {
        boosterQueueWorker(item, function(success) {
            if (success) {
                setTimeout(function() {
                    next();
                }, 250);
            } else {
                var delay = numberOfFailedRequests > 1 ?
                    getRandomInt(30000, 45000) :
                    getRandomInt(1000, 1500);

                if (numberOfFailedRequests > 3)
                    numberOfFailedRequests = 0;

                setTimeout(function() {
                    next();
                }, delay);
            }
        });
    }, 1);

    boosterQueue.drain = function() {
        onQueueDrain();
    }

    function boosterQueueWorker(item, callback) {
        var failed = 0;
        var itemName = item.name || item.description.name;
        var itemId = item.assetid || item.id;

        market.unpackBoosterPack(item,
            function(err, goo) {
                totalNumberOfProcessedQueueItems++;

                var digits = getNumberOfDigits(totalNumberOfQueuedItems);
                var padLeft = padLeftZero('' + totalNumberOfProcessedQueueItems, digits) + ' / ' + totalNumberOfQueuedItems;

                if (err != ERROR_SUCCESS) {
                    logConsole('Failed to unpack booster pack ' + itemName);
                    logDOM(padLeft + ' - ' + itemName + ' not unpacked.');

                    $('#' + item.appid + '_' + item.contextid + '_' + itemId).css('background', COLOR_ERROR);
                    return callback(false);
                }

                logDOM(padLeft + ' - ' + itemName + ' unpacked.');
                $('#' + item.appid + '_' + item.contextid + '_' + itemId).css('background', COLOR_SUCCESS);

                callback(true);
            });
    }


    // Turns the selected items into gems.
    function turnSelectedItemsIntoGems() {
        var ids = getSelectedItems();

        loadAllInventories().then(function() {
            var items = getInventoryItems();

            var numberOfQueuedItems = 0;
            items.forEach(function(item) {
                // Ignored queued items.
                if (item.queued != null) {
                    return;
                }

                if (item.owner_actions == null) {
                    return;
                }

                var canTurnIntoGems = false;
                for (var owner_action in item.owner_actions) {
                    if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('GetGooValue')) {
                        canTurnIntoGems = true;
                    }
                }

                if (!canTurnIntoGems)
                    return;

                var itemId = item.assetid || item.id;
                if (ids.indexOf(itemId) !== -1) {
                    item.queued = true;
                    scrapQueue.push(item);
                    numberOfQueuedItems++;
                }
            });

            if (numberOfQueuedItems > 0) {
                totalNumberOfQueuedItems += numberOfQueuedItems;

                $('#inventory_items_spinner').remove();
                $('#inventory_sell_buttons').append('<div id="inventory_items_spinner">' +
                    spinnerBlock +
                    '<div style="text-align:center">Processing ' + numberOfQueuedItems + ' items</div>' +
                    '</div>');
            }
        }, function() {
            logDOM('Could not retrieve the inventory...');
        });
    }

    // Unpacks the selected booster packs.
    function unpackSelectedBoosterPacks() {
        var ids = getSelectedItems();

        loadAllInventories().then(function() {
            var items = getInventoryItems();

            var numberOfQueuedItems = 0;
            items.forEach(function(item) {
                // Ignored queued items.
                if (item.queued != null) {
                    return;
                }

                if (item.owner_actions == null) {
                    return;
                }

                var canOpenBooster = false;
                for (var owner_action in item.owner_actions) {
                    if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('OpenBooster')) {
                        canOpenBooster = true;
                    }
                }

                if (!canOpenBooster)
                    return;

                var itemId = item.assetid || item.id;
                if (ids.indexOf(itemId) !== -1) {
                    item.queued = true;
                    boosterQueue.push(item);
                    numberOfQueuedItems++;
                }
            });

            if (numberOfQueuedItems > 0) {
                totalNumberOfQueuedItems += numberOfQueuedItems;

                $('#inventory_items_spinner').remove();
                $('#inventory_sell_buttons').append('<div id="inventory_items_spinner">' +
                    spinnerBlock +
                    '<div style="text-align:center">Processing ' + numberOfQueuedItems + ' items</div>' +
                    '</div>');
            }
        }, function() {
            logDOM('Could not retrieve the inventory...');
        });
    }

    function sellSelectedItems() {
        getInventorySelectedMarketableItems(function(items) {
            sellItems(items);
        });
    }
    
    function canSellSelectedItemsManually(items) {
        // We have to construct an URL like this
        // https://steamcommunity.com/market/multisell?appid=730&contextid=2&items[]=Falchion%20Case&qty[]=100
        var appid = items[0].appid;
        var contextid = items[0].contextid;

        var hasInvalidItem = false;
      
        items.forEach(function(item) {
            if (item.contextid != contextid || item.commodity == false)
                hasInvalidItem = true;
        });

        return !hasInvalidItem;
    }

    function sellSelectedItemsManually() {
        getInventorySelectedMarketableItems(function(items) {
            // We have to construct an URL like this
            // https://steamcommunity.com/market/multisell?appid=730&contextid=2&items[]=Falchion%20Case&qty[]=100
            
            var appid = items[0].appid;
            var contextid = items[0].contextid;

            var itemsWithQty = {};
          
            items.forEach(function(item) {
               itemsWithQty[item.market_hash_name] = itemsWithQty[item.market_hash_name] + 1 || 1;
            });

            var itemsString = '';
            for (var itemName in itemsWithQty) {
                itemsString += '&items[]=' + encodeURI(itemName) + '&qty[]=' + itemsWithQty[itemName];
            }

            var baseUrl = 'https://steamcommunity.com/market/multisell';
            var redirectUrl = baseUrl + '?appid=' + appid + '&contextid=' + contextid + itemsString;
            
            var dialog = unsafeWindow.ShowDialog('Steam Economy Enhancer', '<iframe frameBorder="0" height="650" width="900" src="' + redirectUrl + '"></iframe>');
            dialog.OnDismiss(function() {
                items.forEach(function(item) {
                    var itemId = item.assetid || item.id;
                    $('#' + item.appid + '_' + item.contextid + '_' + itemId).css('background', COLOR_PENDING);                      
                });
            });
        });
    }

    function sellItems(items) {
        if (items.length == 0) {
            logDOM('These items cannot be added to the market...');

            return;
        }

        var numberOfQueuedItems = 0;

        items.forEach(function(item, index, array) {
            // Ignored queued items.
            if (item.queued != null) {
                return;
            }

            item.queued = true;
            var itemId = item.assetid || item.id;
            item.ignoreErrors = false;
            itemQueue.push(item);
            numberOfQueuedItems++;
        });

        if (numberOfQueuedItems > 0) {
            totalNumberOfQueuedItems += numberOfQueuedItems;

            $('#inventory_items_spinner').remove();
            $('#inventory_sell_buttons').append('<div id="inventory_items_spinner">' +
                spinnerBlock +
                '<div style="text-align:center">Processing ' + numberOfQueuedItems + ' items</div>' +
                '</div>');
        }
    }

    var itemQueue = async.queue(function(item, next) {
        itemQueueWorker(item,
            item.ignoreErrors,
            function(success, cached) {
                if (success) {
                    setTimeout(function() {
                            next();
                        },
                        cached ? 0 : getRandomInt(1000, 1500));
                } else {
                    if (!item.ignoreErrors) {
                        item.ignoreErrors = true;
                        itemQueue.push(item);
                    }

                    var delay = numberOfFailedRequests > 1 ?
                        getRandomInt(30000, 45000) :
                        getRandomInt(1000, 1500);

                    if (numberOfFailedRequests > 3)
                        numberOfFailedRequests = 0;

                    setTimeout(function() {
                            next();
                        },
                        cached ? 0 : delay);
                }
            });
    }, 1);

    function itemQueueWorker(item, ignoreErrors, callback) {
        var priceInfo = getPriceInformationFromItem(item);

        var failed = 0;
        var itemName = item.name || item.description.name;

        market.getPriceHistory(item,
            true,
            function(err, history, cachedHistory) {
                if (err) {
                    logConsole('Failed to get price history for ' + itemName);

                    if (err == ERROR_FAILED)
                        failed += 1;
                }

                market.getItemOrdersHistogram(item,
                    true,
                    function(err, histogram, cachedListings) {
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

                        var sellPrice = calculateSellPriceBeforeFees(history,
                            histogram,
                            true,
                            priceInfo.minPriceBeforeFees,
                            priceInfo.maxPriceBeforeFees);


                        logConsole('Sell price: ' +
                            sellPrice / 100.0 +
                            ' (' +
                            market.getPriceIncludingFees(sellPrice) / 100.0 +
                            ')');

                        sellQueue.push({
                            item: item,
                            sellPrice: sellPrice
                        });

                        return callback(true, cachedHistory && cachedListings);
                    });
            });
    }

    // Initialize the inventory UI.
    function initializeInventoryUI() {
        var isOwnInventory = unsafeWindow.g_ActiveUser.strSteamId == unsafeWindow.g_steamID;
        var previousSelection = -1; // To store the index of the previous selection.
        updateInventoryUI(isOwnInventory);

        $('.games_list_tabs').on('click',
            '*',
            function() {
                updateInventoryUI(isOwnInventory);
            });

        // Ignore selection on other user's inventories.
        if (!isOwnInventory)
            return;

        // Steam adds 'display:none' to items while searching. These should not be selected while using shift/ctrl.
        var filter = ".itemHolder:not([style*=none])";
        $('#inventories').selectable({
            filter: filter,
            selecting: function(e, ui) {
                // Get selected item index.
                var selectedIndex = $(ui.selecting.tagName, e.target).index(ui.selecting);

                // If shift key was pressed and there is previous - select them all.
                if (e.shiftKey && previousSelection > -1) {
                    $(ui.selecting.tagName, e.target)
                        .slice(Math.min(previousSelection, selectedIndex),
                            1 + Math.max(previousSelection, selectedIndex)).each(function() {
                            if ($(this).is(filter)) {
                                $(this).addClass('ui-selected');
                            }
                        });
                    previousSelection = -1; // Reset previous.
                } else {
                    previousSelection = selectedIndex; // Save previous.
                }
            },
            selected: function(e, ui) {
                updateInventorySelection(ui.selected);
            }
        });
    }

    // Gets the selected items in the inventory.
    function getSelectedItems() {
        var ids = [];
        $('.inventory_ctn').each(function() {
            $(this).find('.inventory_page').each(function() {
                var inventory_page = this;

                $(inventory_page).find('.itemHolder').each(function() {
                    if (!$(this).hasClass('ui-selected'))
                        return;

                    $(this).find('.item').each(function() {
                        var matches = this.id.match(/_(\-?\d+)$/);
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
        var ids = getSelectedItems();

        loadAllInventories().then(function() {
            var items = getInventoryItems();
            var filteredItems = [];

            items.forEach(function(item) {
                if (!item.marketable) {
                    return;
                }

                var itemId = item.assetid || item.id;
                if (ids.indexOf(itemId) !== -1) {
                    filteredItems.push(item);
                }
            });

            callback(filteredItems);
        }, function() {
            logDOM('Could not retrieve the inventory...');
        });
    }

    // Gets the selected and gemmable items in the inventory.
    function getInventorySelectedGemsItems(callback) {
        var ids = getSelectedItems();

        loadAllInventories().then(function() {
            var items = getInventoryItems();
            var filteredItems = [];

            items.forEach(function(item) {
                var canTurnIntoGems = false;
                for (var owner_action in item.owner_actions) {
                    if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('GetGooValue')) {
                        canTurnIntoGems = true;
                    }
                }

                if (!canTurnIntoGems)
                    return;

                var itemId = item.assetid || item.id;
                if (ids.indexOf(itemId) !== -1) {
                    filteredItems.push(item);
                }
            });

            callback(filteredItems);
        }, function() {
            logDOM('Could not retrieve the inventory...');
        });
    }

    // Gets the selected and booster pack items in the inventory.
    function getInventorySelectedBoosterPackItems(callback) {
        var ids = getSelectedItems();

        loadAllInventories().then(function() {
            var items = getInventoryItems();
            var filteredItems = [];

            items.forEach(function(item) {
                var canOpenBooster = false;
                for (var owner_action in item.owner_actions) {
                    if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('OpenBooster')) {
                        canOpenBooster = true;
                    }
                }

                if (!canOpenBooster)
                    return;

                var itemId = item.assetid || item.id;
                if (ids.indexOf(itemId) !== -1) {
                    filteredItems.push(item);
                }
            });

            callback(filteredItems);
        }, function() {
            logDOM('Could not retrieve the inventory...');
        });
    }

    // Updates the (selected) sell ... items button.
    function updateSellSelectedButton() {
        getInventorySelectedMarketableItems(function(items) {
            var selectedItems = items.length;
            if (items.length == 0) {
                $('.sell_selected').hide();
                $('.sell_manual').hide();
            } else {
                $('.sell_selected').show();
                if (canSellSelectedItemsManually(items)) {
                    $('.sell_manual').show();
                    $('.sell_manual > span').text('Sell ' + selectedItems + (selectedItems == 1 ? ' Item Manual' : ' Items Manual'));						
                } else {
                    $('.sell_manual').hide();						
                }
                $('.sell_selected > span').text('Sell ' + selectedItems + (selectedItems == 1 ? ' Item' : ' Items'));
            }
        });
    }

    // Updates the (selected) turn into ... gems button.
    function updateTurnIntoGemsButton() {
        getInventorySelectedGemsItems(function(items) {
            var selectedItems = items.length;
            if (items.length == 0) {
                $('.turn_into_gems').hide();
            } else {
                $('.turn_into_gems').show();
                $('.turn_into_gems > span')
                    .text('Turn ' + selectedItems + (selectedItems == 1 ? ' Item Into Gems' : ' Items Into Gems'));
            }
        });
    }

    // Updates the (selected) open ... booster packs button.
    function updateOpenBoosterPacksButton() {
        getInventorySelectedBoosterPackItems(function(items) {
            var selectedItems = items.length;
            if (items.length == 0) {
                $('.unpack_booster_packs').hide();
            } else {
                $('.unpack_booster_packs').show();
                $('.unpack_booster_packs > span')
                    .text('Unpack ' + selectedItems + (selectedItems == 1 ? ' Booster Pack' : ' Booster Packs'));
            }
        });
    }

    function updateInventorySelection(item) {
        updateSellSelectedButton();
        updateTurnIntoGemsButton();
        updateOpenBoosterPacksButton();

        // Wait until g_ActiveInventory.selectedItem is identical to the selected UI item.
        // This also makes sure that the new - and correct - item_info (iteminfo0 or iteminfo1) is visible.
        var selectedItemIdUI = $('div', item).attr('id');
        var selectedItemIdInventory = getActiveInventory().selectedItem.appid +
            '_' +
            getActiveInventory().selectedItem.contextid +
            '_' +
            getActiveInventory().selectedItem.assetid;
        if (selectedItemIdUI !== selectedItemIdInventory) {
            setTimeout(function() {
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
        //$('#' + item_info_id + '_item_market_actions > div:nth-child(1) > div:nth-child(2)')
        //    .remove(); // Starting at: x,xx.

        var market_hash_name = getMarketHashName(getActiveInventory().selectedItem);
        if (market_hash_name == null)
            return;

        var appid = getActiveInventory().selectedItem.appid;
        var item = {
            appid: parseInt(appid),
            description: {
                market_hash_name: market_hash_name
            }
        };

        market.getItemOrdersHistogram(item,
            false,
            function(err, histogram) {
                if (err) {
                    logConsole('Failed to get orders histogram for ' + (getActiveInventory().selectedItem.name || getActiveInventory().selectedItem.description.name));
                    return;
                }

                var groupMain = $('<div id="listings_group">' +
                    '<div><div id="listings_sell">Sell</div>' +
                    histogram.sell_order_table +
                    '</div>' +
                    '<div><div id="listings_buy">Buy</div>' +
                    histogram.buy_order_table +
                    '</div>' +
                    '</div>');

                $('#' + item_info_id + '_item_market_actions > div').after(groupMain);

                var ownerActions = $('#' + item_info_id + '_item_owner_actions');
                // ownerActions is hidden on other games' inventories, we need to show it to have a "Market" button visible
                ownerActions.show();

                ownerActions.append('<a class="btn_small btn_grey_white_innerfade" href="/market/listings/' + appid + '/' + market_hash_name + '"><span>View in Community Market</span></a>');
                $('#' + item_info_id + '_item_market_actions > div:nth-child(1) > div:nth-child(1)').hide();

                var isBoosterPack = getActiveInventory().selectedItem.name.toLowerCase().endsWith('booster pack');
                if (isBoosterPack) {
                    var tradingCardsUrl = "/market/search?q=&category_753_Game%5B%5D=tag_app_" + getActiveInventory().selectedItem.market_fee_app + "&category_753_item_class%5B%5D=tag_item_class_2&appid=753";
                    ownerActions.append('<br/> <a class="btn_small btn_grey_white_innerfade" href="' + tradingCardsUrl + '"><span>View trading cards in Community Market</span></a>');
                }


                // Generate quick sell buttons.
                var itemId = getActiveInventory().selectedItem.assetid || getActiveInventory().selectedItem.id;

                // Ignored queued items.
                if (getActiveInventory().selectedItem.queued != null) {
                    return;
                }

                var prices = [];

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

                var buttons = ' ';
                prices.forEach(function(e) {
                    buttons +=
                        '<a class="item_market_action_button item_market_action_button_green quick_sell" id="quick_sell' +
                        e +
                        '">' +
                        '<span class="item_market_action_button_edge item_market_action_button_left"></span>' +
                        '<span class="item_market_action_button_contents">' +
                        (e / 100.0) +
                        currencySymbol +
                        '</span>' +
                        '<span class="item_market_action_button_edge item_market_action_button_right"></span>' +
                        '<span class="item_market_action_button_preload"></span>' +
                        '</a>'
                });

                $('#' + item_info_id + '_item_market_actions', item_info).append(buttons);

                $('#' + item_info_id + '_item_market_actions', item_info).append(
                    '<div style="display:flex">' +
                    '<input id="quick_sell_input" style="background-color: black;color: white;border: transparent;max-width:65px;text-align:center;" type="number" value="' + (histogram.lowest_sell_order / 100) + '" step="0.01" />' +
                    '&nbsp;<a class="item_market_action_button item_market_action_button_green quick_sell_custom">' +
                    '<span class="item_market_action_button_edge item_market_action_button_left"></span>' +
                    '<span class="item_market_action_button_contents">➜ Sell</span>' +
                    '<span class="item_market_action_button_edge item_market_action_button_right"></span>' +
                    '<span class="item_market_action_button_preload"></span>' +
                    '</a>' +
                    '</div>');

                $('.quick_sell').on('click',
                    function() {
                        var price = $(this).attr('id').replace('quick_sell', '');
                        price = market.getPriceBeforeFees(price);

                        totalNumberOfQueuedItems++;

                        sellQueue.push({
                            item: getActiveInventory().selectedItem,
                            sellPrice: price
                        });
                    });

                $('.quick_sell_custom').on('click',
                    function() {
                        var price = $('#quick_sell_input', $('#' + item_info_id + '_item_market_actions', item_info)).val() * 100;
                        price = market.getPriceBeforeFees(price);

                        totalNumberOfQueuedItems++;

                        sellQueue.push({
                            item: getActiveInventory().selectedItem,
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
        $('#global_action_menu')
            .prepend('<span id="see_settings"><a href="javascript:void(0)">⬖ Steam Economy Enhancer</a></span>');
        $('#see_settings').on('click', '*', () => openSettings());

        var appId = getActiveInventory().m_appid;
        var showMiscOptions = appId == 753;
        var TF2 = appId == 440;

        var sellButtons = $('<div id="inventory_sell_buttons" style="margin-bottom:12px;">' +
            '<a class="btn_green_white_innerfade btn_medium_wide sell_all separator-btn-right"><span>Sell All Items</span></a>' +
            '<a class="btn_green_white_innerfade btn_medium_wide sell_selected separator-btn-right" style="display:none"><span>Sell Selected Items</span></a>' +
            '<a class="btn_green_white_innerfade btn_medium_wide sell_manual separator-btn-right" style="display:none"><span>Sell Manually</span></a>' +
            (showMiscOptions ?
                '<a class="btn_green_white_innerfade btn_medium_wide sell_all_cards separator-btn-right"><span>Sell All Cards</span></a>' +
                '<div style="margin-top:12px;">' +
                '<a class="btn_darkblue_white_innerfade btn_medium_wide turn_into_gems separator-btn-right" style="display:none"><span>Turn Selected Items Into Gems</span></a>' +
                '<a class="btn_darkblue_white_innerfade btn_medium_wide unpack_booster_packs separator-btn-right" style="display:none"><span>Unpack Selected Booster Packs</span></a>' +
                '</div>' :
                '') +
            (TF2 ? '<a class="btn_green_white_innerfade btn_medium_wide sell_all_crates separator-btn-right"><span>Sell All Crates</span></a>' : '') +
            '</div>');

        var reloadButton =
            $('<a id="inventory_reload_button" class="btn_darkblue_white_innerfade btn_medium_wide reload_inventory" style="margin-right:12px"><span>Reload Inventory</span></a>');

        $('#inventory_logos')[0].style.height = 'auto';

        $('#inventory_applogo').hide(); // Hide the Steam/game logo, we don't need to see it twice.
        $('#inventory_applogo').after(logger);


        $("#logger").on('scroll',
            function() {
                var hasUserScrolledToBottom =
                    $("#logger").prop('scrollHeight') - $("#logger").prop('clientHeight') <=
                    $("#logger").prop('scrollTop') + 1;
                userScrolled = !hasUserScrolledToBottom;
            });

        // Only add buttons on the user's inventory.
        if (isOwnInventory) {
            $('#inventory_applogo').after(sellButtons);

            // Add bindings to sell buttons.
            $('.sell_all').on('click',
                '*',
                function() {
                    sellAllItems(appId);
                });
            $('.sell_selected').on('click', '*', sellSelectedItems);
            $('.sell_manual').on('click', '*', sellSelectedItemsManually);
            $('.sell_all_cards').on('click', '*', sellAllCards);
            $('.sell_all_crates').on('click', '*', sellAllCrates);
            $('.turn_into_gems').on('click', '*', turnSelectedItemsIntoGems);
            $('.unpack_booster_packs').on('click', '*', unpackSelectedBoosterPacks);

        }

        $('.inventory_rightnav').prepend(reloadButton);
        $('.reload_inventory').on('click',
            '*',
            function() {
                window.location.reload();
            });

        loadAllInventories().then(function() {
                var updateInventoryPrices = function() {
                    if (getSettingWithDefault(SETTING_INVENTORY_PRICE_LABELS) == 1) {
                        setInventoryPrices(getInventoryItems());
                    }
                };

                // Load after the inventory is loaded.
                updateInventoryPrices();

                $('#inventory_pagecontrols').observe('childlist',
                    '*',
                    function(record) {
                        updateInventoryPrices();
                    });
            },
            function() {
                logDOM('Could not retrieve the inventory...');
            });
    }

    // Loads the specified inventories.
    function loadInventories(inventories) {
        return new Promise(function(resolve) {
            inventories.reduce(function(promise, inventory) {
                    return promise.then(function() {
                        return inventory.LoadCompleteInventory().done(function() {});
                    });
                },
                Promise.resolve());

            resolve();
        });
    }

    // Loads all inventories.
    function loadAllInventories() {
        var items = [];

        for (var child in getActiveInventory().m_rgChildInventories) {
            items.push(getActiveInventory().m_rgChildInventories[child]);
        }
        items.push(getActiveInventory());

        return loadInventories(items);
    }

    // Gets the inventory items from the active inventory.
    function getInventoryItems() {
        var arr = [];

        for (var child in getActiveInventory().m_rgChildInventories) {
            for (var key in getActiveInventory().m_rgChildInventories[child].m_rgAssets) {
                var value = getActiveInventory().m_rgChildInventories[child].m_rgAssets[key];
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
        for (var key in getActiveInventory().m_rgAssets) {
            var value = getActiveInventory().m_rgAssets[key];
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