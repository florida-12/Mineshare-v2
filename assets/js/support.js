function copyIP(element) {
    var $tmp = $("<textarea>");
    $("body").append($tmp);
    $tmp.val($(element).text().trim()).select();
    document.execCommand("copy");
    $tmp.remove();
    var x = document.getElementById("snackbar2");
    x.innerText = "Скопировано";
    x.className = "show";
    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
}

function globalError(text) {
    var x = document.getElementById("snackbar2");
    x.innerText = text;
    x.style.marginLeft = "-166px";
    x.className = "show";
    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
}

function getIP(element) {
    window.open(element.toString(), '_blank');
}

function openFilter(element) {
    var target = document.getElementById(element);
    target.click()
}

function changeType(text, element) {
    element = document.getElementById(element);
    if (element.value == "Ванилла") {
        text.innerText = "Анархия";
        element.value = "Анархия"
    } else if (element.value == "Анархия") {
        text.innerText = "MMO-RPG";
        element.value = "MMO-RPG"
    } else if (element.value == "MMO-RPG") {
        text.innerText = "Мини-игры";
        element.value = "Мини-игры"
    } else if (element.value == "Мини-игры") {
        text.innerText = "Приключение";
        element.value = "Приключение"
    } else if (element.value == "Приключение") {
        text.innerText = "Строительство";
        element.value = "Строительство"
    } else {
        text.innerText = "Ванилла";
        element.value = "Ванилла"
    }
}

function changeVersion(text, element) {
    element = document.getElementById(element);
    if (element.value == "1.7.X") {
        text.innerText = "1.8.X";
        element.value = "1.8.X"
    } else if (element.value == "1.8.X") {
        text.innerText = "1.9.X";
        element.value = "1.9.X"
    } else if (element.value == "1.9.X") {
        text.innerText = "1.10.X";
        element.value = "1.10.X"
    } else if (element.value == "1.10.X") {
        text.innerText = "1.11.X";
        element.value = "1.11.X"
    } else if (element.value == "1.11.X") {
        text.innerText = "1.12.X";
        element.value = "1.12.X"
    } else if (element.value == "1.12.X") {
        text.innerText = "1.13.X";
        element.value = "1.13.X"
    } else if (element.value == "1.13.X") {
        text.innerText = "1.14.X";
        element.value = "1.14.X"
    } else if (element.value == "1.14.X") {
        text.innerText = "1.15.X";
        element.value = "1.15.X";
    } else if (element.value == "1.15.X") {
        text.innerText = "1.16.X";
        element.value = "1.16.X";
    } else if (element.value == "1.16.X") {
        text.innerText = "1.17.X";
        element.value = "1.17.X";
    } else if (element.value == "1.17.X") {
        text.innerText = "1.18.X";
        element.value = "1.18.X";
    } else if (element.value == "1.18.X") {
        text.innerText = "1.19.X";
        element.value = "1.19.X";
    } else if (element.value == "1.19.X") {
        text.innerText = "1.20.X";
        element.value = "1.20.X";
    } else {
        text.innerText = "1.7.X";
        element.value = "1.7.X";
    }
}

function changeLicense(text, element) {
    element = document.getElementById(element);
    if (element.value == "Лицензия") {
        text.innerText = "Без лицензии";
        element.value = "Без лицензии"
    } else {
        text.innerText = "Лицензия";
        element.value = "Лицензия"
    }
}

function changeGradient(gradient) {
    text = document.getElementById('gradient-text');
    element = document.getElementById('gradient');
    if (gradient == "blue") {
        text.innerText = "Текущий градиент: Голубой";
        element.value = "blue"
    } else if (gradient == "red") {
        text.innerText = "Текущий градиент: Красный";
        element.value = "red";
    } else if (gradient == "purple") {
        text.innerText = "Текущий градиент: Фиолетовый";
        element.value = "purple"
    } else if (gradient == "orange") {
        text.innerText = "Текущий градиент: Оранжевый";
        element.value = "orange"
    } else if (gradient == "green") {
        text.innerText = "Текущий градиент: Зеленый";
        element.value = "green"
    } else if (gradient == "pink") {
        text.innerText = "Текущий градиент: Розовый";
        element.value = "pink"
    } else {
        text.innerText = "Текущий стиль: Andromeda";
        element.value = "andromeda"
    }
}

function openServer(element) {
    window.open(element.toString(), "_self");
}

function hoverServer(element1, element2, element3) {
    $(element1).css("opacity", "1");
    $(element2).css("opacity", "1");
    $(element3).css("opacity", "1");

}

function unhoverServer(element1, element2, element3) {
    $(element1).css("opacity", "0");
    $(element2).css("opacity", "0");
    $(element3).css("opacity", "0");
}

function authTab() {
    var change = document.getElementById('swap-auth');
    change.click()
}

function regTab() {
    var change = document.getElementById('swap-reg');
    change.click()
}

function textAreaAdjust(element) {
    element.style.height = "1px";
    element.style.height = (2 + element.scrollHeight) + "px";
}

function tournamentContact(text) {
    const regex_discord = /[a-zA-Zа-яА-Я0-9]*#\d{4}$/

    if (text.includes("vk.com")) {
        $(".tournament-input-contact-icon-vk").css("visibility", "visible");
    }
    else if (!text.search(regex_discord)){
        $(".tournament-input-contact-icon-discord").css("visibility", "visible");
    }
    else {
        $(".tournament-input-contact-icon-vk").css("visibility", "hidden");
        $(".tournament-input-contact-icon-discord").css("visibility", "hidden");
    }
}

