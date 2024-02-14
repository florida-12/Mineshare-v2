document.addEventListener('DOMContentLoaded', function () {
    var elems = document.querySelectorAll('.modal');
    var instances = M.Modal.init(elems);

    elems = document.querySelectorAll('.dropdown-trigger');
    instances = M.Dropdown.init(elems);

    elems = document.querySelectorAll('.tabs');
    instances = M.Tabs.init(elems);
});