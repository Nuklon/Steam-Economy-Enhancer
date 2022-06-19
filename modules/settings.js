//#region Settings
function getSettingWithDefault(name) {
    return getLocalStorageItem(name) || (name in settingDefaults ? settingDefaults[name] : null);
}

function setSetting(name, value) {
    setLocalStorageItem(name, value);
}
//#endregion
//#region Settings
function openSettings() {
    var price_options = $('<div id="price_options">' +
        '<div style="margin-bottom:6px;">' +
        'Calculate prices as the:&nbsp;<select class="price_option_input" style="background-color: black;color: white;border: transparent;" id="' + SETTING_PRICE_ALGORITHM + '">' +
        '<option value="1"' + (getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1 ? 'selected="selected"' : '') + '>Maximum of the average history and lowest sell listing</option>' +
        '<option value="2" ' + (getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 2 ? 'selected="selected"' : '') + '>Lowest sell listing</option>' +
        '<option value="3" ' + (getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 3 ? 'selected="selected"' : '') + '>Highest current buy order or lowest sell listing</option>' +
        '</select>' +
        '<br/>' +
        '</div>' +
        '<div style="margin-bottom:6px;">' +
        'Hours to use for the average history calculated price:&nbsp;<input class="price_option_input" style="background-color: black;color: white;border: transparent;" type="number" step="2" id="' + SETTING_PRICE_HISTORY_HOURS + '" value=' + getSettingWithDefault(SETTING_PRICE_HISTORY_HOURS) + '>' +
        '</div>' +
        '<div style="margin-bottom:6px;">' +
        'The value to add to the calculated price (minimum and maximum are respected):&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_PRICE_OFFSET + '" value=' + getSettingWithDefault(SETTING_PRICE_OFFSET) + '>' +
        '<br/>' +
        '</div>' +
        '<div style="margin-top:6px">' +
        'Use the second lowest sell listing when the lowest sell listing has a low quantity:&nbsp;<input class="price_option_input" style="background-color: black;color: white;border: transparent;" type="checkbox" id="' + SETTING_PRICE_IGNORE_LOWEST_Q + '" ' + (getSettingWithDefault(SETTING_PRICE_IGNORE_LOWEST_Q) == 1 ? 'checked=""' : '') + '>' +
        '<br/>' +
        '</div>' +
        '<div style="margin-top:6px;">' +
        'Don\'t check market listings with prices of and below:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_PRICE_MIN_CHECK_PRICE + '" value=' + getSettingWithDefault(SETTING_PRICE_MIN_CHECK_PRICE) + '>' +
        '<br/>' +
        '</div>' +
        '<div style="margin-top:24px">' +
        'Show price labels in inventory:&nbsp;<input class="price_option_input" style="background-color: black;color: white;border: transparent;" type="checkbox" id="' + SETTING_INVENTORY_PRICE_LABELS + '" ' + (getSettingWithDefault(SETTING_INVENTORY_PRICE_LABELS) == 1 ? 'checked=""' : '') + '>' +
        '</div>' +
        '<div style="margin-top:6px">' +
        'Show price labels in trade offers:&nbsp;<input class="price_option_input" style="background-color: black;color: white;border: transparent;" type="checkbox" id="' + SETTING_TRADEOFFER_PRICE_LABELS + '" ' + (getSettingWithDefault(SETTING_TRADEOFFER_PRICE_LABELS) == 1 ? 'checked=""' : '') + '>' +
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
        '<div style="margin-top:24px;margin-bottom:6px;">' +
        'Market items per page:&nbsp;<input class="price_option_input price_option_price" style="background-color: black;color: white;border: transparent;" type="number" step="0.01" id="' + SETTING_MARKET_PAGE_COUNT + '" value=' + getSettingWithDefault(SETTING_MARKET_PAGE_COUNT) + '>' +
        '<br/>' +
        '<div style="margin-top:6px;">' +
        'Automatically relist overpriced market listings (slow on large inventories):&nbsp;<input id="' + SETTING_RELIST_AUTOMATICALLY + '" class="market_relist_auto" type="checkbox" ' + (getSettingWithDefault(SETTING_RELIST_AUTOMATICALLY) == 1 ? 'checked=""' : '') + '>' +
        '</label>' +
        '</div>' +
        '</div>' +
        '</div>');

    var dialog = unsafeWindow.ShowConfirmDialog('Steam Economy Enhancer', price_options).done(function() {
        setSetting(SETTING_MIN_NORMAL_PRICE, $('#' + SETTING_MIN_NORMAL_PRICE, price_options).val());
        setSetting(SETTING_MAX_NORMAL_PRICE, $('#' + SETTING_MAX_NORMAL_PRICE, price_options).val());
        setSetting(SETTING_MIN_FOIL_PRICE, $('#' + SETTING_MIN_FOIL_PRICE, price_options).val());
        setSetting(SETTING_MAX_FOIL_PRICE, $('#' + SETTING_MAX_FOIL_PRICE, price_options).val());
        setSetting(SETTING_MIN_MISC_PRICE, $('#' + SETTING_MIN_MISC_PRICE, price_options).val());
        setSetting(SETTING_MAX_MISC_PRICE, $('#' + SETTING_MAX_MISC_PRICE, price_options).val());
        setSetting(SETTING_PRICE_OFFSET, $('#' + SETTING_PRICE_OFFSET, price_options).val());
        setSetting(SETTING_PRICE_MIN_CHECK_PRICE, $('#' + SETTING_PRICE_MIN_CHECK_PRICE, price_options).val());
        setSetting(SETTING_PRICE_ALGORITHM, $('#' + SETTING_PRICE_ALGORITHM, price_options).val());
        setSetting(SETTING_PRICE_IGNORE_LOWEST_Q, $('#' + SETTING_PRICE_IGNORE_LOWEST_Q, price_options).prop('checked') ? 1 : 0);
        setSetting(SETTING_PRICE_HISTORY_HOURS, $('#' + SETTING_PRICE_HISTORY_HOURS, price_options).val());
        setSetting(SETTING_MARKET_PAGE_COUNT, $('#' + SETTING_MARKET_PAGE_COUNT, price_options).val());
        setSetting(SETTING_RELIST_AUTOMATICALLY, $('#' + SETTING_RELIST_AUTOMATICALLY, price_options).prop('checked') ? 1 : 0);
        setSetting(SETTING_INVENTORY_PRICE_LABELS, $('#' + SETTING_INVENTORY_PRICE_LABELS, price_options).prop('checked') ? 1 : 0);
        setSetting(SETTING_TRADEOFFER_PRICE_LABELS, $('#' + SETTING_TRADEOFFER_PRICE_LABELS, price_options).prop('checked') ? 1 : 0);

        window.location.reload();
    });
}
//#endregion