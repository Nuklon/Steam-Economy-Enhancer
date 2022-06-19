const { src, dest, series } = require('gulp');
const gulpEsbuild = require('gulp-esbuild')
const concat = require('gulp-concat');
const del = require('del');

function concatjs() {
    return src([
        './modules/header.js',
        './modules/storage.js',
        './modules/settings.js',
        './modules/logging.js',
        './modules/helpers.js',
        './modules/ui.js',
        './modules/market.js',
        './modules/inventory.js',
        './modules/tradeoffer.js',
        './modules/inventory+tradeoffer.js',
        './modules/footer.js'
    ])
        .pipe(concat('modules.js'))
        .pipe(dest('./'));
}

function js() {
    return src('./modules.js')
        .pipe(gulpEsbuild({
            outfile: './code.user.js',
            bundle: true,
            minify: true,
            target: 'es6',
            define: {
                'process.env.NODE_ENV': '"production"'
            },
            banner: {
                js: `// ==UserScript==
// @name        Steam Economy Enhancer
// @icon        https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg
// @namespace   https://github.com/Nuklon
// @author      Nuklon
// @license     MIT
// @version     6.8.4
// @description Enhances the Steam Inventory and Steam Market.
// @match     *://steamcommunity.com/id/*/inventory*
// @match     *://steamcommunity.com/profiles/*/inventory*
// @match     *://steamcommunity.com/market*
// @match     *://steamcommunity.com/tradeoffer*
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
// ==/UserScript==`
            }
        }))
        .pipe(dest('./'))
}

function clean() {
    return del('modules.js');
}

exports.default = series(concatjs, js, clean);