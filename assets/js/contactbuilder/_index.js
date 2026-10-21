(function () {
    window.debounce = (callback, wait = 300) => {
        let timer;
        return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), wait); };
    };
    function init() {
        if (!/^#admin\/data-extensions?(?:\/|$)/.test(location.hash)) return;
        sfmcfix.addCss('contactbuilder/de');
        sfmcfix.addJs('contactbuilder/de');
        sfmcfix.addJs('contactbuilder/email-studio');
    }
    window.addEventListener('hashchange', init);
    init();
})();
