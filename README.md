# Steam Economy Enhancer

## Differences

* Implement basics SDA functionality. You no longer need to keep the SDA on in the background. Just insert your maFile into the settings.
![Settings](https://i.imgur.com/Gcu9hPA.png)
* Added a setting parameter that allows you not to list an item if its price is lower or equal than the setting parameter
![Settings](https://i.imgur.com/gnpvkYU.png)
* Added the ability to list the entire stack of items at once instead of one at a time as it was before (yes, if you didn't know items in Steam's Inventory can be stacked)

## My Note

First of all, this is my own modification of the [Nuklon's](https://github.com/Nuklon) plugin. You can find the original plugin [here](https://github.com/Nuklon/Steam-Economy-Enhancer).

I decided to create a separate version because pull requests are reviewed very slowly by the original author.

All changes have been tested on my Steam account using the Microsoft Edge browser with the Violentmonkey plugin.

If you would like to report a bug or suggest a new feature, you can open an "Issue" or contact me via the social media link in my bio.

---

## Original description

A free userscript to enhance your Steam Inventory, Steam Market and Steam Tradeoffers.

It adds the following features to the Steam Market:

* Detect overpriced and underpriced items.
* Select all (overpriced) items and remove them at once.
* (Automatically) relist overpriced items.
* Sort and search items by name, price or date.
* Total price for listings, as seller and buyer.

It adds the following features to the Steam Inventory:

* Sell all (selected) items or trading cards automatically.
* Select multiple items simultaneously with *Shift* or *Ctrl*.
* Market sell and buy listings added to the item details.
* Quick sell buttons to sell an item without confirmations.
* Shows the lowest listed price for each item.
* Turn selected items into gems.
* Unpack selected booster packs.

It adds the following features to the Steam Tradeoffers:

* A summary of all items from both parties.
* Select all items of the current page.
* Shows the lowest listed price for each inventory item.

The pricing can be based on the lowest listed price, the price history and your own minimum and maximum prices.
This can be defined in Steam Economy Enhancer's settings, which you can find at the top of the page near the *Install Steam* button.

### Note

It is free but there is **NO** support. If you want to add functionality, feel free to submit a PR.

### Download

[Install Steam Economy Enhancer](https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js)

*[Violentmonkey](https://violentmonkey.github.io/) is required to install.*

### Screenshots

#### Market

![Market](https://i.imgur.com/cQx5J9e.png)

#### Inventory

![Inventory](https://i.imgur.com/9BuLN78.png)

#### Options

![Options](https://i.imgur.com/eShpvEO.png)

#### Trade offers

![Tradeoffers](https://i.imgur.com/vdVeXHi.png)

#### License

MIT
