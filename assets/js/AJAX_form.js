function authError(error) {
    var x = document.getElementById("snackbar");
    x.innerText = error;
    x.className = "show";
    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
}

function globalError(error) {
    var x = document.getElementById("snackbar2");
    x.innerText = error;
    x.className = "show";
    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
}

$('#change-username-form').submit(function() {
    $('#alert-error-change-username').css("z-index", "0")
    $('#alert-success-change-username').css("z-index", "300")
    var origin = window.location.origin;
    $.ajax({
        data: $(this).serialize(), // получаем данные формы
        type: $(this).attr('method'), // GET или POST
        url: origin+"/account/change-username/",

        success: function (response) {
            $('#alert-error-change-username').css("z-index", "0")
            $('#alert-success-change-username').css("z-index", "300")
            setTimeout(() => { window.location = origin; }, 1000);
            },

        error: function (response) {
            $('#alert-error-change-username').css("z-index", "300")
            $('#alert-success-change-username').css("z-index", "0")

            console.log(response.responseJSON['error'])

            if (response.responseJSON['error'] == 'user exists') {
                authError("Пользователь с таким ником уже существует");
            }
        }
    });
    return false;
});

$('#request-bw123').submit(function() {
    $('#alert-error-bw').css("z-index", "0")
    $('#alert-success-bw').css("z-index", "300")
    var origin = window.location.origin;
    $.ajax({
        data: $(this).serialize(), // получаем данные формы
        type: $(this).attr('method'), // GET или POST
        url: origin+"/tournaments/bedwars/",

        success: function (response) {
            $('#alert-error-bw').css("z-index", "0")
            $('#alert-success-bw').css("z-index", "300")
            setTimeout(() => { origin+"/tournaments/bedwars/" }, 0);
            },

        error: function (response) {
            $('#alert-error-bw').css("z-index", "300")
            $('#alert-success-bw').css("z-index", "0")

            console.log(response.responseJSON['error'])

            if (response.responseJSON['error'] == 'user exists') {
                authError("Пользователь с таким ником уже существует");
            }
        }
    });
    return false;
});


// проверка регистрации

          $('#regForm').submit(function () {
              $('#alert_error').css("z-index", "0")
              $('#alert_success').css("z-index", "300")
              var origin = window.location.origin;
              $.ajax({
                  data: $(this).serialize(), // получаем данные формы
                  type: $(this).attr('method'), // GET или POST
                  url: origin+"/account/signup/",


                  success: function (response) {
                      $('#alert_error').css("z-index", "0")
                      $('#alert_success').css("z-index", "300")
                      setTimeout(() => { authTab(); }, 2000);
                  },

                  error: function (response) {

                      $('#alert_error').css("z-index", "300")
                      $('#alert_success').css("z-index", "0")

                      console.log(response.responseJSON['error'])

                      if (response.responseJSON['error'] == 'user exists') {
                          authError("Пользователь с таким ником уже существует");
                      }
                  }
              });
              return false;
          });


//проверка логина
          $('#logForm').submit(function () {
              $('#alert_error_login').css("z-index", "0")
              $('#alert_success_login').css("z-index", "300")
              var origin = window.location.origin;
              $.ajax({
                  data: $(this).serialize(), // получаем данные формы
                  type: $(this).attr('method'), // GET или POST
                  url: origin+"/account/auth/",

                  success: function (response) {
                      $('#alert_error_login').css("z-index", "0")
                      $('#alert_success_login').css("z-index", "300")
                      setTimeout(() => { authTab(); }, 1500);

                      window.location = origin+"/account/";

                  },

                  error: function (response) {

                      $('#alert_error_login').css("z-index", "300")
                      $('#alert_success_login').css("z-index", "0")

                      console.log(response.responseJSON['error'])

                      if (response.responseJSON['error'] == 'user does not exist') {
                          authError("Пользователь с таким ником не существует");
                      }
                  }
              });
              return false;
          });


//проверка сервера на доступность
          $('#server_status').submit(function () {
             var origin   = window.location.origin;
              $.ajax({
                  data: $(this).serialize(), // получаем данные формы
                  type: $(this).attr('method'), // GET или POST
                  url: origin+"/account/status-server/",

                  success: function (response) {
                      $('#alert_error_server').css("z-index", "0")
                      $('#alert_success_server').css("z-index", "300")
                        setTimeout(() => { window.location = origin+"/account/create-server/"; }, 4000);
                      // window.location = origin+"/account/";
                  },

                  error: function (response) {
                      $('#alert_error_server').css("z-index", "300")
                      $('#alert_success_server').css("z-index", "0")
                  }
              });
              return false;
          });

