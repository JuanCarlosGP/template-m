@appium-practice @android @webview
Feature: Appium Practice - WebView
  Como usuario de la app de práctica
  Quiero usar el panel 10 WEBVIEW
  Para navegar a páginas web, ver el contenido y limpiar la vista

  @smoke @happy-path
  Scenario: Navegación completa del WebView
    Given abro Appium Practice en la pantalla principal
    When entro en "10 WEBVIEW"
    Then veo el texto "Please navigate to a web page"
    When navego en el WebView a "https://en.wikipedia.org/wiki/Main_Page"
    Then en el WebView veo el texto "Welcome to Wikipedia"
    When pulso clear del WebView
    Then veo el texto "Please navigate to a web page"
    When navego en el WebView a "https://en.wikipedia.org/wiki/WebView"
    Then en el WebView veo el texto "WebView"
