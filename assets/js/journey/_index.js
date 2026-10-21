(function() {
    let $;

    window.debounce = (callback, wait) => {
        let timeoutId = null;
        return (...args) => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
            callback(...args);
            }, wait);
        };
    }

    window.throttle = (mainFunction, delay) => {
        let timerFlag = null; // Variable to keep track of the timer

        // Returning a throttled version 
        return (...args) => {
            if (timerFlag === null) { // If there is no timer currently running
            mainFunction(...args); // Execute the main function 
            timerFlag = setTimeout(() => { // Set a timer to clear the timerFlag after the specified delay
                timerFlag = null; // Clear the timerFlag to allow the main function to be executed again
            }, delay);
            }
        };
    }

    const iterateDebouce = throttle(function() {
        $('.ixn-collection-definition').each(function() {
            const $el = $(this);
            const $item = $el.find('.navigate-to-ixn');
            const id = $item.data('ixn-id');
            const version = $item.data('ixn-version');
            if (!id || !version || !sfmcfix.context.current().stack) return;
            const url = sfmcfix.links.journey(id, version);
            if(!$el.find('.navigate-to-ixn-newwin').length) {
                $el.find('.navigate-to-ixn').after(`<a class="slds-button slds-button_icon-border-filled navigate-to-ixn-newwin" style="transform:scale(.7); margin-left:10px;" href="${url}" target="_blank" rel="noopener noreferrer"> <svg class="slds-button__icon slds-button_icon-x-small" aria-hidden="true">
                        <use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="/assets/icons/utility-sprite/svg/symbols.svg#link"></use>
                    </svg></a>`);
            } else {
                $el.find('.navigate-to-ixn-newwin').attr('href', url);
            }
        });
    },4000);

    const init = function() {
        $ = window.jQuery;
        $('body').on('mouseenter', '.ixn-collection-definition', function(e) {
            iterateDebouce();
        });
    }

    function retryjQ () {
        if(!window.jQuery) {
            setTimeout(() => {
                retryjQ();
            },100);
        } else {debounce
            init();
        }
    }

    retryjQ();


})();