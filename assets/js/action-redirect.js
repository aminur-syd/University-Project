(function () {
    const target = '/action' + window.location.search + window.location.hash;
    window.location.replace(target);
})();
