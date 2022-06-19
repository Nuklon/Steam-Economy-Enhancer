    //#region Logging
    var userScrolled = false;
    var logger = document.createElement('div');
    logger.setAttribute('id', 'logger');

    function updateScroll() {
        if (!userScrolled) {
            var element = document.getElementById("logger");
            element.scrollTop = element.scrollHeight;
        }
    }

    function logDOM(text) {
        logger.innerHTML += text + '<br/>';

        updateScroll();
    }

    function clearLogDOM() {
        logger.innerHTML = '';

        updateScroll();
    }

    function logConsole(text) {
        if (enableConsoleLog) {
            console.log(text);
        }
    }
    //#endregion