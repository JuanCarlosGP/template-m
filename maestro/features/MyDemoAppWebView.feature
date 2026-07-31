Feature: WebView My Demo App
  Como usuario de My Demo App
  Quiero abrir una URL HTTPS en el WebView
  Para verificar que el contenido remoto se muestra correctamente

  Scenario: Abrir Wikipedia en el WebView
    Given abro My Demo App en la pantalla principal
    When abro el menú y pulso "WebView"
    And navego a la URL "https://www.wikipedia.org"
    Then veo el texto "Wikipedia The Free Encyclopedia"
