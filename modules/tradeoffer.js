//#region Tradeoffers
if (currentPage == PAGE_TRADEOFFER) {
    // Gets the trade offer's inventory items from the active inventory.
    function getTradeOfferInventoryItems() {
        var arr = [];

        for (var child in getActiveInventory().rgChildInventories) {
            for (var key in getActiveInventory().rgChildInventories[child].rgInventory) {
                var value = getActiveInventory().rgChildInventories[child].rgInventory[key];
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
        for (var key in getActiveInventory().rgInventory) {
            var value = getActiveInventory().rgInventory[key];
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
        var total = {};
        var totalPrice = 0;
        for (var i = 0; i < assets.length; i++) {
            var rgItem = user.findAsset(assets[i].appid, assets[i].contextid, assets[i].assetid);

            var text = '';
            if (rgItem != null) {
                if (rgItem.element) {
                    var inventoryPriceElements = $('.inventory_item_price', rgItem.element);
                    if (inventoryPriceElements.length) {
                        var firstPriceElement = inventoryPriceElements[0];
                        var classes = $(firstPriceElement).attr('class').split(' ');
                        for (var c in classes) {
                            if (classes[c].toString().includes('price_')) {
                                var price = parseInt(classes[c].toString().replace('price_', ''));
                                totalPrice += price;
                            }
                        }

                    }
                }

                if (rgItem.original_amount != null && rgItem.amount != null) {
                    var originalAmount = parseInt(rgItem.original_amount);
                    var currentAmount = parseInt(rgItem.amount);
                    var usedAmount = originalAmount - currentAmount;
                    text += usedAmount.toString() + 'x ';
                }

                text += rgItem.name;

                if (rgItem.type != null && rgItem.type.length > 0) {
                    text += ' (' + rgItem.type + ')';
                }
            } else
                text = 'Unknown Item';

            if (text in total)
                total[text] = total[text] + 1;
            else
                total[text] = 1;
        }

        var sortable = [];
        for (var item in total)
            sortable.push([item, total[item]])

        sortable.sort(function(a, b) {
            return a[1] - b[1];
        }).reverse();

        var totalText = '<strong>Number of items: ' + sortable.length + ', worth ' + (totalPrice / 100).toFixed(2) + currencySymbol + '<br/><br/></strong>';

        for (var i = 0; i < sortable.length; i++) {
            totalText += sortable[i][1] + 'x ' + sortable[i][0] + '<br/>';
        }

        return totalText;
    }
}


var lastTradeOfferSum = 0;

function hasLoadedAllTradeOfferItems() {
    for (var i = 0; i < unsafeWindow.g_rgCurrentTradeStatus.them.assets.length; i++) {
        var asset = UserThem.findAsset(unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].appid, unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].contextid, unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].assetid);
        if (asset == null)
            return false;
    }
    for (var i = 0; i < unsafeWindow.g_rgCurrentTradeStatus.me.assets.length; i++) {
        var asset = UserYou.findAsset(unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].appid, unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].contextid, unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].assetid);
        if (asset == null)
            return false;
    }
    return true;

}

function initializeTradeOfferUI() {
    var updateInventoryPrices = function() {
        if (getSettingWithDefault(SETTING_TRADEOFFER_PRICE_LABELS) == 1) {
            setInventoryPrices(getTradeOfferInventoryItems());
        }
    };

    var updateInventoryPricesInTrade = function() {
        var items = [];
        for (var i = 0; i < unsafeWindow.g_rgCurrentTradeStatus.them.assets.length; i++) {
            var asset = UserThem.findAsset(unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].appid, unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].contextid, unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].assetid);
            items.push(asset);
        }
        for (var i = 0; i < unsafeWindow.g_rgCurrentTradeStatus.me.assets.length; i++) {
            var asset = UserYou.findAsset(unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].appid, unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].contextid, unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].assetid);
            items.push(asset);
        }
        setInventoryPrices(items);
    };

    $('.trade_right > div > div > div > .trade_item_box').observe('childlist subtree', function(record) {
        if (!hasLoadedAllTradeOfferItems())
            return;

        var currentTradeOfferSum = unsafeWindow.g_rgCurrentTradeStatus.me.assets.length + unsafeWindow.g_rgCurrentTradeStatus.them.assets.length;
        if (lastTradeOfferSum != currentTradeOfferSum) {
            updateInventoryPricesInTrade();
        }

        lastTradeOfferSum = currentTradeOfferSum;

        $('#trade_offer_your_sum').remove();
        $('#trade_offer_their_sum').remove();

        var your_sum = sumTradeOfferAssets(unsafeWindow.g_rgCurrentTradeStatus.me.assets, UserYou);
        var their_sum = sumTradeOfferAssets(unsafeWindow.g_rgCurrentTradeStatus.them.assets, UserThem);

        $('div.offerheader:nth-child(1) > div:nth-child(3)').append('<div class="trade_offer_sum" id="trade_offer_your_sum">' + your_sum + '</div>');
        $('div.offerheader:nth-child(3) > div:nth-child(3)').append('<div class="trade_offer_sum" id="trade_offer_their_sum">' + their_sum + '</div>');
    });


    // Load after the inventory is loaded.
    updateInventoryPrices();

    $('#inventory_pagecontrols').observe('childlist',
        '*',
        function(record) {
            updateInventoryPrices();
        });


    // This only works with a new trade offer.
    if (!window.location.href.includes('tradeoffer/new'))
        return;

    $('#inventory_displaycontrols').append(
        '<br/>' +
        '<div class="trade_offer_buttons">' +
        '<a class="item_market_action_button item_market_action_button_green select_all" style="margin-top:1px">' +
        '<span class="item_market_action_button_contents" style="text-transform:none">Select all from page</span>' +
        '</a>' +
        '</div>');

    $('.select_all').on('click', '*', function() {
        $('.inventory_ctn:visible > .inventory_page:visible > .itemHolder:visible').delayedEach(250, function(i, it) {
            var item = it.rgItem;
            if (item.is_stackable)
                return;

            if (!item.tradable)
                return;

            unsafeWindow.MoveItemToTrade(it);
        });
    });
}
//#endregion