// ==UserScript==
// @name        Steam Economy Enhancer
// @icon        https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg
// @namespace   https://github.com/Nuklon
// @author      Nuklon
// @license     MIT
// @version     6.8.3
// @description Enhances the Steam Inventory and Steam Market.
// @include     *://steamcommunity.com/id/*/inventory*
// @include     *://steamcommunity.com/profiles/*/inventory*
// @include     *://steamcommunity.com/market*
// @include     *://steamcommunity.com/tradeoffer*
// @require     https://code.jquery.com/jquery-3.3.1.min.js
// @require     https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @require     https://raw.githubusercontent.com/kapetan/jquery-observe/ca67b735bb3ae8d678d1843384ebbe7c02466c61/jquery-observe.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/paginationjs/2.1.2/pagination.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/async/2.6.0/async.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/localforage/1.7.1/localforage.min.js
// @require     https://moment.github.io/luxon/global/luxon.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/list.js/1.5.0/list.js
// @require     https://github.com/rmariuzzo/checkboxes.js/releases/download/v1.2.2/jquery.checkboxes-1.2.2.min.js
// @grant       unsafeWindow
// @homepageURL https://github.com/Nuklon/Steam-Economy-Enhancer
// @supportURL  https://github.com/Nuklon/Steam-Economy-Enhancer/issues
// @downloadURL https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js
// @updateURL   https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js
// ==/UserScript==
(() => {
  // modules.js
  (function($, async2) {
    $.noConflict(true);
    var DateTime = luxon.DateTime;
    const STEAM_INVENTORY_ID = 753;
    const PAGE_MARKET = 0;
    const PAGE_MARKET_LISTING = 1;
    const PAGE_TRADEOFFER = 2;
    const PAGE_INVENTORY = 3;
    const COLOR_ERROR = "#8A4243";
    const COLOR_SUCCESS = "#407736";
    const COLOR_PENDING = "#908F44";
    const COLOR_PRICE_FAIR = "#496424";
    const COLOR_PRICE_CHEAP = "#837433";
    const COLOR_PRICE_EXPENSIVE = "#813030";
    const COLOR_PRICE_NOT_CHECKED = "#26566c";
    const ERROR_SUCCESS = null;
    const ERROR_FAILED = 1;
    const ERROR_DATA = 2;
    var marketLists = [];
    var totalNumberOfProcessedQueueItems = 0;
    var totalNumberOfQueuedItems = 0;
    var totalPriceWithFeesOnMarket = 0;
    var totalPriceWithoutFeesOnMarket = 0;
    var totalScrap = 0;
    var spinnerBlock = '<div class="spinner"><div class="rect1"></div>&nbsp;<div class="rect2"></div>&nbsp;<div class="rect3"></div>&nbsp;<div class="rect4"></div>&nbsp;<div class="rect5"></div>&nbsp;</div>';
    var numberOfFailedRequests = 0;
    var enableConsoleLog = false;
    var isLoggedIn = typeof unsafeWindow.g_rgWalletInfo !== "undefined" && unsafeWindow.g_rgWalletInfo != null || typeof unsafeWindow.g_bLoggedIn !== "undefined" && unsafeWindow.g_bLoggedIn;
    var currentPage = window.location.href.includes(".com/market") ? window.location.href.includes("market/listings") ? PAGE_MARKET_LISTING : PAGE_MARKET : window.location.href.includes(".com/tradeoffer") ? PAGE_TRADEOFFER : PAGE_INVENTORY;
    var market = new SteamMarket(unsafeWindow.g_rgAppContextData, typeof unsafeWindow.g_strInventoryLoadURL !== "undefined" && unsafeWindow.g_strInventoryLoadURL != null ? unsafeWindow.g_strInventoryLoadURL : location.protocol + "//steamcommunity.com/my/inventory/json/", isLoggedIn ? unsafeWindow.g_rgWalletInfo : void 0);
    var currencyId = isLoggedIn && market != null && market.walletInfo != null && market.walletInfo.wallet_currency != null ? market.walletInfo.wallet_currency : 3;
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
      this.inventoryUrlBase = inventoryUrl.replace("/inventory/json", "");
      if (!this.inventoryUrlBase.endsWith("/"))
        this.inventoryUrlBase += "/";
    }
    function replaceAll(str, find, replace) {
      return str.replace(new RegExp(find, "g"), replace);
    }
    function escapeURI(name) {
      var previousName = "";
      while (previousName != name) {
        previousName = name;
        name = name.replace("?", "%3F").replace("#", "%23").replace("	", "%09");
      }
      return name;
    }
    var storagePersistent = localforage.createInstance({
      name: "see_persistent"
    });
    var storageSession;
    var currentUrl = new URL(window.location.href);
    var noCache = currentUrl.searchParams.get("no-cache") != null;
    if (getSessionStorageItem("SESSION") == null || noCache) {
      var lastCache = getSettingWithDefault(SETTING_LAST_CACHE);
      if (lastCache > 5)
        lastCache = 0;
      setSetting(SETTING_LAST_CACHE, lastCache + 1);
      storageSession = localforage.createInstance({
        name: "see_session_" + lastCache
      });
      storageSession.clear();
      setSessionStorageItem("SESSION", lastCache);
    } else {
      storageSession = localforage.createInstance({
        name: "see_session_" + getSessionStorageItem("SESSION")
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
        logConsole("Failed to set local storage item " + name + ", " + e + ".");
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
        logConsole("Failed to set session storage item " + name + ", " + e + ".");
        return false;
      }
    }
    function getSettingWithDefault(name) {
      return getLocalStorageItem(name) || (name in settingDefaults ? settingDefaults[name] : null);
    }
    function setSetting(name, value) {
      setLocalStorageItem(name, value);
    }
    function openSettings() {
      var price_options = $('<div id="price_options"><div style="margin-bottom:6px;">Calculate prices as the:&nbsp;<select class="price_option_input" style="background-color: black;color: white;border: transparent;" id="' + SETTING_PRICE_ALGORITHM + '"><option value="1"' + (getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1 ? 'selected="selected"' : "") + '>Maximum of the average history and lowest sell listing</option><option value="2" ' + (getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 2 ? 'selected="selected"' : "") + '>Lowest sell listing</option><option value="3" ' + (getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 3 ? 'selected="selected"' : "") + '>Highest current buy order or lowest sell listing</option></select><br/></div><div style="margin-bottom:6px;">Hours to use for the average history calculated price:&nbsp;<input class="price_option_input" style="background-color: black;color: white;border: transparent;" type="number" step="2" id="' + SETTING_PRICE_HISTORY_HOURS + '" value=' + getSettingWithDefault(SETTING_PRICE_HISTORY_HOURS) + '></div><div style="margin-bottom:6px;">The value to add to the calculated price (minimum and maximum are respected):&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_PRICE_OFFSET + '" value=' + getSettingWithDefault(SETTING_PRICE_OFFSET) + '><br/></div><div style="margin-top:6px">Use the second lowest sell listing when the lowest sell listing has a low quantity:&nbsp;<input class="price_option_input" style="background-color: black;color: white;border: transparent;" type="checkbox" id="' + SETTING_PRICE_IGNORE_LOWEST_Q + '" ' + (getSettingWithDefault(SETTING_PRICE_IGNORE_LOWEST_Q) == 1 ? 'checked=""' : "") + `><br/></div><div style="margin-top:6px;">Don't check market listings with prices of and below:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="` + SETTING_PRICE_MIN_CHECK_PRICE + '" value=' + getSettingWithDefault(SETTING_PRICE_MIN_CHECK_PRICE) + '><br/></div><div style="margin-top:24px">Show price labels in inventory:&nbsp;<input class="price_option_input" style="background-color: black;color: white;border: transparent;" type="checkbox" id="' + SETTING_INVENTORY_PRICE_LABELS + '" ' + (getSettingWithDefault(SETTING_INVENTORY_PRICE_LABELS) == 1 ? 'checked=""' : "") + '></div><div style="margin-top:6px">Show price labels in trade offers:&nbsp;<input class="price_option_input" style="background-color: black;color: white;border: transparent;" type="checkbox" id="' + SETTING_TRADEOFFER_PRICE_LABELS + '" ' + (getSettingWithDefault(SETTING_TRADEOFFER_PRICE_LABELS) == 1 ? 'checked=""' : "") + '></div><div style="margin-top:24px"><div style="margin-bottom:6px;">Minimum:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_NORMAL_PRICE + '" value=' + getSettingWithDefault(SETTING_MIN_NORMAL_PRICE) + '>&nbsp;and maximum:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_NORMAL_PRICE + '" value=' + getSettingWithDefault(SETTING_MAX_NORMAL_PRICE) + '>&nbsp;price for normal cards<br/></div><div style="margin-bottom:6px;">Minimum:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_FOIL_PRICE + '" value=' + getSettingWithDefault(SETTING_MIN_FOIL_PRICE) + '>&nbsp;and maximum:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_FOIL_PRICE + '" value=' + getSettingWithDefault(SETTING_MAX_FOIL_PRICE) + '>&nbsp;price for foil cards<br/></div><div style="margin-bottom:6px;">Minimum:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MIN_MISC_PRICE + '" value=' + getSettingWithDefault(SETTING_MIN_MISC_PRICE) + '>&nbsp;and maximum:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MAX_MISC_PRICE + '" value=' + getSettingWithDefault(SETTING_MAX_MISC_PRICE) + '>&nbsp;price for other items<br/></div><div style="margin-top:24px;margin-bottom:6px;">Market items per page:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MARKET_PAGE_COUNT + '" value=' + getSettingWithDefault(SETTING_MARKET_PAGE_COUNT) + '><br/><div style="margin-top:6px;">Automatically relist overpriced market listings (slow on large inventories):&nbsp;<input id="' + SETTING_RELIST_AUTOMATICALLY + '" class="market_relist_auto" type="checkbox" ' + (getSettingWithDefault(SETTING_RELIST_AUTOMATICALLY) == 1 ? 'checked=""' : "") + "></label></div></div></div>");
      var dialog = unsafeWindow.ShowConfirmDialog("Steam Economy Enhancer", price_options).done(function() {
        setSetting(SETTING_MIN_NORMAL_PRICE, $("#" + SETTING_MIN_NORMAL_PRICE, price_options).val());
        setSetting(SETTING_MAX_NORMAL_PRICE, $("#" + SETTING_MAX_NORMAL_PRICE, price_options).val());
        setSetting(SETTING_MIN_FOIL_PRICE, $("#" + SETTING_MIN_FOIL_PRICE, price_options).val());
        setSetting(SETTING_MAX_FOIL_PRICE, $("#" + SETTING_MAX_FOIL_PRICE, price_options).val());
        setSetting(SETTING_MIN_MISC_PRICE, $("#" + SETTING_MIN_MISC_PRICE, price_options).val());
        setSetting(SETTING_MAX_MISC_PRICE, $("#" + SETTING_MAX_MISC_PRICE, price_options).val());
        setSetting(SETTING_PRICE_OFFSET, $("#" + SETTING_PRICE_OFFSET, price_options).val());
        setSetting(SETTING_PRICE_MIN_CHECK_PRICE, $("#" + SETTING_PRICE_MIN_CHECK_PRICE, price_options).val());
        setSetting(SETTING_PRICE_ALGORITHM, $("#" + SETTING_PRICE_ALGORITHM, price_options).val());
        setSetting(SETTING_PRICE_IGNORE_LOWEST_Q, $("#" + SETTING_PRICE_IGNORE_LOWEST_Q, price_options).prop("checked") ? 1 : 0);
        setSetting(SETTING_PRICE_HISTORY_HOURS, $("#" + SETTING_PRICE_HISTORY_HOURS, price_options).val());
        setSetting(SETTING_MARKET_PAGE_COUNT, $("#" + SETTING_MARKET_PAGE_COUNT, price_options).val());
        setSetting(SETTING_RELIST_AUTOMATICALLY, $("#" + SETTING_RELIST_AUTOMATICALLY, price_options).prop("checked") ? 1 : 0);
        setSetting(SETTING_INVENTORY_PRICE_LABELS, $("#" + SETTING_INVENTORY_PRICE_LABELS, price_options).prop("checked") ? 1 : 0);
        setSetting(SETTING_TRADEOFFER_PRICE_LABELS, $("#" + SETTING_TRADEOFFER_PRICE_LABELS, price_options).prop("checked") ? 1 : 0);
        window.location.reload();
      });
    }
    var userScrolled = false;
    var logger = document.createElement("div");
    logger.setAttribute("id", "logger");
    function updateScroll() {
      if (!userScrolled) {
        var element = document.getElementById("logger");
        element.scrollTop = element.scrollHeight;
      }
    }
    function logDOM(text) {
      logger.innerHTML += text + "<br/>";
      updateScroll();
    }
    function clearLogDOM() {
      logger.innerHTML = "";
      updateScroll();
    }
    function logConsole(text) {
      if (enableConsoleLog) {
        console.log(text);
      }
    }
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
      maxPrice = maxPrice * 100;
      minPrice = minPrice * 100;
      var maxPriceBeforeFees = market.getPriceBeforeFees(maxPrice);
      var minPriceBeforeFees = market.getPriceBeforeFees(minPrice);
      return {
        maxPrice,
        minPrice,
        maxPriceBeforeFees,
        minPriceBeforeFees
      };
    }
    function calculateAverageHistoryPriceBeforeFees(history) {
      var highest = 0;
      var total = 0;
      if (history != null) {
        var timeAgo = Date.now() - getSettingWithDefault(SETTING_PRICE_HISTORY_HOURS) * 60 * 60 * 1e3;
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
    function calculateListingPriceBeforeFees(histogram) {
      if (typeof histogram === "undefined" || histogram == null || histogram.lowest_sell_order == null || histogram.sell_order_graph == null)
        return 0;
      var listingPrice = market.getPriceBeforeFees(histogram.lowest_sell_order);
      var shouldIgnoreLowestListingOnLowQuantity = getSettingWithDefault(SETTING_PRICE_IGNORE_LOWEST_Q) == 1;
      if (shouldIgnoreLowestListingOnLowQuantity && histogram.sell_order_graph.length >= 2) {
        var listingPrice2ndLowest = market.getPriceBeforeFees(histogram.sell_order_graph[1][0] * 100);
        if (listingPrice2ndLowest > listingPrice) {
          var numberOfListingsLowest = histogram.sell_order_graph[0][1];
          var numberOfListings2ndLowest = histogram.sell_order_graph[1][1];
          var percentageLower = 100 * (numberOfListingsLowest / numberOfListings2ndLowest);
          if (numberOfListings2ndLowest >= 1e3 && percentageLower <= 5) {
            listingPrice = listingPrice2ndLowest;
          } else if (numberOfListings2ndLowest < 1e3 && percentageLower <= 10) {
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
      if (typeof histogram === "undefined")
        return 0;
      return market.getPriceBeforeFees(histogram.highest_buy_order);
    }
    function calculateSellPriceBeforeFees(history, histogram, applyOffset, minPriceBeforeFees, maxPriceBeforeFees) {
      var historyPrice = calculateAverageHistoryPriceBeforeFees(history);
      var listingPrice = calculateListingPriceBeforeFees(histogram);
      var buyPrice = calculateBuyOrderPriceBeforeFees(histogram);
      var shouldUseAverage = getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1;
      var shouldUseBuyOrder = getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 3;
      var calculatedPrice = 0;
      if (shouldUseBuyOrder && buyPrice !== -2) {
        calculatedPrice = buyPrice;
      } else if (historyPrice < listingPrice || !shouldUseAverage) {
        calculatedPrice = listingPrice;
      } else {
        calculatedPrice = historyPrice;
      }
      var changedToMax = false;
      if (calculatedPrice == 0) {
        calculatedPrice = maxPriceBeforeFees;
        changedToMax = true;
      }
      if (!changedToMax && applyOffset) {
        calculatedPrice = calculatedPrice + getSettingWithDefault(SETTING_PRICE_OFFSET) * 100;
      }
      calculatedPrice = clamp(calculatedPrice, minPriceBeforeFees, maxPriceBeforeFees);
      if (typeof histogram !== "undefined" && histogram != null && histogram.highest_buy_order != null) {
        var buyOrderPrice = market.getPriceBeforeFees(histogram.highest_buy_order);
        if (buyOrderPrice > calculatedPrice)
          calculatedPrice = buyOrderPrice;
      }
      return calculatedPrice;
    }
    function getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    function getNumberOfDigits(x) {
      return (Math.log10((x ^ x >> 31) - (x >> 31)) | 0) + 1;
    }
    function padLeftZero(str, max) {
      str = str.toString();
      return str.length < max ? padLeftZero("0" + str, max) : str;
    }
    function replaceNonNumbers(str) {
      return str.replace(/\D/g, "");
    }
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
      var tags = item.tags != null ? item.tags : item.description != null && item.description.tags != null ? item.description.tags : null;
      if (tags != null) {
        var isTaggedAsCrate = false;
        tags.forEach(function(arrayItem) {
          if (arrayItem.category == "Type") {
            if (arrayItem.internal_name == "Supply Crate")
              isTaggedAsCrate = true;
          }
        });
        if (isTaggedAsCrate)
          return true;
      }
    }
    function getIsTradingCard(item) {
      if (item == null)
        return false;
      var tags = item.tags != null ? item.tags : item.description != null && item.description.tags != null ? item.description.tags : null;
      if (tags != null) {
        var isTaggedAsTradingCard = false;
        tags.forEach(function(arrayItem) {
          if (arrayItem.category == "item_class") {
            if (arrayItem.internal_name == "item_class_2")
              isTaggedAsTradingCard = true;
          }
        });
        if (isTaggedAsTradingCard)
          return true;
      }
      if (item.owner_actions != null) {
        for (var i = 0; i < item.owner_actions.length; i++) {
          if (item.owner_actions[i].link == null)
            continue;
          if (item.owner_actions[i].link.toString().toLowerCase().includes("gamecards"))
            return true;
        }
      }
      if (item.type != null && item.type.toLowerCase().includes("trading card"))
        return true;
      return false;
    }
    function getIsFoilTradingCard(item) {
      if (!getIsTradingCard(item))
        return false;
      var tags = item.tags != null ? item.tags : item.description != null && item.description.tags != null ? item.description.tags : null;
      if (tags != null) {
        var isTaggedAsFoilTradingCard = false;
        tags.forEach(function(arrayItem) {
          if (arrayItem.category == "cardborder") {
            if (arrayItem.internal_name == "cardborder_1")
              isTaggedAsFoilTradingCard = true;
          }
        });
        if (isTaggedAsFoilTradingCard)
          return true;
      }
      if (item.owner_actions != null) {
        for (var i = 0; i < item.owner_actions.length; i++) {
          if (item.owner_actions[i].link == null)
            continue;
          if (item.owner_actions[i].link.toString().toLowerCase().includes("gamecards") && item.owner_actions[i].link.toString().toLowerCase().includes("border"))
            return true;
        }
      }
      if (item.type != null && item.type.toLowerCase().includes("foil trading card"))
        return true;
      return false;
    }
    function CalculateFeeAmount(amount, publisherFee, walletInfo) {
      if (walletInfo == null || !walletInfo["wallet_fee"]) {
        return {
          fees: 0
        };
      }
      publisherFee = publisherFee == null ? 0 : publisherFee;
      var iterations = 0;
      var nEstimatedAmountOfWalletFundsReceivedByOtherParty = parseInt((amount - parseInt(walletInfo["wallet_fee_base"])) / (parseFloat(walletInfo["wallet_fee_percent"]) + parseFloat(publisherFee) + 1));
      var bEverUndershot = false;
      var fees = CalculateAmountToSendForDesiredReceivedAmount(nEstimatedAmountOfWalletFundsReceivedByOtherParty, publisherFee, walletInfo);
      while (fees.amount != amount && iterations < 10) {
        if (fees.amount > amount) {
          if (bEverUndershot) {
            fees = CalculateAmountToSendForDesiredReceivedAmount(nEstimatedAmountOfWalletFundsReceivedByOtherParty - 1, publisherFee, walletInfo);
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
        fees = CalculateAmountToSendForDesiredReceivedAmount(nEstimatedAmountOfWalletFundsReceivedByOtherParty, publisherFee, walletInfo);
        iterations++;
      }
      return fees;
    }
    function clamp(cur, min, max) {
      if (cur < min)
        cur = min;
      if (cur > max)
        cur = max;
      return cur;
    }
    function CalculateAmountToSendForDesiredReceivedAmount(receivedAmount, publisherFee, walletInfo) {
      if (walletInfo == null || !walletInfo["wallet_fee"]) {
        return {
          amount: receivedAmount
        };
      }
      publisherFee = publisherFee == null ? 0 : publisherFee;
      var nSteamFee = parseInt(Math.floor(Math.max(receivedAmount * parseFloat(walletInfo["wallet_fee_percent"]), walletInfo["wallet_fee_minimum"]) + parseInt(walletInfo["wallet_fee_base"])));
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
      var ca = document.cookie.split(";");
      for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == " ")
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
    injectCss('.ui-selected { outline: 2px dashed #FFFFFF; } #logger { color: #767676; font-size: 12px;margin-top:16px; max-height: 200px; overflow-y: auto; }.trade_offer_sum { color: #767676; font-size: 12px;margin-top:8px; }.trade_offer_buttons { margin-top: 12px; }.market_commodity_orders_table { font-size:12px; font-family: "Motiva Sans", Sans-serif; font-weight: 300; }.market_commodity_orders_table th { padding-left: 10px; }#listings_group { display: flex; justify-content: space-between; margin-bottom: 8px; }#listings_sell { text-align: right; color: #589328; font-weight:600; }#listings_buy { text-align: right; color: #589328; font-weight:600; }.market_listing_my_price { height: 50px; padding-right:6px; }.market_listing_edit_buttons.actual_content { width:276px; transition-property: background-color, border-color; transition-timing-function: linear; transition-duration: 0.5s;}.market_listing_buttons { margin-top: 6px; background: rgba(0, 0, 0, 0.4); padding: 5px 0px 1px 0px; }.market_listing_button { margin-right: 4px; }.market_listing_button_right { float:right; }.market_listing_button:first-child { margin-left: 4px; }.market_listing_label_right { float:right; font-size:12px; margin-top:1px; }.market_listing_select { position: absolute; top: 16px;right: 10px; display: flex; }#market_listing_relist { vertical-align: middle; position: relative; bottom: -1px; right: 2px; }.pick_and_sell_button > a { vertical-align: middle; }.market_relist_auto { margin-bottom: 8px;  }.market_relist_auto_label { margin-right: 6px;  }.quick_sell { margin-right: 4px; }.spinner{margin:10px auto;width:50px;height:40px;text-align:center;font-size:10px;}.spinner > div{background-color:#ccc;height:100%;width:6px;display:inline-block;-webkit-animation:sk-stretchdelay 1.2s infinite ease-in-out;animation:sk-stretchdelay 1.2s infinite ease-in-out}.spinner .rect2{-webkit-animation-delay:-1.1s;animation-delay:-1.1s}.spinner .rect3{-webkit-animation-delay:-1s;animation-delay:-1s}.spinner .rect4{-webkit-animation-delay:-.9s;animation-delay:-.9s}.spinner .rect5{-webkit-animation-delay:-.8s;animation-delay:-.8s}@-webkit-keyframes sk-stretchdelay{0%,40%,100%{-webkit-transform:scaleY(0.4)}20%{-webkit-transform:scaleY(1.0)}}@keyframes sk-stretchdelay{0%,40%,100%{transform:scaleY(0.4);-webkit-transform:scaleY(0.4)}20%{transform:scaleY(1.0);-webkit-transform:scaleY(1.0)}}#market_name_search { float: right; background: rgba(0, 0, 0, 0.25); color: white; border: none;height: 25px; padding-left: 6px;}.price_option_price { width: 100px }#see_settings { background: #26566c; margin-right: 10px; height: 24px; line-height:24px; display:inline-block; padding: 0px 6px; }.inventory_item_price { top: 0px;position: absolute;right: 0;background: #3571a5;padding: 2px;color: white; font-size:11px; border: 1px solid #666666;}.separator-large {display:inline-block;width:6px;}.separator-small {display:inline-block;width:1px;}.separator-btn-right {margin-right:12px;}.pagination { padding-left: 0px; }.pagination li { display:inline-block; padding: 5px 10px;background: rgba(255, 255, 255, 0.10); margin-right: 6px; border: 1px solid #666666; }.pagination li.active { background: rgba(255, 255, 255, 0.25); }');
    $(document).ready(function() {
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
      head = document.getElementsByTagName("head")[0];
      if (!head) {
        return;
      }
      style = document.createElement("style");
      style.type = "text/css";
      style.innerHTML = css;
      head.appendChild(style);
    }
    function injectJs(js) {
      var script = document.createElement("script");
      script.setAttribute("type", "application/javascript");
      script.textContent = "(" + js + ")();";
      document.body.appendChild(script);
      document.body.removeChild(script);
    }
    $.fn.delayedEach = function(timeout, callback, continuous) {
      var $els, iterator;
      $els = this;
      iterator = function(index) {
        var cur;
        if (index >= $els.length) {
          if (!continuous) {
            return;
          }
          index = 0;
        }
        cur = $els[index];
        callback.call(cur, index, cur);
        setTimeout(function() {
          iterator(++index);
        }, timeout);
      };
      iterator(0);
    };
    String.prototype.replaceAll = function(search, replacement) {
      var target = this;
      return target.replace(new RegExp(search, "g"), replacement);
    };
    if (currentPage == PAGE_MARKET || currentPage == PAGE_MARKET_LISTING) {
      let getPriceFromMarketListing2 = function(listing) {
        var priceLabel = listing.trim().replace("--", "00");
        if (priceLabel[priceLabel.length - 1] === "." || priceLabel[priceLabel.length - 1] === ",")
          priceLabel = priceLabel.slice(0, -1);
        if (priceLabel.indexOf(".") === -1 && priceLabel.indexOf(",") === -1) {
          priceLabel = priceLabel + ",00";
        }
        return parseInt(replaceNonNumbers(priceLabel));
      }, marketListingsQueueWorker2 = function(listing, ignoreErrors, callback) {
        var asset = unsafeWindow.g_rgAssets[listing.appid][listing.contextid][listing.assetid];
        var market_hash_name = getMarketHashName(asset);
        var appid = listing.appid;
        var listingUI = $(getListingFromLists2(listing.listingid).elm);
        var game_name = asset.type;
        var price = getPriceFromMarketListing2($(".market_listing_price > span:nth-child(1) > span:nth-child(1)", listingUI).text());
        if (price <= getSettingWithDefault(SETTING_PRICE_MIN_CHECK_PRICE) * 100) {
          $(".market_listing_my_price", listingUI).last().css("background", COLOR_PRICE_NOT_CHECKED);
          $(".market_listing_my_price", listingUI).last().prop("title", "The price is not checked.");
          listingUI.addClass("not_checked");
          return callback(true, true);
        }
        var priceInfo = getPriceInformationFromItem(asset);
        var item = {
          appid: parseInt(appid),
          description: {
            market_hash_name
          }
        };
        var failed = 0;
        market.getPriceHistory(item, true, function(errorPriceHistory, history, cachedHistory) {
          if (errorPriceHistory) {
            logConsole("Failed to get price history for " + game_name);
            if (errorPriceHistory == ERROR_FAILED)
              failed += 1;
          }
          market.getItemOrdersHistogram(item, true, function(errorHistogram, histogram, cachedListings) {
            if (errorHistogram) {
              logConsole("Failed to get orders histogram for " + game_name);
              if (errorHistogram == ERROR_FAILED)
                failed += 1;
            }
            if (failed > 0 && !ignoreErrors) {
              return callback(false, cachedHistory && cachedListings);
            }
            var highestBuyOrderPrice = histogram == null || histogram.highest_buy_order == null ? "-" : histogram.highest_buy_order / 100 + currencySymbol;
            $(".market_table_value > span:nth-child(1) > span:nth-child(1) > span:nth-child(1)", listingUI).append(' \u27A4 <span title="This is likely the highest buy order price.">' + highestBuyOrderPrice + "</span>");
            logConsole("============================");
            logConsole(JSON.stringify(listing));
            logConsole(game_name + ": " + asset.name);
            logConsole("Current price: " + price / 100);
            var sellPriceWithoutOffset = calculateSellPriceBeforeFees(history, histogram, false, priceInfo.minPriceBeforeFees, priceInfo.maxPriceBeforeFees);
            var sellPriceWithOffset = calculateSellPriceBeforeFees(history, histogram, true, priceInfo.minPriceBeforeFees, priceInfo.maxPriceBeforeFees);
            var sellPriceWithoutOffsetWithFees = market.getPriceIncludingFees(sellPriceWithoutOffset);
            logConsole("Calculated price: " + sellPriceWithoutOffsetWithFees / 100 + " (" + sellPriceWithoutOffset / 100 + ")");
            listingUI.addClass("price_" + sellPriceWithOffset);
            $(".market_listing_my_price", listingUI).last().prop("title", "The best price is " + sellPriceWithoutOffsetWithFees / 100 + currencySymbol + ".");
            if (sellPriceWithoutOffsetWithFees < price) {
              logConsole("Sell price is too high.");
              $(".market_listing_my_price", listingUI).last().css("background", COLOR_PRICE_EXPENSIVE);
              listingUI.addClass("overpriced");
              if (getSettingWithDefault(SETTING_RELIST_AUTOMATICALLY) == 1) {
                queueOverpricedItemListing2(listing.listingid);
              }
            } else if (sellPriceWithoutOffsetWithFees > price) {
              logConsole("Sell price is too low.");
              $(".market_listing_my_price", listingUI).last().css("background", COLOR_PRICE_CHEAP);
              listingUI.addClass("underpriced");
            } else {
              logConsole("Sell price is fair.");
              $(".market_listing_my_price", listingUI).last().css("background", COLOR_PRICE_FAIR);
              listingUI.addClass("fair");
            }
            return callback(true, cachedHistory && cachedListings);
          });
        });
      }, marketOverpricedQueueWorker2 = function(item, ignoreErrors, callback) {
        var listingUI = getListingFromLists2(item.listing).elm;
        market.removeListing(item.listing, function(errorRemove, data) {
          if (!errorRemove) {
            $(".actual_content", listingUI).css("background", COLOR_PENDING);
            setTimeout(function() {
              var baseUrl = $(".header_notification_items").first().attr("href") + "json/";
              var itemName = $(".market_listing_item_name_link", listingUI).first().attr("href");
              var marketHashNameIndex = itemName.lastIndexOf("/") + 1;
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
                    $(".actual_content", listingUI).css("background", COLOR_ERROR);
                    return callback(false);
                  }
                  item.assetid = newAssetId;
                  marketListingsRelistedAssets.push(newAssetId);
                  market.sellItem(item, item.sellPrice, function(errorSell) {
                    if (!errorSell) {
                      $(".actual_content", listingUI).css("background", COLOR_SUCCESS);
                      setTimeout(function() {
                        removeListingFromLists2(item.listing);
                      }, 3e3);
                      return callback(true);
                    } else {
                      $(".actual_content", listingUI).css("background", COLOR_ERROR);
                      return callback(false);
                    }
                  });
                } else {
                  $(".actual_content", listingUI).css("background", COLOR_ERROR);
                  return callback(false);
                }
              });
            }, getRandomInt(1500, 2500));
          } else {
            $(".actual_content", listingUI).css("background", COLOR_ERROR);
            return callback(false);
          }
        });
      }, queueOverpricedItemListing2 = function(listingid) {
        var assetInfo = getAssetInfoFromListingId2(listingid);
        var listingUI = $(getListingFromLists2(listingid).elm);
        var price = -1;
        var items = $(listingUI).attr("class").split(" ");
        for (var i in items) {
          if (items[i].toString().includes("price_"))
            price = parseInt(items[i].toString().replace("price_", ""));
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
      }, marketRemoveQueueWorker2 = function(listingid, ignoreErrors, callback) {
        var listingUI = getListingFromLists2(listingid).elm;
        market.removeListing(listingid, function(errorRemove, data) {
          if (!errorRemove) {
            $(".actual_content", listingUI).css("background", COLOR_SUCCESS);
            setTimeout(function() {
              removeListingFromLists2(listingid);
              var numberOfListings = marketLists[0].size;
              if (numberOfListings > 0) {
                $("#my_market_selllistings_number").text(numberOfListings.toString());
                $("#my_market_activelistings_number").text(numberOfListings.toString());
              }
            }, 3e3);
            return callback(true);
          } else {
            $(".actual_content", listingUI).css("background", COLOR_ERROR);
            return callback(false);
          }
        });
      }, fillMarketListingsQueue2 = function() {
        $(".market_home_listing_table").each(function(e) {
          if ($(".my_market_header", $(this)).length == 0)
            return;
          if (!$(this).attr("id")) {
            $(this).attr("id", "market-listing-" + e);
            $(this).append('<div class="market_listing_see" id="market-listing-container-' + e + '"></div>');
            $(".market_listing_row", $(this)).appendTo($("#market-listing-container-" + e));
          } else {
            $(this).children().last().addClass("market_listing_see");
          }
          addMarketPagination2($(".market_listing_see", this).last());
          sortMarketListings2($(this), false, false, true);
        });
        var totalPriceBuyer = 0;
        var totalPriceSeller = 0;
        for (var i = 0; i < marketLists.length; i++) {
          for (var j = 0; j < marketLists[i].items.length; j++) {
            var listingid = replaceNonNumbers(marketLists[i].items[j].values().market_listing_item_name);
            var assetInfo = getAssetInfoFromListingId2(listingid);
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
        $("#my_market_selllistings_number").append('<span id="my_market_sellistings_total_price">, ' + (totalPriceBuyer / 100).toFixed(2) + currencySymbol + " \u27A4 " + (totalPriceSeller / 100).toFixed(2) + currencySymbol + "</span>");
      }, getAssetInfoFromListingId2 = function(listingid) {
        var listing = getListingFromLists2(listingid);
        if (listing == null) {
          return {};
        }
        var actionButton = $(".item_market_action_button", listing.elm).attr("href");
        if (actionButton == null || actionButton.toLowerCase().includes("cancelmarketbuyorder"))
          return {};
        var priceBuyer = getPriceFromMarketListing2($(".market_listing_price > span:nth-child(1) > span:nth-child(1)", listing.elm).text());
        var priceSeller = getPriceFromMarketListing2($(".market_listing_price > span:nth-child(1) > span:nth-child(3)", listing.elm).text());
        var itemIds = actionButton.split(",");
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
      }, addMarketPagination2 = function(market_listing_see) {
        market_listing_see.addClass("list");
        market_listing_see.before('<ul class="paginationTop pagination"></ul>');
        market_listing_see.after('<ul class="paginationBottom pagination"></ul>');
        $(".market_listing_table_header", market_listing_see.parent()).append('<input class="search" id="market_name_search" placeholder="Search..." />');
        var options = {
          valueNames: [
            "market_listing_game_name",
            "market_listing_item_name_link",
            "market_listing_price",
            "market_listing_listed_date",
            {
              name: "market_listing_item_name",
              attr: "id"
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
        var list = new List(market_listing_see.parent().attr("id"), options);
        list.on("searchComplete", updateMarketSelectAllButton2);
        marketLists.push(list);
      }, addMarketCheckboxes2 = function() {
        $(".market_listing_row").each(function() {
          if ($(".market_listing_select", this).length == 0) {
            $(".market_listing_cancel_button", $(this)).append('<div class="market_listing_select"><input type="checkbox" class="market_select_item"/></div>');
            $(".market_select_item", this).change(function(e) {
              updateMarketSelectAllButton2();
            });
          }
        });
      }, processMarketListings2 = function() {
        addMarketCheckboxes2();
        if (currentPage == PAGE_MARKET) {
          var currentCount = 0;
          var totalCount = 0;
          if (typeof unsafeWindow.g_oMyListings !== "undefined" && unsafeWindow.g_oMyListings != null && unsafeWindow.g_oMyListings.m_cTotalCount != null)
            totalCount = unsafeWindow.g_oMyListings.m_cTotalCount;
          else {
            totalCount = parseInt($("#my_market_selllistings_number").text());
          }
          if (isNaN(totalCount) || totalCount == 0) {
            fillMarketListingsQueue2();
            return;
          }
          $("#tabContentsMyActiveMarketListingsRows").html("");
          $("#tabContentsMyActiveMarketListingsRows").hide();
          $("#tabContentsMyActiveMarketListings_ctn").hide();
          $(".market_pagesize_options").hide();
          $(".my_market_header").eq(0).append('<div id="market_listings_spinner">' + spinnerBlock + '<div style="text-align:center">Loading market listings</div></div>');
          while (currentCount < totalCount) {
            marketListingsItemsQueue.push(currentCount);
            currentCount += 100;
          }
        } else {
          $(".market_home_listing_table").each(function(e) {
            if ($("#market_buyorder_info_show_details", $(this)).length > 0)
              return;
            $(this).children().last().addClass("market_listing_see");
            addMarketPagination2($(".market_listing_see", this).last());
            sortMarketListings2($(this), false, false, true);
          });
          $("#tabContentsMyActiveMarketListingsRows > .market_listing_row").each(function() {
            var listingid = $(this).attr("id").replace("mylisting_", "").replace("mybuyorder_", "").replace("mbuyorder_", "");
            var assetInfo = getAssetInfoFromListingId2(listingid);
            var existingAsset = null;
            for (var appid in unsafeWindow.g_rgAssets) {
              for (var contextid in unsafeWindow.g_rgAssets[appid]) {
                for (var assetid in unsafeWindow.g_rgAssets[appid][contextid]) {
                  existingAsset = unsafeWindow.g_rgAssets[appid][contextid][assetid];
                  break;
                }
              }
            }
            unsafeWindow.g_rgAssets[appid][contextid][assetInfo.assetid] = existingAsset;
            marketListingsQueue.push({
              listingid,
              appid: assetInfo.appid,
              contextid: assetInfo.contextid,
              assetid: assetInfo.assetid
            });
          });
        }
      }, updateMarketSelectAllButton2 = function() {
        $(".market_listing_buttons").each(function() {
          var selectionGroup = $(this).parent().parent();
          var invert = $(".market_select_item:checked", selectionGroup).length == $(".market_select_item", selectionGroup).length;
          if ($(".market_select_item", selectionGroup).length == 0)
            invert = false;
          $(".select_all > span", selectionGroup).text(invert ? "Deselect all" : "Select all");
        });
      }, sortMarketListings2 = function(elem, isPrice, isDate, isName) {
        var list = getListFromContainer2(elem);
        if (list == null) {
          console.log("Invalid parameter, could not find a list matching elem.");
          return;
        }
        var nextSort = isPrice ? 1 : isDate ? 2 : 3;
        var asc = true;
        const arrow_down = "\u{1F87B}";
        const arrow_up = "\u{1F879}";
        $(".market_listing_table_header > span", elem).each(function() {
          if ($(this).hasClass("market_listing_edit_buttons"))
            return;
          if ($(this).text().includes(arrow_up))
            asc = false;
          $(this).text($(this).text().replace(" " + arrow_down, "").replace(" " + arrow_up, ""));
        });
        var market_listing_selector;
        if (isPrice) {
          market_listing_selector = $(".market_listing_table_header", elem).children().eq(1);
        } else if (isDate) {
          market_listing_selector = $(".market_listing_table_header", elem).children().eq(2);
        } else if (isName) {
          market_listing_selector = $(".market_listing_table_header", elem).children().eq(3);
        }
        market_listing_selector.text(market_listing_selector.text() + " " + (asc ? arrow_up : arrow_down));
        if (list.sort == null)
          return;
        if (isName) {
          list.sort("", {
            order: asc ? "asc" : "desc",
            sortFunction: function(a, b) {
              if (a.values().market_listing_game_name.toLowerCase().localeCompare(b.values().market_listing_game_name.toLowerCase()) == 0) {
                return a.values().market_listing_item_name_link.toLowerCase().localeCompare(b.values().market_listing_item_name_link.toLowerCase());
              }
              return a.values().market_listing_game_name.toLowerCase().localeCompare(b.values().market_listing_game_name.toLowerCase());
            }
          });
        } else if (isDate) {
          var currentMonth = DateTime.local().month;
          list.sort("market_listing_listed_date", {
            order: asc ? "asc" : "desc",
            sortFunction: function(a, b) {
              var firstDate = DateTime.fromString(a.values().market_listing_listed_date.trim(), "d MMM");
              var secondDate = DateTime.fromString(b.values().market_listing_listed_date.trim(), "d MMM");
              if (firstDate == null || secondDate == null) {
                return 0;
              }
              if (firstDate.month > currentMonth)
                firstDate = firstDate.plus({ years: -1 });
              if (secondDate.month > currentMonth)
                secondDate = secondDate.plus({ years: -1 });
              if (firstDate > secondDate)
                return 1;
              if (firstDate === secondDate)
                return 0;
              return -1;
            }
          });
        } else if (isPrice) {
          list.sort("market_listing_price", {
            order: asc ? "asc" : "desc",
            sortFunction: function(a, b) {
              var listingPriceA = $(a.values().market_listing_price).text();
              listingPriceA = listingPriceA.substr(0, listingPriceA.indexOf("("));
              listingPriceA = listingPriceA.replace("--", "00");
              var listingPriceB = $(b.values().market_listing_price).text();
              listingPriceB = listingPriceB.substr(0, listingPriceB.indexOf("("));
              listingPriceB = listingPriceB.replace("--", "00");
              var firstPrice = parseInt(replaceNonNumbers(listingPriceA));
              var secondPrice = parseInt(replaceNonNumbers(listingPriceB));
              return firstPrice - secondPrice;
            }
          });
        }
      }, getListFromContainer2 = function(group) {
        for (var i = 0; i < marketLists.length; i++) {
          if (group.attr("id") == $(marketLists[i].listContainer).attr("id"))
            return marketLists[i];
        }
      }, getListingFromLists2 = function(listingid) {
        for (var i = marketLists.length - 1; i >= 0; i--) {
          var values = marketLists[i].get("market_listing_item_name", "mylisting_" + listingid + "_name");
          if (values != null && values.length > 0) {
            return values[0];
          }
          values = marketLists[i].get("market_listing_item_name", "mbuyorder_" + listingid + "_name");
          if (values != null && values.length > 0) {
            return values[0];
          }
        }
      }, removeListingFromLists2 = function(listingid) {
        for (var i = 0; i < marketLists.length; i++) {
          marketLists[i].remove("market_listing_item_name", "mylisting_" + listingid + "_name");
          marketLists[i].remove("market_listing_item_name", "mbuyorder_" + listingid + "_name");
        }
      }, initializeMarketUI2 = function() {
        $(".my_market_header").first().append('<div class="market_listing_buttons"><a class="item_market_action_button item_market_action_button_green select_all market_listing_button"><span class="item_market_action_button_contents" style="text-transform:none">Select all</span></a><span class="separator-small"></span><a class="item_market_action_button item_market_action_button_green remove_selected market_listing_button"><span class="item_market_action_button_contents" style="text-transform:none">Remove selected</span></a><a class="item_market_action_button item_market_action_button_green relist_selected market_listing_button market_listing_button_right"><span class="item_market_action_button_contents" style="text-transform:none">Relist selected</span></a><span class="separator-small"></span><a class="item_market_action_button item_market_action_button_green relist_overpriced market_listing_button market_listing_button_right"><span class="item_market_action_button_contents" style="text-transform:none">Relist overpriced</span></a><span class="separator-small"></span><a class="item_market_action_button item_market_action_button_green select_overpriced market_listing_button market_listing_button_right"><span class="item_market_action_button_contents" style="text-transform:none">Select overpriced</span></a></div>');
        $(".my_market_header").slice(1).append('<div class="market_listing_buttons"><a class="item_market_action_button item_market_action_button_green select_all market_listing_button"><span class="item_market_action_button_contents" style="text-transform:none">Select all</span></a><span class="separator-large"></span><a class="item_market_action_button item_market_action_button_green remove_selected market_listing_button"><span class="item_market_action_button_contents" style="text-transform:none">Remove selected</span></a></div>');
        $(".market_listing_table_header").on("click", "span", function() {
          if ($(this).hasClass("market_listing_edit_buttons") || $(this).hasClass("item_market_action_button_contents"))
            return;
          var isPrice = $(".market_listing_table_header", $(this).parent().parent()).children().eq(1).text() == $(this).text();
          var isDate = $(".market_listing_table_header", $(this).parent().parent()).children().eq(2).text() == $(this).text();
          var isName = $(".market_listing_table_header", $(this).parent().parent()).children().eq(3).text() == $(this).text();
          sortMarketListings2($(this).parent().parent(), isPrice, isDate, isName);
        });
        $(".select_all").on("click", "*", function() {
          var selectionGroup = $(this).parent().parent().parent().parent();
          var marketList = getListFromContainer2(selectionGroup);
          var invert = $(".market_select_item:checked", selectionGroup).length == $(".market_select_item", selectionGroup).length;
          for (var i = 0; i < marketList.matchingItems.length; i++) {
            $(".market_select_item", marketList.matchingItems[i].elm).prop("checked", !invert);
          }
          updateMarketSelectAllButton2();
        });
        $("#market_removelisting_dialog_accept").on("click", "*", function() {
          window.location.reload();
        });
        $(".select_overpriced").on("click", "*", function() {
          var selectionGroup = $(this).parent().parent().parent().parent();
          var marketList = getListFromContainer2(selectionGroup);
          for (var i = 0; i < marketList.matchingItems.length; i++) {
            if ($(marketList.matchingItems[i].elm).hasClass("overpriced")) {
              $(".market_select_item", marketList.matchingItems[i].elm).prop("checked", true);
            }
          }
          $(".market_listing_row", selectionGroup).each(function(index) {
            if ($(this).hasClass("overpriced"))
              $(".market_select_item", $(this)).prop("checked", true);
          });
          updateMarketSelectAllButton2();
        });
        $(".remove_selected").on("click", "*", function() {
          var selectionGroup = $(this).parent().parent().parent().parent();
          var marketList = getListFromContainer2(selectionGroup);
          for (var i = 0; i < marketList.matchingItems.length; i++) {
            if ($(".market_select_item", $(marketList.matchingItems[i].elm)).prop("checked")) {
              var listingid = replaceNonNumbers(marketList.matchingItems[i].values().market_listing_item_name);
              marketRemoveQueue.push(listingid);
            }
          }
        });
        $(".market_relist_auto").change(function() {
          setSetting(SETTING_RELIST_AUTOMATICALLY, $(".market_relist_auto").is(":checked") ? 1 : 0);
        });
        $(".relist_overpriced").on("click", "*", function() {
          var selectionGroup = $(this).parent().parent().parent().parent();
          var marketList = getListFromContainer2(selectionGroup);
          for (var i = 0; i < marketList.matchingItems.length; i++) {
            if ($(marketList.matchingItems[i].elm).hasClass("overpriced")) {
              var listingid = replaceNonNumbers(marketList.matchingItems[i].values().market_listing_item_name);
              queueOverpricedItemListing2(listingid);
            }
          }
        });
        $(".relist_selected").on("click", "*", function() {
          var selectionGroup = $(this).parent().parent().parent().parent();
          var marketList = getListFromContainer2(selectionGroup);
          for (var i = 0; i < marketList.matchingItems.length; i++) {
            if ($(marketList.matchingItems[i].elm).hasClass("overpriced") && $(".market_select_item", $(marketList.matchingItems[i].elm)).prop("checked")) {
              var listingid = replaceNonNumbers(marketList.matchingItems[i].values().market_listing_item_name);
              queueOverpricedItemListing2(listingid);
            }
          }
        });
        $("#see_settings").remove();
        $("#global_action_menu").prepend('<span id="see_settings"><a href="javascript:void(0)">\u2B16 Steam Economy Enhancer</a></span>');
        $("#see_settings").on("click", "*", () => openSettings());
        processMarketListings2();
      };
      var getPriceFromMarketListing = getPriceFromMarketListing2, marketListingsQueueWorker = marketListingsQueueWorker2, marketOverpricedQueueWorker = marketOverpricedQueueWorker2, queueOverpricedItemListing = queueOverpricedItemListing2, marketRemoveQueueWorker = marketRemoveQueueWorker2, fillMarketListingsQueue = fillMarketListingsQueue2, getAssetInfoFromListingId = getAssetInfoFromListingId2, addMarketPagination = addMarketPagination2, addMarketCheckboxes = addMarketCheckboxes2, processMarketListings = processMarketListings2, updateMarketSelectAllButton = updateMarketSelectAllButton2, sortMarketListings = sortMarketListings2, getListFromContainer = getListFromContainer2, getListingFromLists = getListingFromLists2, removeListingFromLists = removeListingFromLists2, initializeMarketUI = initializeMarketUI2;
      var marketListingsRelistedAssets = [];
      var marketListingsQueue = async2.queue(function(listing, next) {
        marketListingsQueueWorker2(listing, false, function(success, cached) {
          if (success) {
            setTimeout(function() {
              next();
            }, cached ? 0 : getRandomInt(1e3, 1500));
          } else {
            setTimeout(function() {
              marketListingsQueueWorker2(listing, true, function(success2, cached2) {
                next();
              });
            }, cached ? 0 : getRandomInt(3e4, 45e3));
          }
        });
      }, 1);
      marketListingsQueue.drain = function() {
        injectJs(function() {
          g_bMarketWindowHidden = false;
        });
      };
      var marketOverpricedQueue = async2.queue(function(item, next) {
        marketOverpricedQueueWorker2(item, false, function(success) {
          if (success) {
            setTimeout(function() {
              next();
            }, getRandomInt(1e3, 1500));
          } else {
            setTimeout(function() {
              marketOverpricedQueueWorker2(item, true, function(success2) {
                next();
              });
            }, getRandomInt(3e4, 45e3));
          }
        });
      }, 1);
      var marketRemoveQueue = async2.queue(function(listingid, next) {
        marketRemoveQueueWorker2(listingid, false, function(success) {
          if (success) {
            setTimeout(function() {
              next();
            }, getRandomInt(50, 100));
          } else {
            setTimeout(function() {
              marketRemoveQueueWorker2(listingid, true, function(success2) {
                next();
              });
            }, getRandomInt(3e4, 45e3));
          }
        });
      }, 10);
      var marketListingsItemsQueue = async2.queue(function(listing, next) {
        $.get(window.location.protocol + "//steamcommunity.com/market/mylistings?count=100&start=" + listing, function(data) {
          if (!data || !data.success) {
            next();
            return;
          }
          var myMarketListings = $("#tabContentsMyActiveMarketListingsRows");
          var nodes = $.parseHTML(data.results_html);
          var rows = $(".market_listing_row", nodes);
          myMarketListings.append(rows);
          unsafeWindow.MergeWithAssetArray(data.assets);
          next();
        }, "json").fail(function(data) {
          next();
          return;
        });
      }, 1);
      marketListingsItemsQueue.drain = function() {
        var myMarketListings = $("#tabContentsMyActiveMarketListingsRows");
        myMarketListings.checkboxes("range", true);
        var seen = {};
        $(".market_listing_row", myMarketListings).each(function() {
          var item_id = $(this).attr("id");
          if (seen[item_id])
            $(this).remove();
          else
            seen[item_id] = true;
          if ($(".item_market_action_button", this).attr("href").toLowerCase().includes("CancelMarketListingConfirmation".toLowerCase()))
            $(this).remove();
          if ($(".item_market_action_button", this).attr("href").toLowerCase().includes("CancelMarketBuyOrder".toLowerCase()))
            $(this).remove();
        });
        addMarketCheckboxes2();
        $("#market_listings_spinner").remove();
        myMarketListings.show();
        fillMarketListingsQueue2();
        injectJs(function() {
          g_bMarketWindowHidden = true;
        });
      };
    }
    SteamMarket.prototype.sellItem = function(item, price, callback) {
      var sessionId = readCookie("sessionid");
      var itemId = item.assetid || item.id;
      $.ajax({
        type: "POST",
        url: "https://steamcommunity.com/market/sellitem/",
        data: {
          sessionid: sessionId,
          appid: item.appid,
          contextid: item.contextid,
          assetid: itemId,
          amount: 1,
          price
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
        dataType: "json"
      });
    };
    SteamMarket.prototype.removeListing = function(item, callback) {
      var sessionId = readCookie("sessionid");
      $.ajax({
        type: "POST",
        url: window.location.protocol + "//steamcommunity.com/market/removelisting/" + item,
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
        dataType: "json"
      });
    };
    SteamMarket.prototype.getPriceHistory = function(item, cache, callback) {
      try {
        var market_name = getMarketHashName(item);
        if (market_name == null) {
          callback(ERROR_FAILED);
          return;
        }
        var appid = item.appid;
        if (cache) {
          var storage_hash = "pricehistory_" + appid + "+" + market_name;
          storageSession.getItem(storage_hash).then(function(value) {
            if (value != null)
              callback(ERROR_SUCCESS, value, true);
            else
              market.getCurrentPriceHistory(appid, market_name, callback);
          }).catch(function(error) {
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
        var sessionId = readCookie("sessionid");
        $.ajax({
          type: "GET",
          url: this.inventoryUrlBase + "ajaxgetgoovalue/",
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
          dataType: "json"
        });
      } catch (e) {
        return callback(ERROR_FAILED);
      }
    };
    SteamMarket.prototype.grindIntoGoo = function(item, callback) {
      try {
        var sessionId = readCookie("sessionid");
        $.ajax({
          type: "POST",
          url: this.inventoryUrlBase + "ajaxgrindintogoo/",
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
          dataType: "json"
        });
      } catch (e) {
        return callback(ERROR_FAILED);
      }
    };
    SteamMarket.prototype.unpackBoosterPack = function(item, callback) {
      try {
        var sessionId = readCookie("sessionid");
        $.ajax({
          type: "POST",
          url: this.inventoryUrlBase + "ajaxunpackbooster/",
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
          dataType: "json"
        });
      } catch (e) {
        return callback(ERROR_FAILED);
      }
    };
    SteamMarket.prototype.getCurrentPriceHistory = function(appid, market_name, callback) {
      var url = window.location.protocol + "//steamcommunity.com/market/pricehistory/?appid=" + appid + "&market_hash_name=" + market_name;
      $.get(url, function(data) {
        if (!data || !data.success || !data.prices) {
          callback(ERROR_DATA);
          return;
        }
        for (var i = 0; i < data.prices.length; i++) {
          data.prices[i][1] *= 100;
          data.prices[i][2] = parseInt(data.prices[i][2]);
        }
        var storage_hash = "pricehistory_" + appid + "+" + market_name;
        storageSession.setItem(storage_hash, data.prices);
        callback(ERROR_SUCCESS, data.prices, false);
      }, "json").fail(function(data) {
        if (!data || !data.responseJSON) {
          return callback(ERROR_FAILED);
        }
        if (!data.responseJSON.success) {
          callback(ERROR_DATA);
          return;
        }
        return callback(ERROR_FAILED);
      });
    };
    SteamMarket.prototype.getMarketItemNameId = function(item, callback) {
      try {
        var market_name = getMarketHashName(item);
        if (market_name == null) {
          callback(ERROR_FAILED);
          return;
        }
        var appid = item.appid;
        var storage_hash = "itemnameid_" + appid + "+" + market_name;
        storagePersistent.getItem(storage_hash).then(function(value) {
          if (value != null)
            callback(ERROR_SUCCESS, value);
          else
            return market.getCurrentMarketItemNameId(appid, market_name, callback);
        }).catch(function(error) {
          return market.getCurrentMarketItemNameId(appid, market_name, callback);
        });
      } catch (e) {
        return callback(ERROR_FAILED);
      }
    };
    SteamMarket.prototype.getCurrentMarketItemNameId = function(appid, market_name, callback) {
      var url = window.location.protocol + "//steamcommunity.com/market/listings/" + appid + "/" + market_name;
      $.get(url, function(page) {
        var matches = /Market_LoadOrderSpread\( (.+) \);/.exec(page);
        if (matches == null) {
          callback(ERROR_DATA);
          return;
        }
        var item_nameid = matches[1];
        var storage_hash = "itemnameid_" + appid + "+" + market_name;
        storagePersistent.setItem(storage_hash, item_nameid);
        callback(ERROR_SUCCESS, item_nameid);
      }).fail(function(e) {
        return callback(ERROR_FAILED, e.status);
      });
    };
    SteamMarket.prototype.getItemOrdersHistogram = function(item, cache, callback) {
      try {
        var market_name = getMarketHashName(item);
        if (market_name == null) {
          callback(ERROR_FAILED);
          return;
        }
        var appid = item.appid;
        if (cache) {
          var storage_hash = "itemordershistogram_" + appid + "+" + market_name;
          storageSession.getItem(storage_hash).then(function(value) {
            if (value != null)
              callback(ERROR_SUCCESS, value, true);
            else {
              market.getCurrentItemOrdersHistogram(item, market_name, callback);
            }
          }).catch(function(error) {
            market.getCurrentItemOrdersHistogram(item, market_name, callback);
          });
        } else {
          market.getCurrentItemOrdersHistogram(item, market_name, callback);
        }
      } catch (e) {
        return callback(ERROR_FAILED);
      }
    };
    SteamMarket.prototype.getCurrentItemOrdersHistogram = function(item, market_name, callback) {
      market.getMarketItemNameId(item, function(error, item_nameid) {
        if (error) {
          if (item_nameid != 429)
            callback(ERROR_DATA);
          else
            callback(ERROR_FAILED);
          return;
        }
        var url = window.location.protocol + "//steamcommunity.com/market/itemordershistogram?language=english&currency=" + currencyId + "&item_nameid=" + item_nameid + "&two_factor=0";
        $.get(url, function(histogram) {
          var storage_hash = "itemordershistogram_" + item.appid + "+" + market_name;
          storageSession.setItem(storage_hash, histogram);
          callback(ERROR_SUCCESS, histogram, false);
        }).fail(function() {
          return callback(ERROR_FAILED, null);
        });
      });
    };
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
          publisherFee = this.walletInfo["wallet_publisher_fee_percent_default"];
        else
          publisherFee = 0.1;
      }
      price = Math.round(price);
      var feeInfo = CalculateFeeAmount(price, publisherFee, this.walletInfo);
      return price - feeInfo.fees;
    };
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
          publisherFee = this.walletInfo["wallet_publisher_fee_percent_default"];
        else
          publisherFee = 0.1;
      }
      price = Math.round(price);
      var feeInfo = CalculateAmountToSendForDesiredReceivedAmount(price, publisherFee, this.walletInfo);
      return feeInfo.amount;
    };
    if (currentPage == PAGE_INVENTORY) {
      let onQueueDrain2 = function() {
        if (itemQueue.length() == 0 && sellQueue.length() == 0 && scrapQueue.length() == 0 && boosterQueue.length() == 0) {
          $("#inventory_items_spinner").remove();
        }
      }, updateTotals2 = function() {
        if ($("#loggerTotal").length == 0) {
          $(logger).parent().append('<div id="loggerTotal"></div>');
        }
        var totals = document.getElementById("loggerTotal");
        totals.innerHTML = "";
        if (totalPriceWithFeesOnMarket > 0) {
          totals.innerHTML += "<div><strong>Total listed for " + (totalPriceWithFeesOnMarket / 100).toFixed(2) + currencySymbol + ", you will receive " + (totalPriceWithoutFeesOnMarket / 100).toFixed(2) + currencySymbol + ".</strong></div>";
        }
        if (totalScrap > 0) {
          totals.innerHTML += "<div><strong>Total scrap " + totalScrap + ".</strong></div>";
        }
      }, sellAllItems2 = function(appId) {
        loadAllInventories2().then(function() {
          var items = getInventoryItems2();
          var filteredItems = [];
          items.forEach(function(item) {
            if (!item.marketable) {
              return;
            }
            filteredItems.push(item);
          });
          sellItems2(filteredItems);
        }, function() {
          logDOM("Could not retrieve the inventory...");
        });
      }, sellAllCards2 = function() {
        loadAllInventories2().then(function() {
          var items = getInventoryItems2();
          var filteredItems = [];
          items.forEach(function(item) {
            if (!getIsTradingCard(item) || !item.marketable) {
              return;
            }
            filteredItems.push(item);
          });
          sellItems2(filteredItems);
        }, function() {
          logDOM("Could not retrieve the inventory...");
        });
      }, sellAllCrates2 = function() {
        loadAllInventories2().then(function() {
          var items = getInventoryItems2();
          var filteredItems = [];
          items.forEach(function(item) {
            if (!getIsCrate(item) || !item.marketable) {
              return;
            }
            filteredItems.push(item);
          });
          sellItems2(filteredItems);
        }, function() {
          logDOM("Could not retrieve the inventory...");
        });
      }, scrapQueueWorker2 = function(item, callback) {
        var failed = 0;
        var itemName = item.name || item.description.name;
        var itemId = item.assetid || item.id;
        market.getGooValue(item, function(err, goo) {
          totalNumberOfProcessedQueueItems++;
          var digits = getNumberOfDigits(totalNumberOfQueuedItems);
          var padLeft = padLeftZero("" + totalNumberOfProcessedQueueItems, digits) + " / " + totalNumberOfQueuedItems;
          if (err != ERROR_SUCCESS) {
            logConsole("Failed to get gems value for " + itemName);
            logDOM(padLeft + " - " + itemName + " not turned into gems due to missing gems value.");
            $("#" + item.appid + "_" + item.contextid + "_" + itemId).css("background", COLOR_ERROR);
            return callback(false);
          }
          item.goo_value_expected = parseInt(goo.goo_value);
          market.grindIntoGoo(item, function(err2, result) {
            if (err2 != ERROR_SUCCESS) {
              logConsole("Failed to turn item into gems for " + itemName);
              logDOM(padLeft + " - " + itemName + " not turned into gems due to unknown error.");
              $("#" + item.appid + "_" + item.contextid + "_" + itemId).css("background", COLOR_ERROR);
              return callback(false);
            }
            logConsole("============================");
            logConsole(itemName);
            logConsole("Turned into " + goo.goo_value + " gems");
            logDOM(padLeft + " - " + itemName + " turned into " + item.goo_value_expected + " gems.");
            $("#" + item.appid + "_" + item.contextid + "_" + itemId).css("background", COLOR_SUCCESS);
            totalScrap += item.goo_value_expected;
            updateTotals2();
            callback(true);
          });
        });
      }, boosterQueueWorker2 = function(item, callback) {
        var failed = 0;
        var itemName = item.name || item.description.name;
        var itemId = item.assetid || item.id;
        market.unpackBoosterPack(item, function(err, goo) {
          totalNumberOfProcessedQueueItems++;
          var digits = getNumberOfDigits(totalNumberOfQueuedItems);
          var padLeft = padLeftZero("" + totalNumberOfProcessedQueueItems, digits) + " / " + totalNumberOfQueuedItems;
          if (err != ERROR_SUCCESS) {
            logConsole("Failed to unpack booster pack " + itemName);
            logDOM(padLeft + " - " + itemName + " not unpacked.");
            $("#" + item.appid + "_" + item.contextid + "_" + itemId).css("background", COLOR_ERROR);
            return callback(false);
          }
          logDOM(padLeft + " - " + itemName + " unpacked.");
          $("#" + item.appid + "_" + item.contextid + "_" + itemId).css("background", COLOR_SUCCESS);
          callback(true);
        });
      }, turnSelectedItemsIntoGems2 = function() {
        var ids = getSelectedItems2();
        loadAllInventories2().then(function() {
          var items = getInventoryItems2();
          var numberOfQueuedItems = 0;
          items.forEach(function(item) {
            if (item.queued != null) {
              return;
            }
            if (item.owner_actions == null) {
              return;
            }
            var canTurnIntoGems = false;
            for (var owner_action in item.owner_actions) {
              if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes("GetGooValue")) {
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
            $("#inventory_items_spinner").remove();
            $("#inventory_sell_buttons").append('<div id="inventory_items_spinner">' + spinnerBlock + '<div style="text-align:center">Processing ' + numberOfQueuedItems + " items</div></div>");
          }
        }, function() {
          logDOM("Could not retrieve the inventory...");
        });
      }, unpackSelectedBoosterPacks2 = function() {
        var ids = getSelectedItems2();
        loadAllInventories2().then(function() {
          var items = getInventoryItems2();
          var numberOfQueuedItems = 0;
          items.forEach(function(item) {
            if (item.queued != null) {
              return;
            }
            if (item.owner_actions == null) {
              return;
            }
            var canOpenBooster = false;
            for (var owner_action in item.owner_actions) {
              if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes("OpenBooster")) {
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
            $("#inventory_items_spinner").remove();
            $("#inventory_sell_buttons").append('<div id="inventory_items_spinner">' + spinnerBlock + '<div style="text-align:center">Processing ' + numberOfQueuedItems + " items</div></div>");
          }
        }, function() {
          logDOM("Could not retrieve the inventory...");
        });
      }, sellSelectedItems2 = function() {
        getInventorySelectedMarketableItems2(function(items) {
          sellItems2(items);
        });
      }, canSellSelectedItemsManually2 = function(items) {
        var appid = items[0].appid;
        var contextid = items[0].contextid;
        var hasInvalidItem = false;
        items.forEach(function(item) {
          if (item.contextid != contextid || item.commodity == false)
            hasInvalidItem = true;
        });
        return !hasInvalidItem;
      }, sellSelectedItemsManually2 = function() {
        getInventorySelectedMarketableItems2(function(items) {
          var appid = items[0].appid;
          var contextid = items[0].contextid;
          var itemsWithQty = {};
          items.forEach(function(item) {
            itemsWithQty[item.market_hash_name] = itemsWithQty[item.market_hash_name] + 1 || 1;
          });
          var itemsString = "";
          for (var itemName in itemsWithQty) {
            itemsString += "&items[]=" + encodeURI(itemName) + "&qty[]=" + itemsWithQty[itemName];
          }
          var baseUrl = "https://steamcommunity.com/market/multisell";
          var redirectUrl = baseUrl + "?appid=" + appid + "&contextid=" + contextid + itemsString;
          var dialog = unsafeWindow.ShowDialog("Steam Economy Enhancer", '<iframe frameBorder="0" height="650" width="900" src="' + redirectUrl + '"></iframe>');
          dialog.OnDismiss(function() {
            items.forEach(function(item) {
              var itemId = item.assetid || item.id;
              $("#" + item.appid + "_" + item.contextid + "_" + itemId).css("background", COLOR_PENDING);
            });
          });
        });
      }, sellItems2 = function(items) {
        if (items.length == 0) {
          logDOM("These items cannot be added to the market...");
          return;
        }
        var numberOfQueuedItems = 0;
        items.forEach(function(item, index, array) {
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
          $("#inventory_items_spinner").remove();
          $("#inventory_sell_buttons").append('<div id="inventory_items_spinner">' + spinnerBlock + '<div style="text-align:center">Processing ' + numberOfQueuedItems + " items</div></div>");
        }
      }, itemQueueWorker2 = function(item, ignoreErrors, callback) {
        var priceInfo = getPriceInformationFromItem(item);
        var failed = 0;
        var itemName = item.name || item.description.name;
        market.getPriceHistory(item, true, function(err, history, cachedHistory) {
          if (err) {
            logConsole("Failed to get price history for " + itemName);
            if (err == ERROR_FAILED)
              failed += 1;
          }
          market.getItemOrdersHistogram(item, true, function(err2, histogram, cachedListings) {
            if (err2) {
              logConsole("Failed to get orders histogram for " + itemName);
              if (err2 == ERROR_FAILED)
                failed += 1;
            }
            if (failed > 0 && !ignoreErrors) {
              return callback(false, cachedHistory && cachedListings);
            }
            logConsole("============================");
            logConsole(itemName);
            var sellPrice = calculateSellPriceBeforeFees(history, histogram, true, priceInfo.minPriceBeforeFees, priceInfo.maxPriceBeforeFees);
            logConsole("Sell price: " + sellPrice / 100 + " (" + market.getPriceIncludingFees(sellPrice) / 100 + ")");
            sellQueue.push({
              item,
              sellPrice
            });
            return callback(true, cachedHistory && cachedListings);
          });
        });
      }, initializeInventoryUI2 = function() {
        var isOwnInventory = unsafeWindow.g_ActiveUser.strSteamId == unsafeWindow.g_steamID;
        var previousSelection = -1;
        updateInventoryUI2(isOwnInventory);
        $(".games_list_tabs").on("click", "*", function() {
          updateInventoryUI2(isOwnInventory);
        });
        if (!isOwnInventory)
          return;
        var filter = ".itemHolder:not([style*=none])";
        $("#inventories").selectable({
          filter,
          selecting: function(e, ui) {
            var selectedIndex = $(ui.selecting.tagName, e.target).index(ui.selecting);
            if (e.shiftKey && previousSelection > -1) {
              $(ui.selecting.tagName, e.target).slice(Math.min(previousSelection, selectedIndex), 1 + Math.max(previousSelection, selectedIndex)).each(function() {
                if ($(this).is(filter)) {
                  $(this).addClass("ui-selected");
                }
              });
              previousSelection = -1;
            } else {
              previousSelection = selectedIndex;
            }
          },
          selected: function(e, ui) {
            updateInventorySelection2(ui.selected);
          }
        });
      }, getSelectedItems2 = function() {
        var ids = [];
        $(".inventory_ctn").each(function() {
          $(this).find(".inventory_page").each(function() {
            var inventory_page = this;
            $(inventory_page).find(".itemHolder").each(function() {
              if (!$(this).hasClass("ui-selected"))
                return;
              $(this).find(".item").each(function() {
                var matches = this.id.match(/_(\-?\d+)$/);
                if (matches) {
                  ids.push(matches[1]);
                }
              });
            });
          });
        });
        return ids;
      }, getInventorySelectedMarketableItems2 = function(callback) {
        var ids = getSelectedItems2();
        loadAllInventories2().then(function() {
          var items = getInventoryItems2();
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
          logDOM("Could not retrieve the inventory...");
        });
      }, getInventorySelectedGemsItems2 = function(callback) {
        var ids = getSelectedItems2();
        loadAllInventories2().then(function() {
          var items = getInventoryItems2();
          var filteredItems = [];
          items.forEach(function(item) {
            var canTurnIntoGems = false;
            for (var owner_action in item.owner_actions) {
              if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes("GetGooValue")) {
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
          logDOM("Could not retrieve the inventory...");
        });
      }, getInventorySelectedBoosterPackItems2 = function(callback) {
        var ids = getSelectedItems2();
        loadAllInventories2().then(function() {
          var items = getInventoryItems2();
          var filteredItems = [];
          items.forEach(function(item) {
            var canOpenBooster = false;
            for (var owner_action in item.owner_actions) {
              if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes("OpenBooster")) {
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
          logDOM("Could not retrieve the inventory...");
        });
      }, updateSellSelectedButton2 = function() {
        getInventorySelectedMarketableItems2(function(items) {
          var selectedItems = items.length;
          if (items.length == 0) {
            $(".sell_selected").hide();
            $(".sell_manual").hide();
          } else {
            $(".sell_selected").show();
            if (canSellSelectedItemsManually2(items)) {
              $(".sell_manual").show();
              $(".sell_manual > span").text("Sell " + selectedItems + (selectedItems == 1 ? " Item Manual" : " Items Manual"));
            } else {
              $(".sell_manual").hide();
            }
            $(".sell_selected > span").text("Sell " + selectedItems + (selectedItems == 1 ? " Item" : " Items"));
          }
        });
      }, updateTurnIntoGemsButton2 = function() {
        getInventorySelectedGemsItems2(function(items) {
          var selectedItems = items.length;
          if (items.length == 0) {
            $(".turn_into_gems").hide();
          } else {
            $(".turn_into_gems").show();
            $(".turn_into_gems > span").text("Turn " + selectedItems + (selectedItems == 1 ? " Item Into Gems" : " Items Into Gems"));
          }
        });
      }, updateOpenBoosterPacksButton2 = function() {
        getInventorySelectedBoosterPackItems2(function(items) {
          var selectedItems = items.length;
          if (items.length == 0) {
            $(".unpack_booster_packs").hide();
          } else {
            $(".unpack_booster_packs").show();
            $(".unpack_booster_packs > span").text("Unpack " + selectedItems + (selectedItems == 1 ? " Booster Pack" : " Booster Packs"));
          }
        });
      }, updateInventorySelection2 = function(item) {
        updateSellSelectedButton2();
        updateTurnIntoGemsButton2();
        updateOpenBoosterPacksButton2();
        var selectedItemIdUI = $("div", item).attr("id");
        var selectedItemIdInventory = getActiveInventory().selectedItem.appid + "_" + getActiveInventory().selectedItem.contextid + "_" + getActiveInventory().selectedItem.assetid;
        if (selectedItemIdUI !== selectedItemIdInventory) {
          setTimeout(function() {
            updateInventorySelection2(item);
          }, 250);
          return;
        }
        var item_info = $(".inventory_iteminfo:visible").first();
        if (item_info.html().indexOf("checkout/sendgift/") > -1)
          return;
        var item_info_id = item_info.attr("id");
        var scrap = $("#" + item_info_id + "_scrap_content");
        scrap.next().insertBefore(scrap);
        var market_hash_name = getMarketHashName(getActiveInventory().selectedItem);
        if (market_hash_name == null)
          return;
        var appid = getActiveInventory().selectedItem.appid;
        var item = {
          appid: parseInt(appid),
          description: {
            market_hash_name
          }
        };
        market.getItemOrdersHistogram(item, false, function(err, histogram) {
          if (err) {
            logConsole("Failed to get orders histogram for " + (getActiveInventory().selectedItem.name || getActiveInventory().selectedItem.description.name));
            return;
          }
          var groupMain = $('<div id="listings_group"><div><div id="listings_sell">Sell</div>' + histogram.sell_order_table + '</div><div><div id="listings_buy">Buy</div>' + histogram.buy_order_table + "</div></div>");
          $("#" + item_info_id + "_item_market_actions > div").after(groupMain);
          var ownerActions = $("#" + item_info_id + "_item_owner_actions");
          ownerActions.show();
          ownerActions.append('<a class="btn_small btn_grey_white_innerfade" href="/market/listings/' + appid + "/" + market_hash_name + '"><span>View in Community Market</span></a>');
          $("#" + item_info_id + "_item_market_actions > div:nth-child(1) > div:nth-child(1)").hide();
          var isBoosterPack = getActiveInventory().selectedItem.name.toLowerCase().endsWith("booster pack");
          if (isBoosterPack) {
            var tradingCardsUrl = "/market/search?q=&category_753_Game%5B%5D=tag_app_" + getActiveInventory().selectedItem.market_fee_app + "&category_753_item_class%5B%5D=tag_item_class_2&appid=753";
            ownerActions.append('<br/> <a class="btn_small btn_grey_white_innerfade" href="' + tradingCardsUrl + '"><span>View trading cards in Community Market</span></a>');
          }
          var itemId = getActiveInventory().selectedItem.assetid || getActiveInventory().selectedItem.id;
          if (getActiveInventory().selectedItem.queued != null) {
            return;
          }
          var prices = [];
          if (histogram != null && histogram.highest_buy_order != null) {
            prices.push(parseInt(histogram.highest_buy_order));
          }
          if (histogram != null && histogram.lowest_sell_order != null) {
            if (parseInt(histogram.lowest_sell_order) > 3) {
              prices.push(parseInt(histogram.lowest_sell_order) - 1);
            }
            prices.push(parseInt(histogram.lowest_sell_order));
          }
          prices = prices.filter((v, i) => prices.indexOf(v) === i).sort((a, b) => a - b);
          var buttons = " ";
          prices.forEach(function(e) {
            buttons += '<a class="item_market_action_button item_market_action_button_green quick_sell" id="quick_sell' + e + '"><span class="item_market_action_button_edge item_market_action_button_left"></span><span class="item_market_action_button_contents">' + e / 100 + currencySymbol + '</span><span class="item_market_action_button_edge item_market_action_button_right"></span><span class="item_market_action_button_preload"></span></a>';
          });
          $("#" + item_info_id + "_item_market_actions", item_info).append(buttons);
          $("#" + item_info_id + "_item_market_actions", item_info).append('<div style="display:flex"><input id="quick_sell_input" style="background-color: black;color: white;border: transparent;max-width:65px;text-align:center;" type="number" value="' + histogram.lowest_sell_order / 100 + '" step="0.01" />&nbsp;<a class="item_market_action_button item_market_action_button_green quick_sell_custom"><span class="item_market_action_button_edge item_market_action_button_left"></span><span class="item_market_action_button_contents">\u279C Sell</span><span class="item_market_action_button_edge item_market_action_button_right"></span><span class="item_market_action_button_preload"></span></a></div>');
          $(".quick_sell").on("click", function() {
            var price = $(this).attr("id").replace("quick_sell", "");
            price = market.getPriceBeforeFees(price);
            totalNumberOfQueuedItems++;
            sellQueue.push({
              item: getActiveInventory().selectedItem,
              sellPrice: price
            });
          });
          $(".quick_sell_custom").on("click", function() {
            var price = $("#quick_sell_input", $("#" + item_info_id + "_item_market_actions", item_info)).val() * 100;
            price = market.getPriceBeforeFees(price);
            totalNumberOfQueuedItems++;
            sellQueue.push({
              item: getActiveInventory().selectedItem,
              sellPrice: price
            });
          });
        });
      }, updateInventoryUI2 = function(isOwnInventory) {
        $("#inventory_sell_buttons").remove();
        $("#price_options").remove();
        $("#inventory_reload_button").remove();
        $("#see_settings").remove();
        $("#global_action_menu").prepend('<span id="see_settings"><a href="javascript:void(0)">\u2B16 Steam Economy Enhancer</a></span>');
        $("#see_settings").on("click", "*", () => openSettings());
        var appId = getActiveInventory().m_appid;
        var showMiscOptions = appId == 753;
        var TF2 = appId == 440;
        var sellButtons = $('<div id="inventory_sell_buttons" style="margin-bottom:12px;"><a class="btn_green_white_innerfade btn_medium_wide sell_all separator-btn-right"><span>Sell All Items</span></a><a class="btn_green_white_innerfade btn_medium_wide sell_selected separator-btn-right" style="display:none"><span>Sell Selected Items</span></a><a class="btn_green_white_innerfade btn_medium_wide sell_manual separator-btn-right" style="display:none"><span>Sell Manually</span></a>' + (showMiscOptions ? '<a class="btn_green_white_innerfade btn_medium_wide sell_all_cards separator-btn-right"><span>Sell All Cards</span></a><div style="margin-top:12px;"><a class="btn_darkblue_white_innerfade btn_medium_wide turn_into_gems separator-btn-right" style="display:none"><span>Turn Selected Items Into Gems</span></a><a class="btn_darkblue_white_innerfade btn_medium_wide unpack_booster_packs separator-btn-right" style="display:none"><span>Unpack Selected Booster Packs</span></a></div>' : "") + (TF2 ? '<a class="btn_green_white_innerfade btn_medium_wide sell_all_crates separator-btn-right"><span>Sell All Crates</span></a>' : "") + "</div>");
        var reloadButton = $('<a id="inventory_reload_button" class="btn_darkblue_white_innerfade btn_medium_wide reload_inventory" style="margin-right:12px"><span>Reload Inventory</span></a>');
        $("#inventory_logos")[0].style.height = "auto";
        $("#inventory_applogo").hide();
        $("#inventory_applogo").after(logger);
        $("#logger").on("scroll", function() {
          var hasUserScrolledToBottom = $("#logger").prop("scrollHeight") - $("#logger").prop("clientHeight") <= $("#logger").prop("scrollTop") + 1;
          userScrolled = !hasUserScrolledToBottom;
        });
        if (isOwnInventory) {
          $("#inventory_applogo").after(sellButtons);
          $(".sell_all").on("click", "*", function() {
            sellAllItems2(appId);
          });
          $(".sell_selected").on("click", "*", sellSelectedItems2);
          $(".sell_manual").on("click", "*", sellSelectedItemsManually2);
          $(".sell_all_cards").on("click", "*", sellAllCards2);
          $(".sell_all_crates").on("click", "*", sellAllCrates2);
          $(".turn_into_gems").on("click", "*", turnSelectedItemsIntoGems2);
          $(".unpack_booster_packs").on("click", "*", unpackSelectedBoosterPacks2);
        }
        $(".inventory_rightnav").prepend(reloadButton);
        $(".reload_inventory").on("click", "*", function() {
          window.location.reload();
        });
        loadAllInventories2().then(function() {
          var updateInventoryPrices = function() {
            if (getSettingWithDefault(SETTING_INVENTORY_PRICE_LABELS) == 1) {
              setInventoryPrices(getInventoryItems2());
            }
          };
          updateInventoryPrices();
          $("#inventory_pagecontrols").observe("childlist", "*", function(record) {
            updateInventoryPrices();
          });
        }, function() {
          logDOM("Could not retrieve the inventory...");
        });
      }, loadInventories2 = function(inventories) {
        return new Promise(function(resolve) {
          inventories.reduce(function(promise, inventory) {
            return promise.then(function() {
              return inventory.LoadCompleteInventory().done(function() {
              });
            });
          }, Promise.resolve());
          resolve();
        });
      }, loadAllInventories2 = function() {
        var items = [];
        for (var child in getActiveInventory().m_rgChildInventories) {
          items.push(getActiveInventory().m_rgChildInventories[child]);
        }
        items.push(getActiveInventory());
        return loadInventories2(items);
      }, getInventoryItems2 = function() {
        var arr = [];
        for (var child in getActiveInventory().m_rgChildInventories) {
          for (var key in getActiveInventory().m_rgChildInventories[child].m_rgAssets) {
            var value = getActiveInventory().m_rgChildInventories[child].m_rgAssets[key];
            if (typeof value === "object") {
              Object.assign(value, value.description);
              value["id"] = key;
              arr.push(value);
            }
          }
        }
        for (var key in getActiveInventory().m_rgAssets) {
          var value = getActiveInventory().m_rgAssets[key];
          if (typeof value === "object") {
            Object.assign(value, value.description);
            value["id"] = key;
            arr.push(value);
          }
        }
        return arr;
      };
      var onQueueDrain = onQueueDrain2, updateTotals = updateTotals2, sellAllItems = sellAllItems2, sellAllCards = sellAllCards2, sellAllCrates = sellAllCrates2, scrapQueueWorker = scrapQueueWorker2, boosterQueueWorker = boosterQueueWorker2, turnSelectedItemsIntoGems = turnSelectedItemsIntoGems2, unpackSelectedBoosterPacks = unpackSelectedBoosterPacks2, sellSelectedItems = sellSelectedItems2, canSellSelectedItemsManually = canSellSelectedItemsManually2, sellSelectedItemsManually = sellSelectedItemsManually2, sellItems = sellItems2, itemQueueWorker = itemQueueWorker2, initializeInventoryUI = initializeInventoryUI2, getSelectedItems = getSelectedItems2, getInventorySelectedMarketableItems = getInventorySelectedMarketableItems2, getInventorySelectedGemsItems = getInventorySelectedGemsItems2, getInventorySelectedBoosterPackItems = getInventorySelectedBoosterPackItems2, updateSellSelectedButton = updateSellSelectedButton2, updateTurnIntoGemsButton = updateTurnIntoGemsButton2, updateOpenBoosterPacksButton = updateOpenBoosterPacksButton2, updateInventorySelection = updateInventorySelection2, updateInventoryUI = updateInventoryUI2, loadInventories = loadInventories2, loadAllInventories = loadAllInventories2, getInventoryItems = getInventoryItems2;
      var sellQueue = async2.queue(function(task, next) {
        market.sellItem(task.item, task.sellPrice, function(err, data) {
          totalNumberOfProcessedQueueItems++;
          var digits = getNumberOfDigits(totalNumberOfQueuedItems);
          var itemId = task.item.assetid || task.item.id;
          var itemName = task.item.name || task.item.description.name;
          var padLeft = padLeftZero("" + totalNumberOfProcessedQueueItems, digits) + " / " + totalNumberOfQueuedItems;
          if (!err) {
            logDOM(padLeft + " - " + itemName + " listed for " + (market.getPriceIncludingFees(task.sellPrice) / 100).toFixed(2) + currencySymbol + ", you will receive " + (task.sellPrice / 100).toFixed(2) + currencySymbol + ".");
            $("#" + task.item.appid + "_" + task.item.contextid + "_" + itemId).css("background", COLOR_SUCCESS);
            totalPriceWithoutFeesOnMarket += task.sellPrice;
            totalPriceWithFeesOnMarket += market.getPriceIncludingFees(task.sellPrice);
            updateTotals2();
          } else if (data != null && isRetryMessage(data.message)) {
            logDOM(padLeft + " - " + itemName + " retrying listing because " + data.message[0].toLowerCase() + data.message.slice(1));
            totalNumberOfProcessedQueueItems--;
            sellQueue.unshift(task);
            sellQueue.pause();
            setTimeout(function() {
              sellQueue.resume();
            }, getRandomInt(3e4, 45e3));
          } else {
            if (data != null && data.responseJSON != null && data.responseJSON.message != null) {
              logDOM(padLeft + " - " + itemName + " not added to market because " + data.responseJSON.message[0].toLowerCase() + data.responseJSON.message.slice(1));
            } else
              logDOM(padLeft + " - " + itemName + " not added to market.");
            $("#" + task.item.appid + "_" + task.item.contextid + "_" + itemId).css("background", COLOR_ERROR);
          }
          next();
        });
      }, 1);
      sellQueue.drain = function() {
        onQueueDrain2();
      };
      var scrapQueue = async2.queue(function(item, next) {
        scrapQueueWorker2(item, function(success) {
          if (success) {
            setTimeout(function() {
              next();
            }, 250);
          } else {
            var delay = numberOfFailedRequests > 1 ? getRandomInt(3e4, 45e3) : getRandomInt(1e3, 1500);
            if (numberOfFailedRequests > 3)
              numberOfFailedRequests = 0;
            setTimeout(function() {
              next();
            }, delay);
          }
        });
      }, 1);
      scrapQueue.drain = function() {
        onQueueDrain2();
      };
      var boosterQueue = async2.queue(function(item, next) {
        boosterQueueWorker2(item, function(success) {
          if (success) {
            setTimeout(function() {
              next();
            }, 250);
          } else {
            var delay = numberOfFailedRequests > 1 ? getRandomInt(3e4, 45e3) : getRandomInt(1e3, 1500);
            if (numberOfFailedRequests > 3)
              numberOfFailedRequests = 0;
            setTimeout(function() {
              next();
            }, delay);
          }
        });
      }, 1);
      boosterQueue.drain = function() {
        onQueueDrain2();
      };
      var itemQueue = async2.queue(function(item, next) {
        itemQueueWorker2(item, item.ignoreErrors, function(success, cached) {
          if (success) {
            setTimeout(function() {
              next();
            }, cached ? 0 : getRandomInt(1e3, 1500));
          } else {
            if (!item.ignoreErrors) {
              item.ignoreErrors = true;
              itemQueue.push(item);
            }
            var delay = numberOfFailedRequests > 1 ? getRandomInt(3e4, 45e3) : getRandomInt(1e3, 1500);
            if (numberOfFailedRequests > 3)
              numberOfFailedRequests = 0;
            setTimeout(function() {
              next();
            }, cached ? 0 : delay);
          }
        });
      }, 1);
    }
    if (currentPage == PAGE_TRADEOFFER) {
      let getTradeOfferInventoryItems2 = function() {
        var arr = [];
        for (var child in getActiveInventory().rgChildInventories) {
          for (var key in getActiveInventory().rgChildInventories[child].rgInventory) {
            var value = getActiveInventory().rgChildInventories[child].rgInventory[key];
            if (typeof value === "object") {
              Object.assign(value, value.description);
              value["id"] = key;
              arr.push(value);
            }
          }
        }
        for (var key in getActiveInventory().rgInventory) {
          var value = getActiveInventory().rgInventory[key];
          if (typeof value === "object") {
            Object.assign(value, value.description);
            value["id"] = key;
            arr.push(value);
          }
        }
        return arr;
      }, sumTradeOfferAssets2 = function(assets, user) {
        var total = {};
        var totalPrice = 0;
        for (var i = 0; i < assets.length; i++) {
          var rgItem = user.findAsset(assets[i].appid, assets[i].contextid, assets[i].assetid);
          var text = "";
          if (rgItem != null) {
            if (rgItem.element) {
              var inventoryPriceElements = $(".inventory_item_price", rgItem.element);
              if (inventoryPriceElements.length) {
                var firstPriceElement = inventoryPriceElements[0];
                var classes = $(firstPriceElement).attr("class").split(" ");
                for (var c in classes) {
                  if (classes[c].toString().includes("price_")) {
                    var price = parseInt(classes[c].toString().replace("price_", ""));
                    totalPrice += price;
                  }
                }
              }
            }
            if (rgItem.original_amount != null && rgItem.amount != null) {
              var originalAmount = parseInt(rgItem.original_amount);
              var currentAmount = parseInt(rgItem.amount);
              var usedAmount = originalAmount - currentAmount;
              text += usedAmount.toString() + "x ";
            }
            text += rgItem.name;
            if (rgItem.type != null && rgItem.type.length > 0) {
              text += " (" + rgItem.type + ")";
            }
          } else
            text = "Unknown Item";
          if (text in total)
            total[text] = total[text] + 1;
          else
            total[text] = 1;
        }
        var sortable = [];
        for (var item in total)
          sortable.push([item, total[item]]);
        sortable.sort(function(a, b) {
          return a[1] - b[1];
        }).reverse();
        var totalText = "<strong>Number of items: " + sortable.length + ", worth " + (totalPrice / 100).toFixed(2) + currencySymbol + "<br/><br/></strong>";
        for (var i = 0; i < sortable.length; i++) {
          totalText += sortable[i][1] + "x " + sortable[i][0] + "<br/>";
        }
        return totalText;
      };
      var getTradeOfferInventoryItems = getTradeOfferInventoryItems2, sumTradeOfferAssets = sumTradeOfferAssets2;
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
      $(".trade_right > div > div > div > .trade_item_box").observe("childlist subtree", function(record) {
        if (!hasLoadedAllTradeOfferItems())
          return;
        var currentTradeOfferSum = unsafeWindow.g_rgCurrentTradeStatus.me.assets.length + unsafeWindow.g_rgCurrentTradeStatus.them.assets.length;
        if (lastTradeOfferSum != currentTradeOfferSum) {
          updateInventoryPricesInTrade();
        }
        lastTradeOfferSum = currentTradeOfferSum;
        $("#trade_offer_your_sum").remove();
        $("#trade_offer_their_sum").remove();
        var your_sum = sumTradeOfferAssets(unsafeWindow.g_rgCurrentTradeStatus.me.assets, UserYou);
        var their_sum = sumTradeOfferAssets(unsafeWindow.g_rgCurrentTradeStatus.them.assets, UserThem);
        $("div.offerheader:nth-child(1) > div:nth-child(3)").append('<div class="trade_offer_sum" id="trade_offer_your_sum">' + your_sum + "</div>");
        $("div.offerheader:nth-child(3) > div:nth-child(3)").append('<div class="trade_offer_sum" id="trade_offer_their_sum">' + their_sum + "</div>");
      });
      updateInventoryPrices();
      $("#inventory_pagecontrols").observe("childlist", "*", function(record) {
        updateInventoryPrices();
      });
      if (!window.location.href.includes("tradeoffer/new"))
        return;
      $("#inventory_displaycontrols").append('<br/><div class="trade_offer_buttons"><a class="item_market_action_button item_market_action_button_green select_all" style="margin-top:1px"><span class="item_market_action_button_contents" style="text-transform:none">Select all from page</span></a></div>');
      $(".select_all").on("click", "*", function() {
        $(".inventory_ctn:visible > .inventory_page:visible > .itemHolder:visible").delayedEach(250, function(i, it) {
          var item = it.rgItem;
          if (item.is_stackable)
            return;
          if (!item.tradable)
            return;
          unsafeWindow.MoveItemToTrade(it);
        });
      });
    }
    if (currentPage == PAGE_INVENTORY || currentPage == PAGE_TRADEOFFER) {
      let getActiveInventory2 = function() {
        return unsafeWindow.g_ActiveInventory;
      }, setInventoryPrices2 = function(items) {
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
      }, inventoryPriceQueueWorker2 = function(item, ignoreErrors, callback) {
        var priceInfo = getPriceInformationFromItem(item);
        var failed = 0;
        var itemName = item.name || item.description.name;
        market.getItemOrdersHistogram(item, true, function(err, histogram, cachedListings) {
          if (err) {
            logConsole("Failed to get orders histogram for " + itemName);
            if (err == ERROR_FAILED)
              failed += 1;
          }
          if (failed > 0 && !ignoreErrors) {
            return callback(false, cachedListings);
          }
          var sellPrice = calculateSellPriceBeforeFees(null, histogram, false, 0, 65535);
          var itemPrice = sellPrice == 65535 ? "\u221E" : (market.getPriceIncludingFees(sellPrice) / 100).toFixed(2) + currencySymbol;
          var elementName = (currentPage == PAGE_TRADEOFFER ? "#item" : "#") + item.appid + "_" + item.contextid + "_" + item.id;
          var element = $(elementName);
          $(".inventory_item_price", element).remove();
          element.append('<span class="inventory_item_price price_' + (sellPrice == 65535 ? 0 : market.getPriceIncludingFees(sellPrice)) + '">' + itemPrice + "</span>");
          return callback(true, cachedListings);
        });
      };
      var getActiveInventory = getActiveInventory2, setInventoryPrices = setInventoryPrices2, inventoryPriceQueueWorker = inventoryPriceQueueWorker2;
      var inventoryPriceQueue = async2.queue(function(item, next) {
        inventoryPriceQueueWorker2(item, false, function(success, cached) {
          if (success) {
            setTimeout(function() {
              next();
            }, cached ? 0 : getRandomInt(1e3, 1500));
          } else {
            if (!item.ignoreErrors) {
              item.ignoreErrors = true;
              inventoryPriceQueue.push(item);
            }
            numberOfFailedRequests++;
            var delay = numberOfFailedRequests > 1 ? getRandomInt(3e4, 45e3) : getRandomInt(1e3, 1500);
            if (numberOfFailedRequests > 3)
              numberOfFailedRequests = 0;
            setTimeout(function() {
              next();
            }, cached ? 0 : delay);
          }
        });
      }, 1);
    }
  })(jQuery, async);
})();
