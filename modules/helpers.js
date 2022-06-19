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
        maxPrice = isFoilTradingCard ?
            getSettingWithDefault(SETTING_MAX_FOIL_PRICE) :
            getSettingWithDefault(SETTING_MAX_NORMAL_PRICE);
        minPrice = isFoilTradingCard ?
            getSettingWithDefault(SETTING_MIN_FOIL_PRICE) :
            getSettingWithDefault(SETTING_MIN_NORMAL_PRICE);
    }

    maxPrice = maxPrice * 100.0;
    minPrice = minPrice * 100.0;

    var maxPriceBeforeFees = market.getPriceBeforeFees(maxPrice);
    var minPriceBeforeFees = market.getPriceBeforeFees(minPrice);

    return {
        maxPrice,
        minPrice,
        maxPriceBeforeFees,
        minPriceBeforeFees
    };
}

// Calculates the average history price, before the fee.
function calculateAverageHistoryPriceBeforeFees(history) {
    var highest = 0;
    var total = 0;

    if (history != null) {
        // Highest average price in the last xx hours.
        var timeAgo = Date.now() - (getSettingWithDefault(SETTING_PRICE_HISTORY_HOURS) * 60 * 60 * 1000);

        history.forEach(function(historyItem) {
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
    if (typeof histogram === 'undefined' ||
        histogram == null ||
        histogram.lowest_sell_order == null ||
        histogram.sell_order_graph == null)
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

function calculateBuyOrderPriceBeforeFees(histogram) {
    if (typeof histogram === 'undefined')
        return 0;

    return market.getPriceBeforeFees(histogram.highest_buy_order);
}

// Calculate the sell price based on the history and listings.
// applyOffset specifies whether the price offset should be applied when the listings are used to determine the price.
function calculateSellPriceBeforeFees(history, histogram, applyOffset, minPriceBeforeFees, maxPriceBeforeFees) {
    var historyPrice = calculateAverageHistoryPriceBeforeFees(history);
    var listingPrice = calculateListingPriceBeforeFees(histogram);
    var buyPrice = calculateBuyOrderPriceBeforeFees(histogram);

    var shouldUseAverage = getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1;
    var shouldUseBuyOrder = getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 3;

    // If the highest average price is lower than the first listing, return the offset + that listing.
    // Otherwise, use the highest average price instead.
    var calculatedPrice = 0;
    if (shouldUseBuyOrder && buyPrice !== -2) {
        calculatedPrice = buyPrice;
    } else if (historyPrice < listingPrice || !shouldUseAverage) {
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
    if (typeof histogram !== 'undefined' && histogram != null && histogram.highest_buy_order != null) {
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
//#region Steam Market / Inventory helpers
function getMarketHashName(item) {
    if (item == null)
        return null;

    if (item.description != null && item.description.market_hash_name != null)
        return escapeURI(item.description.market_hash_name);

    if (item.description != null && item.description.name != null)
        return escapeURI(item.description.name);

    if (item.market_hash_name != null)
        return escapeURI(item.market_hash_name);

    if (item.name != null)
        return escapeURI(item.name);

    return null;
}

function getIsCrate(item) {
    if (item == null)
        return false;
    // This is available on the inventory page.
    var tags = item.tags != null ?
        item.tags :
        (item.description != null && item.description.tags != null ?
            item.description.tags :
            null);
    if (tags != null) {
        var isTaggedAsCrate = false;
        tags.forEach(function (arrayItem) {
            if (arrayItem.category == 'Type')
                if (arrayItem.internal_name == 'Supply Crate')
                    isTaggedAsCrate = true;
        });
        if (isTaggedAsCrate)
            return true;
    }
}

function getIsTradingCard(item) {
    if (item == null)
        return false;

    // This is available on the inventory page.
    var tags = item.tags != null ?
        item.tags :
        (item.description != null && item.description.tags != null ?
            item.description.tags :
            null);
    if (tags != null) {
        var isTaggedAsTradingCard = false;
        tags.forEach(function(arrayItem) {
            if (arrayItem.category == 'item_class')
                if (arrayItem.internal_name == 'item_class_2') // trading card.
                    isTaggedAsTradingCard = true;
        });
        if (isTaggedAsTradingCard)
            return true;
    }

    // This is available on the market page.
    if (item.owner_actions != null) {
        for (var i = 0; i < item.owner_actions.length; i++) {
            if (item.owner_actions[i].link == null)
                continue;

            // Cards include a link to the gamecard page.
            // For example: "http://steamcommunity.com/my/gamecards/503820/".
            if (item.owner_actions[i].link.toString().toLowerCase().includes('gamecards'))
                return true;
        }
    }

    // A fallback for the market page (only works with language on English).
    if (item.type != null && item.type.toLowerCase().includes('trading card'))
        return true;

    return false;
}

function getIsFoilTradingCard(item) {
    if (!getIsTradingCard(item))
        return false;

    // This is available on the inventory page.
    var tags = item.tags != null ?
        item.tags :
        (item.description != null && item.description.tags != null ?
            item.description.tags :
            null);
    if (tags != null) {
        var isTaggedAsFoilTradingCard = false;
        tags.forEach(function(arrayItem) {
            if (arrayItem.category == 'cardborder')
                if (arrayItem.internal_name == 'cardborder_1') // foil border.
                    isTaggedAsFoilTradingCard = true;
        });
        if (isTaggedAsFoilTradingCard)
            return true;
    }

    // This is available on the market page.
    if (item.owner_actions != null) {
        for (var i = 0; i < item.owner_actions.length; i++) {
            if (item.owner_actions[i].link == null)
                continue;

            // Cards include a link to the gamecard page.
            // The border parameter specifies the foil cards.
            // For example: "http://steamcommunity.com/my/gamecards/503820/?border=1".
            if (item.owner_actions[i].link.toString().toLowerCase().includes('gamecards') &&
                item.owner_actions[i].link.toString().toLowerCase().includes('border'))
                return true;
        }
    }

    // A fallback for the market page (only works with language on English).
    if (item.type != null && item.type.toLowerCase().includes('foil trading card'))
        return true;

    return false;
}

function CalculateFeeAmount(amount, publisherFee, walletInfo) {
    if (walletInfo == null || !walletInfo['wallet_fee']) {
        return {
            fees: 0
        };
    }

    publisherFee = (publisherFee == null) ? 0 : publisherFee;
    // Since CalculateFeeAmount has a Math.floor, we could be off a cent or two. Let's check:
    var iterations = 0; // shouldn't be needed, but included to be sure nothing unforseen causes us to get stuck
    var nEstimatedAmountOfWalletFundsReceivedByOtherParty =
        parseInt((amount - parseInt(walletInfo['wallet_fee_base'])) /
            (parseFloat(walletInfo['wallet_fee_percent']) + parseFloat(publisherFee) + 1));
    var bEverUndershot = false;
    var fees = CalculateAmountToSendForDesiredReceivedAmount(nEstimatedAmountOfWalletFundsReceivedByOtherParty,
        publisherFee,
        walletInfo);
    while (fees.amount != amount && iterations < 10) {
        if (fees.amount > amount) {
            if (bEverUndershot) {
                fees = CalculateAmountToSendForDesiredReceivedAmount(
                    nEstimatedAmountOfWalletFundsReceivedByOtherParty - 1,
                    publisherFee,
                    walletInfo);
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
        fees = CalculateAmountToSendForDesiredReceivedAmount(nEstimatedAmountOfWalletFundsReceivedByOtherParty,
            publisherFee,
            walletInfo);
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
    if (walletInfo == null || !walletInfo['wallet_fee']) {
        return {
            amount: receivedAmount
        };
    }

    publisherFee = (publisherFee == null) ? 0 : publisherFee;
    var nSteamFee = parseInt(Math.floor(Math.max(receivedAmount * parseFloat(walletInfo['wallet_fee_percent']),
            walletInfo['wallet_fee_minimum']) +
        parseInt(walletInfo['wallet_fee_base'])));
    var nPublisherFee = parseInt(Math.floor(publisherFee > 0 ? Math.max(receivedAmount * publisherFee, 1) : 0));
    var nAmountToSend = receivedAmount + nSteamFee + nPublisherFee;
    return {
        steam_fee: nSteamFee,
        publisher_fee: nPublisherFee,
        fees: nSteamFee + nPublisherFee,
        amount: parseInt(nAmountToSend)
    };
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

function isRetryMessage(message) {
    var messageList = [
        "You cannot sell any items until your previous action completes.",
        "There was a problem listing your item. Refresh the page and try again.",
        "We were unable to contact the game's item server. The game's item server may be down or Steam may be experiencing temporary connectivity issues. Your listing has not been created. Refresh the page and try again."
    ];

    return messageList.indexOf(message) !== -1;
}
//#endregion