//#region Inventory + Tradeoffer
if (currentPage == PAGE_INVENTORY || currentPage == PAGE_TRADEOFFER) {

    // Gets the active inventory.
    function getActiveInventory() {
        return unsafeWindow.g_ActiveInventory;
    }

    // Sets the prices for the items.
    function setInventoryPrices(items) {
        inventoryPriceQueue.kill();

        items.forEach(function(item) {
            if (!item.marketable) {
                return;
            }

            if (!$(item.element).is(":visible")) {
                return;
            }

            inventoryPriceQueue.push(item);
        });
    }

    var inventoryPriceQueue = async.queue(function(item, next) {
            inventoryPriceQueueWorker(item,
                false,
                function(success, cached) {
                    if (success) {
                        setTimeout(function() {
                                next();
                            },
                            cached ? 0 : getRandomInt(1000, 1500));
                    } else {
                        if (!item.ignoreErrors) {
                            item.ignoreErrors = true;
                            inventoryPriceQueue.push(item);
                        }

                        numberOfFailedRequests++;

                        var delay = numberOfFailedRequests > 1 ?
                            getRandomInt(30000, 45000) :
                            getRandomInt(1000, 1500);

                        if (numberOfFailedRequests > 3)
                            numberOfFailedRequests = 0;

                        setTimeout(function() {
                            next();
                        }, cached ? 0 : delay);
                    }
                });
        },
        1);

    function inventoryPriceQueueWorker(item, ignoreErrors, callback) {
        var priceInfo = getPriceInformationFromItem(item);

        var failed = 0;
        var itemName = item.name || item.description.name;

        // Only get the market orders here, the history is not important to visualize the current prices.
        market.getItemOrdersHistogram(item,
            true,
            function(err, histogram, cachedListings) {
                if (err) {
                    logConsole('Failed to get orders histogram for ' + itemName);

                    if (err == ERROR_FAILED)
                        failed += 1;
                }

                if (failed > 0 && !ignoreErrors) {
                    return callback(false, cachedListings);
                }

                var sellPrice = calculateSellPriceBeforeFees(null, histogram, false, 0, 65535);

                var itemPrice = sellPrice == 65535 ?
                    '∞' :
                    (market.getPriceIncludingFees(sellPrice) / 100.0).toFixed(2) + currencySymbol;

                var elementName = (currentPage == PAGE_TRADEOFFER ? '#item' : '#') +
                    item.appid +
                    '_' +
                    item.contextid +
                    '_' +
                    item.id;
                var element = $(elementName);

                $('.inventory_item_price', element).remove();
                element.append('<span class="inventory_item_price price_' + (sellPrice == 65535 ? 0 : market.getPriceIncludingFees(sellPrice)) + '">' + itemPrice + '</span>');

                return callback(true, cachedListings);
            });
    }
}
//#endregion