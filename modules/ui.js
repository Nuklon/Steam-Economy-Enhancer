//#region UI
injectCss('.ui-selected { outline: 2px dashed #FFFFFF; } ' +
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
'.market_listing_button_right { float:right; }' +
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
'#see_settings { background: #26566c; margin-right: 10px; height: 24px; line-height:24px; display:inline-block; padding: 0px 6px; }' +
'.inventory_item_price { top: 0px;position: absolute;right: 0;background: #3571a5;padding: 2px;color: white; font-size:11px; border: 1px solid #666666;}' +
'.separator-large {display:inline-block;width:6px;}' +
'.separator-small {display:inline-block;width:1px;}' +
'.separator-btn-right {margin-right:12px;}' +
'.pagination { padding-left: 0px; }' +
'.pagination li { display:inline-block; padding: 5px 10px;background: rgba(255, 255, 255, 0.10); margin-right: 6px; border: 1px solid #666666; }' +
'.pagination li.active { background: rgba(255, 255, 255, 0.25); }');

$(document).ready(function() {
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
return target.replace(new RegExp(search, 'g'), replacement);
};
//#endregion